// Exercises only a new loopback Worker database. Never connects to the hosted café.
import {spawn,spawnSync} from 'node:child_process';
import {pbkdf2Sync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdirSync,writeFileSync,openSync,closeSync} from 'node:fs';
import assert from 'node:assert/strict';
import {recipeDraft} from '../lib/product-recipe.ts';
const persist='.wrangler/recipe-edit-test-state';
const migration=spawnSync(process.execPath,['scripts/setup-local-db.mjs',persist],{stdio:'inherit'});
if(migration.status!==0)throw Error('Recipe test database migrations failed');
mkdirSync('.sites-runtime',{recursive:true});
const log=openSync('.sites-runtime/recipe-test-worker.log','w');
const origin='http://127.0.0.1:8797',password='recipe-local-test-password',salt='recipe-local-test-salt';
const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to',persist,'--ip','127.0.0.1','--inspector-port','0','--port','8797','--var','PUBLIC_TEST_MODE:true','--var','ADMIN_LOGIN_USERNAME:recipe-local-test','--var','ADMIN_PASSWORD_SALT:'+salt,'--var','ADMIN_PASSWORD_HASH:'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')],{stdio:['ignore',log,log],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
const checks=[];let cookie='';
async function request(path,method='GET',body,authenticated=true){
 const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(authenticated&&cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
}
async function bootstrap(){const r=await request('bootstrap');assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
async function storedProduct(id){const r=await request('admin/overview');assert.equal(r.status,200);return r.body.products.find(p=>p.id===id);}
const check=(name)=>checks.push(name);
try{
 let ready=false;
 for(let n=0;n<150;n++){
  if(child.exitCode!==null)throw Error('Local recipe test Worker exited; inspect .sites-runtime/recipe-test-worker.log');
  try{if((await request('bootstrap')).status===200){ready=true;break}}catch{}
  await delay(200);
 }
 assert.ok(ready,'Local recipe test Worker did not start');
 const baseline=(await bootstrap()).products.find(p=>p.id==='source-04');assert.ok(baseline);
 const {recipeMeasurements,recipeSuggestion,...product}=baseline;
 const override=recipeDraft(recipeMeasurements);override.ingredients.find(i=>i.name==='Espresso').measurement='22 ml';override.nutrition.grams.fat=0;override.nutrition.grams.sugar=null;override.nutrition.kcal=103.5;
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:override},false)).status,403);check('Unauthenticated recipe edits rejected');
 const auth=await request('auth/admin/login','POST',{username:'recipe-local-test',password});assert.equal(auth.status,200);cookie=auth.cookie.split(';')[0];
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:override})).status,200);
 let saved=(await bootstrap()).products.find(p=>p.id===product.id);
 assert.equal(saved.recipeMeasurements.ingredients.find(i=>i.name==='Espresso').measurement,'22 ml');assert.equal(saved.recipeMeasurements.nutrition.status,'unavailable');check('Ingredient edits persist while unreviewed nutrition stays unavailable');
 override.nutritionReviewed=true;
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:override})).status,200);
 saved=(await bootstrap()).products.find(p=>p.id===product.id);
 assert.equal(saved.recipeMeasurements.nutrition.status,'estimated');assert.equal(saved.recipeMeasurements.nutrition.grams.fat,0);assert.equal(saved.recipeMeasurements.nutrition.grams.sugar,null);assert.equal(saved.recipeMeasurements.nutrition.kcal,103.5);check('Reviewed nutrients persist and customer data distinguishes zero from blank');
 let admin=await storedProduct(product.id);assert.equal(admin.recipeSuggestion.ingredients.find(i=>i.name==='Espresso').measurement,'20 ML');assert.equal(admin.recipeOverride.ingredients.find(i=>i.name==='Espresso').measurement,'22 ml');check('Admin can view saved custom recipe and original suggestion separately');
 const invalid=structuredClone(override);invalid.nutrition.grams.protein=-1;
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:invalid})).status,400);
 assert.equal((await storedProduct(product.id)).recipeOverride.nutrition.grams.protein,override.nutrition.grams.protein);check('Invalid nutrition rejected without modifying saved recipe');
 const {recipeOverride:omitted,...unrelated}=product;
 assert.equal((await request('admin/products','POST',unrelated)).status,200);
 assert.equal((await storedProduct(product.id)).recipeOverride.ingredients.find(i=>i.name==='Espresso').measurement,'22 ml');check('Unrelated item updates preserve recipe when override field is omitted');
 override.nutrition.status='provided';assert.equal((await request('admin/products','POST',{...product,recipeOverride:override})).status,200);
 assert.equal((await bootstrap()).products.find(p=>p.id===product.id).recipeMeasurements.nutrition.status,'provided');check('Café supplied nutrition source reaches customer menu');
 const automatic={...recipeDraft(recipeMeasurements),nutritionMode:'auto',nutritionReviewed:true};
 automatic.ingredients.find(i=>i.name==='Milk').measurement='200 ml';automatic.nutrition.kcal=1;automatic.nutrition.status='provided';
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:automatic})).status,200);
 saved=(await bootstrap()).products.find(p=>p.id===product.id);
 assert.equal(saved.recipeMeasurements.nutrition.kcal,127);assert.equal(saved.recipeMeasurements.nutrition.grams.protein,6.5);assert.equal(saved.recipeMeasurements.autoCalculated,true);assert.equal(saved.recipeMeasurements.nutrition.status,'estimated');
 assert.equal((await storedProduct(product.id)).recipeOverride.nutrition.kcal,127);check('Automatic quantities produce authoritative saved totals and customer estimates, replacing stale client values');
 automatic.ingredients.find(i=>i.name==='Milk').measurement='80 ml';automatic.nutritionReviewed=false;
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:automatic})).status,200);
 assert.equal((await bootstrap()).products.find(p=>p.id===product.id).recipeMeasurements.nutrition.status,'unavailable');
 automatic.nutritionReviewed=true;assert.equal((await request('admin/products','POST',{...product,recipeOverride:automatic})).status,200);
 assert.equal((await bootstrap()).products.find(p=>p.id===product.id).recipeMeasurements.nutrition.kcal,52);check('A second quantity change recalculates rather than retaining the previous total; review is explicit');
 automatic.ingredients.push({name:'Unlisted powder',measurement:'10 g',detail:'',assumed:false});
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:automatic})).status,400);
 automatic.nutritionReviewed=false;assert.equal((await request('admin/products','POST',{...product,recipeOverride:automatic})).status,200);
 saved=(await bootstrap()).products.find(p=>p.id===product.id);assert.equal(saved.recipeMeasurements.nutrition.kcal,null);assert.equal(saved.recipeMeasurements.nutrition.status,'unavailable');check('Incomplete automatic recipes cannot publish partial totals or be marked reviewed');
 assert.equal((await request('admin/products','POST',{...product,recipeOverride:null})).status,200);
 saved=(await bootstrap()).products.find(p=>p.id===product.id);assert.equal(saved.recipeMeasurements.ingredients.find(i=>i.name==='Espresso').measurement,'20 ML');assert.equal(saved.recipeMeasurements.nutrition.grams.fat,5.4);check('Restoring suggested recipe removes custom override');
 const custom={...product,id:'recipe-local-custom-item',name:'Local recipe editor item',recipeOverride:override};assert.equal((await request('admin/products','POST',custom)).status,200);
 assert.equal((await bootstrap()).products.find(p=>p.id===custom.id).recipeMeasurements.ingredients.find(i=>i.name==='Espresso').measurement,'22 ml');check('New items support custom recipes without a built-in recipe');
 const report={environment:'Isolated local Worker and SQLite database only',passed:checks.length,checks};
 writeFileSync('docs/testing/nutrition/admin-recipe-integration.json',JSON.stringify(report,null,2)+'\n');
 console.log(`Recipe editing integration: ${checks.length}/${checks.length} checks passed. No live menu data was changed.`);
}finally{child.kill('SIGINT');await delay(400);if(child.exitCode===null)child.kill('SIGKILL');closeSync(log);}

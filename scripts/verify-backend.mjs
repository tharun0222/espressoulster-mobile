import {pbkdf2Sync} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const port=Number(process.env.COFFEE_INTEGRATION_PORT||8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a valid local integration test port');
const origin='http://127.0.0.1:'+port;
const migration=spawnSync(process.execPath,['scripts/setup-local-db.mjs','.wrangler/test-state'],{stdio:'inherit'});
if(migration.error)throw migration.error;if(migration.status!==0)throw Error('Test database migration failed');
const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/test-state','--ip','127.0.0.1','--inspector-port','0','--port',String(port),'--var','ADMIN_EMAILS:seedy@sites.test','--var','PUBLIC_TEST_MODE:true','--var','ADMIN_LOGIN_USERNAME:qaadmin','--var','ADMIN_PASSWORD_SALT:qa-admin-salt','--var','ADMIN_PASSWORD_HASH:'+pbkdf2Sync('qa-admin-password','qa-admin-salt',100000,32,'sha256').toString('hex')],{stdio:['ignore','ignore','inherit'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
let diagnostic='';
try {
 let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Local Worker exited: '+diagnostic);try{const r=await fetch(origin+'/api/bootstrap');if(r.ok){ready=true;break}}catch{}await delay(200)}
 if(!ready)throw Error('Local Worker did not become ready: '+diagnostic);
 const result=await new Promise((resolve,reject)=>{const test=spawn('python3',['tests/integration.py'],{stdio:'inherit'});test.on('error',reject);test.on('exit',resolve)});if(result!==0)throw Error('Backend integration tests failed');
 const report=JSON.parse(readFileSync('docs/integration-results.json','utf8'));
 console.log(`Verified: ${report.passed}/${report.tests} backend integration tests passed against the final built Worker.`);
}finally{child.kill('SIGINT');await delay(400);if(child.exitCode===null)child.kill('SIGKILL')}

import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeDraft,recipeOverrideError,cleanRecipeOverride,resolveProductRecipe} from '../lib/product-recipe.ts';
import {menuRecipe} from '../lib/menu-recipe.ts';
import {validateProduct} from '../lib/pricing.ts';
const suggested=menuRecipe('source-04','Cappuccino');
const valid=()=>({...recipeDraft(suggested),nutritionReviewed:true});
const product={id:'coffee',name:'Coffee',categoryId:'coffee',description:'',price:100,inventory:null,available:true,variants:[],addons:[],dietary:[]};

test('prefills sourced recipes without turning estimates into reviewed café values',()=>{
 const draft=recipeDraft(suggested);
 assert.equal(draft.ingredients.find(i=>i.name==='Milk').measurement,'160 ML');
 assert.equal(draft.nutrition.grams.fat,5.4);
 assert.equal(draft.nutritionReviewed,false);
 assert.equal(resolveProductRecipe(suggested,draft).nutrition.status,'unavailable');
 assert.equal(resolveProductRecipe(suggested,draft).nutrition.reviewPending,true);
});
test('custom quantities and nutrients override suggested values and survive JSON storage',()=>{
 const draft=valid();draft.ingredients[1].measurement='22 ml';draft.nutrition.grams.fat=0;draft.nutrition.grams.sugar=null;draft.nutrition.kcal=103.5;
 const saved=JSON.parse(JSON.stringify(cleanRecipeOverride(draft)));
 const result=resolveProductRecipe(suggested,saved);
 assert.equal(result.ingredients[1].measurement,'22 ml');assert.equal(result.nutrition.grams.fat,0);assert.equal(result.nutrition.grams.sugar,null);assert.equal(result.nutrition.kcal,103.5);assert.equal(result.adminEdited,true);assert.equal(result.nutrition.status,'estimated');
 assert.equal(suggested.ingredients[1].measurement,'20 ML');
});
test('café supplied values remain distinct from estimates; restoring null returns original recipe',()=>{
 const draft=valid();draft.nutrition.status='provided';
 assert.equal(resolveProductRecipe(suggested,draft).nutrition.status,'provided');
 assert.equal(resolveProductRecipe(suggested,null),suggested);
 assert.equal(resolveProductRecipe(suggested,undefined),suggested);
 assert.equal(resolveProductRecipe(null,draft).ingredients.length,3);
});
test('blank values remain unavailable, while zero is accepted',()=>{
 const draft=valid();for(const key of Object.keys(draft.nutrition.grams))draft.nutrition.grams[key]=null;draft.nutrition.kcal=null;
 assert.match(recipeOverrideError(draft),/at least one/);
 draft.nutritionReviewed=false;assert.equal(recipeOverrideError(draft),null);
 draft.nutrition.grams.fat=0;draft.nutritionReviewed=true;assert.equal(recipeOverrideError(draft),null);
});
test('API validation rejects invalid rows, negative and nonfinite numbers, strings and oversized data',()=>{
 for(const change of [d=>d.ingredients=[],d=>d.ingredients.push({name:'',measurement:'10 g',detail:'',assumed:false}),d=>d.nutrition.grams.fat=-1,d=>d.nutrition.grams.fat=NaN,d=>d.nutrition.grams.fat=Infinity,d=>d.nutrition.grams.fat='5',d=>d.nutrition.grams.protein=10001,d=>d.nutrition.kcal=100001,d=>d.notes='x'.repeat(12001),d=>d.nutrition.status='verified',d=>d.nutritionReviewed='true',d=>d.ingredients[0].measurement='x'.repeat(201)]){
  const draft=valid();change(draft);assert.ok(recipeOverrideError(draft));assert.throws(()=>validateProduct({...product,recipeOverride:draft}));
 }
 assert.doesNotThrow(()=>validateProduct({...product,recipeOverride:valid()}));
 assert.doesNotThrow(()=>validateProduct(product));
});
test('normalisation trims input, drops derived/unknown fields and preserves assumption labels',()=>{
 const draft=valid();draft.ingredients[0].name=' Coffee grounds ';draft.ingredients[0].assumed=true;draft.injected='ignored';draft.ingredients[0].unsafe='ignored';
 const result=cleanRecipeOverride(draft);assert.equal(result.ingredients[0].name,'Coffee grounds');assert.equal(result.ingredients[0].assumed,true);assert.equal(result.injected,undefined);assert.equal(result.ingredients[0].unsafe,undefined);
});

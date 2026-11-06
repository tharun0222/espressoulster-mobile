import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const recipes=JSON.parse(readFileSync(new URL('../lib/recipe-measurements.json',import.meta.url)));
test('recorded recipe measurements preserve exact units, ranges, and source conflicts',()=>{
 assert.equal(Object.keys(recipes).length,110);
 assert.equal(recipes['source-04'].ingredients.find(i=>i.name==='Milk').measurement,'160 ML');
 assert.equal(recipes['source-01'].ingredients.find(i=>i.name==='Ice Cubes').measurement,'80/100 GMS');
 assert.equal(recipes['source-08'].needsConfirmation,true);
 assert.equal(recipes['source-08'].nutrition.status,'unavailable');
 assert.equal(recipes['recipe-iced-spanish-latte'].nutrition.status,'estimated');
 for(const recipe of Object.values(recipes)){
  assert.ok(recipe.ingredients.length);
  for(const item of recipe.ingredients){assert.ok(item.measurement);assert.ok(Number.isInteger(item.sourceRow));}
  if(recipe.nutrition.status==='estimated')for(const key of ['fat','fibre','sugar','protein'])assert.ok(Number.isFinite(recipe.nutrition.grams[key])&&recipe.nutrition.grams[key]>=0);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {menuRecipe} from '../lib/menu-recipe.ts';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const estimates=read('../lib/recipe-estimates.json');
const source=read('../lib/recipe-measurements.json');
const calculations=read('../docs/testing/nutrition/complete-estimate-calculations.json');
const refs=read('../docs/testing/nutrition/complete-ingredient-references.json');
const nutrients=['fat','fibre','sugar','protein','carbs','kcal'];

test('all 116 current menu entries have finite nutrient totals from auditable components',()=>{
 assert.equal(Object.keys(estimates).length,116);
 for(const [id,recipe] of Object.entries(estimates)){
  assert.ok(recipe.ingredients.length,id);
  assert.equal(recipe.nutrition.status,'estimated',id);
  assert.ok(recipe.references.length,id);
  const components=calculations[id].components;
  assert.ok(components.length,id);
  for(const key of nutrients){
   const sum=components.reduce((total,c)=>total+c.values[key],0);
   const shown=key==='kcal'?recipe.nutrition.kcal:recipe.nutrition.grams[key];
   assert.ok(Number.isFinite(shown)&&shown>=0,`${id} ${key}`);
   assert.ok(Math.abs(sum-shown)<(key==='kcal'?.51:.051),`${id} ${key}: totals must use every component`);
   for(const c of components){
    assert.ok(c.grams>0,`${id}: positive edible quantity`);
    assert.ok(refs[c.reference],`${id}: known nutrient source`);
    assert.ok(Math.abs(c.values[key]-refs[c.reference].values[key]*c.grams/100)<.0001,`${id} ${key}: weight conversion`);
   }
  }
 }
});

test('source quantities and source conflict notes are retained instead of silently replaced',()=>{
 for(const [id,record] of Object.entries(source)){
  const result=estimates[id];
  for(const original of record.ingredients){
   const item=result.ingredients.find(i=>i.sourceRow===original.sourceRow);
   assert.ok(item,id);
   assert.equal(item.measurement,original.measurement,`${id}: original measurement`);
   assert.equal(item.name,original.name,`${id}: original ingredient`);
  }
  assert.equal(result.needsConfirmation,record.needsConfirmation,id);
 }
 assert.ok(estimates['source-08'].assumptions.some(x=>x.includes('conflict')));
 assert.equal(estimates['recipe-pancake'].ingredients.find(i=>i.name==='Milk').estimatedGrams,90);
 assert.equal(estimates['source-01'].ingredients.find(i=>i.name==='Ice Cubes').estimatedGrams,90);
});

test('incomplete recipes receive visible proposed portions including omitted pasta and cooking oil',()=>{
 const crispy=estimates['recipe-crispy-corn-salad'];
 assert.equal(crispy.ingredients.find(i=>i.name==='Sweet Corn').assumedMeasurement,'100 g');
 assert.ok(crispy.ingredients.find(i=>i.name==='Oil').assumed);
 for(const id of ['recipe-pesto','recipe-mac-and-cheese','recipe-creamy-alfredo']){
  const pasta=estimates[id].ingredients.find(i=>i.name==='Cooked Pasta');
  assert.equal(pasta.estimatedGrams,150);
  assert.equal(pasta.assumed,true);
 }
 assert.equal(estimates['recipe-pesto'].ingredients.find(i=>i.name==='Salt').measurement,'2GM+EE618:E619');
 assert.equal(estimates['recipe-pesto'].ingredients.find(i=>i.name==='Salt').estimatedGrams,2);
});

test('brewed drinks exclude discarded grounds and tea leaves',()=>{
 for(const id of ['source-04','recipe-pour-over','recipe-chia-iced-tea']){
  assert.ok(calculations[id].components.every(c=>!['COFFEE GROUNDS','COFFEE BEANS','TEA POWDER'].includes(c.ingredient.toUpperCase())));
 }
 assert.equal(estimates['source-04'].nutrition.grams.fat,5.4);
 assert.equal(estimates['source-04'].nutrition.grams.protein,5.2);
 assert.ok(estimates['recipe-pour-over'].nutrition.kcal<10);
});

test('legacy item names resolve narrowly and never assign a made-up recipe to unknown products',()=>{
 for(const name of ['Orange Juice','The Avocado Social','Chicken Nuggets','Red Velvet Cookie','Hazelnut Cold Coffee (Medium Roast)','Latte (Medium Roast)']){
  assert.ok(menuRecipe('legacy-id-in-database',name),name);
 }
 assert.equal(menuRecipe('unknown','New seasonal item'),null);
 assert.deepEqual(menuRecipe('source-04','Renamed cappuccino'),estimates['source-04']);
 for(const id of ['legacy-avocado-social','legacy-chicken-nuggets','legacy-red-velvet-cookie','legacy-orange-juice']){
  assert.ok(estimates[id].standardRecipe);
  assert.ok(estimates[id].ingredients.every(i=>i.assumed));
 }
});

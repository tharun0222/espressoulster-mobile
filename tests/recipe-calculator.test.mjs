import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRecipeNutrition} from '../lib/recipe-calculator.ts';
import {recipeDraft,cleanRecipeOverride,recipeOverrideError,resolveProductRecipe} from '../lib/product-recipe.ts';
import recipes from '../lib/recipe-estimates.json' with {type:'json'};
const calculate=(name,measurement)=>calculateRecipeNutrition([{name,measurement}]);
test('Cappuccino recomputes from ingredient amounts, not a scale of the whole old serving',()=>{
 const recipe=recipes['source-04'],draft=recipeDraft(recipe);
 const before=calculateRecipeNutrition(draft.ingredients,recipe);assert.deepEqual(before.nutrition.grams,recipe.nutrition.grams);assert.equal(before.nutrition.kcal,102);
 draft.ingredients.find(i=>i.name==='Milk').measurement='200 ml';const after=calculateRecipeNutrition(draft.ingredients,recipe);assert.equal(after.nutrition.kcal,127);assert.equal(after.nutrition.grams.protein,6.5);assert.ok(after.components.some(i=>i.ingredient==='Espresso'&&i.grams===20));
});
test('volume, weight, kilograms and litres use the recorded milk density',()=>{
 assert.deepEqual(calculate('Milk','200 ml').nutrition,calculate('Milk','206 g').nutrition);
 assert.deepEqual(calculate('Milk','0.2 l').nutrition,calculate('Milk','0.206 kg').nutrition);
 assert.equal(calculate('Milk','200 ml').nutrition.kcal,126);
 assert.equal(calculate('Milk','200 ml').nutrition.grams.fat,6.7);
});
test('piece, slice, fractional quantities and range midpoints use ingredient-specific weights',()=>{
 assert.deepEqual(calculate('Egg','1 pc').nutrition,calculate('Egg','50 g').nutrition);
 assert.deepEqual(calculate('Egg','1/2 pc').nutrition,calculate('Egg','25 g').nutrition);
 assert.deepEqual(calculate('Sour Dough Bread','2 slices').nutrition,calculate('Sour Dough Bread','80 g').nutrition);
 assert.deepEqual(calculate('Sugar','10-20 g').nutrition,calculate('Sugar','15 g').nutrition);
 assert.deepEqual(calculate('Ice Cubes','80/100 g').nutrition,calculate('Ice Cubes','90 g').nutrition);
});
test('changing flour changes food nutrients and adding/removing sugar changes the serving',()=>{
 const draft=recipeDraft(recipes['recipe-pancake']);const original=calculateRecipeNutrition(draft.ingredients);
 draft.ingredients.find(i=>i.name==='Maida').measurement='100 g';
 const changed=calculateRecipeNutrition(draft.ingredients);assert.equal(changed.complete,true);assert.ok(changed.nutrition.kcal>original.nutrition.kcal);assert.ok(changed.nutrition.grams.protein>original.nutrition.grams.protein);
 const sugar=calculateRecipeNutrition([...draft.ingredients,{name:'Sugar',measurement:'10 g'}]);assert.ok(sugar.nutrition.grams.sugar>changed.nutrition.grams.sugar);
});
test('compound garnishes contribute all explicitly measured components',()=>{
 const garnish=calculate('Garnish','Whipped Cream 15 g + Chocolate Syrup 5 g');
 const separate=calculateRecipeNutrition([{name:'Whipped Cream',measurement:'15 g'},{name:'Chocolate Syrup',measurement:'5 g'}]);
 assert.equal(garnish.complete,true);assert.deepEqual(garnish.nutrition,separate.nutrition);
});
test('discarded grounds are excluded and filter-coffee water changes brewed yield',()=>{
 const draft=recipeDraft(recipes['recipe-pour-over']);const original=calculateRecipeNutrition(draft.ingredients,recipes['recipe-pour-over']);
 draft.ingredients.find(i=>i.name==='Water').measurement='460 ml';const changed=calculateRecipeNutrition(draft.ingredients,recipes['recipe-pour-over']);
 assert.equal(original.components[0].grams,207);assert.equal(changed.components[0].grams,414);assert.equal(changed.nutrition.kcal,4);
 assert.equal(calculate('Coffee Grounds','18 g').complete,false);
});
test('unknown ingredients, units and malformed quantities block totals rather than publish a partial serving',()=>{
 for(const row of [{name:'Unknown branded syrup',measurement:'10 ml'},{name:'Milk',measurement:'lots'},{name:'Milk',measurement:'-20 ml'},{name:'Milk',measurement:'20/0 ml'},{name:'Milk',measurement:'20 bottles'},{name:'Milk',measurement:'1e3 ml'},{name:'Milk',measurement:'1.2.3 g'},{name:'Milk',measurement:'10001 g'},{name:'Milk',measurement:'20 g extra text'}]){
  const result=calculateRecipeNutrition([{name:'Sugar',measurement:'10 g'},row]);assert.equal(result.complete,false,JSON.stringify(row));assert.equal(result.nutrition.kcal,null);assert.ok(Object.values(result.nutrition.grams).every(v=>v===null));
 }
 assert.equal(calculate('Water','0 ml').nutrition.kcal,0);
});
test('automatic server normalization replaces stale or forged totals, preserves estimates and blocks incomplete review',()=>{
 const suggested=recipes['source-04'];const draft={...recipeDraft(suggested),nutritionMode:'auto',nutritionReviewed:true};
 draft.ingredients.find(i=>i.name==='Milk').measurement='200 ml';draft.nutrition.kcal=1;draft.nutrition.status='provided';
 const saved=cleanRecipeOverride(draft,suggested);assert.equal(saved.nutrition.kcal,127);assert.equal(saved.nutrition.status,'estimated');
 const result=resolveProductRecipe(suggested,saved);assert.equal(result.autoCalculated,true);assert.equal(result.nutrition.kcal,127);assert.ok(result.calculation.components.some(i=>i.ingredient==='Milk'&&i.grams===206));
 draft.ingredients.push({name:'Unknown',measurement:'10 g',detail:'',assumed:false});assert.match(recipeOverrideError(draft),/Resolve ingredient/);
 draft.nutritionReviewed=false;const pending=cleanRecipeOverride(draft,suggested);assert.equal(pending.nutrition.kcal,null);assert.equal(resolveProductRecipe(suggested,pending).nutrition.status,'unavailable');
});
test('legacy/manual entries retain their manually supplied values',()=>{
 const draft={...recipeDraft(recipes['source-04']),nutritionReviewed:true};draft.nutrition.kcal=999;draft.nutrition.status='provided';
 assert.equal(cleanRecipeOverride(draft).nutrition.kcal,999);assert.equal(resolveProductRecipe(recipes['source-04'],draft).nutrition.status,'provided');
 assert.ok(recipeOverrideError({...draft,nutritionMode:'mystery'}));
});

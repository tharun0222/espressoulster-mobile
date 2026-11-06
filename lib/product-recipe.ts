import {calculateRecipeNutrition} from './recipe-calculator.ts';
export const recipeNutrients=['fat','fibre','sugar','protein','carbs'] as const;
export type RecipeOverride={version:1;nutritionMode?:'auto'|'manual';ingredients:{name:string;measurement:string;detail:string;assumed:boolean}[];serving:string;notes:string;nutritionReviewed:boolean;nutrition:{status:'estimated'|'provided';grams:Record<(typeof recipeNutrients)[number],number|null>;kcal:number|null}};
const object=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validText=(v:any,max:number,required=false)=>typeof v==='string'&&v.length<=max&&(!required||!!v.trim());
const numeric=(v:any,max:number)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max);
export function recipeOverrideError(value:any):string|null{
 if(value==null)return null;
 if(!object(value)||value.version!==1)return 'Invalid ingredient and nutrition details';
if(value.nutritionMode!==undefined&&!['auto','manual'].includes(value.nutritionMode))return 'Choose automatic or manual nutrition';
 if(!Array.isArray(value.ingredients)||value.ingredients.length<1||value.ingredients.length>100)return 'Add between 1 and 100 ingredients';
 for(const item of value.ingredients){
  if(!object(item)||!validText(item.name,150,true)||!validText(item.measurement,200,true)||!validText(item.detail,500)||typeof item.assumed!=='boolean')return 'Each ingredient needs a name and measurement; keep notes under 500 characters';
 }
 if(!validText(value.serving,2000)||!validText(value.notes,12000))return 'Serving or recipe notes are too long';
 if(typeof value.nutritionReviewed!=='boolean')return 'Confirm whether nutrition has been reviewed';
 if(!object(value.nutrition)||!['estimated','provided'].includes(value.nutrition.status)||!object(value.nutrition.grams))return 'Choose a nutrition value source';
 for(const key of recipeNutrients)if(!numeric(value.nutrition.grams[key],10000))return 'Nutrition must be a nonnegative number up to 10,000 g, or left blank';
 if(!numeric(value.nutrition.kcal,100000))return 'Energy must be a nonnegative number up to 100,000 kcal, or left blank';
 if(value.nutritionMode==='auto'&&value.nutritionReviewed&&!calculateRecipeNutrition(value.ingredients).complete)return 'Resolve ingredient measurements before reviewing automatic nutrition';
if(value.nutritionMode!=='auto'&&value.nutritionReviewed&&!recipeNutrients.some(key=>value.nutrition.grams[key]!==null)&&value.nutrition.kcal===null)return 'Enter at least one nutrition value before marking nutrition reviewed';
 return null;
}
export function cleanRecipeOverride(value:any,suggested?:any):RecipeOverride|null{
 if(value==null)return null;
 const error=recipeOverrideError(value);if(error)throw new Error(error);
 return {version:1,nutritionMode:value.nutritionMode||'manual',ingredients:value.ingredients.map((i:any)=>({name:i.name.trim(),measurement:i.measurement.trim(),detail:i.detail.trim(),assumed:i.assumed})),serving:value.serving.trim(),notes:value.notes.trim(),nutritionReviewed:value.nutritionReviewed,nutrition:value.nutritionMode==='auto'?calculateRecipeNutrition(value.ingredients,suggested).nutrition:{status:value.nutrition.status,grams:Object.fromEntries(recipeNutrients.map(key=>[key,value.nutrition.grams[key]])) as RecipeOverride['nutrition']['grams'],kcal:value.nutrition.kcal}};
}
export function recipeDraft(recipe:any,ingredients:string[]=[]):RecipeOverride{
 const rows=recipe?.ingredients?.length?recipe.ingredients:ingredients.map(name=>({name,measurement:''}));
 return {version:1,ingredients:(rows.length?rows:[{name:'',measurement:''}]).map((i:any)=>({name:i.name||'',measurement:i.assumedMeasurement||i.measurement||'',detail:i.detail||'',assumed:!!i.assumed})),serving:recipe?.serving||'',notes:[recipe?.review,...(recipe?.assumptions||[]),...(recipe?.substitutions||[])].filter(Boolean).join('\n'),nutritionReviewed:false,nutrition:{status:recipe?.nutrition?.status==='provided'?'provided':'estimated',grams:Object.fromEntries(recipeNutrients.map(key=>[key,recipe?.nutrition?.grams?.[key]??null])) as RecipeOverride['nutrition']['grams'],kcal:recipe?.nutrition?.kcal??null}};
}
export function resolveProductRecipe(suggested:any,override:any){
 if(override==null||recipeOverrideError(override))return suggested;
 const custom=cleanRecipeOverride(override,suggested)!;
 const calculation=custom.nutritionMode==='auto'?calculateRecipeNutrition(custom.ingredients,suggested):null;
 return {source:'Café-entered recipe',adminEdited:true,autoCalculated:!!calculation,calculation:calculation?{assumptions:calculation.assumptions,components:calculation.components}:undefined,ingredients:custom.ingredients,serving:custom.serving,notes:custom.notes,nutrition:{...custom.nutrition,status:custom.nutritionReviewed?custom.nutrition.status:'unavailable',reviewPending:!custom.nutritionReviewed,hasAssumptions:custom.ingredients.some(i=>i.assumed)}};
}

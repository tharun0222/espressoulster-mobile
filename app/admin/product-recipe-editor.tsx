'use client';
import {useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {recipeDraft,recipeNutrients,type RecipeOverride} from '../../lib/product-recipe';
import {calculateRecipeNutrition,ingredientNames} from '../../lib/recipe-calculator';
const labels={fat:'Fat',fibre:'Fibre',sugar:'Total sugar',protein:'Protein',carbs:'Carbohydrates'};
export default function ProductRecipeEditor({value,suggested,ingredients,onChange}:{value:RecipeOverride|null;suggested:any;ingredients?:string[];onChange:(value:RecipeOverride|null)=>void}){
 const [draft,setDraft]=useState<RecipeOverride>(()=>({...(value||recipeDraft(suggested,ingredients)),nutritionMode:value?.nutritionMode||'auto'}));
 const active=value!=null;
 const auto=draft.nutritionMode==='auto';
 const calculation=calculateRecipeNutrition(draft.ingredients,suggested);
 const nutrition=auto?calculation.nutrition:draft.nutrition;
 function update(next:RecipeOverride){
  const result=next.nutritionMode==='auto'?{...next,nutrition:calculateRecipeNutrition(next.ingredients,suggested).nutrition}:next;
  setDraft(result);onChange(result);
 }
 function ingredient(index:number,patch:Partial<RecipeOverride['ingredients'][number]>){update({...draft,nutritionReviewed:false,ingredients:draft.ingredients.map((row,i)=>i===index?{...row,...patch}:row)});}
 function number(value:string){return value.trim()===''?null:Number(value);}
 return <section className="product-recipe-editor" aria-labelledby="product-recipe-heading">
  <h3 id="product-recipe-heading">Ingredients & nutrition</h3>
  <p>Manage the measurements and nutrition shown in the mobile app for this item.</p>
  <label className="checkbox-label recipe-enable"><input type="checkbox" checked={active} onChange={e=>{if(e.target.checked)update({...draft,nutritionReviewed:false});else onChange(null);}}/>Use custom recipe details</label>
  {!active&&<p className="fine-print">The suggested recipe is shown below. Enable custom details to edit it.</p>}
  <fieldset disabled={!active} className="recipe-edit-fields"><legend>Ingredient measurements</legend>
   <datalist id="recipe-ingredient-suggestions">{ingredientNames.map(name=><option value={name} key={name}/>)}</datalist>
   {draft.ingredients.map((row,index)=><div className="recipe-ingredient-row" key={index}>
    <div className="recipe-ingredient-main">
     <label>Ingredient {index+1}<input required maxLength={150} list="recipe-ingredient-suggestions" value={row.name} onChange={e=>ingredient(index,{name:e.target.value})}/></label>
     <label>Quantity / unit<input required maxLength={200} placeholder="e.g. 160 ml, 75 g or 1 pc" value={row.measurement} onChange={e=>ingredient(index,{measurement:e.target.value})}/></label>
     <button type="button" className="icon-button" aria-label={'Remove ingredient '+(index+1)} disabled={draft.ingredients.length===1} onClick={()=>update({...draft,nutritionReviewed:false,ingredients:draft.ingredients.filter((_,i)=>i!==index)})}><Trash2 size={17}/></button>
    </div>
    <div className="recipe-ingredient-extra"><label>Ingredient note<input maxLength={500} value={row.detail} onChange={e=>ingredient(index,{detail:e.target.value})}/></label><label className="checkbox-label"><input type="checkbox" checked={row.assumed} onChange={e=>ingredient(index,{assumed:e.target.checked})}/>Assumed portion</label></div>
   </div>)}
   <button type="button" className="secondary" disabled={draft.ingredients.length>=100} onClick={()=>update({...draft,nutritionReviewed:false,ingredients:[...draft.ingredients,{name:'',measurement:'',detail:'',assumed:false}]})}><Plus size={15}/> Add ingredient</button>
   <label>Serving description<textarea rows={2} maxLength={2000} placeholder="e.g. One 250 ml cup, including garnish" value={draft.serving} onChange={e=>update({...draft,serving:e.target.value,nutritionReviewed:false})}/></label>
  </fieldset>
  <fieldset disabled={!active} className="recipe-edit-fields"><legend>Nutrition per serving</legend>
   <label>Nutrition calculation<select value={draft.nutritionMode||'auto'} onChange={e=>update({...draft,nutritionMode:e.target.value as 'auto'|'manual',nutritionReviewed:false,nutrition})}><option value="auto">Automatic from ingredients</option><option value="manual">Enter nutrition manually</option></select></label>
   <p className="fine-print">{auto?'Values recalculate as you change an ingredient, quantity, or unit. Review the estimates, then save the product.':'Enter values for the complete serving. Leave unknown values blank; zero means a confirmed zero. Switch to automatic to calculate from ingredient quantities.'}</p>
   {auto&&<div className="recipe-calculation-status" role="status" aria-live="polite">{calculation.complete?'Nutrition updated automatically.':<><strong>Complete the recipe to calculate nutrition:</strong><ul>{calculation.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul><p>No partial total will be published.</p></>}</div>}
   <div className="recipe-nutrient-grid">{recipeNutrients.map(key=><label key={key}>{labels[key]} (g)<input type="number" step="any" min="0" max="10000" readOnly={auto} value={nutrition.grams[key]??''} onChange={e=>update({...draft,nutritionReviewed:false,nutrition:{...draft.nutrition,grams:{...draft.nutrition.grams,[key]:number(e.target.value)}}})}/></label>)}<label>Energy (kcal)<input type="number" step="any" min="0" max="100000" readOnly={auto} value={nutrition.kcal??''} onChange={e=>update({...draft,nutritionReviewed:false,nutrition:{...draft.nutrition,kcal:number(e.target.value)}})}/></label></div>
   {auto?<p className="fine-print">Estimated using standard ingredient references, including the listed portion and brand assumptions. Values are per serving, before customisations.</p>:<label>Nutrition source<select value={draft.nutrition.status} onChange={e=>update({...draft,nutritionReviewed:false,nutrition:{...draft.nutrition,status:e.target.value as 'estimated'|'provided'}})}><option value="estimated">Estimated from recipe</option><option value="provided">Café supplied values</option></select></label>}
   <label className="checkbox-label recipe-review-check"><input type="checkbox" checked={draft.nutritionReviewed} disabled={auto&&!calculation.complete} onChange={e=>update({...draft,nutritionReviewed:e.target.checked})}/>I have reviewed nutrition for this recipe and serving</label>
   {!draft.nutritionReviewed&&<p className="recipe-editor-notice">Review the updated nutrition before saving to show the values to customers. Ingredient measurements can still be saved without reviewed nutrition.</p>}
   {auto&&<details className="recipe-auto-basis"><summary>Calculation details & sources</summary><p>Each ingredient contributes its edible grams × nutrients per 100 g ÷ 100. Ranges use their midpoint. Discarded grounds are excluded.</p><ul>{calculation.assumptions.map(text=><li key={text}>{text}</li>)}</ul><ul>{calculation.components.map((part,i)=><li key={i}>{part.ingredient}: {part.grams} g — <a href={part.url} target="_blank" rel="noreferrer">{part.food}</a>{part.proxy&&<>. {part.proxy}</>}</li>)}</ul></details>}
  </fieldset>
  <label>Recipe and calculation notes<textarea disabled={!active} rows={4} maxLength={12000} value={draft.notes} onChange={e=>update({...draft,notes:e.target.value})}/></label>
  <button type="button" className="text-button" disabled={!active} onClick={()=>{setDraft({...recipeDraft(suggested,ingredients),nutritionMode:'auto'});onChange(null);}}>Restore suggested recipe</button>
  <p className="fine-print">Use Save product below to publish your changes.</p>
 </section>;
}

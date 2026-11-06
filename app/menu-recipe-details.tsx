'use client';
const nutrients=[['fat','Fat','g'],['fibre','Fibre','g'],['sugar','Total sugar','g'],['protein','Protein','g'],['carbs','Carbs','g'],['kcal','Energy','kcal']] as const;
export default function MenuRecipeDetails({product}:{product:any}){
 const recipe=product.recipeMeasurements;
 const nutrition=recipe?.nutrition||product.nutrition;
 const estimated=nutrition?.status==='estimated';
 const supplied=nutrition?.status==='provided';
 const ready=estimated||supplied;
 const manual=!!recipe?.adminEdited;
 return <>
  <section className="item-nutrition" aria-label="Nutrition information">
   <div className="nutrition-heading"><h3>Nutrition <span>per serving</span></h3><span className="recipe-estimate-label">{supplied?'Café supplied':estimated?'Estimated':nutrition?.reviewPending?'Awaiting review':'Unavailable'}</span></div>
   <dl>{nutrients.map(([key,label,unit])=>{
    const value=ready?(key==='kcal'?nutrition.kcal:nutrition.grams?.[key]):undefined;
    return <div key={key}><dt>{label}</dt><dd>{typeof value==='number'&&Number.isFinite(value)?<>{estimated?'~':''}{key==='kcal'?Math.round(value):value.toFixed(1)}<small> {unit}</small></>:<span className="nutrition-pending">N/A</span>}</dd></div>;
   })}</dl>
   <p className="nutrition-note">{manual?(nutrition?.reviewPending?'The café is reviewing nutrition for this recipe. N/A means unavailable, not zero.':`${supplied?'Values supplied by the café':recipe.autoCalculated?'Estimates calculated from ingredient quantities':'Estimates entered by the café'} per serving, before customisations. Blank values are unavailable, not zero. Brands and preparation may vary; not laboratory verified.`):<>{estimated&&(recipe?.standardRecipe?'Based on a proposed standard recipe. Café portions and ingredients are not yet verified.':nutrition.hasAssumptions?'Recipe estimate using recorded quantities plus disclosed portion assumptions and ingredient substitutes.':'Estimated from the recorded recipe serving.')} {estimated?'Before customisations. Brands, cooking and portions change the result; not laboratory tested.':'Complete nutrition values await recipe quantities or ingredient data. N/A means unavailable, not zero.'}</>}</p>
   {estimated&&manual&&recipe.autoCalculated&&<details className="recipe-calculation"><summary>Calculation details</summary><p>Ingredient grams × nutrient per 100 g ÷ 100, summed per serving. Standard ingredients and brand substitutes are estimates.</p><ul>{recipe.calculation?.assumptions?.map((text:string)=><li key={text}>{text}</li>)}</ul><ul>{recipe.calculation?.components?.map((part:any,index:number)=><li key={index}>{part.ingredient}: {part.grams} g · <a href={part.url} target="_blank" rel="noreferrer">{part.food}</a>{part.proxy&&<>. {part.proxy}</>}</li>)}</ul></details>}
{recipe&&estimated&&!manual&&<details className="recipe-calculation"><summary>Calculation & assumptions</summary>
    {nutrition.servingGrams>0&&<p>Modelled edible serving: approximately {nutrition.servingGrams} g. Includes listed sides, sauces and garnishes; discarded coffee grounds and tea leaves are excluded.</p>}
    {recipe.assumptions?.length>0&&<><h4>Portion assumptions</h4><ul>{recipe.assumptions.map((item:string)=><li key={item}>{item}</li>)}</ul></>}
    {recipe.substitutions?.length>0&&<><h4>Ingredient substitutes</h4><ul>{recipe.substitutions.map((item:string)=><li key={item}>{item}</li>)}</ul></>}
    <p>Values are summed from ingredient weights × reference nutrients per 100 g. All listed cooking oil is counted unless a prepared-food proxy already includes it. Water loss and oil absorption can change the served result.</p>
    {recipe.references?.length>0&&<><h4>Ingredient references</h4><ul>{recipe.references.map((item:any)=><li key={item.url+item.name}><a href={item.url} target="_blank" rel="noreferrer">{item.name}</a></li>)}</ul></>}
   </details>}
  </section>
  <section className="item-ingredients recipe-measurements" aria-label="Ingredients and recipe measurements"><h3>Ingredients & quantities</h3>{recipe?.ingredients?.length?<>
   <p className="recipe-basis">{manual?'Per serving, entered by the café. “Assumed” identifies portions awaiting café confirmation.':recipe.standardRecipe?'Proposed standard portions for one serving. All quantities below are assumptions pending café confirmation.':'Recorded café quantities are retained. “Assumed” marks proposed portions added where source details were missing.'}</p>
   <table><thead><tr><th>Ingredient</th><th>Measurement</th></tr></thead><tbody>{recipe.ingredients.map((item:any,index:number)=><tr key={index}><td>{item.name}{item.assumed&&<small className="recipe-assumed">Assumed</small>}{item.detail&&!item.assumed&&<small>{item.detail}</small>}</td><td>{item.assumedMeasurement||item.measurement}{item.assumedMeasurement&&<small>Source: {item.measurement}</small>}{item.estimatedGrams!=null&&!/^\d+(\.\d+)?\s*(g|gm|gms)$/i.test(item.measurement)&&<small>≈ {item.estimatedGrams} g for calculation</small>}</td></tr>)}</tbody></table>
   {manual&&recipe.notes&&<details className="recipe-manual-notes"><summary>Recipe notes</summary><p style={{whiteSpace:'pre-line'}}>{recipe.notes}</p></details>}
   {recipe.needsConfirmation&&<p className="recipe-review"><strong>Recipe confirmation needed:</strong> {recipe.review} The estimate follows the ingredient table and any assumptions listed above.</p>}
   {recipe.serving&&<details><summary>Serving notes</summary><p>{recipe.serving}</p></details>}
   </>:<><p className="recipe-basis">Measured quantities have not been supplied for this item.</p>{product.ingredients?.length>0&&<ul>{product.ingredients.map((name:string)=><li key={name}>{name}</li>)}</ul>}</>}</section>
 </>;
}

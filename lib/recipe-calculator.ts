import referenceData from './ingredient-nutrition.json' with {type:'json'};
export const nutritionKeys=['fat','fibre','sugar','protein','carbs','kcal'] as const;
type Nutrient=(typeof nutritionKeys)[number];
type Values=Record<Nutrient,number>;
type Reference={name:string;reference:string;food:string;per100g:Values;url:string;proxy:string;density:number;pieceGrams?:number;sliceGrams?:number;leafGrams?:number};
export type MeasuredIngredient={name:string;measurement:string};
const references=referenceData as Record<string,Reference>;
export const ingredientNames=Object.values(references).map(ref=>ref.name).sort((a,b)=>a.localeCompare(b));
const normalize=(text:string)=>text.trim().toLowerCase().replace(/\s+/g,' ');
const discarded=new Set(['coffee ground','coffee grounds','coffee beans','tea powder']);
export type Calculation={complete:boolean;nutrition:{status:'estimated';grams:Record<'fat'|'fibre'|'sugar'|'protein'|'carbs',number|null>;kcal:number|null};issues:string[];assumptions:string[];components:{ingredient:string;grams:number;food:string;url:string;proxy:string}[]};
function quantity(text:string,ref:Reference):{grams:number;note:string}{
 const clean=text.trim().toLowerCase().replace(/gms\s+s$/,'gms');
 if(/^(?:pinch|dash)$/.test(clean))return {grams:clean==='pinch'?.3:1,note:`Assumed ${clean} = ${clean==='pinch'?'.3':'1'} g.`};
 const match=clean.match(/^(\d+(?:\.\d+)?(?:\s*[-–/]\s*\d+(?:\.\d+)?)?)\s*([a-z][a-z\s.]*)$/);
 if(!match)throw Error('Use a measured quantity such as 160 ml, 75 g, 1/2 pc or 1-2 g.');
 let value:number;let note='';const raw=match[1].replace(/\s/g,'');const unit=match[2].trim().replace(/\.$/,'');
 if(/[-–]/.test(raw)){const [low,high]=raw.split(/[-–]/).map(Number);if(high<low)throw Error('The upper end of the range must be at least the lower end.');value=(low+high)/2;note=`Range ${raw} uses midpoint ${value}.`;}
 else if(raw.includes('/')){const [a,b]=raw.split('/').map(Number);if(b===0)throw Error('A fraction cannot have a zero denominator.');if(b<=8&&a<b){value=a/b;}else{if(b<a)throw Error('Use low-high for a quantity range.');value=(a+b)/2;note=`Range ${raw} uses midpoint ${value}.`;}}
 else value=Number(raw);
 let factor:number;
 if(/^(g|gm|gms|gram|grams)$/.test(unit))factor=1;
 else if(/^(kg|kilogram|kilograms)$/.test(unit))factor=1000;
 else if(/^(ml|milliliter|millilitre|milliliters|millilitres)$/.test(unit)){factor=ref.density;note+=` Assumed density ${factor} g/ml.`;}
 else if(/^(l|litre|liter|litres|liters)$/.test(unit)){factor=ref.density*1000;note+=` Assumed density ${ref.density} g/ml.`;}
 else if(/^(pc|pcs|piece|pieces|no|nos|number|numbers|egg|eggs|big pc)$/.test(unit)&&ref.pieceGrams){factor=ref.pieceGrams;note+=` Assumed ${factor} g per piece.`;}
 else if(/^(slice|slices)$/.test(unit)&&ref.sliceGrams){factor=ref.sliceGrams;note+=` Assumed ${factor} g per slice.`;}
 else if(/^(leaf|leaves)$/.test(unit)&&ref.leafGrams){factor=ref.leafGrams;note+=` Assumed ${factor} g per leaf.`;}
 else if(/^(tsp|tps|teaspoon|teaspoons)$/.test(unit)&&/oregano|dried herb/i.test(ref.food)){factor=.7;note+=' Assumed dried herb = 0.7 g per teaspoon.';}
 else throw Error('This unit has no confirmed conversion for this ingredient. Enter grams or millilitres, or a supported piece/slice count.');
 const grams=value*factor;
 if(!Number.isFinite(grams)||grams<0||grams>10000)throw Error('The measured portion must be between 0 and 10,000 g.');
 return {grams,note:note.trim()};
}
export function calculateRecipeNutrition(ingredients:MeasuredIngredient[],suggested?:any):Calculation{
 const totals=Object.fromEntries(nutritionKeys.map(k=>[k,0])) as Values;
 const issues:string[]=[],assumptions:string[]=[],components:Calculation['components']=[];
 // Existing filter-coffee recipes explicitly model brewed yield at 90% of water.
 const filterBrew=!!suggested?.assumptions?.some((text:string)=>text.startsWith('Assumed brewed yield 90%'));
 function add(name:string,measurement:string){
  const key=normalize(name);
  if(discarded.has(key)){assumptions.push(`${name}: discarded grounds/leaves are excluded; the brewed drink is counted separately.`);return;}
  let ref=references[key];
  if(filterBrew&&key==='water')ref=references['brewed coffee yield'];
  if(!ref)throw Error('Choose an ingredient from the suggestions, or use manual nutrition for an unlisted ingredient.');
  const portion=quantity(measurement,ref);
  const grams=filterBrew&&key==='water'?portion.grams*.9:portion.grams;
  if(filterBrew&&key==='water')assumptions.push('Brewed coffee yield estimated at 90% of water input; actual extraction and yield can vary.');
  if(portion.note)assumptions.push(`${name}: ${portion.note}`);
  for(const key of nutritionKeys)totals[key]+=ref.per100g[key]*grams/100;
  components.push({ingredient:name,grams:Math.round(grams*1000)/1000,food:ref.food,url:ref.url,proxy:ref.proxy});
 }
 for(const row of ingredients){
  try{
   if(normalize(row.name)==='garnish'){
    const parts=row.measurement.split(/\s+\+\s+/);
    for(const part of parts){const match=part.match(/^(.+?)\s+(\d.*)$/);if(!match)throw Error('Give each garnish a name and measured amount, e.g. Whipped Cream 15 g + Chocolate Syrup 5 g.');add(match[1],match[2]);}
   }else add(row.name,row.measurement);
  }catch(error){issues.push(`${row.name.trim()||'Unnamed ingredient'}: ${(error as Error).message}`);}
 }
 if(!ingredients.length)issues.push('Add at least one measured ingredient.');
 if(!components.length&&!issues.length)issues.push('Add the brewed drink or an edible ingredient; discarded grounds alone cannot describe a serving.');
 if(nutritionKeys.some(k=>!Number.isFinite(totals[k])||totals[k]>(k==='kcal'?100000:10000)))issues.push('The recipe exceeds the supported serving size.');
 const complete=issues.length===0;
 return {complete,issues,assumptions:[...new Set(assumptions)],components,nutrition:{status:'estimated',grams:{fat:complete?round(totals.fat):null,fibre:complete?round(totals.fibre):null,sugar:complete?round(totals.sugar):null,protein:complete?round(totals.protein):null,carbs:complete?round(totals.carbs):null},kcal:complete?Math.round(totals.kcal):null}};
}
function round(value:number){return Math.round((value+Number.EPSILON)*10)/10;}

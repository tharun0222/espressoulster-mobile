import estimates from './recipe-estimates.json' with {type:'json'};

const records=estimates as Record<string,any>;
const byName=new Map(Object.values(records).map(recipe=>[recipe.name.trim().toLowerCase(),recipe]));

export function menuRecipe(id:string,name:string){
  return records[id] || byName.get(name.trim().toLowerCase()) || null;
}

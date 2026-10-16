type Product={id:string;name:string;categoryId:string;price:number|null;dietary?:string[];archived?:boolean;featured?:boolean};
export function normalizeDiet(tag:string){return tag.trim().toLowerCase().replace(/[\s_-]+/g,'')}
export function matchesDiet(p:Product,diet:string){const tags=(p.dietary||[]).map(normalizeDiet);const want=normalizeDiet(diet);if(want==='all')return true;if(want==='unknown')return !tags.some(t=>['veg','vegetarian','nonveg','nonvegetarian','vegan','egg'].includes(t));const nonveg=tags.some(t=>['nonveg','nonvegetarian','egg'].includes(t));if(want==='veg')return !nonveg&&tags.some(t=>['veg','vegetarian','vegan'].includes(t));if(want==='nonveg')return nonveg;return tags.includes(want)}
export function filterMenu(products:Product[],categoryIds:string[],options:{category:string;search:string;diet:string;sort:string;priceRange:string}){
 const ranges:Record<string,[number,number]>={'under-250':[0,25000],'250-500':[25000,50000],'500-plus':[50000,Infinity]};const range=ranges[options.priceRange];
 return products.filter(p=>!p.archived&&categoryIds.includes(p.categoryId)&&(options.category==='all'||p.categoryId===options.category)&&p.name.toLowerCase().includes(options.search.trim().toLowerCase())&&matchesDiet(p,options.diet)&&(!range||(Number.isSafeInteger(p.price)&&p.price!==null&&p.price>=range[0]&&p.price<range[1]))).sort((a,b)=>{
  if(options.sort.startsWith('price-')){if(a.price===null&&b.price===null)return a.name.localeCompare(b.name);if(a.price===null)return 1;if(b.price===null)return -1;return (options.sort==='price-up'?a.price-b.price:b.price-a.price)||a.name.localeCompare(b.name)}
  return options.sort==='name'?a.name.localeCompare(b.name):Number(!!b.featured)-Number(!!a.featured)
 });
}

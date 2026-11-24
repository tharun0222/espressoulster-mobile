const drinkCategories = new Set([
 'coffee','more','classic-hot-iced','cold-brew-iced-coffee','non-coffee',
 'frappes','cold-coffee','smoothies','refreshing-teas','mocktails','other-mixed','manual-brews',
]);
const foodCategories = new Set([
 'food','bagel','sandwiches-wrap','toast','salad','omelettes','starters','combo','pasta',
]);

export function subscriptionAppearance(scope?:string,items:{categoryId?:string}[] = []) {
 if(scope==='coffee')return 'coffee';
 const drinks=items.some(item=>drinkCategories.has(item.categoryId||''));
 const food=items.some(item=>foodCategories.has(item.categoryId||''));
 if(drinks&&food)return 'mixed';
 if(drinks)return 'coffee';
 return 'food';
}

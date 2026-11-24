import test from 'node:test';import assert from 'node:assert/strict';import {validateSubscriptionPlan} from '../lib/subscription-catalog.ts';
const good={name:'Team coffee pass',amount:1200000,credits:60,days:60,enabled:true};
test('validates editable plan fields',()=>assert.deepEqual(validateSubscriptionPlan(good),good));
test('rejects unsafe price, credits, validity and malformed fields',()=>{for(const changes of [{name:''},{amount:99},{amount:Infinity},{amount:100.5},{credits:0},{credits:1.5},{days:0},{days:731},{enabled:'yes'}])assert.throws(()=>validateSubscriptionPlan({...good,...changes}))});
import {validatePlanItems} from '../lib/subscription-catalog.ts';
test('menu selection requires actual non-archived products and stores canonical names',()=>{const products=[{id:'sandwich',name:'Cheese sandwich'},{id:'old',name:'Old item',archived:true}];assert.throws(()=>validatePlanItems('menu',[],products));assert.throws(()=>validatePlanItems('menu',['missing'],products));assert.throws(()=>validatePlanItems('menu',['old'],products));assert.deepEqual(validatePlanItems('menu',['sandwich','sandwich'],products),{itemScope:'menu',includedItems:[{id:'sandwich',name:'Cheese sandwich'}]})});


import {subscriptionAppearance} from '../lib/subscription-appearance.ts';
test('selected item categories generate coffee, food and mixed card symbols',()=>{
 const products=[{id:'latte',name:'Latte',categoryId:'classic-hot-iced'},{id:'bagel',name:'Bagel',categoryId:'bagel'}];
 const coffee=validatePlanItems('menu',['latte'],products);
 const food=validatePlanItems('menu',['bagel'],products);
 const mixed=validatePlanItems('menu',['latte','bagel'],products);
 assert.equal(subscriptionAppearance(coffee.itemScope,coffee.includedItems),'coffee');
 assert.equal(subscriptionAppearance(food.itemScope,food.includedItems),'food');
 assert.equal(subscriptionAppearance(mixed.itemScope,mixed.includedItems),'mixed');
 assert.equal(subscriptionAppearance('coffee',[]),'coffee');
 products[0].categoryId='bagel';
 assert.equal(coffee.includedItems[0].categoryId,'classic-hot-iced');
 assert.equal(subscriptionAppearance(coffee.itemScope,coffee.includedItems),'coffee');
});

test('accepts a one-rupee plan price',()=>assert.equal(validateSubscriptionPlan({...good,amount:100}).amount,100));

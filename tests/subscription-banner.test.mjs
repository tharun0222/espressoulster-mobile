import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionPlanImages,validateSubscriptionBanner} from '../lib/subscription-catalog.ts';
test('subscription banners use current menu photos without changing plan eligibility',()=>{
 const plans=[{id:'food',includedItems:[{id:'sandwich',name:'Purchased name'},{id:'missing',name:'Other item'}]}];
 const result=subscriptionPlanImages(plans,[{id:'sandwich',image:'/sandwich.webp',imageAtlas:true,imagePosition:'25% 100%'}]);
 assert.equal(result[0].includedItems[0].image,'/sandwich.webp');
 assert.equal(result[0].includedItems[0].imageAtlas,true);
 assert.equal(result[0].includedItems[0].imagePosition,'25% 100%');
 assert.equal(result[0].includedItems[0].name,'Purchased name');
 assert.equal(result[0].includedItems[1].image,null);
 assert.equal(plans[0].includedItems[0].image,undefined);
});
test('archived products do not supply subscription banner photos',()=>{
 assert.equal(subscriptionPlanImages([{includedItems:[{id:'old',name:'Old'}]}],[{id:'old',archived:true,image:'/old.webp'}])[0].includedItems[0].image,null);
});

test('banner controls reject invalid styles and remote images',()=>{
 assert.equal(validateSubscriptionBanner({height:300,zoom:120,position:25,numberColor:'#123456',textColor:'#abcdef',image:'/api/images/banner.webp'}).height,300);
 for(const input of [{height:999},{zoom:99},{position:-1},{textColor:'red'},{numberColor:'url(x)'},{image:'https://other.example/a.png'}])assert.throws(()=>validateSubscriptionBanner(input));
});

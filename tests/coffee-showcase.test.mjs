import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availableShowcaseItems} from '../lib/coffee-showcase.ts';
const item = (changes = {}) => ({id:'caramel',name:'Caramel Cold Coffee',price:235,available:true,inventory:null,image:'/images/menu/items/source-05.webp',...changes});
test('showcase contains only orderable matching menu drinks', () => {
  for (const changes of [{available:false},{archived:true},{inventory:0},{inventory:-1},{price:null},{price:NaN},{name:'Hot Latte'}]) {
    assert.deepEqual(availableShowcaseItems([item(changes)]), []);
  }
  assert.equal(availableShowcaseItems([item({inventory:1})]).length,1);
});
test('each scene retains the real menu id, name and price, and disappears after stock changes', () => {
  const products=[item(),item({id:'vanilla',name:'French Vanilla Iced Latte',price:285,inventory:3})];
  assert.deepEqual(availableShowcaseItems(products).map(({id,name,price})=>({id,name,price})),products.map(({id,name,price})=>({id,name,price})));
  assert.deepEqual(availableShowcaseItems(products.map(p=>({...p,inventory:0}))),[]);
});

test('showcase uses the exact menu photo and its matching glass mask',()=>{
 const [drink]=availableShowcaseItems([item()]);
 assert.equal(drink.image,item().image);assert.equal(drink.mask,'/images/menu/masks/source-05.svg');
 const [custom]=availableShowcaseItems([item({image:'/uploads/custom-cup.webp'})]);
 assert.equal(custom.image,'/uploads/custom-cup.webp');assert.equal(custom.mask,undefined);
 assert.deepEqual(availableShowcaseItems([item({image:''})]),[]);
});

test('the plain Iced Latte is excluded from the showcase while flavored lattes can appear', () => {
  const products = [
    item({id:'iced-latte',name:'Iced Latte'}),
    item({id:'vanilla',name:'French Vanilla Iced Latte'}),
    item({id:'strawberry',name:'Strawberry Iced Latte'}),
  ];
  assert.deepEqual(availableShowcaseItems(products).map(drink => drink.id), ['vanilla', 'strawberry']);
});

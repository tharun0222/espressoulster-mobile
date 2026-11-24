import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareReorder,pairingCandidates,receiptText,paymentLabel} from '../lib/mobile-experience.ts';
const product={id:'latte',name:'Latte',price:20000,available:true,inventory:4,variants:[{id:'large'}],addons:[{id:'shot'}]};
const order={items:[{product_id:'latte',name:'Latte',quantity:2,selections:{variant:{id:'large'},addons:[{id:'shot'}]},instructions:'Less sweet'}]};
test('reorder retains exact priced selections and instructions',()=>{assert.deepEqual(prepareReorder(order,[product]),[{productId:'latte',quantity:2,variantId:'large',addonIds:['shot'],instructions:'Less sweet'}])});
test('reorder refuses unavailable stock and removed customisations',()=>{assert.throws(()=>prepareReorder(order,[{...product,inventory:0}]),/unavailable/);assert.throws(()=>prepareReorder(order,[{...product,addons:[]}]),/extras/);assert.throws(()=>prepareReorder(order,[{...product,variants:[]}]),/option/)});
test('pairings exclude cart items and unavailable snacks',()=>{const snack={id:'cake',name:'Cake',price:10000,available:true};assert.deepEqual(pairingCandidates([product,snack,{...snack,id:'sold',inventory:0}],[],['latte']).map(p=>p.id),['cake']);assert.deepEqual(pairingCandidates([product,snack],[],['cake']),[])});
test('pairings suggest food even when a drink has a food name', () => {
 const cookieFrappe = {id:'frappe',name:'Cookie Crumble Frappe',price:10000,available:true};
 const toast = {id:'toast',name:'Cheese Toast',price:10000,available:true};
 assert.deepEqual(pairingCandidates([product,cookieFrappe,toast],[],['latte']).map(item=>item.id),['toast']);
});
test('receipt includes verified payment method, discount and sandbox label',()=>{const receipt=receiptText({...order,id:'CH-12345678',currency:'INR',created_at:'2026-10-16',status:'ready',payment_status:'paid',collection_method:'stripe_test',subtotal:40000,discount:4000,tax:0,fee:0,total:36000,items:[{name:'Latte',quantity:2,unit_price:20000}]});assert.match(receipt,/Discount: -INR 40.00/);assert.match(receipt,/Total: INR 360.00/);assert.match(receipt,/TEST PAYMENT/);assert.equal(paymentLabel('upi'),'UPI')});

test('cart identity preserves distinct preparation requests',async()=>{const {cartItemKey}=await import('../lib/mobile-experience.ts');const i={productId:'latte',variantId:'',addonIds:['shot'],instructions:'Less sweet'};assert.notEqual(cartItemKey(i),cartItemKey({...i,instructions:'No added sugar'}));assert.equal(cartItemKey(i),cartItemKey({...i}))});
test('poll refresh preserves older order pages and updates matching rows',async()=>{const {mergeOrderUpdates}=await import('../lib/mobile-experience.ts');assert.deepEqual(mergeOrderUpdates([{id:'new',status:'pending'},{id:'old',status:'completed'}],[{id:'new',status:'ready'}]),[{id:'new',status:'ready'},{id:'old',status:'completed'}])});

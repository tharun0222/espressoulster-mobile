import {orderReference} from './order-reference.ts';
export function prepareReorder(order:any,products:any[]){
 if(!order?.items?.length)throw Error('This order has no menu items to reorder.');
 return order.items.map((row:any)=>{
  const p=products.find(p=>p.id===row.product_id);
  if(!p||p.archived||!p.available||p.price==null||p.inventory===0)throw Error(`${row.name} is unavailable. Choose another item from the menu.`);
  const variantId=row.selections?.variant?.id||'',addonIds=(row.selections?.addons||[]).map((a:any)=>a.id);
  if(variantId&&!p.variants?.some((v:any)=>v.id===variantId))throw Error(`The previous option for ${row.name} has changed. Customise it again from the menu.`);
  if(addonIds.some((id:string)=>!p.addons?.some((a:any)=>a.id===id)))throw Error(`The extras for ${row.name} have changed. Customise it again from the menu.`);
  if(!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>99)throw Error('Invalid order quantity.');
  return {productId:p.id,quantity:row.quantity,variantId,addonIds,instructions:row.instructions||''};
 });
}
export function pairingCandidates(products:any[],categories:any[],cartIds:string[],limit=3){
 const coffeeInCart=products.some(p=>cartIds.includes(p.id)&&/coffee|espresso|latte|cappuccino|americano|mocha|brew|frappe/i.test(p.name));
 if(!coffeeInCart)return [];
 const categoryNames = new Map(categories.map(category => [category.id, category.name]));
 return products.filter(p => {
  if (!p.available || p.archived || p.price == null || p.inventory === 0 || cartIds.includes(p.id)) return false;
  const category = categoryNames.get(p.categoryId) || '';
  if (/coffee|brew|frapp|smoothie|tea\b|mocktail|cooler|\bdrinks?\b|^Classic hot & iced$/i.test(category) ||
      /frapp[eé]|smoothie|mocktail|cooler|lemonade|mojito/i.test(p.name)) return false;
  return /croissant|cake|cookie|sandwich|toast|brownie|muffin|pastr|snack|food|bagels?|wraps?|starters/i.test(p.name + ' ' + category);
 }).sort((a,b)=>Number(!!b.featured)-Number(!!a.featured)||a.name.localeCompare(b.name)).slice(0,limit);
}
export function paymentLabel(method:string|null){return ({stripe_test:'Stripe sandbox',cashfree_test:'Cashfree',cashfree:'Cashfree',upi:'UPI',cash:'Cash',card:'Card',pay_at_counter:'Pay at counter',pay_at_pickup:'Pay at collection'} as Record<string,string>)[method||'']||method||'Not recorded';}
export function receiptText(o:any){const amount=(n:number)=>`${o.currency||'INR'} ${(n/100).toFixed(2)}`;return ['Espressoulster Coffee','Order receipt (not a GST tax invoice)',orderReference(o),'Date: '+o.created_at,'Order: '+o.status,'Payment: '+o.payment_status,'Method: '+paymentLabel(o.collection_method),...o.items.map((i:any)=>`${i.quantity} × ${i.name} — ${amount(i.quantity*i.unit_price)}`),'Subtotal: '+amount(o.subtotal),'Discount: -'+amount(o.discount),'Tax: '+amount(o.tax),'Fees: '+amount(o.fee),'Total: '+amount(o.total),['stripe_test','cashfree_test'].includes(o.collection_method)?'TEST PAYMENT — no real money collected':''].join('\n');}

export function mergeOrderUpdates(previous:any[],fresh:any[]){const updates=new Map(fresh.map(o=>[o.id,o]));return [...fresh,...previous.filter(o=>!updates.has(o.id))];}
export function cartItemKey(i:{productId:string;variantId:string;addonIds:string[];instructions:string}){return JSON.stringify([i.productId,i.variantId,[...i.addonIds].sort(),i.instructions||'']);}

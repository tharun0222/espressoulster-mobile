import {orderReference,type OrderReference} from './order-reference.ts';
export async function subscriptionId(endpoint: string) {
 const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
 return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export type NoticeOrder=OrderReference&{status:string;fulfillment?:string;contact?:{table?:string};events?:{status:string;created_at:string}[]};
export function orderNotice(order:NoticeOrder,status=order.status){
 const dineIn=order.fulfillment==='dine_in';
 const table=dineIn?order.contact?.table:undefined;
 const notices:Record<string,{title:string;body:string}>={
  pending:{title:'Order received',body:'We’ve received your order and will confirm it shortly.'},
  confirmed:{title:'Order accepted',body:table?`We’ve assigned Table ${table}.`:'The café has your order.'},
  preparing:{title:'Preparing your order',body:'The café is preparing your order.'},
  ready:dineIn
   ? {title:'Ready to serve',body:table?`We’ll bring your order to Table ${table}.`:'The café team will bring your order.'}
   : order.fulfillment==='delivery'
     ? {title:'Order ready',body:'Your order is ready for dispatch.'}
     : {title:'Ready for pickup',body:'Collect your order at the café counter.'},
  completed:{title:'Order completed',body:'Your order is complete. Thank you for choosing Espressoulster!'},
  out_for_delivery:{title:'On its way',body:'Your order is on its way.'},
  cancelled:{title:'Order cancelled',body:'This order has been cancelled.'},
 };
 const copy=notices[status];
 return copy?{id:order.id,reference:orderReference(order),status,fulfillment:order.fulfillment,title:'Espressoulster · '+copy.title,body:copy.body,url:'/?trackOrder='+encodeURIComponent(order.id)+'#orders',tag:order.id+'-'+status}:null;
}
export function staffOrderNotice(order:OrderReference&{fulfillment:string}) {
 const reference=orderReference(order);
 const method=order.fulfillment==='dine_in'?'Dine in':order.fulfillment==='delivery'?'Delivery':'Pickup';
 return {id:order.id,reference,status:'pending',title:'New café order',body:`${method} order is ready for review.`,tag:order.id+'-staff-received'};
}
export function collectOrderNotices(orders:NoticeOrder[],seen:Map<string,Set<string>>){
 const notices:NonNullable<ReturnType<typeof orderNotice>>[]=[];
 for(const order of orders){
  const events=order.events?.length?order.events:[{status:order.status,created_at:''}];
  const existing=seen.get(order.id),keys=existing||new Set<string>();
  for(const event of events){const key=event.status+':'+event.created_at;if(existing&&!keys.has(key)){const notice=orderNotice(order,event.status);if(notice)notices.push(notice)}keys.add(key)}
  seen.set(order.id,keys);
 }
 return notices;
}

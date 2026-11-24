export function activeCafeOrders<T extends {status:string;items?:{product_id?:string}[]}>(orders:T[]):T[]{
 return orders.filter(order=>['pending','confirmed','preparing','ready','out_for_delivery'].includes(order.status)&&
  !!order.items?.some(item=>item.product_id&&!item.product_id.startsWith('subscription-')));
}
export function liveOrderLabel(order:{status:string;fulfillment?:string}){
 return order.status==='confirmed'?'Order accepted':order.status==='preparing'?'Preparing your order':order.status==='ready'?(order.fulfillment==='dine_in'?'Ready to serve':'Ready for collection'):order.status==='out_for_delivery'?'On its way':'Waiting for café acceptance';
}

import {assert} from './pricing.ts';
export function simulatePayment(order:{id:string;total:number;currency:string;status:string;payment_status:string},outcome:unknown){
 assert(['success','failure','cancelled'].includes(outcome as string),'Invalid test outcome');
 assert(order.payment_status==='unpaid'&&!['cancelled','completed'].includes(order.status),'Order is not eligible for a test payment',409);
 assert(Number.isSafeInteger(order.total)&&order.total>0&&order.currency==='INR','Invalid order amount');
 return {testOnly:true,realMoneyCollected:false,orderId:order.id,amount:order.total,currency:order.currency,simulatedStatus:outcome==='success'?'paid':outcome==='failure'?'failed':'cancelled',actualPaymentStatus:order.payment_status};
}

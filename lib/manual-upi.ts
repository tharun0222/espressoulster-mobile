export const paymentUpiId = '8220025037-4@ibl';
export function manualUpiLink(amount:number, orderId:string) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^CH-[A-F0-9]{8}$/.test(orderId)) throw new Error('Invalid payment details');
  return 'upi://pay?' + new URLSearchParams({pa:paymentUpiId,cu:'INR',am:(amount/100).toFixed(2),tn:'Order '+orderId}).toString();
}

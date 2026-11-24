import {publicMessage} from './public-message';
export async function paymentRequest(path:string,data?:unknown){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/payments/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
  const result:any=await response.json();
  if(!response.ok)throw Error(publicMessage(result.error,'Please check your payment status before trying again.'));
  return result;
 }catch(error){if(controller.signal.aborted)throw Error('Payment request timed out. Check payment status before trying again.');if(['TypeError','NetworkError','SyntaxError'].includes((error as Error)?.name))throw Error('Couldn’t confirm the payment status. Check your order before paying again.');throw error;}
 finally{clearTimeout(timer);}
}

export type Msg91WhatsAppConfig={
 MSG91_AUTH_KEY?:string;
 MSG91_WHATSAPP_NUMBER?:string;
 MSG91_WHATSAPP_TEMPLATE?:string;
 MSG91_WHATSAPP_NAMESPACE?:string;
 MSG91_WHATSAPP_LANGUAGE?:string;
 MSG91_WHATSAPP_TEMPLATE_APPROVED?:string;
 OTP_DELIVERY_CHANNEL?:string;
};
export const usesWhatsAppOtp=(e:Msg91WhatsAppConfig)=>e.OTP_DELIVERY_CHANNEL==='whatsapp';
export function msg91WhatsAppReady(e:Msg91WhatsAppConfig){
 return Boolean(e.MSG91_WHATSAPP_TEMPLATE_APPROVED!=='false' && e.MSG91_AUTH_KEY?.trim() && /^\d{8,15}$/.test(e.MSG91_WHATSAPP_NUMBER??'')
  && /^[a-z0-9_]{1,512}$/.test(e.MSG91_WHATSAPP_TEMPLATE??'')
  && (!e.MSG91_WHATSAPP_NAMESPACE || /^[A-Za-z0-9_-]{1,200}$/.test(e.MSG91_WHATSAPP_NAMESPACE))
  && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(e.MSG91_WHATSAPP_LANGUAGE??''));
}
export async function sendMsg91WhatsAppOtp(e:Msg91WhatsAppConfig,phone:string,code:string,send:typeof fetch=fetch){
 if(!msg91WhatsAppReady(e))throw Error('WhatsApp sign-in is being connected. Please try again later.');
 if(!/^\+\d{8,15}$/.test(phone)||!/^\d{6}$/.test(code))throw Error('Invalid verification request.');
 const response=await send('https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
  headers:{authkey:e.MSG91_AUTH_KEY!.trim(),'Content-Type':'application/json',accept:'application/json'},
  body:JSON.stringify({integrated_number:e.MSG91_WHATSAPP_NUMBER,content_type:'template',payload:{
   messaging_product:'whatsapp',type:'template',template:{name:e.MSG91_WHATSAPP_TEMPLATE,
    language:{code:e.MSG91_WHATSAPP_LANGUAGE,policy:'deterministic'},namespace:e.MSG91_WHATSAPP_NAMESPACE||null,
    to_and_components:[{to:[phone.slice(1)],components:{body_1:{type:'text',value:code},button_1:{subtype:'url',type:'text',value:code}}}],
   },
  }}),
 });
 const result=await response.json().catch(()=>null) as any;
 if(!response.ok||result?.status!=='success'||result?.hasError===true||result?.errors||typeof result?.request_id!=='string'||!result.request_id){
  // Never return the provider payload: it can contain credentials or message contents.
  throw Error('WhatsApp could not accept the verification message.');
 }
}

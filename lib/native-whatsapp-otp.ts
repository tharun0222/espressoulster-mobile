type OtpEvent={requestId?:string;type?:string;code?:string};
type NativeWindow=Window&{espressoWhatsAppAutofill?:boolean};

/** Only the Android shell implements this origin-checked prompt protocol. */
export function startWhatsAppAutofill(onCode:(code:string)=>void){
 if(typeof window==='undefined'||!(window as NativeWindow).espressoWhatsAppAutofill){
  return {ready:Promise.resolve(),stop:()=>{}};
 }
 const requestId=crypto.randomUUID();
 let stopped=false,resolveReady:()=>void=()=>{};
 const ready=new Promise<void>(resolve=>{resolveReady=resolve;});
 const timer=window.setTimeout(()=>stop(),25000);
 function receive(event:Event){
  const detail=(event as CustomEvent<OtpEvent>).detail;
  if(stopped||detail?.requestId!==requestId)return;
  if(detail.type==='ready'){window.clearTimeout(timer);resolveReady();}
  if(detail.type==='code'&&typeof detail.code==='string'&&/^\d{6}$/.test(detail.code)){
   onCode(detail.code);stop();
  }
 }
 function stop(){
  if(stopped)return;
  stopped=true;window.clearTimeout(timer);
  window.removeEventListener('espresso-whatsapp-otp',receive);
  resolveReady();
  try{window.prompt('espresso:whatsapp:stop',requestId);}catch{/* Paste remains available. */}
 }
 window.addEventListener('espresso-whatsapp-otp',receive);
 try{if(window.prompt('espresso:whatsapp:start',requestId)!=='ready')stop();}catch{stop();}
 return {ready,stop};
}

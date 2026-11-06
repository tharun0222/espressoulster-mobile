/** Coalesce overlapping reads without caching a completed or failed response. */
export function singleFlight<T>(operation:()=>Promise<T>):()=>Promise<T>{
 let current:Promise<T>|null=null;
 return ()=>{
  if(current)return current;
  const request=Promise.resolve().then(operation);
  current=request;
  const clear=()=>{if(current===request)current=null;};
  request.then(clear,clear);
  return request;
 };
}

/** Timeout/cancellation and explicit HTTP errors for customer JSON requests. */
export async function customerJson(path:string,options:{method?:string;data?:unknown;signal?:AbortSignal;timeoutMs?:number}={}):Promise<any>{
 const controller=new AbortController(),cancel=()=>controller.abort();
 if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,options.timeoutMs??12000);
 try{
  const response=await fetch('/api/'+path,{method:options.method||'GET',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},...(options.data===undefined?{}:{body:JSON.stringify(options.data)})});
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('The café is temporarily unavailable. Please try again.');
  const result:any=await response.json();
  if(!response.ok)throw Error(result?.error||'Unable to load the latest information. Please try again.');
  return result;
 }catch(error){
  if(options.signal?.aborted){const cancelled=Error('Request cancelled');cancelled.name='AbortError';throw cancelled;}
  if(controller.signal.aborted)throw Error('The request timed out. Check your connection and try again.');
  throw error;
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}

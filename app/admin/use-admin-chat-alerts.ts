import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../store-app';
import {onLiveUpdate} from '../use-live-updates';

type ChatNotice={orderId:string;orderNumber:string|null;unread:number;latestId:number};
export function useAdminChatAlerts(enabled:boolean){
 const [snapshot,setSnapshot]=useState<{total:number;orders:ChatNotice[]}>({total:0,orders:[]});
 const version=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const current=++version.current;
  const result=await api('admin/chat-unread','GET',undefined,signal);
  if(!signal?.aborted&&current===version.current)setSnapshot(result);
 },[]);
 useEffect(()=>{
  if(!enabled){setSnapshot({total:0,orders:[]});return;}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let running=false;
  async function poll(){
   if(running||controller.signal.aborted)return;
   clearTimeout(timer);running=true;
   try{if(!document.hidden)await refresh(controller.signal);}catch{/* Retry without discarding unread messages. */}
   finally{running=false;if(!controller.signal.aborted)timer=setTimeout(poll,3000);}
  }
  const onVisible=()=>void poll();document.addEventListener('visibilitychange',onVisible);void poll();
  const stopLiveUpdates=onLiveUpdate(['chat'],onVisible);
  return()=>{controller.abort();++version.current;clearTimeout(timer);stopLiveUpdates();document.removeEventListener('visibilitychange',onVisible);};
 },[enabled,refresh]);
 const markRead=useCallback(async(orderId:string,messageId:number)=>{
  if(!enabled)return;
  ++version.current;
  await api('admin/orders/'+encodeURIComponent(orderId)+'/chat/read','POST',{messageId});
  await refresh();
 },[enabled,refresh]);
 return {...snapshot,markRead};
}

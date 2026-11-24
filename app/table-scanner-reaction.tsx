'use client';

import {useEffect,useRef,useState} from 'react';
import {espressoMotion,scannerReaction,type ScanNotice} from '../lib/table-scanner';

type Props={notice:ScanNotice;enabled:boolean;onStart:()=>Promise<void>;onCovered:()=>void;onRestored:()=>Promise<void>};

/** Play only native source frames. Crossfades never deform or reverse the man. */
export default function TableScannerReaction({notice,enabled,onStart,onCovered,onRestored}:Props){
 const video=useRef<HTMLVideoElement>(null);
 const [phase,setPhase]=useState('resting');
 const [reaction,setReaction]=useState('');
 const reactionNotice=enabled&&scannerReaction(notice)?notice:null;
 useEffect(()=>{
  const element=video.current,clip=reactionNotice?scannerReaction(reactionNotice):null;
  if(!element)return;
  let cancelled=false,finished=false,started=false,frame=0,animation:Animation|undefined;
  const abort=new AbortController();
  function stopFrame(){if(frame)element!.cancelVideoFrameCallback(frame);frame=0;}
  async function fade(to:number,duration:number){
   const from=getComputedStyle(element!).opacity;
   if(Math.abs(Number(from)-to)<.001)return !cancelled;
   animation=element!.animate([{opacity:from},{opacity:to}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:duration,fill:'forwards',easing:'ease-out'});
   try{await animation.finished;}catch{return false;}
   if(cancelled)return false;
   element!.style.opacity=String(to);animation.cancel();return true;
  }
  function event(name:'loadedmetadata'|'seeked'){
   return new Promise<boolean>(resolve=>{
    element!.addEventListener(name,()=>resolve(true),{once:true,signal:abort.signal});
    abort.signal.addEventListener('abort',()=>resolve(false),{once:true});
    element!.addEventListener('error',()=>resolve(false),{once:true,signal:abort.signal});
   });
  }
  async function finish(){
   if(finished||cancelled)return;finished=true;stopFrame();element!.pause();setPhase('returning');
   if(await fade(0,120)){await onRestored();if(!cancelled){setPhase('resting');setReaction('');}}
  }
  function progress(time:number){if(clip&&time>=clip.end)void finish();}
  function timeUpdate(){progress(element!.currentTime);}
  function tick(_now:number,metadata:VideoFrameCallbackMetadata){
   if(cancelled||finished)return;progress(metadata.mediaTime);
   if(!finished)frame=element!.requestVideoFrameCallback(tick);
  }
  async function run(){
   if(!(await fade(0,120))||cancelled)return;
   element!.pause();
   if(!clip){await onRestored();if(!cancelled){setPhase('resting');setReaction('');}return;}
   setReaction(reactionNotice!);setPhase('loading');
   if(element!.readyState<1&&!(await event('loadedmetadata')))return;
   if(cancelled)return;
   if(Math.abs(element!.currentTime-clip.start)>.02){const seeked=event('seeked');element!.currentTime=clip.start;if(!(await seeked)||cancelled)return;}
   await onStart();if(cancelled)return;
   try{await element!.play();}catch{if(!cancelled){await onRestored();setPhase('resting');setReaction('');}return;}
   if(cancelled)return;
   started=true;setPhase('playing');
   element!.addEventListener('timeupdate',timeUpdate,{signal:abort.signal});
   if(typeof element!.requestVideoFrameCallback==='function')frame=element!.requestVideoFrameCallback(tick);
   if(await fade(1,180)){
    // Prepare the original resting frame behind the opaque gesture, never in view.
    onCovered();
   }
  }
  function visibility(){
   if(document.hidden)element!.pause();
   else if(started&&!finished&&!cancelled)void element!.play().catch(()=>{void finish();});
  }
  document.addEventListener('visibilitychange',visibility,{signal:abort.signal});
  void run();
  return()=>{
   cancelled=true;abort.abort();stopFrame();
   element.style.opacity=getComputedStyle(element).opacity;
   animation?.cancel();element.pause();
  };
 },[reactionNotice,onStart,onCovered,onRestored]);
 return <video ref={video} className="table-scan-reaction" src={espressoMotion.source} muted playsInline disablePictureInPicture disableRemotePlayback preload="auto" aria-hidden="true" data-reaction={reaction} data-reaction-phase={phase}/>;
}

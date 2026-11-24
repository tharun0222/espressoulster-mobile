'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import TableQrScanner from '../table-qr-scanner';
import './preview.css';

type Scenario='blank'|'wrong'|'valid'|'unavailable'|'permission';
export default function ScannerAssistantPreview(){
 const [scenario,setScenario]=useState<Scenario>('blank'),[run,setRun]=useState(0),[open,setOpen]=useState(true),[table,setTable]=useState(''),[cameraOpens,setCameraOpens]=useState(0);
 const selection=useRef<Scenario>('blank'),pictures=useRef<Record<string,HTMLImageElement>>({});
 useEffect(()=>{selection.current=scenario;},[scenario]);
 useEffect(()=>{
  for(const key of ['correct','wrong','unavailable']){const image=new Image();image.src='/scanner-assistant/preview-'+key+'.png';pictures.current[key]=image;}
 },[]);
 const requestCamera=useCallback(async()=>{
  setCameraOpens(n=>n+1);
  if(selection.current==='permission')throw new DOMException('Permission denied','NotAllowedError');
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const ctx=canvas.getContext('2d')!;const stream=canvas.captureStream(12);
  function draw(){
   if(stream.getVideoTracks().every(t=>t.readyState==='ended'))return;
   ctx.fillStyle='#d1e2ed';ctx.fillRect(0,0,640,480);
   const key=selection.current==='valid'?'correct':selection.current;
   const image=pictures.current[key];
   if(image?.complete&&image.naturalWidth)ctx.drawImage(image,180,100,280,280);
   requestAnimationFrame(draw);
  }
  draw();return stream;
 },[]);
 const verify=useCallback((value:string,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>value==='T06'?reject(Error('This table is unavailable.')):resolve(),450);
  signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});
 }),[]);
 function replay(){setCameraOpens(0);setOpen(true);setTable('');setRun(n=>n+1);}
 function chooseScenario(next:Scenario){setScenario(next);if(next==='permission'){setCameraOpens(0);setOpen(true);setTable('');setRun(n=>n+1);}}
 return <main className="scanner-review" data-camera-opens={cameraOpens}>
  <div className="scanner-review-device">
   {open?<TableQrScanner key={run} cameraProvider={requestCamera} onVerifyTable={verify} onOpenTable={value=>{setTable(value);setOpen(false);}} onClose={()=>setOpen(false)}/>:<div className="scanner-review-finish">{table?<><Check size={35}/><h1>Table {table} verified</h1><p>The customer app opens the dine-in menu here.</p></>:<p>Scanner closed.</p>}<button type="button" onClick={replay}>Replay introduction</button></div>}
  </div>
  <div className="scanner-review-controls"><label>Preview QR result<select aria-label="Preview QR result" value={scenario} onChange={event=>chooseScenario(event.target.value as Scenario)}><option value="blank">No QR yet</option><option value="wrong">Wrong QR</option><option value="unavailable">Table unavailable</option><option value="permission">Camera permission denied</option><option value="valid">Correct café QR · T07</option></select></label><button type="button" onClick={replay}>Replay introduction</button></div>
  <p className="scanner-review-note">Interactive preview · no camera recording, bookings or orders.</p>
 </main>;
}

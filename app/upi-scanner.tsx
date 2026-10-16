'use client';
import {useEffect,useRef,useState} from 'react';
import jsQR from 'jsqr';
import {parseUpiQr} from '../lib/upi-qr';
export default function UpiScanner(){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),frame=useRef(0),starting=useRef(false),generation=useRef(0);
 const [scanning,setScanning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<ReturnType<typeof parseUpiQr>|null>(null);
 function stop(){generation.current++;cancelAnimationFrame(frame.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;setScanning(false);}
 useEffect(()=>()=>{generation.current++;cancelAnimationFrame(frame.current);stream.current?.getTracks().forEach(t=>t.stop());},[]);
 async function start(){if(starting.current)return;starting.current=true;setBusy(true);stop();const id=generation.current;setError('');setResult(null);
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning needs HTTPS and a supported browser.');
  const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(id!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
  stream.current=media;video.current!.srcObject=media;await video.current!.play();setScanning(true);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let last=0;
  function scan(time:number){if(id!==generation.current)return;const v=video.current;
   if(v&&ctx&&v.readyState>=2&&time-last>180){last=time;canvas.width=Math.min(v.videoWidth,640);canvas.height=Math.round(v.videoHeight*canvas.width/v.videoWidth);ctx.drawImage(v,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height),qr=jsQR(image.data,image.width,image.height,{inversionAttempts:'attemptBoth'});
    if(qr){try{setResult(parseUpiQr(qr.data));setError('');stop();return;}catch{setError('That QR is not a valid UPI payment code. Try another.');}}
   }frame.current=requestAnimationFrame(scan);
  }frame.current=requestAnimationFrame(scan);
 }catch(e){stop();setError((e as Error).name==='NotAllowedError'?'Camera access was denied. Allow camera access in your browser settings and try again.':(e as Error).message);}finally{starting.current=false;setBusy(false);}
 }
 return <section className="upi-scanner"><h2>Scan & pay</h2><p>Scan the café’s UPI QR code, check the recipient, then choose your UPI app.</p><video ref={video} muted playsInline className={scanning?'scanner-camera active':'scanner-camera'} aria-label="QR scanner camera"/>{scanning&&<p role="status">Point your camera at the QR code.</p>}{error&&<p role="alert" className="phone-error">{error}</p>}
 {result&&<div className="upi-scan-result"><h3>Check payment details</h3><strong>{result.name}</strong><p>{result.pa}</p><p>{result.amount?'Amount: ₹'+Number(result.amount).toFixed(2):'Enter the amount in your UPI app.'}</p><a className="primary wide" href={result.href}>Choose UPI app & pay</a><p className="fine-print">Your phone opens its UPI app chooser or default UPI app. Check the recipient and amount before confirming payment. A UPI app must be installed.</p></div>}
 <button className="secondary" onClick={scanning?stop:start} disabled={busy}>{busy?'Opening camera…':scanning?'Stop scanner':result?'Scan another QR':'Open scanner'}</button><p className="fine-print">Scanning does not confirm payment or update an order. Show your payment reference to café staff for verification.</p></section>;
}

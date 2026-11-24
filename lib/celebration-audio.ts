// Local audio only: no external audio or tracking requests.
let paymentAudio:HTMLAudioElement|null=null;
let welcomeAudio:HTMLAudioElement|null=null;
let context:AudioContext|null=null;
export function unlockCelebrationAudio(){
 try {
  context??=new AudioContext();
  if(context.state!=='running')void context.resume().catch(()=>{});
  return context;
 } catch { return null; }
}
export function celebrationSound(kind:'welcome'|'order'|'payment'){
 try{
  if(kind==='welcome'){
   welcomeAudio??=new Audio('/audio/welcome-velvet.wav');
   welcomeAudio.currentTime=0;
   welcomeAudio.volume=1; // Soft volume is already set in the selected audio file.
   void welcomeAudio.play().catch(()=>{});
   return true;
  }
  if(kind==='payment'){
   paymentAudio??=new Audio('/audio/payment-success-airy.wav');
   paymentAudio.currentTime=0;
   paymentAudio.volume=1; // The selected preview already has a soft -20 dBFS peak.
   void paymentAudio.play().catch(()=>{});
   return true;
  }
  if(!context||context.state!=='running')return false;
  const notes=[523.25,659.25,783.99,1046.5];
  notes.forEach((frequency,i)=>{const oscillator=context!.createOscillator(),gain=context!.createGain(),start=context!.currentTime+i*.12;
   oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.08,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.38);oscillator.connect(gain);gain.connect(context!.destination);oscillator.start(start);oscillator.stop(start+.4);
  });return true;
 }catch{return false;}
}
export function welcomeSound(){
 celebrationSound('welcome');
}

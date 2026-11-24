'use client';

export default function GlobalError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <html lang="en"><body style={{margin:0,background:'#bed3e3',color:'#19374d',fontFamily:'system-ui,sans-serif'}}>
  <main style={{minHeight:'100svh',display:'grid',placeContent:'center',padding:24,textAlign:'center'}}>
   <p>ESPRESSOULSTER COFFEE</p>
   <h1>Let’s try that again.</h1>
   <p>We couldn’t open the app. Please try again.</p>
   <button type="button" onClick={reset} style={{minHeight:48,border:0,borderRadius:16,background:'#284d69',color:'#fff',font:'inherit'}}>Try again</button>
  </main>
 </body></html>;
}

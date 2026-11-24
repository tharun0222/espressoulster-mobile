'use client';

export default function AppError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="phone-welcome pin-welcome">
  <div className="phone-brand">Espressoulster<span>COFFEE</span></div>
  <section className="phone-welcome-card" aria-labelledby="app-error-title">
   <h1 id="app-error-title">Let’s try that again.</h1>
   <p>We couldn’t open this page. Please try again.</p>
   <button type="button" className="primary wide" onClick={reset}>Try again</button>
  </section>
 </main>;
}

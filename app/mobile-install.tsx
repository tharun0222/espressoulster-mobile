"use client";
import { useEffect, useState } from 'react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome:string}> };
export default function MobileInstall() {
 const [prompt, setPrompt] = useState<InstallEvent|null>(null);
 const [installed, setInstalled] = useState(false);
 const [help, setHelp] = useState(false);
 useEffect(() => {
  const standalone = window.matchMedia('(display-mode: standalone)');
  setInstalled(standalone.matches);
  const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
  const complete = () => { setInstalled(true); setPrompt(null); setHelp(false); };
  window.addEventListener('beforeinstallprompt', ready);
  window.addEventListener('appinstalled', complete);
  return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', complete); };
 }, []);
 if(installed)return null;
 return <section className="mobile-install" aria-label="Install the mobile app"><div><strong>Your coffee, one tap away.</strong><p>Keep Espressoulster on your home screen.</p></div><button className="primary" onClick={async () => { if(!prompt){setHelp(!help);return;} try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); } catch { setHelp(true); } }}>Install app</button>{help && <p role="status">On Android, open the café in Chrome and choose its menu → Add to Home screen → Install. On iPhone, use Safari → Share → Add to Home Screen. Installation requires HTTPS or localhost; your browser decides when installation is available.</p>}</section>;
}

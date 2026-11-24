'use client';
import {useEffect} from 'react';
import {appearanceKey} from '../lib/appearance';

export function ThemeProvider({children}:{children:React.ReactNode}) {
 useEffect(() => {
  const applyDark = () => {
   document.documentElement.dataset.theme = 'dark';
   try { localStorage.setItem(appearanceKey, 'dark'); } catch {}
  };
  applyDark();
  const sync = (event:StorageEvent) => { if (event.key === appearanceKey) applyDark(); };
  window.addEventListener('storage', sync);
  return () => window.removeEventListener('storage', sync);
 }, []);
 return children;
}

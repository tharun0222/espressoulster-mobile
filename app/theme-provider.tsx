'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {appearanceKey as key} from '../lib/appearance';

type Theme='light'|'dark';
const ThemeContext=createContext<{theme:Theme;setTheme:(theme:Theme)=>void}>({theme:'light',setTheme:()=>{}});

export function ThemeProvider({children}:{children:React.ReactNode}){
 const [theme,setCurrent]=useState<Theme>('light');
 useEffect(()=>{
  setCurrent(document.documentElement.dataset.theme==='dark'?'dark':'light');
  const sync=(event:StorageEvent)=>{if(event.key===key){const value=event.newValue==='dark'?'dark':'light';document.documentElement.dataset.theme=value;setCurrent(value)}};
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 function setTheme(value:Theme){document.documentElement.dataset.theme=value;setCurrent(value);try{localStorage.setItem(key,value)}catch{}}
 return <ThemeContext.Provider value={{theme,setTheme}}>{children}<ThemeToggle entry/></ThemeContext.Provider>;
}
export function ThemeToggle({entry=false}:{entry?:boolean}){
 const {theme,setTheme}=useContext(ThemeContext),dark=theme==='dark';
 return <button type="button" className={entry?'entry-theme-toggle':'icon-button appearance-toggle'} aria-label={'Switch to '+(dark?'light':'dark')+' mode'} title={'Switch to '+(dark?'light':'dark')+' mode'} onClick={()=>setTheme(dark?'light':'dark')}>{dark?<Sun size={20}/>:<Moon size={20}/>}</button>;
}
export function ThemeSettings(){
 const {theme,setTheme}=useContext(ThemeContext);
 return <section className="appearance-settings" aria-label="Appearance"><h2>Appearance</h2><div role="group" aria-label="Colour theme"><button type="button" aria-pressed={theme==='light'} onClick={()=>setTheme('light')}><Sun size={18}/>Light</button><button type="button" aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}><Moon size={18}/>Dark</button></div></section>;
}

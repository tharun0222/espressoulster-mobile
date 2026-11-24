'use client';
import {useEffect,useState} from 'react';
import {Gift,MapPin,Star,Users,RefreshCw} from 'lucide-react';
type Props={view:string;settings:any;onNavigate:(route:string)=>void};
export function ClubShortcuts({onNavigate}: {onNavigate: Props['onNavigate']}) {
  const shortcuts = [
    {id: 'offers', name: 'Offers', Icon: Gift},
    {id: 'cafes', name: 'Our café', Icon: MapPin},
    {id: 'rewards', name: 'Rewards & Gifts', Icon: Star},
  ];

  return (
    <section className="club-shortcuts" style={{gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'}} aria-label="Explore your coffee benefits">
      {shortcuts.map(({id, name, Icon}) => (
        <button key={id} type="button" onClick={() => onNavigate(id)}>
          <Icon size={22} aria-hidden="true" />
          <span>{name}</span>
        </button>
      ))}
    </section>
  );
}
export default function CoffeeClub({view,settings,onNavigate}:Props){const [data,setData]=useState<any>(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);async function load(){setError('');try{const r=await fetch('/api/club',{cache:'no-store'}),b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to load your account');setData(b)}catch(e){setError((e as Error).message)}}useEffect(()=>{load()},[]);const titles:any={offers:'Offers for you',referrals:'Share a coffee',birthday:'Your birthday treat'};return <section className="coffee-club"><span className="eyebrow">ESPRESSOULSTER</span><h1>{titles[view]||'Your coffee club'}</h1>{error&&<p role="alert">{error}<button onClick={load}><RefreshCw size={16}/> Retry</button></p>}{view==='offers'&&<>{(settings.offers||[]).filter((o:any)=>o.enabled&&(!o.expires||o.expires>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))).map((o:any)=><article className="club-offer" key={o.code}><Gift/><h2>{o.title||o.code}</h2><p>{o.type==='percent'?`${o.value/100}% off`:`₹${o.value/100} off`}{o.minimum?` · Minimum order ₹${o.minimum/100}`:''}</p><code>{o.code}</code><button className="secondary" onClick={()=>navigator.clipboard.writeText(o.code).then(()=>setCopied(true)).catch(()=>setError('Select and copy the code shown above.'))}>{copied?'Copied':'Copy code'}</button>{o.expires&&<small>Valid until {o.expires}</small>}</article>)}{!(settings.offers||[]).some((o:any)=>o.enabled)&&<p>No active offers right now. Check back soon.</p>}<button className="primary wide" onClick={()=>onNavigate('menu')}>Explore menu</button></>}{view==='referrals'&&<article className="club-offer"><Users size={28}/><h2>Coffee tastes better together</h2><p>Invite a friend to Espressoulster.</p>{data?.referralCode&&<><code>{data.referralCode}</code><button className="primary wide" onClick={async()=>{const url=location.origin+'/?ref='+encodeURIComponent(data.referralCode);try{if(navigator.share)await navigator.share({title:'Espressoulster Coffee',text:'Join me for a coffee at Espressoulster',url});else{await navigator.clipboard.writeText(url);setCopied(true)}}catch(e){if((e as Error).name!=='AbortError')setError('Unable to share. Please try again.')}}}>{copied?'Invite link copied':'Share invitation'}</button></>}<p>Referral rewards are not active yet; sharing does not grant discounts.</p></article>}{view==='birthday'&&<article className="club-offer"><Gift size={28}/><h2>Your birthday, your coffee</h2><p>{data?.birthday?`Birthday on your account: ${data.birthday}`:'Add your birthday in your profile.'}</p><p>Birthday rewards will appear when the café activates this benefit.</p><button className="secondary wide" onClick={()=>onNavigate('profile')}>View profile</button></article>}</section>}

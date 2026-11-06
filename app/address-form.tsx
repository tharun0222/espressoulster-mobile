'use client';
import {useState} from 'react';
export default function AddressForm({request,onSaved}:{request:(path:string,method:string,body:any)=>Promise<any>;onSaved:(address:any)=>void}){
 const [label,setLabel]=useState('Home'),[address,setAddress]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 return <form className="form-card address-entry-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const saved=await request('addresses','POST',{label,address,location:null});onSaved(saved);setAddress('');setMessage('Address saved.');}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
  <h2>Add an address</h2>
  <label>Label<input name="label" required maxLength={50} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Home, work…"/></label>
  <label>Full address<textarea name="address" required maxLength={1000} autoComplete="street-address" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Building or flat, street, area, city and PIN code"/></label>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="phone-error">{error}</p>}
  <button className="primary" disabled={busy}>{busy?'Saving…':'Save address'}</button>
 </form>;
}

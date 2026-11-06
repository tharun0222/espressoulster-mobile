'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '../store-app';

export default function SubscriptionRedemptionForm({onRedeemed}:{onRedeemed:()=>void}){
 const [products,setProducts]=useState<any[]>([]),[productId,setProductId]=useState('');
 const [loadingProducts,setLoadingProducts]=useState(true),[productError,setProductError]=useState('');
 const productRequest=useRef(0);
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 async function loadProducts(){
  const request=++productRequest.current;
  setLoadingProducts(true);setProductError('');
  try{
   const response=await api('admin/subscription-plans');
   if(request!==productRequest.current)return;
   const items=response.products||[];
   setProducts(items);
   setProductId(current=>items.some((item:any)=>item.id===current)?current:'');
  }catch(error){
   if(request!==productRequest.current)return;
   setProducts([]);setProductId('');setProductError((error as Error).message);
  }finally{
   if(request===productRequest.current)setLoadingProducts(false);
  }
 }
 useEffect(()=>{void loadProducts();return()=>{productRequest.current++}},[]);
 return <section className="admin-panel">
  <h2>Redeem daily subscription item</h2>
  <p>Ask the customer to show today’s in-app code. One code redeems one included item, once per India-calendar day.</p>
  {loadingProducts&&<p role="status">Loading redemption items…</p>}
  {productError&&<div className="phone-error" role="alert"><p>Unable to load redemption items. {productError}</p><button type="button" className="secondary" disabled={busy||loadingProducts} onClick={()=>void loadProducts()}>Retry loading items</button></div>}
  <form onSubmit={async e=>{
   e.preventDefault();if(busy||loadingProducts||productError)return;
   setBusy(true);setError('');setResult(null);
   try{
    const response=await api('admin/subscriptions/redeem','POST',{phone,code,productId});
    setResult(response);setCode('');onRedeemed();
   }catch(error){setError((error as Error).message)}finally{setBusy(false)}
  }}>
   <label>Customer mobile number<input type="tel" required inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}" placeholder="10-digit mobile number" value={phone} disabled={busy} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}/></label>
   <label>Customer’s daily code<input required inputMode="numeric" maxLength={6} minLength={6} pattern="[0-9]{6}" placeholder="Six-digit code" value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
   <label>Item being redeemed<select value={productId} disabled={busy||loadingProducts||!!productError} onChange={e=>setProductId(e.target.value)}><option value="">Coffee selection (legacy coffee plans)</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
   <p className="fine-print">For menu-item plans, choose one of the items shown on the customer’s daily code. The server checks eligibility.</p>
   {error&&<p className="phone-error" role="alert">{error}</p>}
   {result&&<p role="status">✓ {result.message}<br/>Test receipt: {result.receipt}</p>}
   <button className="primary" disabled={busy||loadingProducts||!!productError}>{busy?'Verifying…':'Verify code & redeem 1 test item'}</button>
  </form>
  <p className="fine-print">Sandbox only. Deducts one test credit and creates a zero-value test receipt. No actual POS bill, payment or Petpooja record is changed.</p>
 </section>;
}

'use client';
import SubscriptionPlanCard from '../subscription-plan-card';
import SearchField from '../search-field';
import {useEffect,useRef,useState} from 'react';
import {api,ProductImage} from '../store-app';
import {subscriptionBannerInk} from '../../lib/subscription-catalog';

type PickerItem = { id: string; name: string };

function SubscriptionItemPicker({ products, itemIds, search, onSearch, onChange }: {
 products: PickerItem[];
 itemIds: string[];
 search: string;
 onSearch: (value: string) => void;
 onChange: (ids: string[]) => void;
}) {
 const selected = new Set(itemIds);
 const term = search.trim().toLowerCase();
 const visible = products.filter(product => product.name.toLowerCase().includes(term));
 return (
  <fieldset className="plan-menu-picker">
   <legend>Included menu items</legend>
   <SearchField label="Search included menu items" placeholder="Search menu items" value={search} onChange={onSearch} />
   <div className="plan-menu-items">
    {visible.map(product => (
     <label className="plan-menu-item" key={product.id}>
      <span className="plan-menu-thumbnail" aria-hidden="true"><ProductImage product={product} /></span>
      <span className="plan-menu-item-name">{product.name}</span>
      <input type="checkbox" checked={selected.has(product.id)} onChange={event => onChange(
       event.target.checked ? [...itemIds, product.id] : itemIds.filter(id => id !== product.id)
      )} />
     </label>
    ))}
    {!visible.length && <p className="fine-print">No menu items match your search.</p>}
   </div>
   <small className="plan-menu-count" role="status">{itemIds.length} selected</small>
  </fieldset>
 );
}
export default function SubscriptionPlanManager({refreshVersion=0,checkoutEnabled}:{refreshVersion?:number;checkoutEnabled:boolean}){
 const [plans,setPlans]=useState<any[]>([]),[products,setProducts]=useState<any[]>([]),[search,setSearch]=useState(''),[draft,setDraft]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[removed,setRemoved]=useState(false);
 const loadRequest=useRef(0);
 const [reviewedDraft,setReviewedDraft]=useState<any>(null),[previewImage,setPreviewImage]=useState('');
 const reviewSummary=useRef<HTMLDivElement>(null);
 const pendingImage:File|undefined=draft?.pendingImage;
 const reviewed=draft!==null&&reviewedDraft===draft;
 const selectedItems=(draft?.itemIds||[]).flatMap((id:string)=>products.filter(product=>product.id===id));
 const missingSelection=draft?.itemScope==='menu'&&selectedItems.length===0;
 const displayBanner={...draft?.banner,...(pendingImage?{image:previewImage}:{})};
 useEffect(()=>{
  if(!pendingImage){setPreviewImage('');return}
  const url=URL.createObjectURL(pendingImage);
  setPreviewImage(url);
  return()=>URL.revokeObjectURL(url);
 },[pendingImage]);
 useEffect(()=>{if(reviewed)reviewSummary.current?.focus()},[reviewed]);
 function changeMenu(itemScope:string,itemIds:string[]){
  setDraft({...draft,itemScope,itemIds,pendingImage:undefined,banner:{...draft.banner,image:''}});
 }
async function load(){const request=++loadRequest.current;setError('');try{const data=await api('admin/subscription-plans');if(request!==loadRequest.current)return;setPlans(data.plans);setProducts(data.products||[]);setLoaded(true)}catch(e){if(request===loadRequest.current)setError((e as Error).message)}}useEffect(()=>{void load();return()=>{loadRequest.current++}},[refreshVersion]);
 async function save(e:React.FormEvent){
  e.preventDefault();
  if(busy||missingSelection)return;
  if(!reviewed){setReviewedDraft(draft);return}
  setBusy(true);setError('');setNotice('');
  try{
   const {pendingImage:replacement,...plan}=draft;
   let banner=plan.banner;
   if(replacement){
    const result=await api('admin/upload','POST',replacement);
    banner={...banner,image:result.url};
    // Keep the verified upload on the draft if publishing the plan fails.
    const uploadedDraft={...plan,banner};
    setDraft(uploadedDraft);
    setReviewedDraft(uploadedDraft);
   }
   await api('admin/subscription-plans',plan.id?'PUT':'POST',{...plan,banner,amount:Math.round(Number(plan.price)*100),credits:Number(plan.credits),days:Number(plan.days)});
   setDraft(null);setReviewedDraft(null);
   setNotice(plan.enabled?'Plan and banner published to the mobile Subscriptions page.':'Plan and banner saved. The plan is hidden from the mobile Subscriptions page.');
   await load();
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="admin-panel subscription-plan-manager"><h2>Subscription plans</h2><p>Manage the plans listed in the mobile app. Existing passes keep their original credits and expiry.</p><p className="fine-print">{checkoutEnabled ? 'Each item uses a separate redemption code. Stripe sandbox payments only.' : 'Online subscription purchases are currently unavailable.'}</p>{error&&<p role="alert" className="error-banner">{error}</p>}{notice&&<p role="status">{notice}</p>}<div className="admin-ad-actions"><button className="primary" disabled={busy} onClick={()=>{setError('');setNotice('');setDraft({name:'',price:'',credits:30,days:30,enabled:true,itemScope:'menu',itemIds:[]})}}>Add subscription plan</button><button className="secondary" disabled={busy} onClick={load}>Refresh plans</button></div>
 {draft&&<form className="subscription-plan-form" onSubmit={save}><h3>{draft.id?'Edit subscription plan':'New subscription plan'}</h3><fieldset className="subscription-draft-fields" disabled={busy}><label>Plan name<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Included items<select value={draft.itemScope||'coffee'} onChange={e=>changeMenu(e.target.value,draft.itemIds||[])}><option value="coffee">Coffee selection (existing coffee plans)</option><option value="menu">Choose items from the menu</option></select></label>{draft.itemScope==='menu' && <SubscriptionItemPicker products={products} itemIds={draft.itemIds||[]} search={search}
  onSearch={setSearch} onChange={ids=>changeMenu('menu', ids)} />}
 <div className="plan-banner-preview"><h4>{reviewed?'Review the mobile banner':'Mobile banner draft'}</h4><article className="subscription-plan subscription-slide-card"><SubscriptionPlanCard plan={{name:draft.name,amount:Math.round(Number(draft.price)*100),credits:Number(draft.credits)||0,days:Number(draft.days)||0,itemScope:draft.itemScope,includedItems:selectedItems,banner:displayBanner}}/></article><p>{missingSelection?'Select a dish to generate a banner from its menu photo.':draft.itemScope==='menu'&&!displayBanner.image?'Uses photos of the first four selected menu items.':'Preview how the banner will look in the mobile app.'} The draft is visible only to you.</p></div><fieldset className="subscription-banner-controls"><legend>Banner appearance</legend><label>Optional replacement image<input key={pendingImage?'replacement':'empty'} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{
  const file=e.target.files?.[0];if(!file)return;
  setError('');
  if(file.size>3*1024*1024){setError('Choose an image no larger than 3 MB.');e.target.value='';return}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Choose a PNG, JPEG or WebP image.');e.target.value='';return}
  setDraft({...draft,pendingImage:file});
 }}/></label>{pendingImage&&<p className="fine-print">Ready to upload when you publish: {pendingImage.name}</p>}{(draft.banner?.image||pendingImage)&&<button type="button" className="secondary" disabled={busy} onClick={()=>setDraft({...draft,pendingImage:undefined,banner:{...draft.banner,image:''}})}>Use menu item images</button>}<label>Credit number color<input type="color" value={draft.banner?.numberColor||subscriptionBannerInk} onInput={e=>setDraft({...draft,banner:{...draft.banner,numberColor:e.currentTarget.value}})} onChange={e=>setDraft({...draft,banner:{...draft.banner,numberColor:e.target.value}})}/></label><label>Banner words color<input type="color" value={draft.banner?.textColor||subscriptionBannerInk} onInput={e=>setDraft({...draft,banner:{...draft.banner,textColor:e.currentTarget.value}})} onChange={e=>setDraft({...draft,banner:{...draft.banner,textColor:e.target.value}})}/></label><label>Credit number color code<input type="text" pattern="#[0-9a-fA-F]{6}" maxLength={7} value={draft.banner?.numberColor||subscriptionBannerInk} onChange={e=>setDraft({...draft,banner:{...draft.banner,numberColor:e.target.value}})}/></label><label>Banner words color code<input type="text" pattern="#[0-9a-fA-F]{6}" maxLength={7} value={draft.banner?.textColor||subscriptionBannerInk} onChange={e=>setDraft({...draft,banner:{...draft.banner,textColor:e.target.value}})}/></label></fieldset><div className="booking-fields"><label>Price (₹)<input type="number" required min="1" max="1000000" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label><label>Number of items / credits<input type="number" required min="1" max="3660" step="1" value={draft.credits} onChange={e=>setDraft({...draft,credits:e.target.value})}/></label><label>Validity (days)<input type="number" required min="1" max="730" step="1" value={draft.days} onChange={e=>setDraft({...draft,days:e.target.value})}/></label></div><label className="plan-enabled"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/> Available to purchase</label></fieldset><div className="admin-ad-actions"><button className="primary" disabled={busy||missingSelection}>{busy?'Saving…':reviewed?(draft.enabled?'Publish plan and banner':'Save hidden plan and banner'):'Review mobile banner'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setDraft(null)}>Cancel</button></div>{reviewed&&<div className="plan-banner-review" tabIndex={-1} ref={reviewSummary}><strong>Ready for review</strong><p>{draft.enabled?'Check the draft above, then publish it to the mobile Subscriptions page.':'Check the draft above. Saving will keep this plan hidden from customers.'}</p></div>}</form>}
 <label className="plan-enabled"><input type="checkbox" checked={removed} onChange={e=>setRemoved(e.target.checked)}/> Show removed plans</label>{!loaded&&!error&&<p>Loading plans…</p>}{loaded&&!plans.some(p=>removed||!p.archived)&&<p>No plans available. Add a subscription plan to get started.</p>}
 <div className="subscription-admin-grid">{plans.filter(p=>removed||!p.archived).map(p=><article className="subscription-admin-card" key={p.id}><SubscriptionPlanCard plan={p}/><span>{p.archived?'Removed from sale':p.enabled?'Available':'Hidden from sale'}</span><div className="admin-ad-actions"><button className="secondary" disabled={busy} onClick={()=>{setError('');setDraft({...p,itemIds:(p.includedItems||[]).map((i:any)=>i.id),price:(p.amount/100).toFixed(2)})}}>{p.archived?'Restore / edit plan':'Edit plan'}</button>{!p.archived&&<button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('admin/subscription-plans','DELETE',{id:p.id,revision:p.revision});setNotice('Plan removed from sale. Purchased passes remain valid.');if(draft?.id===p.id)setDraft(null);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>Remove plan</button>}</div></article>)}</div></section>
}

export const subscriptionBannerInk = '#172738';

export function validateSubscriptionPlan(input:any){
 const name=typeof input.name==='string'?input.name.trim():'';if(name.length<2||name.length>80)throw Error('Enter a plan name between 2 and 80 characters.');
 const amount=Number(input.amount),credits=Number(input.credits),days=Number(input.days);
 if(!Number.isSafeInteger(amount)||amount<100||amount>100000000)throw Error('Price must be between ₹1 and ₹10,00,000.');
 if(!Number.isSafeInteger(credits)||credits<1||credits>3660)throw Error('Item count must be between 1 and 3660.');
 if(!Number.isSafeInteger(days)||days<1||days>730)throw Error('Validity must be between 1 and 730 days.');
 if(typeof input.enabled!=='boolean')throw Error('Choose whether this plan is available.');
 return {name,amount,credits,days,enabled:input.enabled};
}
export function validatePlanItems(scope:unknown,ids:unknown,products:any[]){
 if(scope==='coffee'||scope===undefined)return {itemScope:'coffee',includedItems:[]};
 if(scope!=='menu'||!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'))throw Error('Select at least one included menu item.');
 const includedItems=[...new Set(ids)].map(id=>{const p=products.find(p=>p.id===id&&!p.archived);if(!p)throw Error('A selected menu item is no longer available in the catalog.');return {id:p.id,name:p.name,...(p.categoryId?{categoryId:p.categoryId}:{})}});
 return {itemScope:'menu',includedItems};
}
export async function subscriptionCatalog(d:any,admin=false){const rows=await d.prepare("SELECT id,data FROM settings WHERE id LIKE 'subscription-banner:%'").all();const banners=new Map(rows.results.map((r:any)=>[r.id.slice(20),JSON.parse(r.data)]));return (await d.prepare('SELECT * FROM subscription_catalog'+(admin?'':' WHERE enabled=1 AND archived=0')+' ORDER BY rowid').all()).results.map((p:any)=>({...p,banner:banners.get(p.id)||{},enabled:!!p.enabled,archived:!!p.archived,itemScope:p.item_scope,includedItems:JSON.parse(p.included_items)}));}

export function subscriptionPlanImages(plans:any[],products:any[]){
 const byId=new Map(products.filter(p=>!p.archived).map(p=>[p.id,p]));
 return plans.map(plan=>({...plan,includedItems:(plan.includedItems||[]).map((item:any)=>{
  const product=byId.get(item.id);
  return {...item,categoryId:item.categoryId||product?.categoryId,image:product?.image||null,imageAtlas:!!product?.imageAtlas,imagePosition:product?.imagePosition||'center'};
 })}));
}

export function validateSubscriptionBanner(input:any={}){
 const image=input.image||'';
 if(typeof image!=='string'||image.length>2000||image&&!/^\/(?:api\/images|images)\/[a-zA-Z0-9_./-]+$/.test(image))throw Error('Use an uploaded banner image.');
 const numberColor=input.numberColor||subscriptionBannerInk,textColor=input.textColor||subscriptionBannerInk;
 if(!/^#[0-9a-fA-F]{6}$/.test(numberColor)||!/^#[0-9a-fA-F]{6}$/.test(textColor))throw Error('Choose valid banner text colors.');
 const height=Number(input.height??220),zoom=Number(input.zoom??100),position=Number(input.position??50);
 if(!Number.isInteger(height)||height<140||height>420||!Number.isInteger(zoom)||zoom<100||zoom>180||!Number.isInteger(position)||position<0||position>100)throw Error('Choose valid image size and position.');
 return {image,numberColor,textColor,height,zoom,position};
}

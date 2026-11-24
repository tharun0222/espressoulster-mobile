export type SubscriptionRecord={id:string;planName:string;itemScope?:string;includedItems?:string|{categoryId?:string}[];totalCredits:number;usedCredits:number;amountPaid:number;startsAt:string;expiresAt:string;revoked:boolean};
export function subscriptionSummary(records:SubscriptionRecord[],now=Date.now()){
 const subscriptions=records.map(r=>{
  const start=Date.parse(r.startsAt),end=Date.parse(r.expiresAt);
  if(!Number.isSafeInteger(r.totalCredits)||r.totalCredits<1||!Number.isSafeInteger(r.usedCredits)||r.usedCredits<0||!Number.isSafeInteger(r.amountPaid)||r.amountPaid<0||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Invalid subscription ledger');
  const status=r.revoked?'revoked':r.usedCredits>r.totalCredits?'review':now<start?'upcoming':now>=end?'expired':r.usedCredits===r.totalCredits?'exhausted':'active';
  const remainingCredits=status==='active'?r.totalCredits-r.usedCredits:0;
  return {...r,status,remainingCredits,daysRemaining:status==='active'||status==='exhausted'?Math.ceil((end-now)/86400000):0};
 });
 const current=subscriptions.filter(s=>['active','exhausted'].includes(s.status));
 const totalCredits=current.reduce((n,s)=>n+s.totalCredits,0),usedCredits=current.reduce((n,s)=>n+s.usedCredits,0),remainingCredits=current.reduce((n,s)=>n+s.remainingCredits,0),amountPaid=current.reduce((n,s)=>n+s.amountPaid,0);
 return {subscriptions,summary:{totalCredits,usedCredits,remainingCredits,amountPaid,averagePerCoffee:totalCredits?Math.round(amountPaid/totalCredits):null,progressPercent:totalCredits?Math.round(usedCredits/totalCredits*100):0,nextExpiry:current.filter(s=>s.remainingCredits>0).map(s=>s.expiresAt).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||null,activePlans:current.filter(s=>s.status==='active').length}};
}

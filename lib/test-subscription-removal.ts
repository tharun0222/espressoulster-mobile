// Keep the purchase and redemption ledger; remove only the verified sandbox entitlement.
export async function setQATestPassRemoved(d:any,id:string,removed:boolean){
 const result=await d.prepare(`UPDATE coffee_subscriptions SET revoked=? WHERE id=? AND EXISTS(SELECT 1 FROM payments p WHERE p.id=coffee_subscriptions.payment_id AND p.method IN ('stripe_test','cashfree_test') AND p.verified_by='provider_verified_test') RETURNING id`).bind(removed?1:0,id).first();
 return !!result;
}

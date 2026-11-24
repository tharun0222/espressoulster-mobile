// Removing a sandbox pass also hides its purchase and redemption receipts from normal views.
// Ledger rows remain recoverable by restoring the pass; live payments are never hidden here.
export function visibleSubscriptionOrders(alias='orders'){
 if(!['orders','o'].includes(alias))throw Error('Invalid order alias');
 return `NOT EXISTS(SELECT 1 FROM coffee_subscriptions hidden_pass JOIN payments hidden_payment ON hidden_payment.id=hidden_pass.payment_id WHERE hidden_pass.revoked=1 AND hidden_payment.method IN ('stripe_test','cashfree_test') AND hidden_payment.verified_by='provider_verified_test' AND (hidden_payment.order_id=${alias}.id OR EXISTS(SELECT 1 FROM coffee_redemptions hidden_redemption WHERE hidden_redemption.subscription_id=hidden_pass.id AND hidden_redemption.order_id=${alias}.id)))`;
}

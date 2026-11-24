'use client';

import SubscriptionItemBanner from '../subscription-item-banner';
import {SubscriptionBalance} from '../subscription-tracker';
import {subscriptionSummary} from '../../lib/subscription-calculations';

export default function SubscriberPreview() {
  const now = Date.now();
  const balance = subscriptionSummary([{
    id: 'sample-food-subscription',
    planName: 'Café food pass',
    itemScope: 'menu',
    totalCredits: 8,
    usedCredits: 2,
    amountPaid: 120000,
    startsAt: new Date(now - 86400000).toISOString(),
    expiresAt: new Date(now + 29 * 86400000).toISOString(),
    revoked: false,
  }], now);

  return (
    <div className="app-shell dribbble-theme reel-theme">
      <p role="note" style={{padding:'12px 20px',background:'#f5dfc7',color:'#4e2e20',margin:0}}>
        Sample food subscription · Display preview, not a purchased plan.
      </p>
      <header className="header home-header">
        <div className="header-inner">
          <div className="brand-row"><span className="brand">Espressoulster</span></div>
          <h1 className="greeting">Your subscriptions</h1>
        </div>
      </header>
      <main className="main route-home">
        <div className="home-content">
          <section aria-label="Sample food plan" style={{marginBottom:24}}>
            <h2>Café food pass</h2>
            <SubscriptionItemBanner credits={8} purchasedCount={1} items={[{id:"sample-bagel",name:"The Classic Schmear",image:"/images/menu/items/recipe-the-classic-schmear.webp"}]} />
          </section>
          {balance.subscriptions.map((pass, index) => (
            <SubscriptionBalance key={pass.id} title={pass.planName + ' · ' + (index + 1)} data={subscriptionSummary([pass], now)} />
          ))}
        </div>
      </main>
    </div>
  );
}

"use client";

import SubscriptionPlanManager from "./subscription-plan-manager";
import SubscriptionRedemptionForm from "./subscription-redemption-form";
import SubscriptionAdvertisementManager from "./subscription-advertisement-manager";

export default function AdminSubscriptions({ refreshVersion, checkoutEnabled }: { refreshVersion: number; checkoutEnabled: boolean }) {
  return (
    <div className="admin-subscriptions">
      <SubscriptionAdvertisementManager refreshVersion={refreshVersion} />
      <SubscriptionPlanManager refreshVersion={refreshVersion} checkoutEnabled={checkoutEnabled} />
      {checkoutEnabled && <SubscriptionRedemptionForm />}
    </div>
  );
}

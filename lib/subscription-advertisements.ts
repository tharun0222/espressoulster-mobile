export const subscriptionAdvertisementPrefix = "subscription-advertisement:";

export type SubscriptionAdvertisement = {
  id: string;
  revision: number;
  planId: string;
  image: string;
  title: string;
  copy: string;
  enabled: boolean;
};

export async function readSubscriptionAdvertisements(db: Pick<D1Database, "prepare">) {
  const rows = await db.prepare("SELECT data FROM settings WHERE id LIKE ? ORDER BY rowid DESC")
    .bind(subscriptionAdvertisementPrefix + "%").all<{ data: string }>();
  return rows.results.map(row => JSON.parse(row.data) as SubscriptionAdvertisement);
}

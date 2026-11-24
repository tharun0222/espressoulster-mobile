export const oneRupeePriceRelease = 'one-rupee-20261119';

export async function applyPriceRelease(d: any, release?: string) {
  if (release !== oneRupeePriceRelease) return false;
  const marker = 'price-release:' + release;
  if (await d.prepare('SELECT id FROM settings WHERE id=?').bind(marker).first()) return false;
  const guard = 'NOT EXISTS(SELECT 1 FROM settings WHERE id=?)';
  // Explicit release backfill, separate from schema migrations. Preserve the
  // original catalog prices and never rewrite an existing payment or purchase.
  await d.batch([
    d.prepare(`INSERT OR IGNORE INTO settings(id,data)
      SELECT ?,json_object(
        'products',json((SELECT json_group_array(json_object('id',id,'price',price,'data',data)) FROM products)),
        'passes',json((SELECT json_group_array(json_object('id',id,'amount',amount,'revision',revision)) FROM subscription_catalog)),
        'store',(SELECT data FROM settings WHERE id='store')) WHERE ${guard}`)
      .bind('price-backup:' + release, marker),
    d.prepare(`UPDATE products SET price=100,data=json_remove(json_set(data,'$.price',100,
      '$.variants',json((SELECT json_group_array(json_set(value,'$.price',CASE WHEN json_extract(value,'$.price')>0 THEN 100 ELSE 0 END)) FROM json_each(products.data,'$.variants'))),
      '$.addons',json((SELECT json_group_array(json_set(value,'$.price',CASE WHEN json_extract(value,'$.price')>0 THEN 100 ELSE 0 END)) FROM json_each(products.data,'$.addons')))),
      '$.testPrice','$.previousPrice'),updated_at=CURRENT_TIMESTAMP WHERE ${guard}`).bind(marker),
    d.prepare(`UPDATE subscription_catalog SET amount=100,revision=revision+1 WHERE ${guard}`).bind(marker),
    d.prepare(`UPDATE settings SET data=json_set(data,'$.tableBookingFeePaise',100) WHERE id='store' AND ${guard}`).bind(marker),
    d.prepare("INSERT OR IGNORE INTO settings(id,data) SELECT ?,'applied' WHERE EXISTS(SELECT 1 FROM settings WHERE id='store' AND json_extract(data,'$.tableBookingFeePaise')=100)")
      .bind(marker),
  ]);
  return true;
}

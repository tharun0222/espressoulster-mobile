export async function restorePreviousPrices(d:any){
 const backup=await d.prepare("SELECT id,data FROM settings WHERE id LIKE 'price-backup-%' AND json_valid(data) AND json_type(data)='array' AND EXISTS(SELECT 1 FROM json_each(data) WHERE json_extract(value,'$.price')>100) ORDER BY rowid DESC LIMIT 1").first();
 if(!backup)throw Error('No previous menu price backup was found.');
 const rows=JSON.parse(backup.data),seen=new Set();
 if(!rows.length||rows.some((r:any)=>typeof r.id!=='string'||seen.has(r.id)||!seen.add(r.id)||(r.price!==null&&(!Number.isSafeInteger(r.price)||r.price<0))||
  (r.testPrice!==undefined&&![true,false,0,1].includes(r.testPrice))))throw Error('The saved price backup is invalid. No prices were changed.');
 const safetyBackup='price-restore-backup-'+crypto.randomUUID();
 const result=await d.batch([
  d.prepare("INSERT INTO settings(id,data) SELECT ?,json_group_array(json_object('id',id,'price',price,'testPrice',COALESCE(json_extract(data,'$.testPrice'),0))) FROM products").bind(safetyBackup),
  d.prepare(`UPDATE products SET price=json_extract(entry.value,'$.price'),
    data=CASE WHEN json_type(entry.value,'$.testPrice') IS NULL THEN json_set(products.data,'$.price',json_extract(entry.value,'$.price'))
      ELSE json_set(products.data,'$.price',json_extract(entry.value,'$.price'),'$.testPrice',
        json(CASE WHEN json_extract(entry.value,'$.testPrice') <> 0 THEN 'true' ELSE 'false' END)) END,
    updated_at=CURRENT_TIMESTAMP FROM json_each(?) AS entry WHERE products.id=json_extract(entry.value,'$.id')`).bind(backup.data)
 ]);
 return {ok:true,updated:result[1].meta.changes,restoredFrom:backup.id,safetyBackup};
}

export async function restorePreviousPrices(d:any){
 const backup=await d.prepare("SELECT id,data FROM settings WHERE id LIKE 'price-backup-%' AND json_valid(data) AND json_type(data)='array' AND EXISTS(SELECT 1 FROM json_each(data) WHERE json_extract(value,'$.price')>100) ORDER BY rowid DESC LIMIT 1").first();
 if(!backup)throw Error('No previous menu price backup was found.');
 const rows=JSON.parse(backup.data),seen=new Set();
 if(!rows.length||rows.some((r:any)=>typeof r.id!=='string'||seen.has(r.id)||!seen.add(r.id)||(r.price!==null&&(!Number.isSafeInteger(r.price)||r.price<0))))throw Error('The saved price backup is invalid. No prices were changed.');
 const safetyBackup='price-restore-backup-'+crypto.randomUUID();
 const result=await d.batch([
  d.prepare("INSERT INTO settings(id,data) SELECT ?,json_group_array(json_object('id',id,'price',price)) FROM products").bind(safetyBackup),
  d.prepare("UPDATE products SET price=(SELECT json_extract(value,'$.price') FROM json_each(?) WHERE json_extract(value,'$.id')=products.id),data=json_set(data,'$.price',(SELECT json_extract(value,'$.price') FROM json_each(?) WHERE json_extract(value,'$.id')=products.id)),updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(backup.data,backup.data,backup.data)
 ]);
 return {ok:true,updated:result[1].meta.changes,restoredFrom:backup.id,safetyBackup};
}

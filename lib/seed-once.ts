// Cache only successful initialization, never catalog, stock, prices or user data.
// Weak keys keep separate D1 bindings isolated and let retired bindings be collected.
const initializations=new WeakMap<object,Promise<void>>();
export function ensureSeedOnce(database:object,initialize:()=>Promise<void>):Promise<void>{
 const existing=initializations.get(database);
 if(existing)return existing;
 const initialization=Promise.resolve().then(initialize);
 initializations.set(database,initialization);
 return initialization.catch(error=>{
  if(initializations.get(database)===initialization)initializations.delete(database);
  throw error;
 });
}

// D1 calls belong to the request that started them. Share only the completed
// flag so an aborted request cannot strand other requests on its promise.
const initialized = new WeakSet<object>();

export async function ensureSeedOnce(database: object, initialize: () => Promise<void>): Promise<void> {
  if (initialized.has(database)) return;
  await initialize();
  initialized.add(database);
}

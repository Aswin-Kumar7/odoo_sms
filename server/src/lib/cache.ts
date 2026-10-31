// Small in-process TTL cache for expensive report queries. Money-critical reads (invoice
// detail, outstanding balances, the payment guard) are never cached. Writes that change
// report numbers call invalidateReports(), so the cache never serves stale money for long.

const TTL_MS = 30_000;
const MAX_ENTRIES = 200;
const store = new Map<string, { value: unknown; expires: number }>();

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
  store.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function invalidateReports() {
  store.clear();
}

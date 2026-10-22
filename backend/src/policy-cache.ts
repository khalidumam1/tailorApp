/**
 * Short-lived cache for per-request authorization policy lookups (module
 * access, subscription entitlement).
 *
 * These checks run on every authenticated request but change rarely, and each
 * uncached lookup costs database round trips that dominate latency on
 * high-latency database links. Entries live for POLICY_TTL_MS at most; writes
 * that change policy call the invalidate helpers so their effect is immediate
 * on the instance that served the write. In multi-instance deployments the TTL
 * bounds cross-instance staleness to the same window.
 *
 * The cache is disabled while NODE_ENV=test so the integration suite observes
 * exact database state even when it mutates rows directly.
 */

const POLICY_TTL_MS = 15_000;

interface CacheEntry {
  expiresAt: number;
  promise: Promise<unknown>;
}

const store = new Map<string, CacheEntry>();

function cacheEnabled(): boolean {
  return process.env.NODE_ENV !== 'test';
}

/**
 * Coalesces concurrent misses into one load and reuses the result until the
 * TTL expires. Failed loads are never cached.
 */
export function cachedPolicy<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cacheEnabled()) return load();
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) return existing.promise as Promise<T>;
  const promise = load();
  const entry: CacheEntry = { expiresAt: now + POLICY_TTL_MS, promise };
  store.set(key, entry);
  promise.catch(() => {
    if (store.get(key) === entry) store.delete(key);
  });
  return promise;
}

/** Drops the cached policy entries for one business (modules + entitlement). */
export function invalidateBusinessPolicy(businessId: string): void {
  store.delete(`module-access:${businessId}`);
  store.delete(`billing-entitlement:${businessId}`);
}

/** Drops every cached policy entry (platform-wide settings or plan changes). */
export function invalidateAllPolicy(): void {
  store.clear();
}

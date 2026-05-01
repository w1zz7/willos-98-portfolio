"use client";

/**
 * Client-side stale-while-revalidate cache for /api/markets/chart fetches.
 *
 * Why this exists: clicking a range button (1M → 5Y) triggers a fresh server
 * fetch. The 4-tier failover (Yahoo → CoinGecko → AV → Stooq) can take
 * 200-2000ms on a cold cache, so the user clicks → blank/stale chart →
 * waits → new chart. This cache makes round-trips through ranges instant
 * after the first visit.
 *
 * Pattern:
 *   1. On a fetch, check the in-memory LRU. If we have a fresh entry (<60s),
 *      return it synchronously — no network round-trip.
 *   2. If the entry is stale (>60s) or missing, return what we have (or
 *      null) AND kick off a background fetch that updates the cache.
 *   3. Subscribers register a callback per (symbol, range, interval) key
 *      and get notified when fresh data lands.
 *
 * Key design choices:
 *   - In-memory only (no localStorage): chart payloads can be 50-100 KB and
 *     localStorage stringifies are expensive on the main thread. We accept
 *     re-fetching on tab close — the server's 30s cache makes this cheap.
 *   - LRU bound at 32 entries — an active willBB session uses ~4-8 keys
 *     (symbol × range combinations); 32 covers symbol-flips during the day.
 *   - Stale window = 60s. Range buttons that already pass `?bypass=1`
 *     (manual refresh / user-initiated) bypass the cache entirely.
 */

export interface CachedChartPayload {
  symbol: string;
  range: string;
  interval: string;
  points: Array<{
    t: number;
    o: number | null;
    h: number | null;
    l: number | null;
    c: number;
    v: number | null;
  }>;
  source: string | null;
  shortName?: string | null;
  currency?: string | null;
  exchange?: string | null;
  price?: number | null;
  previousClose?: number | null;
  marketState?: string | null;
}

interface CacheEntry {
  payload: CachedChartPayload;
  fetchedAt: number;
}

const STALE_AFTER_MS = 60_000; // entries older than 60s trigger a background refresh
const MAX_ENTRIES = 32;

// LRU: Map keeps insertion order, so deleting + re-setting moves to end.
const cache = new Map<string, CacheEntry>();

function cacheKey(symbol: string, range: string, interval: string): string {
  return `${symbol.toUpperCase()}|${range}|${interval}`;
}

function touchLRU(key: string, entry: CacheEntry) {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
    else break;
  }
}

/**
 * Synchronous lookup. Returns the cached payload + freshness flag, or null
 * if we have nothing. Does NOT trigger a fetch — pair with `fetchChart()`
 * for the SWR pattern.
 */
export function readChart(
  symbol: string,
  range: string,
  interval: string,
): { payload: CachedChartPayload; fresh: boolean } | null {
  const key = cacheKey(symbol, range, interval);
  const entry = cache.get(key);
  if (!entry) return null;
  // Refresh LRU position on read.
  cache.delete(key);
  cache.set(key, entry);
  return {
    payload: entry.payload,
    fresh: Date.now() - entry.fetchedAt < STALE_AFTER_MS,
  };
}

// Track in-flight requests per key so concurrent callers (Cockpit + StrategyLab
// pulling the same symbol+range simultaneously) share one network round-trip.
const inflight = new Map<string, Promise<CachedChartPayload | null>>();

/**
 * Fetch + cache. If `bypass` is true (e.g. manual refresh), skips the cache
 * and forces a network fetch with `?bypass=1` on the server. If a fetch
 * for the same key is already in flight, returns the in-flight promise.
 *
 * NOTE: we deliberately do NOT pass the caller's AbortSignal to the
 * underlying fetch. Reason: in-flight dedup means multiple callers can
 * share one promise. If we let one caller's abort kill the fetch, every
 * other caller waiting on the same key gets a `null` they didn't ask for.
 * Callers handle their own abort by gating their state-updates on their
 * own `signal.aborted` check. The underlying fetch always runs to
 * completion — server-side cache absorbs the cost.
 *
 * We keep `signal` in the options type so callers can still pass it
 * (forward-compat) — it just isn't used here.
 */
export function fetchChart(
  symbol: string,
  range: string,
  interval: string,
  opts: { bypass?: boolean; signal?: AbortSignal } = {},
): Promise<CachedChartPayload | null> {
  void opts.signal; // intentionally unused — see comment above
  const key = cacheKey(symbol, range, interval);

  // Fresh cache hit → no network at all. Callers (Cockpit, StrategyLab,
  // OpenBB pre-warm) call this without first calling readChart, so without
  // this short-circuit a fresh entry would still trigger a network fetch.
  // Matches the pattern in lib/clientFetchCache.ts.
  if (!opts.bypass) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.fetchedAt < STALE_AFTER_MS) {
      // Refresh LRU position on hit.
      cache.delete(key);
      cache.set(key, entry);
      return Promise.resolve(entry.payload);
    }
  }

  const existing = inflight.get(key);
  if (existing && !opts.bypass) return existing;

  const url = `/api/markets/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}${opts.bypass ? "&bypass=1" : ""}`;
  const promise = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as CachedChartPayload | null;
      if (!data || !Array.isArray(data.points) || data.points.length === 0) return null;
      const entry: CacheEntry = { payload: data, fetchedAt: Date.now() };
      touchLRU(key, entry);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Convenience: fire-and-forget warm-up. Used for hover-prefetch on range
 * buttons — the user hovers a button, we kick off the fetch in the
 * background, so by the time they click, the data is already cached.
 * Skips if we already have a fresh entry.
 */
export function prefetchChart(symbol: string, range: string, interval: string): void {
  const cached = readChart(symbol, range, interval);
  if (cached?.fresh) return;
  // Don't pass an AbortSignal — we want the prefetch to complete even if
  // the user immediately moves the cursor away, so the cache is warm for
  // the eventual click.
  void fetchChart(symbol, range, interval);
}

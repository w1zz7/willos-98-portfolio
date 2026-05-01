"use client";

/**
 * Generic stale-while-revalidate client cache for arbitrary GET fetches.
 *
 * Used by the Discovery panels (Macro, Calendars, Screeners) and anywhere
 * else that needs "fetch once, navigate freely" semantics. Each panel has
 * its own STALE_MS tuned for the data's actual update cadence:
 *   - Macro (yields, CPI, FFR, GDP): 15 min — these are monthly/weekly data
 *   - Calendars (earnings, IPO): 30 min — daily updates at most
 *   - Screeners (gainers, losers): 5 min — intraday but lazy refresh is fine
 *
 * Same module-scoped LRU + in-flight-dedup pattern as `lib/chartCache.ts`.
 * Bounded at 64 entries so a long session doesn't accumulate stale data.
 */

interface Entry<T> {
  data: T;
  at: number;
}

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 64;

function touchLRU<T>(key: string, entry: Entry<T>) {
  cache.delete(key);
  cache.set(key, entry as Entry<unknown>);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
    else break;
  }
}

/**
 * Read + fetch with SWR semantics.
 *
 * Returns a tuple: [synchronous cached value or null, freshFetchPromise].
 * The promise resolves with the freshly-fetched value (or the cached value
 * if the fresh fetch fails / aborts). Use the cached value to render
 * instantly; await the promise to update when fresh data lands.
 *
 * Concurrent calls with the same key share one network round-trip.
 */
export function swrFetch<T>(
  url: string,
  staleMs: number,
  opts: { signal?: AbortSignal; bypass?: boolean } = {},
): { cached: T | null; isFresh: boolean; promise: Promise<T | null> } {
  const key = url;
  const existingEntry = cache.get(key) as Entry<T> | undefined;
  const isFresh = existingEntry != null && Date.now() - existingEntry.at < staleMs;

  // If we have fresh-and-not-bypassed data, no network at all.
  if (existingEntry && isFresh && !opts.bypass) {
    // Refresh LRU position.
    cache.delete(key);
    cache.set(key, existingEntry as Entry<unknown>);
    return {
      cached: existingEntry.data,
      isFresh: true,
      promise: Promise.resolve(existingEntry.data),
    };
  }

  // Issue (or join) a network request. NOTE: we deliberately do NOT pass
  // the caller's AbortSignal — see lib/chartCache.ts for the same rationale.
  // In-flight dedup means multiple callers share one promise; if any one of
  // them aborts, all the others would unfairly see null. Callers gate their
  // state updates via `signal.aborted` instead, and the underlying fetch
  // always runs to completion.
  void opts.signal;
  let promise = inflight.get(key) as Promise<T | null> | undefined;
  if (!promise || opts.bypass) {
    promise = fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        const data = (await r.json()) as T;
        touchLRU<T>(key, { data, at: Date.now() });
        return data;
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, promise as Promise<unknown>);
  }

  return {
    cached: existingEntry?.data ?? null,
    isFresh,
    promise: promise.then((d) => d ?? existingEntry?.data ?? null),
  };
}

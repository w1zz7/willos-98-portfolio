"use client";

/**
 * useLiveQuote — single-symbol real-time quote polling for the willBB
 * Research panels (Studies / Alpha Lab).
 *
 * Mirrors the watchlist polling pattern in OpenBB.tsx (the multi-symbol
 * batch poll) but scoped to one ticker so the Cockpit + StrategyLab
 * symbol headers can show a price that ticks live.
 *
 * Behavior:
 *   - 5s polling cycle by default (matches user preference set in plan)
 *   - Pauses when document.hidden (no point polling a backgrounded tab)
 *   - 0–250ms jitter on the first tick so simultaneous panels don't
 *     fire at the exact same instant (Studies + Alpha Lab both poll the
 *     same symbol; jitter spreads them across the server cache window)
 *   - Per-symbol AbortController; cancels on symbol change + unmount
 *   - Silent failure: on error returns the last successful quote until
 *     the next tick recovers
 *   - Calls /api/markets/quotes?symbols=${symbol} which (for ≤3 symbols)
 *     uses the live-first failover chain: Yahoo → CoinGecko → Stooq → AV → seed
 */

import { useEffect, useRef, useState } from "react";
import type { DataSource } from "@/components/apps/willbb/SourceBadge";

export interface LiveQuote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  marketState: string | null;
  source: DataSource;
  fetchedAt: number;
}

interface QuoteApiResp {
  quotes: {
    symbol: string;
    price: number | null;
    previousClose: number | null;
    changePct: number | null;
    marketState: string | null;
    source: DataSource;
  }[];
  fetchedAt: number;
}

export function useLiveQuote(
  symbol: string | null | undefined,
  intervalMs: number = 5_000
): LiveQuote | null {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset state when the symbol disappears or changes — we don't want
    // a flash of the previous symbol's price while the new fetch is in flight.
    if (!symbol) {
      setQuote(null);
      return;
    }
    // Reset price to null for clearer "loading" state in the consumer
    setQuote((q) => (q && q.symbol === symbol.toUpperCase() ? q : null));

    let cancelled = false;
    const upper = symbol.toUpperCase();

    async function load(): Promise<void> {
      if (cancelled) return;
      // Pause polling when the tab isn't visible — we still keep the
      // interval running so we resume immediately on focus.
      if (typeof document !== "undefined" && document.hidden) return;

      // Fresh AbortController per request so symbol-change can cancel
      // any in-flight request without affecting future ones.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(
          `/api/markets/quotes?symbols=${encodeURIComponent(upper)}`,
          { signal: ctrl.signal, cache: "no-store" }
        );
        if (!res.ok) return; // silent: keep last successful quote
        const data = (await res.json()) as QuoteApiResp;
        const row = data?.quotes?.[0];
        if (!row || row.price == null) return;
        if (cancelled || ctrl.signal.aborted) return;
        setQuote({
          symbol: upper,
          price: row.price,
          previousClose: row.previousClose,
          changePct: row.changePct,
          marketState: row.marketState,
          source: row.source,
          fetchedAt: data.fetchedAt ?? Date.now(),
        });
      } catch (err) {
        // AbortError is expected on symbol change; everything else stays silent.
        if ((err as Error).name !== "AbortError") {
          // Log only the first error per session to avoid console spam.
          if (typeof window !== "undefined" && !(window as unknown as { __ulq_errored?: boolean }).__ulq_errored) {
            (window as unknown as { __ulq_errored?: boolean }).__ulq_errored = true;
            // eslint-disable-next-line no-console
            console.warn("[useLiveQuote] poll failed:", err);
          }
        }
      }
    }

    // Fire the first tick IMMEDIATELY so the live-price dot in the symbol
    // header shows up on the first paint (the 0–250ms jitter that used to
    // live here was meant to spread concurrent panels; the server-side
    // 5s cache absorbs duplicates from the same symbol within ~50ms anyway,
    // so the jitter wasn't buying us much in practice and made the chart
    // feel non-live for the first quarter-second).
    load();
    const intervalTimer = window.setInterval(load, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalTimer);
      abortRef.current?.abort();
    };
  }, [symbol, intervalMs]);

  return quote;
}

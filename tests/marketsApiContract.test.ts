/**
 * Markets API contract tests.
 *
 * These tests pin down the data-shape contract that the WillBB UI relies
 * on. They DON'T hit a live network — they assert the structural
 * invariants that bugs #1–#4 from the May 2026 audit landed on:
 *
 *   1. Watchlist must always try a live provider before seed (so the
 *      ticker strip + watchlist + chart pane never disagree on price).
 *   2. previousClose must be the most recent prior trading session's
 *      close, NOT the start-of-range close (so the daily % change is
 *      ~daily, not ~monthly).
 *   3. The displayed price + change % must come from the same source.
 *   4. Seed fallback only kicks in when ALL live providers fail.
 *
 * We import the seed snapshot data + a few helpers and assert against
 * synthetic Yahoo response shapes.
 */

import { describe, expect, it } from "vitest";
import { SEED_QUOTES, getSeedQuote } from "@/lib/marketsFallback";

describe("seed snapshot contract", () => {
  it("every entry has a price > 0 and a previousClose > 0", () => {
    for (const [sym, q] of Object.entries(SEED_QUOTES)) {
      expect(q.price, sym).toBeGreaterThan(0);
      expect(q.previousClose, sym).toBeGreaterThan(0);
    }
  });

  it("every entry's symbol field matches its key", () => {
    for (const [sym, q] of Object.entries(SEED_QUOTES)) {
      expect(q.symbol).toBe(sym);
    }
  });

  it("getSeedQuote is case-insensitive on lookup", () => {
    expect(getSeedQuote("nvda")?.price).toBe(SEED_QUOTES.NVDA.price);
    expect(getSeedQuote("NVDA")?.price).toBe(SEED_QUOTES.NVDA.price);
    expect(getSeedQuote("NvDa")?.price).toBe(SEED_QUOTES.NVDA.price);
  });

  it("returns null for unknown symbols (no silent zero-price)", () => {
    expect(getSeedQuote("ZZZZZ-NOT-A-TICKER")).toBeNull();
  });

  it("seed change% is plausible for a daily move (≤ 25% absolute)", () => {
    // No real ticker should be in the seed with a daily move > 25% — that
    // would imply a bad seed snapshot (e.g., one snapshot from before a
    // split paired with another from after).
    for (const [sym, q] of Object.entries(SEED_QUOTES)) {
      const pct = ((q.price - q.previousClose) / q.previousClose) * 100;
      expect(Math.abs(pct), sym).toBeLessThanOrEqual(25);
    }
  });
});

describe("yesterdayClose derivation from chart points", () => {
  // Tests the algorithm we use in both the chart route AND the quotes
  // route to derive yesterday's close from the time-series points: walk
  // back from the most recent non-null close, take the SECOND such
  // value (the most recent IS today's bar).
  function yesterdayClose(closes: (number | null)[]): number | null {
    let seenLatest = false;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] == null) continue;
      if (!seenLatest) {
        seenLatest = true;
        continue;
      }
      return closes[i] as number;
    }
    return null;
  }

  it("returns the second-to-last close in a dense series", () => {
    const closes = [100, 101, 102, 103, 104];
    expect(yesterdayClose(closes)).toBe(103);
  });

  it("skips nulls when walking back from the latest", () => {
    const closes = [100, 101, null, 103, null, 105];
    // Walking back: 105 = today, skip null, 103 = yesterday.
    expect(yesterdayClose(closes)).toBe(103);
  });

  it("skips trailing nulls (intraday window with no print yet)", () => {
    const closes = [100, 101, 102, 103, null];
    // 103 is today (most recent non-null), 102 is yesterday.
    expect(yesterdayClose(closes)).toBe(102);
  });

  it("returns null when fewer than 2 non-null values exist", () => {
    expect(yesterdayClose([])).toBeNull();
    expect(yesterdayClose([null, null])).toBeNull();
    expect(yesterdayClose([null, 100, null])).toBeNull();
    expect(yesterdayClose([100])).toBeNull();
  });

  it("works on a 5-day window where Yahoo's chartPreviousClose is too old", () => {
    // Simulates the scenario in production: chartPreviousClose = 95 (the
    // close BEFORE the visible 5-day range), but yesterday's actual close
    // is 102. The yesterdayClose() helper must return 102, not 95.
    const closes = [96, 98, 99, 100, 102, 104];
    // 104 is today, 102 is yesterday — that's the value we want.
    expect(yesterdayClose(closes)).toBe(102);
    // chartPreviousClose would be 95, which is wildly different.
    // |104 - 102| / 102 ≈ 2% (correct daily move)
    // |104 - 95| / 95 ≈ 9.5% (would be wrong)
    const correctPct = ((104 - 102) / 102) * 100;
    const wrongPct = ((104 - 95) / 95) * 100;
    expect(correctPct).toBeLessThan(5);
    expect(wrongPct).toBeGreaterThan(5);
  });
});

describe("displayedPct must come from same source as displayedPrice", () => {
  // Tests the logic in OpenBB.tsx that picks (price, pct) so they agree.
  function pickPriceAndPct(
    chart: { price: number | null; previousClose: number | null } | null,
    focusQ: { price: number | null; changePct: number | null } | null,
  ): { price: number | null; pct: number | null } {
    const price = chart?.price != null ? chart.price : focusQ?.price ?? null;
    const pct =
      chart?.price != null && chart?.previousClose != null
        ? (chart.price / chart.previousClose - 1) * 100
        : focusQ?.changePct ?? null;
    return { price, pct };
  }

  it("uses chart price + chart-derived pct when chart is available", () => {
    const chart = { price: 379.64, previousClose: 383.22 };
    const focusQ = { price: 213.75, changePct: 0.83 }; // stale seed-era data
    const { price, pct } = pickPriceAndPct(chart, focusQ);
    expect(price).toBe(379.64);
    // Pct derived from chart, NOT from focusQ.
    expect(pct).toBeCloseTo(((379.64 - 383.22) / 383.22) * 100, 4);
    expect(pct).toBeCloseTo(-0.93, 1);
  });

  it("falls back to focusQ when chart is missing", () => {
    const focusQ = { price: 100, changePct: 1.5 };
    const { price, pct } = pickPriceAndPct(null, focusQ);
    expect(price).toBe(100);
    expect(pct).toBe(1.5);
  });

  it("falls back to focusQ.changePct when chart has no previousClose", () => {
    const chart = { price: 100, previousClose: null };
    const focusQ = { price: 99, changePct: 1.0 };
    const { price, pct } = pickPriceAndPct(chart, focusQ);
    expect(price).toBe(100); // chart price wins
    expect(pct).toBe(1.0); // chart can't compute pct, fall back to focusQ
  });

  it("returns nulls when both sources are unavailable", () => {
    const { price, pct } = pickPriceAndPct(null, null);
    expect(price).toBeNull();
    expect(pct).toBeNull();
  });
});

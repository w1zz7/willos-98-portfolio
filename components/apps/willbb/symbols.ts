/**
 * Symbol catalog for the WillBB Terminal.
 *
 * INDEX_STRIP powers the top ticker tape. WATCHLIST_ORDER is Will's actual
 * trading-app watchlist (transcribed from his platform, April 2026), in
 * the order he keeps it - most-watched at the top. The Markets pane
 * scrolls so the whole list is reachable.
 */

import { REAL_TRADES } from "@/data/trades";

export interface SymbolMeta {
  symbol: string; // Yahoo Finance symbol (e.g. "^GSPC", "NVDA", "BTC-USD")
  label: string; // friendly label shown in UI
  group?: "index" | "commodity" | "fx" | "crypto" | "equity";
}

export const INDEX_STRIP: SymbolMeta[] = [
  { symbol: "^GSPC", label: "S&P 500", group: "index" },
  { symbol: "^IXIC", label: "Nasdaq", group: "index" },
  { symbol: "^DJI", label: "Dow", group: "index" },
  { symbol: "^RUT", label: "Russell 2K", group: "index" },
  { symbol: "^VIX", label: "VIX", group: "index" },
  { symbol: "CL=F", label: "WTI Oil", group: "commodity" },
  { symbol: "BZ=F", label: "Brent", group: "commodity" },
  { symbol: "GC=F", label: "Gold", group: "commodity" },
  { symbol: "SI=F", label: "Silver", group: "commodity" },
  { symbol: "EURUSD=X", label: "EUR/USD", group: "fx" },
  { symbol: "USDJPY=X", label: "USD/JPY", group: "fx" },
  { symbol: "BTC-USD", label: "Bitcoin", group: "crypto" },
  { symbol: "ETH-USD", label: "Ethereum", group: "crypto" },
];

/**
 * Will's curated watchlist — 40 highest-conviction names.
 *
 * Picked deliberately for three properties:
 *   1. LIQUID — every name is large/mid-cap or a top-volume ETF, so quotes
 *      come back from Yahoo (or seed) without the long tail of unavailable
 *      symbols that used to drag the watchlist poll out to 14 s.
 *   2. SEEDED — every entry has a row in `lib/marketsFallback.ts` SEED_QUOTES
 *      AND most have a row in `lib/equityFallback.ts`/STATS_SEED. So even
 *      with all upstreams down, the Markets pane paints in <50 ms and the
 *      Equity Research tab fills out instead of showing "no data".
 *   3. RELEVANT — Will's actual concentrated bets (GOOG, AMD, PLTR, RDDT,
 *      DASH, ONON, MSTR, TEM, HOOD, BMNR, RKLB) plus the mega-caps that
 *      dominate market discussion, plus thematic exposure (clean energy,
 *      quantum, AI infra, healthcare, fintech) so research demos are rich.
 *
 * Cut from a previous 144-symbol screen because the long tail (small-cap
 * trade-of-the-day names) was bottlenecking every cold-start fetch with
 * symbols that frequently 404'd from Yahoo. 40 well-chosen names is the
 * right size for a screen that's meant to be SCANNED, not scrolled.
 */
export const WATCHLIST_ORDER: string[] = [
  // Mega-cap tech (top 10) — Will's daily focus
  "NVDA", "GOOG", "AAPL", "MSFT", "AMZN",
  "META", "TSLA", "AMD", "AVGO", "ORCL",
  // Tech leaders + AI infra
  "NFLX", "CRM", "ADBE", "CRWV", "NBIS",
  // Will's concentrated bets / high-conviction names
  "PLTR", "RDDT", "DASH", "ONON", "TEM",
  // Fintech / payments / brokerage
  "HOOD", "COIN", "MSTR", "V", "MA",
  // Financials + diversifiers
  "BAC", "AXP", "UNH", "NVO", "HIMS",
  // Clean energy / nuclear / themes
  "SMR", "OKLO", "CEG", "IONQ", "RKLB",
  // ETFs + benchmarks (always work)
  "SPY", "QQQ", "IBIT", "LULU", "CMG",
];

/**
 * Build the watchlist from the canonical screen order. The Markets pane
 * scrolls so every ticker on Will's actual screen is reachable.
 */
export function buildWatchlist(): SymbolMeta[] {
  return WATCHLIST_ORDER.map((symbol) => ({
    symbol,
    label: symbol,
    group: "equity" as const,
  }));
}

/** Realized P&L per ticker, used for the Portfolio tab. */
export interface PortfolioRow {
  symbol: string;
  trades: number;
  proceeds: number;
  basis: number;
  realized: number;
}

export function buildPortfolioRows(): PortfolioRow[] {
  const map = new Map<string, PortfolioRow>();
  for (const t of REAL_TRADES) {
    const sym = t.ticker.toUpperCase();
    const cur =
      map.get(sym) ??
      ({
        symbol: sym,
        trades: 0,
        proceeds: 0,
        basis: 0,
        realized: 0,
      } as PortfolioRow);
    cur.trades += 1;
    cur.proceeds += t.proceeds;
    cur.basis += t.basis;
    cur.realized += t.realized;
    map.set(sym, cur);
  }
  return [...map.values()].sort((a, b) => b.realized - a.realized);
}

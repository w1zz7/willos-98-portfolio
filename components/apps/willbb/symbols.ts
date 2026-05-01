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
 * Will's actual watchlist, top-to-bottom in the order he keeps it.
 * Sourced from his trading-platform screens.
 */
export const WATCHLIST_ORDER: string[] = [
  "GOOG", "UNH", "NVDA", "AMD", "TEM",
  "SPY", "QQQ", "RDDT", "AAPL", "HOOD",
  "DASH", "AMZN", "ONON", "TSLA", "MSTR",
  "META", "BAC", "USO", "MSFT", "TGT",
  "CRM", "SHOP", "CSCO", "INTC", "RXRX",
  "SOFI", "BMNR", "LULU", "DJT", "SBET",
  "BIDU", "NEGG", "SNOW", "BOIL", "CNC",
  "WRD", "PLTR", "CHA", "TLRY", "ETHA",
  "BNC", "QUBT", "BLSH", "JD", "NKE",
  "GRAB", "PSTV", "SENS", "PLUG", "SNAP",
  "UPST", "NUAI", "UP", "FCX", "CAVA",
  "ATCH", "LAC", "IONQ", "ALB", "BTQ",
  "BETR", "ZETA", "TMC", "APLD", "SMR",
  "OSCR", "TTD", "PSKY", "CRML", "DVLT",
  "PYPL", "MP", "CCCX", "OKLO", "WWR",
  "WLAC", "NKLR", "UAMY", "AIRE", "HIMS",
  "FIG", "RR", "QCOM", "NB", "BBAI",
  "CMG", "ONDS", "DUOL", "ORCL", "DKNG",
  "ASST", "CRCL", "CRWV", "VTR", "XPEV",
  "NVO", "BULL", "QQQM", "SPXU", "CLSK",
  "CETX", "CVX", "VLO", "EOSE", "AEHR",
  "CLPT", "PRME", "NIO", "TMDX", "SOUN",
  "PATH", "USAR", "CPXR", "RKLB", "ASTS",
  "SIDU", "RGTI", "DGZ", "JMIA", "CEG",
  "BMNZ", "IREN", "OPEN", "OSS", "IRE",
  "NBIS", "SMCI", "VXX", "IBIT", "NVDG",
  "RGTZ", "CIFR", "MSFU", "SCO", "IREZ",
  "NBIL", "ADBG", "ADBE", "NVOX", "BE",
  "SMCL", "NBIZ", "NOWL", "DAMD",
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

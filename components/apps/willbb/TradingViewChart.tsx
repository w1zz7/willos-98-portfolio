"use client";

/**
 * TradingView-powered chart for the Markets Terminal.
 *
 * Uses the official `tv.js` widget loader (no API key, no signup) so we get
 * TradingView's actual data feed, full toolbar with interval picker + drawing
 * tools + studies (RSI / MACD / Bollinger / etc), and the iconic candlestick
 * UI - all free and embedded under our Win98 chrome.
 *
 * The widget is recreated only when `symbol`, `interval`, or `theme` change;
 * the host element gets a stable id assigned once on mount so we don't
 * thrash TV's iframe creation on parent re-renders.
 */

import { useEffect, useMemo, useRef } from "react";

// Default studies stack: 50-day SMA on the price pane (Will's primary trend
// read), RSI(14) and MACD(12,26,9) below - the three indicators the trading
// strategy actually checks before sizing in.
const DEFAULT_STUDIES = [
  "MASimple@tv-basicstudies",
  "RSI@tv-basicstudies",
  "MACD@tv-basicstudies",
] as const;

interface Props {
  symbol: string; // raw user-style symbol e.g. "NVDA", "BTC-USD", "^GSPC"
  interval?: TVInterval;
  /** Initial visible range - sets the zoom window when the widget mounts. */
  range?: TVRange;
  height?: number | string;
  studies?: readonly string[];
  theme?: "light" | "dark";
}

export type TVInterval = "1" | "3" | "5" | "15" | "30" | "60" | "120" | "240" | "D" | "W" | "M";
export type TVRange = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "12M" | "60M" | "ALL";

// Augment Window with the TradingView global the widget script installs.
declare global {
  interface Window {
    TradingView?: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      widget: new (cfg: Record<string, unknown>) => any;
    };
  }
}

/**
 * Yahoo-symbol → TradingView-symbol translation.
 *
 * Indices (^XXX), futures (XXX=F), and crypto (XXX-USD) need explicit
 * exchange prefixes since their Yahoo notation isn't recognized by TV.
 * For watchlist equities we map every ticker explicitly - TradingView's
 * bare-symbol resolver works for mega-caps but silently fails on
 * leveraged single-stock ETFs, recent IPOs, and obscure SPAC tickers,
 * leaving the user with a blank chart. Exchange prefixes are stable
 * for these names so explicit mapping is safe.
 */
const SYMBOL_MAP: Record<string, string> = {
  // ---------- Indices ----------
  "^GSPC": "SP:SPX",
  "^IXIC": "NASDAQ:IXIC",
  "^DJI": "DJ:DJI",
  "^RUT": "TVC:RUT",
  "^VIX": "TVC:VIX",
  // ---------- Futures (front-month) ----------
  "CL=F": "NYMEX:CL1!",
  "GC=F": "COMEX:GC1!",
  "SI=F": "COMEX:SI1!",
  // ---------- Crypto - Coinbase has cleanest USD pairs ----------
  "BTC-USD": "COINBASE:BTCUSD",
  "ETH-USD": "COINBASE:ETHUSD",
  "SOL-USD": "COINBASE:SOLUSD",
  "DOGE-USD": "BINANCE:DOGEUSDT",

  // ---------- Mega-caps (NASDAQ) ----------
  GOOG: "NASDAQ:GOOG",
  NVDA: "NASDAQ:NVDA",
  AMD: "NASDAQ:AMD",
  AAPL: "NASDAQ:AAPL",
  MSFT: "NASDAQ:MSFT",
  AMZN: "NASDAQ:AMZN",
  TSLA: "NASDAQ:TSLA",
  META: "NASDAQ:META",
  INTC: "NASDAQ:INTC",
  CSCO: "NASDAQ:CSCO",
  ADBE: "NASDAQ:ADBE",
  PYPL: "NASDAQ:PYPL",
  QCOM: "NASDAQ:QCOM",
  PEP: "NASDAQ:PEP",

  // ---------- Major ETFs ----------
  SPY: "AMEX:SPY",
  QQQ: "NASDAQ:QQQ",
  QQQM: "NASDAQ:QQQM",
  VXX: "BATS:VXX",
  USO: "AMEX:USO",
  SCO: "AMEX:SCO",
  SPXU: "AMEX:SPXU",
  DGZ: "AMEX:DGZ",
  BOIL: "AMEX:BOIL",

  // ---------- Crypto-equities & BTC/ETH proxies ----------
  MSTR: "NASDAQ:MSTR",
  IBIT: "NASDAQ:IBIT",
  ETHA: "NASDAQ:ETHA",
  CLSK: "NASDAQ:CLSK",
  CIFR: "NASDAQ:CIFR",
  IREN: "NASDAQ:IREN",
  BMNR: "AMEX:BMNR",

  // ---------- ADRs / foreign listings ----------
  BIDU: "NASDAQ:BIDU",
  JD: "NASDAQ:JD",
  NIO: "NYSE:NIO",
  XPEV: "NYSE:XPEV",
  GRAB: "NASDAQ:GRAB",
  TLRY: "NASDAQ:TLRY",
  CHA: "NYSE:CHA",
  JMIA: "NYSE:JMIA",
  NVO: "NYSE:NVO",

  // ---------- Recent IPOs / popular names ----------
  RDDT: "NYSE:RDDT",
  DJT: "NASDAQ:DJT",
  HOOD: "NASDAQ:HOOD",
  PLTR: "NASDAQ:PLTR",
  SOFI: "NASDAQ:SOFI",
  DASH: "NASDAQ:DASH",
  DUOL: "NASDAQ:DUOL",
  CAVA: "NYSE:CAVA",
  ONON: "NYSE:ONON",
  FIG: "NYSE:FIG",
  CRCL: "NYSE:CRCL",
  CRWV: "NASDAQ:CRWV",
  HIMS: "NYSE:HIMS",
  SBET: "NASDAQ:SBET",
  TEM: "NASDAQ:TEM",
  SNOW: "NYSE:SNOW",
  SHOP: "NYSE:SHOP",
  CRM: "NYSE:CRM",
  ORCL: "NYSE:ORCL",
  DKNG: "NASDAQ:DKNG",
  CMG: "NYSE:CMG",
  TTD: "NASDAQ:TTD",
  LULU: "NASDAQ:LULU",
  NKE: "NYSE:NKE",
  TGT: "NYSE:TGT",
  BAC: "NYSE:BAC",
  CVX: "NYSE:CVX",
  VLO: "NYSE:VLO",
  FCX: "NYSE:FCX",
  ALB: "NYSE:ALB",
  LAC: "NYSE:LAC",
  MP: "NYSE:MP",
  UNH: "NYSE:UNH",
  CEG: "NASDAQ:CEG",
  VTR: "NYSE:VTR",
  PATH: "NYSE:PATH",

  // ---------- Quantum / AI / space / defense ----------
  RGTI: "NASDAQ:RGTI",
  IONQ: "NYSE:IONQ",
  QUBT: "NASDAQ:QUBT",
  BBAI: "NYSE:BBAI",
  RKLB: "NASDAQ:RKLB",
  ASTS: "NASDAQ:ASTS",
  SOUN: "NASDAQ:SOUN",
  TMDX: "NASDAQ:TMDX",
  PRME: "NASDAQ:PRME",
  RXRX: "NASDAQ:RXRX",
  AEHR: "NASDAQ:AEHR",
  EOSE: "NASDAQ:EOSE",
  CLPT: "NASDAQ:CLPT",
  APLD: "NASDAQ:APLD",
  PLUG: "NASDAQ:PLUG",
  UPST: "NASDAQ:UPST",
  SMCI: "NASDAQ:SMCI",
  NBIS: "NASDAQ:NBIS",
  OKLO: "NYSE:OKLO",
  SMR: "NYSE:SMR",
  TMC: "NASDAQ:TMC",
  WWR: "NASDAQ:WWR",
  UAMY: "AMEX:UAMY",

  // NOTE: Leveraged single-stock ETFs (NVDG, MSFU, IREZ, NBIL, DAMD,
  // BMNZ, NOWL, NBIZ, RGTZ, NVOX, ADBG, SMCL) and many recent
  // SPAC/IPO tickers (DAMD, BLSH, BNC, NKLR, etc.) are deliberately
  // unmapped - empirical testing showed forcing NASDAQ: prefixes on
  // unverified symbols makes TV reject them ("Symbol doesn't exist"),
  // whereas bare passthrough lets TV's search resolver try multiple
  // exchanges and surface the correct one when available. If TV has
  // no listing at all, the user sees TV's stock-photo "Symbol doesn't
  // exist" message - the canonical not-charting state, not a regression.
};

function translateSymbol(sym: string): string {
  const k = sym.toUpperCase();
  if (SYMBOL_MAP[k]) return SYMBOL_MAP[k];
  // Fallback for unmapped symbols: TradingView's bare-symbol resolver
  // handles most common US equities (resolves to NASDAQ/NYSE automatically).
  // The terminal's chart-area UI will show TV's "Invalid symbol" if it
  // can't resolve.
  return k;
}

const SCRIPT_SRC = "https://s3.tradingview.com/tv.js";

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${SCRIPT_SRC}"]`
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.TradingView) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("tv.js failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("tv.js failed"));
    document.head.appendChild(s);
  });
}

export default function TradingViewChart({
  symbol,
  interval = "D",
  range,
  height = 380,
  studies,
  theme = "dark",
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widgetRef = useRef<any>(null);
  // Stable id per mount - avoids the "moving target" container_id problem
  // that caused TV's iframe to abort on re-render.
  const containerId = useMemo(
    () => "tv-chart-" + Math.random().toString(36).slice(2, 10),
    []
  );
  // Convert studies array → primitive string so a referentially-new array
  // with the same contents doesn't tear down + rebuild the widget.
  const studiesKey = useMemo(
    () => (studies ?? DEFAULT_STUDIES).join("|"),
    [studies]
  );

  useEffect(() => {
    let cancelled = false;
    const studiesArr = studiesKey.split("|").filter(Boolean);

    // Coalesce rapid prop changes (e.g. user clicks 5D → 1M → 3M → 6M in
    // <200ms). Without this, the iframe rebuilds on every keystroke and
    // TV's internal lifecycle leaks listeners. 80ms settles fast enough
    // that the user perceives an immediate change.
    const buildTimer = window.setTimeout(() => {
      if (cancelled) return;
      loadTradingViewScript()
        .then(() => {
          if (cancelled || !hostRef.current || !window.TradingView) return;
          hostRef.current.innerHTML = "";
          hostRef.current.id = containerId;
          const cfg: Record<string, unknown> = {
            autosize: true,
            symbol: translateSymbol(symbol),
            interval,
            timezone: "America/New_York",
            theme,
            style: "1", // 1 candles · 2 bars · 3 line · 8 area
            locale: "en",
            toolbar_bg: "#212124",
            enable_publishing: false,
            allow_symbol_change: true,
            hide_side_toolbar: false,
            studies: studiesArr,
            container_id: containerId,
            backgroundColor: "#151518",
            gridColor: "#2b3744",
            disabled_features: [
              "use_localstorage_for_settings",
              "header_compare",
              "header_saveload",
            ],
            enabled_features: ["hide_left_toolbar_by_default"],
          };
          // `range` zooms the visible window. Without this, every D-interval
          // selection (1M, 3M, 6M, 1Y) shows the same default zoom and the
          // range buttons appear broken to the user.
          if (range) cfg.range = range;
          widgetRef.current = new window.TradingView.widget(cfg);
        })
        .catch(() => {
          if (cancelled || !hostRef.current) return;
          hostRef.current.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9793b0;font-family:Inter,system-ui,sans-serif;font-size:13px;text-align:center;padding:20px;">
              TradingView script blocked.<br/>Disable your ad blocker for this domain to load the chart.
            </div>`;
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(buildTimer);
      if (widgetRef.current && typeof widgetRef.current.remove === "function") {
        try {
          widgetRef.current.remove();
        } catch {
          /* already torn down */
        }
      }
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, range, theme, studiesKey, containerId]);

  return (
    <div
      ref={hostRef}
      id={containerId}
      style={{
        width: "100%",
        height,
        minHeight: 300,
        background: "#151518",
      }}
    />
  );
}

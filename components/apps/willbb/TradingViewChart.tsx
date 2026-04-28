"use client";

/**
 * TradingView-powered chart for the Markets Terminal.
 *
 * Uses the official `tv.js` widget loader (no API key, no signup) so we get
 * TradingView's actual data feed, full toolbar with interval picker + drawing
 * tools + studies (RSI / MACD / Bollinger / etc), and the iconic candlestick
 * UI — all free and embedded under our Win98 chrome.
 *
 * The widget is recreated only when `symbol`, `interval`, or `theme` change;
 * the host element gets a stable id assigned once on mount so we don't
 * thrash TV's iframe creation on parent re-renders.
 */

import { useEffect, useMemo, useRef } from "react";

// Default studies stack: 50-day SMA on the price pane (Will's primary trend
// read), RSI(14) and MACD(12,26,9) below — the three indicators the trading
// strategy actually checks before sizing in.
const DEFAULT_STUDIES = [
  "MASimple@tv-basicstudies",
  "RSI@tv-basicstudies",
  "MACD@tv-basicstudies",
] as const;

interface Props {
  symbol: string; // raw user-style symbol e.g. "NVDA", "BTC-USD", "^GSPC"
  interval?: TVInterval;
  height?: number | string;
  studies?: readonly string[];
  theme?: "light" | "dark";
}

export type TVInterval = "1" | "3" | "5" | "15" | "30" | "60" | "120" | "240" | "D" | "W" | "M";

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
 * For US equities we pass the bare ticker — TradingView's search resolves
 * the correct exchange automatically (avoids stale or wrong prefixes
 * causing "symbol doesn't exist" errors).
 */
const SYMBOL_MAP: Record<string, string> = {
  // Indices
  "^GSPC": "SP:SPX",
  "^IXIC": "NASDAQ:IXIC",
  "^DJI": "DJ:DJI",
  "^RUT": "TVC:RUT",
  "^VIX": "TVC:VIX",
  // Futures (front-month)
  "CL=F": "NYMEX:CL1!",
  "GC=F": "COMEX:GC1!",
  "SI=F": "COMEX:SI1!",
  // Crypto — Coinbase has cleanest USD pairs
  "BTC-USD": "COINBASE:BTCUSD",
  "ETH-USD": "COINBASE:ETHUSD",
  "SOL-USD": "COINBASE:SOLUSD",
  "DOGE-USD": "BINANCE:DOGEUSDT",
};

function translateSymbol(sym: string): string {
  const k = sym.toUpperCase();
  if (SYMBOL_MAP[k]) return SYMBOL_MAP[k];
  // Default to a bare ticker; TradingView resolves it via search.
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
  height = 380,
  studies,
  theme = "dark",
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widgetRef = useRef<any>(null);
  // Stable id per mount — avoids the "moving target" container_id problem
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

    loadTradingViewScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.TradingView) return;
        hostRef.current.innerHTML = "";
        hostRef.current.id = containerId;
        widgetRef.current = new window.TradingView.widget({
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
        });
      })
      .catch(() => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9793b0;font-family:Inter,system-ui,sans-serif;font-size:13px;text-align:center;padding:20px;">
            TradingView script blocked.<br/>Disable your ad blocker for this domain to load the chart.
          </div>`;
      });

    return () => {
      cancelled = true;
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
  }, [symbol, interval, theme, studiesKey, containerId]);

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

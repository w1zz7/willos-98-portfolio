"use client";

/**
 * willBB Markets Terminal - Python Edition (case study window).
 *
 * The companion to the Next.js willBB app. Same data sources (Yahoo + Stooq
 * + CoinGecko + synthetic), rebuilt on Streamlit + Plotly + PostgreSQL with
 * a clean phased roadmap.
 *
 * This window is a project showcase, not the live app itself - the actual
 * Streamlit dashboard runs out-of-process on the user's machine. We embed
 * an iframe to localhost:8501 when it's reachable, and fall back to a
 * static project card with the GitHub link otherwise.
 */

import { useEffect, useRef, useState } from "react";
import type { WindowState } from "@/lib/wm/types";

const COLORS = {
  bg: "#151518",
  panel: "#212124",
  panelAlt: "#1f1e23",
  panelDeep: "#24242a",
  border: "#46464F",
  borderSoft: "rgba(70,70,79,0.5)",
  text: "#FFFFFF",
  textSecondary: "#EBEBED",
  textDim: "#9793b0",
  textFaint: "#8A8A90",
  brand: "#33BBFF",
  brandSoft: "rgba(0,136,204,0.30)",
  up: "#5dd39e",
  down: "#f0686a",
} as const;

const FONT_UI = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

const STREAMLIT_CANDIDATE_URLS = [
  "http://localhost:8501",
  "http://localhost:8502",
];

type LiveState = "idle" | "checking" | "live" | "offline";

export default function WillBBPython({ window: _w }: { window: WindowState }) {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [state, setState] = useState<LiveState>("idle");

  // Probe localhost ports once on mount. We try a no-cors HEAD; if any
  // resolves without throwing, we treat it as live and embed it. CORS will
  // block reading the response body but for "is it up?" detection this is
  // enough. If neither resolves, show the static project card.
  useEffect(() => {
    let cancelled = false;
    setState("checking");

    async function probe() {
      for (const url of STREAMLIT_CANDIDATE_URLS) {
        try {
          // 2s timeout via AbortController
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 2000);
          await fetch(url, { mode: "no-cors", signal: ctrl.signal });
          clearTimeout(t);
          if (!cancelled) {
            setLiveUrl(url);
            setState("live");
          }
          return;
        } catch {
          // try next candidate
        }
      }
      if (!cancelled) setState("offline");
    }
    void probe();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "live" && liveUrl) {
    return <LivePane url={liveUrl} />;
  }
  return <StaticPane state={state} />;
}

// ---------------------------------------------------------------------------
// Live pane - iframe embed of the running Streamlit app
// ---------------------------------------------------------------------------

function LivePane({ url }: { url: string }) {
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: COLORS.bg, fontFamily: FONT_UI }}
    >
      <div
        className="flex items-center justify-between px-[14px] py-[8px] shrink-0"
        style={{
          background: COLORS.panel,
          borderBottom: "1px solid " + COLORS.border,
        }}
      >
        <div className="flex items-center gap-[10px]">
          <span
            className="px-[7px] py-[2px] text-[10px] tracking-[0.14em] uppercase"
            style={{
              background: COLORS.up,
              color: "#000",
              fontWeight: 700,
            }}
          >
            LIVE
          </span>
          <span
            className="text-[12px]"
            style={{ color: COLORS.text, fontFamily: FONT_MONO }}
          >
            willBB Markets Terminal · Python Edition
          </span>
          <span
            className="text-[10px]"
            style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
          >
            {url}
          </span>
        </div>
        <a
          href="https://github.com/w1zz7/willbb-py"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] uppercase tracking-[0.14em]"
          style={{
            color: COLORS.brand,
            textDecoration: "none",
          }}
        >
          source on github
        </a>
      </div>
      <iframe
        src={url}
        title="willBB Markets Terminal Python Edition"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          border: "none",
          background: COLORS.bg,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static pane - project showcase when the local server isn't running
// ---------------------------------------------------------------------------

function StaticPane({ state }: { state: LiveState }) {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: FONT_UI }}
    >
      {/* Header */}
      <div
        className="px-[20px] py-[14px] shrink-0"
        style={{
          background: COLORS.panel,
          borderBottom: "1px solid " + COLORS.border,
        }}
      >
        <div
          className="text-[10px] tracking-[0.18em] uppercase mb-[2px]"
          style={{ color: COLORS.brand, fontFamily: FONT_MONO }}
        >
          willBB · v2.0 · python edition
        </div>
        <div
          className="text-[24px] font-semibold tracking-[-0.01em]"
          style={{ color: COLORS.text }}
        >
          Markets Terminal
        </div>
        <div
          className="text-[12px] mt-[4px]"
          style={{ color: COLORS.textDim }}
        >
          Real-time markets dashboard rebuilt on Streamlit + Plotly + PostgreSQL.
          Same data layer as the v1 Next.js terminal, ~10× less code, native
          pan/zoom, persistent caching.
        </div>
      </div>

      {/* Hero card - state banner + actions */}
      <div className="px-[20px] py-[18px]">
        <div
          className="px-[16px] py-[14px] mb-[16px]"
          style={{
            background: COLORS.panelDeep,
            border: "1px solid " + COLORS.borderSoft,
          }}
        >
          <div className="flex items-center justify-between gap-[14px] flex-wrap">
            <div>
              <div
                className="text-[10px] tracking-[0.16em] uppercase"
                style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
              >
                Status
              </div>
              <div
                className="text-[14px] mt-[2px]"
                style={{ color: COLORS.text, fontFamily: FONT_MONO }}
              >
                {state === "checking"
                  ? "checking localhost:8501..."
                  : "local Streamlit server not detected"}
              </div>
              <div
                className="text-[11px] mt-[4px]"
                style={{ color: COLORS.textDim }}
              >
                To launch the live app: clone the repo, install requirements,
                and run <code style={{ color: COLORS.brand, fontFamily: FONT_MONO }}>streamlit run app.py</code>.
              </div>
            </div>
            <div className="flex gap-[8px]">
              <a
                href="https://github.com/w1zz7/willbb-py"
                target="_blank"
                rel="noopener noreferrer"
                className="px-[12px] py-[6px] text-[11px] tracking-[0.08em] uppercase"
                style={{
                  background: COLORS.brand,
                  color: "#000",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                view on github
              </a>
              <a
                href="https://github.com/w1zz7/willbb-py#quickstart"
                target="_blank"
                rel="noopener noreferrer"
                className="px-[12px] py-[6px] text-[11px] tracking-[0.08em] uppercase"
                style={{
                  background: "transparent",
                  border: "1px solid " + COLORS.borderSoft,
                  color: COLORS.text,
                  textDecoration: "none",
                }}
              >
                quickstart
              </a>
            </div>
          </div>
        </div>

        {/* Tech stack chips */}
        <div className="flex flex-wrap gap-[6px] mb-[16px]">
          {[
            "Python 3.11",
            "Streamlit",
            "Plotly",
            "pandas",
            "SQLAlchemy",
            "PostgreSQL 16",
            "psycopg 3",
          ].map((t) => (
            <span
              key={t}
              className="px-[10px] py-[3px] text-[10px] tracking-[0.06em]"
              style={{
                background: COLORS.panelAlt,
                border: "1px solid " + COLORS.borderSoft,
                color: COLORS.textSecondary,
                fontFamily: FONT_MONO,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Two-column body: features + roadmap */}
        <div
          className="grid gap-[16px]"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <FeatureCard
            title="What's live (Phase A)"
            items={[
              "13-symbol index strip ticker tape",
              "144-symbol watchlist with 5s polling",
              "Plotly candlestick chart, native pan/zoom",
              "Range selector (5D / 1M / 3M / 6M / 1Y / 2Y / 5Y)",
              "PostgreSQL-backed cache (60s bars, 5s quotes)",
              "Graceful degradation when DB is offline",
            ]}
          />
          <FeatureCard
            title="Same data sources as v1"
            items={[
              "Yahoo Finance v8 (primary)",
              "CoinGecko (BTC / ETH / SOL)",
              "Stooq CSV (25-year EOD history)",
              "Synthetic regime-switching GBM (last resort)",
              "4-tier failover with source-tagged responses",
              "Optional Alpha Vantage for News+Sentiment",
            ]}
          />
          <FeatureCard
            title="Roadmap"
            items={[
              "Phase B - quant studies + Carhart 4-factor",
              "Phase C - Discovery + Equity Research",
              "Phase D - vectorbt backtester + walk-forward CV",
              "Phase E - production deploy on Streamlit Cloud",
            ]}
          />
          <FeatureCard
            title="Architecture wins vs. v1"
            items={[
              "~10x less code (~600 LOC for Phase A)",
              "Native chart pan/zoom (no rAF throttling)",
              "Persistent cache survives restarts",
              "Battle-tested quant libs (statsmodels, arch)",
              "Streamlit auto-refresh - no React state choreography",
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div
      className="px-[14px] py-[12px]"
      style={{
        background: COLORS.panelAlt,
        border: "1px solid " + COLORS.borderSoft,
      }}
    >
      <div
        className="text-[10px] tracking-[0.14em] uppercase mb-[8px]"
        style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
      >
        {title}
      </div>
      <ul className="space-y-[3px]">
        {items.map((it) => (
          <li
            key={it}
            className="text-[12px] leading-[1.5]"
            style={{ color: COLORS.textSecondary }}
          >
            <span style={{ color: COLORS.brand, marginRight: 6 }}>·</span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

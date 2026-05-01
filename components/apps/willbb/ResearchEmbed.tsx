"use client";

/**
 * ResearchEmbed - the WillBB Terminal's Research tab body.
 *
 * Replaces the previously hand-rolled QuantDesk (Cockpit + StrategyLab + Scanner
 * + RiskDashboard + QuantChart + 18 quant primitives + Pine-v5 DSL backtester +
 * Carhart 4-factor regression — ~4,500 LOC) with a thin wrapper that iframes a
 * Streamlit + Plotly + pandas dashboard powered by the willbb-py companion app.
 *
 * Two source-of-truth tiers, probed in parallel on mount:
 *
 *   1. LOCAL  - http://localhost:8502/Research (developer running `streamlit
 *               run app.py` locally). Green badge.
 *   2. CLOUD  - the deployed Streamlit Community Cloud URL (set via
 *               NEXT_PUBLIC_STREAMLIT_CLOUD_URL or the fallback constant).
 *               Blue badge.
 *
 * If neither is reachable the panel shows a clean "Research offline" card with
 * a GitHub link + setup instructions, so visitors to the live Netlify site
 * never see a broken iframe.
 *
 * The iframe URL also carries `?symbol=<focusedSymbol>&embedded=1` so the
 * Streamlit page can pick up the Win98 watchlist's currently-focused ticker
 * via st.query_params and adapt its UI for embedded mode (the willbb-py
 * Research page reads both).
 */

import { useEffect, useMemo, useState } from "react";

const COLORS = {
  bg: "#151518",
  panel: "#212124",
  panelDeep: "#24242a",
  border: "#46464F",
  borderSoft: "rgba(70,70,79,0.5)",
  text: "#FFFFFF",
  textDim: "#9793b0",
  textFaint: "#8A8A90",
  brand: "#33BBFF",
  up: "#5dd39e",
  down: "#f0686a",
} as const;

const FONT_UI = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

// Probe candidates, ordered by preference (local first - if a developer is
// running Streamlit locally, that's the freshest data + zero network hop).
const LOCAL_CANDIDATES = ["http://localhost:8502", "http://localhost:8501"];

// Public deployment. Read at build time via Next.js's env-var inlining.
// To change post-deploy without rebuilding, set NEXT_PUBLIC_STREAMLIT_CLOUD_URL
// in Netlify's site env vars and trigger a rebuild.
const STREAMLIT_CLOUD_URL =
  process.env.NEXT_PUBLIC_STREAMLIT_CLOUD_URL ?? "https://willbb-py.streamlit.app";

const PROBE_TIMEOUT_MS = 2200;

type SourceTier = "local" | "cloud" | "offline";

interface Probe {
  url: string;
  tier: SourceTier;
}

async function probeOnce(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    await fetch(url, { mode: "no-cors", signal, cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

export default function ResearchEmbed({ focusedSymbol }: { focusedSymbol: string }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(true);

  // Probe local + cloud in parallel on mount. First successful one wins.
  // We don't re-probe on focus changes — the iframe's symbol updates via the
  // URL hash without a full reload (handled by the inner Streamlit app).
  useEffect(() => {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

    (async () => {
      // Try locals first (faster network round-trip when reachable).
      for (const local of LOCAL_CANDIDATES) {
        if (ctrl.signal.aborted) break;
        if (await probeOnce(local, ctrl.signal)) {
          setProbe({ url: local, tier: "local" });
          setProbing(false);
          clearTimeout(timeoutId);
          return;
        }
      }
      // Then the deployed Streamlit Cloud URL.
      if (!ctrl.signal.aborted && STREAMLIT_CLOUD_URL) {
        if (await probeOnce(STREAMLIT_CLOUD_URL, ctrl.signal)) {
          setProbe({ url: STREAMLIT_CLOUD_URL, tier: "cloud" });
          setProbing(false);
          clearTimeout(timeoutId);
          return;
        }
      }
      setProbe({ url: "", tier: "offline" });
      setProbing(false);
      clearTimeout(timeoutId);
    })();

    return () => {
      ctrl.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  // Build the iframe src. Use the Research subpage and pass focused symbol
  // + embedded flag through query params so the Streamlit app can react.
  const iframeUrl = useMemo(() => {
    if (!probe || probe.tier === "offline") return "";
    const sym = encodeURIComponent(focusedSymbol || "NVDA");
    return `${probe.url}/Research?symbol=${sym}&embedded=1`;
  }, [probe, focusedSymbol]);

  if (probing) {
    return <ProbingPane />;
  }
  if (!probe || probe.tier === "offline") {
    return <OfflinePane />;
  }
  return <LivePane url={iframeUrl} tier={probe.tier} />;
}

// ----------------------------------------------------------------------------
// States
// ----------------------------------------------------------------------------

function ProbingPane() {
  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: COLORS.bg, color: COLORS.textDim, fontFamily: FONT_MONO, fontSize: 12 }}
    >
      <span>connecting to Research backend ...</span>
    </div>
  );
}

function LivePane({ url, tier }: { url: string; tier: "local" | "cloud" }) {
  const tierLabel = tier === "local" ? "LIVE · LOCAL" : "LIVE · CLOUD";
  const tierColor = tier === "local" ? COLORS.up : COLORS.brand;
  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.bg }}>
      <div
        className="flex items-center justify-between px-[12px] py-[6px] shrink-0"
        style={{
          background: COLORS.panel,
          borderBottom: "1px solid " + COLORS.border,
          fontFamily: FONT_UI,
        }}
      >
        <div className="flex items-center gap-[10px]">
          <span
            className="px-[7px] py-[2px] text-[9px] tracking-[0.16em]"
            style={{
              background: tierColor,
              color: "#000",
              fontWeight: 700,
              fontFamily: FONT_MONO,
            }}
          >
            {tierLabel}
          </span>
          <span
            style={{
              color: COLORS.textDim,
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: "0.06em",
            }}
          >
            Research · Streamlit + Plotly + pandas
          </span>
        </div>
        <div className="flex items-center gap-[10px]">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: COLORS.textDim,
              fontSize: 10,
              fontFamily: FONT_MONO,
              letterSpacing: "0.06em",
              textDecoration: "none",
            }}
          >
            open in new tab ↗
          </a>
          <a
            href="https://github.com/w1zz7/willbb-py"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: COLORS.brand,
              fontSize: 10,
              fontFamily: FONT_MONO,
              letterSpacing: "0.06em",
              textDecoration: "none",
            }}
          >
            source ↗
          </a>
        </div>
      </div>
      <iframe
        src={url}
        title="willBB Research - Streamlit"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          border: "none",
          background: COLORS.bg,
          colorScheme: "dark",
        }}
      />
    </div>
  );
}

function OfflinePane() {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: FONT_UI }}
    >
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
          willBB · Research
        </div>
        <div className="text-[20px] font-semibold tracking-[-0.01em]">
          Powered by Python (Streamlit + Plotly + pandas)
        </div>
        <div className="text-[12px] mt-[4px]" style={{ color: COLORS.textDim }}>
          The Research panel is rendered by a companion Streamlit app (see
          source on GitHub). Local backend not detected and the deployed
          Streamlit Cloud URL is unreachable from this browser.
        </div>
      </div>

      <div className="px-[20px] py-[18px] flex-1">
        <div
          className="px-[16px] py-[14px] mb-[16px]"
          style={{
            background: COLORS.panelDeep,
            border: "1px solid " + COLORS.borderSoft,
          }}
        >
          <div
            className="text-[10px] tracking-[0.16em] uppercase mb-[4px]"
            style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
          >
            Status
          </div>
          <div
            className="text-[13px] mb-[10px]"
            style={{ color: COLORS.text, fontFamily: FONT_MONO }}
          >
            Research backend unreachable.
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <a
              href="https://github.com/w1zz7/willbb-py"
              target="_blank"
              rel="noopener noreferrer"
              className="px-[12px] py-[6px] text-[10px] tracking-[0.10em] uppercase"
              style={{
                background: COLORS.brand,
                color: "#000",
                textDecoration: "none",
                fontWeight: 600,
                fontFamily: FONT_MONO,
              }}
            >
              view on github
            </a>
            <a
              href="https://github.com/w1zz7/willbb-py#quickstart"
              target="_blank"
              rel="noopener noreferrer"
              className="px-[12px] py-[6px] text-[10px] tracking-[0.10em] uppercase"
              style={{
                background: "transparent",
                border: "1px solid " + COLORS.borderSoft,
                color: COLORS.text,
                textDecoration: "none",
                fontFamily: FONT_MONO,
              }}
            >
              quickstart
            </a>
          </div>
        </div>

        <div
          className="px-[14px] py-[12px]"
          style={{
            background: COLORS.panelDeep,
            border: "1px solid " + COLORS.borderSoft,
          }}
        >
          <div
            className="text-[10px] tracking-[0.14em] uppercase mb-[8px]"
            style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
          >
            Run locally to enable Research
          </div>
          <pre
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: COLORS.text,
              background: COLORS.bg,
              padding: 12,
              border: "1px solid " + COLORS.borderSoft,
              overflowX: "auto",
              margin: 0,
            }}
          >
{`# clone, install, run
git clone https://github.com/w1zz7/willbb-py
cd willbb-py
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
# Research at http://localhost:8501/Research`}
          </pre>
        </div>
      </div>
    </div>
  );
}

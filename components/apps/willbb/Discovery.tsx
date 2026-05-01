"use client";

/**
 * Discovery - daily gainers / losers / most-active screeners.
 *
 * Backed by Yahoo's predefined screener endpoints (day_gainers /
 * day_losers / most_actives), proxied server-side. Click any row to jump to
 * Equity Research for that ticker.
 */

import { useEffect, useState } from "react";
import MacroPanel from "./MacroPanel";
import CalendarsPanel from "./CalendarsPanel";

const COLORS = {
  bg: "#151518",
  panel: "#212124",
  panelAlt: "#1f1e23",
  panelDeep: "#24242a",
  border: "#46464F",
  borderSoft: "rgba(70,70,79,0.5)",
  text: "#FFFFFF",
  textDim: "#9793b0",
  textFaint: "#8A8A90",
  up: "#5dd39e",
  down: "#f0686a",
  flat: "#9793b0",
  brand: "#33BBFF",
} as const;

const FONT_UI =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

interface ScreenerRow {
  symbol?: string;
  shortName: string | null;
  price: number | null;
  changePct: number | null;
  change: number | null;
  volume: number | null;
  marketCap: number | null;
}

function fmtPct(n: number | null): string {
  if (n == null) return "-";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtBig(n: number | null): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString();
}

function pctColor(n: number | null): string {
  if (n == null) return COLORS.flat;
  if (n > 0.0001) return COLORS.up;
  if (n < -0.0001) return COLORS.down;
  return COLORS.flat;
}

function useScreener(scrId: "gainers" | "losers" | "active") {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/markets/equity?module=" + scrId)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setRows((d as { rows?: ScreenerRow[] }).rows ?? []);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scrId]);
  return { rows, loading, error };
}

type DiscoveryTab = "screeners" | "macro" | "calendars";

const DISCOVERY_TABS: { id: DiscoveryTab; label: string; sub: string }[] = [
  { id: "screeners", label: "Screeners", sub: "gainers · losers · most active" },
  { id: "macro", label: "Macro", sub: "treasury · CPI · GDP · unemployment · inflation" },
  { id: "calendars", label: "Calendars", sub: "earnings · IPO" },
];

export default function Discovery({
  onPick,
}: {
  onPick: (symbol: string) => void;
}) {
  const [tab, setTab] = useState<DiscoveryTab>("screeners");

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.bg }}>
      <SubTabBar tab={tab} setTab={setTab} />
      <div className="flex-1 min-h-0">
        {tab === "screeners" && (
          <div
            className="grid h-full overflow-hidden"
            style={{
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              background: COLORS.bg,
            }}
          >
            <Column title="Gainers" subtitle="day_gainers" scrId="gainers" onPick={onPick} accent={COLORS.up} />
            <Column title="Losers" subtitle="day_losers" scrId="losers" onPick={onPick} accent={COLORS.down} />
            <Column title="Most Active" subtitle="most_actives" scrId="active" onPick={onPick} accent={COLORS.brand} />
          </div>
        )}
        {tab === "macro" && <MacroPanel />}
        {tab === "calendars" && <CalendarsPanel onPick={onPick} />}
      </div>
    </div>
  );
}

function SubTabBar({
  tab,
  setTab,
}: {
  tab: DiscoveryTab;
  setTab: (t: DiscoveryTab) => void;
}) {
  return (
    <div
      className="flex shrink-0"
      style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
    >
      {DISCOVERY_TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-[16px] py-[8px] text-left"
            style={{
              color: active ? COLORS.text : COLORS.textDim,
              borderBottom: active ? "2px solid " + COLORS.brand : "2px solid transparent",
              background: "transparent",
              fontFamily: FONT_UI,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, letterSpacing: "0.04em" }}>
              {t.label}
            </div>
            <div style={{ fontSize: 10, color: active ? COLORS.textDim : COLORS.textFaint, marginTop: 1, fontFamily: FONT_MONO }}>
              {t.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Column({
  title,
  subtitle,
  scrId,
  onPick,
  accent,
}: {
  title: string;
  subtitle: string;
  scrId: "gainers" | "losers" | "active";
  onPick: (s: string) => void;
  accent: string;
}) {
  const { rows, loading, error } = useScreener(scrId);
  return (
    <div
      className="flex flex-col min-h-0 overflow-hidden"
      style={{ borderRight: "1px solid " + COLORS.border, background: COLORS.panel }}
    >
      <div
        className="px-[14px] py-[10px] shrink-0"
        style={{ borderBottom: "1px solid " + COLORS.border, background: COLORS.panelAlt }}
      >
        <div className="flex items-baseline gap-[8px]">
          <span className="text-[14px] font-semibold" style={{ color: accent, fontFamily: FONT_UI }}>
            {title}
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.16em]"
            style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
          >
            {subtitle}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textDim }}>
            loading…
          </div>
        )}
        {error && (
          <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.down }}>
            ⚠ {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div
            className="px-[14px] py-[12px] text-[12px] leading-relaxed"
            style={{ color: COLORS.textDim, fontFamily: FONT_UI }}
          >
            Yahoo screener returned no rows - likely rate-limited from this
            server. Will repopulate when the cooldown clears.
          </div>
        )}
        {rows.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => r.symbol && onPick(r.symbol)}
            className="w-full text-left px-[14px] py-[8px] flex items-baseline justify-between gap-[8px]"
            style={{ borderBottom: "1px solid " + COLORS.borderSoft }}
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-[8px]">
                <span className="text-[13px] font-semibold" style={{ color: COLORS.brand, fontFamily: FONT_MONO }}>
                  {r.symbol ?? "-"}
                </span>
                <span
                  className="text-[11px] truncate flex-1"
                  style={{ color: COLORS.textDim, fontFamily: FONT_UI, maxWidth: 180 }}
                  title={r.shortName ?? ""}
                >
                  {r.shortName ?? "-"}
                </span>
              </div>
              <div
                className="text-[10px] mt-[1px] tabular-nums"
                style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
              >
                Vol {fmtBig(r.volume)} · MC {fmtBig(r.marketCap)}
              </div>
            </div>
            <div className="text-right tabular-nums shrink-0" style={{ fontFamily: FONT_MONO }}>
              <div className="text-[13px]" style={{ color: COLORS.text }}>
                {fmtNum(r.price)}
              </div>
              <div className="text-[11px]" style={{ color: pctColor(r.changePct) }}>
                {fmtPct(r.changePct)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

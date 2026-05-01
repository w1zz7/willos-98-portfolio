"use client";

/**
 * WillBB Markets Terminal - a native, Bloomberg-style markets dashboard.
 *
 * Pulls live quotes + OHLCV bars from /api/markets/* (server-side Yahoo
 * Finance + CoinGecko fallback for crypto, no API keys) and renders them in
 * a dark pane that lives inside the standard Win98 window chrome.
 *
 * Three tabs:
 *   · Markets         - hero chart + watchlist
 *   · Equity Research - profile, technicals, fundamentals, analysts, etc.
 *   · Discovery       - gainers / losers / most-active screeners
 *
 * No external chart libs - all SVG is hand-rolled in PriceChart.tsx.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { WindowState } from "@/lib/wm/types";
import {
  INDEX_STRIP,
  buildWatchlist,
  type SymbolMeta,
} from "./symbols";
import type { ChartPoint } from "./PriceChart";
import TradingViewChart, { type TVInterval, type TVRange } from "./TradingViewChart";
import EquityResearch from "./EquityResearch";
import Discovery from "./Discovery";
import BootScreen from "./BootScreen";
import QuantDesk from "./quantdesk/QuantDesk";
import { SourceBadge, type DataSource, aggregateSource } from "./SourceBadge";

interface Quote {
  symbol: string;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  currency: string | null;
  marketState: string | null;
  exchange: string | null;
  source?: "yahoo" | "coingecko" | "stooq" | "alphavantage" | "seed" | "unavailable";
}

interface QuotesResponse {
  quotes: Quote[];
  fetchedAt: number;
  degraded?: boolean;
  message?: string | null;
}

interface ChartResponse {
  symbol: string;
  currency: string | null;
  exchange: string | null;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: string | null;
  range: string;
  interval: string;
  points: ChartPoint[];
}

type TabId = "markets" | "equity" | "discovery" | "research";

// `tv` is the bar size (interval) and `tvRange` is the visible zoom window.
// Both must be set or the chart looks identical for every D-interval choice.
const RANGES = [
  { id: "5d", label: "5D", interval: "60m", tv: "60" as TVInterval, tvRange: "5D" as TVRange },
  { id: "1mo", label: "1M", interval: "1d", tv: "D" as TVInterval, tvRange: "1M" as TVRange },
  { id: "3mo", label: "3M", interval: "1d", tv: "D" as TVInterval, tvRange: "3M" as TVRange },
  { id: "6mo", label: "6M", interval: "1d", tv: "D" as TVInterval, tvRange: "6M" as TVRange },
  { id: "1y", label: "1Y", interval: "1d", tv: "D" as TVInterval, tvRange: "12M" as TVRange },
  { id: "5y", label: "5Y", interval: "1wk", tv: "W" as TVInterval, tvRange: "60M" as TVRange },
] as const;

// Bloomberg/terminal-inspired dark palette tuned for tabular numeric data.
export const COLORS = {
  bg: "#151518", // --bg-secondary
  panel: "#212124", // --bg-primary
  panelAlt: "#1f1e23", // --bg-tertiary
  panelDeep: "#24242a", // --bg-quartary
  border: "#46464F", // --border-color
  borderSoft: "rgba(70,70,79,0.5)", // --button-secondary-border
  text: "#FFFFFF", // --text-primary
  textSecondary: "#EBEBED", // --text-secondary
  textDim: "#9793b0", // --text-tertiary
  textFaint: "#8A8A90", // --text-muted
  up: "#5dd39e",
  down: "#f0686a",
  flat: "#9793b0",
  brand: "#33BBFF", // signature terminal cyan
  brandSoft: "rgba(0,136,204,0.30)",
} as const;

// Inter for UI chrome, monospace for tabular numerics. We don't bundle the
// webfont - system-ui falls back gracefully and the cell font (already
// loaded by the rest of the portfolio) covers the price columns.
export const FONT_UI =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

// ---------- helpers ----------

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 10_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "-";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtBig(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString();
}

function pctColor(n: number | null | undefined): string {
  if (n == null) return COLORS.flat;
  if (n > 0.0001) return COLORS.up;
  if (n < -0.0001) return COLORS.down;
  return COLORS.flat;
}

function nyClock(now: Date): string {
  return now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

/** Crude US-equity session probe (NY hours). */
function marketStateLabel(d: Date): { label: string; color: string } {
  const ny = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  if (day === 0 || day === 6) return { label: "CLOSED · WEEKEND", color: COLORS.textDim };
  if (mins < 4 * 60) return { label: "CLOSED", color: COLORS.textDim };
  if (mins < 9 * 60 + 30) return { label: "PRE-MARKET", color: COLORS.brand };
  if (mins < 16 * 60) return { label: "OPEN", color: COLORS.up };
  if (mins < 20 * 60) return { label: "AFTER HOURS", color: COLORS.brand };
  return { label: "CLOSED", color: COLORS.textDim };
}

// ---------- main component ----------

export default function WillBBTerminal({ window: _w }: { window: WindowState }) {
  const watchlist = useMemo(() => buildWatchlist(), []);

  // Boot animation runs once per window open. Skip with click or any key.
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<TabId>("markets");
  const [focused, setFocused] = useState<string>(watchlist[0]?.symbol ?? "NVDA");
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [stripQuotes, setStripQuotes] = useState<Quote[]>([]);
  const [watchQuotes, setWatchQuotes] = useState<Quote[]>([]);
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [lastTick, setLastTick] = useState<number>(0);
  // Refresh nonce - bump this and every poll fires immediately.
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // 1Hz wall clock for the header.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Strip quotes - poll every 15s while window is open. Pauses when the
  // tab is hidden so we don't hammer the upstream from background tabs.
  // AbortController kills in-flight requests on cleanup so a stale poll
  // can't overwrite fresh data after a manual refresh / unmount.
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: number | null = null;
    async function load() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(
          "/api/markets/quotes?symbols=" +
            INDEX_STRIP.map((s) => encodeURIComponent(s.symbol)).join(","),
          { cache: "no-store", signal: ctrl.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as QuotesResponse;
        if (ctrl.signal.aborted) return;
        setStripQuotes(data.quotes ?? []);
        if (data.degraded) {
          setDegraded(
            data.message ??
              `Upstream rate-limited. Showing snapshot for ${data.quotes?.length ?? 0} symbol(s) until live feed returns.`
          );
        } else {
          setDegraded(null);
        }
        setLastTick(Date.now());
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        /* offline-friendly */
      }
    }
    load();
    timer = window.setInterval(load, 15_000);
    return () => {
      ctrl.abort();
      if (timer != null) window.clearInterval(timer);
    };
  }, [refreshNonce]);

  // Watchlist quotes - also 15s polling, also visibility-gated.
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: number | null = null;
    async function load() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const symbols = watchlist.map((s) => s.symbol).join(",");
        const res = await fetch(
          "/api/markets/quotes?symbols=" + encodeURIComponent(symbols),
          { cache: "no-store", signal: ctrl.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as QuotesResponse;
        if (ctrl.signal.aborted) return;
        setWatchQuotes(data.quotes ?? []);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        /* offline-friendly */
      }
    }
    load();
    timer = window.setInterval(load, 15_000);
    return () => {
      ctrl.abort();
      if (timer != null) window.clearInterval(timer);
    };
  }, [watchlist, refreshNonce]);

  // Chart for the focused symbol + range. Signal aborts in-flight fetch
  // when the user clicks a different range / symbol before the previous
  // request lands - otherwise last-resolver-wins would race.
  const loadChart = useCallback(
    async (symbol: string, r: (typeof RANGES)[number], signal: AbortSignal) => {
      setLoadingChart(true);
      setChartErr(null);
      try {
        const res = await fetch(
          `/api/markets/chart?symbol=${encodeURIComponent(symbol)}&range=${r.id}&interval=${r.interval}`,
          { signal }
        );
        if (signal.aborted) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ChartResponse;
        if (signal.aborted) return;
        setChart(data);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setChartErr(e instanceof Error ? e.message : String(e));
        setChart(null);
      } finally {
        if (!signal.aborted) setLoadingChart(false);
      }
    },
    []
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadChart(focused, range, ctrl.signal);
    return () => ctrl.abort();
  }, [focused, range, loadChart, refreshNonce]);

  // Manual refresh - bumps the nonce, all polling effects re-fire.
  // Ref-based gate (not state) so rapid clicks within the same render
  // frame are debounced synchronously. State-based gates miss because
  // React batches updates and the closure sees stale `refreshing` until
  // the next commit, letting 5+ clicks through before the gate engages.
  const refreshTimerRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const onManualRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, []);

  const market = marketStateLabel(now);

  return (
    <div
      className="flex flex-col h-full relative"
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT_UI,
      }}
    >
      {!booted && <BootScreen onComplete={() => setBooted(true)} />}
      <Header
        now={now}
        marketLabel={market.label}
        marketColor={market.color}
        lastTick={lastTick}
        liveSource={
          stripQuotes.length === 0
            ? null
            : aggregateSource(stripQuotes.map((q) => q.source as DataSource))
        }
        onRefresh={onManualRefresh}
        refreshing={refreshing}
      />
      <TickerStrip quotes={stripQuotes} symbols={INDEX_STRIP} />
      {degraded && (
        <div
          className="px-[14px] py-[5px] text-[12px] shrink-0"
          style={{
            background: COLORS.brandSoft,
            borderBottom: "1px solid " + COLORS.brand,
            color: COLORS.text,
            fontFamily: FONT_UI,
          }}
        >
          ⚠ {degraded}
        </div>
      )}
      <TabBar tab={tab} setTab={setTab} />

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "markets" && (
          <MarketsTab
            watchlist={watchlist}
            watchQuotes={watchQuotes}
            focused={focused}
            setFocused={setFocused}
            chart={chart}
            range={range}
            setRange={setRange}
            loading={loadingChart}
            error={chartErr}
          />
        )}
        {tab === "equity" && (
          <EquityResearch symbol={focused} setSymbol={setFocused} />
        )}
        {tab === "discovery" && (
          <Discovery
            onPick={(sym) => {
              setFocused(sym);
              setTab("equity");
            }}
          />
        )}
        {tab === "research" && (
          <QuantDesk
            symbol={focused}
            setSymbol={setFocused}
          />
        )}
      </div>

      <StatusBar focused={focused} chart={chart} loading={loadingChart} />
    </div>
  );
}

// ---------- header ----------

function Header({
  now,
  marketLabel,
  marketColor,
  lastTick,
  liveSource,
  onRefresh,
  refreshing,
}: {
  now: Date;
  marketLabel: string;
  marketColor: string;
  lastTick: number;
  liveSource: DataSource;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const tickAge = lastTick === 0 ? null : Math.max(0, Math.floor((now.getTime() - lastTick) / 1000));
  return (
    <div
      className="flex items-center justify-between px-[14px] py-[8px] border-b shrink-0"
      style={{
        background: COLORS.panel,
        borderColor: COLORS.border,
      }}
    >
      <div className="flex items-center gap-[10px]">
        <span
          className="text-[16px] font-semibold tracking-[-0.01em]"
          style={{ color: COLORS.text }}
        >
          WillBB
        </span>
        <span
          aria-hidden
          className="h-[14px] w-[1px]"
          style={{ background: COLORS.border }}
        />
        <span
          className="text-[11px] uppercase tracking-[0.18em]"
          style={{ color: COLORS.textDim, fontFamily: FONT_UI }}
        >
          Markets Terminal
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
        >
          v1.0
        </span>
      </div>
      <div className="flex items-center gap-[10px] text-[12px]">
        {/* Unified data-source badge — covers LIVE / DELAYED / CACHED / SYNTHETIC */}
        <SourceBadge source={liveSource} size="sm" ageSeconds={tickAge} />
        <span style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}>
          {nyClock(now)} ET
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="px-[8px] py-[2px] flex items-center gap-[6px]"
          style={{
            color: refreshing ? COLORS.textFaint : COLORS.text,
            background: COLORS.panelDeep,
            border: "1px solid " + COLORS.borderSoft,
            cursor: refreshing ? "default" : "pointer",
            fontFamily: FONT_UI,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
          title="Force refresh - bypass cache + retry upstreams"
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              transform: refreshing ? "rotate(360deg)" : "rotate(0deg)",
              transition: refreshing ? "transform 600ms linear" : "transform 200ms",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ⟳
          </span>
          {refreshing ? "loading" : "refresh"}
        </button>
        <span
          className="px-[8px] py-[2px] tracking-[0.18em] uppercase"
          style={{
            color: marketColor,
            background: COLORS.panelDeep,
            border: "1px solid " + COLORS.borderSoft,
            fontSize: 10,
            letterSpacing: "0.14em",
          }}
        >
          {marketLabel}
        </span>
      </div>
    </div>
  );
}

// ---------- ticker strip ----------

function TickerStrip({ quotes, symbols }: { quotes: Quote[]; symbols: SymbolMeta[] }) {
  // Map symbol -> meta + quote in a stable order.
  const byKey = new Map(quotes.map((q) => [q.symbol, q]));
  return (
    <div
      className="flex overflow-x-auto shrink-0"
      style={{
        background: COLORS.panelAlt,
        borderBottom: "1px solid " + COLORS.border,
      }}
    >
      {symbols.map((s) => {
        const q = byKey.get(s.symbol);
        const c = pctColor(q?.changePct);
        return (
          <div
            key={s.symbol}
            className="px-[14px] py-[7px] flex flex-col leading-tight whitespace-nowrap"
            style={{
              borderRight: "1px solid " + COLORS.borderSoft,
              minWidth: 138,
            }}
          >
            <span
              className="text-[10px] uppercase tracking-[0.14em]"
              style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
            >
              {s.label}
            </span>
            <div
              className="flex items-baseline gap-[8px] mt-[2px]"
              style={{ fontFamily: FONT_MONO }}
            >
              <span
                className="text-[14px] font-semibold tabular-nums"
                style={{ color: COLORS.text }}
              >
                {fmtPrice(q?.price)}
              </span>
              <span
                className="text-[12px] tabular-nums"
                style={{ color: c }}
              >
                {fmtPct(q?.changePct)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- tab bar ----------

function TabBar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "markets", label: "Markets" },
    { id: "equity", label: "Equity Research" },
    { id: "discovery", label: "Discovery" },
    { id: "research", label: "Research" },
  ];
  return (
    <div
      className="flex shrink-0"
      style={{
        borderBottom: "1px solid " + COLORS.border,
        background: COLORS.panel,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-[18px] py-[9px] text-[12px] tracking-[0.06em]"
            style={{
              color: active ? COLORS.text : COLORS.textDim,
              borderBottom: active
                ? "2px solid " + COLORS.brand
                : "2px solid transparent",
              background: "transparent",
              fontWeight: active ? 600 : 500,
              fontFamily: FONT_UI,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- markets tab ----------

function MarketsTab({
  watchlist,
  watchQuotes,
  focused,
  setFocused,
  chart,
  range,
  setRange,
  loading,
  error,
}: {
  watchlist: SymbolMeta[];
  watchQuotes: Quote[];
  focused: string;
  setFocused: (s: string) => void;
  chart: ChartResponse | null;
  range: (typeof RANGES)[number];
  setRange: (r: (typeof RANGES)[number]) => void;
  loading: boolean;
  error: string | null;
}) {
  const byKey = new Map(watchQuotes.map((q) => [q.symbol, q]));
  const focusQ = byKey.get(focused);
  return (
    <div className="flex h-full min-h-0">
      {/* Watchlist */}
      <div
        className="w-[260px] shrink-0 overflow-y-auto"
        style={{
          borderRight: "1px solid " + COLORS.border,
          background: COLORS.panelAlt,
        }}
      >
        <div
          className="px-[12px] py-[8px] text-[10px] uppercase tracking-[0.18em] sticky top-0"
          style={{
            color: COLORS.textFaint,
            background: COLORS.panelAlt,
            borderBottom: "1px solid " + COLORS.border,
            fontFamily: FONT_UI,
          }}
        >
          Watchlist
        </div>
        {watchlist.map((s) => {
          const q = byKey.get(s.symbol);
          const c = pctColor(q?.changePct);
          const active = s.symbol === focused;
          return (
            <button
              key={s.symbol}
              type="button"
              onClick={() => setFocused(s.symbol)}
              className="w-full px-[12px] py-[8px] flex items-center justify-between text-left"
              style={{
                background: active ? COLORS.brandSoft : "transparent",
                borderLeft: active
                  ? "2px solid " + COLORS.brand
                  : "2px solid transparent",
                borderBottom: "1px solid " + COLORS.borderSoft,
              }}
            >
              <span
                className="text-[13px] font-semibold"
                style={{
                  color: active ? COLORS.brand : COLORS.text,
                  fontFamily: FONT_MONO,
                }}
              >
                {s.symbol}
              </span>
              <span
                className="flex flex-col items-end leading-tight tabular-nums"
                style={{ fontFamily: FONT_MONO }}
              >
                <span className="text-[12px]" style={{ color: COLORS.text }}>
                  {fmtPrice(q?.price)}
                </span>
                <span className="text-[11px]" style={{ color: c }}>
                  {fmtPct(q?.changePct)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart pane */}
      <div
        className="flex-1 min-w-0 flex flex-col"
        style={{ background: COLORS.panel }}
      >
        {/* Chart header */}
        <div
          className="px-[16px] py-[12px] flex items-end justify-between gap-[12px]"
          style={{ borderBottom: "1px solid " + COLORS.border }}
        >
          <div>
            <div className="flex items-baseline gap-[10px]">
              <span
                className="text-[20px] font-semibold tracking-[-0.01em]"
                style={{ color: COLORS.text, fontFamily: FONT_MONO }}
              >
                {chart?.symbol ?? focused}
              </span>
              <span
                className="text-[13px]"
                style={{ color: COLORS.textDim, fontFamily: FONT_UI }}
              >
                {chart?.shortName ?? focusQ?.shortName ?? ""}
              </span>
            </div>
            <div
              className="flex items-baseline gap-[10px] mt-[2px] tabular-nums"
              style={{ fontFamily: FONT_MONO }}
            >
              <span className="text-[26px] font-semibold" style={{ color: COLORS.text }}>
                {fmtPrice(chart?.price ?? focusQ?.price)}
              </span>
              <span
                className="text-[14px]"
                style={{ color: pctColor(focusQ?.changePct) }}
              >
                {fmtPct(focusQ?.changePct)}
              </span>
            </div>
          </div>
          <div
            className="flex"
            style={{ border: "1px solid " + COLORS.border }}
          >
            {RANGES.map((r) => {
              const active = r.id === range.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r)}
                  className="px-[12px] py-[5px] text-[11px] uppercase tracking-[0.08em]"
                  style={{
                    color: active ? COLORS.text : COLORS.textDim,
                    background: active ? COLORS.brandSoft : "transparent",
                    borderRight: "1px solid " + COLORS.border,
                    fontFamily: FONT_UI,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart body - TradingView widget (their data feed, full toolbar) */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <TradingViewChart
              symbol={focused}
              interval={range.tv}
              range={range.tvRange}
              height="100%"
            />
          </div>

          {/* Stat grid (sourced from our markets proxy) + chart-fetch fault notice */}
          <div className="px-[14px] py-[10px] overflow-y-auto">
          {error && (
            <div
              className="text-[12px] px-[10px] py-[6px] mb-[8px]"
              style={{
                color: COLORS.textDim,
                background: COLORS.panelDeep,
                border: "1px solid " + COLORS.borderSoft,
              }}
            >
              stat grid: {error}
            </div>
          )}
          {/* Stat grid */}
          {chart && (
            <div
              className="grid grid-cols-3 gap-[1px] mt-[14px]"
              style={{ background: COLORS.border }}
            >
              {[
                ["Open", fmtPrice(chart.open)],
                ["High", fmtPrice(chart.dayHigh)],
                ["Low", fmtPrice(chart.dayLow)],
                ["Prev close", fmtPrice(chart.previousClose)],
                ["52w high", fmtPrice(chart.fiftyTwoWeekHigh)],
                ["52w low", fmtPrice(chart.fiftyTwoWeekLow)],
                ["Volume", fmtBig(chart.volume)],
                ["Currency", chart.currency ?? "-"],
                ["Exchange", chart.exchange ?? "-"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="px-[12px] py-[8px]"
                  style={{ background: COLORS.panelDeep }}
                >
                  <div
                    className="text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
                  >
                    {k}
                  </div>
                  <div
                    className="text-[14px] tabular-nums mt-[2px]"
                    style={{ color: COLORS.text, fontFamily: FONT_MONO }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>{/* /stat container */}
        </div>{/* /chart-body wrapper (TV + stat) */}
      </div>{/* /chart pane */}
    </div>
  );
}

// ---------- status bar ----------

function StatusBar({
  focused,
  chart,
  loading,
}: {
  focused: string;
  chart: ChartResponse | null;
  loading: boolean;
}) {
  return (
    <div
      className="px-[10px] py-[3px] flex justify-between text-[11px] shrink-0"
      style={{
        borderTop: "1px solid " + COLORS.border,
        background: "#0c1218",
        color: COLORS.textDim,
      }}
    >
      <span>
        <code style={{ color: COLORS.brand }}>&gt;</code> equity/{focused}/quote
        {chart ? `  ·  range=${chart.range}  ·  interval=${chart.interval}` : ""}
        {loading ? "  ·  loading…" : ""}
      </span>
      <span>data: yahoo finance v8 · proxied · cached 60s</span>
    </div>
  );
}

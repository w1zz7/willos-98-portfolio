"use client";

/**
 * Studies - quant-grade research pane.
 *
 * Headline overlays (the alpha-research toolkit, replacing retail indicators):
 *   Realized vol estimators (Garman-Klass / Yang-Zhang / Parkinson / close-to-close)
 *   Log returns + cumulative log returns
 *   Rolling beta to ^GSPC (60-day)
 *   Rolling Sortino + Information Ratio
 *   ACF / PACF bar charts (with ±1.96/√N significance bands)
 *   Hurst exponent (R/S) + ADF stationarity statistic
 *
 * Legacy retail indicators (SMA / EMA / RSI / MACD / Bollinger) kept under
 * a "Classics" group for chart compatibility, but defaulted off.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "../OpenBB";
import {
  type Bar,
  sma,
  ema,
  rsi,
  macd,
  atr,
  bb,
  log_ret,
  realized_vol_cc,
  realized_vol_pk,
  realized_vol_gk,
  realized_vol_yz,
  rolling_beta,
  sortino,
  information_ratio,
  hurst,
  adf_stat,
  acf,
  pacf,
} from "./indicators";
import QuantChart, { type OverlaySeries } from "./QuantChart";
import { SourceBadge, type DataSource } from "../SourceBadge";
import { useLiveQuote } from "@/lib/useLiveQuote";
import { readChart, fetchChart, prefetchChart } from "@/lib/chartCache";
import SymbolSearch from "../SymbolSearch";

interface ChartResp {
  symbol: string;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  range: string;
  interval: string;
  points: { t: number; c: number; o?: number; h?: number; l?: number; v?: number }[];
  source?: DataSource;
}

type IndicatorId =
  // Quant primitives
  | "rv_yz" | "rv_gk" | "rv_pk" | "rv_cc"
  | "logret" | "rollBeta" | "sortino" | "infoRatio"
  // Retail / classics (defaulted off)
  | "sma1" | "sma2" | "ema" | "rsi" | "macd" | "atr" | "bb";

interface IndicatorState {
  on: boolean;
  params: Record<string, number>;
}

const DEFAULTS: Record<IndicatorId, IndicatorState> = {
  // Default-on: the quant primitives that matter
  rv_yz: { on: true, params: { n: 21 } },
  rv_gk: { on: false, params: { n: 21 } },
  rv_pk: { on: false, params: { n: 21 } },
  rv_cc: { on: false, params: { n: 21 } },
  logret: { on: false, params: {} },
  rollBeta: { on: true, params: { n: 60 } },
  sortino: { on: false, params: { n: 60 } },
  infoRatio: { on: false, params: { n: 60 } },
  // Classics off by default
  sma1: { on: false, params: { n: 50 } },
  sma2: { on: false, params: { n: 200 } },
  ema: { on: false, params: { n: 20 } },
  rsi: { on: true, params: { n: 14 } },
  macd: { on: false, params: { fast: 12, slow: 26, sig: 9 } },
  atr: { on: false, params: { n: 14 } },
  bb: { on: true, params: { n: 20, mult: 2 } },
};

const INDICATOR_META: Record<IndicatorId, { label: string; group: string; color: string; pane: "main" | "sub-rsi" | "sub-macd" | "sub-stoch" | "sub-volume" | "sub-adx"; tooltip?: string }> = {
  rv_yz: { label: "RV Yang-Zhang", group: "Realized Vol", color: "#33BBFF", pane: "main", tooltip: "Yang-Zhang OHLC vol estimator. Handles overnight gaps. Annualized × √252." },
  rv_gk: { label: "RV Garman-Klass", group: "Realized Vol", color: "#5dd39e", pane: "main", tooltip: "Garman-Klass OHLC. ~7x more efficient than close-to-close." },
  rv_pk: { label: "RV Parkinson", group: "Realized Vol", color: "#f0a020", pane: "main", tooltip: "Parkinson H-L range estimator. ~5x more efficient." },
  rv_cc: { label: "RV close-to-close", group: "Realized Vol", color: "#9a8df0", pane: "main", tooltip: "Vanilla σ of log returns. Ignores intraday range." },
  logret: { label: "log returns", group: "Returns", color: "#e063b8", pane: "sub-macd", tooltip: "log(p_t / p_{t-1}). The canonical input to most quant primitives." },
  rollBeta: { label: "β to ^GSPC (60d)", group: "Risk", color: "#33BBFF", pane: "main", tooltip: "Cov(r_asset, r_SPX) / Var(r_SPX) over 60 daily bars." },
  sortino: { label: "Sortino (60d)", group: "Risk", color: "#5dd39e", pane: "main", tooltip: "(mean return) / (downside σ) × √252. Penalizes only downside vol." },
  infoRatio: { label: "Info Ratio (vs ^GSPC)", group: "Risk", color: "#f0a020", pane: "main", tooltip: "Active return / tracking error. Skill above benchmark, annualized." },
  sma1: { label: "SMA", group: "Classics", color: "#33BBFF", pane: "main" },
  sma2: { label: "SMA", group: "Classics", color: "#f0a020", pane: "main" },
  ema: { label: "EMA", group: "Classics", color: "#5dd39e", pane: "main" },
  rsi: { label: "RSI", group: "Classics", color: "#e063b8", pane: "sub-rsi" },
  macd: { label: "MACD", group: "Classics", color: "#33BBFF", pane: "sub-macd" },
  atr: { label: "ATR", group: "Classics", color: "#a4d99a", pane: "main" },
  bb: { label: "Bollinger", group: "Classics", color: "#9a8df0", pane: "main" },
};

const RANGES: { id: string; label: string; interval: string }[] = [
  { id: "3mo", label: "3M", interval: "1d" },
  { id: "6mo", label: "6M", interval: "1d" },
  { id: "1y", label: "1Y", interval: "1d" },
  { id: "2y", label: "2Y", interval: "1d" },
  { id: "5y", label: "5Y", interval: "1wk" },
];

export default function Cockpit({
  symbol,
  setSymbol,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
}) {
  const [range, setRange] = useState<string>("1y");
  const [resp, setResp] = useState<ChartResp | null>(null);
  const [mktResp, setMktResp] = useState<ChartResp | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [indicators, setIndicators] = useState<Record<IndicatorId, IndicatorState>>(DEFAULTS);
  const abortRef = useRef<AbortController | null>(null);
  // Counter that the manual refresh button bumps. We pass &bypass=1 + skip
  // the client SWR cache only when explicitly refreshing — range button
  // clicks now go through the client cache → server cache (30s TTL) → Yahoo.
  // Round-trip range clicks (1Y → 5Y → 1Y) hit the client cache for instant
  // re-render. First-time clicks usually hit the 30s server cache for ~50ms
  // total round-trip. Only an explicit "refresh" gesture forces a Yahoo fetch.
  const [rangeNonce, setRangeNonce] = useState<number>(0);
  const rangeNonceRef = useRef<number>(0);
  rangeNonceRef.current = rangeNonce;
  // Separate flag for the next fetch to bypass the client+server cache. Set
  // by the manual refresh button (not implemented on this panel yet — left
  // here as a hook for when we add one). Resets after one use.
  const bypassNextRef = useRef<boolean>(false);

  // Fetch asset bars + market bars (^GSPC) in parallel for beta/IR/etc.
  // SWR pattern: synchronous read of the client cache renders an INSTANT
  // chart on round-trip range/symbol switches (1Y → 5Y → 1Y feels free
  // because the second 1Y is served from memory). Background fetch then
  // refreshes in the background. Range-button clicks bypass the cache so
  // the user always sees fresh data when they explicitly ask for it.
  useEffect(() => {
    const r = RANGES.find((x) => x.id === range)!;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Use the cache aggressively — only bypass when the user has explicitly
    // demanded fresh data via the (yet-to-be-wired-up) refresh button. Range
    // clicks go through cache → server cache → Yahoo as needed.
    const bypass = bypassNextRef.current;
    bypassNextRef.current = false;

    // Step 1: synchronous cache read. If we have anything (fresh or stale),
    // hydrate state immediately so the chart paints without waiting for the
    // network. Skip on bypass so a manual refresh always shows fresh data.
    if (!bypass) {
      const cachedAsset = readChart(symbol, r.id, r.interval);
      const cachedMkt = readChart("^GSPC", r.id, r.interval);
      if (cachedAsset) setResp(cachedAsset.payload as unknown as ChartResp);
      if (cachedMkt) setMktResp(cachedMkt.payload as unknown as ChartResp);
      // If both were fresh (<60s old), no need to refetch — the cache
      // entry is already what the server would return anyway.
      if (cachedAsset?.fresh && cachedMkt?.fresh) {
        setLoading(false);
        return () => ctrl.abort();
      }
    }

    // Step 2: background fetch (or foreground if cache miss).
    // Only show the loading badge if we have NO cached chart to render —
    // otherwise the stale chart stays visible and the refresh is silent.
    const haveAnyCached = !bypass && readChart(symbol, r.id, r.interval) != null;
    if (!haveAnyCached) setLoading(true);

    Promise.all([
      fetchChart(symbol, r.id, r.interval, { bypass, signal: ctrl.signal }),
      fetchChart("^GSPC", r.id, r.interval, { bypass, signal: ctrl.signal }),
    ]).then(([asset, mkt]) => {
      if (ctrl.signal.aborted) return;
      if (asset) setResp(asset as unknown as ChartResp);
      if (mkt) setMktResp(mkt as unknown as ChartResp);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [symbol, range, rangeNonce]);

  // Hover prefetch — when the user mouses over a range button, kick off a
  // background fetch for that range. By the time they actually click, the
  // data is in the client cache and the click feels instantaneous.
  const onRangeHover = (rangeId: string) => {
    const r = RANGES.find((x) => x.id === rangeId);
    if (!r) return;
    prefetchChart(symbol, r.id, r.interval);
    prefetchChart("^GSPC", r.id, r.interval);
  };

  // Wraps setRange so user-initiated clicks bump the bypass nonce; programmatic
  // range changes (e.g., via an external link) skip the bump.
  const onRangeClick = (id: string) => {
    setRangeNonce((n) => n + 1);
    setRange(id);
  };

  // Static historical bars from the chart endpoint. These don't change on
  // every live tick — only on symbol/range change.
  const staticBars: Bar[] = useMemo(() => {
    if (!resp) return [];
    return resp.points.map((p) => ({
      t: p.t,
      o: p.o ?? p.c,
      h: p.h ?? p.c,
      l: p.l ?? p.c,
      c: p.c,
      v: p.v ?? 0,
    }));
  }, [resp]);

  // Live quote polled every 5s (default). Hook handles abort, visibility,
  // jitter, error retry. See lib/useLiveQuote.ts.
  const liveQuote = useLiveQuote(symbol);

  // Splice the live price into the LATEST bar's close. h/l auto-extend if
  // the live print exceeds the daily high/low. Older bars are immutable —
  // the polling never touches them. All downstream computations (closes,
  // returns, indicator overlays, realized vol, Sharpe, etc.) re-derive
  // from `bars` so they all reflect the live tick.
  const bars: Bar[] = useMemo(() => {
    if (staticBars.length === 0 || liveQuote?.price == null) return staticBars;
    const last = staticBars[staticBars.length - 1];
    const lp = liveQuote.price;
    if (lp === last.c) return staticBars; // no-op when price hasn't moved
    const merged: Bar = {
      ...last,
      c: lp,
      h: Math.max(last.h, lp),
      l: Math.min(last.l, lp),
    };
    return [...staticBars.slice(0, -1), merged];
  }, [staticBars, liveQuote?.price]);

  const closes = useMemo(() => bars.map((b) => b.c), [bars]);
  const assetRet = useMemo(() => log_ret(closes), [closes]);
  const mktCloses = useMemo(() => (mktResp?.points ?? []).map((p) => p.c), [mktResp]);
  const mktRet = useMemo(() => log_ret(mktCloses), [mktCloses]);

  // STATIC variants — same data minus the live-tick splice. These let the
  // heavy stats panel (Sharpe, Sortino, vol estimators, ACF/PACF, Hurst,
  // ADF, rolling beta, IR) skip the per-tick recomputation. The 5s live
  // tick changes only the latest bar's close — the resulting Sharpe over
  // 252 days moves by ~10⁻⁵, indistinguishable from noise. Recomputing
  // O(n²) ACF + Hurst every 5s on a 1255-bar series is the dominant CPU
  // load on this panel; this is the single biggest perf win we can make.
  const staticCloses = useMemo(() => staticBars.map((b) => b.c), [staticBars]);
  const staticAssetRet = useMemo(() => log_ret(staticCloses), [staticCloses]);

  // Align asset returns with market returns by timestamp (or by index).
  // Keyed on staticBars.length (a primitive) instead of assetRet so this
  // doesn't churn on every live tick — the alignment shape only changes
  // when the bar count changes (i.e., a NEW bar is appended).
  const alignedMktRet: (number | null)[] = useMemo(() => {
    const out: (number | null)[] = new Array(staticBars.length).fill(null);
    const minLen = Math.min(staticBars.length, mktRet.length);
    for (let i = 0; i < minLen; i++) out[i] = mktRet[i];
    return out;
  }, [staticBars.length, mktRet]);

  const overlays: OverlaySeries[] = useMemo(() => {
    if (bars.length === 0) return [];
    const out: OverlaySeries[] = [];
    if (indicators.bb.on) {
      const b = bb(closes, indicators.bb.params.n, indicators.bb.params.mult);
      out.push({ name: "BB upper", data: b.upper, color: INDICATOR_META.bb.color, pane: "main" });
      out.push({ name: "BB middle", data: b.middle, color: INDICATOR_META.bb.color, pane: "main" });
      out.push({ name: "BB lower", data: b.lower, color: INDICATOR_META.bb.color, pane: "main" });
    }
    if (indicators.sma1.on) out.push({ name: `SMA(${indicators.sma1.params.n})`, data: sma(closes, indicators.sma1.params.n), color: INDICATOR_META.sma1.color, pane: "main" });
    if (indicators.sma2.on) out.push({ name: `SMA(${indicators.sma2.params.n})`, data: sma(closes, indicators.sma2.params.n), color: INDICATOR_META.sma2.color, pane: "main" });
    if (indicators.ema.on) out.push({ name: `EMA(${indicators.ema.params.n})`, data: ema(closes, indicators.ema.params.n), color: INDICATOR_META.ema.color, pane: "main" });
    if (indicators.atr.on) out.push({ name: `ATR(${indicators.atr.params.n})`, data: atr(bars, indicators.atr.params.n), color: INDICATOR_META.atr.color, pane: "main" });
    if (indicators.rsi.on) out.push({ name: `RSI(${indicators.rsi.params.n})`, data: rsi(closes, indicators.rsi.params.n), color: INDICATOR_META.rsi.color, pane: "sub-rsi" });
    if (indicators.macd.on) {
      const m = macd(closes, indicators.macd.params.fast, indicators.macd.params.slow, indicators.macd.params.sig);
      out.push({ name: "MACD", data: m.macd, color: "#33BBFF", pane: "sub-macd" });
      out.push({ name: "Signal", data: m.signal, color: "#f0a020", pane: "sub-macd" });
      out.push({ name: "Hist", data: m.hist, color: "#5dd39e", pane: "sub-macd", style: "histogram" });
    }
    return out;
  }, [bars, closes, indicators]);

  // Compute auxiliary quant series for the analytics panel (right rail).
  // CRITICAL: keyed on staticBars (NOT bars) — see comment above for rationale.
  // Stats panel updates whenever a new bar lands (e.g., daily); the live tick
  // does not retrigger the O(n²) ACF/PACF + Hurst computation.
  const stats = useMemo(() => {
    if (staticAssetRet.length < 30) return null;
    const recent = staticAssetRet.slice(-252).filter((v): v is number => v != null);
    const meanR = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const sdR = Math.sqrt(recent.reduce((a, b) => a + (b - meanR) ** 2, 0) / Math.max(1, recent.length - 1));
    const sharpe = sdR > 0 ? (meanR / sdR) * Math.sqrt(252) : 0;
    const annVol = sdR * Math.sqrt(252);

    const rvYZ = realized_vol_yz(staticBars, indicators.rv_yz.params.n);
    const rvGK = realized_vol_gk(staticBars, indicators.rv_gk.params.n);
    const rvPK = realized_vol_pk(staticBars, indicators.rv_pk.params.n);
    const rvCC = realized_vol_cc(staticCloses, indicators.rv_cc.params.n);
    const beta = rolling_beta(staticAssetRet, alignedMktRet, indicators.rollBeta.params.n);
    const sortinoSeries = sortino(staticAssetRet, indicators.sortino.params.n);
    const irSeries = information_ratio(staticAssetRet, alignedMktRet, indicators.infoRatio.params.n);

    const lastVal = (s: (number | null)[]) => {
      for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i] as number;
      return null;
    };

    const hurstVal = hurst(recent);
    const adfVal = adf_stat(staticCloses.filter((v): v is number => v != null).slice(-252));
    const acfVals = acf(recent, 20);
    const pacfVals = pacf(recent, 20);

    return {
      sharpe,
      annVol,
      meanR,
      lastRvYZ: lastVal(rvYZ),
      lastRvGK: lastVal(rvGK),
      lastRvPK: lastVal(rvPK),
      lastRvCC: lastVal(rvCC),
      lastBeta: lastVal(beta),
      lastSortino: lastVal(sortinoSeries),
      lastIR: lastVal(irSeries),
      hurstVal,
      adfVal,
      acfVals,
      pacfVals,
      n: recent.length,
      rvYZ, rvGK, rvPK, rvCC, beta, sortinoSeries, irSeries,
    };
  }, [staticBars, staticCloses, staticAssetRet, alignedMktRet, indicators]);

  // Build vol overlays (main pane, on close-price scale would be wrong → use a sub-pane)
  // For simplicity, we render vol estimators as their own time-series chart below the main chart.
  // (Skipping the trick of overlaying on price-scale; the analytics panel surfaces last-values.)

  const lastBar = bars[bars.length - 1];

  // Live-ticking display values. Prefer the live quote when available so the
  // header matches what the chart's pulsing dot is showing. Fall back to
  // resp.price / resp.previousClose only on first paint before the first
  // poll lands. The change % is **day-over-day** (live − prevClose), not
  // since the start of the chart range — that's what TradingView shows.
  const livePrice = liveQuote?.price ?? resp?.price ?? null;
  const livePrevClose = liveQuote?.previousClose ?? resp?.previousClose ?? null;
  const change =
    livePrice != null && livePrevClose != null && livePrevClose !== 0
      ? ((livePrice - livePrevClose) / livePrevClose) * 100
      : 0;
  const liveSource: DataSource = liveQuote?.source ?? resp?.source ?? null;

  return (
    <div className="h-full flex" style={{ background: COLORS.bg, fontFamily: FONT_UI }}>
      {/* Main pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Symbol + price + range bar */}
        <div
          className="flex items-center gap-[18px] px-[14px] py-[8px] shrink-0"
          style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
        >
          <div>
            <SymbolSearch
              value={symbol}
              onChange={setSymbol}
              width={140}
              fontSize={18}
            />
            <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{resp?.shortName ?? "-"}</span>
              <SourceBadge source={liveSource} size="xs" />
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text,
                fontFamily: FONT_MONO,
                display: "flex",
                alignItems: "baseline",
                gap: 6,
              }}
            >
              {livePrice != null ? `$${livePrice.toFixed(2)}` : "-"}
              {liveQuote?.fetchedAt && (
                <span
                  aria-hidden
                  title={`Last tick ${new Date(liveQuote.fetchedAt).toLocaleTimeString()}`}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: change >= 0 ? COLORS.up : COLORS.down,
                    boxShadow: `0 0 6px ${change >= 0 ? COLORS.up : COLORS.down}`,
                    animation: "willbb-livepulse 1.5s ease-in-out infinite",
                    display: "inline-block",
                  }}
                />
              )}
            </div>
            <div style={{ fontSize: 11, color: change >= 0 ? COLORS.up : COLORS.down, fontFamily: FONT_MONO }}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </div>
          </div>
          <div className="flex gap-[4px] flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRangeClick(r.id)}
                onMouseEnter={() => onRangeHover(r.id)}
                onFocus={() => onRangeHover(r.id)}
                style={{
                  background: range === r.id ? COLORS.brandSoft : "transparent",
                  border: "1px solid " + (range === r.id ? COLORS.brand : COLORS.borderSoft),
                  color: range === r.id ? COLORS.text : COLORS.textDim,
                  padding: "3px 9px",
                  fontSize: 10,
                  fontFamily: FONT_MONO,
                  cursor: "pointer",
                  letterSpacing: "0.06em",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-[14px] text-[10px]" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint }}>
            <span>O <span style={{ color: COLORS.text }}>{lastBar?.o.toFixed(2) ?? "-"}</span></span>
            <span>H <span style={{ color: COLORS.up }}>{lastBar?.h.toFixed(2) ?? "-"}</span></span>
            <span>L <span style={{ color: COLORS.down }}>{lastBar?.l.toFixed(2) ?? "-"}</span></span>
            <span>V <span style={{ color: COLORS.text }}>{lastBar?.v?.toLocaleString() ?? "-"}</span></span>
            {loading && <span style={{ color: COLORS.brand }}>loading…</span>}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <QuantChart
            bars={bars}
            overlays={overlays}
            height={440}
            livePrice={livePrice}
            livePrevClose={livePrevClose}
            watermark={symbol.toUpperCase()}
            marketState={liveQuote?.marketState ?? null}
          />

          {/* Realized vol panel */}
          {stats && (
            <div
              style={{
                padding: 12,
                background: COLORS.panel,
                borderTop: "1px solid " + COLORS.border,
                margin: "8px 0 0",
              }}
            >
              <SectionTitle>Realized Volatility (annualized · 21-day window)</SectionTitle>
              <RealizedVolChart
                barCount={staticBars.length}
                rvYZ={stats.rvYZ}
                rvGK={stats.rvGK}
                rvPK={stats.rvPK}
                rvCC={stats.rvCC}
              />
            </div>
          )}

          {/* ACF / PACF panel */}
          {stats && (
            <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border, marginTop: 1 }}>
              <div style={{ padding: 12, background: COLORS.panel }}>
                <SectionTitle>Autocorrelation (ACF) · log returns</SectionTitle>
                <CorrelogramChart values={stats.acfVals} n={stats.n} label="lag" />
              </div>
              <div style={{ padding: 12, background: COLORS.panel }}>
                <SectionTitle>Partial Autocorrelation (PACF)</SectionTitle>
                <CorrelogramChart values={stats.pacfVals} n={stats.n} label="lag" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right rail */}
      <div
        className="overflow-y-auto shrink-0"
        style={{ width: 300, background: COLORS.panel, borderLeft: "1px solid " + COLORS.border }}
      >
        {stats && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid " + COLORS.border }}>
            <SectionTitle>Quant readouts (last)</SectionTitle>
            <div className="grid grid-cols-2 gap-[6px] mt-[6px]" style={{ fontSize: 11, fontFamily: FONT_MONO }}>
              <Readout label="Sharpe (1y)" value={stats.sharpe.toFixed(2)} tone={stats.sharpe > 0 ? COLORS.up : COLORS.down} />
              <Readout label="Ann. σ" value={`${(stats.annVol * 100).toFixed(1)}%`} tone={COLORS.text} />
              <Readout label="RV YZ" value={stats.lastRvYZ != null ? `${(stats.lastRvYZ * 100).toFixed(1)}%` : "-"} tone={COLORS.brand} />
              <Readout label="RV GK" value={stats.lastRvGK != null ? `${(stats.lastRvGK * 100).toFixed(1)}%` : "-"} tone={COLORS.text} />
              <Readout label="β to SPX" value={stats.lastBeta != null ? stats.lastBeta.toFixed(2) : "-"} tone={Math.abs(stats.lastBeta ?? 0) < 0.6 ? COLORS.up : COLORS.text} />
              <Readout label="Sortino" value={stats.lastSortino != null ? stats.lastSortino.toFixed(2) : "-"} tone={stats.lastSortino != null && stats.lastSortino > 0 ? COLORS.up : COLORS.down} />
              <Readout label="Info Ratio" value={stats.lastIR != null ? stats.lastIR.toFixed(2) : "-"} tone={stats.lastIR != null && stats.lastIR > 0 ? COLORS.up : COLORS.down} />
              <Readout label="Hurst (R/S)" value={stats.hurstVal.toFixed(2)} tone={stats.hurstVal > 0.55 ? COLORS.up : stats.hurstVal < 0.45 ? COLORS.down : COLORS.textDim} />
              <Readout label="ADF stat" value={stats.adfVal.toFixed(2)} tone={stats.adfVal < -2.86 ? COLORS.up : COLORS.textDim} />
              <Readout label="ACF(1)" value={stats.acfVals[1]?.toFixed(2) ?? "-"} tone={Math.abs(stats.acfVals[1] ?? 0) > 1.96 / Math.sqrt(stats.n) ? COLORS.up : COLORS.textDim} />
            </div>
            <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 8, lineHeight: 1.4 }}>
              <div><strong style={{ color: COLORS.text }}>Hurst</strong> &lt; 0.5 = mean-reverting; &gt; 0.5 = trending.</div>
              <div><strong style={{ color: COLORS.text }}>ADF</strong> &lt; −2.86 = stationary at 95%.</div>
              <div><strong style={{ color: COLORS.text }}>ACF(1)</strong> &gt; ±1.96/√N = significant lag-1 momentum/MR.</div>
            </div>
          </div>
        )}

        <SectionTitle style={{ padding: "10px 12px 4px" }}>Indicator overlays</SectionTitle>
        {(["Realized Vol", "Returns", "Risk", "Classics"] as const).map((group) => (
          <div key={group}>
            <div
              style={{
                padding: "6px 12px 4px",
                fontSize: 9,
                color: COLORS.textFaint,
                fontFamily: FONT_MONO,
                letterSpacing: "0.18em",
                borderTop: "1px solid " + COLORS.border,
                background: COLORS.panelDeep,
              }}
            >
              {group.toUpperCase()}
            </div>
            {(Object.entries(INDICATOR_META) as [IndicatorId, typeof INDICATOR_META[IndicatorId]][])
              .filter(([, meta]) => meta.group === group)
              .map(([id, meta]) => {
                const st = indicators[id];
                return (
                  <div
                    key={id}
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      color: st.on ? COLORS.text : COLORS.textDim,
                      fontFamily: FONT_UI,
                      borderTop: "1px solid " + COLORS.borderSoft,
                    }}
                  >
                    <label className="flex items-center gap-[8px]" style={{ cursor: "pointer" }} title={meta.tooltip}>
                      <input
                        type="checkbox"
                        checked={st.on}
                        onChange={(e) =>
                          setIndicators((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], on: e.target.checked },
                          }))
                        }
                      />
                      <span style={{ display: "inline-block", width: 8, height: 8, background: meta.color, borderRadius: 50 }} />
                      <span style={{ flex: 1 }}>{meta.label}</span>
                    </label>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: COLORS.textFaint,
        fontFamily: FONT_MONO,
        letterSpacing: "0.18em",
        ...style,
      }}
    >
      {String(children).toUpperCase()}
    </div>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: COLORS.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: tone, fontWeight: 700, fontFamily: FONT_MONO, marginTop: 1 }}>{value}</div>
    </div>
  );
}

// Inner impl — wrapped in memo() at the export site below. Takes barCount
// (primitive) instead of the full bars[] array so React.memo's default
// shallow compare correctly skips re-render across live ticks (the array
// reference changes on every tick but bars.length doesn't).
function RealizedVolChartImpl({
  barCount,
  rvYZ,
  rvGK,
  rvPK,
  rvCC,
}: {
  barCount: number;
  rvYZ: (number | null)[];
  rvGK: (number | null)[];
  rvPK: (number | null)[];
  rvCC: (number | null)[];
}) {
  const W = 800, H = 140, PAD_L = 50, PAD_R = 12, PAD_T = 6, PAD_B = 22;
  const all = [...rvYZ, ...rvGK, ...rvPK, ...rvCC].filter((v): v is number => v != null);
  if (all.length === 0) {
    return <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14 }}>computing realized vol…</div>;
  }
  const lo = 0;
  const hi = Math.max(...all) * 1.05;
  const xFor = (i: number) => PAD_L + (i / Math.max(1, barCount - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => H - PAD_B - (v / hi) * (H - PAD_T - PAD_B);

  function lineFor(series: (number | null)[]): string {
    const pts: string[] = [];
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v == null) continue;
      pts.push(`${xFor(i)},${yFor(v)}`);
    }
    return pts.join(" ");
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 160 }}>
      {/* y-axis ticks */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = yFor(hi * frac);
        return (
          <g key={`y-${frac}`}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke={COLORS.borderSoft} strokeDasharray="2,3" />
            <text x={PAD_L - 6} y={y + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">
              {(hi * frac * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
      <polyline points={lineFor(rvCC)} fill="none" stroke="#9a8df0" strokeWidth={1.2} opacity={0.85} />
      <polyline points={lineFor(rvPK)} fill="none" stroke="#f0a020" strokeWidth={1.2} opacity={0.85} />
      <polyline points={lineFor(rvGK)} fill="none" stroke="#5dd39e" strokeWidth={1.2} opacity={0.85} />
      <polyline points={lineFor(rvYZ)} fill="none" stroke="#33BBFF" strokeWidth={1.6} />
      {/* Legend */}
      <g transform={`translate(${PAD_L + 4}, 14)`} fontFamily={FONT_MONO} fontSize={10}>
        <text x={0} y={0} fill="#33BBFF">Yang-Zhang</text>
        <text x={70} y={0} fill="#5dd39e">Garman-Klass</text>
        <text x={155} y={0} fill="#f0a020">Parkinson</text>
        <text x={220} y={0} fill="#9a8df0">close-to-close</text>
      </g>
    </svg>
  );
}
// React.memo wrapper — barCount is a primitive and the rv* arrays are stable
// across live ticks (Phase L decoupled stats from bars). Default shallow
// compare is sufficient: if all 5 props are referentially equal, skip render.
const RealizedVolChart = memo(RealizedVolChartImpl);

// Inner impl, wrapped in memo() at the bottom of the file. ACF/PACF arrays
// (`values`) are stable across live ticks via Phase L (stats keys on
// staticBars), so React.memo's shallow compare correctly skips re-render.
function CorrelogramChartImpl({ values, n, label }: { values: number[]; n: number; label: string }) {
  void label;
  const W = 600, H = 130, PAD_L = 40, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const maxLag = values.length - 1;
  const ci = 1.96 / Math.sqrt(Math.max(1, n)); // 95% confidence band
  const xFor = (k: number) => PAD_L + (k / Math.max(1, maxLag)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => H - PAD_B - ((v + 1) / 2) * (H - PAD_T - PAD_B);
  const zeroY = yFor(0);
  const ciHi = yFor(ci);
  const ciLo = yFor(-ci);
  const bw = Math.max(2, (W - PAD_L - PAD_R) / Math.max(1, maxLag) - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150 }}>
      {/* CI shading */}
      <rect x={PAD_L} y={ciHi} width={W - PAD_L - PAD_R} height={ciLo - ciHi} fill={COLORS.brand} opacity={0.08} />
      {/* Axes */}
      <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke={COLORS.borderSoft} />
      <line x1={PAD_L} y1={ciHi} x2={W - PAD_R} y2={ciHi} stroke={COLORS.brand} strokeDasharray="3,3" strokeWidth={0.6} />
      <line x1={PAD_L} y1={ciLo} x2={W - PAD_R} y2={ciLo} stroke={COLORS.brand} strokeDasharray="3,3" strokeWidth={0.6} />
      {/* Bars */}
      {values.map((v, k) => {
        if (k === 0) return null; // skip lag-0 (always 1)
        const x = xFor(k);
        const y0 = zeroY;
        const yV = yFor(v);
        const top = Math.min(y0, yV);
        const h = Math.abs(yV - y0);
        const significant = Math.abs(v) > ci;
        return (
          <rect
            key={k}
            x={x - bw / 2}
            y={top}
            width={Math.max(1, bw)}
            height={Math.max(0.5, h)}
            fill={significant ? (v > 0 ? COLORS.up : COLORS.down) : COLORS.textDim}
            opacity={significant ? 0.95 : 0.6}
          />
        );
      })}
      {/* Y axis labels */}
      <text x={PAD_L - 6} y={yFor(1) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">+1</text>
      <text x={PAD_L - 6} y={zeroY + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">0</text>
      <text x={PAD_L - 6} y={yFor(-1) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">−1</text>
      {/* X axis lag labels */}
      {[1, 5, 10, 15, 20].map((k) => (
        <text key={`xl-${k}`} x={xFor(k)} y={H - 6} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="middle">
          {k}
        </text>
      ))}
      {/* CI label */}
      <text x={W - PAD_R - 4} y={ciHi - 3} fontSize={9} fill={COLORS.brand} fontFamily={FONT_MONO} textAnchor="end">±1.96/√N = ±{(ci * 100).toFixed(0)}%</text>
    </svg>
  );
}
const CorrelogramChart = memo(CorrelogramChartImpl);

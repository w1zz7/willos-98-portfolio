"use client";

/**
 * Strategy Lab - Pine-style strategy authoring + compile + backtest +
 * overlay visualization, all in-browser.
 *
 * The DSL is JavaScript with a Pine-flavored helper API:
 *   bars[], ind (indicator library), ctx (state), plot(), long(), short(), exit().
 * The host wraps user code in `new Function(...)`, runs it once per bar,
 * collects signals + plot calls, then feeds them to the backtest engine
 * and the QuantChart for overlay rendering.
 *
 * Ships with 6 preset strategies; each one is editable in the textarea.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "../OpenBB";
import {
  type Bar,
  sma,
  ema,
  rsi,
  macd,
  atr,
  bb,
  stoch,
  obv,
  vwap,
  adx,
  donchian,
  ichimoku,
  crossover,
  crossunder,
  highest,
  lowest,
  // Quant primitives
  log_ret,
  cum_log_ret,
  realized_vol_cc,
  realized_vol_pk,
  realized_vol_gk,
  realized_vol_yz,
  rolling_beta,
  rolling_corr,
  sortino,
  information_ratio,
  hurst,
  adf_stat,
  acf,
  pacf,
  rank,
  zscore,
  winsorize,
  pct_change,
} from "./indicators";
import { runFactorRegression, buildFactorReturns } from "./factorRegression";
import { runBacktest, type BacktestResult, type Signal } from "./backtest";
import QuantChart, { type OverlaySeries, type ChartMarker } from "./QuantChart";
import { PRESETS } from "./presets";
import type { PaperTrade } from "./PaperBlotter";
import { SourceBadge, type DataSource } from "../SourceBadge";
import { useLiveQuote } from "@/lib/useLiveQuote";
import SymbolSearch from "../SymbolSearch";

interface ChartResp {
  symbol: string;
  shortName: string | null;
  range: string;
  interval: string;
  points: { t: number; c: number; o?: number; h?: number; l?: number; v?: number }[];
  source?: DataSource;
}

const RANGES: { id: string; label: string; interval: string }[] = [
  { id: "3mo", label: "3M", interval: "1d" },
  { id: "6mo", label: "6M", interval: "1d" },
  { id: "1y", label: "1Y", interval: "1d" },
  { id: "2y", label: "2Y", interval: "1d" },
];

interface PlotCall {
  name: string;
  data: (number | null)[];
  color: string;
  pane: "main" | "sub-rsi" | "sub-macd" | "sub-stoch" | "sub-volume" | "sub-adx";
  style?: "line" | "histogram";
}

const INDICATORS_API = {
  // Quant primitives (the headline)
  log_ret, cum_log_ret,
  realized_vol_cc, realized_vol_pk, realized_vol_gk, realized_vol_yz,
  rolling_beta, rolling_corr, sortino, information_ratio,
  hurst, adf_stat, acf, pacf,
  rank, zscore, winsorize, pct_change,
  // Classics (kept for compatibility)
  sma, ema, rsi, macd, atr, bb, stoch, obv, vwap, adx, donchian, ichimoku,
  crossover, crossunder, highest, lowest,
};

export default function StrategyLab({
  symbol,
  setSymbol,
  onBacktestComplete,
  onTradesEmitted,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  onBacktestComplete: (r: BacktestResult) => void;
  onTradesEmitted: (trades: PaperTrade[]) => void;
}) {
  const [activePreset, setActivePreset] = useState<string>(PRESETS[0].id);
  const [code, setCode] = useState<string>(PRESETS[0].source);
  // Default to 2y so 50/200 SMA crosses, RSI cycles, etc. all have room to fire.
  const [range, setRange] = useState<string>("2y");
  const [bars, setBars] = useState<Bar[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [overlays, setOverlays] = useState<OverlaySeries[]>([]);
  const [markers, setMarkers] = useState<ChartMarker[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const tradeIdRef = useRef<number>(0);

  // Live quote polled every 5s via the shared useLiveQuote hook. The live
  // tick is spliced into `liveBars` (visual) — backtests still run on the
  // immutable `bars` so signal-generation stays reproducible.
  const liveQuote = useLiveQuote(symbol);
  const liveBars: Bar[] = useMemo(() => {
    if (bars.length === 0 || liveQuote?.price == null) return bars;
    const last = bars[bars.length - 1];
    const lp = liveQuote.price;
    if (lp === last.c) return bars;
    const merged: Bar = {
      ...last,
      c: lp,
      h: Math.max(last.h, lp),
      l: Math.min(last.l, lp),
    };
    return [...bars.slice(0, -1), merged];
  }, [bars, liveQuote?.price]);

  // Load bars when symbol/range changes
  useEffect(() => {
    const r = RANGES.find((x) => x.id === range)!;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    fetch(`/api/markets/chart?symbol=${encodeURIComponent(symbol)}&range=${r.id}&interval=${r.interval}`, { signal: ctrl.signal })
      .then(async (r2) => {
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        return r2.json();
      })
      .then((d: ChartResp) => {
        if (!d || !Array.isArray(d.points)) {
          setBars([]);
          setDataSource(null);
          setLoading(false);
          return;
        }
        const bs: Bar[] = d.points.map((p) => ({
          t: p.t,
          o: p.o ?? p.c,
          h: p.h ?? p.c,
          l: p.l ?? p.c,
          c: p.c,
          v: p.v ?? 0,
        }));
        setBars(bs);
        setDataSource(d.source ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setLoading(false);
          setBars([]);
        }
      });
    return () => ctrl.abort();
  }, [symbol, range]);

  // Switch preset → reload code
  const onPickPreset = (id: string) => {
    setActivePreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      setCode(p.source);
      setErrorMsg(null);
      setResult(null);
      setMarkers([]);
      setOverlays([]);
    }
  };

  const runStrategy = () => {
    if (bars.length === 0) {
      setErrorMsg("No bars loaded yet.");
      return;
    }
    setErrorMsg(null);

    // Compile + run
    // Plots are collected by name (last write wins) so that:
    //   - Unconditional plots called every bar are recorded once
    //   - Conditional plots (e.g., `if (ctx.i > 100) plot(...)`) are still captured
    const plotMap: Map<string, PlotCall> = new Map();
    const signals: Signal[] = [];
    type PerBarFn = (
      bars: Bar[],
      ind: typeof INDICATORS_API,
      ctx: { i: number; signals: Signal[]; position: "flat" | "long" | "short"; state: Record<string, unknown> },
      helpers: { plot: (name: string, data: (number | null)[], color: string, pane?: string, style?: string) => void; long: (px: number) => void; short: (px: number) => void; exit: (px: number) => void }
    ) => void;
    let perBarFn: PerBarFn | null = null;

    try {
      // Wrap user code in a function. The user's code runs once per bar.
      // eslint-disable-next-line no-new-func
      perBarFn = new Function(
        "bars", "ind", "ctx", "helpers",
        `const { plot, long, short, exit } = helpers;\n${code}`
      ) as unknown as PerBarFn;
    } catch (e) {
      setErrorMsg(`Compile error: ${(e as Error).message}`);
      return;
    }

    const ctx: { i: number; signals: Signal[]; position: "flat" | "long" | "short"; state: Record<string, unknown> } = {
      i: 0,
      signals,
      position: "flat",
      state: {},
    };

    try {
      for (let i = 0; i < bars.length; i++) {
        ctx.i = i;
        const helpers = {
          plot: (name: string, data: (number | null)[], color: string, pane?: string, style?: string) => {
            // Last-write-wins by name. If user calls plot("foo", ...) every
            // bar with the same series, we just keep the latest reference.
            plotMap.set(name, { name, data, color, pane: (pane as PlotCall["pane"]) ?? "main", style: style as PlotCall["style"] });
          },
          long: (px: number) => {
            signals.push({ t: bars[i].t, type: "long", price: px });
            ctx.position = "long";
          },
          short: (px: number) => {
            signals.push({ t: bars[i].t, type: "short", price: px });
            ctx.position = "short";
          },
          exit: (px: number) => {
            signals.push({ t: bars[i].t, type: "exit", price: px });
            ctx.position = "flat";
          },
        };
        perBarFn!(bars, INDICATORS_API, ctx, helpers);
      }
    } catch (e) {
      setErrorMsg(`Runtime error at bar ${ctx.i}: ${(e as Error).message}`);
      return;
    }

    // Run backtest
    const bt = runBacktest(bars, signals);
    setResult(bt);
    onBacktestComplete(bt);

    // Emit paper trades
    const paperTrades: PaperTrade[] = bt.trades.map((t) => ({
      id: ++tradeIdRef.current,
      symbol,
      side: t.dir,
      qty: 100, // nominal display qty
      entryT: t.entryT,
      entryPx: t.entryPrice,
      exitT: t.exitT,
      exitPx: t.exitPrice,
      pnl: t.pnlAbs,
      status: t.exitT == null ? "open" : "closed",
    }));
    if (paperTrades.length > 0) onTradesEmitted(paperTrades);

    // Overlays
    setOverlays(Array.from(plotMap.values()).map((p) => ({
      name: p.name,
      data: p.data,
      color: p.color,
      pane: p.pane,
      style: p.style,
    })));

    // Markers
    setMarkers(signals.map((s) => ({
      t: s.t,
      type: s.type === "long" ? "entryLong" : s.type === "short" ? "entryShort" : "exit",
      price: s.price,
    })));
  };

  const stats = result?.stats;

  return (
    <div className="h-full flex flex-col" style={{ background: COLORS.bg, fontFamily: FONT_UI }}>
      {/* Top strip: symbol + range + run */}
      <div
        className="flex items-center gap-[14px] px-[14px] py-[8px] shrink-0 flex-wrap"
        style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
      >
        <SymbolSearch
          value={symbol}
          onChange={setSymbol}
          width={120}
          fontSize={14}
        />
        <SourceBadge source={liveQuote?.source ?? dataSource} size="xs" />
        {liveQuote?.price != null && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              fontFamily: FONT_MONO,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
              ${liveQuote.price.toFixed(2)}
            </span>
            {liveQuote.changePct != null && (
              <span
                style={{
                  fontSize: 11,
                  color: liveQuote.changePct >= 0 ? COLORS.up : COLORS.down,
                }}
              >
                {liveQuote.changePct >= 0 ? "+" : ""}
                {liveQuote.changePct.toFixed(2)}%
              </span>
            )}
            <span
              aria-hidden
              title={`Last tick ${new Date(liveQuote.fetchedAt).toLocaleTimeString()}`}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background:
                  (liveQuote.changePct ?? 0) >= 0 ? COLORS.up : COLORS.down,
                boxShadow: `0 0 6px ${(liveQuote.changePct ?? 0) >= 0 ? COLORS.up : COLORS.down}`,
                animation: "willbb-livepulse 1.5s ease-in-out infinite",
                display: "inline-block",
              }}
            />
          </div>
        )}
        <div className="flex gap-[4px]">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              style={{
                background: range === r.id ? COLORS.brandSoft : "transparent",
                border: "1px solid " + (range === r.id ? COLORS.brand : COLORS.borderSoft),
                color: range === r.id ? COLORS.text : COLORS.textDim,
                padding: "3px 9px",
                fontSize: 10,
                fontFamily: FONT_MONO,
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <select
          value={activePreset}
          onChange={(e) => onPickPreset(e.target.value)}
          style={{
            background: COLORS.panelDeep,
            color: COLORS.text,
            border: "1px solid " + COLORS.borderSoft,
            padding: "3px 8px",
            fontSize: 11,
            fontFamily: FONT_MONO,
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={runStrategy}
          style={{
            background: COLORS.brand,
            color: "#000",
            border: "none",
            padding: "5px 14px",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: FONT_MONO,
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          ▶ RUN BACKTEST
        </button>
        {loading && <span style={{ color: COLORS.brand, fontFamily: FONT_MONO, fontSize: 10 }}>loading bars...</span>}
        {errorMsg && (
          <span style={{ color: COLORS.down, fontFamily: FONT_MONO, fontSize: 10 }}>{errorMsg}</span>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Code editor (left ~40%) */}
        <div
          className="flex flex-col"
          style={{
            width: "40%",
            background: COLORS.bg,
            borderRight: "1px solid " + COLORS.border,
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              fontSize: 10,
              color: COLORS.textFaint,
              fontFamily: FONT_MONO,
              letterSpacing: "0.18em",
              borderBottom: "1px solid " + COLORS.borderSoft,
            }}
          >
            STRATEGY · {PRESETS.find((p) => p.id === activePreset)?.category.toUpperCase()}
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              background: COLORS.bg,
              color: COLORS.text,
              border: "none",
              outline: "none",
              padding: "10px 12px",
              fontFamily: FONT_MONO,
              fontSize: 11.5,
              lineHeight: 1.5,
              resize: "none",
              minHeight: 0,
            }}
          />
          <div
            style={{
              padding: "6px 12px",
              fontSize: 10,
              color: COLORS.textFaint,
              fontFamily: FONT_MONO,
              borderTop: "1px solid " + COLORS.borderSoft,
              background: COLORS.panel,
              lineHeight: 1.5,
            }}
          >
            <div><strong style={{ color: COLORS.text }}>Quant API:</strong> ind.<span style={{ color: COLORS.brand }}>log_ret · realized_vol_yz · rolling_beta · sortino · hurst · adf_stat · acf · pacf · rank · zscore · winsorize · pct_change · rolling_corr</span></div>
            <div><strong style={{ color: COLORS.text }}>Classics:</strong> ind.<span style={{ color: COLORS.textDim }}>sma · ema · rsi · macd · atr · bb · stoch · obv · vwap · adx · donchian · ichimoku</span></div>
            <div><strong style={{ color: COLORS.text }}>Helpers:</strong> plot(name, series, color, pane?, style?) · long(px) · short(px) · exit(px) · ctx.<span style={{ color: COLORS.brand }}>i · position · state</span></div>
          </div>
        </div>

        {/* Chart + stats (right ~60%) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <QuantChart
              bars={liveBars}
              overlays={overlays}
              markers={markers}
              height={420}
              livePrice={liveQuote?.price ?? null}
              livePrevClose={liveQuote?.previousClose ?? null}
              watermark={symbol.toUpperCase()}
              marketState={liveQuote?.marketState ?? null}
            />
          </div>
          {stats && (
            <div
              className="grid grid-cols-6 gap-[1px] shrink-0"
              style={{ background: COLORS.border }}
            >
              <Stat label="Total Return" value={fmtPct(stats.totalReturn)} tone={stats.totalReturn >= 0 ? COLORS.up : COLORS.down} />
              <Stat label="Sharpe" value={stats.sharpe.toFixed(2)} tone={stats.sharpe > 0 ? COLORS.up : COLORS.down} />
              <Stat label="Max DD" value={fmtPct(stats.maxDrawdown)} tone={COLORS.down} />
              <Stat label="Win Rate" value={fmtPct(stats.winRate)} tone={COLORS.text} />
              <Stat label="Profit Factor" value={stats.profitFactor.toFixed(2)} tone={stats.profitFactor > 1 ? COLORS.up : COLORS.down} />
              <Stat label="# Trades" value={String(stats.nTrades)} tone={COLORS.text} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 9, color: COLORS.textFaint, letterSpacing: "0.12em", fontFamily: FONT_MONO }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, color: tone, fontWeight: 700, fontFamily: FONT_MONO, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

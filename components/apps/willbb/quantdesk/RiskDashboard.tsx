"use client";

/**
 * PnL Attribution - factor-decomposed risk dashboard.
 *
 *   Top half (single-asset):
 *     Rolling 60d Sharpe + Sortino + Information Ratio
 *     Rolling Yang-Zhang vol vs close-to-close vol
 *     Drawdown chart with depth + duration heat
 *     Returns histogram + QQ-plot vs normal (fat-tail check)
 *
 *   Bottom half (factor decomposition):
 *     Carhart 4-factor regression: alpha, factor loadings, t-stats, R²
 *     Stacked-area rolling factor exposures (Mkt / SMB / HML / MOM)
 *     Variance decomposition: systematic vs idiosyncratic share
 *     Historical VaR/ES (95%/99%) + position-sizing calculator
 *
 *   When a backtest exists in session state, all panels also show the
 *   strategy's series alongside the underlying-asset series.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "../OpenBB";
import {
  log_ret,
  realized_vol_yz,
  realized_vol_cc,
  rolling_beta,
  sortino as sortinoSeries,
  information_ratio as irSeries,
  type Bar,
} from "./indicators";
import { runFactorRegression, buildFactorReturns, type FactorRegressionResult } from "./factorRegression";
import type { BacktestResult } from "./backtest";
import { SourceBadge, type DataSource, aggregateSource } from "../SourceBadge";
import SymbolSearch from "../SymbolSearch";

interface ChartResp {
  symbol: string;
  range: string;
  interval: string;
  points: { t: number; c: number; o?: number; h?: number; l?: number; v?: number }[];
  source?: DataSource;
}

const ROLL_WINDOW = 60;
const FACTOR_ETFS = ["SPY", "IWM", "IUSV", "IUSG", "MTUM"] as const;

export default function RiskDashboard({
  symbol,
  setSymbol,
  lastBacktest,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  lastBacktest: BacktestResult | null;
}) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [factorBars, setFactorBars] = useState<Record<string, number[]>>({});
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  // Position sizer state
  const [accountEq, setAccountEq] = useState<number>(100_000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [entryPx, setEntryPx] = useState<number>(100);
  const [stopPx, setStopPx] = useState<number>(95);

  // Fetch asset bars + 5 factor ETFs
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const allSyms = [symbol, ...FACTOR_ETFS];
    Promise.all(
      allSyms.map((sym) =>
        fetch(`/api/markets/chart?symbol=${encodeURIComponent(sym)}&range=1y&interval=1d`, { signal: ctrl.signal })
          .then(async (r) => (r.ok ? r.json() : { points: [], source: null }))
          .then((d: ChartResp) => ({ sym, points: d.points ?? [], source: d.source ?? null }))
          .catch(() => ({ sym, points: [] as ChartResp["points"], source: null as DataSource }))
      )
    ).then((rows) => {
      const assetRow = rows.find((r) => r.sym === symbol);
      const newBars: Bar[] = (assetRow?.points ?? []).map((p) => ({
        t: p.t,
        o: p.o ?? p.c,
        h: p.h ?? p.c,
        l: p.l ?? p.c,
        c: p.c,
        v: p.v ?? 0,
      }));
      setBars(newBars);
      // Aggregate the asset + 5 factor ETF sources into one badge.
      setDataSource(aggregateSource(rows.map((r) => r.source)));
      const fb: Record<string, number[]> = {};
      for (const sym of FACTOR_ETFS) {
        const r = rows.find((x) => x.sym === sym);
        fb[sym] = (r?.points ?? []).map((p) => p.c);
      }
      setFactorBars(fb);
      setLoading(false);
      if (newBars.length > 0) setEntryPx(newBars[newBars.length - 1].c);
    });
    return () => ctrl.abort();
  }, [symbol]);

  // Compute rolling stats
  const closes = useMemo(() => bars.map((b) => b.c), [bars]);
  const assetRet = useMemo(() => log_ret(closes), [closes]);
  const mktRet = useMemo(() => log_ret(factorBars.SPY ?? []), [factorBars]);

  const rollingSharpe = useMemo(() => {
    const out: { t: number; v: number | null }[] = [];
    for (let i = 0; i < bars.length; i++) {
      if (i < ROLL_WINDOW) { out.push({ t: bars[i].t, v: null }); continue; }
      const window = assetRet.slice(i - ROLL_WINDOW + 1, i + 1).filter((v): v is number => v != null);
      if (window.length < 5) { out.push({ t: bars[i].t, v: null }); continue; }
      const m = window.reduce((a, b) => a + b, 0) / window.length;
      const v = Math.sqrt(window.reduce((a, b) => a + (b - m) ** 2, 0) / (window.length - 1));
      out.push({ t: bars[i].t, v: v > 0 ? (m / v) * Math.sqrt(252) : 0 });
    }
    return out;
  }, [bars, assetRet]);

  const rollingSortino = useMemo(() => {
    const series = sortinoSeries(assetRet, ROLL_WINDOW);
    return bars.map((b, i) => ({ t: b.t, v: series[i] }));
  }, [bars, assetRet]);

  const rollingIR = useMemo(() => {
    const series = irSeries(assetRet, mktRet, ROLL_WINDOW);
    return bars.map((b, i) => ({ t: b.t, v: series[i] }));
  }, [bars, assetRet, mktRet]);

  const rvYZ = useMemo(() => realized_vol_yz(bars, 21).map((v, i) => ({ t: bars[i]?.t ?? 0, v })), [bars]);
  const rvCC = useMemo(() => realized_vol_cc(closes, 21).map((v, i) => ({ t: bars[i]?.t ?? 0, v })), [bars, closes]);

  const drawdown = useMemo(() => {
    const out: { t: number; v: number }[] = [];
    let peak = bars[0]?.c ?? 0;
    for (const b of bars) {
      if (b.c > peak) peak = b.c;
      out.push({ t: b.t, v: peak > 0 ? (b.c - peak) / peak : 0 });
    }
    return out;
  }, [bars]);

  const dailyRet = useMemo(() => assetRet.filter((v): v is number => v != null), [assetRet]);

  const histo = useMemo(() => {
    if (dailyRet.length === 0) return null;
    const NB = 30;
    const sorted = [...dailyRet].sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    const bins: number[] = new Array(NB).fill(0);
    for (const r of dailyRet) {
      const idx = Math.min(NB - 1, Math.max(0, Math.floor(((r - lo) / Math.max(0.0001, hi - lo)) * NB)));
      bins[idx]++;
    }
    const m = dailyRet.reduce((a, b) => a + b, 0) / dailyRet.length;
    const std = Math.sqrt(dailyRet.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, dailyRet.length - 1));
    // Skew + kurt
    const skew = std > 0 ? dailyRet.reduce((a, b) => a + ((b - m) / std) ** 3, 0) / dailyRet.length : 0;
    const kurt = std > 0 ? dailyRet.reduce((a, b) => a + ((b - m) / std) ** 4, 0) / dailyRet.length - 3 : 0;
    return { bins, lo, hi, mean: m, std, skew, excessKurt: kurt };
  }, [dailyRet]);

  // QQ plot data: (sorted standardized empirical, theoretical normal quantile)
  const qqData = useMemo(() => {
    if (!histo || dailyRet.length < 30) return null;
    const sorted = [...dailyRet].sort((a, b) => a - b);
    const n = sorted.length;
    const out: { theoretical: number; empirical: number }[] = [];
    for (let i = 0; i < n; i++) {
      const p = (i + 0.5) / n; // plotting position
      const theoretical = inverseStdNormal(p); // standardized quantile
      const empirical = (sorted[i] - histo.mean) / histo.std;
      out.push({ theoretical, empirical });
    }
    return out;
  }, [dailyRet, histo]);

  // VaR readouts
  const varStats = useMemo(() => {
    if (dailyRet.length < 30) return null;
    const sorted = [...dailyRet].sort((a, b) => a - b);
    const var95 = sorted[Math.floor(sorted.length * 0.05)];
    const var99 = sorted[Math.floor(sorted.length * 0.01)];
    const cvar95 = sorted.slice(0, Math.floor(sorted.length * 0.05)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(sorted.length * 0.05));
    const cvar99 = sorted.slice(0, Math.floor(sorted.length * 0.01)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(sorted.length * 0.01));
    return {
      var95_1d: var95,
      var99_1d: var99,
      cvar95_1d: cvar95,
      cvar99_1d: cvar99,
      var95_10d: var95 * Math.sqrt(10),
      var99_10d: var99 * Math.sqrt(10),
    };
  }, [dailyRet]);

  // Factor regression
  const factorReg = useMemo<FactorRegressionResult | null>(() => {
    const f = factorBars;
    if (!f.SPY || !f.IWM || !f.IUSV || !f.IUSG || !f.MTUM || f.SPY.length < 50) return null;
    const factors = buildFactorReturns({
      SPY: f.SPY,
      IWM: f.IWM,
      IUSV: f.IUSV,
      IUSG: f.IUSG,
      MTUM: f.MTUM,
    });
    return runFactorRegression(assetRet, factors);
  }, [factorBars, assetRet]);

  // Rolling factor exposures (60-day rolling betas to each factor)
  const rollingExposures = useMemo(() => {
    if (!factorBars.SPY) return null;
    const factors = buildFactorReturns({
      SPY: factorBars.SPY ?? [],
      IWM: factorBars.IWM ?? [],
      IUSV: factorBars.IUSV ?? [],
      IUSG: factorBars.IUSG ?? [],
      MTUM: factorBars.MTUM ?? [],
    });
    return {
      Mkt: rolling_beta(assetRet, factors.Mkt, ROLL_WINDOW),
      SMB: rolling_beta(assetRet, factors.SMB, ROLL_WINDOW),
      HML: rolling_beta(assetRet, factors.HML, ROLL_WINDOW),
      MOM: rolling_beta(assetRet, factors.MOM, ROLL_WINDOW),
      times: bars.map((b) => b.t),
    };
  }, [factorBars, assetRet, bars]);

  // Position sizer
  const sizing = useMemo(() => {
    const dollarsAtRisk = accountEq * (riskPct / 100);
    const stopDist = Math.abs(entryPx - stopPx);
    const shares = stopDist > 0 ? Math.floor(dollarsAtRisk / stopDist) : 0;
    const positionDollars = shares * entryPx;
    const leverage = positionDollars / accountEq;
    return { dollarsAtRisk, shares, positionDollars, leverage };
  }, [accountEq, riskPct, entryPx, stopPx]);

  return (
    <div className="h-full overflow-y-auto" style={{ background: COLORS.bg, fontFamily: FONT_UI }}>
      <div
        className="flex items-center gap-[14px] px-[14px] py-[8px] shrink-0"
        style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
      >
        <SymbolSearch
          value={symbol}
          onChange={setSymbol}
          width={140}
          fontSize={14}
        />
        <SourceBadge source={dataSource} size="xs" />
        <span style={{ fontSize: 10, color: COLORS.textFaint, fontFamily: FONT_MONO }}>
          factor regression vs (Mkt-RF / SMB / HML / MOM) · 1y daily window
        </span>
        {loading && <span style={{ color: COLORS.brand, fontFamily: FONT_MONO, fontSize: 10 }}>loading {symbol} + factor ETFs…</span>}
      </div>

      {/* Top: rolling stats + drawdown + histogram + QQ plot */}
      <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border }}>
        <Panel title={`Rolling 60-day Sharpe / Sortino / IR · ${symbol}`}>
          <TripleRollingChart
            sharpe={rollingSharpe}
            sortino={rollingSortino}
            ir={rollingIR}
          />
        </Panel>
        <Panel title={`Realized vol — Yang-Zhang vs close-to-close · ${symbol}`}>
          <DualRollingChart yz={rvYZ} cc={rvCC} />
        </Panel>
        <Panel title={`Drawdown · ${symbol}`}>
          <DrawdownChart data={drawdown} />
        </Panel>
        <Panel title={`Returns distribution + QQ vs normal · last 1y`}>
          <ReturnsHistAndQQ histo={histo} qqData={qqData} />
        </Panel>
      </div>

      {/* Factor regression header */}
      <div style={{ background: COLORS.bg, padding: 12, borderTop: "1px solid " + COLORS.border }}>
        <SectionTitle>Carhart 4-Factor Regression · {symbol} log returns vs (Mkt-RF / SMB / HML / MOM)</SectionTitle>
        {factorReg ? (
          <FactorRegressionPanel result={factorReg} />
        ) : (
          <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14 }}>
            loading factor ETFs (SPY / IWM / IUSV / IUSG / MTUM)…
          </div>
        )}
      </div>

      {/* Rolling factor exposures + risk decomposition */}
      <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border, marginTop: 1 }}>
        <Panel title="Rolling factor exposures (60-day)">
          {rollingExposures ? <RollingExposuresChart data={rollingExposures} /> : <div style={{ color: COLORS.textFaint, padding: 14, fontSize: 11, fontFamily: FONT_MONO }}>loading…</div>}
        </Panel>
        <Panel title="Variance decomposition (systematic vs idiosyncratic)">
          {factorReg ? <VarianceDecomp result={factorReg} /> : <div style={{ color: COLORS.textFaint, padding: 14, fontSize: 11, fontFamily: FONT_MONO }}>loading…</div>}
        </Panel>
      </div>

      {/* VaR + position sizer + last backtest */}
      <div className="grid grid-cols-3 gap-[1px]" style={{ background: COLORS.border, marginTop: 1 }}>
        <Panel title="Historical VaR / ES (1d / 10d)">
          {varStats ? (
            <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border }}>
              <Stat label="1d VaR(95%)" value={fmtPct(varStats.var95_1d)} tone={COLORS.down} />
              <Stat label="1d VaR(99%)" value={fmtPct(varStats.var99_1d)} tone={COLORS.down} />
              <Stat label="1d ES(95%)" value={fmtPct(varStats.cvar95_1d)} tone={COLORS.down} />
              <Stat label="1d ES(99%)" value={fmtPct(varStats.cvar99_1d)} tone={COLORS.down} />
              <Stat label="10d VaR(95%)" value={fmtPct(varStats.var95_10d)} tone={COLORS.down} />
              <Stat label="10d VaR(99%)" value={fmtPct(varStats.var99_10d)} tone={COLORS.down} />
            </div>
          ) : (
            <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 10 }}>need more bars</div>
          )}
          <div style={{ fontSize: 10, color: COLORS.textFaint, padding: 8, lineHeight: 1.5 }}>
            Historical-simulation method on the trailing 1y. ES = average loss in the tail past VaR. 10-day = 1-day × √10 (square-root-of-time scaling).
          </div>
        </Panel>

        <Panel title="Position Sizer (fixed-fractional Kelly-style)">
          <div className="space-y-[8px]" style={{ padding: 10, fontSize: 11, fontFamily: FONT_MONO, color: COLORS.textDim }}>
            <NumInput label="Account equity ($)" value={accountEq} onChange={setAccountEq} />
            <NumInput label="Risk per trade (%)" value={riskPct} onChange={setRiskPct} step={0.1} />
            <NumInput label="Entry price ($)" value={entryPx} onChange={setEntryPx} step={0.01} />
            <NumInput label="Stop price ($)" value={stopPx} onChange={setStopPx} step={0.01} />
            <div style={{ borderTop: "1px solid " + COLORS.borderSoft, paddingTop: 8, marginTop: 8 }}>
              <SizerRow label="Dollars at risk" value={`$${sizing.dollarsAtRisk.toFixed(0)}`} />
              <SizerRow label="Position size (shares)" value={sizing.shares.toLocaleString()} tone={COLORS.brand} />
              <SizerRow label="Notional" value={`$${sizing.positionDollars.toLocaleString()}`} />
              <SizerRow label="Leverage" value={`${sizing.leverage.toFixed(2)}x`} tone={sizing.leverage > 1 ? COLORS.up : COLORS.text} />
            </div>
          </div>
        </Panel>

        <Panel title="Last Alpha Lab backtest · equity curve">
          {lastBacktest ? (
            <EquityCurveMini equity={lastBacktest.equity} startCapital={lastBacktest.stats.startCapital} />
          ) : (
            <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14, lineHeight: 1.5 }}>
              No backtest run yet. Switch to <strong style={{ color: COLORS.text }}>Alpha Lab</strong>, pick a preset, and click <strong style={{ color: COLORS.brand }}>RUN BACKTEST</strong> — the equity curve will appear here.
            </div>
          )}
        </Panel>
      </div>

      {/* Footer note */}
      {histo && (
        <div style={{ background: COLORS.panel, padding: "8px 14px", borderTop: "1px solid " + COLORS.border, fontSize: 10, color: COLORS.textFaint, fontFamily: FONT_MONO, lineHeight: 1.5 }}>
          μ = {fmtPct(histo.mean)} · σ = {fmtPct(histo.std)} · skew = {histo.skew.toFixed(2)} · excess kurt = {histo.excessKurt.toFixed(2)}
          {Math.abs(histo.skew) > 0.5 && <span> · <span style={{ color: COLORS.down }}>significant skew</span></span>}
          {histo.excessKurt > 1 && <span> · <span style={{ color: COLORS.down }}>fat tails</span> (kurt &gt; 1)</span>}
        </div>
      )}
    </div>
  );
}

// ===== Components =====

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: COLORS.textFaint,
        fontFamily: FONT_MONO,
        letterSpacing: "0.18em",
        marginBottom: 8,
        ...style,
      }}
    >
      {String(children).toUpperCase()}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.panel, minHeight: 200 }}>
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
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ background: COLORS.panel, padding: "6px 10px" }}>
      <div style={{ fontSize: 9, color: COLORS.textFaint, letterSpacing: "0.12em", fontFamily: FONT_MONO }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: tone, fontWeight: 700, fontFamily: FONT_MONO, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function NumInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex justify-between items-center">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        style={{
          width: 100,
          background: COLORS.bg,
          border: "1px solid " + COLORS.borderSoft,
          color: COLORS.text,
          padding: "2px 6px",
          fontSize: 11,
          fontFamily: FONT_MONO,
          textAlign: "right",
        }}
      />
    </label>
  );
}

function SizerRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between" style={{ padding: "3px 0", fontSize: 11, fontFamily: FONT_MONO }}>
      <span style={{ color: COLORS.textDim }}>{label}</span>
      <span style={{ color: tone ?? COLORS.text, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function TripleRollingChart({
  sharpe,
  sortino,
  ir,
}: {
  sharpe: { t: number; v: number | null }[];
  sortino: { t: number; v: number | null }[];
  ir: { t: number; v: number | null }[];
}) {
  const W = 600, H = 160, PAD_L = 38, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const allValid = [
    ...sharpe.map((d) => d.v),
    ...sortino.map((d) => d.v),
    ...ir.map((d) => d.v),
  ].filter((v): v is number => v != null);
  if (allValid.length === 0) {
    return <div style={{ color: COLORS.textFaint, padding: 14, fontFamily: FONT_MONO, fontSize: 11 }}>computing…</div>;
  }
  const lo = Math.min(...allValid);
  const hi = Math.max(...allValid);
  const xFor = (i: number) => PAD_L + (i / Math.max(1, sharpe.length - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => H - PAD_B - ((v - lo) / Math.max(0.001, hi - lo)) * (H - PAD_T - PAD_B);
  function lineFor(arr: { t: number; v: number | null }[]): string {
    const pts: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].v != null) pts.push(`${xFor(i)},${yFor(arr[i].v as number)}`);
    }
    return pts.join(" ");
  }
  const zeroY = lo < 0 && hi > 0 ? yFor(0) : null;
  const lastSharpe = lastValid(sharpe);
  const lastSortino = lastValid(sortino);
  const lastIR = lastValid(ir);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
      {zeroY != null && <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke={COLORS.borderSoft} strokeDasharray="2,3" />}
      <polyline points={lineFor(sharpe)} fill="none" stroke="#33BBFF" strokeWidth={1.6} />
      <polyline points={lineFor(sortino)} fill="none" stroke="#5dd39e" strokeWidth={1.4} opacity={0.85} />
      <polyline points={lineFor(ir)} fill="none" stroke="#f0a020" strokeWidth={1.4} opacity={0.85} />
      <text x={PAD_L} y={12} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>{hi.toFixed(2)}</text>
      <text x={PAD_L} y={H - 24} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>{lo.toFixed(2)}</text>
      <g transform={`translate(${PAD_L + 4}, 12)`} fontFamily={FONT_MONO} fontSize={10}>
        <text x={0} y={0} fill="#33BBFF">Sharpe {lastSharpe?.toFixed(2) ?? "-"}</text>
        <text x={70} y={0} fill="#5dd39e">Sortino {lastSortino?.toFixed(2) ?? "-"}</text>
        <text x={140} y={0} fill="#f0a020">IR vs SPY {lastIR?.toFixed(2) ?? "-"}</text>
      </g>
    </svg>
  );
}

function lastValid(arr: { v: number | null }[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].v != null) return arr[i].v as number;
  return null;
}

function DualRollingChart({
  yz,
  cc,
}: {
  yz: { t: number; v: number | null }[];
  cc: { t: number; v: number | null }[];
}) {
  const W = 600, H = 160, PAD_L = 38, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const allValid = [...yz, ...cc].map((d) => d.v).filter((v): v is number => v != null);
  if (allValid.length === 0) return <div style={{ color: COLORS.textFaint, padding: 14, fontFamily: FONT_MONO, fontSize: 11 }}>computing…</div>;
  const lo = 0;
  const hi = Math.max(...allValid) * 1.05;
  const xFor = (i: number) => PAD_L + (i / Math.max(1, yz.length - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => H - PAD_B - ((v - lo) / Math.max(0.001, hi - lo)) * (H - PAD_T - PAD_B);
  function lineFor(arr: { t: number; v: number | null }[]): string {
    const pts: string[] = [];
    for (let i = 0; i < arr.length; i++) if (arr[i].v != null) pts.push(`${xFor(i)},${yFor(arr[i].v as number)}`);
    return pts.join(" ");
  }
  const lastYZ = lastValid(yz);
  const lastCC = lastValid(cc);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
      <polyline points={lineFor(cc)} fill="none" stroke="#9a8df0" strokeWidth={1.2} opacity={0.7} />
      <polyline points={lineFor(yz)} fill="none" stroke="#33BBFF" strokeWidth={1.6} />
      <text x={PAD_L} y={12} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>{(hi * 100).toFixed(0)}%</text>
      <text x={PAD_L} y={H - 24} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>0%</text>
      <g transform={`translate(${PAD_L + 4}, 12)`} fontFamily={FONT_MONO} fontSize={10}>
        <text x={0} y={0} fill="#33BBFF">Yang-Zhang {lastYZ != null ? `${(lastYZ * 100).toFixed(1)}%` : "-"}</text>
        <text x={130} y={0} fill="#9a8df0">close-to-close {lastCC != null ? `${(lastCC * 100).toFixed(1)}%` : "-"}</text>
      </g>
    </svg>
  );
}

function DrawdownChart({ data }: { data: { t: number; v: number }[] }) {
  if (data.length === 0) return null;
  const W = 600, H = 160, PAD_L = 38, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const lo = Math.min(...data.map((d) => d.v));
  const xFor = (i: number) => PAD_L + (i / Math.max(1, data.length - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => PAD_T + (v / lo) * (H - PAD_T - PAD_B);
  const points = data.map((d, i) => `${xFor(i)},${yFor(d.v)}`).join(" ");
  const closingPoints = `${xFor(data.length - 1)},${PAD_T} ${xFor(0)},${PAD_T}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
      <polygon points={`${points} ${closingPoints}`} fill={COLORS.down} opacity={0.25} />
      <polyline points={points} fill="none" stroke={COLORS.down} strokeWidth={1.4} />
      <text x={PAD_L} y={12} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>0%</text>
      <text x={PAD_L} y={H - 24} fontSize={9} fill={COLORS.down} fontFamily={FONT_MONO}>{(lo * 100).toFixed(1)}%</text>
    </svg>
  );
}

function ReturnsHistAndQQ({
  histo,
  qqData,
}: {
  histo: { bins: number[]; lo: number; hi: number; mean: number; std: number; skew: number; excessKurt: number } | null;
  qqData: { theoretical: number; empirical: number }[] | null;
}) {
  if (!histo) return <div style={{ color: COLORS.textFaint, padding: 14 }}>computing…</div>;
  const W = 600, H = 160;
  const histW = W * 0.55;
  const qqX = histW + 16;
  const qqW = W - qqX - 12;

  // Hist
  const PAD_L = 36, PAD_R = 6, PAD_T = 12, PAD_B = 22;
  const maxC = Math.max(...histo.bins, 1);
  const NB = histo.bins.length;
  const bw = (histW - PAD_L - PAD_R) / NB;
  const xForVal = (v: number) => PAD_L + ((v - histo.lo) / Math.max(0.0001, histo.hi - histo.lo)) * (histW - PAD_L - PAD_R);

  // QQ
  const qqValid = qqData ?? [];
  const qqMin = Math.min(...qqValid.map((d) => Math.min(d.theoretical, d.empirical)), -3);
  const qqMax = Math.max(...qqValid.map((d) => Math.max(d.theoretical, d.empirical)), 3);
  const qqXFor = (v: number) => qqX + 4 + ((v - qqMin) / Math.max(0.001, qqMax - qqMin)) * (qqW - 8);
  const qqYFor = (v: number) => H - PAD_B - ((v - qqMin) / Math.max(0.001, qqMax - qqMin)) * (H - PAD_T - PAD_B);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
      {/* HISTOGRAM */}
      {histo.bins.map((c, i) => {
        const x = PAD_L + i * bw;
        const h = (c / maxC) * (H - PAD_T - PAD_B);
        const cx = histo.lo + ((i + 0.5) / NB) * (histo.hi - histo.lo);
        const color = cx >= 0 ? COLORS.up : COLORS.down;
        return <rect key={i} x={x + 0.5} y={H - PAD_B - h} width={Math.max(0.5, bw - 1)} height={Math.max(0.5, h)} fill={color} opacity={0.7} />;
      })}
      <line x1={xForVal(histo.mean)} y1={PAD_T} x2={xForVal(histo.mean)} y2={H - PAD_B} stroke={COLORS.text} strokeWidth={1} strokeDasharray="3,3" />
      <line x1={xForVal(histo.mean - histo.std)} y1={PAD_T} x2={xForVal(histo.mean - histo.std)} y2={H - PAD_B} stroke={COLORS.textDim} strokeWidth={0.5} strokeDasharray="2,3" />
      <line x1={xForVal(histo.mean + histo.std)} y1={PAD_T} x2={xForVal(histo.mean + histo.std)} y2={H - PAD_B} stroke={COLORS.textDim} strokeWidth={0.5} strokeDasharray="2,3" />
      <text x={PAD_L + 2} y={12} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>HISTOGRAM</text>

      {/* QQ PLOT */}
      <line
        x1={qqXFor(qqMin)}
        y1={qqYFor(qqMin)}
        x2={qqXFor(qqMax)}
        y2={qqYFor(qqMax)}
        stroke={COLORS.brand}
        strokeWidth={1}
        strokeDasharray="3,3"
        opacity={0.5}
      />
      {qqValid.map((d, i) => (
        <circle key={i} cx={qqXFor(d.theoretical)} cy={qqYFor(d.empirical)} r={1.5} fill={Math.abs(d.empirical) > Math.abs(d.theoretical) * 1.5 ? COLORS.down : COLORS.text} />
      ))}
      <text x={qqX + 4} y={12} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>QQ vs N(0,1)</text>
      <text x={qqXFor(0)} y={H - 6} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="middle">theoretical</text>
    </svg>
  );
}

function FactorRegressionPanel({ result }: { result: FactorRegressionResult }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12, alignItems: "center", padding: "8px 0" }}>
      <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border }}>
        <Stat label="α (annualized)" value={fmtPct(result.alphaAnnualized)} tone={result.alphaAnnualized > 0 ? COLORS.up : COLORS.down} />
        <Stat label="α t-stat" value={result.alphaTStat.toFixed(2)} tone={Math.abs(result.alphaTStat) > 1.96 ? COLORS.up : COLORS.textDim} />
        <Stat label="R²" value={`${(result.rSquared * 100).toFixed(1)}%`} tone={COLORS.text} />
        <Stat label="N" value={`${result.n}d`} tone={COLORS.textDim} />
      </div>
      <table style={{ width: "100%", fontSize: 11, fontFamily: FONT_MONO }}>
        <thead>
          <tr style={{ color: COLORS.textFaint }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>FACTOR</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>β</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>t-STAT</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>SIGNIFICANCE</th>
          </tr>
        </thead>
        <tbody>
          {result.loadings.map((ld) => (
            <tr key={ld.factor} style={{ borderTop: "1px solid " + COLORS.borderSoft }}>
              <td style={{ padding: "4px 8px", color: COLORS.textDim }}>{ld.factor}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", color: COLORS.text }}>{ld.beta.toFixed(3)}</td>
              <td
                style={{
                  padding: "4px 8px",
                  textAlign: "right",
                  color: Math.abs(ld.tStat) > 1.96 ? (ld.tStat > 0 ? COLORS.up : COLORS.down) : COLORS.textDim,
                }}
              >
                {ld.tStat.toFixed(2)}
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  textAlign: "right",
                  color: Math.abs(ld.tStat) > 2.58 ? COLORS.up : Math.abs(ld.tStat) > 1.96 ? COLORS.brand : COLORS.textFaint,
                  fontSize: 10,
                }}
              >
                {Math.abs(ld.tStat) > 2.58 ? "*** 99%" : Math.abs(ld.tStat) > 1.96 ? "** 95%" : Math.abs(ld.tStat) > 1.65 ? "* 90%" : "ns"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: COLORS.textFaint, lineHeight: 1.5 }}>
        Mkt = SPY−RF. SMB = IWM−SPY (small minus large). HML = IUSV−IUSG (value minus growth). MOM = MTUM−SPY. RF = 5%/yr. ETF-spread proxies for the Fama-French 4 factors.
      </div>
    </div>
  );
}

function VarianceDecomp({ result }: { result: FactorRegressionResult }) {
  const sysPct = result.systematicShare * 100;
  const idioPct = result.idiosyncraticShare * 100;
  return (
    <div style={{ padding: 14 }}>
      <div style={{ height: 30, display: "flex", border: "1px solid " + COLORS.borderSoft, marginBottom: 12 }}>
        <div
          style={{
            width: `${sysPct}%`,
            background: COLORS.brand,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#000",
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {sysPct.toFixed(0)}% systematic
        </div>
        <div
          style={{
            width: `${idioPct}%`,
            background: COLORS.panelDeep,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.textDim,
            fontFamily: FONT_MONO,
            fontSize: 11,
          }}
        >
          {idioPct.toFixed(0)}% idiosyncratic
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border }}>
        <Stat label="Total σ (daily)" value={fmtPct(result.totalVol)} tone={COLORS.text} />
        <Stat label="Idio σ (daily)" value={fmtPct(result.residualVol)} tone={COLORS.textDim} />
      </div>
      <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 10, lineHeight: 1.5, fontFamily: FONT_UI }}>
        High idiosyncratic share (&gt;50%) means most variance is stock-specific, not factor-driven — typical of small-cap / event-driven names.
        High systematic share (&gt;70%) means a factor-replicating ETF would explain most of the move.
      </div>
    </div>
  );
}

function RollingExposuresChart({ data }: { data: { Mkt: (number | null)[]; SMB: (number | null)[]; HML: (number | null)[]; MOM: (number | null)[]; times: number[] } }) {
  const W = 600, H = 200, PAD_L = 38, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const allValid = [
    ...data.Mkt, ...data.SMB, ...data.HML, ...data.MOM,
  ].filter((v): v is number => v != null);
  if (allValid.length === 0) return <div style={{ color: COLORS.textFaint, padding: 14, fontFamily: FONT_MONO, fontSize: 11 }}>computing…</div>;
  const lo = Math.min(...allValid);
  const hi = Math.max(...allValid);
  const xFor = (i: number) => PAD_L + (i / Math.max(1, data.times.length - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => H - PAD_B - ((v - lo) / Math.max(0.001, hi - lo)) * (H - PAD_T - PAD_B);
  function lineFor(arr: (number | null)[], color: string) {
    const pts: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] != null) pts.push(`${xFor(i)},${yFor(arr[i] as number)}`);
    }
    return <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.4} opacity={0.85} />;
  }
  const zeroY = lo < 0 && hi > 0 ? yFor(0) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
      {zeroY != null && <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke={COLORS.borderSoft} strokeDasharray="2,3" />}
      {lineFor(data.Mkt, "#33BBFF")}
      {lineFor(data.SMB, "#5dd39e")}
      {lineFor(data.HML, "#f0a020")}
      {lineFor(data.MOM, "#e063b8")}
      <text x={PAD_L} y={12} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>{hi.toFixed(2)}</text>
      <text x={PAD_L} y={H - 24} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO}>{lo.toFixed(2)}</text>
      <g transform={`translate(${PAD_L + 4}, 12)`} fontFamily={FONT_MONO} fontSize={10}>
        <text x={0} y={0} fill="#33BBFF">β Mkt</text>
        <text x={50} y={0} fill="#5dd39e">β SMB</text>
        <text x={100} y={0} fill="#f0a020">β HML</text>
        <text x={150} y={0} fill="#e063b8">β MOM</text>
      </g>
    </svg>
  );
}

function EquityCurveMini({ equity, startCapital }: { equity: { t: number; v: number }[]; startCapital: number }) {
  const W = 600, H = 200, PAD = 30;
  if (equity.length === 0) return null;
  const lo = Math.min(...equity.map((e) => e.v));
  const hi = Math.max(...equity.map((e) => e.v));
  const xFor = (i: number) => PAD + (i / Math.max(1, equity.length - 1)) * (W - 2 * PAD);
  const yFor = (v: number) => H - PAD - ((v - lo) / Math.max(0.001, hi - lo)) * (H - 2 * PAD);
  const points = equity.map((e, i) => `${xFor(i)},${yFor(e.v)}`).join(" ");
  const startY = yFor(startCapital);
  const finalV = equity[equity.length - 1].v;
  const totalReturn = (finalV - startCapital) / startCapital;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
      <line x1={PAD} y1={startY} x2={W - PAD} y2={startY} stroke={COLORS.borderSoft} strokeDasharray="2,3" />
      <polyline points={points} fill="none" stroke={totalReturn >= 0 ? COLORS.up : COLORS.down} strokeWidth={1.6} />
      <text x={PAD} y={12} fontSize={10} fill={COLORS.textFaint} fontFamily={FONT_MONO}>
        ${lo.toFixed(0)} → ${hi.toFixed(0)} · final {totalReturn >= 0 ? "+" : ""}{(totalReturn * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

/**
 * Acklam's inverse standard normal CDF. Used for QQ-plot theoretical
 * quantiles. Accurate to ~6 decimal places, no external dep.
 */
function inverseStdNormal(p: number): number {
  // Clamp to (0, 1) - prevents -Infinity / +Infinity at the empirical CDF
  // boundaries (e.g., when sample size is small enough that p = 0 or 1 occur).
  p = Math.max(1e-15, Math.min(1 - 1e-15, p));
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return -((((-7.784894002430293e-3 * q + -3.223964580411365e-1) * q + -2.400758277161838) * q + -2.549732539343734) * q + 4.374664141464968) /
      ((((7.784695709041462e-3 * q + 3.224671290700398e-1) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1);
  }
  if (p > 0.97575) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return ((((-7.784894002430293e-3 * q + -3.223964580411365e-1) * q + -2.400758277161838) * q + -2.549732539343734) * q + 4.374664141464968) /
      ((((7.784695709041462e-3 * q + 3.224671290700398e-1) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((-3.969683028665376e1 * r + 2.209460984245205e2) * r + -2.759285104469687e2) * r + 1.383577518672690e2) * r + -3.066479806614716e1) * q + (-2.506628277459239) /
    (((((-5.447609879822406e1 * r + 1.615858368580409e2) * r + -1.556989798598866e2) * r + 6.680131188771972e1) * r + -1.328068155288572e1) * r + 1);
}

"use client";

/**
 * Cross-Section - the cross-sectional alpha factory.
 *
 *   Watchlist heatmap        day's % change tiles, sorted descending
 *   Sector rotation strip    11 SPDR sector ETFs (XLK/XLF/...) bars
 *   Correlation matrix       12-asset rolling Pearson r
 *   Decile sort (HEADLINE)   pick a signal (12-1 mom, 1m reversal, vol),
 *                            sort universe into quintiles, show:
 *                              - decile-mean forward returns (bar chart)
 *                              - Information Coefficient (Spearman r)
 *                              - IC decay across forward horizons
 *                              - L/S equity curve (top-Q minus bottom-Q)
 */

import { useEffect, useMemo, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "../OpenBB";
import { WATCHLIST_ORDER } from "../symbols";
import { SourceBadge, type DataSource, aggregateSource } from "../SourceBadge";

interface QuoteLite {
  symbol: string;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
}
interface QuotesResp { quotes: QuoteLite[]; fetchedAt: number; }

interface ChartResp {
  symbol: string;
  range: string;
  interval: string;
  points: { t: number; c: number }[];
  source?: import("../SourceBadge").DataSource;
}

const SECTOR_ETFS = ["XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE", "XLC"];

const HEATMAP_SYMS: string[] = WATCHLIST_ORDER.slice(0, 48);

const CORR_SYMS = ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "GOOG", "AMZN", "META", "TSLA", "AMD", "NFLX", "AVGO"];

// Universe for decile sort - liquid large-caps + a few mid-caps
const DECILE_UNIVERSE = [
  "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META", "TSLA", "AMD",
  "AVGO", "NFLX", "ORCL", "CRM", "INTC", "CSCO", "PYPL", "QCOM",
  "BAC", "JPM", "V", "MA", "UNH", "JNJ", "PFE", "MRK",
  "WMT", "HD", "PG", "KO", "PEP", "MCD", "NKE", "DIS",
];

type SignalType = "mom_12_1" | "reversal_1m" | "volatility" | "rank_drawdown";

interface SignalDef {
  id: SignalType;
  label: string;
  description: string;
  formula: string;
  /** Higher signal value = MORE bullish (true) or MORE bearish (false). */
  ascending: boolean;
}

const SIGNALS: SignalDef[] = [
  {
    id: "mom_12_1",
    label: "12-1 Momentum",
    description: "Price 12 months ago vs 1 month ago. Standard cross-sectional momentum.",
    formula: "(p[t-21] − p[t-252]) / p[t-252]",
    ascending: true,
  },
  {
    id: "reversal_1m",
    label: "1-month Reversal",
    description: "1-month return, inverted. Short winners / long losers.",
    formula: "−(p[t] − p[t-21]) / p[t-21]",
    ascending: true,
  },
  {
    id: "volatility",
    label: "Low Volatility",
    description: "Inverse of 60-day realized vol. Long stable, short turbulent.",
    formula: "−σ_60(log_ret)",
    ascending: true,
  },
  {
    id: "rank_drawdown",
    label: "Drawdown Recovery",
    description: "Distance from 1-year high. Long stocks closer to 52-week high.",
    formula: "p[t] / max(p[t-252:t])",
    ascending: true,
  },
];

const Q = 5; // number of quantiles

export default function Scanner({ onPickSymbol }: { onPickSymbol: (s: string) => void }) {
  const [heatmapQuotes, setHeatmapQuotes] = useState<QuoteLite[]>([]);
  const [sectorQuotes, setSectorQuotes] = useState<QuoteLite[]>([]);
  const [correlations, setCorrelations] = useState<number[][] | null>(null);
  const [loadingCorr, setLoadingCorr] = useState<boolean>(false);

  // Decile sort state
  const [signalType, setSignalType] = useState<SignalType>("mom_12_1");
  const [universeCloses, setUniverseCloses] = useState<{ symbol: string; closes: number[] }[]>([]);
  const [loadingUniverse, setLoadingUniverse] = useState<boolean>(false);
  const [universeSource, setUniverseSource] = useState<DataSource>(null);

  // Heatmap + sector quotes
  useEffect(() => {
    const ctrl = new AbortController();
    const allSyms = [...HEATMAP_SYMS, ...SECTOR_ETFS];
    fetch(`/api/markets/quotes?symbols=${allSyms.join(",")}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<QuotesResp>)
      .then((d) => {
        setHeatmapQuotes(d.quotes.filter((q) => HEATMAP_SYMS.includes(q.symbol)));
        setSectorQuotes(d.quotes.filter((q) => SECTOR_ETFS.includes(q.symbol)));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Correlation matrix
  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingCorr(true);
    Promise.all(
      CORR_SYMS.map((sym) =>
        fetch(`/api/markets/chart?symbol=${sym}&range=3mo&interval=1d`, { signal: ctrl.signal })
          .then(async (r) => (r.ok ? r.json() : { points: [] }))
          .then((d: ChartResp) => {
            const closes = (d.points ?? []).map((p) => p.c);
            const rets: number[] = [];
            for (let i = 1; i < closes.length; i++) {
              if (closes[i - 1] > 0) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
            }
            return rets;
          })
          .catch(() => [] as number[])
      )
    )
      .then((retsBySymbol) => {
        const n = retsBySymbol.length;
        const matrix: number[][] = [];
        for (let i = 0; i < n; i++) {
          const row: number[] = [];
          for (let j = 0; j < n; j++) row.push(pearson(retsBySymbol[i], retsBySymbol[j]));
          matrix.push(row);
        }
        setCorrelations(matrix);
        setLoadingCorr(false);
      })
      .catch(() => setLoadingCorr(false));
    return () => ctrl.abort();
  }, []);

  // Decile-sort universe data: 1y of daily closes for each ticker
  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingUniverse(true);
    Promise.all(
      DECILE_UNIVERSE.map((sym) =>
        fetch(`/api/markets/chart?symbol=${sym}&range=2y&interval=1d`, { signal: ctrl.signal })
          .then(async (r) => (r.ok ? r.json() : { points: [], source: null }))
          .then((d: ChartResp) => ({
            symbol: sym,
            closes: (d.points ?? []).map((p) => p.c),
            source: d.source ?? null,
          }))
          .catch(() => ({ symbol: sym, closes: [] as number[], source: null as DataSource }))
      )
    )
      .then((rows) => {
        setUniverseCloses(rows.filter((r) => r.closes.length > 252));
        setUniverseSource(aggregateSource(rows.map((r) => r.source)));
        setLoadingUniverse(false);
      })
      .catch(() => setLoadingUniverse(false));
    return () => ctrl.abort();
  }, []);

  const sectorSorted = useMemo(() => {
    return [...sectorQuotes].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
  }, [sectorQuotes]);

  // Compute decile sort + IC + IC decay + L/S equity curve
  const decileResult = useMemo(() => {
    if (universeCloses.length < Q * 2) return null;
    return computeDecileSort(universeCloses, signalType);
  }, [universeCloses, signalType]);

  return (
    <div className="h-full overflow-y-auto" style={{ background: COLORS.bg, fontFamily: FONT_UI }}>
      {/* Top: heatmaps + correlation */}
      <div className="grid grid-cols-2 gap-[1px]" style={{ background: COLORS.border }}>
        <div style={{ background: COLORS.bg, padding: 12 }}>
          <SectionTitle>Watchlist Heatmap (top 48 · day % change)</SectionTitle>
          <HeatmapGrid quotes={heatmapQuotes} onPick={onPickSymbol} />
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Sector Rotation (SPDR ETFs · today)</SectionTitle>
            <SectorRotationBars quotes={sectorSorted} />
          </div>
        </div>
        <div style={{ background: COLORS.bg, padding: 12 }}>
          <SectionTitle>12-Asset Return Correlation (last 60 daily bars)</SectionTitle>
          {loadingCorr || !correlations ? (
            <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14 }}>
              loading correlations…
            </div>
          ) : (
            <CorrelationMatrix symbols={CORR_SYMS} matrix={correlations} onPick={onPickSymbol} />
          )}
          <div style={{ marginTop: 14, fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>
            <strong style={{ color: COLORS.text }}>How to read:</strong> green = highly correlated, red = inverse. Diversification potential lives in the red cells.
          </div>
        </div>
      </div>

      {/* Decile sort - the headline */}
      <div style={{ background: COLORS.bg, padding: 12, borderTop: "1px solid " + COLORS.border }}>
        <div className="flex items-center gap-[14px] mb-[10px]">
          <SectionTitle style={{ margin: 0 }}>Cross-Sectional Decile Sort · Alpha Factory</SectionTitle>
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value as SignalType)}
            style={{
              background: COLORS.panelDeep,
              color: COLORS.text,
              border: "1px solid " + COLORS.borderSoft,
              padding: "4px 10px",
              fontSize: 11,
              fontFamily: FONT_MONO,
            }}
          >
            {SIGNALS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: COLORS.textFaint, fontFamily: FONT_MONO }}>
            universe: {DECILE_UNIVERSE.length} large-caps · sample: {universeCloses.length} loaded
          </span>
          <SourceBadge source={universeSource} size="xs" />
        </div>

        {loadingUniverse || !decileResult ? (
          <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14 }}>
            building universe (32 chart fetches)…
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-[1px]" style={{ background: COLORS.border }}>
            {/* Decile bar chart */}
            <div style={{ gridColumn: "span 4", background: COLORS.panel, padding: 10 }}>
              <SectionTitle>Q1 → Q5 mean forward 21d return</SectionTitle>
              <DecileBarChart deciles={decileResult.decileReturns} />
              <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 6, lineHeight: 1.4, fontFamily: FONT_MONO }}>
                Spread (Q5 − Q1): <span style={{ color: decileResult.spread > 0 ? COLORS.up : COLORS.down }}>{(decileResult.spread * 100).toFixed(2)}%</span>
                {" · "}
                IC: <span style={{ color: Math.abs(decileResult.ic) > 0.1 ? COLORS.up : COLORS.textDim }}>{decileResult.ic.toFixed(3)}</span>
              </div>
            </div>

            {/* IC decay */}
            <div style={{ gridColumn: "span 4", background: COLORS.panel, padding: 10 }}>
              <SectionTitle>IC decay across forward horizons</SectionTitle>
              <ICDecayChart icDecay={decileResult.icDecay} />
              <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 6, lineHeight: 1.4, fontFamily: FONT_MONO }}>
                Spearman rank IC computed at h ∈ &#123;1, 5, 10, 21, 42, 63&#125; days.
                Higher absolute IC = stronger signal.
              </div>
            </div>

            {/* L/S equity curve */}
            <div style={{ gridColumn: "span 4", background: COLORS.panel, padding: 10 }}>
              <SectionTitle>Q5-long / Q1-short cumulative PnL (no costs)</SectionTitle>
              <LongShortEquityChart curve={decileResult.lsCurve} />
              <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 6, lineHeight: 1.4, fontFamily: FONT_MONO }}>
                Daily-rebalanced top-quintile long, bottom-quintile short.
                Sharpe (gross): <span style={{ color: decileResult.lsSharpe > 0 ? COLORS.up : COLORS.down }}>{decileResult.lsSharpe.toFixed(2)}</span>
                {" · "}
                Max DD: <span style={{ color: COLORS.down }}>{(decileResult.lsMaxDD * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}

        {decileResult && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim, lineHeight: 1.55 }}>
            <strong style={{ color: COLORS.text }}>Method:</strong> at each rebalance date, rank the {DECILE_UNIVERSE.length}-name universe by{" "}
            <em style={{ color: COLORS.brand, fontFamily: FONT_MONO }}>{SIGNALS.find((s) => s.id === signalType)?.formula}</em>.
            Sort into Q=5 quintiles. Compute the mean 21-day forward return per quintile.
            <strong style={{ color: COLORS.text }}> IC</strong> = Spearman rank correlation between the signal and the realized forward return.
            A positive monotone bar pattern (Q1 &lt; Q2 &lt; … &lt; Q5) means the signal works; a flat or non-monotone pattern means it&apos;s noise.
            Walk-forward through 12 months of dailies; signal recomputed each rebalance.
          </div>
        )}
      </div>
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

function HeatmapGrid({ quotes, onPick }: { quotes: QuoteLite[]; onPick: (s: string) => void }) {
  if (quotes.length === 0) {
    return <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14 }}>loading quotes…</div>;
  }
  const sorted = [...quotes].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
      {sorted.map((q) => {
        const pct = q.changePct ?? 0;
        const intensity = Math.min(1, Math.abs(pct) / 5);
        const color = pct >= 0
          ? `rgba(93, 211, 158, ${0.15 + intensity * 0.55})`
          : `rgba(240, 104, 106, ${0.15 + intensity * 0.55})`;
        return (
          <button
            key={q.symbol}
            type="button"
            onClick={() => onPick(q.symbol)}
            style={{
              background: color,
              border: "1px solid " + COLORS.borderSoft,
              padding: "8px 4px",
              cursor: "pointer",
              textAlign: "center",
              minHeight: 50,
              fontFamily: FONT_MONO,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.text }}>{q.symbol}</div>
            <div style={{ fontSize: 10, color: pct >= 0 ? COLORS.up : COLORS.down, marginTop: 2 }}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SectorRotationBars({ quotes }: { quotes: QuoteLite[] }) {
  if (quotes.length === 0) return <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: FONT_MONO, padding: 14 }}>loading sectors…</div>;
  const maxAbs = Math.max(...quotes.map((q) => Math.abs(q.changePct ?? 0)), 0.5);
  return (
    <div className="space-y-[2px]">
      {quotes.map((q) => {
        const pct = q.changePct ?? 0;
        const w = (Math.abs(pct) / maxAbs) * 100;
        return (
          <div key={q.symbol} className="flex items-center" style={{ fontSize: 11, color: COLORS.text, fontFamily: FONT_MONO, padding: "3px 0" }}>
            <span style={{ width: 50, color: COLORS.textDim }}>{q.symbol}</span>
            <div style={{ flex: 1, position: "relative", height: 16, background: COLORS.panel }}>
              <div style={{ position: "absolute", left: pct >= 0 ? "50%" : `${50 - w / 2}%`, top: 0, width: `${w / 2}%`, height: "100%", background: pct >= 0 ? COLORS.up : COLORS.down, opacity: 0.85 }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: COLORS.borderSoft }} />
            </div>
            <span style={{ width: 60, textAlign: "right", color: pct >= 0 ? COLORS.up : COLORS.down }}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function CorrelationMatrix({ symbols, matrix, onPick }: { symbols: string[]; matrix: number[][]; onPick: (s: string) => void }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `40px repeat(${symbols.length}, 1fr)` }}>
      <div></div>
      {symbols.map((s) => (
        <div key={`h-${s}`} style={{ fontSize: 9, color: COLORS.textFaint, fontFamily: FONT_MONO, textAlign: "center", padding: "4px 0", cursor: "pointer" }} onClick={() => onPick(s)}>{s}</div>
      ))}
      {symbols.map((rowSym, ri) => (
        <Row key={rowSym} ri={ri} rowSym={rowSym} symbols={symbols} matrix={matrix} onPick={onPick} />
      ))}
    </div>
  );
}

function Row({ ri, rowSym, symbols, matrix, onPick }: { ri: number; rowSym: string; symbols: string[]; matrix: number[][]; onPick: (s: string) => void }) {
  return (
    <>
      <div style={{ fontSize: 9, color: COLORS.textFaint, fontFamily: FONT_MONO, padding: "4px 6px", cursor: "pointer" }} onClick={() => onPick(rowSym)}>{rowSym}</div>
      {symbols.map((_, ci) => {
        const r = matrix[ri][ci];
        const intensity = Math.abs(r);
        const color = r >= 0 ? `rgba(93, 211, 158, ${intensity * 0.85})` : `rgba(240, 104, 106, ${intensity * 0.85})`;
        const textColor = intensity > 0.55 ? "#fff" : COLORS.textDim;
        return (
          <div key={`c-${ri}-${ci}`} style={{ background: color, border: "1px solid " + COLORS.borderSoft, padding: "5px 0", fontSize: 9.5, color: textColor, fontFamily: FONT_MONO, textAlign: "center", minHeight: 24 }}>{r.toFixed(2)}</div>
        );
      })}
    </>
  );
}

function DecileBarChart({ deciles }: { deciles: number[] }) {
  const W = 280, H = 130, PAD_L = 30, PAD_R = 8, PAD_T = 8, PAD_B = 22;
  const maxAbs = Math.max(...deciles.map(Math.abs), 0.0001);
  const xFor = (i: number) => PAD_L + (i + 0.5) * ((W - PAD_L - PAD_R) / deciles.length);
  const bw = (W - PAD_L - PAD_R) / deciles.length * 0.7;
  const yZero = PAD_T + (H - PAD_T - PAD_B) / 2;
  const yFor = (v: number) => yZero - (v / maxAbs) * (H - PAD_T - PAD_B) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150 }}>
      <line x1={PAD_L} y1={yZero} x2={W - PAD_R} y2={yZero} stroke={COLORS.borderSoft} strokeWidth={0.5} />
      {deciles.map((v, i) => {
        const x = xFor(i);
        const y = yFor(v);
        const top = Math.min(yZero, y);
        const h = Math.abs(y - yZero);
        return (
          <g key={i}>
            <rect
              x={x - bw / 2}
              y={top}
              width={bw}
              height={Math.max(0.5, h)}
              fill={v >= 0 ? COLORS.up : COLORS.down}
              opacity={0.85}
            />
            <text x={x} y={H - 6} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="middle">Q{i + 1}</text>
            <text x={x} y={top - 3} fontSize={8} fill={v >= 0 ? COLORS.up : COLORS.down} fontFamily={FONT_MONO} textAnchor="middle">{(v * 100).toFixed(2)}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function ICDecayChart({ icDecay }: { icDecay: { h: number; ic: number }[] }) {
  const W = 280, H = 130, PAD_L = 28, PAD_R = 8, PAD_T = 8, PAD_B = 22;
  const maxAbs = Math.max(...icDecay.map((d) => Math.abs(d.ic)), 0.05);
  const yZero = PAD_T + (H - PAD_T - PAD_B) / 2;
  const xFor = (i: number) => PAD_L + (i / Math.max(1, icDecay.length - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => yZero - (v / maxAbs) * (H - PAD_T - PAD_B) / 2;
  const points = icDecay.map((d, i) => `${xFor(i)},${yFor(d.ic)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150 }}>
      <line x1={PAD_L} y1={yZero} x2={W - PAD_R} y2={yZero} stroke={COLORS.borderSoft} strokeWidth={0.5} />
      <polyline points={points} fill="none" stroke={COLORS.brand} strokeWidth={1.5} />
      {icDecay.map((d, i) => (
        <g key={i}>
          <circle cx={xFor(i)} cy={yFor(d.ic)} r={3} fill={d.ic > 0 ? COLORS.up : COLORS.down} />
          <text x={xFor(i)} y={H - 6} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="middle">{d.h}d</text>
        </g>
      ))}
      <text x={PAD_L - 4} y={yFor(maxAbs) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">+{maxAbs.toFixed(2)}</text>
      <text x={PAD_L - 4} y={yFor(-maxAbs) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">−{maxAbs.toFixed(2)}</text>
    </svg>
  );
}

function LongShortEquityChart({ curve }: { curve: number[] }) {
  const W = 280, H = 130, PAD_L = 28, PAD_R = 8, PAD_T = 8, PAD_B = 22;
  if (curve.length === 0) return <div style={{ color: COLORS.textFaint, padding: 12 }}>insufficient data</div>;
  const lo = Math.min(...curve);
  const hi = Math.max(...curve);
  const xFor = (i: number) => PAD_L + (i / Math.max(1, curve.length - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => H - PAD_B - ((v - lo) / Math.max(0.001, hi - lo)) * (H - PAD_T - PAD_B);
  const points = curve.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
  const final = curve[curve.length - 1];
  const tone = final > 1 ? COLORS.up : COLORS.down;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150 }}>
      <line x1={PAD_L} y1={yFor(1)} x2={W - PAD_R} y2={yFor(1)} stroke={COLORS.borderSoft} strokeDasharray="2,3" />
      <polyline points={points} fill="none" stroke={tone} strokeWidth={1.6} />
      <text x={PAD_L - 4} y={yFor(hi) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">{hi.toFixed(2)}x</text>
      <text x={PAD_L - 4} y={yFor(lo) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">{lo.toFixed(2)}x</text>
      <text x={W - PAD_R - 4} y={yFor(final) - 4} fontSize={10} fill={tone} fontFamily={FONT_MONO} textAnchor="end">{final.toFixed(2)}x</text>
    </svg>
  );
}

// ===== Math: decile sort + IC + IC decay + L/S =====

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  function rankArr(arr: number[]): number[] {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) ranks[indexed[i].i] = i + 1;
    return ranks;
  }
  return pearson(rankArr(xs), rankArr(ys));
}

interface DecileResult {
  decileReturns: number[]; // length Q
  ic: number; // Spearman r between signal and forward return, averaged across rebalance dates
  icDecay: { h: number; ic: number }[];
  lsCurve: number[]; // cumulative equity (1.0 start) of Q5-long Q1-short
  lsSharpe: number;
  lsMaxDD: number;
  spread: number; // Q5 mean − Q1 mean
}

function computeSignal(closes: number[], idx: number, type: SignalType): number | null {
  switch (type) {
    case "mom_12_1": {
      if (idx < 252) return null;
      const p1 = closes[idx - 21];
      const p2 = closes[idx - 252];
      if (p2 == null || p2 <= 0) return null;
      return (p1 - p2) / p2;
    }
    case "reversal_1m": {
      if (idx < 21) return null;
      const p1 = closes[idx];
      const p2 = closes[idx - 21];
      if (p2 == null || p2 <= 0) return null;
      return -((p1 - p2) / p2);
    }
    case "volatility": {
      if (idx < 60) return null;
      const lr: number[] = [];
      for (let j = idx - 59; j <= idx; j++) {
        if (j > 0 && closes[j - 1] > 0 && closes[j] > 0) lr.push(Math.log(closes[j] / closes[j - 1]));
      }
      if (lr.length < 5) return null;
      const m = lr.reduce((a, b) => a + b, 0) / lr.length;
      const s = Math.sqrt(lr.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, lr.length - 1));
      return -s; // low-vol = high signal
    }
    case "rank_drawdown": {
      if (idx < 252) return null;
      let mx = -Infinity;
      for (let j = idx - 252; j <= idx; j++) if (closes[j] > mx) mx = closes[j];
      if (mx <= 0) return null;
      return closes[idx] / mx;
    }
  }
}

function forwardReturn(closes: number[], idx: number, h: number): number | null {
  if (idx + h >= closes.length) return null;
  const p0 = closes[idx];
  const p1 = closes[idx + h];
  if (p0 <= 0) return null;
  return (p1 - p0) / p0;
}

function computeDecileSort(
  universe: { symbol: string; closes: number[] }[],
  signalType: SignalType
): DecileResult {
  // Find min length
  const minLen = Math.min(...universe.map((u) => u.closes.length));
  // Rebalance every 21 trading days, look back ≥252 for 12-1 mom
  const startIdx = 252;
  const fwdHorizon = 21;
  const rebalanceStep = 21;

  const decileReturns: number[][] = Array.from({ length: Q }, () => []);
  const allICs: number[] = [];
  const lsReturns: number[] = []; // per-rebalance L/S returns

  for (let t = startIdx; t < minLen - fwdHorizon; t += rebalanceStep) {
    // Compute signal + forward return for each name
    const rows: { sym: string; sig: number; fwd: number }[] = [];
    for (const u of universe) {
      const s = computeSignal(u.closes, t, signalType);
      const fwd = forwardReturn(u.closes, t, fwdHorizon);
      if (s == null || fwd == null) continue;
      rows.push({ sym: u.symbol, sig: s, fwd });
    }
    if (rows.length < Q * 2) continue;

    // Sort by signal ascending → assign to quintile
    const sorted = [...rows].sort((a, b) => a.sig - b.sig);
    const perQ = Math.floor(sorted.length / Q);
    const buckets: { sym: string; sig: number; fwd: number }[][] = [];
    for (let q = 0; q < Q; q++) {
      buckets.push(sorted.slice(q * perQ, q === Q - 1 ? sorted.length : (q + 1) * perQ));
    }
    for (let q = 0; q < Q; q++) {
      const fwds = buckets[q].map((r) => r.fwd);
      const meanF = fwds.reduce((a, b) => a + b, 0) / fwds.length;
      decileReturns[q].push(meanF);
    }

    // IC: Spearman r between signal and forward return
    const sigs = rows.map((r) => r.sig);
    const fwds = rows.map((r) => r.fwd);
    allICs.push(spearman(sigs, fwds));

    // L/S return: long Q5, short Q1, daily rebalance
    const longRet = buckets[Q - 1].map((r) => r.fwd).reduce((a, b) => a + b, 0) / buckets[Q - 1].length;
    const shortRet = buckets[0].map((r) => r.fwd).reduce((a, b) => a + b, 0) / buckets[0].length;
    lsReturns.push(longRet - shortRet);
  }

  // Aggregate
  const decileMeans = decileReturns.map((arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0));
  const ic = allICs.length > 0 ? allICs.reduce((a, b) => a + b, 0) / allICs.length : 0;

  // IC decay across forward horizons
  const horizons = [1, 5, 10, 21, 42, 63];
  const icDecay = horizons.map((h) => {
    const ics: number[] = [];
    for (let t = startIdx; t < minLen - h; t += 21) {
      const rows: { sig: number; fwd: number }[] = [];
      for (const u of universe) {
        const s = computeSignal(u.closes, t, signalType);
        const fwd = forwardReturn(u.closes, t, h);
        if (s == null || fwd == null) continue;
        rows.push({ sig: s, fwd });
      }
      if (rows.length >= Q * 2) {
        ics.push(spearman(rows.map((r) => r.sig), rows.map((r) => r.fwd)));
      }
    }
    return { h, ic: ics.length > 0 ? ics.reduce((a, b) => a + b, 0) / ics.length : 0 };
  });

  // L/S equity curve + stats
  const lsCurve: number[] = [1];
  for (const r of lsReturns) lsCurve.push(lsCurve[lsCurve.length - 1] * (1 + r));
  // Rebalance is 21 days → annualize: returns occur every 21 days, so
  // annualization factor is √(252/21) ≈ √12. Sharpe = mean / σ × √(252/21).
  const lsM = lsReturns.reduce((a, b) => a + b, 0) / Math.max(1, lsReturns.length);
  const lsV = lsReturns.reduce((a, b) => a + (b - lsM) ** 2, 0) / Math.max(1, lsReturns.length - 1);
  const lsStd = Math.sqrt(lsV);
  const lsSharpe = lsStd > 0 ? (lsM / lsStd) * Math.sqrt(252 / 21) : 0;
  // Max DD on curve
  let peak = lsCurve[0];
  let maxDD = 0;
  for (const v of lsCurve) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return {
    decileReturns: decileMeans,
    ic,
    icDecay,
    lsCurve,
    lsSharpe,
    lsMaxDD: maxDD,
    spread: decileMeans[Q - 1] - decileMeans[0],
  };
}

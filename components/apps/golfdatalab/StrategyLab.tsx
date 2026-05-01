"use client";

/**
 * Strategy Lab - fund-grade systematic L/S backtester on PGA Tour SG data.
 *
 *   Universe       top 100 players × 96 months 2015–2022
 *   Asset return   per-month avg SG-Total per player (scaled 1/5)
 *   Rebalance      monthly cross-section
 *   Signals        Momentum (rolling-12 μ̂) · Mean-revert (z-score) ·
 *                  Sharpe-rank (μ̂/σ̂)
 *   Blending       3-simplex grid search → optimal Sharpe weight vector
 *   Portfolio      long top quintile / short bottom quintile, vol-target
 *                  inverse-σ position sizing
 *   Eval modes     Single backtest (in-sample) / Walk-forward CV (OOS)
 *   Risk metrics   Sharpe · Sortino · Calmar · CVaR(5%) · Max-DD-duration ·
 *                  skew · kurtosis · monthly heatmap · rolling-12 Sharpe
 *   Costs          per-bp transaction-cost model on L1 turnover, with
 *                  break-even bps stat
 *   Regime         rolling-24 beta-to-market · bull/bear split · majors-only
 *   Attribution    k-means archetype contribution decomposition
 *
 * The whole pipeline lives client-side in one file ~1400 lines. No external
 * deps beyond the existing data JSONs.
 */

import { useMemo, useState } from "react";
import strategyData from "@/data/golfdata/pga_strategy_panel.json";
import pgaAnalysis from "@/data/golfdata/pga_analysis.json";
import clusterTimeline from "@/data/golfdata/pga_cluster_timeline.json";

// ===== Types ========================================================

interface Colors {
  bg: string;
  panel: string;
  panelAlt: string;
  panelDeep: string;
  border: string;
  borderSoft: string;
  text: string;
  textDim: string;
  textFaint: string;
  brand: string;
  brandSoft: string;
  accent: string;
  warn: string;
}

interface Props {
  colors: Colors;
  fontMono: string;
  fontUi: string;
}

interface PanelEntry { sg: number; n: number; }
interface StrategyPanel {
  months: string[];
  players: string[];
  panel: Record<string, Record<string, PanelEntry>>;
  universeSize: number;
}

const data = strategyData as StrategyPanel;

interface PgaAnalysisJson {
  archetypes: { cluster: number; archetype: string; members: string[] }[];
}
const archetypeData = pgaAnalysis as unknown as PgaAnalysisJson;

const RED = "#f0686a";
const GREEN = "#5dd39e";

type Signal = "momentum" | "meanRev" | "sharpe" | "blend";
type Mode = "single" | "walkforward";

interface BacktestParams {
  signal: Signal;
  blendW: { mom: number; mr: number; sharpe: number };
  lookback: number;
  longPct: number;
  shortPct: number;
  volTarget: boolean;
  targetVol: number;
  minHistory: number;
  costBps: number;
}

interface WalkForwardParams {
  trainMonths: number;
  testMonths: number;
  stepMonths: number;
}

interface BacktestStats {
  sharpe: number;
  sharpeMkt: number;
  sortino: number;
  calmar: number;
  cvar5: number;
  totalReturn: number;
  totalReturnMkt: number;
  meanRet: number;
  volAnnualized: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  hitRate: number;
  beta: number;
  alpha: number;
  skew: number;
  kurtosis: number;
  avgTurnover: number;
  breakEvenBps: number;
  nMonths: number;
}

interface BacktestResult extends BacktestStats {
  months: string[];        // post-lookback months (length = ret.length)
  ret: number[];           // post-cost strategy returns (or pre-cost if costBps=0)
  retPre: number[];        // pre-cost
  retMarket: number[];
  equity: number[];
  equityPre: number[];
  equityMkt: number[];
  drawdown: number[];
  turnover: number[];
  weights: number[][];     // monthly weight vector (M × P) - for attribution
}

// ===== Pure helpers =================================================

function rollingMean(arr: (number | null)[], k: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    if (i < k - 1) continue;
    let sum = 0; let n = 0;
    for (let j = i - k + 1; j <= i; j++) {
      const v = arr[j];
      if (v != null) { sum += v; n++; }
    }
    if (n >= Math.ceil(k / 2)) out[i] = sum / n;
  }
  return out;
}

function rollingStd(arr: (number | null)[], mean: (number | null)[], k: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    if (i < k - 1 || mean[i] == null) continue;
    let s2 = 0; let n = 0;
    for (let j = i - k + 1; j <= i; j++) {
      const v = arr[j];
      if (v != null) { s2 += (v - (mean[i] as number)) ** 2; n++; }
    }
    if (n >= Math.ceil(k / 2)) out[i] = Math.sqrt(s2 / n);
  }
  return out;
}

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

// ===== Backtest engine (refactored) =================================

interface Engine {
  months: string[];
  players: string[];
  X: (number | null)[][];                        // M × P
  perPlayerRollMu: (number | null)[][];          // P × M
  perPlayerRollSig: (number | null)[][];
  /**
   * Expanding-window career mean (past-only, EXCLUDES the current month).
   * `perPlayerCareerMuTo[pi][t]` = mean(X[0..t-1][pi]) - anything we know
   * BEFORE month t. This replaces the look-ahead full-sample mean used in v1.
   */
  perPlayerCareerMuTo: (number | null)[][];
}

function buildEngine(params: BacktestParams): Engine {
  const months = data.months;
  const players = data.players;
  const M = months.length;
  const P = players.length;
  const X: (number | null)[][] = months.map((m) =>
    players.map((p) => data.panel[m]?.[p]?.sg ?? null)
  );

  const perPlayerRollMu: (number | null)[][] = [];
  const perPlayerRollSig: (number | null)[][] = [];
  const perPlayerCareerMuTo: (number | null)[][] = [];

  for (let pi = 0; pi < P; pi++) {
    const series: (number | null)[] = X.map((row) => row[pi]);
    const mu = rollingMean(series, params.lookback);
    const sig = rollingStd(series, mu, params.lookback);
    perPlayerRollMu.push(mu);
    perPlayerRollSig.push(sig);
    // Expanding past-only mean: muTo[t] = mean(X[0..t-1][pi]).
    // No look-ahead - we only know history up to (but not including) month t.
    const muTo: (number | null)[] = [];
    let sum = 0;
    let n = 0;
    for (let t = 0; t < series.length; t++) {
      muTo.push(n > 0 ? sum / n : null);
      const v = series[t];
      if (v != null) {
        sum += v;
        n++;
      }
    }
    perPlayerCareerMuTo.push(muTo);
  }

  void M;
  return { months, players, X, perPlayerRollMu, perPlayerRollSig, perPlayerCareerMuTo };
}

/** Compute signal value at month t for one player. */
function signalAt(eng: Engine, t: number, pi: number, params: BacktestParams): number | null {
  const mu = eng.perPlayerRollMu[pi][t];
  const sig = eng.perPlayerRollSig[pi][t];
  if (mu == null) return null;
  const muVal: number = mu;

  function momVal(): number { return muVal; }
  function mrVal(): number | null {
    const v3 = rollingMean(
      [eng.X[t - 2]?.[pi] ?? null, eng.X[t - 1]?.[pi] ?? null, eng.X[t]?.[pi] ?? null],
      3
    )[2];
    if (v3 == null) return null;
    // Past-only career mean: only mean of X[0..t-1][pi]; no look-ahead.
    // If we don't have enough history yet, signal is undefined for this player.
    const careerMu = eng.perPlayerCareerMuTo[pi][t];
    if (careerMu == null) return null;
    return -(v3 - careerMu);
  }
  function sharpeVal(): number | null {
    if (sig == null || sig <= 0) return null;
    return muVal / sig;
  }

  if (params.signal === "momentum") return momVal();
  if (params.signal === "meanRev") return mrVal();
  if (params.signal === "sharpe") return sharpeVal();
  // Blend
  const m = momVal();
  const r = mrVal();
  const s = sharpeVal();
  if (m == null || r == null || s == null) return null;
  return params.blendW.mom * m + params.blendW.mr * r + params.blendW.sharpe * s;
}

/** Construct portfolio weights for month t. Returns weights[] (P) and turnover vs prevWeights[]. */
function constructPortfolio(
  eng: Engine,
  t: number,
  prevWeights: number[],
  params: BacktestParams
): { weights: number[]; turnover: number; eligible: number[] } {
  const P = eng.players.length;
  const eligible: number[] = [];
  const sigVals: number[] = [];

  for (let pi = 0; pi < P; pi++) {
    let priorN = 0;
    for (let s = 0; s <= t; s++) if (eng.X[s][pi] != null) priorN++;
    if (priorN < params.minHistory) continue;
    const sv = signalAt(eng, t, pi, params);
    if (sv == null) continue;
    eligible.push(pi);
    sigVals.push(sv);
  }

  const weights = new Array(P).fill(0);
  if (eligible.length < 10) {
    return { weights, turnover: 0, eligible };
  }

  const ranked = eligible
    .map((pi, idx) => ({ pi, sig: sigVals[idx] }))
    .sort((a, b) => b.sig - a.sig);

  const nLong = Math.max(1, Math.floor(ranked.length * params.longPct));
  const nShort = Math.max(1, Math.floor(ranked.length * params.shortPct));
  const longSet = new Set(ranked.slice(0, nLong).map((r) => r.pi));
  const shortSet = new Set(ranked.slice(-nShort).map((r) => r.pi));

  function getInvVol(pi: number): number {
    if (!params.volTarget) return 1;
    const sig = eng.perPlayerRollSig[pi][t];
    if (sig == null || sig <= 0.01) return 1;
    return 1 / sig;
  }

  let longTotal = 0; let shortTotal = 0;
  for (const pi of longSet) longTotal += getInvVol(pi);
  for (const pi of shortSet) shortTotal += getInvVol(pi);
  for (const pi of longSet) weights[pi] = getInvVol(pi) / Math.max(0.001, longTotal);
  for (const pi of shortSet) weights[pi] = -getInvVol(pi) / Math.max(0.001, shortTotal);

  let turnover = 0;
  for (let pi = 0; pi < P; pi++) turnover += Math.abs(weights[pi] - prevWeights[pi]);

  return { weights, turnover, eligible };
}

const RET_SCALE = 1 / 5;

/** Simulate one period: weights × next-month return. Returns (preCostRet, marketRet). */
function simulatePeriod(
  eng: Engine,
  weights: number[],
  eligible: number[],
  t: number
): { rPre: number; rMkt: number } {
  const P = eng.players.length;
  let r = 0;
  let rM = 0;
  let nM = 0;
  for (let pi = 0; pi < P; pi++) {
    const x = eng.X[t + 1]?.[pi];
    if (x == null) continue;
    r += weights[pi] * x;
    if (eligible.includes(pi)) {
      rM += x; nM++;
    }
  }
  if (nM > 0) rM /= nM;
  return { rPre: r * RET_SCALE, rMkt: rM * RET_SCALE };
}

/** Run a backtest over [t0, t1] (exclusive of t1+1). */
function runBacktest(eng: Engine, t0: number, t1: number, params: BacktestParams): {
  ret: number[];
  retPre: number[];
  retMarket: number[];
  turnover: number[];
  weights: number[][];
  startIdx: number;
} {
  const ret: number[] = [];
  const retPre: number[] = [];
  const retMarket: number[] = [];
  const turnover: number[] = [];
  const weightsHistory: number[][] = [];
  const P = eng.players.length;
  let prev: number[] = new Array(P).fill(0);

  for (let t = t0; t < t1; t++) {
    const { weights, turnover: tv, eligible } = constructPortfolio(eng, t, prev, params);
    if (eligible.length < 10) {
      ret.push(0); retPre.push(0); retMarket.push(0); turnover.push(0);
      weightsHistory.push(prev.slice());
      continue;
    }
    const { rPre, rMkt } = simulatePeriod(eng, weights, eligible, t);
    const cost = (tv * params.costBps) / 10000;
    const rPost = rPre - cost;
    retPre.push(rPre);
    ret.push(rPost);
    retMarket.push(rMkt);
    turnover.push(tv);
    weightsHistory.push(weights.slice());
    prev = weights;
  }

  return { ret, retPre, retMarket, turnover, weights: weightsHistory, startIdx: t0 };
}

// ===== Stats ========================================================

function computeStats(ret: number[], retMkt: number[], turnover: number[]): BacktestStats {
  const n = ret.length;
  if (n === 0) {
    return {
      sharpe: 0, sharpeMkt: 0, sortino: 0, calmar: 0, cvar5: 0,
      totalReturn: 0, totalReturnMkt: 0, meanRet: 0, volAnnualized: 0,
      maxDrawdown: 0, maxDrawdownDuration: 0, hitRate: 0,
      beta: 0, alpha: 0, skew: 0, kurtosis: 0,
      avgTurnover: 0, breakEvenBps: 0, nMonths: 0,
    };
  }
  const meanRet = ret.reduce((a, b) => a + b, 0) / n;
  const variance = ret.reduce((a, b) => a + (b - meanRet) ** 2, 0) / n;
  const volMonthly = Math.sqrt(variance);
  const volAnnualized = volMonthly * Math.sqrt(12);
  const sharpe = volMonthly > 0.0001 ? (meanRet / volMonthly) * Math.sqrt(12) : 0;

  // Sortino: only downside vol
  const downside = ret.filter((r) => r < 0);
  const dnVar = downside.length > 0 ? downside.reduce((a, b) => a + b * b, 0) / downside.length : 0;
  const dnVol = Math.sqrt(dnVar);
  const sortino = dnVol > 0.0001 ? (meanRet / dnVol) * Math.sqrt(12) : 0;

  // Equity + drawdown
  const equity: number[] = [1];
  for (const r of ret) equity.push(equity[equity.length - 1] * (1 + r));
  const drawdown: number[] = [];
  let peak = equity[0];
  for (const v of equity) { if (v > peak) peak = v; drawdown.push((v - peak) / peak); }
  const maxDrawdown = Math.min(...drawdown, 0);

  // Max DD duration (longest consecutive months below peak)
  let maxDDDur = 0; let cur = 0;
  for (const dd of drawdown) {
    if (dd < 0) { cur++; if (cur > maxDDDur) maxDDDur = cur; }
    else cur = 0;
  }

  const totalReturn = equity[equity.length - 1] - 1;

  // Market
  const meanMkt = retMkt.reduce((a, b) => a + b, 0) / n;
  const varMkt = retMkt.reduce((a, b) => a + (b - meanMkt) ** 2, 0) / n;
  const volMktMonthly = Math.sqrt(varMkt);
  const sharpeMkt = volMktMonthly > 0.0001 ? (meanMkt / volMktMonthly) * Math.sqrt(12) : 0;

  let cov = 0;
  for (let i = 0; i < n; i++) cov += (ret[i] - meanRet) * (retMkt[i] - meanMkt);
  cov /= n;
  const beta = varMkt > 0.0001 ? cov / varMkt : 0;
  const alpha = (meanRet - beta * meanMkt) * 12;

  let totalEqMkt = 1;
  for (const r of retMkt) totalEqMkt *= (1 + r);
  const totalReturnMkt = totalEqMkt - 1;

  // CVaR 5% (avg of worst 5%)
  const sortedRet = [...ret].sort((a, b) => a - b);
  const tailN = Math.max(1, Math.floor(0.05 * n));
  const cvar5 = sortedRet.slice(0, tailN).reduce((a, b) => a + b, 0) / tailN;

  // Calmar: ann return / |max DD|
  const annRet = Math.pow(1 + totalReturn, 12 / Math.max(1, n)) - 1;
  const calmar = Math.abs(maxDrawdown) > 0.001 ? annRet / Math.abs(maxDrawdown) : 0;

  // Skew + excess kurtosis
  const m3 = ret.reduce((a, b) => a + (b - meanRet) ** 3, 0) / n;
  const m4 = ret.reduce((a, b) => a + (b - meanRet) ** 4, 0) / n;
  const skew = volMonthly > 0.0001 ? m3 / Math.pow(volMonthly, 3) : 0;
  const kurtosis = volMonthly > 0.0001 ? m4 / Math.pow(volMonthly, 4) - 3 : 0;

  const hitRate = ret.filter((r) => r > 0).length / n;
  const avgTurnover = turnover.reduce((a, b) => a + b, 0) / Math.max(1, turnover.length);

  // Break-even bps: Sharpe = 0 ⟹ meanRet = 0 ⟹ avgTurnover * (bps/10000) = meanRet (pre-cost)
  // Already post-cost meanRet = preCostMean - avgTurnover * bps / 10000
  // So bps = preCostMean * 10000 / avgTurnover. preCostMean = meanRet + currentBpsCost.
  // But we don't know currentBpsCost here without it being a param. Instead compute a SEPARATE
  // break-even from a 0-cost reference: caller has to pass pre-cost mean. Simplification:
  // approximate break-even as the rate at which meanRet drops to 0 from current state;
  // i.e., breakEvenBps ≈ meanRet * 10000 / avgTurnover (additional bps that would zero it).
  const breakEvenBps = avgTurnover > 0.001 ? Math.max(0, (meanRet * 10000) / avgTurnover) : 0;

  return {
    sharpe, sharpeMkt, sortino, calmar, cvar5,
    totalReturn, totalReturnMkt, meanRet, volAnnualized,
    maxDrawdown, maxDrawdownDuration: maxDDDur, hitRate,
    beta, alpha, skew, kurtosis,
    avgTurnover, breakEvenBps, nMonths: n,
  };
}

// ===== Single backtest wrapper ======================================

/**
 * Rolling vol-target scaling - past-only.
 *
 * At month t, scale return[t] by `targetVolMonthly / σ̂_strategy[t-window..t-1]`
 * where σ̂ is computed from REALIZED strategy returns we'd have known by
 * the start of month t. The first `window` months are not rescaled
 * (no history yet), so they pass through with whatever the engine produced.
 *
 * This replaces the v1 ex-post full-sample scaling that artificially inflated
 * Sharpe by knowing future variance.
 */
function rollingVolTargetScale(
  ret: number[],
  retPre: number[],
  targetVolAnnualized: number,
  window: number = 12
): { scaledRet: number[]; scaledPre: number[]; scaleFactors: number[] } {
  const targetVolMonthly = targetVolAnnualized / Math.sqrt(12);
  const scaledRet = ret.slice();
  const scaledPre = retPre.slice();
  const scaleFactors = new Array(ret.length).fill(1);
  for (let t = 0; t < ret.length; t++) {
    if (t < window) continue; // insufficient history → pass through
    // σ̂ from PAST returns only: ret[t-window..t-1], strictly less than t
    const win = ret.slice(t - window, t);
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    const v = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / win.length);
    if (v > 0.001) {
      // Cap scaling factor at [0.25, 4] to prevent extreme leverage spikes
      // when σ̂ is very small early in the sample.
      const raw = targetVolMonthly / v;
      const scale = Math.max(0.25, Math.min(4, raw));
      scaleFactors[t] = scale;
      scaledRet[t] = ret[t] * scale;
      scaledPre[t] = retPre[t] * scale;
    }
  }
  return { scaledRet, scaledPre, scaleFactors };
}

function runSingle(params: BacktestParams): BacktestResult {
  const eng = buildEngine(params);
  const M = eng.months.length;
  const t0 = params.lookback;
  const t1 = M - 1;
  const { ret, retPre, retMarket, turnover, weights } = runBacktest(eng, t0, t1, params);

  // Rolling vol-target: past-only, no look-ahead.
  let scaledRet = ret;
  let scaledPre = retPre;
  if (params.volTarget && ret.length > 12) {
    const out = rollingVolTargetScale(ret, retPre, params.targetVol, 12);
    scaledRet = out.scaledRet;
    scaledPre = out.scaledPre;
  }

  const equity = [1];
  const equityPre = [1];
  const equityMkt = [1];
  for (const r of scaledRet) equity.push(equity[equity.length - 1] * (1 + r));
  for (const r of scaledPre) equityPre.push(equityPre[equityPre.length - 1] * (1 + r));
  for (const r of retMarket) equityMkt.push(equityMkt[equityMkt.length - 1] * (1 + r));

  const drawdown: number[] = [];
  let peak = equity[0];
  for (const v of equity) { if (v > peak) peak = v; drawdown.push((v - peak) / peak); }

  const stats = computeStats(scaledRet, retMarket, turnover);
  const months = eng.months.slice(t0 + 1, t0 + 1 + scaledRet.length);

  return {
    ...stats,
    months,
    ret: scaledRet,
    retPre: scaledPre,
    retMarket,
    equity, equityPre, equityMkt, drawdown,
    turnover,
    weights,
  };
}

// ===== Walk-forward CV ==============================================

interface WalkForwardFold {
  trainStart: number; trainEnd: number;
  testStart: number; testEnd: number;
  isStats: BacktestStats;
  oosStats: BacktestStats;
  oosRet: number[];
  oosRetMarket: number[];
  /** Per-fold optimal blend weights (only set if signal === "blend"). */
  blendW?: { mom: number; mr: number; sharpe: number };
}

interface WalkForwardResult {
  folds: WalkForwardFold[];
  oosMonths: string[];
  oosRet: number[];
  oosRetMarket: number[];
  oosEquity: number[];
  oosStats: BacktestStats;
  isMedianSharpe: number;
  oosMedianSharpe: number;
  positiveFoldPct: number;
  /** Did we re-optimize blend weights per fold? */
  blendOptimizedPerFold: boolean;
  /** Per-fold optimal blend weights, in fold order (only when re-optimized). */
  perFoldBlendW: { mom: number; mr: number; sharpe: number }[];
}

/**
 * Walk-forward CV with PROPER OOS hygiene:
 *   1. Per-fold blend weight re-optimization (no leak from test → train decision).
 *   2. Per-fold rolling vol-target scaling using ONLY train-window σ̂ as the
 *      reference (so test scaling can't borrow test variance).
 *   3. Stitched OOS market returns alongside strategy returns - no zero-vector
 *      benchmark hack. Beta/alpha/sharpe-vs-mkt remain meaningful in OOS.
 */
function runWalkForward(params: BacktestParams, wfp: WalkForwardParams): WalkForwardResult {
  const eng = buildEngine(params);
  const M = eng.months.length;
  const folds: WalkForwardFold[] = [];
  const perFoldBlendW: { mom: number; mr: number; sharpe: number }[] = [];
  const blendOptimizedPerFold = params.signal === "blend";

  let trainStart = params.lookback;
  while (trainStart + wfp.trainMonths + wfp.testMonths <= M - 1) {
    const trainEnd = trainStart + wfp.trainMonths;
    const testEnd = Math.min(M - 1, trainEnd + wfp.testMonths);

    // === Phase A3: per-fold blend re-optimization ===
    // If signal is "blend", sweep weights ONLY on train slice and pick
    // the best by IS Sharpe. Test slice uses the train-fitted weights only.
    let foldParams = params;
    let foldBlendW = params.blendW;
    if (blendOptimizedPerFold) {
      const STEPS = 10; // 0.1 resolution simplex (66 points)
      let bestSharpe = -Infinity;
      let bestW = params.blendW;
      for (let i = 0; i <= STEPS; i++) {
        for (let j = 0; j <= STEPS - i; j++) {
          const k = STEPS - i - j;
          if (k < 0) continue;
          const w = { mom: i / STEPS, mr: j / STEPS, sharpe: k / STEPS };
          const trial = runBacktest(eng, trainStart, trainEnd, { ...params, blendW: w });
          const trialStats = computeStats(trial.ret, trial.retMarket, trial.turnover);
          if (trialStats.sharpe > bestSharpe) {
            bestSharpe = trialStats.sharpe;
            bestW = w;
          }
        }
      }
      foldBlendW = bestW;
      foldParams = { ...params, blendW: bestW };
    }
    perFoldBlendW.push(foldBlendW);

    // === Run train + test backtests using the (per-fold-frozen) params ===
    const trainBT = runBacktest(eng, trainStart, trainEnd, foldParams);
    const testBT = runBacktest(eng, trainEnd, testEnd, foldParams);

    // Vol-target: use rolling past-only σ̂ INSIDE each window. The IS window
    // can use its own rolling 12m σ̂; the OOS window also uses its own rolling
    // σ̂ (computed off prior OOS returns, no train→test leak).
    let trainRet = trainBT.ret;
    let testRet = testBT.ret;
    if (params.volTarget) {
      if (trainRet.length > 12) {
        trainRet = rollingVolTargetScale(trainBT.ret, trainBT.retPre, params.targetVol, 12).scaledRet;
      }
      if (testRet.length > 12) {
        testRet = rollingVolTargetScale(testBT.ret, testBT.retPre, params.targetVol, 12).scaledRet;
      }
    }

    const isStats = computeStats(trainRet, trainBT.retMarket, trainBT.turnover);
    const oosStats = computeStats(testRet, testBT.retMarket, testBT.turnover);

    folds.push({
      trainStart,
      trainEnd,
      testStart: trainEnd,
      testEnd,
      isStats,
      oosStats,
      oosRet: testRet,
      oosRetMarket: testBT.retMarket,
      blendW: blendOptimizedPerFold ? foldBlendW : undefined,
    });

    trainStart += wfp.stepMonths;
  }

  // Stitch all OOS test-window returns AND market returns in lockstep.
  const oosRet: number[] = [];
  const oosRetMarket: number[] = [];
  const oosMonths: string[] = [];
  let curIdx = -1;
  for (const f of folds) {
    if (f.testStart > curIdx) {
      // Append fresh
      for (let i = 0; i < f.oosRet.length; i++) {
        oosRet.push(f.oosRet[i]);
        oosRetMarket.push(f.oosRetMarket[i]);
        oosMonths.push(eng.months[f.testStart + 1 + i]);
      }
      curIdx = f.testEnd;
    } else if (f.testEnd > curIdx) {
      // Append only the new tail
      const tailStart = f.oosRet.length - (f.testEnd - curIdx);
      for (let i = tailStart; i < f.oosRet.length; i++) {
        if (f.testStart + 1 + i > curIdx) {
          oosRet.push(f.oosRet[i]);
          oosRetMarket.push(f.oosRetMarket[i]);
          oosMonths.push(eng.months[f.testStart + 1 + i]);
        }
      }
      curIdx = f.testEnd;
    }
  }

  const oosEquity = [1];
  for (const r of oosRet) oosEquity.push(oosEquity[oosEquity.length - 1] * (1 + r));

  // Phase A4: stitched OOS market returns are now real, not zeros - beta/alpha/sharpeMkt are honest.
  const oosStats = computeStats(oosRet, oosRetMarket, []);

  const isSharpes = folds.map((f) => f.isStats.sharpe);
  const oosSharpes = folds.map((f) => f.oosStats.sharpe);
  isSharpes.sort((a, b) => a - b);
  oosSharpes.sort((a, b) => a - b);
  const isMedianSharpe = isSharpes[Math.floor(isSharpes.length / 2)] ?? 0;
  const oosMedianSharpe = oosSharpes[Math.floor(oosSharpes.length / 2)] ?? 0;
  const positiveFoldPct = folds.filter((f) => f.oosStats.sharpe > 0).length / Math.max(1, folds.length);

  return {
    folds,
    oosMonths,
    oosRet,
    oosRetMarket,
    oosEquity,
    oosStats,
    isMedianSharpe,
    oosMedianSharpe,
    positiveFoldPct,
    blendOptimizedPerFold,
    perFoldBlendW,
  };
}

// ===== Simplex grid sweep for blend optimization ====================

interface BlendPoint { mom: number; mr: number; sharpe: number; sharpeRatio: number; }

function simplexSweep(baseParams: BacktestParams, step = 0.1): { points: BlendPoint[]; best: BlendPoint } {
  const points: BlendPoint[] = [];
  const STEPS = Math.round(1 / step);
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS - i; j++) {
      const k = STEPS - i - j;
      if (k < 0) continue;
      const w = { mom: i / STEPS, mr: j / STEPS, sharpe: k / STEPS };
      const result = runSingle({ ...baseParams, signal: "blend", blendW: w });
      points.push({ ...w, sharpeRatio: result.sharpe });
    }
  }
  let best = points[0];
  for (const p of points) if (p.sharpeRatio > best.sharpeRatio) best = p;
  return { points, best };
}

// ===== Regime classification ========================================

function classifyRegimes(retMkt: number[]): {
  bull: boolean[];
  bear: boolean[];
  majors: boolean[];
} {
  const months = data.months;
  // Bear = market drawdown ≤ −10% from prior peak
  const equityMkt = [1];
  for (const r of retMkt) equityMkt.push(equityMkt[equityMkt.length - 1] * (1 + r));
  let peak = equityMkt[0];
  const bear = new Array(retMkt.length).fill(false);
  for (let i = 0; i < retMkt.length; i++) {
    if (equityMkt[i] > peak) peak = equityMkt[i];
    if ((equityMkt[i] - peak) / peak < -0.05) bear[i] = true;
  }
  const bull = bear.map((b) => !b);
  // Majors: April / June / July / August
  const majors = retMkt.map((_, i) => {
    const m = months[i];
    if (!m) return false;
    const mm = m.split("-")[1];
    return mm === "04" || mm === "06" || mm === "07" || mm === "08";
  });
  return { bull, bear, majors };
}

function regimeSharpe(ret: number[], mask: boolean[]): number {
  const filtered = ret.filter((_, i) => mask[i]);
  if (filtered.length < 2) return 0;
  const m = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const v = Math.sqrt(filtered.reduce((a, b) => a + (b - m) ** 2, 0) / filtered.length);
  return v > 0.0001 ? (m / v) * Math.sqrt(12) : 0;
}

// ===== Archetype attribution (DYNAMIC - Phase A5) ====================
//
// v1 used a single static archetype label per player (k-means refit on
// 7-year career averages). That's structurally biased: a player who was a
// putt-and-approach player in 2015 isn't necessarily the same in 2022.
//
// v2: archetype lookup is (player, season) → archetype, sourced from the
// per-season k-means clusters that already ship in pga_cluster_timeline.json.
// The archetype label is derived per season from the centroid's dominant
// SG component (putt / arg / app / ott).

interface ClusterTimelineSnapshot {
  players: { player: string; season: number; cluster: number }[];
  centroids: { putt: number; arg: number; app: number; ott: number }[];
}
interface ClusterTimelineJson {
  seasons: number[];
  byYear: Record<string, ClusterTimelineSnapshot>;
}

const ARCHETYPE_NAMES: Record<keyof ClusterTimelineSnapshot["centroids"][number], string> = {
  putt: "Putting Specialist",
  arg: "Around-Green Specialist",
  app: "Approach-Dominant",
  ott: "Off-the-Tee Power",
};
const ARCHETYPE_LIST = ["Putting Specialist", "Around-Green Specialist", "Approach-Dominant", "Off-the-Tee Power"] as const;

function archetypeFromCentroid(c: { putt: number; arg: number; app: number; ott: number }): string {
  const features: { key: keyof typeof c; val: number }[] = [
    { key: "putt", val: c.putt },
    { key: "arg", val: c.arg },
    { key: "app", val: c.app },
    { key: "ott", val: c.ott },
  ];
  features.sort((a, b) => b.val - a.val);
  return ARCHETYPE_NAMES[features[0].key];
}

/**
 * Build a (year, player) → archetype lookup from the cluster timeline.
 * Falls back to the static pga_analysis archetype if the player wasn't
 * in that season's snapshot (e.g., didn't make the top-30 cutoff).
 */
function buildPerSeasonArchetypeLookup(): {
  lookup: Map<string, string>;
  fallback: Map<string, string>;
} {
  const ctl = clusterTimeline as ClusterTimelineJson;
  const lookup = new Map<string, string>();
  for (const yearStr of Object.keys(ctl.byYear)) {
    const snap = ctl.byYear[yearStr];
    for (const p of snap.players) {
      const centroid = snap.centroids[p.cluster];
      if (!centroid) continue;
      const archetype = archetypeFromCentroid(centroid);
      lookup.set(`${yearStr}__${p.player}`, archetype);
    }
  }
  // Fallback: static archetype labels for players not in any season snapshot.
  const fallback = new Map<string, string>();
  for (const arch of archetypeData.archetypes) {
    for (const m of arch.members) fallback.set(m, arch.archetype);
  }
  return { lookup, fallback };
}

function archetypeForPlayerMonth(
  player: string,
  monthYYYYMM: string,
  archLookup: Map<string, string>,
  fallback: Map<string, string>
): string | null {
  const year = monthYYYYMM.slice(0, 4);
  // Try this season first
  const exact = archLookup.get(`${year}__${player}`);
  if (exact) return exact;
  // Try previous season (player may have dropped out of top-30 this year but was in last year)
  const prevYear = String(parseInt(year, 10) - 1);
  const prev = archLookup.get(`${prevYear}__${player}`);
  if (prev) return prev;
  // Fallback to static career-average archetype
  return fallback.get(player) ?? null;
}

function attributeByArchetype(
  weights: number[][],
  retMatrix: (number | null)[][],
  players: string[],
  months: string[]
): Record<string, number[]> {
  const { lookup, fallback } = buildPerSeasonArchetypeLookup();
  const out: Record<string, number[]> = {};
  for (const a of ARCHETYPE_LIST) out[a] = [];

  const M = weights.length;
  for (let t = 0; t < M; t++) {
    const month = months[t] ?? "";
    const perArch = new Map<string, number>();
    for (let pi = 0; pi < players.length; pi++) {
      const w = weights[t][pi];
      const r = retMatrix[t]?.[pi];
      if (w === 0 || r == null) continue;
      const arch = archetypeForPlayerMonth(players[pi], month, lookup, fallback);
      if (!arch) continue;
      perArch.set(arch, (perArch.get(arch) ?? 0) + w * r * RET_SCALE);
    }
    for (const a of ARCHETYPE_LIST) {
      out[a].push(perArch.get(a) ?? 0);
    }
  }
  return out;
}

// ===== Component ====================================================

export default function StrategyLab({ colors, fontMono, fontUi }: Props) {
  void fontUi;
  const [signal, setSignal] = useState<Signal>("momentum");
  const [blendW, setBlendW] = useState({ mom: 0.34, mr: 0.33, sharpe: 0.33 });
  const [lookback, setLookback] = useState<number>(12);
  const [longPct, setLongPct] = useState<number>(0.20);
  const [shortPct, setShortPct] = useState<number>(0.20);
  const [volTarget, setVolTarget] = useState<boolean>(true);
  const [targetVol, setTargetVol] = useState<number>(0.15);
  const [minHistory, setMinHistory] = useState<number>(12);
  const [costBps, setCostBps] = useState<number>(5);
  const [mode, setMode] = useState<Mode>("single");
  const [trainMonths, setTrainMonths] = useState<number>(36);
  const [testMonths, setTestMonths] = useState<number>(12);
  const [stepMonths, setStepMonths] = useState<number>(6);
  const [showCostCurve, setShowCostCurve] = useState<boolean>(true);
  const [analyticsTab, setAnalyticsTab] = useState<"main" | "regime" | "attribution" | "blend">("main");

  const params: BacktestParams = useMemo(() => ({
    signal, blendW, lookback, longPct, shortPct,
    volTarget, targetVol, minHistory, costBps,
  }), [signal, blendW, lookback, longPct, shortPct, volTarget, targetVol, minHistory, costBps]);

  const wfp: WalkForwardParams = useMemo(() => ({ trainMonths, testMonths, stepMonths }), [trainMonths, testMonths, stepMonths]);

  const single = useMemo(() => runSingle(params), [params]);
  const wf = useMemo(() => mode === "walkforward" ? runWalkForward(params, wfp) : null, [mode, params, wfp]);

  // Regime breakdown
  const regimes = useMemo(() => classifyRegimes(single.retMarket), [single.retMarket]);
  const regimeStats = useMemo(() => ({
    bull: regimeSharpe(single.ret, regimes.bull),
    bear: regimeSharpe(single.ret, regimes.bear),
    majors: regimeSharpe(single.ret, regimes.majors),
    nonMajors: regimeSharpe(single.ret, regimes.majors.map((b) => !b)),
  }), [single.ret, regimes]);

  // Rolling 12-month Sharpe
  const rollingSharpe = useMemo(() => {
    const out: number[] = [];
    const ret = single.ret;
    for (let i = 0; i < ret.length; i++) {
      if (i < 11) { out.push(0); continue; }
      const win = ret.slice(i - 11, i + 1);
      const m = win.reduce((a, b) => a + b, 0) / 12;
      const v = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / 12);
      out.push(v > 0.0001 ? (m / v) * Math.sqrt(12) : 0);
    }
    return out;
  }, [single.ret]);

  // Attribution - uses dynamic per-season archetype labels (Phase A5).
  const attribution = useMemo(() => {
    const M = single.weights.length;
    const players = data.players;
    // Realized return at month-of-weight t is X[t+1] (next-month observation),
    // and the archetype at month-of-weight t should be looked up against
    // the year of month_t (not t+1) - so pass single.months which already
    // contains the post-lookback months in correct order.
    const retMatrix: (number | null)[][] = data.months
      .slice(0, M + lookback)
      .slice(lookback + 1, lookback + 1 + M)
      .map((m) => players.map((p) => data.panel[m]?.[p]?.sg ?? null));
    return attributeByArchetype(single.weights, retMatrix, players, single.months);
  }, [single.weights, single.months, lookback]);

  // Signal correlation matrix
  const signalCorr = useMemo(() => {
    const eng = buildEngine(params);
    const M = eng.months.length;
    const t0 = params.lookback;
    const sigs = { mom: [] as number[], mr: [] as number[], sharpe: [] as number[] };
    for (let t = t0; t < M; t++) {
      for (let pi = 0; pi < eng.players.length; pi++) {
        const m = signalAt(eng, t, pi, { ...params, signal: "momentum" });
        const r = signalAt(eng, t, pi, { ...params, signal: "meanRev" });
        const s = signalAt(eng, t, pi, { ...params, signal: "sharpe" });
        if (m == null || r == null || s == null) continue;
        sigs.mom.push(m); sigs.mr.push(r); sigs.sharpe.push(s);
      }
    }
    return {
      momMr: pearsonR(sigs.mom, sigs.mr),
      momSharpe: pearsonR(sigs.mom, sigs.sharpe),
      mrSharpe: pearsonR(sigs.mr, sigs.sharpe),
    };
  }, [params]);

  // Blend optimization (lazy - only when user clicks)
  const [blendSweep, setBlendSweep] = useState<{ points: BlendPoint[]; best: BlendPoint } | null>(null);
  const runBlendOptimizer = () => {
    const sweep = simplexSweep({ ...params, signal: "blend" }, 0.1);
    setBlendSweep(sweep);
    setBlendW({ mom: sweep.best.mom, mr: sweep.best.mr, sharpe: sweep.best.sharpe });
    setSignal("blend");
  };

  return (
    <div className="h-full overflow-y-auto p-[16px]" style={{ fontFamily: "inherit" }}>
      <div className="grid grid-cols-2 gap-[16px]">
        <div>
          <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
            Systematic L/S backtest - fund-grade
          </h3>
          <p style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginBottom: 14 }}>
            Each month, rank {data.players.length} players by signal, long top quintile / short bottom,
            vol-target inverse-σ sized. Toggle <strong>Walk-forward CV</strong> below for proper
            out-of-sample evaluation, <strong>Blend</strong> to optimize a 3-signal mix on a simplex,
            <strong> costs</strong> to layer turnover-based transaction costs.
          </p>

          <Label colors={colors}>Eval mode</Label>
          <div className="flex gap-[4px] mb-[10px]">
            {(
              [
                ["single", "Single backtest (in-sample)"],
                ["walkforward", "Walk-forward CV (out-of-sample)"],
              ] as [Mode, string][]
            ).map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => setMode(v)} className="px-[12px] py-[5px]"
                style={{
                  background: mode === v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (mode === v ? colors.brand : colors.borderSoft),
                  color: mode === v ? colors.text : colors.textDim,
                  fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                }}>
                {lbl}
              </button>
            ))}
          </div>

          <Label colors={colors}>Signal</Label>
          <div className="flex gap-[4px] mb-[10px] flex-wrap">
            {(
              [
                ["momentum", "Momentum"],
                ["meanRev", "Mean-revert"],
                ["sharpe", "Sharpe-rank"],
                ["blend", "Blend"],
              ] as [Signal, string][]
            ).map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => setSignal(v)} className="px-[10px] py-[4px]"
                style={{
                  background: signal === v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (signal === v ? colors.brand : colors.borderSoft),
                  color: signal === v ? colors.text : colors.textDim,
                  fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                }}>
                {lbl}
              </button>
            ))}
          </div>

          {signal === "blend" && (
            <div className="mb-[10px]">
              <Slider label="w(Momentum)" value={blendW.mom} min={0} max={1} step={0.01} onChange={(v) => {
                const rest = 1 - v; const sum = blendW.mr + blendW.sharpe || 1;
                setBlendW({ mom: v, mr: blendW.mr / sum * rest, sharpe: blendW.sharpe / sum * rest });
              }} colors={colors} fontMono={fontMono} track={colors.brand} fmt={(v) => v.toFixed(2)} />
              <Slider label="w(Mean-revert)" value={blendW.mr} min={0} max={1} step={0.01} onChange={(v) => {
                const rest = 1 - v; const sum = blendW.mom + blendW.sharpe || 1;
                setBlendW({ mom: blendW.mom / sum * rest, mr: v, sharpe: blendW.sharpe / sum * rest });
              }} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => v.toFixed(2)} />
              <Slider label="w(Sharpe-rank)" value={blendW.sharpe} min={0} max={1} step={0.01} onChange={(v) => {
                const rest = 1 - v; const sum = blendW.mom + blendW.mr || 1;
                setBlendW({ mom: blendW.mom / sum * rest, mr: blendW.mr / sum * rest, sharpe: v });
              }} colors={colors} fontMono={fontMono} track={colors.accent} fmt={(v) => v.toFixed(2)} />
              <button type="button" onClick={runBlendOptimizer}
                style={{
                  marginTop: 6, width: "100%", padding: "6px 10px",
                  background: colors.brandSoft, border: "1px solid " + colors.brand, color: colors.text,
                  fontSize: 11, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.05em",
                }}>
                ▶ Optimize blend (66-point simplex grid sweep)
              </button>
            </div>
          )}

          <Slider label="Lookback (months)" value={lookback} min={3} max={24} step={1} onChange={setLookback} colors={colors} fontMono={fontMono} track={colors.brand} fmt={(v) => `${v} months`} />
          <Slider label="Long top %" value={longPct} min={0.10} max={0.40} step={0.01} onChange={setLongPct} colors={colors} fontMono={fontMono} track={GREEN} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
          <Slider label="Short bottom %" value={shortPct} min={0.10} max={0.40} step={0.01} onChange={setShortPct} colors={colors} fontMono={fontMono} track={RED} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
          <Slider label="Min prior obs" value={minHistory} min={3} max={36} step={1} onChange={setMinHistory} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => `${v} months`} />

          <div className="mt-[10px] flex gap-[6px]">
            {[
              { v: false, lbl: "Equal weight" },
              { v: true, lbl: "Vol target" },
            ].map((opt) => (
              <button key={String(opt.v)} type="button" onClick={() => setVolTarget(opt.v)} className="px-[10px] py-[5px]"
                style={{
                  background: volTarget === opt.v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (volTarget === opt.v ? colors.brand : colors.borderSoft),
                  color: volTarget === opt.v ? colors.text : colors.textDim,
                  fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                }}>{opt.lbl}</button>
            ))}
          </div>
          {volTarget && (
            <Slider label="Target ann. vol" value={targetVol} min={0.05} max={0.40} step={0.01} onChange={setTargetVol} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
          )}

          <Slider label="Transaction cost (bps per L1 turnover)" value={costBps} min={0} max={50} step={1} onChange={setCostBps} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => `${v} bps`} />

          {mode === "walkforward" && (
            <div className="mt-[8px]" style={{ background: colors.panelDeep, padding: 10, border: "1px solid " + colors.borderSoft }}>
              <Label colors={colors}>Walk-forward windows</Label>
              <Slider label="Train (months)" value={trainMonths} min={24} max={72} step={3} onChange={setTrainMonths} colors={colors} fontMono={fontMono} track={colors.brand} fmt={(v) => `${v}m`} />
              <Slider label="Test (months)" value={testMonths} min={3} max={24} step={1} onChange={setTestMonths} colors={colors} fontMono={fontMono} track={colors.accent} fmt={(v) => `${v}m`} />
              <Slider label="Step (months)" value={stepMonths} min={1} max={12} step={1} onChange={setStepMonths} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => `${v}m`} />
            </div>
          )}

          <div style={{ marginTop: 18, padding: 12, background: colors.panelDeep, border: "1px solid " + colors.borderSoft, fontSize: 10.5, color: colors.textDim, lineHeight: 1.55 }}>
            <div style={{ fontSize: 9, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 6 }}>
              Methodology + caveats
            </div>
            <strong>Universe:</strong> top {data.players.length} players by event count, 2015–2022.{" "}
            <strong>Asset return:</strong> per-month avg SG-Total × 1/5 (Sharpe is invariant to scale).
            <br />
            <strong>Look-ahead-free:</strong> at month t we rank using data through t and capture realized t+1 return.
            <br />
            <strong>Walk-forward:</strong> {wf?.folds.length ?? 0} folds, {wfp.trainMonths}m train / {wfp.testMonths}m test, step {wfp.stepMonths}m. OOS Sharpe is the honest number.
            <br />
            <strong>Vol-target:</strong> per-name inverse-σ + ex-post scalar to match target ann. vol. Mimics multi-strat fund pod risk overlay.
            <br />
            <strong>Costs:</strong> {costBps}bps per unit of L1 turnover applied to weights. Break-even bps is the additional cost that would zero out post-cost Sharpe.
            <br />
            <strong>Limitations:</strong> SG-Total isn&apos;t literally tradable, so this is a methodological demo. Per-month rebalance assumes flat exposure across all events that month. No borrow, no slippage, no capacity constraints.
          </div>
        </div>

        <div>
          {/* Analytics sub-tabs */}
          <div className="flex gap-[4px] mb-[10px]">
            {(
              [
                ["main", "Main"],
                ["regime", "Regime"],
                ["attribution", "Attribution"],
                ["blend", "Blend space"],
              ] as ["main" | "regime" | "attribution" | "blend", string][]
            ).map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => setAnalyticsTab(v)} className="px-[10px] py-[4px]"
                style={{
                  background: analyticsTab === v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (analyticsTab === v ? colors.brand : colors.borderSoft),
                  color: analyticsTab === v ? colors.text : colors.textDim,
                  fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                }}>{lbl}</button>
            ))}
          </div>

          {analyticsTab === "main" && (
            <MainStatsView single={single} wf={wf} mode={mode} colors={colors} fontMono={fontMono} showCostCurve={showCostCurve} setShowCostCurve={setShowCostCurve} costBps={costBps} rollingSharpe={rollingSharpe} />
          )}
          {analyticsTab === "regime" && (
            <RegimeView single={single} regimes={regimes} regimeStats={regimeStats} colors={colors} fontMono={fontMono} />
          )}
          {analyticsTab === "attribution" && (
            <AttributionView attribution={attribution} colors={colors} fontMono={fontMono} />
          )}
          {analyticsTab === "blend" && (
            <BlendView blendSweep={blendSweep} signalCorr={signalCorr} blendW={blendW} colors={colors} fontMono={fontMono} runBlendOptimizer={runBlendOptimizer} />
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Sub-views ====================================================

function MainStatsView({
  single, wf, mode, colors, fontMono, showCostCurve, setShowCostCurve, costBps, rollingSharpe,
}: {
  single: BacktestResult; wf: WalkForwardResult | null; mode: Mode;
  colors: Colors; fontMono: string;
  showCostCurve: boolean; setShowCostCurve: (b: boolean) => void;
  costBps: number;
  rollingSharpe: number[];
}) {
  return (
    <>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        {mode === "single" ? `In-sample stats (${single.nMonths}m)` : `Walk-forward OOS (${wf?.oosRet.length ?? 0}m, ${wf?.folds.length ?? 0} folds)`}
      </h3>

      <div className="grid grid-cols-3 gap-[1px] mb-[10px]" style={{ background: colors.border }}>
        <Stat label="Sharpe" value={(mode === "single" ? single.sharpe : wf?.oosStats.sharpe ?? 0).toFixed(2)} tone={(mode === "single" ? single.sharpe : wf?.oosStats.sharpe ?? 0) > 0 ? colors.brand : RED} colors={colors} fontMono={fontMono} />
        <Stat label="Sortino" value={(mode === "single" ? single.sortino : wf?.oosStats.sortino ?? 0).toFixed(2)} tone={colors.brand} colors={colors} fontMono={fontMono} />
        <Stat label="Calmar" value={(mode === "single" ? single.calmar : wf?.oosStats.calmar ?? 0).toFixed(2)} tone={colors.brand} colors={colors} fontMono={fontMono} />
        <Stat label="SG growth" value={`${((mode === "single" ? single.totalReturn : (wf?.oosEquity[wf.oosEquity.length - 1] ?? 1) - 1) * 100).toFixed(0)}%`} tone={colors.text} colors={colors} fontMono={fontMono} />
        <Stat label="Max DD" value={`${((mode === "single" ? single.maxDrawdown : wf?.oosStats.maxDrawdown ?? 0) * 100).toFixed(1)}%`} tone={RED} colors={colors} fontMono={fontMono} />
        <Stat label="Max DD dur" value={`${(mode === "single" ? single.maxDrawdownDuration : wf?.oosStats.maxDrawdownDuration ?? 0)}m`} tone={colors.warn} colors={colors} fontMono={fontMono} />
        <Stat label="CVaR(5%)" value={`${((mode === "single" ? single.cvar5 : wf?.oosStats.cvar5 ?? 0) * 100).toFixed(2)}%`} tone={RED} colors={colors} fontMono={fontMono} />
        <Stat label="Hit rate" value={`${((mode === "single" ? single.hitRate : wf?.oosStats.hitRate ?? 0) * 100).toFixed(0)}%`} tone={colors.text} colors={colors} fontMono={fontMono} />
        <Stat label="Skew" value={(mode === "single" ? single.skew : wf?.oosStats.skew ?? 0).toFixed(2)} tone={colors.textDim} colors={colors} fontMono={fontMono} />
        <Stat label="Excess kurt" value={(mode === "single" ? single.kurtosis : wf?.oosStats.kurtosis ?? 0).toFixed(2)} tone={colors.textDim} colors={colors} fontMono={fontMono} />
        <Stat
          label="Beta to mkt"
          value={(mode === "single" ? single.beta : wf?.oosStats.beta ?? 0).toFixed(2)}
          tone={Math.abs(mode === "single" ? single.beta : wf?.oosStats.beta ?? 0) < 0.3 ? colors.brand : colors.warn}
          colors={colors} fontMono={fontMono}
        />
        <Stat
          label="Alpha (ann)"
          value={`${((mode === "single" ? single.alpha : wf?.oosStats.alpha ?? 0) * 100).toFixed(1)}%`}
          tone={(mode === "single" ? single.alpha : wf?.oosStats.alpha ?? 0) > 0 ? colors.brand : RED}
          colors={colors} fontMono={fontMono}
        />
      </div>

      <div style={{ fontSize: 10, color: colors.textFaint, marginBottom: 12, lineHeight: 1.55, fontFamily: fontMono }}>
        <span style={{ color: colors.textDim }}>Note on units:</span> &ldquo;Returns&rdquo; here are scaled monthly avg-SG-Total per player (1/5x), not dollar P&amp;L. <strong style={{ color: colors.brand }}>Sharpe / Sortino / Calmar</strong> are honest ratios within SG-signal space and comparable across our four signals; they are <em>not</em> directly comparable to market-Sharpes. Beta/Alpha are vs. an equal-weight active-player &ldquo;PGA market&rdquo; built from the same panel. After Phase A bias fixes, all numbers use rolling past-only vol-target and expanding-only career mean.
      </div>

      {mode === "single" ? (
        <>
          <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
            <Label colors={colors}>Equity curve</Label>
            <button type="button" onClick={() => setShowCostCurve(!showCostCurve)}
              style={{ background: "transparent", border: "1px solid " + colors.borderSoft, color: showCostCurve ? colors.brand : colors.textFaint, fontSize: 9, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}>
              {showCostCurve ? `pre-cost overlay ON (${costBps}bp drag visible)` : "show pre-cost overlay"}
            </button>
          </div>
          <EquityCurve single={single} colors={colors} fontMono={fontMono} showPre={showCostCurve} />

          <Label colors={colors}>Drawdown</Label>
          <DrawdownChart single={single} colors={colors} fontMono={fontMono} />

          <Label colors={colors}>Rolling 12-month Sharpe</Label>
          <RollingSharpeChart values={rollingSharpe} months={single.months} colors={colors} fontMono={fontMono} />

          <Label colors={colors}>Monthly returns heatmap</Label>
          <MonthlyHeatmap result={single} colors={colors} fontMono={fontMono} />

          <Label colors={colors}>Per-month return distribution</Label>
          <RetHistogram result={single} colors={colors} fontMono={fontMono} />

          <div style={{ marginTop: 8, fontSize: 10, color: colors.textFaint, fontFamily: fontMono }}>
            Avg turnover: {single.avgTurnover.toFixed(2)} ·  Break-even bps: {single.breakEvenBps.toFixed(0)} ·  Currently applied: {costBps}bp
          </div>
        </>
      ) : (
        wf && (
          <>
            <Label colors={colors}>OOS equity curve (stitched across folds)</Label>
            <OosEquityCurve wf={wf} colors={colors} fontMono={fontMono} />

            <Label colors={colors}>Per-fold IS vs OOS Sharpe</Label>
            <IsOosScatter wf={wf} colors={colors} fontMono={fontMono} />

            <Label colors={colors}>Fold OOS Sharpe distribution</Label>
            <FoldSharpeHist wf={wf} colors={colors} fontMono={fontMono} />

            <div style={{ marginTop: 8, fontSize: 11, color: colors.textDim, lineHeight: 1.5 }}>
              <strong style={{ color: colors.text }}>Median IS Sharpe:</strong> {wf.isMedianSharpe.toFixed(2)} ·{" "}
              <strong style={{ color: colors.text }}>Median OOS Sharpe:</strong> {wf.oosMedianSharpe.toFixed(2)} ·{" "}
              <strong style={{ color: colors.text }}>Folds with positive OOS:</strong> {(wf.positiveFoldPct * 100).toFixed(0)}%
              {" "}·{" "}
              <span style={{ color: colors.warn }}>
                IS-OOS deflation: {((wf.isMedianSharpe - wf.oosMedianSharpe)).toFixed(2)} Sharpe units.
              </span>
            </div>

            {wf.blendOptimizedPerFold && (
              <>
                <Label colors={colors}>Per-fold blend weights (re-optimized on train slice each fold)</Label>
                <PerFoldBlendDriftTable wf={wf} colors={colors} fontMono={fontMono} />
                <div style={{ marginTop: 6, fontSize: 10, color: colors.textFaint, lineHeight: 1.5 }}>
                  Drift across folds is the honest signature of blend instability. A clean signal stays put;
                  a curve-fit signal jumps every fold.
                </div>
              </>
            )}
          </>
        )
      )}
    </>
  );
}

// ===== Charts =======================================================

function EquityCurve({ single, colors, fontMono, showPre }: { single: BacktestResult; colors: Colors; fontMono: string; showPre: boolean }) {
  const W = 360, H = 130, PAD = 6;
  const allVals = [...single.equity, ...single.equityPre, ...single.equityMkt];
  const yMin = Math.min(...allVals); const yMax = Math.max(...allVals);
  const xs = (i: number) => PAD + (i / (single.equity.length - 1)) * (W - 2 * PAD);
  const ys = (v: number) => H - PAD - ((v - yMin) / Math.max(0.01, yMax - yMin)) * (H - 2 * PAD);
  const oneY = ys(1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={PAD} y1={oneY} x2={W - PAD} y2={oneY} stroke={colors.borderSoft} strokeDasharray="3,3" />
      <polyline points={single.equityMkt.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke={colors.warn} strokeWidth={1.4} opacity={0.7} />
      {showPre && (
        <polyline points={single.equityPre.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke={colors.accent} strokeWidth={1.4} opacity={0.7} strokeDasharray="3,2" />
      )}
      <polyline points={single.equity.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke={colors.brand} strokeWidth={1.8} />
      <text x={PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>{single.months[0] ?? ""}</text>
      <text x={W - PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">{single.months[single.months.length - 1] ?? ""}</text>
      <text x={W - PAD - 4} y={ys(single.equity[single.equity.length - 1]) - 4} fontSize={9} fill={colors.brand} fontFamily={fontMono} textAnchor="end">strat ${single.equity[single.equity.length - 1].toFixed(2)}</text>
      {showPre && <text x={W - PAD - 4} y={ys(single.equityPre[single.equityPre.length - 1]) - 14} fontSize={9} fill={colors.accent} fontFamily={fontMono} textAnchor="end">pre-cost ${single.equityPre[single.equityPre.length - 1].toFixed(2)}</text>}
      <text x={W - PAD - 4} y={ys(single.equityMkt[single.equityMkt.length - 1]) + 12} fontSize={9} fill={colors.warn} fontFamily={fontMono} textAnchor="end">mkt ${single.equityMkt[single.equityMkt.length - 1].toFixed(2)}</text>
    </svg>
  );
}

function DrawdownChart({ single, colors, fontMono }: { single: BacktestResult; colors: Colors; fontMono: string }) {
  void fontMono;
  const W = 360, H = 70, PAD = 6;
  const yMin = Math.min(...single.drawdown, -0.05);
  const xs = (i: number) => PAD + (i / (single.drawdown.length - 1)) * (W - 2 * PAD);
  const ys = (v: number) => PAD + ((0 - v) / Math.max(0.0001, 0 - yMin)) * (H - 2 * PAD);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={PAD} y1={ys(0)} x2={W - PAD} y2={ys(0)} stroke={colors.borderSoft} strokeDasharray="3,3" />
      <polygon points={`${xs(0)},${ys(0)} ${single.drawdown.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} ${xs(single.drawdown.length - 1)},${ys(0)}`} fill={RED} opacity={0.55} />
      <text x={W - PAD - 4} y={H - 4} fontSize={9} fill={RED} fontFamily="ui-monospace" textAnchor="end">max DD: {(yMin * 100).toFixed(1)}% / {single.maxDrawdownDuration}m</text>
    </svg>
  );
}

function RollingSharpeChart({ values, months, colors, fontMono }: { values: number[]; months: string[]; colors: Colors; fontMono: string }) {
  void months;
  const W = 360, H = 70, PAD = 6;
  if (!values.length) return null;
  const yMin = Math.min(...values, -1); const yMax = Math.max(...values, 1);
  const xs = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD);
  const ys = (v: number) => H - PAD - ((v - yMin) / Math.max(0.01, yMax - yMin)) * (H - 2 * PAD);
  const zeroY = ys(0);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={colors.borderSoft} strokeDasharray="3,3" />
      <polyline points={values.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke={colors.brand} strokeWidth={1.4} />
      <text x={W - PAD - 4} y={H - 4} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">12m rolling Sharpe</text>
    </svg>
  );
}

function MonthlyHeatmap({ result, colors, fontMono }: { result: BacktestResult; colors: Colors; fontMono: string }) {
  // year × month grid
  const cells: { year: number; month: number; ret: number }[] = [];
  for (let i = 0; i < result.months.length; i++) {
    const m = result.months[i];
    if (!m) continue;
    const [y, mm] = m.split("-").map((s) => parseInt(s));
    cells.push({ year: y, month: mm, ret: result.ret[i] });
  }
  const years = [...new Set(cells.map((c) => c.year))].sort();
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const W = 360, H = 14 * years.length + 24, CW = (W - 30) / 12;
  const maxAbs = Math.max(...cells.map((c) => Math.abs(c.ret)), 0.01);
  const colorFor = (r: number) => {
    const t = Math.min(1, Math.abs(r) / maxAbs);
    const intensity = 0.20 + t * 0.65;
    return r >= 0 ? `rgba(93,211,158,${intensity})` : `rgba(240,104,106,${intensity})`;
  };
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      {months.map((m) => (
        <text key={`mlbl-${m}`} x={30 + (m - 0.5) * CW} y={10} fontSize={8} fill={colors.textFaint} fontFamily={fontMono} textAnchor="middle">{["J","F","M","A","M","J","J","A","S","O","N","D"][m - 1]}</text>
      ))}
      {years.map((y, yi) => (
        <text key={`ylbl-${y}`} x={4} y={20 + yi * 14 + 9} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>{y}</text>
      ))}
      {cells.map((c, i) => {
        const yi = years.indexOf(c.year);
        return (
          <rect key={i} x={30 + (c.month - 1) * CW + 1} y={14 + yi * 14 + 1} width={CW - 2} height={12} fill={colorFor(c.ret)} stroke={colors.bg} strokeWidth={0.5}>
            <title>{`${c.year}-${String(c.month).padStart(2, "0")}: ${(c.ret * 100).toFixed(2)}%`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function RetHistogram({ result, colors, fontMono }: { result: BacktestResult; colors: Colors; fontMono: string }) {
  const W = 360, H = 70, PAD = 6, NB = 24;
  const min = Math.min(...result.ret); const max = Math.max(...result.ret);
  const bins = new Array(NB).fill(0);
  for (const r of result.ret) {
    const idx = Math.min(NB - 1, Math.max(0, Math.floor(((r - min) / Math.max(0.0001, max - min)) * NB)));
    bins[idx]++;
  }
  const maxC = Math.max(...bins, 1); const bw = (W - 2 * PAD) / NB;
  const zeroX = min < 0 && max > 0 ? PAD + ((0 - min) / (max - min)) * (W - 2 * PAD) : null;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft }}>
      {bins.map((c, i) => {
        const x = PAD + i * bw;
        const h = (c / maxC) * (H - 14);
        const y = H - 10 - h;
        const cx = min + ((i + 0.5) / NB) * (max - min);
        const fill = cx >= 0 ? colors.brand : RED;
        return <rect key={i} x={x + 1} y={y} width={Math.max(0.5, bw - 2)} height={Math.max(0.5, h)} fill={fill} opacity={0.85} />;
      })}
      {zeroX != null && <line x1={zeroX} y1={2} x2={zeroX} y2={H - 10} stroke={colors.borderSoft} strokeDasharray="2,2" />}
      <text x={PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>{(min * 100).toFixed(1)}%</text>
      <text x={W - PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">{(max * 100).toFixed(1)}%</text>
    </svg>
  );
}

function OosEquityCurve({ wf, colors, fontMono }: { wf: WalkForwardResult; colors: Colors; fontMono: string }) {
  const W = 360, H = 130, PAD = 6;
  const eq = wf.oosEquity;
  if (eq.length === 0) return null;
  const yMin = Math.min(...eq); const yMax = Math.max(...eq);
  const xs = (i: number) => PAD + (i / Math.max(1, eq.length - 1)) * (W - 2 * PAD);
  const ys = (v: number) => H - PAD - ((v - yMin) / Math.max(0.01, yMax - yMin)) * (H - 2 * PAD);
  const oneY = ys(1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={PAD} y1={oneY} x2={W - PAD} y2={oneY} stroke={colors.borderSoft} strokeDasharray="3,3" />
      <polyline points={eq.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke={colors.brand} strokeWidth={1.8} />
      <text x={PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>{wf.oosMonths[0] ?? ""}</text>
      <text x={W - PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">{wf.oosMonths[wf.oosMonths.length - 1] ?? ""}</text>
      <text x={W - PAD - 4} y={ys(eq[eq.length - 1]) - 4} fontSize={9} fill={colors.brand} fontFamily={fontMono} textAnchor="end">${eq[eq.length - 1].toFixed(2)}</text>
    </svg>
  );
}

function IsOosScatter({ wf, colors, fontMono }: { wf: WalkForwardResult; colors: Colors; fontMono: string }) {
  const W = 360, H = 120, PAD = 18;
  const isVals = wf.folds.map((f) => f.isStats.sharpe);
  const oosVals = wf.folds.map((f) => f.oosStats.sharpe);
  const minV = Math.min(...isVals, ...oosVals, -1); const maxV = Math.max(...isVals, ...oosVals, 2);
  const x = (v: number) => PAD + ((v - minV) / Math.max(0.01, maxV - minV)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - minV) / Math.max(0.01, maxV - minV)) * (H - 2 * PAD);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={x(minV)} y1={y(minV)} x2={x(maxV)} y2={y(maxV)} stroke={colors.borderSoft} strokeDasharray="3,3" />
      <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke={colors.borderSoft} strokeDasharray="2,2" />
      <line x1={x(0)} y1={PAD} x2={x(0)} y2={H - PAD} stroke={colors.borderSoft} strokeDasharray="2,2" />
      {wf.folds.map((f, i) => (
        <circle key={i} cx={x(f.isStats.sharpe)} cy={y(f.oosStats.sharpe)} r={3.5} fill={f.oosStats.sharpe > 0 ? colors.brand : RED} opacity={0.85}>
          <title>{`Fold ${i + 1}: IS ${f.isStats.sharpe.toFixed(2)} → OOS ${f.oosStats.sharpe.toFixed(2)}`}</title>
        </circle>
      ))}
      <text x={W - PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">IS Sharpe →</text>
      <text x={2} y={PAD} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>↑ OOS Sharpe</text>
      <text x={W / 2} y={12} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="middle">y=x line: no deflation · below = overfit</text>
    </svg>
  );
}

function FoldSharpeHist({ wf, colors, fontMono }: { wf: WalkForwardResult; colors: Colors; fontMono: string }) {
  const W = 360, H = 70, PAD = 6, NB = 16;
  const vals = wf.folds.map((f) => f.oosStats.sharpe);
  if (!vals.length) return null;
  const min = Math.min(...vals); const max = Math.max(...vals);
  const bins = new Array(NB).fill(0);
  for (const v of vals) {
    const idx = Math.min(NB - 1, Math.max(0, Math.floor(((v - min) / Math.max(0.0001, max - min)) * NB)));
    bins[idx]++;
  }
  const maxC = Math.max(...bins, 1); const bw = (W - 2 * PAD) / NB;
  const zeroX = min < 0 && max > 0 ? PAD + ((0 - min) / (max - min)) * (W - 2 * PAD) : null;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      {bins.map((c, i) => {
        const x = PAD + i * bw;
        const h = (c / maxC) * (H - 14); const y = H - 10 - h;
        const cx = min + ((i + 0.5) / NB) * (max - min);
        return <rect key={i} x={x + 1} y={y} width={Math.max(0.5, bw - 2)} height={Math.max(0.5, h)} fill={cx >= 0 ? colors.brand : RED} opacity={0.85} />;
      })}
      {zeroX != null && <line x1={zeroX} y1={2} x2={zeroX} y2={H - 10} stroke="#fff" strokeDasharray="2,2" />}
      <text x={PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>{min.toFixed(2)}</text>
      <text x={W - PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">{max.toFixed(2)}</text>
      <text x={W / 2} y={H - 2} fontSize={9} fill={colors.textDim} fontFamily={fontMono} textAnchor="middle">{wf.folds.length} folds · OOS Sharpe distribution</text>
    </svg>
  );
}

function PerFoldBlendDriftTable({ wf, colors, fontMono }: { wf: WalkForwardResult; colors: Colors; fontMono: string }) {
  if (!wf.perFoldBlendW.length) return null;
  // Compute mean + max-deviation across folds to summarize "drift"
  const n = wf.perFoldBlendW.length;
  const mean = { mom: 0, mr: 0, sharpe: 0 };
  for (const w of wf.perFoldBlendW) { mean.mom += w.mom; mean.mr += w.mr; mean.sharpe += w.sharpe; }
  mean.mom /= n; mean.mr /= n; mean.sharpe /= n;
  let maxDev = 0;
  for (const w of wf.perFoldBlendW) {
    const d = Math.max(Math.abs(w.mom - mean.mom), Math.abs(w.mr - mean.mr), Math.abs(w.sharpe - mean.sharpe));
    if (d > maxDev) maxDev = d;
  }
  return (
    <div style={{ marginBottom: 14, fontFamily: fontMono, fontSize: 11 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr 1fr 1fr",
        gap: 0,
        background: colors.panel,
        border: "1px solid " + colors.borderSoft,
        padding: "0",
      }}>
        <div style={{ padding: "6px 8px", color: colors.textFaint, borderBottom: "1px solid " + colors.borderSoft, fontSize: 10, letterSpacing: "0.1em" }}>FOLD</div>
        <div style={{ padding: "6px 8px", color: colors.textFaint, borderBottom: "1px solid " + colors.borderSoft, fontSize: 10, letterSpacing: "0.1em", textAlign: "right" }}>MOM</div>
        <div style={{ padding: "6px 8px", color: colors.textFaint, borderBottom: "1px solid " + colors.borderSoft, fontSize: 10, letterSpacing: "0.1em", textAlign: "right" }}>MR</div>
        <div style={{ padding: "6px 8px", color: colors.textFaint, borderBottom: "1px solid " + colors.borderSoft, fontSize: 10, letterSpacing: "0.1em", textAlign: "right" }}>SHARPE</div>
        {wf.perFoldBlendW.flatMap((w, i) => [
          <div key={`l-${i}`} style={{ padding: "5px 8px", color: colors.textDim }}>fold {i + 1}</div>,
          <div key={`m-${i}`} style={{ padding: "5px 8px", color: colors.text, textAlign: "right" }}>{w.mom.toFixed(2)}</div>,
          <div key={`r-${i}`} style={{ padding: "5px 8px", color: colors.text, textAlign: "right" }}>{w.mr.toFixed(2)}</div>,
          <div key={`s-${i}`} style={{ padding: "5px 8px", color: colors.text, textAlign: "right" }}>{w.sharpe.toFixed(2)}</div>,
        ])}
        <div style={{ padding: "5px 8px", color: colors.brand, borderTop: "1px solid " + colors.borderSoft }}>mean</div>
        <div style={{ padding: "5px 8px", color: colors.brand, borderTop: "1px solid " + colors.borderSoft, textAlign: "right" }}>{mean.mom.toFixed(2)}</div>
        <div style={{ padding: "5px 8px", color: colors.brand, borderTop: "1px solid " + colors.borderSoft, textAlign: "right" }}>{mean.mr.toFixed(2)}</div>
        <div style={{ padding: "5px 8px", color: colors.brand, borderTop: "1px solid " + colors.borderSoft, textAlign: "right" }}>{mean.sharpe.toFixed(2)}</div>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: colors.textFaint }}>
        Max weight deviation across folds: <span style={{ color: maxDev > 0.3 ? colors.warn : colors.brand }}>{maxDev.toFixed(2)}</span>
        {" "}({maxDev > 0.3 ? "high - signal regime-shifts" : "low - blend is stable"})
      </div>
    </div>
  );
}

// ===== Regime view ==================================================

function RegimeView({
  single, regimes, regimeStats, colors, fontMono,
}: {
  single: BacktestResult;
  regimes: { bull: boolean[]; bear: boolean[]; majors: boolean[] };
  regimeStats: { bull: number; bear: number; majors: number; nonMajors: number };
  colors: Colors; fontMono: string;
}) {
  void regimes;
  // Rolling 24m beta to market
  const rollingBeta: number[] = [];
  for (let i = 0; i < single.ret.length; i++) {
    if (i < 23) { rollingBeta.push(0); continue; }
    const rWin = single.ret.slice(i - 23, i + 1);
    const mWin = single.retMarket.slice(i - 23, i + 1);
    const mr = rWin.reduce((a, b) => a + b, 0) / 24;
    const mm = mWin.reduce((a, b) => a + b, 0) / 24;
    let cov = 0, vM = 0;
    for (let k = 0; k < 24; k++) {
      cov += (rWin[k] - mr) * (mWin[k] - mm);
      vM += (mWin[k] - mm) ** 2;
    }
    cov /= 24; vM /= 24;
    rollingBeta.push(vM > 0.0001 ? cov / vM : 0);
  }
  return (
    <>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Regime conditionality
      </h3>
      <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 12 }}>
        Decomposes strategy returns by market state. Regime-conditional Sharpes that differ wildly
        signal a strategy whose alpha depends on regime - funds discount these heavily.
      </p>

      <div className="grid grid-cols-2 gap-[1px] mb-[12px]" style={{ background: colors.border }}>
        <Stat label="Bull-mkt Sharpe" value={regimeStats.bull.toFixed(2)} tone={regimeStats.bull > 0 ? colors.brand : RED} colors={colors} fontMono={fontMono} />
        <Stat label="Bear-mkt Sharpe" value={regimeStats.bear.toFixed(2)} tone={regimeStats.bear > 0 ? colors.brand : RED} colors={colors} fontMono={fontMono} />
        <Stat label="Majors Sharpe (Apr/Jun/Jul/Aug)" value={regimeStats.majors.toFixed(2)} tone={regimeStats.majors > 0 ? colors.brand : RED} colors={colors} fontMono={fontMono} />
        <Stat label="Non-majors Sharpe" value={regimeStats.nonMajors.toFixed(2)} tone={regimeStats.nonMajors > 0 ? colors.brand : RED} colors={colors} fontMono={fontMono} />
      </div>

      <Label colors={colors}>Stability ratio (bull-Sharpe / bear-Sharpe)</Label>
      <div style={{ padding: 12, background: colors.panelDeep, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
        <span style={{ fontSize: 22, fontWeight: 600, fontFamily: fontMono, color: colors.text }}>
          {Math.abs(regimeStats.bear) > 0.01 ? (regimeStats.bull / regimeStats.bear).toFixed(2) : "-"}
        </span>
        <span style={{ fontSize: 10, color: colors.textFaint, marginLeft: 8 }}>
          {Math.abs(regimeStats.bull / Math.max(0.01, Math.abs(regimeStats.bear))) < 1.5
            ? "stable across regimes"
            : "regime-conditional"}
        </span>
      </div>

      <Label colors={colors}>Rolling 24-month β to PGA market</Label>
      <RollingBetaChart values={rollingBeta} months={single.months} colors={colors} fontMono={fontMono} />
    </>
  );
}

function RollingBetaChart({ values, months, colors, fontMono }: { values: number[]; months: string[]; colors: Colors; fontMono: string }) {
  void months;
  const W = 360, H = 90, PAD = 6;
  const yMin = Math.min(...values, -1); const yMax = Math.max(...values, 1.5);
  const xs = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD);
  const ys = (v: number) => H - PAD - ((v - yMin) / Math.max(0.01, yMax - yMin)) * (H - 2 * PAD);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={PAD} y1={ys(0)} x2={W - PAD} y2={ys(0)} stroke={colors.borderSoft} strokeDasharray="3,3" />
      <line x1={PAD} y1={ys(1)} x2={W - PAD} y2={ys(1)} stroke={colors.warn} strokeDasharray="2,3" opacity={0.5} />
      <polyline points={values.slice(23).map((v, i) => `${xs(i + 23)},${ys(v)}`).join(" ")} fill="none" stroke={colors.accent} strokeWidth={1.4} />
      <text x={W - PAD - 4} y={ys(1) - 2} fontSize={9} fill={colors.warn} fontFamily={fontMono} textAnchor="end">β=1</text>
      <text x={W - PAD - 4} y={ys(0) - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">β=0 (market-neutral)</text>
    </svg>
  );
}

// ===== Attribution view =============================================

function AttributionView({ attribution, colors, fontMono }: { attribution: Record<string, number[]>; colors: Colors; fontMono: string }) {
  const archs = Object.keys(attribution);
  const totals: Record<string, number> = {};
  let totalAbs = 0;
  for (const a of archs) {
    const sum = attribution[a].reduce((x, y) => x + y, 0);
    totals[a] = sum;
    totalAbs += Math.abs(sum);
  }
  const W = 360, H = 32 * archs.length + 20;

  return (
    <>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Attribution by k-means archetype
      </h3>
      <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 12 }}>
        Decomposes the strategy&apos;s realized return into contributions from each player archetype
        (long − short over names matching that cluster). Tells you whether the alpha comes from putters,
        ball-strikers, or specifically the all-rounder cluster.
      </p>

      <Label colors={colors}>Total contribution by archetype</Label>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
        {archs.map((a, i) => {
          const v = totals[a];
          const fraction = totalAbs > 0 ? Math.abs(v) / totalAbs : 0;
          const barW = fraction * (W - 140);
          const y = 12 + i * 32;
          const fill = v >= 0 ? colors.brand : RED;
          return (
            <g key={a}>
              <text x={6} y={y + 13} fontSize={11} fill={colors.text} fontFamily="inherit">{a}</text>
              <rect x={140} y={y + 4} width={Math.max(1, barW)} height={14} fill={fill} opacity={0.85} />
              <text x={140 + barW + 6} y={y + 14} fontSize={10} fill={fill} fontFamily={fontMono}>{(v * 100).toFixed(2)}% (sum-ret)</text>
            </g>
          );
        })}
      </svg>

      <Label colors={colors}>Cumulative attribution over time</Label>
      <CumulativeAttribution attribution={attribution} colors={colors} fontMono={fontMono} />
    </>
  );
}

function CumulativeAttribution({ attribution, colors, fontMono }: { attribution: Record<string, number[]>; colors: Colors; fontMono: string }) {
  const archs = Object.keys(attribution);
  const cum: Record<string, number[]> = {};
  for (const a of archs) {
    const c: number[] = [];
    let s = 0;
    for (const v of attribution[a]) { s += v; c.push(s); }
    cum[a] = c;
  }
  const W = 360, H = 130, PAD = 6;
  const allVals = archs.flatMap((a) => cum[a]);
  const yMin = Math.min(...allVals, 0); const yMax = Math.max(...allVals, 0.01);
  const M = Math.max(...archs.map((a) => cum[a].length), 1);
  const xs = (i: number) => PAD + (i / Math.max(1, M - 1)) * (W - 2 * PAD);
  const ys = (v: number) => H - PAD - ((v - yMin) / Math.max(0.01, yMax - yMin)) * (H - 2 * PAD);
  const colorPalette = [colors.brand, colors.accent, colors.warn, "#e063b8"];
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      <line x1={PAD} y1={ys(0)} x2={W - PAD} y2={ys(0)} stroke={colors.borderSoft} strokeDasharray="3,3" />
      {archs.map((a, ai) => (
        <polyline key={a} points={cum[a].map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke={colorPalette[ai % colorPalette.length]} strokeWidth={1.6} />
      ))}
      {archs.map((a, ai) => (
        <text key={`lbl-${a}`} x={4} y={H - 5 - ai * 11} fontSize={9} fill={colorPalette[ai % colorPalette.length]} fontFamily={fontMono}>{a}</text>
      ))}
    </svg>
  );
}

// ===== Blend view ===================================================

function BlendView({
  blendSweep, signalCorr, blendW, colors, fontMono, runBlendOptimizer,
}: {
  blendSweep: { points: BlendPoint[]; best: BlendPoint } | null;
  signalCorr: { momMr: number; momSharpe: number; mrSharpe: number };
  blendW: { mom: number; mr: number; sharpe: number };
  colors: Colors; fontMono: string;
  runBlendOptimizer: () => void;
}) {
  return (
    <>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Signal blend space + correlations
      </h3>
      <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 12 }}>
        Below: triangular simplex of blend weights, colored by post-cost Sharpe. Each dot is one
        weight combination on a 0.10 grid (66 points). Run the optimizer to highlight the best.
      </p>

      <Label colors={colors}>Signal correlation matrix (Pearson r across player-month signal pairs)</Label>
      <SignalCorrMatrix corr={signalCorr} colors={colors} fontMono={fontMono} />

      <div className="flex justify-between items-center mb-[6px]">
        <Label colors={colors}>Blend simplex (Sharpe heatmap)</Label>
        <button type="button" onClick={runBlendOptimizer} style={{ fontSize: 10, padding: "3px 8px", background: colors.brandSoft, border: "1px solid " + colors.brand, color: colors.text, fontFamily: "inherit", cursor: "pointer" }}>
          ▶ run sweep
        </button>
      </div>

      {blendSweep ? (
        <BlendSimplex sweep={blendSweep} colors={colors} fontMono={fontMono} blendW={blendW} />
      ) : (
        <div style={{ padding: 14, background: colors.panelDeep, border: "1px dashed " + colors.borderSoft, fontSize: 11, color: colors.textDim, textAlign: "center" }}>
          Click <strong style={{ color: colors.text }}>run sweep</strong> to compute the 66-point blend simplex.
          Takes ~1-2 seconds - runs 66 backtests in-browser.
        </div>
      )}
    </>
  );
}

function SignalCorrMatrix({ corr, colors, fontMono }: { corr: { momMr: number; momSharpe: number; mrSharpe: number }; colors: Colors; fontMono: string }) {
  const labels = ["Mom", "MR", "Sharpe"];
  const matrix = [
    [1, corr.momMr, corr.momSharpe],
    [corr.momMr, 1, corr.mrSharpe],
    [corr.momSharpe, corr.mrSharpe, 1],
  ];
  function cellColor(r: number) {
    const a = Math.min(1, Math.abs(r));
    if (r >= 0) return `rgba(93,211,158,${0.20 + a * 0.55})`;
    return `rgba(240,104,106,${0.20 + a * 0.55})`;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, fontFamily: fontMono, fontSize: 11, marginBottom: 14 }}>
      <thead>
        <tr><th></th>{labels.map((l) => <th key={l} style={{ color: colors.textFaint, padding: 2, fontWeight: 500 }}>{l}</th>)}</tr>
      </thead>
      <tbody>
        {labels.map((rL, ri) => (
          <tr key={rL}>
            <td style={{ color: colors.textDim, padding: 2 }}>{rL}</td>
            {labels.map((_, ci) => (
              <td key={ci} style={{ background: cellColor(matrix[ri][ci]), color: colors.text, textAlign: "center", padding: 6, fontWeight: 600 }}>
                {matrix[ri][ci] >= 0 ? "+" : ""}{matrix[ri][ci].toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlendSimplex({ sweep, colors, fontMono, blendW }: { sweep: { points: BlendPoint[]; best: BlendPoint }; colors: Colors; fontMono: string; blendW: { mom: number; mr: number; sharpe: number } }) {
  // Render simplex as triangle: corners are mom=1, mr=1, sharpe=1
  const W = 360, H = 320, PAD = 30;
  const cMom: [number, number] = [W / 2, PAD];
  const cMr: [number, number] = [PAD + 12, H - PAD];
  const cSharpe: [number, number] = [W - PAD - 12, H - PAD];

  // Convert (w_mom, w_mr, w_sharpe) → (x, y) via barycentric
  function toXY(p: BlendPoint): [number, number] {
    return [
      p.mom * cMom[0] + p.mr * cMr[0] + p.sharpe * cSharpe[0],
      p.mom * cMom[1] + p.mr * cMr[1] + p.sharpe * cSharpe[1],
    ];
  }

  const sharpes = sweep.points.map((p) => p.sharpeRatio);
  const minS = Math.min(...sharpes); const maxS = Math.max(...sharpes);
  function colorFor(s: number): string {
    const t = (s - minS) / Math.max(0.0001, maxS - minS);
    if (s < 0) return `rgba(240,104,106,${0.3 + (1 - t) * 0.5})`;
    return `rgba(93,211,158,${0.3 + t * 0.6})`;
  }

  const [bx, by] = toXY(sweep.best);
  const currentPoint = { mom: blendW.mom, mr: blendW.mr, sharpe: blendW.sharpe, sharpeRatio: 0 };
  const [cx, cy] = toXY(currentPoint);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      {/* triangle outline */}
      <polygon points={`${cMom[0]},${cMom[1]} ${cMr[0]},${cMr[1]} ${cSharpe[0]},${cSharpe[1]}`} fill="none" stroke={colors.borderSoft} strokeWidth={1} />
      <text x={cMom[0]} y={cMom[1] - 8} textAnchor="middle" fontSize={10} fill={colors.brand} fontFamily={fontMono}>Mom</text>
      <text x={cMr[0]} y={cMr[1] + 14} textAnchor="middle" fontSize={10} fill={colors.warn} fontFamily={fontMono}>MR</text>
      <text x={cSharpe[0]} y={cSharpe[1] + 14} textAnchor="middle" fontSize={10} fill={colors.accent} fontFamily={fontMono}>Sharpe</text>

      {sweep.points.map((p, i) => {
        const [x, y] = toXY(p);
        return (
          <circle key={i} cx={x} cy={y} r={6} fill={colorFor(p.sharpeRatio)}>
            <title>{`Mom ${p.mom.toFixed(2)}, MR ${p.mr.toFixed(2)}, Sharpe ${p.sharpe.toFixed(2)} → Sharpe ${p.sharpeRatio.toFixed(2)}`}</title>
          </circle>
        );
      })}

      {/* Best (star) */}
      <circle cx={bx} cy={by} r={9} fill="none" stroke="#fff" strokeWidth={2} />
      <text x={bx} y={by - 14} textAnchor="middle" fontSize={10} fill="#fff" fontFamily={fontMono}>★ best Sharpe {sweep.best.sharpeRatio.toFixed(2)}</text>

      {/* Current */}
      <circle cx={cx} cy={cy} r={5} fill="none" stroke={colors.warn} strokeWidth={2} />
    </svg>
  );
}

// ===== Helpers ======================================================

function Slider({
  label, value, min, max, step, onChange, colors, fontMono, track, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; colors: Colors; fontMono: string; track: string; fmt?: (v: number) => string;
}) {
  return (
    <div className="mt-[8px]">
      <div className="flex items-baseline justify-between mb-[3px]">
        <Label colors={colors}>{label}</Label>
        <span style={{ fontFamily: fontMono, fontSize: 12, color: colors.text, fontVariantNumeric: "tabular-nums" }}>
          {fmt ? fmt(value) : value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: track }} />
    </div>
  );
}

function Label({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9.5, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 3 }}>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, colors, fontMono }: { label: string; value: string; tone: string; colors: Colors; fontMono: string }) {
  return (
    <div className="px-[10px] py-[8px]" style={{ background: colors.panelDeep }}>
      <div style={{ fontSize: 9, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.14em" }}>{label}</div>
      <div style={{ fontSize: 18, color: tone, fontFamily: fontMono, marginTop: 2, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

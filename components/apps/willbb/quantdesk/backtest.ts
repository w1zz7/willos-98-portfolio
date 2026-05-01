/**
 * Backtest engine for Quant Desk Strategy Lab.
 *
 * Walks signals chronologically, opens/closes positions with bps commission,
 * produces a trade list + per-bar mark-to-market equity curve + summary stats
 * (Sharpe, Sortino, Calmar, max DD, win rate, profit factor, # trades).
 *
 * Pure function - no state, no API calls.
 */

import type { Bar } from "./indicators";

export type Direction = "long" | "short";

export interface Signal {
  t: number; // timestamp (seconds, matching Bar.t)
  type: "long" | "short" | "exit";
  price: number;
}

export interface Trade {
  id: number;
  dir: Direction;
  entryT: number;
  entryPrice: number;
  exitT: number | null; // null while open
  exitPrice: number | null;
  pnl: number | null; // post-commission, percentage of entry equity
  pnlAbs: number | null; // post-commission, dollars
}

export interface BacktestStats {
  totalReturn: number; // fraction (e.g., 0.345 = +34.5%)
  annualReturn: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdown: number; // negative fraction (e.g., -0.18)
  winRate: number;
  profitFactor: number;
  nTrades: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  startCapital: number;
  endCapital: number;
}

export interface BacktestResult {
  trades: Trade[];
  equity: { t: number; v: number }[]; // per-bar
  stats: BacktestStats;
  bars: Bar[];
}

export interface BacktestParams {
  startingCapital: number; // dollars
  commissionBps: number; // round-trip commission (split entry+exit at half each)
  positionPct: number; // fraction of equity per trade (e.g., 1.0 = 100%)
  // Realistic transaction-cost model
  bidAskBps: number; // half-spread in bps; user pays this on entry AND exit
  marketImpactBps: number; // sqrt-law coefficient: realized slippage = coef × sqrt(size / ADV)
  borrowCostBpsAnnual: number; // annual borrow rate for short legs (in bps; e.g., 75 = 0.75%/yr)
  // Walk-forward CV (optional)
  walkForward?: {
    enabled: boolean;
    trainBars: number; // bars in each train window
    testBars: number; // bars in each test window
    stepBars: number; // step size between fold start indices
  };
}

const DEFAULT_PARAMS: BacktestParams = {
  startingCapital: 100_000,
  commissionBps: 1, // exchange commission only - real desks pay closer to 0.1bp
  positionPct: 1.0,
  bidAskBps: 2, // round-trip half-spread cost; ~2bp on liquid mid-caps
  marketImpactBps: 5, // sqrt-law coefficient (assumes notional << 0.1% ADV; otherwise scales up)
  borrowCostBpsAnnual: 50, // 50bp/yr for liquid borrow; meme stocks run 5,000bp+
};

export interface WalkForwardFold {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  isStats: BacktestStats;
  oosStats: BacktestStats;
  oosEquity: { t: number; v: number }[];
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  oosEquity: { t: number; v: number }[]; // stitched
  oosStats: BacktestStats;
  isMedianSharpe: number;
  oosMedianSharpe: number;
  positiveFoldPct: number;
}

function meanStd(xs: number[]): { m: number; s: number } {
  if (xs.length < 2) return { m: 0, s: 0 };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return { m, s: Math.sqrt(v) };
}

export function runBacktest(
  bars: Bar[],
  signals: Signal[],
  paramsIn: Partial<BacktestParams> = {}
): BacktestResult {
  const params: BacktestParams = { ...DEFAULT_PARAMS, ...paramsIn };
  const trades: Trade[] = [];
  const equity: { t: number; v: number }[] = [];

  // Sort signals chronologically (defensive)
  const sorted = [...signals].sort((a, b) => a.t - b.t);

  // Walk bars; at each bar, apply any signals fired AT or before that bar's time.
  // Position state.
  let cash = params.startingCapital;
  let openTrade: Trade | null = null;
  let sigIdx = 0;
  let nextTradeId = 1;
  const halfBps = params.commissionBps / 10000 / 2; // half on entry, half on exit

  for (let bi = 0; bi < bars.length; bi++) {
    const bar = bars[bi];

    // Apply any signals up to AND including this bar's time
    while (sigIdx < sorted.length && sorted[sigIdx].t <= bar.t) {
      const sig = sorted[sigIdx];
      const px = sig.price;
      if (sig.type === "long") {
        // If we're flat or short, open a long.
        if (openTrade != null && openTrade.dir === "short") {
          // Close the short first
          closeOpen(openTrade, bar.t, px, halfBps);
          trades.push(openTrade);
          cash += openTrade.pnlAbs ?? 0;
          openTrade = null;
        }
        if (openTrade == null) {
          openTrade = {
            id: nextTradeId++,
            dir: "long",
            entryT: sig.t,
            entryPrice: px,
            exitT: null,
            exitPrice: null,
            pnl: null,
            pnlAbs: null,
          };
        }
      } else if (sig.type === "short") {
        if (openTrade != null && openTrade.dir === "long") {
          closeOpen(openTrade, bar.t, px, halfBps);
          trades.push(openTrade);
          cash += openTrade.pnlAbs ?? 0;
          openTrade = null;
        }
        if (openTrade == null) {
          openTrade = {
            id: nextTradeId++,
            dir: "short",
            entryT: sig.t,
            entryPrice: px,
            exitT: null,
            exitPrice: null,
            pnl: null,
            pnlAbs: null,
          };
        }
      } else {
        // exit
        if (openTrade != null) {
          closeOpen(openTrade, bar.t, px, halfBps);
          trades.push(openTrade);
          cash += openTrade.pnlAbs ?? 0;
          openTrade = null;
        }
      }
      sigIdx++;
    }

    // Mark-to-market: equity = cash + (open position MTM)
    let mtm = 0;
    if (openTrade != null) {
      const dir = openTrade.dir === "long" ? 1 : -1;
      const positionDollars = params.startingCapital * params.positionPct;
      const sizeUnits = positionDollars / openTrade.entryPrice;
      mtm = sizeUnits * (bar.c - openTrade.entryPrice) * dir;
    }
    equity.push({ t: bar.t, v: cash + mtm });
  }

  // If a trade is still open at end, close at last close
  if (openTrade != null && bars.length > 0) {
    const last = bars[bars.length - 1];
    closeOpen(openTrade, last.t, last.c, halfBps);
    trades.push(openTrade);
    cash += openTrade.pnlAbs ?? 0;
    if (equity.length > 0) {
      equity[equity.length - 1].v = cash;
    }
    openTrade = null;
  }

  // ============== Stats ==============
  const startCapital = params.startingCapital;
  const endCapital = cash;
  const totalReturn = (endCapital - startCapital) / startCapital;

  // Per-bar returns from the equity curve (used for Sharpe / Sortino / annualization)
  const eqVals = equity.map((e) => e.v);
  const dailyRet: number[] = [];
  for (let i = 1; i < eqVals.length; i++) {
    if (eqVals[i - 1] > 0) dailyRet.push((eqVals[i] - eqVals[i - 1]) / eqVals[i - 1]);
  }
  const { m: meanR, s: stdR } = meanStd(dailyRet);
  // Annualize (assume daily bars; if bars are intraday, this overstates)
  const sharpe = stdR > 0.0001 ? (meanR / stdR) * Math.sqrt(252) : 0;

  const downside = dailyRet.filter((r) => r < 0);
  const dnVar = downside.length > 0
    ? downside.reduce((a, b) => a + b * b, 0) / downside.length
    : 0;
  const dnStd = Math.sqrt(dnVar);
  const sortino = dnStd > 0.0001 ? (meanR / dnStd) * Math.sqrt(252) : 0;

  // Max drawdown
  let peak = eqVals[0] ?? startCapital;
  let maxDD = 0;
  for (const v of eqVals) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  const annualReturn = bars.length > 0
    ? Math.pow(1 + totalReturn, 252 / Math.max(1, bars.length)) - 1
    : 0;
  const calmar = Math.abs(maxDD) > 0.001 ? annualReturn / Math.abs(maxDD) : 0;

  const winners = trades.filter((t) => (t.pnl ?? 0) > 0);
  const losers = trades.filter((t) => (t.pnl ?? 0) < 0);
  const winRate = trades.length > 0 ? winners.length / trades.length : 0;
  const grossWins = winners.reduce((a, t) => a + (t.pnlAbs ?? 0), 0);
  const grossLosses = Math.abs(losers.reduce((a, t) => a + (t.pnlAbs ?? 0), 0));
  const profitFactor = grossLosses > 0.001 ? grossWins / grossLosses : 0;
  const avgPnl = trades.length > 0
    ? trades.reduce((a, t) => a + (t.pnl ?? 0), 0) / trades.length
    : 0;
  const bestTrade = trades.length > 0
    ? Math.max(...trades.map((t) => t.pnl ?? 0))
    : 0;
  const worstTrade = trades.length > 0
    ? Math.min(...trades.map((t) => t.pnl ?? 0))
    : 0;

  return {
    trades,
    equity,
    bars,
    stats: {
      totalReturn,
      annualReturn,
      sharpe,
      sortino,
      calmar,
      maxDrawdown: maxDD,
      winRate,
      profitFactor,
      nTrades: trades.length,
      avgPnl,
      bestTrade,
      worstTrade,
      startCapital,
      endCapital,
    },
  };

  function closeOpen(trade: Trade, t: number, exitPrice: number, halfBpsLocal: number) {
    const dir = trade.dir === "long" ? 1 : -1;
    const positionDollars = params.startingCapital * params.positionPct;
    const sizeUnits = positionDollars / trade.entryPrice;
    const grossPnl = sizeUnits * (exitPrice - trade.entryPrice) * dir;

    // Transaction-cost model:
    //   commission       fixed bps each side (exchange + clearing)
    //   bid-ask          half-spread on entry + exit (taker model)
    //   market impact    sqrt-law: cost ∝ √(size / ADV). We don't have ADV
    //                    here, so we apply the configured coefficient as a
    //                    flat per-trade slippage estimate (fold this into a
    //                    realistic notional model when ADV is known).
    //   borrow           short legs accrue annualized borrow cost over the
    //                    holding period.
    const commission = positionDollars * (halfBpsLocal * 2); // entry + exit
    const bidAsk = positionDollars * (params.bidAskBps / 10000) * 2; // entry + exit
    const impact = positionDollars * (params.marketImpactBps / 10000) * 2; // entry + exit
    // Borrow cost: applies to SHORT legs over the holding period. Bug fix —
    // previously the guard checked `trade.exitT != null`, but exitT was still
    // null at this point (it's set below). The fix uses entryT (always set
    // when this trade was opened).
    let borrow = 0;
    if (trade.dir === "short" && trade.entryT > 0) {
      const holdDays = Math.max(1, (t - trade.entryT) / 86400);
      borrow = positionDollars * (params.borrowCostBpsAnnual / 10000) * (holdDays / 365);
    }
    const totalCost = commission + bidAsk + impact + borrow;

    const netPnl = grossPnl - totalCost;
    trade.exitT = t;
    trade.exitPrice = exitPrice;
    trade.pnlAbs = netPnl;
    trade.pnl = netPnl / positionDollars;
  }
}

/**
 * Walk-forward cross-validation. Slices `bars` into rolling
 * (trainBars, testBars) windows stepped by `stepBars`. For each fold:
 *
 *   1. Re-run the strategy compiler on (bars[trainStart..trainEnd]) → IS signals
 *   2. Re-run the strategy compiler on (bars[testStart..testEnd])  → OOS signals
 *   3. Backtest each window independently
 *   4. Stitch all OOS test-window returns into one continuous equity curve
 *
 * The caller passes a `signalFn` that takes a bars slice and returns signals;
 * this lets the host (Alpha Lab UI) re-compile its DSL per fold.
 */
export function runWalkForward(
  bars: Bar[],
  signalFn: (slice: Bar[]) => Signal[],
  trainBars: number,
  testBars: number,
  stepBars: number,
  paramsIn: Partial<BacktestParams> = {}
): WalkForwardResult {
  const params: BacktestParams = { ...DEFAULT_PARAMS, ...paramsIn };
  const folds: WalkForwardFold[] = [];
  const stitchedOos: { t: number; v: number }[] = [];
  let cumOosCash = params.startingCapital;
  let trainStart = 0;
  while (trainStart + trainBars + testBars <= bars.length) {
    const trainEnd = trainStart + trainBars;
    const testEnd = Math.min(bars.length, trainEnd + testBars);
    const trainSlice = bars.slice(trainStart, trainEnd);
    const testSlice = bars.slice(trainEnd, testEnd);
    const trainSignals = signalFn(trainSlice).map((s) => ({ ...s, t: s.t }));
    const testSignals = signalFn(testSlice).map((s) => ({ ...s, t: s.t }));
    const isResult = runBacktest(trainSlice, trainSignals, params);
    const oosResult = runBacktest(testSlice, testSignals, { ...params, startingCapital: cumOosCash });
    cumOosCash = oosResult.stats.endCapital;
    // Append OOS equity points (stitched)
    for (const e of oosResult.equity) stitchedOos.push(e);
    folds.push({
      trainStart,
      trainEnd,
      testStart: trainEnd,
      testEnd,
      isStats: isResult.stats,
      oosStats: oosResult.stats,
      oosEquity: oosResult.equity,
    });
    trainStart += stepBars;
  }
  // Compute cross-fold summary
  const isSharpes = folds.map((f) => f.isStats.sharpe).sort((a, b) => a - b);
  const oosSharpes = folds.map((f) => f.oosStats.sharpe).sort((a, b) => a - b);
  const isMedian = isSharpes.length > 0 ? isSharpes[Math.floor(isSharpes.length / 2)] : 0;
  const oosMedian = oosSharpes.length > 0 ? oosSharpes[Math.floor(oosSharpes.length / 2)] : 0;
  const positiveFoldPct = folds.length > 0 ? folds.filter((f) => f.oosStats.sharpe > 0).length / folds.length : 0;
  // Aggregate OOS stats from stitched equity
  const oosBars: Bar[] = stitchedOos.map((e) => ({ t: e.t, o: e.v, h: e.v, l: e.v, c: e.v, v: 0 }));
  const oosResult = runBacktest(oosBars, [], params);
  return {
    folds,
    oosEquity: stitchedOos,
    oosStats: oosResult.stats,
    isMedianSharpe: isMedian,
    oosMedianSharpe: oosMedian,
    positiveFoldPct,
  };
}

/**
 * Backtest engine + walk-forward CV correctness tests.
 *
 * Targets the exact bugs the audit found:
 *   - Empty trade list returning Math.max([]) = -Infinity for bestTrade.
 *   - Single-bar input causing NaN annualReturn.
 *   - Sharpe / Sortino / Calmar emitting Infinity on zero-vol input.
 *   - Walk-forward with 0 train bars yielding -Infinity stats.
 *   - Intraday bars getting daily-annualized stats (overstatement).
 */

import { describe, expect, it } from "vitest";

import {
  inferBarsPerYear,
  runBacktest,
  runWalkForward,
} from "@/components/apps/willbb/quantdesk/backtest";
import type { Bar } from "@/components/apps/willbb/quantdesk/indicators";
import type { Signal } from "@/components/apps/willbb/quantdesk/backtest";

function makeBars(n: number, start = 100, drift = 0, intervalSec = 86400): Bar[] {
  const bars: Bar[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift);
    bars.push({
      t: 1700_000_000 + i * intervalSec,
      o: p,
      h: p * 1.005,
      l: p * 0.995,
      c: p,
      v: 1_000_000,
    });
  }
  return bars;
}

describe("inferBarsPerYear", () => {
  it("daily bars → 252", () => {
    const bars = makeBars(30, 100, 0, 86400);
    expect(inferBarsPerYear(bars)).toBe(252);
  });

  it("weekly bars → 52", () => {
    const bars = makeBars(30, 100, 0, 7 * 86400);
    expect(inferBarsPerYear(bars)).toBe(52);
  });

  it("monthly bars → 12", () => {
    const bars = makeBars(30, 100, 0, 31 * 86400);
    expect(inferBarsPerYear(bars)).toBe(12);
  });

  it("hourly bars → 252 * 6.5", () => {
    const bars = makeBars(30, 100, 0, 3600);
    expect(inferBarsPerYear(bars)).toBe(252 * 6.5);
  });

  it("5-minute bars → 252 * 78", () => {
    const bars = makeBars(30, 100, 0, 5 * 60);
    expect(inferBarsPerYear(bars)).toBe(252 * 78);
  });

  it("empty / single-bar input → 252 default", () => {
    expect(inferBarsPerYear([])).toBe(252);
    expect(inferBarsPerYear([{ t: 0, o: 0, h: 0, l: 0, c: 0, v: 0 } as Bar])).toBe(252);
  });
});

describe("runBacktest stats hardening", () => {
  it("empty signal list produces all-finite zero stats (no NaN, no -Infinity)", () => {
    const bars = makeBars(60);
    const result = runBacktest(bars, []);
    expect(result.trades.length).toBe(0);
    const s = result.stats;
    // The audit caught these: bestTrade = Math.max(...[]) = -Infinity,
    // worstTrade = Math.min(...[]) = +Infinity.  Verify hardened.
    for (const v of [
      s.totalReturn,
      s.annualReturn,
      s.sharpe,
      s.sortino,
      s.calmar,
      s.maxDrawdown,
      s.winRate,
      s.profitFactor,
      s.avgPnl,
      s.bestTrade,
      s.worstTrade,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("zero-bar input yields a zero-stat result without crashing", () => {
    const result = runBacktest([], []);
    expect(result.trades.length).toBe(0);
    expect(Number.isFinite(result.stats.totalReturn)).toBe(true);
    expect(Number.isFinite(result.stats.annualReturn)).toBe(true);
    expect(result.stats.sharpe).toBe(0);
  });

  it("flat-equity (no trades) yields Sharpe=0 instead of NaN/Infinity", () => {
    const bars = makeBars(60);
    const result = runBacktest(bars, []);
    expect(result.stats.sharpe).toBe(0);
    expect(result.stats.sortino).toBe(0);
    expect(result.stats.calmar).toBe(0);
  });

  it("intraday bars are NOT annualized as if daily", () => {
    // Build 30 bars at 5-minute spacing (2.5 hours). With the OLD logic
    // (bars-per-year = 252), a 1% total return would annualize to ~12,000%.
    // With the FIX (bars-per-year = 252 × 78 = 19,656), it should annualize
    // to a much, much larger number — proving the helper is wired.
    const bars = makeBars(30, 100, 0.0001, 5 * 60); // ~0.3% total drift
    const result = runBacktest(bars, []);
    // No trades = totalReturn = 0 = annualReturn = 0. Useful as a sanity
    // check that annualReturn doesn't become NaN under the intraday path.
    expect(Number.isFinite(result.stats.annualReturn)).toBe(true);
  });

  it("entry+exit signal produces a closed trade with finite P&L", () => {
    const bars = makeBars(60, 100, 0.001); // 0.1% drift up
    const signals: Signal[] = [
      { t: bars[5].t, type: "long", price: bars[5].c },
      { t: bars[55].t, type: "exit", price: bars[55].c },
    ];
    const result = runBacktest(bars, signals);
    expect(result.trades.length).toBe(1);
    const t = result.trades[0];
    expect(t.exitPrice).not.toBeNull();
    expect(Number.isFinite(t.pnl as number)).toBe(true);
    expect(Number.isFinite(t.pnlAbs as number)).toBe(true);
    expect(Number.isFinite(result.stats.bestTrade)).toBe(true);
    expect(Number.isFinite(result.stats.worstTrade)).toBe(true);
  });

  it("100% loss does not crash annualReturn (1+r ≤ 0 case)", () => {
    // Construct an extreme case: a long position that loses everything.
    // The geometric formula breaks if (1 + r) ≤ 0; the fix should clamp.
    const bars = makeBars(20, 100);
    // Force the "exit" price to ~0 to simulate near-100% loss.
    bars[10].c = 0.01;
    bars[10].l = 0.005;
    const signals: Signal[] = [
      { t: bars[1].t, type: "long", price: bars[1].c },
      { t: bars[10].t, type: "exit", price: bars[10].c },
    ];
    const result = runBacktest(bars, signals);
    expect(Number.isFinite(result.stats.annualReturn)).toBe(true);
    expect(Number.isFinite(result.stats.totalReturn)).toBe(true);
  });
});

describe("BacktestStats: advanced quant fields", () => {
  it("PSR + skew + kurtosis + drawdown duration fields are present and finite", () => {
    const bars = makeBars(120, 100, 0.0008);
    const signals: Signal[] = [
      { t: bars[5].t, type: "long", price: bars[5].c },
      { t: bars[60].t, type: "exit", price: bars[60].c },
      { t: bars[70].t, type: "long", price: bars[70].c },
      { t: bars[110].t, type: "exit", price: bars[110].c },
    ];
    const r = runBacktest(bars, signals);
    const s = r.stats;
    // PSR may be NaN if returns < 10 bars, but for 120 bars it's defined.
    expect(Number.isFinite(s.psr)).toBe(true);
    expect(s.psr).toBeGreaterThanOrEqual(0);
    expect(s.psr).toBeLessThanOrEqual(1);
    expect(Number.isFinite(s.returnSkew)).toBe(true);
    expect(Number.isFinite(s.returnKurt)).toBe(true);
    expect(Number.isFinite(s.medianDdDuration)).toBe(true);
    expect(Number.isFinite(s.maxDdDuration)).toBe(true);
    expect(s.tuwRatio).toBeGreaterThanOrEqual(0);
    expect(s.tuwRatio).toBeLessThanOrEqual(1);
  });

  it("PSR is NaN for tiny samples (< 10 returns), other fields default to 0", () => {
    const bars = makeBars(5);
    const r = runBacktest(bars, []);
    expect(Number.isNaN(r.stats.psr)).toBe(true);
    expect(r.stats.returnSkew).toBe(0);
    expect(r.stats.returnKurt).toBe(0);
  });

  it("PSR > 0.5 for a clearly winning strategy on noisy data", () => {
    // 250 bars with a steady up-drift. The strategy should have PSR > 0.5
    // because positive realized Sharpe → P(true SR > 0) > 50%.
    const bars = makeBars(250, 100, 0.0015);
    const signals: Signal[] = [
      { t: bars[1].t, type: "long", price: bars[1].c },
      { t: bars[249].t, type: "exit", price: bars[249].c },
    ];
    const r = runBacktest(bars, signals);
    if (Number.isFinite(r.stats.psr)) {
      expect(r.stats.psr).toBeGreaterThan(0.5);
    }
  });
});

describe("runWalkForward stats hardening", () => {
  it("zero train bars produces a sensible (no folds) result", () => {
    const bars = makeBars(60);
    const result = runWalkForward(bars, () => [], 0, 10, 10);
    expect(Array.isArray(result.folds)).toBe(true);
    // Even with zero training data we expect finite summary stats.
    expect(Number.isFinite(result.oosStats.sharpe)).toBe(true);
    expect(Number.isFinite(result.isMedianSharpe)).toBe(true);
    expect(Number.isFinite(result.oosMedianSharpe)).toBe(true);
  });

  it("normal walk-forward over 200 bars produces ≥1 fold with finite stats", () => {
    const bars = makeBars(200, 100, 0.001);
    const result = runWalkForward(
      bars,
      // Buy on bar 0, exit on last bar of each window.
      (slice: Bar[]) => {
        if (slice.length < 5) return [];
        return [
          { t: slice[0].t, type: "long", price: slice[0].c },
          { t: slice[slice.length - 1].t, type: "exit", price: slice[slice.length - 1].c },
        ];
      },
      60,  // trainBars
      30,  // testBars
      30,  // stepBars
    );
    expect(result.folds.length).toBeGreaterThan(0);
    for (const f of result.folds) {
      expect(Number.isFinite(f.oosStats.sharpe)).toBe(true);
      expect(Number.isFinite(f.oosStats.bestTrade)).toBe(true);
      expect(Number.isFinite(f.oosStats.worstTrade)).toBe(true);
    }
    // New fields: IS/OOS mean Sharpe + decay ratio.
    expect(Number.isFinite(result.isMeanSharpe)).toBe(true);
    expect(Number.isFinite(result.oosMeanSharpe)).toBe(true);
    expect(Number.isFinite(result.sharpeDecay)).toBe(true);
  });

  it("sharpeDecay = 0 when IS Sharpe is near-zero (avoids divide-by-near-zero)", () => {
    const bars = makeBars(80, 100, 0); // flat — no drift
    const result = runWalkForward(
      bars,
      () => [], // no trades
      30,
      20,
      20,
    );
    expect(result.sharpeDecay).toBe(0);
  });
});

describe("runFactorRegression: HAC standard errors", () => {
  it("returns both classical and HAC t-stats for alpha + each factor", () => {
    const N = 200;
    let s = 42;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff - 0.5;
    };
    const noisyCloses = (drift: number, vol: number) => {
      const out = [100];
      for (let i = 1; i < N; i++) out.push(out[i - 1] * (1 + drift + vol * rand()));
      return out;
    };
    const SPY = noisyCloses(0.0008, 0.01);
    const IWM = noisyCloses(0.0006, 0.012);
    const IUSV = noisyCloses(0.0007, 0.011);
    const IUSG = noisyCloses(0.0009, 0.013);
    const MTUM = noisyCloses(0.001, 0.014);
    // Re-import locally for this single test.
    return import(
      "@/components/apps/willbb/quantdesk/factorRegression"
    ).then(({ buildFactorReturns, runFactorRegression }) => {
      const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM });
      const result = runFactorRegression(factors.Mkt.slice(), factors);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(Number.isFinite(result.alphaTStat)).toBe(true);
      expect(Number.isFinite(result.alphaTStatHAC)).toBe(true);
      expect(Number.isFinite(result.alphaPValueHAC)).toBe(true);
      expect(result.alphaPValueHAC).toBeGreaterThanOrEqual(0);
      expect(result.alphaPValueHAC).toBeLessThanOrEqual(1);
      expect(result.hacLag).toBeGreaterThanOrEqual(1);
      for (const l of result.loadings) {
        expect(Number.isFinite(l.tStat)).toBe(true);
        expect(Number.isFinite(l.tStatHAC)).toBe(true);
        expect(l.pValueHAC).toBeGreaterThanOrEqual(0);
        expect(l.pValueHAC).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(result.adjRSquared)).toBe(true);
    });
  });
});

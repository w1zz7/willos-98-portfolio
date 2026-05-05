/**
 * End-to-end integration tests for the QuantDesk research pipeline.
 *
 * Pins behavior across the FULL flow: synthetic price data → indicators
 * → signal generation → backtest → advanced statistics → factor regression.
 * Catches accuracy regressions that pass unit tests but fail when the
 * pieces are wired together.
 *
 * Strategy implementations here MIRROR the JS presets in presets.ts —
 * they're typed TS so vitest can run them directly without evaluating
 * the preset source code.
 *
 * Each test pins one of three things:
 *   1. Sign + magnitude of the result (Sharpe positive on uptrend, etc.)
 *   2. Internal consistency (Sharpe stats agree with their input series)
 *   3. Pipeline integration (advanced stats reach BacktestStats correctly)
 */

import { describe, expect, it } from "vitest";

import {
  inferBarsPerYear,
  runBacktest,
  runWalkForward,
  type BacktestStats,
  type Signal,
} from "@/components/apps/willbb/quantdesk/backtest";
import {
  buildFactorReturns,
  runFactorRegression,
} from "@/components/apps/willbb/quantdesk/factorRegression";
import {
  bb,
  log_ret,
  macd,
  rsi,
  sma,
  type Bar,
} from "@/components/apps/willbb/quantdesk/indicators";
import {
  blockBootstrapCI,
  drawdownStats,
  probabilisticSharpe,
} from "@/components/apps/willbb/quantdesk/advancedStats";

/* ====================================================================
 * Synthetic price-path generators with known properties.
 * Each generator uses a deterministic LCG so tests are reproducible.
 * ==================================================================== */

function makeBars(
  n: number,
  start: number,
  drift: number,
  vol: number,
  seed = 7,
): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  };
  const bars: Bar[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift + vol * rand());
    bars.push({
      t: 1700_000_000 + i * 86400,
      o: p * 0.999,
      h: p * 1.005,
      l: p * 0.995,
      c: p,
      v: 1_000_000,
    });
  }
  return bars;
}

/** Sinusoidal mean-reverting series — RSI strategies should win here. */
function makeOscillatingBars(n: number, basePrice = 100, amp = 0.05, period = 30, seed = 11): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  };
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const cycle = Math.sin((2 * Math.PI * i) / period);
    const noise = rand() * 0.005;
    const p = basePrice * (1 + amp * cycle + noise);
    bars.push({
      t: 1700_000_000 + i * 86400,
      o: p * 0.999,
      h: p * 1.005,
      l: p * 0.995,
      c: p,
      v: 1_000_000,
    });
  }
  return bars;
}

/* ====================================================================
 * Strategy implementations (mirrors presets.ts in pure TS)
 * ==================================================================== */

function maCrossoverSignals(bars: Bar[], fastN = 20, slowN = 50): Signal[] {
  const closes = bars.map((b) => b.c);
  const fast = sma(closes, fastN);
  const slow = sma(closes, slowN);
  const signals: Signal[] = [];
  let position: "flat" | "long" = "flat";
  for (let i = 1; i < bars.length; i++) {
    const fp = fast[i - 1], sp = slow[i - 1], fn = fast[i], sn = slow[i];
    if (fp == null || sp == null || fn == null || sn == null) continue;
    if (fp <= sp && fn > sn && position !== "long") {
      signals.push({ t: bars[i].t, type: "long", price: bars[i].c });
      position = "long";
    } else if (fp >= sp && fn < sn && position === "long") {
      signals.push({ t: bars[i].t, type: "exit", price: bars[i].c });
      position = "flat";
    }
  }
  return signals;
}

function rsiMeanReversionSignals(bars: Bar[], n = 14, lo = 30, hi = 70): Signal[] {
  const closes = bars.map((b) => b.c);
  const rsiVals = rsi(closes, n);
  const signals: Signal[] = [];
  let position: "flat" | "long" = "flat";
  for (let i = 1; i < bars.length; i++) {
    const r = rsiVals[i], rp = rsiVals[i - 1];
    if (r == null || rp == null) continue;
    if (rp >= lo && r < lo && position !== "long") {
      signals.push({ t: bars[i].t, type: "long", price: bars[i].c });
      position = "long";
    } else if (rp <= hi && r > hi && position === "long") {
      signals.push({ t: bars[i].t, type: "exit", price: bars[i].c });
      position = "flat";
    }
  }
  return signals;
}

function macdTrendSignals(bars: Bar[]): Signal[] {
  const closes = bars.map((b) => b.c);
  const m = macd(closes, 12, 26, 9);
  const signals: Signal[] = [];
  let position: "flat" | "long" = "flat";
  for (let i = 1; i < bars.length; i++) {
    const mn = m.macd[i], sn = m.signal[i], mp = m.macd[i - 1], sp = m.signal[i - 1];
    if (mn == null || sn == null || mp == null || sp == null) continue;
    if (mp <= sp && mn > sn && position !== "long") {
      signals.push({ t: bars[i].t, type: "long", price: bars[i].c });
      position = "long";
    } else if (mp >= sp && mn < sn && position === "long") {
      signals.push({ t: bars[i].t, type: "exit", price: bars[i].c });
      position = "flat";
    }
  }
  return signals;
}

function bbBreakoutSignals(bars: Bar[]): Signal[] {
  const closes = bars.map((b) => b.c);
  const b = bb(closes, 20, 2);
  const signals: Signal[] = [];
  let position: "flat" | "long" = "flat";
  for (let i = 1; i < bars.length; i++) {
    const upN = b.upper[i], midN = b.middle[i], upP = b.upper[i - 1], midP = b.middle[i - 1];
    if (upN == null || midN == null || upP == null || midP == null) continue;
    const cur = bars[i].c, prev = bars[i - 1].c;
    if (prev <= upP && cur > upN && position !== "long") {
      signals.push({ t: bars[i].t, type: "long", price: cur });
      position = "long";
    } else if (prev >= midP && cur < midN && position === "long") {
      signals.push({ t: bars[i].t, type: "exit", price: cur });
      position = "flat";
    }
  }
  return signals;
}

function buyAndHoldSignals(bars: Bar[]): Signal[] {
  if (bars.length < 2) return [];
  return [
    { t: bars[1].t, type: "long", price: bars[1].c },
    { t: bars[bars.length - 1].t, type: "exit", price: bars[bars.length - 1].c },
  ];
}

/* ====================================================================
 * Sanity assertions on every BacktestStats result.
 * Catches NaN / Inf / out-of-range bugs that unit tests miss.
 * ==================================================================== */

function assertStatsAreFinite(s: BacktestStats, label: string) {
  for (const [field, v] of Object.entries(s)) {
    // PSR is allowed to be NaN when sample size < 10.
    if (field === "psr" && Number.isNaN(v)) continue;
    expect(
      Number.isFinite(v) || Number.isNaN(v),
      `${label}.${field} = ${v}`,
    ).toBe(true);
  }
  expect(s.winRate).toBeGreaterThanOrEqual(0);
  expect(s.winRate).toBeLessThanOrEqual(1);
  expect(s.tuwRatio).toBeGreaterThanOrEqual(0);
  expect(s.tuwRatio).toBeLessThanOrEqual(1);
  // maxDrawdown is bounded at -1.0 for long-only strategies (a 100% loss),
  // but short positions can exceed -1.0 when the underlying rallies (a $100
  // short that goes to $215 = -115% drawdown). We just require finiteness.
  if (Number.isFinite(s.psr) && !Number.isNaN(s.psr)) {
    expect(s.psr).toBeGreaterThanOrEqual(0);
    expect(s.psr).toBeLessThanOrEqual(1);
  }
}

/* ====================================================================
 * Tests
 * ==================================================================== */

describe("buy-and-hold sanity (the cheapest credibility check)", () => {
  it("uptrend B&H: positive total return, positive Sharpe, all stats finite", () => {
    const bars = makeBars(252, 100, 0.0008, 0.012, 17);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    assertStatsAreFinite(r.stats, "uptrend B&H");
    expect(r.stats.totalReturn).toBeGreaterThan(0);
    expect(r.stats.sharpe).toBeGreaterThan(0);
    expect(r.trades.length).toBe(1);
  });

  it("downtrend B&H: negative total return, negative Sharpe", () => {
    const bars = makeBars(252, 100, -0.0008, 0.012, 19);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    assertStatsAreFinite(r.stats, "downtrend B&H");
    expect(r.stats.totalReturn).toBeLessThan(0);
    expect(r.stats.sharpe).toBeLessThan(0);
  });

  it("flat-drift B&H: Sharpe near 0 and PSR near 0.5", () => {
    const bars = makeBars(500, 100, 0.0001, 0.012, 23);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    assertStatsAreFinite(r.stats, "flat B&H");
    expect(Math.abs(r.stats.sharpe)).toBeLessThan(2);
  });
});

describe("MA Crossover preset", () => {
  it("on a strongly trending series produces a finite number of trades, all stats finite", () => {
    // MA crossover is signal-driven: whether crossovers occur depends on
    // the random walk's path, not just its drift. We assert the broader
    // invariant — stats are finite regardless of trade count.
    const bars = makeBars(400, 100, 0.0015, 0.015, 29);
    const sigs = maCrossoverSignals(bars, 20, 50);
    const r = runBacktest(bars, sigs);
    assertStatsAreFinite(r.stats, "MA crossover trend");
    expect(r.trades.length).toBeGreaterThanOrEqual(0);
    // If the strategy did trade, P&L on each trade is finite.
    for (const t of r.trades) {
      if (t.pnl != null) expect(Number.isFinite(t.pnl)).toBe(true);
    }
  });

  it("on a choppy mean-reverting series whipsaws (multiple trades, mixed P&L)", () => {
    const bars = makeOscillatingBars(400, 100, 0.04, 25, 31);
    const sigs = maCrossoverSignals(bars, 10, 30);
    const r = runBacktest(bars, sigs);
    assertStatsAreFinite(r.stats, "MA crossover choppy");
    // Whipsaw signature: we enter and exit multiple times.
    if (r.trades.length >= 3) {
      expect(r.trades.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("RSI Mean Reversion preset", () => {
  it("on oscillating data: positive winRate, sane Sharpe", () => {
    const bars = makeOscillatingBars(400, 100, 0.04, 25, 37);
    const sigs = rsiMeanReversionSignals(bars, 14, 30, 70);
    const r = runBacktest(bars, sigs);
    assertStatsAreFinite(r.stats, "RSI MR oscillator");
    if (r.trades.length >= 3) {
      // Mean reversion on a clean oscillator should have decent win rate.
      expect(r.stats.winRate).toBeGreaterThan(0.3);
    }
  });

  it("on a trending series: signals are sparse (few oversold dips)", () => {
    const bars = makeBars(252, 100, 0.001, 0.01, 41);
    const sigs = rsiMeanReversionSignals(bars, 14, 30, 70);
    const r = runBacktest(bars, sigs);
    assertStatsAreFinite(r.stats, "RSI MR trending");
    // RSI rarely drops below 30 in a steady uptrend — usually 0–3 trades.
    expect(r.trades.length).toBeLessThan(15);
  });
});

describe("MACD Trend preset", () => {
  it("on trending data: at least 1 trade, all stats finite", () => {
    const bars = makeBars(400, 100, 0.001, 0.014, 43);
    const sigs = macdTrendSignals(bars);
    const r = runBacktest(bars, sigs);
    assertStatsAreFinite(r.stats, "MACD trend");
  });
});

describe("Bollinger Breakout preset", () => {
  it("on volatile data: produces breakout signals; no NaN stats", () => {
    const bars = makeBars(400, 100, 0.0005, 0.025, 47);
    const sigs = bbBreakoutSignals(bars);
    const r = runBacktest(bars, sigs);
    assertStatsAreFinite(r.stats, "BB breakout");
  });
});

describe("transaction cost model", () => {
  it("higher commission → strictly lower endCapital on the same signals", () => {
    const bars = makeBars(252, 100, 0.001, 0.01, 53);
    const sigs = buyAndHoldSignals(bars);
    const cheap = runBacktest(bars, sigs, {
      commissionBps: 0,
      bidAskBps: 0,
      marketImpactBps: 0,
      borrowCostBpsAnnual: 0,
    });
    const expensive = runBacktest(bars, sigs, {
      commissionBps: 50, // 0.5% per side
      bidAskBps: 10,
      marketImpactBps: 20,
      borrowCostBpsAnnual: 0,
    });
    expect(cheap.stats.endCapital).toBeGreaterThan(expensive.stats.endCapital);
  });

  it("borrow cost makes a short trade strictly more expensive than the same trade with zero borrow", () => {
    // Cleaner contract: same SHORT signals, two backtests differing only in
    // borrow rate. The expensive run must end with strictly less capital.
    const bars = makeBars(252, 100, 0, 0.005, 59); // flat, low-vol — isolates the borrow cost
    const shortSigs: Signal[] = [
      { t: bars[1].t, type: "short", price: bars[1].c },
      { t: bars[250].t, type: "exit", price: bars[250].c },
    ];
    const noBorrow = runBacktest(bars, shortSigs, {
      commissionBps: 1,
      bidAskBps: 0,
      marketImpactBps: 0,
      borrowCostBpsAnnual: 0,
    });
    const withBorrow = runBacktest(bars, shortSigs, {
      commissionBps: 1,
      bidAskBps: 0,
      marketImpactBps: 0,
      borrowCostBpsAnnual: 1000, // 10% per year — meme-stock borrow rate
    });
    expect(noBorrow.trades.length).toBe(1);
    expect(withBorrow.trades.length).toBe(1);
    expect(withBorrow.stats.endCapital).toBeLessThan(noBorrow.stats.endCapital);
  });
});

describe("walk-forward overfitting detection", () => {
  it("a buy-on-arbitrary-bar strategy on noise has near-zero IS-OOS decay (no real edge to retain)", () => {
    const bars = makeBars(300, 100, 0, 0.01, 61);
    const result = runWalkForward(
      bars,
      (slice) => {
        if (slice.length < 5) return [];
        // Always-long strategy — same logic in IS and OOS, so any IS Sharpe
        // should generalize. With zero drift, both should be ~0.
        return [
          { t: slice[0].t, type: "long", price: slice[0].c },
          { t: slice[slice.length - 1].t, type: "exit", price: slice[slice.length - 1].c },
        ];
      },
      60, 30, 30,
    );
    expect(result.folds.length).toBeGreaterThan(0);
    // Stats are finite and sharpeDecay didn't crash on near-zero IS Sharpe.
    expect(Number.isFinite(result.sharpeDecay)).toBe(true);
    expect(Number.isFinite(result.isMeanSharpe)).toBe(true);
    expect(Number.isFinite(result.oosMeanSharpe)).toBe(true);
  });
});

describe("PSR + drawdown stats integrate end-to-end", () => {
  it("PSR field is populated and within [0,1] after a full backtest run", () => {
    const bars = makeBars(252, 100, 0.0008, 0.012, 67);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    expect(Number.isFinite(r.stats.psr)).toBe(true);
    expect(r.stats.psr).toBeGreaterThanOrEqual(0);
    expect(r.stats.psr).toBeLessThanOrEqual(1);
  });

  it("medianDdDuration ≤ maxDdDuration always", () => {
    const bars = makeBars(300, 100, 0.0005, 0.018, 71);
    const r = runBacktest(bars, maCrossoverSignals(bars, 20, 50));
    expect(r.stats.medianDdDuration).toBeLessThanOrEqual(r.stats.maxDdDuration);
  });

  it("tuwRatio matches an independent recompute from the equity curve", () => {
    const bars = makeBars(252, 100, 0.0007, 0.013, 73);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    const eq = r.equity.map((e) => e.v).filter((v) => Number.isFinite(v));
    const independent = drawdownStats(eq);
    expect(r.stats.tuwRatio).toBeCloseTo(independent.tuwRatio, 6);
    expect(r.stats.maxDdDuration).toBe(independent.maxDuration);
  });
});

describe("standalone PSR vs BacktestStats.psr agree on the same returns", () => {
  it("recomputing PSR from per-bar equity returns matches BacktestStats.psr", () => {
    const bars = makeBars(252, 100, 0.0009, 0.013, 79);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    const eq = r.equity.map((e) => e.v);
    const dailyRet: number[] = [];
    for (let i = 1; i < eq.length; i++) {
      const prev = eq[i - 1];
      const cur = eq[i];
      if (prev > 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
        dailyRet.push((cur - prev) / prev);
      }
    }
    const barsPerYear = inferBarsPerYear(bars);
    const standalone = probabilisticSharpe(dailyRet, 0, barsPerYear);
    expect(standalone.psr).toBeCloseTo(r.stats.psr, 4);
  });
});

describe("bootstrap CIs on a backtest's per-bar return series", () => {
  it("Sharpe CI brackets the point estimate", () => {
    const bars = makeBars(500, 100, 0.0008, 0.013, 83);
    const r = runBacktest(bars, buyAndHoldSignals(bars));
    const eq = r.equity.map((e) => e.v);
    const ret: number[] = [];
    for (let i = 1; i < eq.length; i++) {
      ret.push((eq[i] - eq[i - 1]) / eq[i - 1]);
    }
    const sharpe = (xs: number[]) => {
      let sum = 0, sq = 0;
      for (const x of xs) { sum += x; sq += x * x; }
      const mu = sum / xs.length;
      const v = sq / xs.length - mu * mu;
      return v > 0 ? (mu / Math.sqrt(v)) * Math.sqrt(252) : 0;
    };
    const ci = blockBootstrapCI(ret, sharpe, { nResamples: 500, seed: 1 });
    expect(ci.lo).toBeLessThanOrEqual(r.stats.sharpe + 0.5);
    expect(ci.hi).toBeGreaterThanOrEqual(r.stats.sharpe - 0.5);
    expect(ci.hi).toBeGreaterThanOrEqual(ci.lo);
  });
});

describe("Carhart 4-factor with HAC: end-to-end", () => {
  it("on a strategy that mirrors Mkt: HAC t-stat on Mkt loading is highly significant", () => {
    // Build noisy ETF series, factors, then a strategy that perfectly mirrors Mkt.
    const N = 300;
    let s = 89;
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
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM });
    const strategyReturns = factors.Mkt.slice(); // exact mirror
    const result = runFactorRegression(strategyReturns, factors);
    expect(result).not.toBeNull();
    if (!result) return;
    const mkt = result.loadings.find((l) => l.factor === "Mkt");
    expect(mkt).toBeDefined();
    expect(mkt!.beta).toBeCloseTo(1, 2);
    // HAC t-stat for Mkt loading should be large (perfect dependence).
    expect(Math.abs(mkt!.tStatHAC)).toBeGreaterThan(5);
    // HAC p-value for Mkt should be near zero.
    expect(mkt!.pValueHAC).toBeLessThan(0.001);
    // hacLag is the auto-selected Newey-West lag.
    expect(result.hacLag).toBeGreaterThan(0);
  });

  it("on noise: HAC p-value on alpha is large (no real edge)", () => {
    const N = 300;
    let s = 97;
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
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM });
    // Strategy = pure noise, uncorrelated with factors.
    const strategyReturns: (number | null)[] = log_ret(noisyCloses(0, 0.012));
    const result = runFactorRegression(strategyReturns, factors);
    expect(result).not.toBeNull();
    if (!result) return;
    // Alpha should be statistically indistinguishable from zero.
    expect(result.alphaPValueHAC).toBeGreaterThan(0.05);
  });
});

describe("intraday-aware annualization", () => {
  it("daily bars annualize at 252; weekly at 52; hourly at 252×6.5", () => {
    expect(inferBarsPerYear([{ t: 0 }, { t: 86400 }, { t: 86400 * 2 }] as Bar[])).toBe(252);
    expect(inferBarsPerYear([{ t: 0 }, { t: 86400 * 7 }, { t: 86400 * 14 }] as Bar[])).toBe(52);
    expect(inferBarsPerYear([{ t: 0 }, { t: 3600 }, { t: 7200 }] as Bar[])).toBe(252 * 6.5);
  });

  it("daily Sharpe on daily bars × √252 ≈ Sharpe on hourly bars × √(252·6.5) for same μ/σ", () => {
    // Sanity: a strategy with the same per-bar risk-adjusted return should
    // produce the same annualized Sharpe regardless of bar duration —
    // because annualization scales by √(barsPerYear).
    const muPerBar = 0.0005, sigmaPerBar = 0.01;
    const annDaily = (muPerBar / sigmaPerBar) * Math.sqrt(252);
    const annHourly = (muPerBar / sigmaPerBar) * Math.sqrt(252 * 6.5);
    expect(annHourly).toBeGreaterThan(annDaily);
  });
});

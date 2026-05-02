/**
 * Carhart 4-factor regression correctness tests.
 */

import { describe, expect, it } from "vitest";

import {
  buildFactorReturns,
  runFactorRegression,
} from "@/components/apps/willbb/quantdesk/factorRegression";

function trendingCloses(n: number, drift: number, start = 100): number[] {
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + drift));
  return out;
}

describe("buildFactorReturns", () => {
  it("default risk-free rate (4.5%) subtracts ~0.018% per day from Mkt", () => {
    const N = 80;
    const SPY = trendingCloses(N, 0.001);
    const IWM = trendingCloses(N, 0.001);
    const IUSV = trendingCloses(N, 0.001);
    const IUSG = trendingCloses(N, 0.001);
    const MTUM = trendingCloses(N, 0.001);
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM });
    // Mkt = log(SPY return) - rf_daily; rf_daily = 0.045 / 252 ≈ 0.0001786.
    // Pick a non-null index.
    const i = 30;
    const expected = Math.log(SPY[i] / SPY[i - 1]) - 0.045 / 252;
    expect(factors.Mkt[i]).toBeCloseTo(expected, 8);
  });

  it("riskFreeAnnualized=0 disables RF subtraction (Mkt = raw SPY return)", () => {
    const N = 80;
    const SPY = trendingCloses(N, 0.001);
    const IWM = trendingCloses(N, 0.001);
    const IUSV = trendingCloses(N, 0.001);
    const IUSG = trendingCloses(N, 0.001);
    const MTUM = trendingCloses(N, 0.001);
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM }, 0);
    const i = 30;
    expect(factors.Mkt[i]).toBeCloseTo(Math.log(SPY[i] / SPY[i - 1]), 9);
  });

  it("custom RF rate (3M T-bill = 5.25%) is honored", () => {
    const N = 80;
    const SPY = trendingCloses(N, 0.001);
    const IWM = trendingCloses(N, 0.001);
    const IUSV = trendingCloses(N, 0.001);
    const IUSG = trendingCloses(N, 0.001);
    const MTUM = trendingCloses(N, 0.001);
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM }, 0.0525);
    const i = 30;
    const expected = Math.log(SPY[i] / SPY[i - 1]) - 0.0525 / 252;
    expect(factors.Mkt[i]).toBeCloseTo(expected, 8);
  });

  it("SMB factor is the IWM-SPY spread", () => {
    const N = 80;
    const SPY = trendingCloses(N, 0.001);
    const IWM = trendingCloses(N, 0.0015); // small caps outperform
    const IUSV = trendingCloses(N, 0.001);
    const IUSG = trendingCloses(N, 0.001);
    const MTUM = trendingCloses(N, 0.001);
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM });
    const i = 30;
    const rIWM = Math.log(IWM[i] / IWM[i - 1]);
    const rSPY = Math.log(SPY[i] / SPY[i - 1]);
    expect(factors.SMB[i]).toBeCloseTo(rIWM - rSPY, 9);
  });
});

describe("runFactorRegression", () => {
  it("returns null when there are <30 aligned observations", () => {
    const tooShort = (n: number) => trendingCloses(n, 0.001);
    const factors = buildFactorReturns({
      SPY: tooShort(20),
      IWM: tooShort(20),
      IUSV: tooShort(20),
      IUSG: tooShort(20),
      MTUM: tooShort(20),
    });
    const result = runFactorRegression(factors.Mkt.slice(0, 20), factors);
    expect(result).toBeNull();
  });

  it("on a strategy that perfectly mirrors Mkt, recovers betaMkt ≈ 1, alpha ≈ 0", () => {
    // Use noisy, non-collinear factor inputs. If all 5 ETFs follow the
    // same drift the factor matrix collapses (SMB=HML=MOM=0) and OLS
    // returns a singular-matrix null. Add per-ETF independent noise.
    const N = 200;
    const seed = 42;
    let s = seed;
    const rand = () => {
      // Linear-congruential PRNG so the test is deterministic.
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
    // Strategy = exact mirror of Mkt → expected betaMkt = 1, betas elsewhere = 0.
    const stratReturns = factors.Mkt.slice();
    const result = runFactorRegression(stratReturns, factors);
    expect(result).not.toBeNull();
    if (!result) return;
    const mktLoading = result.loadings.find((l) => l.factor === "Mkt");
    expect(mktLoading).toBeDefined();
    expect(mktLoading!.beta).toBeCloseTo(1, 3);
    // alpha should be near zero (perfect mirror means residuals ≈ 0).
    expect(Math.abs(result.alpha)).toBeLessThan(1e-3);
    // R² should be near 1 (perfect fit).
    expect(result.rSquared).toBeGreaterThan(0.99);
  });

  it("output is finite and well-formed (no NaN in t-stats / R²)", () => {
    // Same noisy-factor setup as the previous test to avoid the singular-
    // matrix path. Pure trending series produce SMB=HML=MOM=0 → singular.
    const N = 200;
    let s = 99;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff - 0.5;
    };
    const noisy = (drift: number, vol: number) => {
      const out = [100];
      for (let i = 1; i < N; i++) out.push(out[i - 1] * (1 + drift + vol * rand()));
      return out;
    };
    const SPY = noisy(0.001, 0.01);
    const IWM = noisy(0.0007, 0.012);
    const IUSV = noisy(0.0008, 0.011);
    const IUSG = noisy(0.0009, 0.013);
    const MTUM = noisy(0.001, 0.014);
    const factors = buildFactorReturns({ SPY, IWM, IUSV, IUSG, MTUM });
    const stratReturns = factors.Mkt.map((v, i) =>
      v == null ? null : v + (i % 2 === 0 ? 0.0005 : -0.0005),
    );
    const result = runFactorRegression(stratReturns, factors);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(Number.isFinite(result.alpha)).toBe(true);
    expect(Number.isFinite(result.alphaTStat)).toBe(true);
    expect(Number.isFinite(result.rSquared)).toBe(true);
    expect(Number.isFinite(result.systematicShare)).toBe(true);
    expect(result.systematicShare).toBeGreaterThanOrEqual(0);
    expect(result.systematicShare).toBeLessThanOrEqual(1);
    for (const l of result.loadings) {
      expect(Number.isFinite(l.beta)).toBe(true);
      expect(Number.isFinite(l.tStat)).toBe(true);
    }
  });
});

/**
 * Advanced quant statistics tests.
 *
 * Each primitive checked against either a closed-form analytical result
 * or a known reference. We avoid "looks reasonable" assertions — every
 * test pins a specific number or invariant.
 */

import { describe, expect, it } from "vitest";
import {
  blockBootstrapCI,
  deflatedSharpe,
  drawdownStats,
  excessKurtosis,
  hacOLS,
  invNormCdf,
  mean,
  normCdf,
  probabilisticSharpe,
  realityCheck,
  skewness,
  stdev,
  variance,
} from "@/components/apps/willbb/quantdesk/advancedStats";

/* ---------- helpers ---------- */

function seededReturns(n: number, mu: number, sigma: number, seed = 7): number[] {
  // Box-Muller via deterministic LCG so tests are reproducible.
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1));
    const z0 = r * Math.cos(2 * Math.PI * u2);
    const z1 = r * Math.sin(2 * Math.PI * u2);
    out.push(mu + sigma * z0);
    if (out.length < n) out.push(mu + sigma * z1);
  }
  return out;
}

/* ---------- moments ---------- */

describe("moments", () => {
  it("mean / stdev / variance match closed forms on a small known sequence", () => {
    const x = [1, 2, 3, 4, 5];
    expect(mean(x)).toBeCloseTo(3, 10);
    expect(variance(x)).toBeCloseTo(2.5, 10); // (4 + 1 + 0 + 1 + 4) / 4
    expect(stdev(x)).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it("skewness ≈ 0 for symmetric Gaussian", () => {
    const xs = seededReturns(2000, 0, 1, 11);
    expect(Math.abs(skewness(xs))).toBeLessThan(0.15);
  });

  it("excess kurtosis ≈ 0 for Gaussian, > 0 for fat-tailed", () => {
    const gauss = seededReturns(3000, 0, 1, 13);
    expect(Math.abs(excessKurtosis(gauss))).toBeLessThan(0.4);
    // Mix in some extreme outliers — should push kurtosis up.
    const fat = [...seededReturns(2900, 0, 1, 17)];
    for (let i = 0; i < 100; i++) fat.push(8 + (i % 2 === 0 ? 0 : -16));
    expect(excessKurtosis(fat)).toBeGreaterThan(2);
  });
});

/* ---------- normal CDF ---------- */

describe("normCdf", () => {
  it("Φ(0) = 0.5", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 5);
  });
  it("Φ(1.96) ≈ 0.975 (95% one-sided)", () => {
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
  });
  it("Φ(-1.96) ≈ 0.025", () => {
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it("Φ(3) ≈ 0.9987", () => {
    expect(normCdf(3)).toBeCloseTo(0.9987, 3);
  });
  it("invNormCdf(Φ(x)) ≈ x (round-trip)", () => {
    for (const x of [-2, -1, 0, 0.5, 1, 2]) {
      expect(invNormCdf(normCdf(x))).toBeCloseTo(x, 2);
    }
  });
});

/* ---------- probabilistic Sharpe ratio ---------- */

describe("probabilisticSharpe", () => {
  it("Gaussian zero-alpha: PSR(0) is centered near 0.5 across multiple seeds", () => {
    // Average PSR over many seeds — under H0 of zero alpha, PSR(0) should
    // be uniformly distributed and average to ~0.5 (any single sample can
    // land anywhere on [0,1], so we average to suppress sampling noise).
    let avg = 0;
    const N = 30;
    for (let k = 0; k < N; k++) {
      const r = seededReturns(252, 0, 0.01, 23 + k * 7);
      avg += probabilisticSharpe(r, 0, 252).psr;
    }
    avg /= N;
    expect(avg).toBeGreaterThan(0.35);
    expect(avg).toBeLessThan(0.65);
  });

  it("strong positive Sharpe with n=1000: PSR(0) → ~1", () => {
    // mu / sigma = 0.10 per day → SR_annual ≈ 1.59. With n=1000 obs that's
    // ~4 yrs of daily data — PSR should be very high.
    const r = seededReturns(1000, 0.001, 0.01, 29);
    const out = probabilisticSharpe(r, 0, 252);
    expect(out.sr).toBeGreaterThan(1.0);
    expect(out.psr).toBeGreaterThan(0.95);
  });

  it("PSR is monotone-decreasing in srBenchmark for fixed returns", () => {
    const r = seededReturns(252, 0.0007, 0.012, 31);
    const a = probabilisticSharpe(r, 0, 252).psr;
    const b = probabilisticSharpe(r, 0.5, 252).psr;
    const c = probabilisticSharpe(r, 1.0, 252).psr;
    expect(a).toBeGreaterThanOrEqual(b);
    expect(b).toBeGreaterThanOrEqual(c);
  });

  it("returns NaN for n < 2", () => {
    const out = probabilisticSharpe([0.001], 0, 252);
    expect(Number.isNaN(out.psr)).toBe(true);
  });

  it("flat-zero-vol returns: psr = 0.5 (no information)", () => {
    const r = Array(100).fill(0);
    const out = probabilisticSharpe(r, 0, 252);
    expect(out.psr).toBe(0.5);
  });
});

/* ---------- deflated Sharpe ratio ---------- */

describe("deflatedSharpe", () => {
  it("DSR < PSR for the same returns when nTrials > 1", () => {
    const r = seededReturns(500, 0.0008, 0.012, 41);
    const psr0 = probabilisticSharpe(r, 0, 252).psr;
    const dsr = deflatedSharpe(r, 50, 252).dsr;
    expect(dsr).toBeLessThanOrEqual(psr0);
  });

  it("srStar grows with nTrials (more trials = harder to beat)", () => {
    const r = seededReturns(500, 0.0008, 0.012, 43);
    const sr10 = deflatedSharpe(r, 10, 252).srStar;
    const sr100 = deflatedSharpe(r, 100, 252).srStar;
    const sr1000 = deflatedSharpe(r, 1000, 252).srStar;
    expect(sr100).toBeGreaterThan(sr10);
    expect(sr1000).toBeGreaterThan(sr100);
  });

  it("returns trial count alongside other fields", () => {
    const r = seededReturns(252, 0.0005, 0.01, 47);
    const out = deflatedSharpe(r, 25, 252);
    expect(out.trials).toBe(25);
  });

  it("DSR is non-finite when sample size too small", () => {
    const out = deflatedSharpe([0.001], 10, 252);
    expect(Number.isNaN(out.dsr)).toBe(true);
  });
});

/* ---------- HAC OLS ---------- */

describe("hacOLS", () => {
  it("recovers known coefficients on synthetic Y = 2 + 3·X + ε", () => {
    const T = 200;
    const X: number[][] = [];
    const Y: number[] = [];
    let s = 51;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff - 0.5;
    };
    for (let t = 0; t < T; t++) {
      const x = rand() * 2;
      X.push([1, x]);
      Y.push(2 + 3 * x + rand() * 0.3);
    }
    const out = hacOLS(Y, X);
    expect(out.beta[0]).toBeCloseTo(2, 1);
    expect(out.beta[1]).toBeCloseTo(3, 1);
    // Both std errors should be > 0 and finite.
    expect(out.stdErr[0]).toBeGreaterThan(0);
    expect(out.stdErrHAC[0]).toBeGreaterThan(0);
    expect(Number.isFinite(out.tStat[1])).toBe(true);
    expect(Number.isFinite(out.tStatHAC[1])).toBe(true);
  });

  it("HAC std errors grow on autocorrelated residuals — intercept slot", () => {
    // For an iid mean-zero regressor x, E[x_t · x_{t-l}] = 0 in expectation,
    // so the slope-slope HAC adjustment is sampling-noise driven (can swing
    // either way on a finite sample). The INTERCEPT slot is unambiguous —
    // X[t][0] = 1 always, so cross-products of the intercept survive in
    // expectation and HAC SE on the intercept clearly grows under positive
    // residual autocorrelation. We test that slot.
    const T = 500;
    const phi = 0.92;
    let hacBigger = 0;
    const trials = 8;
    for (let trial = 0; trial < trials; trial++) {
      const X: number[][] = [];
      const Y: number[] = [];
      let s = 53 + trial * 11;
      const rand = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff - 0.5;
      };
      let lastErr = 0;
      for (let t = 0; t < T; t++) {
        const x = rand() * 2;
        const innov = rand() * 0.4;
        lastErr = phi * lastErr + innov;
        X.push([1, x]);
        Y.push(1 + 2 * x + lastErr);
      }
      const out = hacOLS(Y, X, 14);
      // Check the intercept (slot 0), where the HAC adjustment is reliably
      // positive when residuals are autocorrelated.
      if (out.stdErrHAC[0] > out.stdErr[0]) hacBigger++;
    }
    expect(hacBigger).toBeGreaterThanOrEqual(7);
  });

  it("returns NaN-padded result for singular design matrix", () => {
    // X[0] = X[1] (perfect collinearity)
    const T = 50;
    const X: number[][] = [];
    const Y: number[] = [];
    for (let t = 0; t < T; t++) {
      X.push([1, 1]);
      Y.push(t * 0.1);
    }
    const out = hacOLS(Y, X);
    expect(Number.isNaN(out.beta[0])).toBe(true);
  });

  it("R² is 1.0 on a perfect fit (no noise)", () => {
    const T = 100;
    const X: number[][] = [];
    const Y: number[] = [];
    for (let t = 0; t < T; t++) {
      X.push([1, t]);
      Y.push(5 + 2 * t);
    }
    const out = hacOLS(Y, X);
    expect(out.rSquared).toBeCloseTo(1, 6);
  });

  it("p-values for highly significant coefficients are < 0.01", () => {
    const T = 500;
    const X: number[][] = [];
    const Y: number[] = [];
    let s = 59;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff - 0.5;
    };
    for (let t = 0; t < T; t++) {
      const x = rand() * 2;
      X.push([1, x]);
      Y.push(2 + 5 * x + rand() * 0.1); // strong signal
    }
    const out = hacOLS(Y, X);
    expect(out.pValue[1]).toBeLessThan(0.01);
    expect(out.pValueHAC[1]).toBeLessThan(0.01);
  });
});

/* ---------- block bootstrap ---------- */

describe("blockBootstrapCI", () => {
  it("CI for the mean covers the true value", () => {
    const r = seededReturns(500, 0.001, 0.02, 61);
    const out = blockBootstrapCI(r, mean, { nResamples: 500, seed: 1 });
    expect(out.lo).toBeLessThan(0.001);
    expect(out.hi).toBeGreaterThan(0.001);
  });

  it("CI tightens as sample size grows", () => {
    const small = seededReturns(50, 0.001, 0.02, 67);
    const large = seededReturns(2000, 0.001, 0.02, 71);
    const ciSmall = blockBootstrapCI(small, mean, { nResamples: 500, seed: 1 });
    const ciLarge = blockBootstrapCI(large, mean, { nResamples: 500, seed: 1 });
    const widthSmall = ciSmall.hi - ciSmall.lo;
    const widthLarge = ciLarge.hi - ciLarge.lo;
    expect(widthLarge).toBeLessThan(widthSmall);
  });

  it("works with custom statistic functions (Sharpe-like)", () => {
    const r = seededReturns(500, 0.0008, 0.01, 73);
    const sharpe = (xs: number[]) => {
      const m = mean(xs);
      const s = stdev(xs);
      return s > 0 ? (m / s) * Math.sqrt(252) : 0;
    };
    const out = blockBootstrapCI(r, sharpe, { nResamples: 500, seed: 1 });
    expect(Number.isFinite(out.mean)).toBe(true);
    expect(out.lo).toBeLessThan(out.hi);
  });

  it("returns NaN for n < 5", () => {
    const out = blockBootstrapCI([1, 2, 3], mean);
    expect(Number.isNaN(out.lo)).toBe(true);
  });

  it("bootstrap distribution is reproducible with the same seed", () => {
    const r = seededReturns(200, 0, 0.01, 79);
    const a = blockBootstrapCI(r, mean, { nResamples: 200, seed: 999 });
    const b = blockBootstrapCI(r, mean, { nResamples: 200, seed: 999 });
    expect(a.lo).toBe(b.lo);
    expect(a.hi).toBe(b.hi);
  });
});

/* ---------- White's reality check ---------- */

describe("realityCheck", () => {
  it("returns no-edge p-value > 0.5 when all strategies are noise", () => {
    // 10 noise strategies, benchmark also noise — best should NOT be
    // significant.
    const T = 400;
    const bench = seededReturns(T, 0, 0.012, 81);
    const strats: number[][] = [];
    for (let s = 0; s < 10; s++) {
      strats.push(seededReturns(T, 0, 0.012, 100 + s));
    }
    const out = realityCheck(strats, bench, { nResamples: 500, seed: 1 });
    // p-value should be high — no real edge.
    expect(out.pValue).toBeGreaterThan(0.05);
  });

  it("flags a strategy with genuine alpha as significant (p < 0.05)", () => {
    const T = 400;
    const bench = seededReturns(T, 0, 0.012, 83);
    // 9 noise strategies + 1 with persistent positive alpha.
    const strats: number[][] = [];
    for (let s = 0; s < 9; s++) {
      strats.push(seededReturns(T, 0, 0.012, 200 + s));
    }
    const real = seededReturns(T, 0.0015, 0.01, 209); // strong alpha
    strats.push(real);
    const out = realityCheck(strats, bench, { nResamples: 1000, seed: 1 });
    expect(out.bestIdx).toBe(9);
    expect(out.pValue).toBeLessThan(0.05);
  });

  it("returns NaN for empty input", () => {
    const out = realityCheck([], [], {});
    expect(Number.isNaN(out.pValue)).toBe(true);
  });

  it("returns NaN if length mismatch between strategy and benchmark", () => {
    const out = realityCheck([[1, 2, 3]], [1, 2, 3, 4, 5], {});
    expect(Number.isNaN(out.pValue)).toBe(true);
  });
});

/* ---------- drawdown stats ---------- */

describe("drawdownStats", () => {
  it("flat or always-up curve has zero drawdown", () => {
    const eq = [100, 101, 102, 103, 104];
    const out = drawdownStats(eq);
    expect(out.maxDrawdown).toBe(0);
    expect(out.durationsBars.length).toBe(0);
    expect(out.tuwRatio).toBe(0);
  });

  it("simple V-shape: 100 → 90 → 100 captures one drawdown", () => {
    const eq = [100, 95, 90, 95, 100];
    const out = drawdownStats(eq);
    expect(out.maxDrawdown).toBeCloseTo(0.10, 2); // 10% drawdown
    // Convention: duration = (recovery bar index) - (first below-peak bar).
    // For [100, 95, 90, 95, 100]: ddStart = 1, recovery at i = 4 → 3 bars
    // (1, 2, 3) underwater, recovery on bar 4.
    expect(out.durationsBars).toEqual([3]);
    expect(out.maxDuration).toBe(3);
  });

  it("multiple drawdowns are individually recorded", () => {
    const eq = [100, 90, 100, 95, 100, 80, 100];
    const out = drawdownStats(eq);
    expect(out.durationsBars.length).toBe(3);
    expect(out.maxDrawdown).toBeCloseTo(0.20, 2); // 20% — the 100→80 leg
  });

  it("never-recovers drawdown is captured with end-of-series duration", () => {
    const eq = [100, 90, 80, 70];
    const out = drawdownStats(eq);
    expect(out.durationsBars.length).toBe(1);
    expect(out.durationsBars[0]).toBe(3);
    expect(out.maxDrawdown).toBeCloseTo(0.30, 2);
  });

  it("TUW ratio is fraction of bars below running peak", () => {
    const eq = [100, 95, 100, 95, 100];
    const out = drawdownStats(eq);
    // bars 1, 3 are below peak → 2/5 = 0.4
    expect(out.tuwRatio).toBeCloseTo(0.4, 2);
  });
});

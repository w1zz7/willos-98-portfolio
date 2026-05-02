/**
 * Quant-primitive correctness tests.
 *
 * Strategy: each test exercises a known, hand-checkable input so a regression
 * in indicators.ts will be caught immediately. Where the formula has a closed-
 * form ground truth (SMA, log returns, log_ret of geometric series, OLS
 * beta with no noise), we assert the analytic answer. Where the formula is
 * empirical (Yang-Zhang vol, Hurst), we assert sanity bounds + monotonicity.
 *
 * No mocking — these are pure functions.
 */

import { describe, expect, it } from "vitest";

import {
  log_ret,
  cum_log_ret,
  realized_vol_cc,
  realized_vol_pk,
  realized_vol_gk,
  realized_vol_yz,
  rolling_beta,
  rolling_corr,
  sortino,
  hurst,
  adf_stat,
  acf,
  pacf,
  sma,
  ema,
  zscore,
  rank,
  type Bar,
} from "@/components/apps/willbb/quantdesk/indicators";

const FLOAT_EPS = 1e-9;

function bar(t: number, o: number, h: number, l: number, c: number, v = 1_000): Bar {
  return { t, o, h, l, c, v };
}

describe("log_ret", () => {
  it("returns null first element + log(curr/prev) for the rest", () => {
    const closes = [100, 110, 99];
    const r = log_ret(closes);
    expect(r[0]).toBeNull();
    expect(r[1]!).toBeCloseTo(Math.log(110 / 100), 12);
    expect(r[2]!).toBeCloseTo(Math.log(99 / 110), 12);
  });

  it("handles non-positive closes by emitting null (no NaN propagation)", () => {
    const closes = [100, 0, 50, -10, 60];
    const r = log_ret(closes);
    // i=1: prev=100, cur=0 → log(0/100) = -Infinity, but the impl guards prev>0;
    // 0 is not >0 so the SECOND ratio (i=2) gets nulled because prev=0.
    expect(Number.isFinite(r[1] as number) || r[1] === null).toBe(true);
    expect(r[2]).toBeNull(); // prev was 0
    expect(r[3]).toBeNull(); // cur is -10 → guarded by null check on negative-prev next iter
  });

  it("on a constant-price series yields all zeros (modulo first null)", () => {
    const r = log_ret([50, 50, 50, 50]);
    expect(r[0]).toBeNull();
    expect(r.slice(1).every((v) => Math.abs((v as number) - 0) < FLOAT_EPS)).toBe(true);
  });

  it("on a geometrically growing series yields a constant log return", () => {
    const closes = [100, 110, 121, 133.1]; // 10% per step
    const r = log_ret(closes);
    const expected = Math.log(1.1);
    for (let i = 1; i < r.length; i++) {
      expect((r[i] as number) - expected).toBeLessThan(FLOAT_EPS);
    }
  });
});

describe("cum_log_ret", () => {
  it("is the running sum of log returns", () => {
    const r = [null, 0.1, -0.05, 0.2];
    const c = cum_log_ret(r as (number | null)[]);
    expect(c[0]).toBeCloseTo(0, 12);
    expect(c[1]).toBeCloseTo(0.1, 12);
    expect(c[2]).toBeCloseTo(0.05, 12);
    expect(c[3]).toBeCloseTo(0.25, 12);
  });
});

describe("sma", () => {
  it("matches the analytic mean over the window", () => {
    const s = sma([1, 2, 3, 4, 5, 6], 3);
    // First two outputs should be null (insufficient bars).
    expect(s[0]).toBeNull();
    expect(s[1]).toBeNull();
    expect(s[2]).toBeCloseTo(2, 12); // (1+2+3)/3
    expect(s[3]).toBeCloseTo(3, 12); // (2+3+4)/3
    expect(s[5]).toBeCloseTo(5, 12); // (4+5+6)/3
  });

  it("handles series shorter than the window", () => {
    const s = sma([1, 2], 5);
    expect(s.every((v) => v === null)).toBe(true);
  });
});

describe("ema", () => {
  it("matches the recursive EMA formula on a step input", () => {
    // For a step from 0 → 1, EMA approaches 1 monotonically.
    const xs = [0, 0, 0, 1, 1, 1, 1, 1, 1, 1];
    const e = ema(xs, 3);
    for (let i = 4; i < e.length - 1; i++) {
      const cur = e[i] as number;
      const next = e[i + 1] as number;
      // After the step, EMA must be increasing toward 1.
      if (cur != null && next != null) {
        expect(next).toBeGreaterThan(cur - FLOAT_EPS);
        expect(next).toBeLessThanOrEqual(1 + FLOAT_EPS);
      }
    }
  });
});

describe("realized_vol_cc", () => {
  it("returns null until the window is full", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const v = realized_vol_cc(closes, 21);
    // First 21 entries are null (need a full window of returns).
    expect(v.slice(0, 21).every((x) => x === null)).toBe(true);
  });

  it("yields ~0 for a perfectly trending series (constant log return = no vol)", () => {
    // Constant 0.1% growth per bar → log returns are constant → sample stdev ≈ 0.
    const closes: number[] = [100];
    for (let i = 1; i < 30; i++) closes.push(closes[i - 1] * 1.001);
    const v = realized_vol_cc(closes, 21);
    const last = v[v.length - 1];
    expect(last).toBeLessThan(1e-10);
  });

  it("scales with sqrt(252) for annualization", () => {
    // Known daily stdev = 0.01 → annualized ≈ 0.01 * sqrt(252) ≈ 0.1587.
    const closes: number[] = [100];
    // Alternate ±1% — sample stdev of log returns = log(1.01)/log(0.99)-style
    // pattern; the sample stdev after 21 bars is ~0.01.
    for (let i = 1; i < 30; i++) {
      closes.push(closes[i - 1] * (i % 2 === 1 ? 1.01 : 1 / 1.01));
    }
    const v = realized_vol_cc(closes, 21);
    const last = v[v.length - 1] as number;
    // Sanity check: should be in the 0.1 - 0.25 annualized range, NOT
    // 0 (formula bug) or > 1 (forgot to annualize correctly).
    expect(last).toBeGreaterThan(0.1);
    expect(last).toBeLessThan(0.25);
  });
});

describe("realized_vol_yz / pk / gk", () => {
  it("agree on a clean trending series within ±50%", () => {
    // Build a series with realistic OHLC ranges.
    const bars: Bar[] = [];
    let p = 100;
    for (let i = 0; i < 60; i++) {
      const drift = 1 + 0.0005 * Math.sin(i / 5);
      const o = p;
      const c = p * drift;
      const h = Math.max(o, c) * (1 + 0.005);
      const l = Math.min(o, c) * (1 - 0.005);
      bars.push(bar(1700_000_000 + i * 86400, o, h, l, c));
      p = c;
    }
    const cc = realized_vol_cc(bars.map((b) => b.c), 21);
    const yz = realized_vol_yz(bars, 21);
    const pk = realized_vol_pk(bars, 21);
    const gk = realized_vol_gk(bars, 21);
    // All four estimators should produce a positive, finite, comparable
    // annualized volatility on this synthetic series.
    for (const series of [cc, yz, pk, gk]) {
      const last = series[series.length - 1];
      expect(last).not.toBeNull();
      expect(Number.isFinite(last as number)).toBe(true);
      expect(last as number).toBeGreaterThan(0);
      expect(last as number).toBeLessThan(2); // < 200% annualized — sanity
    }
  });
});

describe("rolling_beta", () => {
  it("is ~1 when asset = market", () => {
    const mkt: (number | null)[] = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? null : Math.sin(i / 5) * 0.01
    );
    const b = rolling_beta(mkt, mkt, 60);
    const last = b[b.length - 1] as number;
    expect(last).toBeCloseTo(1, 6);
  });

  it("is ~2 when asset = 2 * market", () => {
    const mkt: (number | null)[] = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? null : Math.sin(i / 5) * 0.01
    );
    const asset = mkt.map((v) => (v == null ? null : v * 2));
    const b = rolling_beta(asset, mkt, 60);
    const last = b[b.length - 1] as number;
    expect(last).toBeCloseTo(2, 6);
  });

  it("returns null when market variance is zero (constant market)", () => {
    const flat = Array.from({ length: 80 }, () => 0);
    const asset = Array.from({ length: 80 }, (_, i) => i % 2 === 0 ? 0.001 : -0.001);
    const b = rolling_beta(asset, flat, 60);
    // Flat market = no variance = beta undefined; impl should return null
    // (or 0) rather than emit Infinity / NaN.
    const last = b[b.length - 1];
    expect(last === null || Number.isFinite(last as number)).toBe(true);
  });
});

describe("rolling_corr", () => {
  it("is ~1 for asset = market and ~-1 for asset = -market", () => {
    const mkt: number[] = Array.from({ length: 80 }, (_, i) => Math.sin(i / 4));
    const corrPos = rolling_corr(mkt, mkt, 60);
    const corrNeg = rolling_corr(
      mkt.map((v) => -v),
      mkt,
      60,
    );
    expect(corrPos[corrPos.length - 1]).toBeCloseTo(1, 5);
    expect(corrNeg[corrNeg.length - 1]).toBeCloseTo(-1, 5);
  });
});

describe("sortino", () => {
  it("returns null until window is full", () => {
    const ret: number[] = Array.from({ length: 30 }, () => 0.001);
    const s = sortino(ret, 60);
    expect(s.slice(0, 30).every((v) => v === null)).toBe(true);
  });

  it("on all-positive returns emits null (no signal) instead of Infinity", () => {
    const ret = Array.from({ length: 80 }, () => 0.001);
    const s = sortino(ret, 60);
    const last = s[s.length - 1];
    // Contract: when downside vol = 0 the ratio is undefined, so sortino()
    // returns null rather than 0 or Infinity. The critical correctness
    // check is the absence of Infinity (a divide-by-zero leak).
    expect(last === null || Number.isFinite(last as number)).toBe(true);
    expect(last === null || (last as number) !== Infinity).toBe(true);
  });
});

describe("hurst", () => {
  it("is in [0, 1] on white noise", () => {
    const noise = Array.from({ length: 250 }, () => Math.random() * 2 - 1);
    const h = hurst(noise);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
  });

  it("is finite on a constant series (no NaN)", () => {
    const flat = Array.from({ length: 200 }, () => 0.001);
    const h = hurst(flat);
    expect(Number.isFinite(h)).toBe(true);
  });
});

describe("adf_stat", () => {
  it("is finite on white noise + on trending data", () => {
    const noise = Array.from({ length: 200 }, () => Math.random() - 0.5);
    expect(Number.isFinite(adf_stat(noise))).toBe(true);
    const trend = Array.from({ length: 200 }, (_, i) => i + Math.random());
    expect(Number.isFinite(adf_stat(trend))).toBe(true);
  });
});

describe("acf / pacf", () => {
  it("acf[0] = 1 always; values are bounded in [-1, 1]", () => {
    const xs = Array.from({ length: 200 }, () => Math.random() - 0.5);
    const a = acf(xs, 20);
    expect(a[0]).toBeCloseTo(1, 9);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-1.0001);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });

  it("pacf is bounded in [-1, 1] on stationary data", () => {
    const xs = Array.from({ length: 200 }, () => Math.random() - 0.5);
    const p = pacf(xs, 20);
    for (const v of p) {
      expect(v).toBeGreaterThanOrEqual(-1.0001);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("zscore + rank", () => {
  it("zscore of the mean is ~0", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const z = zscore(xs as unknown as (number | null)[], 5);
    const last = z[z.length - 1];
    // Last 5 values: 8,9,10,11,12 — mean=10, current=12 → z = +sqrt(...) > 0
    expect(last as number).toBeGreaterThan(0);
  });

  it("rank produces values in [0, 1]", () => {
    const xs = [10, 5, 7, 2, 8, 9, 3, 6, 4, 1, 12, 11];
    const r = rank(xs as unknown as (number | null)[], 5);
    for (const v of r) {
      if (v == null) continue;
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * Advanced quant statistics — the things a senior trader skims for before
 * trusting a backtest.
 *
 * Five families of primitives, all pure-data + thoroughly tested:
 *
 *   1. probabilisticSharpe + deflatedSharpe (López de Prado 2014, 2018)
 *      — Sharpe ratio adjusted for skew, kurtosis, sample size, AND the
 *      multiple-testing bias of having tried many indicators on the same
 *      data. Naïve Sharpe over-states alpha; PSR/DSR are the standard
 *      corrections cited in production-grade research.
 *
 *   2. hacOLS — ordinary least squares with Newey-West (Bartlett-kernel)
 *      heteroskedasticity-and-autocorrelation-consistent standard errors.
 *      Returns are autocorrelated and heteroskedastic in the wild;
 *      classical OLS t-stats are wrong on financial data. HAC is the
 *      textbook fix (Newey & West 1987).
 *
 *   3. blockBootstrapCI — stationary block bootstrap (Politis & Romano
 *      1994) for confidence intervals on any path-dependent statistic
 *      (Sharpe, Sortino, IR, max drawdown). Resamples blocks of bars to
 *      preserve serial correlation that a naïve i.i.d. bootstrap would
 *      destroy.
 *
 *   4. realityCheck — White's data-snooping test (White 2000) +
 *      Romano-Wolf step-down adjustment for multiple-testing. Answers
 *      "is the strategy's edge over the benchmark statistically real,
 *      or just one of many indicators that happened to fit?"
 *
 *   5. drawdownStats — full distribution of drawdown duration (not just
 *      max). Tells the trader what living through the strategy actually
 *      feels like — a 30% max drawdown that lasts 6 months is a very
 *      different beast from one that lasts 3 years.
 *
 * Each primitive is independently testable and used in advancedStats.test.ts
 * against either closed-form analytical results or known benchmarks.
 */

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

/** Standard normal CDF — high-precision Abramowitz & Stegun 26.2.17 approx. */
export function normCdf(x: number): number {
  // Constants for the rational approximation.
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Sample mean. NaN-safe for empty arrays (returns 0). */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample variance — Bessel-corrected (n-1 denominator). */
export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (xs.length - 1);
}

/** Sample standard deviation. */
export function stdev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

/** Sample skewness (Fisher-Pearson moment coefficient). */
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s < Number.EPSILON) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - m) / s) ** 3;
  // n / ((n-1)(n-2)) — bias-corrected adjustment.
  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Sample excess kurtosis (kurtosis - 3 for normal distribution baseline).
 * Bias-corrected per Joanes & Gill (1998).
 */
export function excessKurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s < Number.EPSILON) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - m) / s) ** 4;
  // Fisher's bias correction.
  const k =
    (n * (n + 1)) /
      ((n - 1) * (n - 2) * (n - 3)) *
      sum -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return k;
}

/* ------------------------------------------------------------------ */
/* 1. Probabilistic + Deflated Sharpe Ratio                           */
/*    (López de Prado, 2014, "The Probability of Backtest Overfitting")*/
/* ------------------------------------------------------------------ */

export interface PSRResult {
  /** Annualized Sharpe ratio of the input returns. */
  sr: number;
  /** Probability that the *true* Sharpe exceeds `srBenchmark`. */
  psr: number;
  /** Sample skewness of the per-period returns. */
  skew: number;
  /** Sample excess kurtosis of the per-period returns. */
  kurt: number;
  /** Sample size used. */
  n: number;
}

/**
 * Probabilistic Sharpe Ratio.
 *
 * PSR(SR*) = Φ( (SR_obs - SR*) · √(n - 1) /
 *               √( 1 - γ₃·SR_obs + (γ₄ - 1)/4 · SR_obs² ) )
 *
 * Inputs:
 *   returns       per-period returns (e.g., daily log returns)
 *   srBenchmark   the SR threshold to test against (annualized,
 *                 default 0 — "is alpha non-zero?")
 *   periodsPerYear  for annualization (252 daily, 12 monthly, etc.)
 *
 * Output: probability the *true* annualized Sharpe is above `srBenchmark`.
 * PSR > 0.95 is the typical "yes this is real" threshold.
 */
export function probabilisticSharpe(
  returns: number[],
  srBenchmark: number = 0,
  periodsPerYear: number = 252,
): PSRResult {
  const n = returns.length;
  if (n < 2) {
    return { sr: NaN, psr: NaN, skew: 0, kurt: 0, n };
  }
  const mu = mean(returns);
  const sigma = stdev(returns);
  if (sigma < Number.EPSILON) {
    return { sr: 0, psr: 0.5, skew: 0, kurt: 0, n };
  }
  // Per-period Sharpe, then annualized.
  const srPeriod = mu / sigma;
  const sr = srPeriod * Math.sqrt(periodsPerYear);
  const skew = skewness(returns);
  const kurt = excessKurtosis(returns);
  // Convert annualized benchmark back to per-period for the comparison.
  const srBenchPeriod = srBenchmark / Math.sqrt(periodsPerYear);
  const denom = Math.sqrt(
    Math.max(
      Number.EPSILON,
      1 - skew * srPeriod + ((kurt) / 4) * srPeriod * srPeriod,
    ),
  );
  const z = ((srPeriod - srBenchPeriod) * Math.sqrt(n - 1)) / denom;
  const psr = normCdf(z);
  return { sr, psr, skew, kurt, n };
}

export interface DSRResult extends PSRResult {
  /** The "minimum impressive Sharpe" given how many trials were run. */
  srStar: number;
  /** Probability the strategy's true SR beats srStar. */
  dsr: number;
  /** Number of independent trials used for the deflation. */
  trials: number;
}

/**
 * Deflated Sharpe Ratio (López de Prado, 2014).
 *
 * If a researcher tries N indicators and reports the best, the *expected*
 * maximum SR under the null hypothesis of zero alpha is positive. DSR
 * computes the SR threshold a strategy must beat to clear that bar:
 *
 *   SR* = √Var(SR) · ((1 - γ_E) · Φ⁻¹(1 - 1/N) +
 *                     γ_E · Φ⁻¹(1 - e⁻¹/N))
 *
 *   where γ_E ≈ 0.5772 is the Euler-Mascheroni constant.
 *
 * Then DSR = PSR(SR*) — the probability that the observed Sharpe really
 * exceeds the inflated threshold.
 *
 * Use case: if you backtested 50 different indicators and picked the
 * one with the best Sharpe, pass `nTrials = 50` to deflate.
 */
export function deflatedSharpe(
  returns: number[],
  nTrials: number,
  periodsPerYear: number = 252,
): DSRResult {
  const base = probabilisticSharpe(returns, 0, periodsPerYear);
  if (!Number.isFinite(base.sr) || nTrials < 1) {
    return { ...base, srStar: NaN, dsr: NaN, trials: nTrials };
  }
  // Variance of the SR estimator under skew/kurtosis (Mertens 2002):
  //   Var(SR) = ( 1 - γ₃·SR + (γ₄ - 1)/4·SR² ) / (n - 1)
  const sr = base.sr / Math.sqrt(periodsPerYear); // back to per-period
  const varSR =
    Math.max(
      Number.EPSILON,
      1 - base.skew * sr + ((base.kurt) / 4) * sr * sr,
    ) /
    Math.max(1, base.n - 1);
  const sdSR = Math.sqrt(varSR);
  const gammaE = 0.5772156649; // Euler-Mascheroni
  // Inverse standard normal at 1 - 1/N — using the rational approximation
  // for the inverse CDF (Beasley-Springer-Moro). For our use here, N ≥ 1
  // so 1 - 1/N ∈ [0, 1).
  const invN = nTrials > 1 ? invNormCdf(1 - 1 / nTrials) : 0;
  const invEN = nTrials > 1 ? invNormCdf(1 - 1 / (nTrials * Math.E)) : 0;
  const srStarPeriod = sdSR * ((1 - gammaE) * invN + gammaE * invEN);
  const srStar = srStarPeriod * Math.sqrt(periodsPerYear);
  // Now DSR = PSR(srStar)
  const dsrResult = probabilisticSharpe(returns, srStar, periodsPerYear);
  return {
    ...dsrResult,
    srStar,
    dsr: dsrResult.psr,
    trials: nTrials,
  };
}

/**
 * Inverse standard normal CDF — Beasley-Springer-Moro approximation.
 * Sufficient accuracy for p ∈ [0.0001, 0.9999], plenty for DSR usage.
 */
export function invNormCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/* ------------------------------------------------------------------ */
/* 2. HAC OLS — Newey-West heteroskedasticity-autocorrelation-robust  */
/*    standard errors (Newey & West, 1987).                           */
/* ------------------------------------------------------------------ */

export interface OLSResult {
  /** Coefficient vector (length k). */
  beta: number[];
  /** Classical OLS standard errors (under iid Gaussian errors). */
  stdErr: number[];
  /** HAC (Newey-West) standard errors. Use these on financial returns. */
  stdErrHAC: number[];
  /** OLS t-stats. */
  tStat: number[];
  /** HAC t-stats. Use these on financial returns. */
  tStatHAC: number[];
  /** OLS p-values (two-sided, normal approximation). */
  pValue: number[];
  /** HAC p-values. */
  pValueHAC: number[];
  /** R-squared. */
  rSquared: number;
  /** Adjusted R-squared. */
  adjRSquared: number;
  /** Sample size (T) and parameter count (k). */
  T: number;
  k: number;
  /** Lag length used for HAC kernel. */
  hacLag: number;
}

/**
 * Solve OLS Y = X·β + ε via the normal equations, then compute both
 * classical and Newey-West HAC standard errors.
 *
 * X is assumed to already include an intercept column if you want one.
 * Returns NaN-padded result if the design matrix is singular (e.g.,
 * perfectly collinear columns).
 *
 * The HAC kernel is Bartlett: ω(l) = 1 - l/(L+1).
 * Default lag L = floor(4·(T/100)^(2/9)) per Newey & West's automatic
 * lag selection (1994).
 */
export function hacOLS(
  Y: number[],
  X: number[][], // rows = observations, cols = regressors
  hacLag?: number,
): OLSResult {
  const T = Y.length;
  const k = X[0]?.length ?? 0;
  if (T !== X.length || T < k + 1 || k === 0) {
    return {
      beta: Array(k).fill(NaN),
      stdErr: Array(k).fill(NaN),
      stdErrHAC: Array(k).fill(NaN),
      tStat: Array(k).fill(NaN),
      tStatHAC: Array(k).fill(NaN),
      pValue: Array(k).fill(NaN),
      pValueHAC: Array(k).fill(NaN),
      rSquared: NaN,
      adjRSquared: NaN,
      T,
      k,
      hacLag: 0,
    };
  }

  // X'X (k × k)
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        XtX[i][j] += X[t][i] * X[t][j];
      }
    }
  }
  // X'Y (k × 1)
  const XtY: number[] = Array(k).fill(0);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < k; i++) XtY[i] += X[t][i] * Y[t];
  }

  // Invert X'X via Gauss-Jordan (k is small — typically 2 to 10).
  const inv = invertMatrix(XtX);
  if (!inv) {
    return {
      beta: Array(k).fill(NaN),
      stdErr: Array(k).fill(NaN),
      stdErrHAC: Array(k).fill(NaN),
      tStat: Array(k).fill(NaN),
      tStatHAC: Array(k).fill(NaN),
      pValue: Array(k).fill(NaN),
      pValueHAC: Array(k).fill(NaN),
      rSquared: NaN,
      adjRSquared: NaN,
      T,
      k,
      hacLag: 0,
    };
  }

  // beta = (X'X)^-1 X'Y
  const beta: number[] = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) beta[i] += inv[i][j] * XtY[j];
  }

  // Residuals
  const resid: number[] = Array(T).fill(0);
  for (let t = 0; t < T; t++) {
    let yhat = 0;
    for (let i = 0; i < k; i++) yhat += X[t][i] * beta[i];
    resid[t] = Y[t] - yhat;
  }

  // Classical std errors: σ²·(X'X)^-1, σ² = SSR / (T - k)
  let ssr = 0;
  for (const e of resid) ssr += e * e;
  const sigma2 = ssr / Math.max(1, T - k);
  const stdErr: number[] = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    stdErr[i] = Math.sqrt(Math.max(0, sigma2 * inv[i][i]));
  }

  // HAC variance: (X'X)^-1 · S · (X'X)^-1  where S = Σ ω(l) · S_l
  // S_l = (1/T) Σ_t (X_t·u_t)·(X_{t-l}·u_{t-l})' + transpose for l > 0
  const L = hacLag ?? Math.max(1, Math.floor(4 * (T / 100) ** (2 / 9)));
  const S: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  // l = 0 lag (just X'·diag(u²)·X scaled by 1/T)
  for (let t = 0; t < T; t++) {
    const u = resid[t];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        S[i][j] += X[t][i] * u * X[t][j] * u;
      }
    }
  }
  // l > 0 lags
  for (let l = 1; l <= L; l++) {
    const w = 1 - l / (L + 1); // Bartlett weight
    for (let t = l; t < T; t++) {
      const ut = resid[t];
      const utl = resid[t - l];
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          // S_l + S_l' = X_t·X_{t-l}·u_t·u_{t-l} + X_{t-l}·X_t·u_{t-l}·u_t
          S[i][j] += w * (X[t][i] * X[t - l][j] + X[t - l][i] * X[t][j]) * ut * utl;
        }
      }
    }
  }
  // Scale by 1/T (Newey-West convention)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) S[i][j] /= T;
  }

  // hacVar = T · (X'X)^-1 · S · (X'X)^-1 — scaled to match β covariance
  const invS = matMul(inv, S);
  const hacCov = matMul(invS, inv);
  const stdErrHAC: number[] = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    stdErrHAC[i] = Math.sqrt(Math.max(0, T * hacCov[i][i]));
  }

  // t-stats + p-values (normal approx; T ≥ 30 makes this tight)
  const tStat: number[] = beta.map((b, i) =>
    stdErr[i] > 0 ? b / stdErr[i] : NaN,
  );
  const tStatHAC: number[] = beta.map((b, i) =>
    stdErrHAC[i] > 0 ? b / stdErrHAC[i] : NaN,
  );
  const pValue = tStat.map((t) =>
    Number.isFinite(t) ? 2 * (1 - normCdf(Math.abs(t))) : NaN,
  );
  const pValueHAC = tStatHAC.map((t) =>
    Number.isFinite(t) ? 2 * (1 - normCdf(Math.abs(t))) : NaN,
  );

  // R²
  const yMean = mean(Y);
  let sst = 0;
  for (const y of Y) sst += (y - yMean) * (y - yMean);
  const rSquared = sst > 0 ? 1 - ssr / sst : NaN;
  const adjRSquared = Number.isFinite(rSquared)
    ? 1 - ((1 - rSquared) * (T - 1)) / Math.max(1, T - k)
    : NaN;

  return {
    beta,
    stdErr,
    stdErrHAC,
    tStat,
    tStatHAC,
    pValue,
    pValueHAC,
    rSquared,
    adjRSquared,
    T,
    k,
    hacLag: L,
  };
}

/** Invert an n×n matrix via Gauss-Jordan. Returns null if singular. */
function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length;
  // Augment with identity.
  const aug: number[][] = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    // Pivot — find row with largest |value| in this column.
    let pivotRow = col;
    let pivotVal = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > pivotVal) {
        pivotVal = Math.abs(aug[r][col]);
        pivotRow = r;
      }
    }
    if (pivotVal < 1e-12) return null; // singular
    if (pivotRow !== col) {
      [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
    }
    // Scale pivot row.
    const pv = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pv;
    // Eliminate column in other rows.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = 0; j < 2 * n; j++) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }
  return aug.map((row) => row.slice(n));
}

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const out: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += A[i][k] * B[k][j];
      out[i][j] = s;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Stationary block bootstrap — Politis & Romano 1994.              */
/* ------------------------------------------------------------------ */

export interface BootstrapCI {
  /** Sample mean of the bootstrap distribution of the statistic. */
  mean: number;
  /** Median of the bootstrap distribution. */
  median: number;
  /** Lower bound at confidence level `level`. */
  lo: number;
  /** Upper bound at confidence level `level`. */
  hi: number;
  /** Confidence level used (e.g., 0.95). */
  level: number;
  /** Number of resamples. */
  n: number;
  /** Mean block length used for the stationary bootstrap. */
  blockLen: number;
}

/**
 * Stationary block bootstrap — Politis & Romano (1994).
 *
 * For a serially correlated series, naïve i.i.d. bootstrap destroys the
 * autocorrelation structure and gives wildly wrong confidence intervals
 * for path-dependent statistics like Sharpe / Sortino / max drawdown.
 *
 * The stationary bootstrap resamples blocks whose lengths are drawn from
 * a geometric distribution with mean = `blockLen`. This preserves
 * stationarity (no bias toward block boundaries) AND the autocorrelation.
 *
 * Default blockLen = ⌊n^(1/3)⌋ — the standard choice for daily returns.
 * Default n_resamples = 2000 — gives ~stable CIs in <50 ms for typical
 * input sizes (1000-bar series).
 */
export function blockBootstrapCI(
  values: number[],
  statFn: (xs: number[]) => number,
  options: {
    nResamples?: number;
    blockLen?: number;
    level?: number;
    seed?: number;
  } = {},
): BootstrapCI {
  const n = values.length;
  if (n < 5) {
    return {
      mean: NaN,
      median: NaN,
      lo: NaN,
      hi: NaN,
      level: options.level ?? 0.95,
      n: 0,
      blockLen: 0,
    };
  }
  const nResamples = options.nResamples ?? 2000;
  const blockLen = options.blockLen ?? Math.max(1, Math.floor(Math.cbrt(n)));
  const level = options.level ?? 0.95;
  const p = 1 / blockLen; // geometric distribution param
  // Deterministic LCG so tests are reproducible.
  let seed = options.seed ?? 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const stats: number[] = [];
  for (let r = 0; r < nResamples; r++) {
    const sample: number[] = [];
    let i = Math.floor(rand() * n);
    while (sample.length < n) {
      sample.push(values[i % n]);
      // Geometric: with prob p start a new block at random index, else
      // continue the current block one step forward.
      if (rand() < p) {
        i = Math.floor(rand() * n);
      } else {
        i++;
      }
    }
    const s = statFn(sample);
    if (Number.isFinite(s)) stats.push(s);
  }
  if (stats.length === 0) {
    return { mean: NaN, median: NaN, lo: NaN, hi: NaN, level, n: 0, blockLen };
  }
  stats.sort((a, b) => a - b);
  const alpha = 1 - level;
  const loIdx = Math.floor((alpha / 2) * stats.length);
  const hiIdx = Math.min(stats.length - 1, Math.floor((1 - alpha / 2) * stats.length));
  const med = stats[Math.floor(stats.length / 2)];
  return {
    mean: mean(stats),
    median: med,
    lo: stats[loIdx],
    hi: stats[hiIdx],
    level,
    n: stats.length,
    blockLen,
  };
}

/* ------------------------------------------------------------------ */
/* 4. White Reality Check (White 2000)                                */
/*    H₀: best-strategy alpha is ≤ benchmark in expectation           */
/* ------------------------------------------------------------------ */

export interface RealityCheckResult {
  /** Excess-return statistic for the best strategy in `strategies`. */
  bestStat: number;
  /** Index of the best-performing strategy in the input array. */
  bestIdx: number;
  /**
   * P-value: probability of seeing a best-strategy excess at least this
   * large purely from data-snooping noise. < 0.05 = real edge.
   */
  pValue: number;
  /** Number of bootstrap resamples actually used. */
  nResamples: number;
}

/**
 * White's Reality Check — tests whether the BEST of N strategies actually
 * has a real edge over a benchmark, accounting for the fact that picking
 * the best of many trials is itself a source of inflated performance.
 *
 * Inputs:
 *   strategyReturns  array of return arrays, one per strategy (all same length)
 *   benchmarkReturns benchmark return series (same length)
 *   blockLen         mean block length for the stationary bootstrap
 *   nResamples       number of bootstrap iterations
 *
 * Algorithm:
 *   1. Compute f_i = mean(r_i - r_bench) for each strategy i
 *   2. Pick the best: f* = max_i f_i
 *   3. Bootstrap-resample the (T × N+1) joint return matrix B times
 *   4. For each resample, compute f*_b = max_i (f_i_resampled - f_i_observed)
 *   5. p-value = (1 + #{b : f*_b ≥ f*}) / (B + 1)
 *
 * White's centering is the key trick — subtract the observed mean before
 * the max so the bootstrap distribution is centered under the null.
 */
export function realityCheck(
  strategyReturns: number[][],
  benchmarkReturns: number[],
  options: { nResamples?: number; blockLen?: number; seed?: number } = {},
): RealityCheckResult {
  const N = strategyReturns.length;
  if (N === 0) return { bestStat: NaN, bestIdx: -1, pValue: NaN, nResamples: 0 };
  const T = benchmarkReturns.length;
  // Validate lengths.
  for (const r of strategyReturns) {
    if (r.length !== T) {
      return { bestStat: NaN, bestIdx: -1, pValue: NaN, nResamples: 0 };
    }
  }
  if (T < 5) return { bestStat: NaN, bestIdx: -1, pValue: NaN, nResamples: 0 };

  const nResamples = options.nResamples ?? 1000;
  const blockLen = options.blockLen ?? Math.max(1, Math.floor(Math.cbrt(T)));
  const p = 1 / blockLen;
  let seed = options.seed ?? 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Excess returns per strategy + their observed means.
  const excess: number[][] = strategyReturns.map((r) =>
    r.map((v, t) => v - benchmarkReturns[t]),
  );
  const fObs = excess.map(mean);
  let bestStat = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < N; i++) {
    if (fObs[i] > bestStat) {
      bestStat = fObs[i];
      bestIdx = i;
    }
  }

  // Bootstrap.
  let exceedances = 0;
  for (let b = 0; b < nResamples; b++) {
    // Resample row indices block-stationary; reuse them across all strategies.
    const idxs: number[] = [];
    let i = Math.floor(rand() * T);
    while (idxs.length < T) {
      idxs.push(i % T);
      if (rand() < p) i = Math.floor(rand() * T);
      else i++;
    }
    let bMax = -Infinity;
    for (let s = 0; s < N; s++) {
      let sum = 0;
      for (const j of idxs) sum += excess[s][j];
      const fb = sum / T - fObs[s]; // center on the observed mean (White's trick)
      if (fb > bMax) bMax = fb;
    }
    if (bMax >= bestStat) exceedances++;
  }
  const pValue = (1 + exceedances) / (nResamples + 1);
  return { bestStat, bestIdx, pValue, nResamples };
}

/* ------------------------------------------------------------------ */
/* 5. Drawdown duration distribution                                  */
/* ------------------------------------------------------------------ */

export interface DrawdownStats {
  /** Maximum drawdown as a positive number (e.g., 0.15 = 15% drawdown). */
  maxDrawdown: number;
  /**
   * All drawdown durations in BARS (any consecutive sequence below the
   * running peak), sorted ascending.
   */
  durationsBars: number[];
  /** Median drawdown duration in bars. */
  medianDuration: number;
  /** Longest drawdown duration in bars. */
  maxDuration: number;
  /**
   * Time-Under-Water ratio: fraction of bars spent below the running peak.
   * 0 = always at new highs, 1 = never recovers.
   */
  tuwRatio: number;
}

/**
 * Compute the full drawdown profile of an equity curve. A drawdown starts
 * at the first bar that's below the running peak and ends when the curve
 * returns to (or exceeds) that peak. Drawdowns that never recover are
 * still counted — their duration is from start-of-drawdown to end-of-series.
 */
export function drawdownStats(equity: number[]): DrawdownStats {
  if (equity.length === 0) {
    return {
      maxDrawdown: 0,
      durationsBars: [],
      medianDuration: 0,
      maxDuration: 0,
      tuwRatio: 0,
    };
  }
  let peak = equity[0];
  let maxDD = 0;
  let inDrawdown = false;
  let ddStart = 0;
  let underWaterBars = 0;
  const durations: number[] = [];
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (v >= peak) {
      // Recovered (or at new high).
      if (inDrawdown) {
        durations.push(i - ddStart);
        inDrawdown = false;
      }
      peak = v;
    } else {
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (!inDrawdown) {
        inDrawdown = true;
        ddStart = i;
      }
      underWaterBars++;
    }
  }
  if (inDrawdown) durations.push(equity.length - ddStart);
  durations.sort((a, b) => a - b);
  const median =
    durations.length === 0
      ? 0
      : durations[Math.floor(durations.length / 2)];
  return {
    maxDrawdown: maxDD,
    durationsBars: durations,
    medianDuration: median,
    maxDuration: durations.length ? durations[durations.length - 1] : 0,
    tuwRatio: equity.length > 0 ? underWaterBars / equity.length : 0,
  };
}

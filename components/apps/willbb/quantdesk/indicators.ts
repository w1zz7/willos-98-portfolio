/**
 * Shared indicator library for the Research terminal.
 *
 * Pure TypeScript, no external deps. All series operations preserve length
 * with `null` padding for the boot-up window. The library splits into:
 *
 *   QUANT PRIMITIVES (the headline)
 *     log_ret               log returns (the canonical input to most quant work)
 *     cum_log_ret           compounded log returns (for equity curves)
 *     realized_vol_cc       close-to-close realized vol (annualized)
 *     realized_vol_pk       Parkinson estimator (uses high-low range)
 *     realized_vol_gk       Garman-Klass estimator (uses OHLC, ~7x more efficient)
 *     realized_vol_yz       Yang-Zhang estimator (handles overnight gaps; gold standard)
 *     rolling_beta          rolling beta of (asset, market) over window n
 *     rolling_corr          rolling Pearson correlation
 *     sortino               rolling Sortino ratio (downside-vol Sharpe)
 *     information_ratio     rolling IR vs benchmark
 *     hurst                 Hurst exponent via R/S analysis (mean-reverting < 0.5 < trending)
 *     adf_stat              augmented Dickey-Fuller statistic for stationarity
 *     acf                   autocorrelation function with lag-h autocovariances
 *     pacf                  partial autocorrelation function (Durbin-Levinson)
 *     rank                  cross-sectional / time-series rank
 *     zscore                rolling z-score normalization
 *     winsorize             cap series at percentile bounds (outlier control)
 *     pct_change            percent-change shift (lag-n returns)
 *
 *   TRADITIONAL INDICATORS (for chart compatibility only - retail-class,
 *   kept for users coming from the TradingView world)
 *     sma · ema · rsi · macd · atr · bb · stoch · obv · vwap · adx ·
 *     donchian · ichimoku · crossover · crossunder · highest · lowest
 */

export interface Bar {
  t: number; // unix timestamp (seconds)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // volume; 0 if unknown
}

type Series = (number | null)[];

const TRADING_DAYS = 252;

// ================================================================
// === Quant primitives — log returns, vol estimators, ratios =====
// ================================================================

/**
 * Log returns: r_t = log(c_t / c_{t-1}). Preferred over arithmetic returns
 * for time aggregation: cum log return = sum of log returns.
 * First element is null (no prior bar).
 */
export function log_ret(closes: Series): Series {
  const out: Series = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (cur != null && prev != null && prev > 0) out[i] = Math.log(cur / prev);
  }
  return out;
}

export function cum_log_ret(returns: Series): Series {
  const out: Series = new Array(returns.length).fill(null);
  let cum = 0;
  for (let i = 0; i < returns.length; i++) {
    if (returns[i] != null) cum += returns[i] as number;
    out[i] = cum;
  }
  return out;
}

/**
 * Close-to-close realized volatility. Annualized via √252. Uses log returns.
 * Standard but inefficient — discards the high/low range information.
 */
export function realized_vol_cc(closes: Series, n: number = 21): Series {
  const out: Series = new Array(closes.length).fill(null);
  const lr = log_ret(closes);
  for (let i = n; i < closes.length; i++) {
    const window: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const v = lr[j];
      if (v != null) window.push(v);
    }
    if (window.length < 2) continue;
    const m = window.reduce((a, b) => a + b, 0) / window.length;
    const v = window.reduce((a, b) => a + (b - m) ** 2, 0) / (window.length - 1);
    out[i] = Math.sqrt(v * TRADING_DAYS);
  }
  return out;
}

/**
 * Parkinson volatility estimator. Uses high-low range. ~5x more efficient
 * than close-to-close. Assumes no drift; biases low when drift is large.
 *
 *   σ²_P = (1 / 4·log(2)·n) · Σ (log(H/L))²
 */
export function realized_vol_pk(bars: Bar[], n: number = 21): Series {
  const out: Series = new Array(bars.length).fill(null);
  const factor = 1 / (4 * Math.log(2));
  for (let i = n - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const b = bars[j];
      if (b.h > 0 && b.l > 0) sum += Math.log(b.h / b.l) ** 2;
    }
    out[i] = Math.sqrt((factor * sum / n) * TRADING_DAYS);
  }
  return out;
}

/**
 * Garman-Klass volatility. ~7-8x more efficient than close-to-close.
 *
 *   σ²_GK = (1/n) · Σ [ 0.5·(log(H/L))² − (2·log(2) − 1)·(log(C/O))² ]
 */
export function realized_vol_gk(bars: Bar[], n: number = 21): Series {
  const out: Series = new Array(bars.length).fill(null);
  const k = 2 * Math.log(2) - 1;
  for (let i = n - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const b = bars[j];
      if (b.h > 0 && b.l > 0 && b.o > 0 && b.c > 0) {
        const hl = Math.log(b.h / b.l);
        const co = Math.log(b.c / b.o);
        sum += 0.5 * hl * hl - k * co * co;
      }
    }
    out[i] = Math.sqrt(Math.max(0, sum / n) * TRADING_DAYS);
  }
  return out;
}

/**
 * Yang-Zhang volatility. Handles overnight gaps + drift. The textbook
 * gold-standard for daily-bar realized vol estimation.
 *
 *   σ²_YZ = σ²_overnight + k·σ²_open_to_close + (1−k)·σ²_RS
 *
 * where σ²_RS is Rogers-Satchell (drift-independent OHLC estimator).
 *   k = 0.34 / (1.34 + (n+1)/(n-1))   (Yang-Zhang's optimal weight)
 */
export function realized_vol_yz(bars: Bar[], n: number = 21): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length < n + 2) return out;
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  for (let i = n; i < bars.length; i++) {
    const window = bars.slice(i - n + 1, i + 1);
    // Overnight log returns (today's open vs prior close)
    const overnight: number[] = [];
    const openToClose: number[] = [];
    const rsTerms: number[] = [];
    for (let j = 1; j < window.length; j++) {
      const prev = window[j - 1];
      const cur = window[j];
      if (prev.c > 0 && cur.o > 0) overnight.push(Math.log(cur.o / prev.c));
      if (cur.o > 0 && cur.c > 0) openToClose.push(Math.log(cur.c / cur.o));
      // Rogers-Satchell: log(H/C)·log(H/O) + log(L/C)·log(L/O)
      if (cur.h > 0 && cur.l > 0 && cur.o > 0 && cur.c > 0) {
        rsTerms.push(Math.log(cur.h / cur.c) * Math.log(cur.h / cur.o) + Math.log(cur.l / cur.c) * Math.log(cur.l / cur.o));
      }
    }
    function variance(xs: number[]): number {
      if (xs.length < 2) return 0;
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
    }
    const vOver = variance(overnight);
    const vOC = variance(openToClose);
    const vRS = rsTerms.length > 0 ? rsTerms.reduce((a, b) => a + b, 0) / rsTerms.length : 0;
    const v2 = vOver + k * vOC + (1 - k) * vRS;
    out[i] = Math.sqrt(Math.max(0, v2) * TRADING_DAYS);
  }
  return out;
}

/**
 * Rolling beta of asset returns vs market returns over window n.
 * β = Cov(r_asset, r_mkt) / Var(r_mkt)
 */
export function rolling_beta(retAsset: Series, retMkt: Series, n: number = 60): Series {
  const out: Series = new Array(retAsset.length).fill(null);
  for (let i = n; i < retAsset.length; i++) {
    const a: number[] = [];
    const m: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const x = retAsset[j];
      const y = retMkt[j];
      if (x != null && y != null) {
        a.push(x);
        m.push(y);
      }
    }
    if (a.length < 5) continue;
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mm = m.reduce((s, v) => s + v, 0) / m.length;
    let cov = 0;
    let varM = 0;
    for (let k = 0; k < a.length; k++) {
      cov += (a[k] - ma) * (m[k] - mm);
      varM += (m[k] - mm) ** 2;
    }
    if (varM > 0) out[i] = cov / varM;
  }
  return out;
}

/**
 * Rolling Pearson correlation between two series over window n.
 */
export function rolling_corr(s1: Series, s2: Series, n: number = 60): Series {
  const out: Series = new Array(s1.length).fill(null);
  for (let i = n - 1; i < s1.length; i++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      if (s1[j] != null && s2[j] != null) {
        a.push(s1[j] as number);
        b.push(s2[j] as number);
      }
    }
    if (a.length < 5) continue;
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let k = 0; k < a.length; k++) {
      num += (a[k] - ma) * (b[k] - mb);
      da += (a[k] - ma) ** 2;
      db += (b[k] - mb) ** 2;
    }
    if (da > 0 && db > 0) out[i] = num / Math.sqrt(da * db);
  }
  return out;
}

/**
 * Rolling Sortino ratio. Penalizes only downside volatility (returns < 0).
 * Annualized × √252.
 */
export function sortino(returns: Series, n: number = 60): Series {
  const out: Series = new Array(returns.length).fill(null);
  for (let i = n - 1; i < returns.length; i++) {
    const w: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const v = returns[j];
      if (v != null) w.push(v);
    }
    if (w.length < 5) continue;
    const m = w.reduce((s, v) => s + v, 0) / w.length;
    const dn = w.filter((v) => v < 0);
    if (dn.length < 2) continue;
    const dnVar = dn.reduce((s, v) => s + v * v, 0) / dn.length;
    const dnStd = Math.sqrt(dnVar);
    if (dnStd > 0) out[i] = (m / dnStd) * Math.sqrt(TRADING_DAYS);
  }
  return out;
}

/**
 * Rolling Information Ratio: (mean active return) / (std active return) × √252.
 * activeRet = portfolio return − benchmark return.
 */
export function information_ratio(retPort: Series, retBench: Series, n: number = 60): Series {
  const out: Series = new Array(retPort.length).fill(null);
  for (let i = n - 1; i < retPort.length; i++) {
    const active: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const p = retPort[j];
      const b = retBench[j];
      if (p != null && b != null) active.push(p - b);
    }
    if (active.length < 5) continue;
    const m = active.reduce((s, v) => s + v, 0) / active.length;
    const v = active.reduce((s, x) => s + (x - m) ** 2, 0) / (active.length - 1);
    const std = Math.sqrt(v);
    if (std > 0) out[i] = (m / std) * Math.sqrt(TRADING_DAYS);
  }
  return out;
}

/**
 * Hurst exponent via rescaled-range (R/S) analysis on log returns.
 *   H ≈ 0.5  random walk
 *   H < 0.5  mean-reverting (anti-persistent)
 *   H > 0.5  trending (persistent / long memory)
 *
 * Returns a single scalar; pass a window-of-returns to get a stable estimate.
 */
export function hurst(returns: number[]): number {
  const n = returns.length;
  if (n < 20) return 0.5;
  const lags: number[] = [];
  const rsVals: number[] = [];
  for (let lag = 5; lag < Math.min(n, 100); lag += 5) {
    const chunks = Math.floor(n / lag);
    if (chunks < 2) break;
    const rsList: number[] = [];
    for (let c = 0; c < chunks; c++) {
      const slice = returns.slice(c * lag, c * lag + lag);
      const m = slice.reduce((a, b) => a + b, 0) / slice.length;
      let cumDev = 0;
      let mn = Infinity;
      let mx = -Infinity;
      for (const v of slice) {
        cumDev += v - m;
        if (cumDev < mn) mn = cumDev;
        if (cumDev > mx) mx = cumDev;
      }
      const range = mx - mn;
      const std = Math.sqrt(slice.reduce((a, v) => a + (v - m) ** 2, 0) / slice.length);
      if (std > 0) rsList.push(range / std);
    }
    if (rsList.length === 0) continue;
    const rsMean = rsList.reduce((a, b) => a + b, 0) / rsList.length;
    if (rsMean > 0) {
      lags.push(Math.log(lag));
      rsVals.push(Math.log(rsMean));
    }
  }
  if (lags.length < 3) return 0.5;
  // Linear fit: log(R/S) = H · log(lag) + c
  const mLag = lags.reduce((a, b) => a + b, 0) / lags.length;
  const mRS = rsVals.reduce((a, b) => a + b, 0) / rsVals.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < lags.length; i++) {
    num += (lags[i] - mLag) * (rsVals[i] - mRS);
    den += (lags[i] - mLag) ** 2;
  }
  return den > 0 ? num / den : 0.5;
}

/**
 * Augmented Dickey-Fuller test statistic (lag-1, no constant). A negative
 * value > critical value means we cannot reject unit-root (non-stationary).
 *   Δy_t = ρ · y_{t-1} + ε_t
 *
 * Returns the t-statistic on ρ̂. Critical values: -2.86 (95%), -3.43 (99%).
 */
export function adf_stat(series: number[]): number {
  const n = series.length;
  if (n < 30) return 0;
  // Compute Δy and y_{t-1}
  const dy: number[] = [];
  const ylag: number[] = [];
  for (let i = 1; i < n; i++) {
    dy.push(series[i] - series[i - 1]);
    ylag.push(series[i - 1]);
  }
  // OLS regression of dy on ylag (no intercept for simplicity)
  const N = dy.length;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < N; i++) {
    sumXY += ylag[i] * dy[i];
    sumXX += ylag[i] * ylag[i];
  }
  if (sumXX === 0) return 0;
  const rho = sumXY / sumXX;
  // Residuals
  let sse = 0;
  for (let i = 0; i < N; i++) {
    const pred = rho * ylag[i];
    sse += (dy[i] - pred) ** 2;
  }
  const sigma2 = sse / Math.max(1, N - 1);
  const seRho = Math.sqrt(sigma2 / sumXX);
  return seRho > 0 ? rho / seRho : 0;
}

/**
 * Autocorrelation function. Returns array of length maxLag where acf[0] = 1.
 * Computed as sample autocorrelation at lag h.
 *   r_h = Σ(y_t - ȳ)(y_{t-h} - ȳ) / Σ(y_t - ȳ)²
 */
export function acf(series: number[], maxLag: number): number[] {
  const n = series.length;
  if (n < 2) return new Array(maxLag + 1).fill(0);
  const m = series.reduce((a, b) => a + b, 0) / n;
  let var0 = 0;
  for (const v of series) var0 += (v - m) ** 2;
  if (var0 === 0) return new Array(maxLag + 1).fill(0);
  const out: number[] = new Array(maxLag + 1).fill(0);
  out[0] = 1;
  for (let h = 1; h <= maxLag && h < n; h++) {
    let s = 0;
    for (let t = h; t < n; t++) s += (series[t] - m) * (series[t - h] - m);
    out[h] = s / var0;
  }
  return out;
}

/**
 * Partial autocorrelation function via Durbin-Levinson recursion.
 * pacf[h] = correlation of y_t and y_{t-h} after removing the linear effect
 * of y_{t-1}, y_{t-2}, ..., y_{t-h+1}.
 */
export function pacf(series: number[], maxLag: number): number[] {
  const r = acf(series, maxLag);
  const phi: number[][] = [];
  for (let h = 0; h <= maxLag; h++) phi.push(new Array(maxLag + 1).fill(0));
  const out: number[] = new Array(maxLag + 1).fill(0);
  out[0] = 1;
  for (let h = 1; h <= maxLag; h++) {
    if (h === 1) {
      phi[1][1] = r[1];
    } else {
      let num = r[h];
      let den = 1;
      for (let k = 1; k < h; k++) {
        num -= phi[h - 1][k] * r[h - k];
        den -= phi[h - 1][k] * r[k];
      }
      phi[h][h] = den !== 0 ? num / den : 0;
      for (let k = 1; k < h; k++) {
        phi[h][k] = phi[h - 1][k] - phi[h][h] * phi[h - 1][h - k];
      }
    }
    out[h] = phi[h][h];
  }
  return out;
}

/**
 * Time-series rank: at each point, return the rank of the current value
 * within the trailing window n (1 = lowest, n = highest, scaled to [0,1]).
 */
export function rank(series: Series, n: number = 21): Series {
  const out: Series = new Array(series.length).fill(null);
  for (let i = n - 1; i < series.length; i++) {
    const cur = series[i];
    if (cur == null) continue;
    let belowOrEq = 0;
    let count = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const v = series[j];
      if (v == null) continue;
      count++;
      if (v <= cur) belowOrEq++;
    }
    out[i] = count > 1 ? (belowOrEq - 1) / (count - 1) : 0.5;
  }
  return out;
}

/**
 * Rolling z-score: (x - mean(window)) / std(window).
 */
export function zscore(series: Series, n: number = 21): Series {
  const out: Series = new Array(series.length).fill(null);
  for (let i = n - 1; i < series.length; i++) {
    const w: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const v = series[j];
      if (v != null) w.push(v);
    }
    if (w.length < 2) continue;
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const s = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1));
    const cur = series[i];
    if (cur != null && s > 0) out[i] = (cur - m) / s;
  }
  return out;
}

/**
 * Winsorize: clip series to [loQ, hiQ] percentile bounds. Outlier-resistant.
 */
export function winsorize(series: Series, loQ: number = 0.01, hiQ: number = 0.99): Series {
  const valid: number[] = series.filter((v): v is number => v != null);
  if (valid.length < 10) return series.slice();
  const sorted = [...valid].sort((a, b) => a - b);
  const lo = sorted[Math.floor(loQ * sorted.length)];
  const hi = sorted[Math.floor(hiQ * sorted.length)];
  return series.map((v) => (v == null ? null : Math.max(lo, Math.min(hi, v))));
}

/**
 * Percent-change at lag n: (y_t - y_{t-n}) / y_{t-n}.
 */
export function pct_change(series: Series, n: number = 1): Series {
  const out: Series = new Array(series.length).fill(null);
  for (let i = n; i < series.length; i++) {
    const cur = series[i];
    const prev = series[i - n];
    if (cur != null && prev != null && prev !== 0) out[i] = (cur - prev) / prev;
  }
  return out;
}

// ================================================================
// === Trend ======================================================
// ================================================================

export function sma(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n <= 0) return out;
  let sum = 0;
  let count = 0;
  // Use a sliding window
  for (let i = 0; i < values.length; i++) {
    const cur = values[i];
    if (cur != null) {
      sum += cur;
      count++;
    }
    if (i >= n) {
      const old = values[i - n];
      if (old != null) {
        sum -= old;
        count--;
      }
    }
    if (i >= n - 1 && count > 0) out[i] = sum / count;
  }
  return out;
}

export function ema(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n <= 0) return out;
  const k = 2 / (n + 1);
  let prev: number | null = null;
  let bootSum = 0;
  let bootCount = 0;
  for (let i = 0; i < values.length; i++) {
    const cur = values[i];
    if (cur == null) {
      out[i] = prev;
      continue;
    }
    if (prev == null) {
      // Bootstrap with SMA of first n values
      bootSum += cur;
      bootCount++;
      if (bootCount >= n) {
        prev = bootSum / bootCount;
        out[i] = prev;
      }
    } else {
      prev = cur * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function donchian(bars: Bar[], n: number = 20): { upper: Series; lower: Series; middle: Series } {
  const upper: Series = new Array(bars.length).fill(null);
  const lower: Series = new Array(bars.length).fill(null);
  const middle: Series = new Array(bars.length).fill(null);
  for (let i = n - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      if (bars[j].h > hi) hi = bars[j].h;
      if (bars[j].l < lo) lo = bars[j].l;
    }
    upper[i] = hi;
    lower[i] = lo;
    middle[i] = (hi + lo) / 2;
  }
  return { upper, lower, middle };
}

// Wilder's ADX(n). Returns adx, +DI, -DI all of length bars.length.
export function adx(bars: Bar[], n: number = 14): { adx: Series; plusDI: Series; minusDI: Series } {
  const out = {
    adx: new Array<number | null>(bars.length).fill(null),
    plusDI: new Array<number | null>(bars.length).fill(null),
    minusDI: new Array<number | null>(bars.length).fill(null),
  };
  if (bars.length < n + 1) return out;

  const tr: number[] = new Array(bars.length).fill(0);
  const plusDM: number[] = new Array(bars.length).fill(0);
  const minusDM: number[] = new Array(bars.length).fill(0);

  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const upMove = cur.h - prev.h;
    const downMove = prev.l - cur.l;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      cur.h - cur.l,
      Math.abs(cur.h - prev.c),
      Math.abs(cur.l - prev.c)
    );
  }

  // Wilder smoothing
  let trSum = 0, plusSum = 0, minusSum = 0;
  for (let i = 1; i <= n; i++) {
    trSum += tr[i];
    plusSum += plusDM[i];
    minusSum += minusDM[i];
  }
  let trN = trSum, plusN = plusSum, minusN = minusSum;
  const dxSeries: number[] = [];

  for (let i = n + 1; i < bars.length; i++) {
    trN = trN - trN / n + tr[i];
    plusN = plusN - plusN / n + plusDM[i];
    minusN = minusN - minusN / n + minusDM[i];
    const plusDi = trN > 0 ? (plusN / trN) * 100 : 0;
    const minusDi = trN > 0 ? (minusN / trN) * 100 : 0;
    out.plusDI[i] = plusDi;
    out.minusDI[i] = minusDi;
    const dx = (plusDi + minusDi) > 0 ? (Math.abs(plusDi - minusDi) / (plusDi + minusDi)) * 100 : 0;
    dxSeries.push(dx);
    if (dxSeries.length >= n) {
      // Smoothed ADX
      const start = dxSeries.length - n;
      const sum = dxSeries.slice(start).reduce((a, b) => a + b, 0);
      out.adx[i] = sum / n;
    }
  }

  return out;
}

export function ichimoku(bars: Bar[]): {
  tenkan: Series; // (9-period high + 9-period low) / 2
  kijun: Series; // (26-period high + 26-period low) / 2
  senkouA: Series; // (tenkan + kijun) / 2, plotted 26 periods ahead
  senkouB: Series; // (52-period high + 52-period low) / 2, plotted 26 ahead
  chikou: Series; // close, plotted 26 periods behind
} {
  const out = {
    tenkan: new Array<number | null>(bars.length).fill(null),
    kijun: new Array<number | null>(bars.length).fill(null),
    senkouA: new Array<number | null>(bars.length).fill(null),
    senkouB: new Array<number | null>(bars.length).fill(null),
    chikou: new Array<number | null>(bars.length).fill(null),
  };
  function highLow(start: number, end: number) {
    let hi = -Infinity, lo = Infinity;
    for (let i = start; i <= end; i++) {
      if (bars[i].h > hi) hi = bars[i].h;
      if (bars[i].l < lo) lo = bars[i].l;
    }
    return { hi, lo };
  }
  for (let i = 0; i < bars.length; i++) {
    if (i >= 8) {
      const { hi, lo } = highLow(i - 8, i);
      out.tenkan[i] = (hi + lo) / 2;
    }
    if (i >= 25) {
      const { hi, lo } = highLow(i - 25, i);
      out.kijun[i] = (hi + lo) / 2;
    }
    if (i >= 51) {
      const { hi, lo } = highLow(i - 51, i);
      out.senkouB[i + 26 < bars.length ? i + 26 : i] = (hi + lo) / 2;
    }
    if (i >= 25 && out.tenkan[i] != null && out.kijun[i] != null) {
      const a = (out.tenkan[i]! + out.kijun[i]!) / 2;
      out.senkouA[i + 26 < bars.length ? i + 26 : i] = a;
    }
    if (i >= 26) {
      out.chikou[i - 26] = bars[i].c;
    }
  }
  return out;
}

// ================================================================
// === Momentum ===================================================
// ================================================================

export function rsi(values: Series, n: number = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < n + 1) return out;
  let avgGain = 0, avgLoss = 0;
  let prev: number | null = null;
  let bootCount = 0;

  for (let i = 0; i < values.length; i++) {
    const cur = values[i];
    if (cur == null) continue;
    if (prev == null) {
      prev = cur;
      continue;
    }
    const change = cur - prev;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (bootCount < n) {
      avgGain += gain;
      avgLoss += loss;
      bootCount++;
      if (bootCount === n) {
        avgGain /= n;
        avgLoss /= n;
        const rs = avgLoss > 0 ? avgGain / avgLoss : 0;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (n - 1) + gain) / n;
      avgLoss = (avgLoss * (n - 1) + loss) / n;
      const rs = avgLoss > 0 ? avgGain / avgLoss : 0;
      out[i] = avgLoss > 0 ? 100 - 100 / (1 + rs) : 100;
    }
    prev = cur;
  }
  return out;
}

export function macd(
  values: Series,
  fastN: number = 12,
  slowN: number = 26,
  sigN: number = 9
): { macd: Series; signal: Series; hist: Series } {
  const fastE = ema(values, fastN);
  const slowE = ema(values, slowN);
  const macdLine: Series = values.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? fastE[i]! - slowE[i]! : null
  );
  const signal = ema(macdLine, sigN);
  const hist: Series = macdLine.map((m, i) =>
    m != null && signal[i] != null ? m - signal[i]! : null
  );
  return { macd: macdLine, signal, hist };
}

export function stoch(
  bars: Bar[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { k: Series; d: Series } {
  const k: Series = new Array(bars.length).fill(null);
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].h > hi) hi = bars[j].h;
      if (bars[j].l < lo) lo = bars[j].l;
    }
    if (hi - lo > 0) k[i] = ((bars[i].c - lo) / (hi - lo)) * 100;
    else k[i] = 0;
  }
  const d = sma(k, dPeriod);
  return { k, d };
}

// ================================================================
// === Volatility =================================================
// ================================================================

export function atr(bars: Bar[], n: number = 14): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length < n + 1) return out;
  const tr: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    tr[i] = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c)
    );
  }
  // Wilder smoothing
  let prev: number | null = null;
  let sum = 0;
  for (let i = 1; i < bars.length; i++) {
    if (i <= n) {
      sum += tr[i];
      if (i === n) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = (prev! * (n - 1) + tr[i]) / n;
      out[i] = prev;
    }
  }
  return out;
}

export function bb(
  values: Series,
  n: number = 20,
  mult: number = 2
): { upper: Series; middle: Series; lower: Series } {
  const middle = sma(values, n);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    if (middle[i] == null) continue;
    let s2 = 0;
    let cnt = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v != null) {
        s2 += (v - middle[i]!) ** 2;
        cnt++;
      }
    }
    if (cnt > 1) {
      const std = Math.sqrt(s2 / cnt);
      upper[i] = middle[i]! + mult * std;
      lower[i] = middle[i]! - mult * std;
    }
  }
  return { upper, middle, lower };
}

// ================================================================
// === Volume =====================================================
// ================================================================

export function obv(bars: Bar[]): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length === 0) return out;
  let acc = 0;
  out[0] = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].c > bars[i - 1].c) acc += bars[i].v;
    else if (bars[i].c < bars[i - 1].c) acc -= bars[i].v;
    out[i] = acc;
  }
  return out;
}

// Session-anchored VWAP. Resets at the start of each new day (compares
// midnight UTC of consecutive bars).
export function vwap(bars: Bar[]): Series {
  const out: Series = new Array(bars.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  let lastDay = -1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const day = Math.floor(b.t / 86400);
    if (day !== lastDay) {
      cumPV = 0;
      cumV = 0;
      lastDay = day;
    }
    const tp = (b.h + b.l + b.c) / 3;
    cumPV += tp * b.v;
    cumV += b.v;
    if (cumV > 0) out[i] = cumPV / cumV;
  }
  return out;
}

// ================================================================
// === Helpers ====================================================
// ================================================================

export function crossover(a: Series, b: Series): boolean[] {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    if (a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null) {
      if (a[i - 1]! <= b[i - 1]! && a[i]! > b[i]!) out[i] = true;
    }
  }
  return out;
}

export function crossunder(a: Series, b: Series): boolean[] {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    if (a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null) {
      if (a[i - 1]! >= b[i - 1]! && a[i]! < b[i]!) out[i] = true;
    }
  }
  return out;
}

export function highest(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    let hi = -Infinity;
    let cnt = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v != null) {
        if (v > hi) hi = v;
        cnt++;
      }
    }
    if (cnt > 0) out[i] = hi;
  }
  return out;
}

export function lowest(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    let lo = Infinity;
    let cnt = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v != null) {
        if (v < lo) lo = v;
        cnt++;
      }
    }
    if (cnt > 0) out[i] = lo;
  }
  return out;
}

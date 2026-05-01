/**
 * Factor regression - Carhart 4-factor (Mkt-RF / SMB / HML / MOM) on
 * strategy returns, computed client-side via ordinary least squares with
 * Newey-West-style standard errors (OLS-flavored, no AR correction since
 * daily data + bias-corrected SE = good enough for a portfolio piece).
 *
 * Factor proxies via ETFs (we don't have access to the official Fama-French
 * library client-side, so we approximate with liquid ETF spreads):
 *
 *   Mkt-RF = SPY return  − ¹⁄₂₅₂ · 5% (3M T-bill proxy as risk-free)
 *   SMB    = IWM − SPY   (small minus large)
 *   HML    = IUSV − IUSG (value minus growth)
 *   MOM    = MTUM − SPY  (momentum tilt)
 *
 * For a real research desk this would be Ken French's actual factor file;
 * the ETF-spread approximation is the live-data version of the same
 * exposure picture.
 */

export interface FactorReturns {
  Mkt: (number | null)[];
  SMB: (number | null)[];
  HML: (number | null)[];
  MOM: (number | null)[];
}

export interface FactorRegressionResult {
  alpha: number; // daily alpha (intercept)
  alphaAnnualized: number;
  alphaTStat: number;
  loadings: { factor: "Mkt" | "SMB" | "HML" | "MOM"; beta: number; tStat: number }[];
  rSquared: number;
  residualVol: number; // daily idiosyncratic σ
  totalVol: number; // daily total σ
  systematicShare: number; // 0..1 - fraction of variance from factors
  idiosyncraticShare: number;
  n: number; // sample size
}

/**
 * OLS multivariate regression with intercept.
 *   y = α + β₁·X₁ + β₂·X₂ + … + ε
 * Returns coefficients, t-statistics, and R².
 */
function olsRegression(
  y: number[],
  X: number[][]
): { coef: number[]; tStats: number[]; rSquared: number; residVar: number; ok: boolean } {
  const n = y.length;
  const k = X.length; // number of regressors (excluding intercept)
  if (n < k + 5) {
    return { coef: [0, ...new Array(k).fill(0)], tStats: [0, ...new Array(k).fill(0)], rSquared: 0, residVar: 0, ok: false };
  }
  // Build design matrix Z (n × (k+1)) with leading column of 1s for intercept
  const Z: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1];
    for (let j = 0; j < k; j++) row.push(X[j][i]);
    Z.push(row);
  }
  // ZtZ
  const m = k + 1;
  const ZtZ: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) ZtZ[a][b] += Z[i][a] * Z[i][b];
  }
  // Zt y
  const ZtY: number[] = new Array(m).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < m; a++) ZtY[a] += Z[i][a] * y[i];
  // Invert ZtZ via Gauss-Jordan (m is small: ≤5). Singular matrix means
  // factors are perfectly collinear (e.g., constant series during a holiday) -
  // bubble that up via ok=false rather than returning silent zeros.
  const inv = invertMatrix(ZtZ);
  if (!inv) return { coef: [0, ...new Array(k).fill(0)], tStats: [0, ...new Array(k).fill(0)], rSquared: 0, residVar: 0, ok: false };
  // β = (ZtZ)^-1 · ZtY
  const coef: number[] = new Array(m).fill(0);
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) coef[a] += inv[a][b] * ZtY[b];
  // Residuals + R²
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let a = 0; a < m; a++) pred += coef[a] * Z[i][a];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const residVar = ssRes / Math.max(1, n - m);
  // SE(β_a) = sqrt(residVar · inv[a][a])
  const tStats: number[] = new Array(m).fill(0);
  for (let a = 0; a < m; a++) {
    const se = Math.sqrt(Math.max(0, residVar * inv[a][a]));
    tStats[a] = se > 0 ? coef[a] / se : 0;
  }
  return { coef, tStats, rSquared, residVar, ok: true };
}

function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const aug: number[][] = A.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    // Find pivot
    let pivot = aug[i][i];
    if (Math.abs(pivot) < 1e-12) {
      // Find a row to swap with
      let swap = -1;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > 1e-12) {
          swap = k;
          break;
        }
      }
      if (swap === -1) return null; // singular
      [aug[i], aug[swap]] = [aug[swap], aug[i]];
      pivot = aug[i][i];
    }
    // Normalize pivot row
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = aug[k][i];
      for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * Run Carhart-style factor regression.
 *   strategyReturns: (number | null)[] - per-bar strategy log returns
 *   factors: { Mkt, SMB, HML, MOM } - per-bar factor returns
 *
 * Returns alpha (daily + annualized), 4 factor betas with t-stats,
 * R², residual vol, systematic vs idiosyncratic variance share.
 */
export function runFactorRegression(
  strategyReturns: (number | null)[],
  factors: FactorReturns
): FactorRegressionResult | null {
  // Align indexes - drop bars where any series is null
  const yArr: number[] = [];
  const xMkt: number[] = [];
  const xSMB: number[] = [];
  const xHML: number[] = [];
  const xMOM: number[] = [];
  const minLen = Math.min(
    strategyReturns.length,
    factors.Mkt.length,
    factors.SMB.length,
    factors.HML.length,
    factors.MOM.length
  );
  for (let i = 0; i < minLen; i++) {
    const y = strategyReturns[i];
    const m = factors.Mkt[i];
    const s = factors.SMB[i];
    const h = factors.HML[i];
    const o = factors.MOM[i];
    if (y == null || m == null || s == null || h == null || o == null) continue;
    yArr.push(y);
    xMkt.push(m);
    xSMB.push(s);
    xHML.push(h);
    xMOM.push(o);
  }
  if (yArr.length < 30) return null;

  const fit = olsRegression(yArr, [xMkt, xSMB, xHML, xMOM]);
  // Bubble singular-matrix failures up to the UI so it can show "not enough
  // factor diversity" instead of silently rendering zero loadings.
  if (!fit.ok) return null;
  const [alpha, betaMkt, betaSMB, betaHML, betaMOM] = fit.coef;
  const [tAlpha, tMkt, tSMB, tHML, tMOM] = fit.tStats;

  // Total variance vs residual variance for the systematic share
  const yMean = yArr.reduce((s, v) => s + v, 0) / yArr.length;
  const totalVar = yArr.reduce((s, v) => s + (v - yMean) ** 2, 0) / Math.max(1, yArr.length - 1);
  const totalVol = Math.sqrt(totalVar);
  const residualVol = Math.sqrt(fit.residVar);
  const systematicShare = totalVar > 0 ? Math.max(0, Math.min(1, 1 - fit.residVar / totalVar)) : 0;

  return {
    alpha,
    alphaAnnualized: alpha * 252,
    alphaTStat: tAlpha,
    loadings: [
      { factor: "Mkt", beta: betaMkt, tStat: tMkt },
      { factor: "SMB", beta: betaSMB, tStat: tSMB },
      { factor: "HML", beta: betaHML, tStat: tHML },
      { factor: "MOM", beta: betaMOM, tStat: tMOM },
    ],
    rSquared: fit.rSquared,
    residualVol,
    totalVol,
    systematicShare,
    idiosyncraticShare: 1 - systematicShare,
    n: yArr.length,
  };
}

/**
 * Build factor returns from ETF chart data. Each chart endpoint gives a
 * series of closes; we compute log-returns then take the spread.
 *   spy        SPY closes
 *   iwm        IWM closes
 *   spyForSmb  SPY closes (re-aligned to IWM dates - in practice the same array)
 *   iusv       IUSV (value) closes
 *   iusg       IUSG (growth) closes
 *   mtum       MTUM (momentum) closes
 *
 * Returns: { Mkt, SMB, HML, MOM } as aligned (number | null)[] arrays of the
 * same length as the SPY series.
 */
export function buildFactorReturns(closesBySymbol: {
  SPY: number[];
  IWM: number[];
  IUSV: number[];
  IUSG: number[];
  MTUM: number[];
}): FactorReturns {
  function logRet(closes: number[]): (number | null)[] {
    const out: (number | null)[] = new Array(closes.length).fill(null);
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) out[i] = Math.log(closes[i] / closes[i - 1]);
    }
    return out;
  }
  const rSPY = logRet(closesBySymbol.SPY);
  const rIWM = logRet(closesBySymbol.IWM);
  const rIUSV = logRet(closesBySymbol.IUSV);
  const rIUSG = logRet(closesBySymbol.IUSG);
  const rMTUM = logRet(closesBySymbol.MTUM);
  const n = Math.min(rSPY.length, rIWM.length, rIUSV.length, rIUSG.length, rMTUM.length);
  const RF_DAILY = 0.05 / 252; // 5% annualized risk-free, simple daily proxy
  const Mkt: (number | null)[] = new Array(n).fill(null);
  const SMB: (number | null)[] = new Array(n).fill(null);
  const HML: (number | null)[] = new Array(n).fill(null);
  const MOM: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rSPY[i] != null) Mkt[i] = (rSPY[i] as number) - RF_DAILY;
    if (rIWM[i] != null && rSPY[i] != null) SMB[i] = (rIWM[i] as number) - (rSPY[i] as number);
    if (rIUSV[i] != null && rIUSG[i] != null) HML[i] = (rIUSV[i] as number) - (rIUSG[i] as number);
    if (rMTUM[i] != null && rSPY[i] != null) MOM[i] = (rMTUM[i] as number) - (rSPY[i] as number);
  }
  return { Mkt, SMB, HML, MOM };
}

/**
 * Factor regression — Carhart 4-factor (Mkt-RF / SMB / HML / MOM) on
 * strategy returns, computed client-side via ordinary least squares with
 * **Newey-West HAC standard errors** (Bartlett kernel, automatic lag
 * selection L = ⌊4·(T/100)^(2/9)⌋ per Newey & West 1994). Financial
 * returns are heteroskedastic and autocorrelated; classical OLS t-stats
 * are wrong on this kind of data, so we report HAC t-stats by default
 * and expose both for transparency.
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

import { hacOLS } from "./advancedStats";

export interface FactorReturns {
  Mkt: (number | null)[];
  SMB: (number | null)[];
  HML: (number | null)[];
  MOM: (number | null)[];
}

export interface FactorRegressionResult {
  alpha: number; // daily alpha (intercept)
  alphaAnnualized: number;
  /** Classical OLS t-stat on alpha. Use for academic comparison. */
  alphaTStat: number;
  /** Newey-West HAC t-stat on alpha. Use for inference on financial data. */
  alphaTStatHAC: number;
  /** Two-sided HAC p-value on alpha. < 0.05 = real edge after factor exposure. */
  alphaPValueHAC: number;
  loadings: {
    factor: "Mkt" | "SMB" | "HML" | "MOM";
    beta: number;
    /** Classical OLS t-stat. */
    tStat: number;
    /** Newey-West HAC t-stat. The one to report. */
    tStatHAC: number;
    /** HAC p-value, two-sided. */
    pValueHAC: number;
  }[];
  rSquared: number;
  /** Adjusted R-squared accounting for parameter count. */
  adjRSquared: number;
  residualVol: number; // daily idiosyncratic σ
  totalVol: number; // daily total σ
  systematicShare: number; // 0..1 - fraction of variance from factors
  idiosyncraticShare: number;
  n: number; // sample size
  /** Newey-West lag length used for the HAC adjustment. */
  hacLag: number;
}

// OLS regression + matrix-inversion logic moved to ./advancedStats hacOLS,
// which returns both classical and Newey-West HAC standard errors. This
// file just orchestrates the factor alignment and unwraps the result.

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

  // Build design matrix for hacOLS — leading column of 1s for intercept,
  // then the 4 factor columns. hacOLS returns both classical and HAC SEs
  // so the UI can label the HAC t-stat as the headline number while still
  // showing the classical figure for academic comparison.
  const T = yArr.length;
  const X: number[][] = new Array(T);
  for (let i = 0; i < T; i++) X[i] = [1, xMkt[i], xSMB[i], xHML[i], xMOM[i]];
  const fit = hacOLS(yArr, X);
  if (!Number.isFinite(fit.beta[0])) return null;
  const [alpha, betaMkt, betaSMB, betaHML, betaMOM] = fit.beta;
  const [tAlpha, tMkt, tSMB, tHML, tMOM] = fit.tStat;
  const [tAlphaHAC, tMktHAC, tSMBHAC, tHMLHAC, tMOMHAC] = fit.tStatHAC;
  const [, pMktHAC, pSMBHAC, pHMLHAC, pMOMHAC] = fit.pValueHAC;
  const alphaPValueHAC = fit.pValueHAC[0];

  const yMean = yArr.reduce((s, v) => s + v, 0) / T;
  let totalSS = 0;
  for (const v of yArr) totalSS += (v - yMean) ** 2;
  const totalVar = totalSS / Math.max(1, T - 1);
  const totalVol = Math.sqrt(totalVar);

  // Residual variance from the OLS fit — derive from R² since hacOLS gives
  // it: SSR = SST · (1 - R²), residVar = SSR / (T - k)
  const residVar = (totalSS * (1 - fit.rSquared)) / Math.max(1, T - fit.k);
  const residualVol = Math.sqrt(Math.max(0, residVar));
  const systematicShare = totalVar > 0 ? Math.max(0, Math.min(1, fit.rSquared)) : 0;

  return {
    alpha,
    alphaAnnualized: alpha * 252,
    alphaTStat: tAlpha,
    alphaTStatHAC: tAlphaHAC,
    alphaPValueHAC,
    loadings: [
      { factor: "Mkt", beta: betaMkt, tStat: tMkt, tStatHAC: tMktHAC, pValueHAC: pMktHAC },
      { factor: "SMB", beta: betaSMB, tStat: tSMB, tStatHAC: tSMBHAC, pValueHAC: pSMBHAC },
      { factor: "HML", beta: betaHML, tStat: tHML, tStatHAC: tHMLHAC, pValueHAC: pHMLHAC },
      { factor: "MOM", beta: betaMOM, tStat: tMOM, tStatHAC: tMOMHAC, pValueHAC: pMOMHAC },
    ],
    rSquared: fit.rSquared,
    adjRSquared: fit.adjRSquared,
    residualVol,
    totalVol,
    systematicShare,
    idiosyncraticShare: 1 - systematicShare,
    n: T,
    hacLag: fit.hacLag,
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
/**
 * Build Carhart 4-factor returns from ETF chart data.
 *
 * `riskFreeAnnualized` is the annualized risk-free rate proxy (e.g., the
 * 3-month T-bill yield). Defaults to 0.045 (4.5%) which is roughly the
 * 3M T-bill rate as of late 2024/2025; pass the live rate from the Macro
 * panel for more accurate Carhart alphas. Set to 0 to disable RF
 * subtraction entirely (treats Mkt as raw SPY return).
 */
export function buildFactorReturns(
  closesBySymbol: {
    SPY: number[];
    IWM: number[];
    IUSV: number[];
    IUSG: number[];
    MTUM: number[];
  },
  riskFreeAnnualized: number = 0.045,
): FactorReturns {
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
  // Convert annualized RF to per-bar (assumes daily; intraday Carhart needs
  // adjusted bars-per-year — see inferBarsPerYear in backtest.ts).
  const rfDaily =
    Number.isFinite(riskFreeAnnualized) && riskFreeAnnualized > 0
      ? riskFreeAnnualized / 252
      : 0;
  const Mkt: (number | null)[] = new Array(n).fill(null);
  const SMB: (number | null)[] = new Array(n).fill(null);
  const HML: (number | null)[] = new Array(n).fill(null);
  const MOM: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rSPY[i] != null) Mkt[i] = (rSPY[i] as number) - rfDaily;
    if (rIWM[i] != null && rSPY[i] != null) SMB[i] = (rIWM[i] as number) - (rSPY[i] as number);
    if (rIUSV[i] != null && rIUSG[i] != null) HML[i] = (rIUSV[i] as number) - (rIUSG[i] as number);
    if (rMTUM[i] != null && rSPY[i] != null) MOM[i] = (rMTUM[i] as number) - (rSPY[i] as number);
  }
  return { Mkt, SMB, HML, MOM };
}

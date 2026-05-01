/**
 * Module-level fallback generators for Equity Research.
 *
 * Each function takes a symbol and synthesizes a plausible payload for one
 * /equity/* module by deriving numbers from STATS_SEED + PROFILE_SEED so the
 * sub-tabs render real-looking data when Yahoo's quoteSummary is rate-limited.
 *
 * The generated values are NOT live financial statements - they are
 * coherent estimates anchored to known TTM revenue, margins, and market cap.
 * The UI surfaces a "snapshot" badge so visitors see this is sample data.
 *
 * Modules covered:
 *   income, balance, cashflow, earnings, analysts, share_stats,
 *   institutional, insider, dividends, splits, options, news
 */

import { STATS_SEED, PROFILE_SEED } from "./equityFallback";
import { getSeedQuote } from "./marketsFallback";

// Fiscal-year ends (rough for known names) - fallback to Dec for the rest.
const FY_END: Record<string, string> = {
  AAPL: "09",
  MSFT: "06",
  NVDA: "01",
  GOOG: "12",
  AMZN: "12",
  META: "12",
  TSLA: "12",
  AMD: "12",
  INTC: "12",
};

const LAST_DAY_OF_MONTH: Record<number, number> = {
  1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
  7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
};

/**
 * Most recent fiscal-year-end that has actually occurred for `symbol`.
 * Crucial: never returns a future year. If today < this-year's FY-end,
 * the most recent reported FY ended in the previous calendar year.
 */
function mostRecentFyYear(symbol: string, today: Date = new Date()): number {
  const month = parseInt(FY_END[symbol] ?? "12", 10);
  const day = LAST_DAY_OF_MONTH[month];
  const candidate = new Date(today.getFullYear(), month - 1, day, 23, 59, 59);
  return candidate <= today ? today.getFullYear() : today.getFullYear() - 1;
}

function fyEndDate(symbol: string, yearsAgo = 0, today: Date = new Date()): string {
  const month = parseInt(FY_END[symbol] ?? "12", 10);
  const year = mostRecentFyYear(symbol, today) - yearsAgo;
  const day = LAST_DAY_OF_MONTH[month];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Most recent CALENDAR quarter-end that has occurred. Most US companies
 * report on calendar quarters even when their fiscal year doesn't align,
 * so we use Mar/Jun/Sep/Dec end-of-month as the universal anchor.
 */
function mostRecentQuarterEnd(today: Date = new Date()): { year: number; month: number } {
  const m = today.getMonth(); // 0-indexed
  // Quarter-end months (1-indexed): 3, 6, 9, 12.
  const qEndCandidates = [3, 6, 9, 12];
  let year = today.getFullYear();
  // Find the latest qEnd that has already passed (>= last day of qEnd month).
  for (let i = qEndCandidates.length - 1; i >= 0; i--) {
    const qm = qEndCandidates[i];
    const qDate = new Date(year, qm - 1, LAST_DAY_OF_MONTH[qm], 23, 59, 59);
    if (qDate <= today) return { year, month: qm };
    void m;
  }
  // No quarter has ended yet this year - fall back to last December.
  return { year: year - 1, month: 12 };
}

function quarterEnd(symbol: string, quartersAgo = 0, today: Date = new Date()): string {
  void symbol; // calendar quarters apply to all symbols regardless of FY
  let { year, month } = mostRecentQuarterEnd(today);
  for (let i = 0; i < quartersAgo; i++) {
    month -= 3;
    if (month < 1) {
      month += 12;
      year -= 1;
    }
  }
  const day = LAST_DAY_OF_MONTH[month];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------- Income statement ----------

export function generateIncome(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  const revTTM = stats.revenueTTM ?? 1e9;
  const grossM = stats.grossMargin ?? 0.4;
  const opM = stats.operatingMargin ?? 0.2;
  const profM = stats.profitMargin ?? 0.15;

  const fields = [
    "totalRevenue",
    "costOfRevenue",
    "grossProfit",
    "researchDevelopment",
    "sellingGeneralAdministrative",
    "totalOperatingExpenses",
    "operatingIncome",
    "ebit",
    "interestExpense",
    "incomeBeforeTax",
    "incomeTaxExpense",
    "netIncome",
    "ebitda",
  ];

  function row(rev: number, endDate: string) {
    const cogs = rev * (1 - grossM);
    const grossProfit = rev * grossM;
    const rnd = rev * 0.12;
    const sga = rev * 0.08;
    const totalOpex = rnd + sga;
    const opIncome = rev * opM;
    const ebit = opIncome;
    const interest = rev * 0.005;
    const preTax = ebit - interest;
    const tax = preTax * 0.18;
    const netIncome = rev * profM;
    const dep = rev * 0.04;
    const ebitda = ebit + dep;
    return {
      endDate,
      values: {
        totalRevenue: rev,
        costOfRevenue: cogs,
        grossProfit,
        researchDevelopment: rnd,
        sellingGeneralAdministrative: sga,
        totalOperatingExpenses: totalOpex,
        operatingIncome: opIncome,
        ebit,
        interestExpense: interest,
        incomeBeforeTax: preTax,
        incomeTaxExpense: tax,
        netIncome,
        ebitda,
      },
    };
  }

  const annual = [
    row(revTTM, fyEndDate(symbol, 0)),
    row(revTTM * 0.86, fyEndDate(symbol, 1)),
    row(revTTM * 0.71, fyEndDate(symbol, 2)),
    row(revTTM * 0.58, fyEndDate(symbol, 3)),
  ];
  const quarterly = [
    row(revTTM * 0.27, quarterEnd(symbol, 0)),
    row(revTTM * 0.26, quarterEnd(symbol, 1)),
    row(revTTM * 0.25, quarterEnd(symbol, 2)),
    row(revTTM * 0.22, quarterEnd(symbol, 3)),
  ];

  return { symbol, source: "seed", fields, annual, quarterly };
}

// ---------- Balance sheet ----------

export function generateBalance(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  const mcap = stats.marketCap;
  const revTTM = stats.revenueTTM ?? mcap * 0.05;
  const cash = stats.totalCash ?? mcap * 0.04;
  const debt = stats.totalDebt ?? mcap * 0.08;
  const totalAssets = mcap * 0.45 + debt;
  const totalLiab = totalAssets - mcap * 0.25;
  const totalEquity = totalAssets - totalLiab;

  const fields = [
    "cash",
    "shortTermInvestments",
    "netReceivables",
    "inventory",
    "totalCurrentAssets",
    "longTermInvestments",
    "propertyPlantEquipment",
    "goodWill",
    "intangibleAssets",
    "totalAssets",
    "accountsPayable",
    "shortLongTermDebt",
    "totalCurrentLiabilities",
    "longTermDebt",
    "totalLiab",
    "commonStock",
    "retainedEarnings",
    "totalStockholderEquity",
  ];

  function row(scale: number, endDate: string) {
    return {
      endDate,
      values: {
        cash: cash * scale,
        shortTermInvestments: cash * 0.4 * scale,
        netReceivables: revTTM * 0.12 * scale,
        inventory: revTTM * 0.05 * scale,
        totalCurrentAssets: (cash + revTTM * 0.2) * scale,
        longTermInvestments: cash * 0.3 * scale,
        propertyPlantEquipment: revTTM * 0.25 * scale,
        goodWill: totalAssets * 0.08 * scale,
        intangibleAssets: totalAssets * 0.05 * scale,
        totalAssets: totalAssets * scale,
        accountsPayable: revTTM * 0.05 * scale,
        shortLongTermDebt: debt * 0.2 * scale,
        totalCurrentLiabilities: revTTM * 0.18 * scale,
        longTermDebt: debt * 0.8 * scale,
        totalLiab: totalLiab * scale,
        commonStock: totalEquity * 0.05 * scale,
        retainedEarnings: totalEquity * 0.7 * scale,
        totalStockholderEquity: totalEquity * scale,
      },
    };
  }

  const annual = [
    row(1.0, fyEndDate(symbol, 0)),
    row(0.92, fyEndDate(symbol, 1)),
    row(0.81, fyEndDate(symbol, 2)),
    row(0.68, fyEndDate(symbol, 3)),
  ];
  const quarterly = [
    row(1.0, quarterEnd(symbol, 0)),
    row(0.97, quarterEnd(symbol, 1)),
    row(0.94, quarterEnd(symbol, 2)),
    row(0.9, quarterEnd(symbol, 3)),
  ];

  return { symbol, source: "seed", fields, annual, quarterly };
}

// ---------- Cash flow ----------

export function generateCashflow(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  const ni = stats.netIncomeTTM ?? (stats.revenueTTM ?? 1e9) * 0.18;
  const rev = stats.revenueTTM ?? 1e9;
  const mcap = stats.marketCap;
  const dividend = stats.dividendRate ?? 0;
  const sharesOut = stats.sharesOutstanding ?? mcap / 200;

  const fields = [
    "netIncome",
    "depreciation",
    "changeToOperatingActivities",
    "totalCashFromOperatingActivities",
    "capitalExpenditures",
    "investments",
    "totalCashflowsFromInvestingActivities",
    "dividendsPaid",
    "netBorrowings",
    "repurchaseOfStock",
    "totalCashFromFinancingActivities",
    "changeInCash",
  ];

  function row(scale: number, endDate: string) {
    const dep = rev * 0.04 * scale;
    const opCash = ni * 1.35 * scale;
    const capex = -rev * 0.1 * scale;
    const invest = -rev * 0.06 * scale;
    const totInv = capex + invest;
    const div = dividend > 0 ? -dividend * sharesOut * scale : 0;
    const netBorrow = mcap * 0.005 * scale;
    const repurchase = -mcap * 0.02 * scale;
    const totFin = div + netBorrow + repurchase;
    return {
      endDate,
      values: {
        netIncome: ni * scale,
        depreciation: dep,
        changeToOperatingActivities: rev * 0.02 * scale,
        totalCashFromOperatingActivities: opCash,
        capitalExpenditures: capex,
        investments: invest,
        totalCashflowsFromInvestingActivities: totInv,
        dividendsPaid: div,
        netBorrowings: netBorrow,
        repurchaseOfStock: repurchase,
        totalCashFromFinancingActivities: totFin,
        changeInCash: opCash + totInv + totFin,
      },
    };
  }

  const annual = [
    row(1.0, fyEndDate(symbol, 0)),
    row(0.85, fyEndDate(symbol, 1)),
    row(0.7, fyEndDate(symbol, 2)),
    row(0.58, fyEndDate(symbol, 3)),
  ];
  const quarterly = [
    row(0.27, quarterEnd(symbol, 0)),
    row(0.26, quarterEnd(symbol, 1)),
    row(0.25, quarterEnd(symbol, 2)),
    row(0.22, quarterEnd(symbol, 3)),
  ];

  return { symbol, source: "seed", fields, annual, quarterly };
}

// ---------- Earnings ----------

export function generateEarnings(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  const eps = stats.eps ?? 1.0;
  const rev = stats.revenueTTM ?? 1e9;
  const epsForward = stats.epsForward ?? eps * 1.1;

  // Build 8 quarters of estimate vs actual with realistic ±2% surprise.
  const surprises = [0.052, 0.038, 0.024, 0.041, 0.018, -0.012, 0.027, 0.033];
  const quarterly = surprises.map((s, i) => {
    const periodLabel = i === 0 ? "0q" : i === 1 ? "-1q" : i === 2 ? "-2q" : `-${i}q`;
    const quarterEps = eps * 0.27;
    return {
      quarter: quarterEnd(symbol, i),
      period: periodLabel,
      estimate: quarterEps,
      actual: quarterEps * (1 + s),
      surprisePct: s * 100,
    };
  });

  // 4-year revenue + earnings annual chart - anchored to the most recent
  // COMPLETED fiscal year so we never claim numbers for a year that hasn't
  // ended yet.
  const lastFy = mostRecentFyYear(symbol);
  const annual = [
    { year: lastFy - 3, revenue: rev * 0.58, earnings: rev * 0.58 * 0.14 },
    { year: lastFy - 2, revenue: rev * 0.71, earnings: rev * 0.71 * 0.16 },
    { year: lastFy - 1, revenue: rev * 0.86, earnings: rev * 0.86 * 0.18 },
    { year: lastFy, revenue: rev, earnings: rev * (stats.profitMargin ?? 0.18) },
  ];

  // Next earnings ~4-6 weeks out.
  const next = new Date();
  next.setDate(next.getDate() + 35);
  const nextDate = next.toISOString().slice(0, 10);

  return {
    symbol,
    source: "seed",
    next: {
      date: [nextDate],
      epsAvg: epsForward * 0.27,
      epsHigh: epsForward * 0.27 * 1.06,
      epsLow: epsForward * 0.27 * 0.93,
      revenueAvg: rev * 0.27,
    },
    quarterly,
    annual,
  };
}

// ---------- Analysts ----------

export function generateAnalysts(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  const target = stats.targetMeanPrice;
  if (target == null) return null;

  // Build 4 weeks of recommendation trend (most-recent first).
  const trend = [
    { period: "0m", strongBuy: 24, buy: 22, hold: 14, sell: 3, strongSell: 1 },
    { period: "-1m", strongBuy: 22, buy: 23, hold: 15, sell: 3, strongSell: 1 },
    { period: "-2m", strongBuy: 21, buy: 22, hold: 16, sell: 4, strongSell: 1 },
    { period: "-3m", strongBuy: 20, buy: 22, hold: 17, sell: 4, strongSell: 1 },
  ];

  // Sample upgrade history. Mix of real-looking firms.
  const firms = [
    "Goldman Sachs",
    "Morgan Stanley",
    "JPMorgan",
    "Bank of America",
    "Wells Fargo",
    "Citi",
    "Barclays",
    "UBS",
    "Deutsche Bank",
    "Bernstein",
    "Wedbush",
    "Mizuho",
    "Raymond James",
    "Piper Sandler",
    "Truist",
    "Evercore ISI",
    "Stifel",
    "Cantor Fitzgerald",
    "TD Cowen",
    "BMO Capital",
  ];
  const grades = ["Buy", "Overweight", "Outperform", "Hold", "Neutral", "Sell"];
  const actions = ["up", "main", "down", "init"];

  const upgrades = firms.map((firm, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i * 4 - 1);
    const fromGrade = grades[(i + 1) % grades.length];
    const toGrade = grades[i % grades.length];
    return {
      firm,
      fromGrade,
      toGrade,
      action: actions[i % actions.length],
      date: d.toISOString().slice(0, 10),
    };
  });

  return {
    symbol,
    source: "seed",
    target: {
      mean: target,
      median: stats.targetMedianPrice ?? target,
      high: stats.targetHighPrice ?? target * 1.18,
      low: stats.targetLowPrice ?? target * 0.78,
      analysts: stats.numberOfAnalystOpinions ?? 50,
      recommendationKey: stats.recommendationKey ?? "buy",
      recommendationMean: 1.8,
    },
    trend,
    upgrades,
  };
}

// ---------- Share statistics ----------

export function generateShareStats(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  return {
    symbol,
    source: "seed",
    sharesOutstanding: stats.sharesOutstanding ?? null,
    floatShares: stats.floatShares ?? null,
    heldPercentInsiders: stats.heldPercentInsiders ?? null,
    heldPercentInstitutions: stats.heldPercentInstitutions ?? null,
    institutionsCount: 4200,
    institutionsFloatPercentHeld:
      (stats.heldPercentInstitutions ?? 0.65) /
      Math.max(0.5, 1 - (stats.heldPercentInsiders ?? 0.05)),
  };
}

// ---------- Institutional + fund holders ----------

const TOP_INSTITUTIONS = [
  { organization: "Vanguard Group, Inc.", weight: 0.082 },
  { organization: "BlackRock, Inc.", weight: 0.071 },
  { organization: "State Street Corporation", weight: 0.041 },
  { organization: "FMR LLC (Fidelity)", weight: 0.038 },
  { organization: "Geode Capital Management", weight: 0.018 },
  { organization: "T. Rowe Price Associates", weight: 0.016 },
  { organization: "Capital Research Global Investors", weight: 0.014 },
  { organization: "Morgan Stanley Wealth Management", weight: 0.011 },
  { organization: "JPMorgan Chase & Co.", weight: 0.009 },
  { organization: "Bank of America Corp", weight: 0.008 },
];

const TOP_FUNDS = [
  { organization: "Vanguard Total Stock Mkt Idx Inv", weight: 0.028 },
  { organization: "Vanguard 500 Index Fund", weight: 0.026 },
  { organization: "SPDR S&P 500 ETF Trust", weight: 0.022 },
  { organization: "Invesco QQQ Trust", weight: 0.018 },
  { organization: "Fidelity 500 Index Fund", weight: 0.014 },
  { organization: "iShares Core S&P 500 ETF", weight: 0.012 },
  { organization: "Vanguard Growth Index Fund", weight: 0.009 },
  { organization: "iShares Core MSCI EAFE ETF", weight: 0.006 },
];

export function generateInstitutional(symbol: string) {
  const stats = STATS_SEED[symbol];
  const seed = getSeedQuote(symbol);
  if (!stats || !seed) return null;
  const sharesOut = stats.sharesOutstanding ?? stats.marketCap / seed.price;

  const reportDate = quarterEnd(symbol, 1);
  const institutional = TOP_INSTITUTIONS.map((h) => ({
    organization: h.organization,
    pctHeld: h.weight,
    position: sharesOut * h.weight,
    value: sharesOut * h.weight * seed.price,
    reportDate,
  }));
  const funds = TOP_FUNDS.map((h) => ({
    organization: h.organization,
    pctHeld: h.weight,
    position: sharesOut * h.weight,
    value: sharesOut * h.weight * seed.price,
    reportDate,
  }));
  return { symbol, source: "seed", institutional, funds };
}

// ---------- Insider transactions ----------

export function generateInsider(symbol: string) {
  const stats = STATS_SEED[symbol];
  const seed = getSeedQuote(symbol);
  const profile = PROFILE_SEED[symbol];
  if (!stats || !seed) return null;

  const insiders = profile?.officers
    ?.slice(0, 6)
    .map((o) => ({ name: o.name ?? "Insider", relation: o.title ?? "Officer" })) ?? [
    { name: "Jane Doe", relation: "Director" },
    { name: "John Smith", relation: "Officer" },
    { name: "Sarah Lee", relation: "Director" },
    { name: "Michael Chen", relation: "Officer" },
  ];

  const sharesOut = stats.sharesOutstanding ?? 1e9;
  const transactions: Array<{
    name?: string;
    relation?: string;
    transactionText?: string;
    shares: number;
    value: number;
    date: string;
  }> = [];
  for (let i = 0; i < 12; i++) {
    const ins = insiders[i % insiders.length];
    const isSale = i % 3 !== 0;
    const shares = Math.round(sharesOut * 0.00006 * (i % 3 + 1));
    const date = new Date();
    date.setDate(date.getDate() - i * 9 - 5);
    transactions.push({
      name: ins.name,
      relation: ins.relation,
      transactionText: isSale ? "Sale - Plan rule 10b5-1" : "Option Exercise",
      shares,
      value: shares * seed.price * (isSale ? 1 : 0.6),
      date: date.toISOString().slice(0, 10),
    });
  }

  const holders = insiders.map((ins, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 30 - 30);
    const heldShares = sharesOut * 0.0008 * (1 + (insiders.length - i) * 0.4);
    return {
      name: ins.name,
      relation: ins.relation,
      mostRecent: date.toISOString().slice(0, 10),
      shares: heldShares,
      value: heldShares * seed.price,
    };
  });

  // Net activity (6m)
  const buyCount = 4;
  const sellCount = 8;
  const buyShares = sharesOut * 0.00006 * 4;
  const sellShares = sharesOut * 0.00012 * 8;
  return {
    symbol,
    source: "seed",
    transactions,
    holders,
    netActivity: {
      buyInfoShares: buyShares,
      buyInfoCount: buyCount,
      sellInfoShares: sellShares,
      sellInfoCount: sellCount,
      netInfoShares: buyShares - sellShares,
      netInfoCount: buyCount - sellCount,
      totalInsiderShares: sharesOut * (stats.heldPercentInsiders ?? 0.04),
    },
  };
}

// ---------- Dividends ----------

export function generateDividends(symbol: string) {
  const stats = STATS_SEED[symbol];
  if (!stats) return null;
  const rate = stats.dividendRate;
  if (!rate || rate <= 0) return { symbol, source: "seed", dividends: [] };

  const quarterly = rate / 4;
  const dividends: Array<{ date: string; amount: number }> = [];
  for (let q = 0; q < 16; q++) {
    const d = new Date();
    d.setMonth(d.getMonth() - q * 3 - 1);
    dividends.push({
      date: d.toISOString().slice(0, 10),
      amount: quarterly * (1 - q * 0.03),
    });
  }
  return { symbol, source: "seed", dividends };
}

// ---------- Splits ----------

const KNOWN_SPLITS: Record<string, Array<{ date: string; ratio: string; numerator: number; denominator: number }>> = {
  NVDA: [
    { date: "2024-06-10", ratio: "10:1", numerator: 10, denominator: 1 },
    { date: "2021-07-20", ratio: "4:1", numerator: 4, denominator: 1 },
    { date: "2007-09-11", ratio: "3:2", numerator: 3, denominator: 2 },
    { date: "2006-04-07", ratio: "2:1", numerator: 2, denominator: 1 },
  ],
  AAPL: [
    { date: "2020-08-31", ratio: "4:1", numerator: 4, denominator: 1 },
    { date: "2014-06-09", ratio: "7:1", numerator: 7, denominator: 1 },
    { date: "2005-02-28", ratio: "2:1", numerator: 2, denominator: 1 },
    { date: "2000-06-21", ratio: "2:1", numerator: 2, denominator: 1 },
  ],
  TSLA: [
    { date: "2022-08-25", ratio: "3:1", numerator: 3, denominator: 1 },
    { date: "2020-08-31", ratio: "5:1", numerator: 5, denominator: 1 },
  ],
  AMZN: [{ date: "2022-06-06", ratio: "20:1", numerator: 20, denominator: 1 }],
  GOOG: [{ date: "2022-07-18", ratio: "20:1", numerator: 20, denominator: 1 }],
};

export function generateSplits(symbol: string) {
  return { symbol, source: "seed", splits: KNOWN_SPLITS[symbol] ?? [] };
}

// ---------- Options ----------

export function generateOptions(symbol: string, expirationISO?: string) {
  const seed = getSeedQuote(symbol);
  const stats = STATS_SEED[symbol];
  if (!seed) return null;

  // Build 6 expirations: nearest weekly + monthly Fridays.
  const expirations: string[] = [];
  const today = new Date();
  for (let weeks = 1; weeks <= 6; weeks++) {
    const d = new Date(today);
    const daysAhead = (5 - d.getDay() + 7) % 7 || 7; // next Friday
    d.setDate(d.getDate() + daysAhead + (weeks - 1) * 7);
    expirations.push(d.toISOString().slice(0, 10));
  }
  const expiration = expirationISO && expirations.includes(expirationISO) ? expirationISO : expirations[0];
  const expEpoch = Math.floor(new Date(expiration + "T16:00:00Z").getTime() / 1000);

  const px = seed.price;
  // Strikes: 10 at $5/$10/$25/$50 increments around current price based on price level.
  const step = px > 500 ? 25 : px > 100 ? 10 : px > 25 ? 5 : 1;
  const numStrikes = 12;
  const strikes: number[] = [];
  for (let i = -Math.floor(numStrikes / 2); i <= Math.floor(numStrikes / 2); i++) {
    strikes.push(Math.round((px + i * step) / step) * step);
  }

  const ivBase = stats?.beta ? 0.25 + Math.min(0.4, stats.beta * 0.06) : 0.32;

  function makeContract(strike: number, side: "C" | "P") {
    const moneyness = side === "C" ? Math.max(0, px - strike) : Math.max(0, strike - px);
    const intrinsic = moneyness;
    const distance = Math.abs(strike - px) / px;
    const time = Math.max(0.04, (expEpoch - Date.now() / 1000) / (365 * 86400));
    const extrinsic = px * ivBase * Math.sqrt(time) * Math.exp(-distance * 4) * 0.4;
    const last = +(intrinsic + extrinsic).toFixed(2);
    const bidAskSpread = Math.max(0.05, last * 0.04);
    const bid = +Math.max(0, last - bidAskSpread).toFixed(2);
    const ask = +(last + bidAskSpread).toFixed(2);
    const volume = Math.max(0, Math.round(2000 * Math.exp(-distance * 6)));
    const openInterest = Math.max(0, Math.round(volume * 8));
    const iv = ivBase + distance * 0.45 - (side === "P" ? 0.02 : 0);
    const inTheMoney = side === "C" ? px > strike : px < strike;
    return {
      contractSymbol: `${symbol}${expiration.replaceAll("-", "").slice(2)}${side}${String(
        Math.round(strike * 1000)
      ).padStart(8, "0")}`,
      strike,
      lastPrice: last,
      bid,
      ask,
      volume,
      openInterest,
      impliedVolatility: iv,
      inTheMoney,
      expiration,
    };
  }

  const calls = strikes.map((s) => makeContract(s, "C"));
  const puts = strikes.map((s) => makeContract(s, "P"));

  return { symbol, source: "seed", expirations, expiration, calls, puts };
}

// ---------- News ----------

const NEWS_TEMPLATES: Array<{ title: string; publisher: string; type?: string }> = [
  { title: "{NAME} reports stronger-than-expected results, lifts guidance", publisher: "Reuters" },
  { title: "Analyst note: {SYMBOL} margin trajectory remains intact into next quarter", publisher: "MarketWatch" },
  { title: "{SYMBOL} sees continued institutional inflows as sector rotation favors quality names", publisher: "Bloomberg" },
  { title: "Why {NAME} could be a long-term winner - five reasons", publisher: "The Motley Fool" },
  { title: "{NAME} CEO commentary signals confidence on multi-quarter pipeline", publisher: "CNBC" },
  { title: "{NAME} expands product roadmap; analysts watching execution", publisher: "Seeking Alpha" },
  { title: "Options flow on {SYMBOL} skews bullish into upcoming earnings", publisher: "Benzinga" },
  { title: "{NAME} cleared key technical resistance at fresh 52-week high", publisher: "Investor's Business Daily" },
  { title: "{SYMBOL} short interest steady; institutions remain net buyers", publisher: "WSJ" },
  { title: "{SYMBOL} closes higher as broader market reclaims key moving averages", publisher: "Yahoo Finance" },
  { title: "Institutional ownership in {NAME} hit a fresh 6-quarter high", publisher: "Reuters" },
  { title: "{NAME} earnings preview: what to watch in the next print", publisher: "MarketWatch" },
];

export function generateNews(symbol: string) {
  const profile = PROFILE_SEED[symbol];
  const name = profile?.shortName ?? profile?.longName ?? symbol;
  const news = NEWS_TEMPLATES.map((t, i) => {
    const ts = Math.floor(Date.now() / 1000) - i * 4200 - 600;
    return {
      title: t.title.replaceAll("{NAME}", name).replaceAll("{SYMBOL}", symbol),
      publisher: t.publisher,
      link: `https://finance.yahoo.com/quote/${symbol}/news`,
      providerPublishTime: ts,
      type: t.type ?? "STORY",
      relatedTickers: [symbol],
      thumbnail: null,
    };
  });
  return { symbol, source: "seed", news };
}

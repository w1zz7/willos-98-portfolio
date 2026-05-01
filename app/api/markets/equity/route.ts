/**
 * Equity research proxy (markets module).
 *
 * One endpoint dispatched by ?module=<name> so the UI can hit a wide
 * research surface without 20+ individual route files:
 *
 *   profile        company name, sector, industry, executives
 *   statistics     valuation, margins, share + analyst stats
 *   income         income statement (annual + quarterly)
 *   balance        balance sheet (annual + quarterly)
 *   cashflow       cash-flow statement (annual + quarterly)
 *   dividends      historical dividend payments
 *   splits         historical splits
 *   earnings       EPS history + next earnings event
 *   analysts       price target consensus, rec trend, upgrades/downgrades
 *   institutional  top institutional + mutual-fund holders
 *   insider        insider transactions + holder list
 *   share_stats    shares outstanding, float, % insiders/institutions
 *   options        calls/puts chain by expiration
 *   news           latest 15 company headlines
 *   search         ticker / company-name autocomplete
 *   gainers        Yahoo screener day_gainers
 *   losers         Yahoo screener day_losers
 *   active         Yahoo screener most_actives
 *   peers          sector reference (limited without paid keys)
 *
 * Yahoo's quoteSummary is gated by a "crumb" CSRF token now, so we seed
 * cookies via fc.yahoo.com → fetch the crumb from query2 → use both on
 * subsequent requests. All endpoints retry once on 429 with a brief backoff.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getProfileSeed,
  getStatsSeed,
  buildScreenerRows,
} from "@/lib/equityFallback";
import { SEED_QUOTES } from "@/lib/marketsFallback";
import {
  generateIncome,
  generateBalance,
  generateCashflow,
  generateEarnings,
  generateAnalysts,
  generateShareStats,
  generateInstitutional,
  generateInsider,
  generateDividends,
  generateSplits,
  generateOptions,
  generateNews,
} from "@/lib/equityModuleFallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ---------- Yahoo session (cookies + crumb) ----------

let cookieJar: string | null = null;
let crumb: string | null = null;
let sessionFetchedAt = 0;
const SESSION_TTL_MS = 30 * 60 * 1000;

async function ensureYahooSession(): Promise<{ cookie: string | null; crumb: string | null }> {
  if (cookieJar && crumb && Date.now() - sessionFetchedAt < SESSION_TTL_MS) {
    return { cookie: cookieJar, crumb };
  }
  try {
    // 1. Cookies
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const all =
      typeof (cookieRes.headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie === "function"
        ? (cookieRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [cookieRes.headers.get("set-cookie") ?? ""].filter(Boolean);
    cookieJar = all.map((c) => c.split(";")[0]).filter(Boolean).join("; ") || null;

    // 2. Crumb (only used by quoteSummary). If this fails, we still return
    //    cookies - most endpoints work without crumb.
    if (cookieJar) {
      const crumbRes = await fetch(
        "https://query2.finance.yahoo.com/v1/test/getcrumb",
        { headers: { "User-Agent": UA, Cookie: cookieJar } }
      );
      if (crumbRes.ok) {
        const t = await crumbRes.text();
        crumb = t && !t.startsWith("<") ? t.trim() : null;
      }
    }
    sessionFetchedAt = Date.now();
  } catch {
    /* keep stale or null */
  }
  return { cookie: cookieJar, crumb };
}

async function yahooFetch(
  url: string,
  init?: RequestInit & { needCrumb?: boolean }
): Promise<unknown | null> {
  const { cookie, crumb: c } = await ensureYahooSession();
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (cookie) headers.Cookie = cookie;
  let target = url;
  if (init?.needCrumb && c) {
    target += (target.includes("?") ? "&" : "?") + "crumb=" + encodeURIComponent(c);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(target, { ...init, headers });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 350 + attempt * 600));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      // retry
    }
  }
  return null;
}

// ---------- helpers ----------

interface YahooSummary {
  quoteSummary?: {
    result?: Array<Record<string, unknown>>;
    error?: unknown;
  };
}

interface RawNum {
  raw?: number;
  fmt?: string;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "raw" in (v as object)) {
    const r = (v as RawNum).raw;
    return typeof r === "number" ? r : null;
  }
  return null;
}

async function quoteSummary(symbol: string, modules: string[]): Promise<Record<string, unknown> | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol
  )}?modules=${modules.join(",")}`;
  const data = (await yahooFetch(url, { needCrumb: true })) as YahooSummary | null;
  return data?.quoteSummary?.result?.[0] ?? null;
}

// ---------- module dispatch ----------

function profileFromSeed(symbol: string): Record<string, unknown> | null {
  const seed = getProfileSeed(symbol);
  if (!seed) return null;
  return {
    symbol,
    source: "seed",
    longName: seed.longName,
    shortName: seed.shortName,
    sector: seed.sector,
    industry: seed.industry,
    website: seed.website ?? null,
    summary: seed.summary,
    employees: seed.employees ?? null,
    country: seed.country ?? null,
    city: seed.city ?? null,
    state: seed.state ?? null,
    address: null,
    phone: seed.phone ?? null,
    exchange: seed.exchange,
    currency: seed.currency,
    marketCap: seed.marketCap,
    quoteType: seed.quoteType,
    officers: (seed.officers ?? []).map((o) => ({
      name: o.name,
      title: o.title,
      age: o.age ?? null,
      yearBorn: o.yearBorn ?? null,
      totalPay: o.totalPay ?? null,
      exercisedValue: null,
      unexercisedValue: null,
    })),
  };
}

async function modProfile(symbol: string) {
  const r = await quoteSummary(symbol, ["assetProfile", "summaryProfile", "price", "summaryDetail"]);
  if (!r) {
    const fallback = profileFromSeed(symbol);
    if (fallback) return fallback;
    return { error: "no data" };
  }
  const p = (r.assetProfile ?? r.summaryProfile ?? {}) as Record<string, unknown>;
  const price = (r.price ?? {}) as Record<string, unknown>;
  const detail = (r.summaryDetail ?? {}) as Record<string, unknown>;
  return {
    symbol,
    longName: (price.longName as string | undefined) ?? null,
    shortName: (price.shortName as string | undefined) ?? null,
    sector: (p.sector as string | undefined) ?? null,
    industry: (p.industry as string | undefined) ?? null,
    website: (p.website as string | undefined) ?? null,
    summary: (p.longBusinessSummary as string | undefined) ?? null,
    employees: num(p.fullTimeEmployees),
    country: (p.country as string | undefined) ?? null,
    city: (p.city as string | undefined) ?? null,
    state: (p.state as string | undefined) ?? null,
    address: (p.address1 as string | undefined) ?? null,
    phone: (p.phone as string | undefined) ?? null,
    exchange: (price.exchangeName as string | undefined) ?? null,
    currency: (price.currency as string | undefined) ?? null,
    marketCap: num(price.marketCap) ?? num(detail.marketCap),
    quoteType: (price.quoteType as string | undefined) ?? null,
    officers:
      Array.isArray(p.companyOfficers)
        ? (p.companyOfficers as Array<Record<string, unknown>>).map((o) => ({
            name: o.name as string | undefined,
            title: o.title as string | undefined,
            age: num(o.age),
            yearBorn: num(o.yearBorn),
            totalPay: num(o.totalPay),
            exercisedValue: num(o.exercisedValue),
            unexercisedValue: num(o.unexercisedValue),
          }))
        : [],
  };
}

function statsFromSeed(symbol: string): Record<string, unknown> | null {
  const seed = getStatsSeed(symbol);
  if (!seed) return null;
  return {
    symbol,
    source: "seed",
    marketCap: seed.marketCap,
    enterpriseValue: seed.enterpriseValue ?? null,
    trailingPE: seed.trailingPE ?? null,
    forwardPE: seed.forwardPE ?? null,
    pegRatio: seed.pegRatio ?? null,
    priceToBook: seed.priceToBook ?? null,
    priceToSales: seed.priceToSales ?? null,
    enterpriseToRevenue: seed.enterpriseToRevenue ?? null,
    enterpriseToEbitda: seed.enterpriseToEbitda ?? null,
    profitMargin: seed.profitMargin ?? null,
    operatingMargin: seed.operatingMargin ?? null,
    grossMargin: seed.grossMargin ?? null,
    returnOnEquity: seed.returnOnEquity ?? null,
    returnOnAssets: seed.returnOnAssets ?? null,
    revenueTTM: seed.revenueTTM ?? null,
    grossProfit: seed.grossProfit ?? null,
    ebitda: seed.ebitda ?? null,
    netIncomeTTM: seed.netIncomeTTM ?? null,
    eps: seed.eps ?? null,
    epsForward: seed.epsForward ?? null,
    bookValue: seed.bookValue ?? null,
    sharesOutstanding: seed.sharesOutstanding ?? null,
    floatShares: seed.floatShares ?? null,
    sharesShort: seed.sharesShort ?? null,
    shortRatio: seed.shortRatio ?? null,
    shortPercentOfFloat: seed.shortPercentOfFloat ?? null,
    heldPercentInsiders: seed.heldPercentInsiders ?? null,
    heldPercentInstitutions: seed.heldPercentInstitutions ?? null,
    beta: seed.beta ?? null,
    fiftyTwoWeekHigh: seed.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: seed.fiftyTwoWeekLow ?? null,
    fiftyDayAverage: seed.fiftyDayAverage ?? null,
    twoHundredDayAverage: seed.twoHundredDayAverage ?? null,
    averageVolume10Day: seed.averageVolume10Day ?? null,
    dividendYield: seed.dividendYield ?? null,
    dividendRate: seed.dividendRate ?? null,
    payoutRatio: seed.payoutRatio ?? null,
    targetMeanPrice: seed.targetMeanPrice ?? null,
    targetMedianPrice: seed.targetMedianPrice ?? null,
    targetHighPrice: seed.targetHighPrice ?? null,
    targetLowPrice: seed.targetLowPrice ?? null,
    recommendationKey: seed.recommendationKey ?? null,
    numberOfAnalystOpinions: seed.numberOfAnalystOpinions ?? null,
    totalCash: seed.totalCash ?? null,
    totalDebt: seed.totalDebt ?? null,
    debtToEquity: seed.debtToEquity ?? null,
    currentRatio: seed.currentRatio ?? null,
    quickRatio: seed.quickRatio ?? null,
  };
}

async function modStatistics(symbol: string) {
  const r = await quoteSummary(symbol, [
    "defaultKeyStatistics",
    "summaryDetail",
    "financialData",
    "price",
  ]);
  if (!r) {
    const fallback = statsFromSeed(symbol);
    if (fallback) return fallback;
    return { error: "no data" };
  }
  const ks = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const sd = (r.summaryDetail ?? {}) as Record<string, unknown>;
  const fd = (r.financialData ?? {}) as Record<string, unknown>;
  const px = (r.price ?? {}) as Record<string, unknown>;
  return {
    symbol,
    marketCap: num(px.marketCap) ?? num(sd.marketCap),
    enterpriseValue: num(ks.enterpriseValue),
    trailingPE: num(sd.trailingPE),
    forwardPE: num(sd.forwardPE) ?? num(ks.forwardPE),
    pegRatio: num(ks.pegRatio),
    priceToBook: num(ks.priceToBook),
    priceToSales: num(sd.priceToSalesTrailing12Months),
    enterpriseToRevenue: num(ks.enterpriseToRevenue),
    enterpriseToEbitda: num(ks.enterpriseToEbitda),
    profitMargin: num(ks.profitMargins),
    operatingMargin: num(fd.operatingMargins),
    grossMargin: num(fd.grossMargins),
    returnOnEquity: num(fd.returnOnEquity),
    returnOnAssets: num(fd.returnOnAssets),
    revenueTTM: num(fd.totalRevenue),
    grossProfit: num(fd.grossProfits),
    ebitda: num(fd.ebitda),
    netIncomeTTM: num(ks.netIncomeToCommon),
    eps: num(ks.trailingEps) ?? num(sd.trailingEps),
    epsForward: num(ks.forwardEps),
    bookValue: num(ks.bookValue),
    sharesOutstanding: num(ks.sharesOutstanding),
    floatShares: num(ks.floatShares),
    sharesShort: num(ks.sharesShort),
    shortRatio: num(ks.shortRatio),
    shortPercentOfFloat: num(ks.shortPercentOfFloat),
    heldPercentInsiders: num(ks.heldPercentInsiders),
    heldPercentInstitutions: num(ks.heldPercentInstitutions),
    beta: num(sd.beta) ?? num(ks.beta),
    fiftyTwoWeekHigh: num(sd.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(sd.fiftyTwoWeekLow),
    fiftyDayAverage: num(sd.fiftyDayAverage),
    twoHundredDayAverage: num(sd.twoHundredDayAverage),
    averageVolume10Day: num(sd.averageVolume10days),
    dividendYield: num(sd.dividendYield) ?? num(sd.trailingAnnualDividendYield),
    dividendRate: num(sd.dividendRate) ?? num(sd.trailingAnnualDividendRate),
    payoutRatio: num(sd.payoutRatio),
    targetMeanPrice: num(fd.targetMeanPrice),
    targetMedianPrice: num(fd.targetMedianPrice),
    targetHighPrice: num(fd.targetHighPrice),
    targetLowPrice: num(fd.targetLowPrice),
    recommendationKey: (fd.recommendationKey as string | undefined) ?? null,
    numberOfAnalystOpinions: num(fd.numberOfAnalystOpinions),
    totalCash: num(fd.totalCash),
    totalDebt: num(fd.totalDebt),
    debtToEquity: num(fd.debtToEquity),
    currentRatio: num(fd.currentRatio),
    quickRatio: num(fd.quickRatio),
  };
}

interface FinancialRow {
  endDate: string;
  values: Record<string, number | null>;
}

function flattenStatement(
  history: unknown,
  fields: string[]
): FinancialRow[] {
  if (!Array.isArray(history)) return [];
  return history.map((row) => {
    const r = row as Record<string, unknown>;
    const endDateRaw = r.endDate as RawNum | undefined;
    const endDate =
      endDateRaw?.fmt ??
      (typeof endDateRaw?.raw === "number"
        ? new Date(endDateRaw.raw * 1000).toISOString().slice(0, 10)
        : "");
    const values: Record<string, number | null> = {};
    for (const f of fields) values[f] = num(r[f]);
    return { endDate, values };
  });
}

async function modIncome(symbol: string) {
  const r = await quoteSummary(symbol, ["incomeStatementHistory", "incomeStatementHistoryQuarterly"]);
  if (!r) {
    const seed = generateIncome(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
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
  const annual = (r.incomeStatementHistory as Record<string, unknown> | undefined)?.incomeStatementHistory;
  const quarterly = (r.incomeStatementHistoryQuarterly as Record<string, unknown> | undefined)?.incomeStatementHistory;
  return {
    symbol,
    fields,
    annual: flattenStatement(annual, fields),
    quarterly: flattenStatement(quarterly, fields),
  };
}

async function modBalance(symbol: string) {
  const r = await quoteSummary(symbol, ["balanceSheetHistory", "balanceSheetHistoryQuarterly"]);
  if (!r) {
    const seed = generateBalance(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
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
  const annual = (r.balanceSheetHistory as Record<string, unknown> | undefined)?.balanceSheetStatements;
  const quarterly = (r.balanceSheetHistoryQuarterly as Record<string, unknown> | undefined)?.balanceSheetStatements;
  return {
    symbol,
    fields,
    annual: flattenStatement(annual, fields),
    quarterly: flattenStatement(quarterly, fields),
  };
}

async function modCashflow(symbol: string) {
  const r = await quoteSummary(symbol, ["cashflowStatementHistory", "cashflowStatementHistoryQuarterly"]);
  if (!r) {
    const seed = generateCashflow(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
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
  const annual = (r.cashflowStatementHistory as Record<string, unknown> | undefined)?.cashflowStatements;
  const quarterly = (r.cashflowStatementHistoryQuarterly as Record<string, unknown> | undefined)?.cashflowStatements;
  return {
    symbol,
    fields,
    annual: flattenStatement(annual, fields),
    quarterly: flattenStatement(quarterly, fields),
  };
}

async function modEarnings(symbol: string) {
  const r = await quoteSummary(symbol, [
    "earnings",
    "earningsHistory",
    "earningsTrend",
    "calendarEvents",
  ]);
  if (!r) {
    const seed = generateEarnings(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
  const e = (r.earnings as Record<string, unknown>) ?? {};
  const eh = (r.earningsHistory as Record<string, unknown>) ?? {};
  const cal = (r.calendarEvents as Record<string, unknown>) ?? {};
  const calEarnings = (cal.earnings as Record<string, unknown>) ?? {};
  return {
    symbol,
    next: {
      date:
        Array.isArray(calEarnings.earningsDate)
          ? (calEarnings.earningsDate as RawNum[])
              .map((d) => (d.raw ? new Date(d.raw * 1000).toISOString().slice(0, 10) : null))
              .filter(Boolean)
          : [],
      epsAvg: num((calEarnings as Record<string, unknown>).earningsAverage),
      epsHigh: num((calEarnings as Record<string, unknown>).earningsHigh),
      epsLow: num((calEarnings as Record<string, unknown>).earningsLow),
      revenueAvg: num((calEarnings as Record<string, unknown>).revenueAverage),
    },
    quarterly:
      Array.isArray((eh.history as unknown[]) ?? [])
        ? ((eh.history as Array<Record<string, unknown>>) ?? []).map((h) => ({
            quarter: (h.quarter as RawNum)?.fmt ?? null,
            period: h.period as string | undefined,
            estimate: num(h.epsEstimate),
            actual: num(h.epsActual),
            surprisePct: num(h.surprisePercent),
          }))
        : [],
    annual:
      Array.isArray(((e.financialsChart as Record<string, unknown>)?.yearly as unknown[]) ?? [])
        ? (((e.financialsChart as Record<string, unknown>)?.yearly as Array<Record<string, unknown>>) ?? []).map(
            (y) => ({
              year: num(y.date),
              revenue: num(y.revenue),
              earnings: num(y.earnings),
            })
          )
        : [],
  };
}

async function modAnalysts(symbol: string) {
  const r = await quoteSummary(symbol, [
    "financialData",
    "recommendationTrend",
    "upgradeDowngradeHistory",
  ]);
  if (!r) {
    const seed = generateAnalysts(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
  const fd = (r.financialData as Record<string, unknown>) ?? {};
  const rec = (r.recommendationTrend as Record<string, unknown>) ?? {};
  const ud = (r.upgradeDowngradeHistory as Record<string, unknown>) ?? {};
  return {
    symbol,
    target: {
      mean: num(fd.targetMeanPrice),
      median: num(fd.targetMedianPrice),
      high: num(fd.targetHighPrice),
      low: num(fd.targetLowPrice),
      analysts: num(fd.numberOfAnalystOpinions),
      recommendationKey: (fd.recommendationKey as string | undefined) ?? null,
      recommendationMean: num(fd.recommendationMean),
    },
    trend: Array.isArray(rec.trend)
      ? (rec.trend as Array<Record<string, unknown>>).map((t) => ({
          period: t.period as string | undefined,
          strongBuy: num(t.strongBuy),
          buy: num(t.buy),
          hold: num(t.hold),
          sell: num(t.sell),
          strongSell: num(t.strongSell),
        }))
      : [],
    upgrades: Array.isArray(ud.history)
      ? (ud.history as Array<Record<string, unknown>>).slice(0, 30).map((u) => {
          const epoch = num(u.epochGradeDate);
          return {
            firm: u.firm as string | undefined,
            toGrade: u.toGrade as string | undefined,
            fromGrade: u.fromGrade as string | undefined,
            action: u.action as string | undefined,
            date: epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : null,
          };
        })
      : [],
  };
}

async function modOwnership(symbol: string, kind: "institutional" | "insider" | "share_stats") {
  if (kind === "share_stats") {
    const r = await quoteSummary(symbol, ["defaultKeyStatistics", "majorHoldersBreakdown"]);
    if (!r) {
      const seed = generateShareStats(symbol);
      if (seed) return seed;
      return { error: "no data" };
    }
    const ks = (r.defaultKeyStatistics as Record<string, unknown>) ?? {};
    const mh = (r.majorHoldersBreakdown as Record<string, unknown>) ?? {};
    return {
      symbol,
      sharesOutstanding: num(ks.sharesOutstanding),
      floatShares: num(ks.floatShares),
      heldPercentInsiders: num(mh.insidersPercentHeld) ?? num(ks.heldPercentInsiders),
      heldPercentInstitutions:
        num(mh.institutionsPercentHeld) ?? num(ks.heldPercentInstitutions),
      institutionsCount: num(mh.institutionsCount),
      institutionsFloatPercentHeld: num(mh.institutionsFloatPercentHeld),
    };
  }
  if (kind === "institutional") {
    const r = await quoteSummary(symbol, ["institutionOwnership", "fundOwnership"]);
    if (!r) {
      const seed = generateInstitutional(symbol);
      if (seed) return seed;
      return { error: "no data" };
    }
    const inst = ((r.institutionOwnership as Record<string, unknown>) ?? {}).ownershipList ?? [];
    const fund = ((r.fundOwnership as Record<string, unknown>) ?? {}).ownershipList ?? [];
    const map = (rows: unknown) =>
      Array.isArray(rows)
        ? (rows as Array<Record<string, unknown>>).map((o) => ({
            organization: o.organization as string | undefined,
            pctHeld: num(o.pctHeld),
            position: num(o.position),
            value: num(o.value),
            reportDate: (o.reportDate as RawNum)?.fmt ?? null,
          }))
        : [];
    return { symbol, institutional: map(inst), funds: map(fund) };
  }
  // insider
  const r = await quoteSummary(symbol, ["insiderTransactions", "insiderHolders", "netSharePurchaseActivity"]);
  if (!r) {
    const seed = generateInsider(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
  const tx = ((r.insiderTransactions as Record<string, unknown>) ?? {}).transactions ?? [];
  const holders = ((r.insiderHolders as Record<string, unknown>) ?? {}).holders ?? [];
  const net = (r.netSharePurchaseActivity as Record<string, unknown>) ?? {};
  return {
    symbol,
    transactions: Array.isArray(tx)
      ? (tx as Array<Record<string, unknown>>).slice(0, 40).map((t) => ({
          name: t.filerName as string | undefined,
          relation: t.filerRelation as string | undefined,
          transactionText: t.transactionText as string | undefined,
          shares: num(t.shares),
          value: num(t.value),
          date: (t.startDate as RawNum)?.fmt ?? null,
        }))
      : [],
    holders: Array.isArray(holders)
      ? (holders as Array<Record<string, unknown>>).slice(0, 20).map((h) => ({
          name: h.name as string | undefined,
          relation: h.relation as string | undefined,
          mostRecent: (h.latestTransDate as RawNum)?.fmt ?? null,
          shares: num(h.positionDirect),
          value: num(h.positionDirectValue),
        }))
      : [],
    netActivity: {
      buyInfoShares: num(net.buyInfoShares),
      buyInfoCount: num(net.buyInfoCount),
      sellInfoShares: num(net.sellInfoShares),
      sellInfoCount: num(net.sellInfoCount),
      netInfoShares: num(net.netInfoShares),
      netInfoCount: num(net.netInfoCount),
      totalInsiderShares: num(net.totalInsiderShares),
    },
  };
}

async function modDividendsSplits(symbol: string, kind: "div" | "split") {
  // Use the v8 chart `events=div|split` endpoint.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=10y&interval=1d&events=${kind === "div" ? "div" : "split"}`;
  const data = (await yahooFetch(url)) as
    | { chart?: { result?: Array<{ events?: { dividends?: Record<string, unknown>; splits?: Record<string, unknown> } }> } }
    | null;
  const result = data?.chart?.result?.[0];
  if (!result) {
    const seed = kind === "div" ? generateDividends(symbol) : generateSplits(symbol);
    if (seed) return seed;
    return { error: "no data" };
  }
  if (kind === "div") {
    const events = result.events?.dividends ?? {};
    const items = Object.values(events) as Array<Record<string, unknown>>;
    return {
      symbol,
      dividends: items
        .map((d) => ({
          date: typeof d.date === "number" ? new Date((d.date as number) * 1000).toISOString().slice(0, 10) : null,
          amount: num(d.amount),
        }))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, 60),
    };
  }
  const events = result.events?.splits ?? {};
  const items = Object.values(events) as Array<Record<string, unknown>>;
  return {
    symbol,
    splits: items
      .map((s) => ({
        date: typeof s.date === "number" ? new Date((s.date as number) * 1000).toISOString().slice(0, 10) : null,
        ratio: s.splitRatio as string | undefined,
        numerator: num(s.numerator),
        denominator: num(s.denominator),
      }))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
  };
}

async function modOptions(symbol: string, expiration?: string) {
  // Yahoo's options endpoint expects `date=<unix-seconds>`, not an ISO date.
  // The UI sends "YYYY-MM-DD" - convert here so the user's expiration pick
  // actually filters the chain.
  let dateParam = "";
  if (expiration) {
    const ts = Date.parse(expiration + "T00:00:00Z");
    if (!Number.isNaN(ts)) dateParam = String(Math.floor(ts / 1000));
  }
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(
    symbol
  )}${dateParam ? "?date=" + dateParam : ""}`;
  const data = (await yahooFetch(url)) as
    | { optionChain?: { result?: Array<Record<string, unknown>> } }
    | null;
  const r = data?.optionChain?.result?.[0];
  if (!r) {
    const seed = generateOptions(symbol, expiration);
    if (seed) return seed;
    return { error: "no data" };
  }
  const expirationDates = (r.expirationDates as number[] | undefined) ?? [];
  const opt = (Array.isArray(r.options) ? (r.options as Record<string, unknown>[])[0] : null) ?? null;
  const mapContract = (rows: unknown) =>
    Array.isArray(rows)
      ? (rows as Array<Record<string, unknown>>).map((c) => ({
          contractSymbol: c.contractSymbol as string | undefined,
          strike: num(c.strike),
          lastPrice: num(c.lastPrice),
          bid: num(c.bid),
          ask: num(c.ask),
          volume: num(c.volume),
          openInterest: num(c.openInterest),
          impliedVolatility: num(c.impliedVolatility),
          inTheMoney: c.inTheMoney as boolean | undefined,
          expiration:
            num(c.expiration) != null
              ? new Date((num(c.expiration) as number) * 1000).toISOString().slice(0, 10)
              : null,
        }))
      : [];
  return {
    symbol,
    expirations: expirationDates.map((s) =>
      new Date(s * 1000).toISOString().slice(0, 10)
    ),
    expiration: opt?.expirationDate
      ? new Date((opt.expirationDate as number) * 1000).toISOString().slice(0, 10)
      : null,
    calls: mapContract(opt?.calls),
    puts: mapContract(opt?.puts),
  };
}

async function modNews(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol
  )}&newsCount=15&quotesCount=0&enableFuzzyQuery=false`;
  const data = (await yahooFetch(url)) as { news?: Array<Record<string, unknown>> } | null;
  const news = data?.news ?? [];
  if (news.length === 0) {
    const seed = generateNews(symbol);
    if (seed) return seed;
  }
  return {
    symbol,
    news: news.map((n) => ({
      title: n.title as string | undefined,
      publisher: n.publisher as string | undefined,
      link: n.link as string | undefined,
      providerPublishTime: num(n.providerPublishTime),
      type: n.type as string | undefined,
      relatedTickers: (n.relatedTickers as string[] | undefined) ?? [],
      thumbnail:
        ((n.thumbnail as Record<string, unknown> | undefined)?.resolutions as Array<Record<string, unknown>> | undefined)?.[0]?.url as string | undefined ?? null,
    })),
  };
}

async function modSearch(query: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&newsCount=0&quotesCount=10&enableFuzzyQuery=true`;
  const data = (await yahooFetch(url)) as { quotes?: Array<Record<string, unknown>> } | null;
  return {
    query,
    quotes: (data?.quotes ?? []).map((q) => ({
      symbol: q.symbol as string | undefined,
      shortname: q.shortname as string | undefined,
      longname: q.longname as string | undefined,
      exchange: q.exchange as string | undefined,
      quoteType: q.quoteType as string | undefined,
      sector: q.sector as string | undefined,
      industry: q.industry as string | undefined,
    })),
  };
}

async function modScreener(scrId: "day_gainers" | "day_losers" | "most_actives") {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=25`;
  const data = (await yahooFetch(url)) as
    | { finance?: { result?: Array<{ quotes?: Array<Record<string, unknown>> }> } }
    | null;
  const upstreamRows = data?.finance?.result?.[0]?.quotes ?? [];
  const rows = upstreamRows.map((q) => ({
    symbol: q.symbol as string | undefined,
    shortName: (q.shortName as string | undefined) ?? (q.longName as string | undefined) ?? null,
    price: num(q.regularMarketPrice),
    changePct: num(q.regularMarketChangePercent),
    change: num(q.regularMarketChange),
    volume: num(q.regularMarketVolume),
    marketCap: num(q.marketCap),
  }));
  // Fallback: derive a screener from our seed snapshot when Yahoo returns
  // nothing (rate-limit). Sorted by changePct or volume to match the screener.
  if (rows.length === 0) {
    return {
      scrId,
      source: "seed",
      rows: buildScreenerRows(scrId, SEED_QUOTES),
    };
  }
  return { scrId, rows };
}

async function modPeers(symbol: string) {
  // Yahoo's recommendationTrend doesn't return peers; we infer from sector/industry
  // by hitting the screener for the same sector. Cheap stand-in for FMP's Peers.
  const profile = await quoteSummary(symbol, ["assetProfile"]);
  const ap = (profile?.assetProfile ?? {}) as Record<string, unknown>;
  const sector = ap.sector as string | undefined;
  return { symbol, sector, note: "Use /equity/discovery/* for top names in this sector." };
}

// ---------- handler ----------

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const moduleName = sp.get("module") ?? "profile";
  const symbol = (sp.get("symbol") ?? "").toUpperCase();
  const query = sp.get("q") ?? "";
  const expiration = sp.get("expiration") ?? undefined;

  try {
    let payload: unknown = null;
    switch (moduleName) {
      case "profile":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modProfile(symbol);
        break;
      case "statistics":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modStatistics(symbol);
        break;
      case "income":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modIncome(symbol);
        break;
      case "balance":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modBalance(symbol);
        break;
      case "cashflow":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modCashflow(symbol);
        break;
      case "earnings":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modEarnings(symbol);
        break;
      case "analysts":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modAnalysts(symbol);
        break;
      case "share_stats":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modOwnership(symbol, "share_stats");
        break;
      case "institutional":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modOwnership(symbol, "institutional");
        break;
      case "insider":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modOwnership(symbol, "insider");
        break;
      case "dividends":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modDividendsSplits(symbol, "div");
        break;
      case "splits":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modDividendsSplits(symbol, "split");
        break;
      case "options":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modOptions(symbol, expiration);
        break;
      case "news":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modNews(symbol);
        break;
      case "search":
        if (!query) return NextResponse.json({ error: "q required" }, { status: 400 });
        payload = await modSearch(query);
        break;
      case "gainers":
        payload = await modScreener("day_gainers");
        break;
      case "losers":
        payload = await modScreener("day_losers");
        break;
      case "active":
        payload = await modScreener("most_actives");
        break;
      case "peers":
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
        payload = await modPeers(symbol);
        break;
      default:
        return NextResponse.json({ error: `unknown module: ${moduleName}` }, { status: 400 });
    }
    if (!payload) {
      return NextResponse.json({ error: "no data (upstream rate-limited)" }, { status: 503 });
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

/**
 * Alpha Vantage multiplex route — exposes 13 AV endpoints behind a single
 * `?fn=...` parameter so the willBB UI doesn't need 13 separate hostnames.
 *
 * GET /api/markets/alpha?fn=NEWS_SENTIMENT&tickers=AAPL
 * GET /api/markets/alpha?fn=SYMBOL_SEARCH&q=apple
 * GET /api/markets/alpha?fn=TRANSCRIPT&symbol=AAPL&quarter=2024Q1
 * GET /api/markets/alpha?fn=INSIDER&symbol=AAPL
 * GET /api/markets/alpha?fn=INSTITUTIONAL&symbol=AAPL
 * GET /api/markets/alpha?fn=TREASURY&maturity=10year&interval=monthly
 * GET /api/markets/alpha?fn=FED_FUNDS&interval=monthly
 * GET /api/markets/alpha?fn=CPI
 * GET /api/markets/alpha?fn=GDP&interval=quarterly
 * GET /api/markets/alpha?fn=UNEMPLOYMENT
 * GET /api/markets/alpha?fn=INFLATION
 * GET /api/markets/alpha?fn=COMMODITY&series=WTI&interval=monthly
 * GET /api/markets/alpha?fn=GOLD_SPOT
 * GET /api/markets/alpha?fn=SILVER_SPOT
 * GET /api/markets/alpha?fn=FX&from=EUR&to=USD
 * GET /api/markets/alpha?fn=EARNINGS_CALENDAR&horizon=3month
 * GET /api/markets/alpha?fn=IPO_CALENDAR
 * GET /api/markets/alpha?fn=MARKET_STATUS
 * GET /api/markets/alpha?fn=BUDGET   (diagnostic, no upstream call)
 *
 * All AV calls are server-side cached + budget-guarded (see lib/alphavantage.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  alphaVantageNews,
  alphaVantageSearch,
  alphaVantageTranscript,
  alphaVantageInsider,
  alphaVantageInstitutional,
  alphaVantageTreasuryYield,
  alphaVantageFedFunds,
  alphaVantageCPI,
  alphaVantageRealGDP,
  alphaVantageInflation,
  alphaVantageUnemployment,
  alphaVantageCommodity,
  alphaVantageGoldSilverSpot,
  alphaVantageFX,
  alphaVantageEarningsCalendar,
  alphaVantageIPOCalendar,
  alphaVantageMarketStatus,
  alphaVantageBudgetState,
} from "@/lib/alphavantage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(body: unknown, cacheSeconds: number) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}` },
  });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fn = (sp.get("fn") ?? "").toUpperCase();
  if (!fn) return bad("fn parameter required");

  switch (fn) {
    case "NEWS_SENTIMENT": {
      const tickers = sp.get("tickers");
      if (!tickers) return bad("tickers required");
      const topics = sp.get("topics") ?? undefined;
      const limit = Math.min(50, Math.max(5, parseInt(sp.get("limit") ?? "25", 10)));
      const data = await alphaVantageNews(tickers, topics, limit);
      if (!data) return ok({ feed: [], unavailable: true }, 60);
      return ok({ feed: data, fetchedAt: Date.now() }, 900);
    }
    case "SYMBOL_SEARCH": {
      const q = sp.get("q") ?? sp.get("keywords");
      if (!q) return bad("q required");
      const data = await alphaVantageSearch(q);
      if (!data) return ok({ results: [], unavailable: true }, 60);
      return ok({ results: data, q }, 600);
    }
    case "TRANSCRIPT": {
      const symbol = sp.get("symbol");
      const quarter = sp.get("quarter");
      if (!symbol || !quarter) return bad("symbol + quarter required");
      const data = await alphaVantageTranscript(symbol, quarter);
      if (!data) return ok({ transcript: [], unavailable: true }, 600);
      return ok(data, 30 * 24 * 3600);
    }
    case "INSIDER": {
      const symbol = sp.get("symbol");
      if (!symbol) return bad("symbol required");
      const data = await alphaVantageInsider(symbol);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, symbol: symbol.toUpperCase() }, 6 * 3600);
    }
    case "INSTITUTIONAL": {
      const symbol = sp.get("symbol");
      if (!symbol) return bad("symbol required");
      const data = await alphaVantageInstitutional(symbol);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, symbol: symbol.toUpperCase() }, 24 * 3600);
    }
    case "TREASURY": {
      const maturity = (sp.get("maturity") ?? "10year") as "10year";
      const interval = (sp.get("interval") ?? "monthly") as "monthly";
      const data = await alphaVantageTreasuryYield(maturity, interval);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, maturity, interval, name: `Treasury ${maturity} (${interval})` }, 3600);
    }
    case "FED_FUNDS": {
      const interval = (sp.get("interval") ?? "monthly") as "monthly";
      const data = await alphaVantageFedFunds(interval);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, interval, name: "Federal Funds Rate" }, 3600);
    }
    case "CPI": {
      const interval = (sp.get("interval") ?? "monthly") as "monthly";
      const data = await alphaVantageCPI(interval);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, interval, name: "CPI" }, 24 * 3600);
    }
    case "GDP": {
      const interval = (sp.get("interval") ?? "quarterly") as "quarterly";
      const data = await alphaVantageRealGDP(interval);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, interval, name: `Real GDP (${interval})` }, 24 * 3600);
    }
    case "UNEMPLOYMENT": {
      const data = await alphaVantageUnemployment();
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, name: "Unemployment Rate" }, 24 * 3600);
    }
    case "INFLATION": {
      const data = await alphaVantageInflation();
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, name: "Inflation (CPI YoY)" }, 7 * 24 * 3600);
    }
    case "COMMODITY": {
      const series = (sp.get("series") ?? "WTI").toUpperCase() as "WTI";
      const interval = (sp.get("interval") ?? "monthly") as "monthly";
      const data = await alphaVantageCommodity(series, interval);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, series, interval, name: series }, 3600);
    }
    case "GOLD_SPOT": {
      const data = await alphaVantageGoldSilverSpot("GOLD");
      if (!data) return ok({ unavailable: true }, 60);
      return ok({ ...data, symbol: "GOLD" }, 300);
    }
    case "SILVER_SPOT": {
      const data = await alphaVantageGoldSilverSpot("SILVER");
      if (!data) return ok({ unavailable: true }, 60);
      return ok({ ...data, symbol: "SILVER" }, 300);
    }
    case "FX": {
      const from = sp.get("from");
      const to = sp.get("to");
      if (!from || !to) return bad("from + to required");
      const data = await alphaVantageFX(from, to);
      if (!data) return ok({ unavailable: true }, 60);
      return ok(data, 300);
    }
    case "EARNINGS_CALENDAR": {
      const horizon = (sp.get("horizon") ?? "3month") as "3month";
      const symbol = sp.get("symbol") ?? undefined;
      const data = await alphaVantageEarningsCalendar(horizon, symbol);
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data, horizon, symbol }, 24 * 3600);
    }
    case "IPO_CALENDAR": {
      const data = await alphaVantageIPOCalendar();
      if (!data) return ok({ data: [], unavailable: true }, 600);
      return ok({ data }, 24 * 3600);
    }
    case "MARKET_STATUS": {
      const data = await alphaVantageMarketStatus();
      if (!data) return ok({ markets: [], unavailable: true }, 600);
      return ok({ markets: data }, 3600);
    }
    case "BUDGET": {
      // Diagnostic — does NOT spend a call.
      return NextResponse.json(alphaVantageBudgetState(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    default:
      return bad(`unknown fn: ${fn}`);
  }
}

/**
 * Single-symbol historical chart proxy (markets module).
 *
 * Primary: Yahoo Finance v8 chart (cookies seeded from fc.yahoo.com, retry on
 * 429). Crypto fallback: CoinGecko's /coins/{id}/market_chart endpoint when
 * Yahoo is unavailable. Returns a normalized {meta + points[]} shape used by
 * the WillBB Markets Terminal price chart.
 *
 * GET /api/markets/chart?symbol=NVDA&range=1mo&interval=1d
 *
 * Valid ranges: 1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max
 * Valid intervals: 1m 2m 5m 15m 30m 60m 90m 1h 1d 5d 1wk 1mo 3mo
 */
import { NextRequest, NextResponse } from "next/server";
import { stooqHistorical } from "@/lib/stooq";
import { alphaVantageDaily } from "@/lib/alphavantage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const RANGE_OK = new Set([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
]);
const INTERVAL_OK = new Set([
  "1m",
  "2m",
  "5m",
  "15m",
  "30m",
  "60m",
  "90m",
  "1h",
  "1d",
  "5d",
  "1wk",
  "1mo",
  "3mo",
]);

interface ChartPayload {
  symbol: string;
  currency: string | null;
  exchange: string | null;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: string | null;
  range: string;
  interval: string;
  // Each point includes OHLCV when the upstream supplies it. CoinGecko's
  // simple market_chart endpoint only gives close + total volume, so o/h/l
  // can be undefined for crypto.
  points: {
    t: number;
    c: number;
    o?: number;
    h?: number;
    l?: number;
    v?: number;
  }[];
  source: "yahoo" | "coingecko" | "stooq" | "alphavantage" | "synthetic";
}

let cookieJar: string | null = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 30 * 60 * 1000;

/**
 * Module-scope success cache. Concurrent fan-outs (Cockpit's asset+market,
 * RiskDashboard's asset+5 factor ETFs, Scanner's 32-name universe) all hit
 * the chart route at the same instant. Without this cache they each retry
 * Yahoo independently and saturate Yahoo's per-IP burst window. With it,
 * a single successful fetch is shared across all concurrent callers for
 * the next 90 seconds.
 *
 * Stale-while-revalidate isn't strictly necessary here because the dev/prod
 * client already polls every 15s — the cache just damps duplicates.
 */
const SUCCESS_TTL_MS = 30 * 1000;
const successCache = new Map<string, { payload: ChartPayload; at: number }>();
function cacheKey(symbol: string, range: string, interval: string): string {
  return `${symbol.toUpperCase()}|${range}|${interval}`;
}

const UA_LIST = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
function pickUA(): string {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

async function ensureYahooCookies(force = false): Promise<string | null> {
  if (!force && cookieJar && Date.now() - cookieFetchedAt < COOKIE_TTL_MS) return cookieJar;
  try {
    const res = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": pickUA() },
      redirect: "manual",
    });
    const all =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie === "function"
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
    const cookies = all.map((c) => c.split(";")[0]).filter(Boolean);
    cookieJar = cookies.join("; ");
    cookieFetchedAt = Date.now();
    if (cookieJar) return cookieJar;
  } catch {
    // fall through
  }
  // Last-resort cookie. Yahoo's chart endpoint accepts ANY non-empty Cookie
  // header for the bot-check, so a static placeholder still gets us through
  // when fc.yahoo.com is itself rate-limited.
  cookieJar = "A1=fallback";
  cookieFetchedAt = Date.now();
  return cookieJar;
}

async function yahooChart(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartPayload | null> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  // Pre-attempt jitter (0-200ms). When 10 panels fan out to chart endpoint
  // at the same instant, this spreads the actual upstream calls across a
  // 200ms window so Yahoo's burst limiter doesn't see them as one spike.
  await new Promise((r) => setTimeout(r, Math.random() * 200));
  for (let attempt = 0; attempt < 5; attempt++) {
    const host = hosts[attempt % hosts.length];
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
    // On every other attempt, force-refresh the cookie (in case it expired).
    const cookie = await ensureYahooCookies(attempt >= 2);
    const headers: Record<string, string> = {
      "User-Agent": pickUA(),
      Accept: "application/json",
    };
    if (cookie) headers["Cookie"] = cookie;

    try {
      const res = await fetch(url, { headers, next: { revalidate: 60 } });
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        // Exponential backoff: 350 → 850 → 1500 → 2500 → 3500 ms
        await new Promise((r) => setTimeout(r, 350 + attempt * 700));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) return null;
      const meta = result.meta ?? {};
      const ts: number[] = result.timestamp ?? [];
      const q = (result.indicators?.quote ?? [])[0] ?? {};
      const closes: (number | null)[] = q.close ?? [];
      const opens: (number | null)[] = q.open ?? [];
      const highs: (number | null)[] = q.high ?? [];
      const lows: (number | null)[] = q.low ?? [];
      const vols: (number | null)[] = q.volume ?? [];
      const points: { t: number; c: number; o?: number; h?: number; l?: number; v?: number }[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c == null) continue;
        const p: { t: number; c: number; o?: number; h?: number; l?: number; v?: number } = {
          t: ts[i],
          c,
        };
        if (opens[i] != null) p.o = opens[i] as number;
        if (highs[i] != null) p.h = highs[i] as number;
        if (lows[i] != null) p.l = lows[i] as number;
        if (vols[i] != null) p.v = vols[i] as number;
        points.push(p);
      }
      return {
        symbol: meta.symbol ?? symbol,
        currency: meta.currency ?? null,
        exchange: meta.exchangeName ?? null,
        shortName: meta.shortName ?? meta.longName ?? null,
        price: meta.regularMarketPrice ?? null,
        previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
        open: meta.regularMarketOpen ?? null,
        dayHigh: meta.regularMarketDayHigh ?? null,
        dayLow: meta.regularMarketDayLow ?? null,
        volume: meta.regularMarketVolume ?? null,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
        marketState: meta.marketState ?? null,
        range,
        interval,
        points,
        source: "yahoo",
      };
    } catch {
      // fallthrough to next attempt
    }
  }
  return null;
}

const CG_MAP: Record<string, { id: string; name: string }> = {
  "BTC-USD": { id: "bitcoin", name: "Bitcoin" },
  "ETH-USD": { id: "ethereum", name: "Ethereum" },
  "SOL-USD": { id: "solana", name: "Solana" },
  "DOGE-USD": { id: "dogecoin", name: "Dogecoin" },
};

const RANGE_TO_DAYS: Record<string, number> = {
  "1d": 1,
  "5d": 5,
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "2y": 730,
  "5y": 1825,
  "10y": 3650,
  ytd: Math.ceil(
    (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
      (24 * 3600 * 1000)
  ),
  max: 3650,
};

async function coingeckoChart(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartPayload | null> {
  const m = CG_MAP[symbol.toUpperCase()];
  if (!m) return null;
  const days = RANGE_TO_DAYS[range] ?? 30;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${m.id}/market_chart?vs_currency=usd&days=${days}`,
      { headers: { Accept: "application/json", "User-Agent": UA }, next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      prices: [number, number][];
      total_volumes?: [number, number][];
    };
    // Build a ts → volume map so we can join even if lengths differ.
    const volMap = new Map<number, number>();
    for (const [ms, vol] of data.total_volumes ?? []) {
      volMap.set(Math.floor(ms / 1000), vol);
    }
    const points = (data.prices ?? []).map(([ms, c]) => {
      const t = Math.floor(ms / 1000);
      return { t, c, v: volMap.get(t) };
    });
    if (points.length === 0) return null;
    const first = points[0].c;
    const last = points[points.length - 1].c;
    return {
      symbol: symbol.toUpperCase(),
      currency: "USD",
      exchange: "CoinGecko",
      shortName: m.name,
      price: last,
      previousClose: first,
      open: first,
      dayHigh: Math.max(...points.map((p) => p.c)),
      dayLow: Math.min(...points.map((p) => p.c)),
      volume: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      marketState: "OPEN",
      range,
      interval,
      points,
      source: "coingecko",
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const range = req.nextUrl.searchParams.get("range") ?? "1mo";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  // ?bypass=1 skips the in-memory success cache. The Studies + Alpha Lab
  // panels pass it when the user explicitly clicks a range button so they
  // always get a fresh fetch (range-button feedback). Initial mount + symbol
  // change still hits the cache for fast first paint.
  const bypassCache = req.nextUrl.searchParams.get("bypass") === "1";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!RANGE_OK.has(range) || !INTERVAL_OK.has(interval)) {
    return NextResponse.json(
      { error: "invalid range or interval" },
      { status: 400 }
    );
  }

  // ============= Provider failover chain =============
  // 1. In-memory success cache (30s TTL, bypassed when ?bypass=1)
  // 2. Yahoo Finance v8 (primary, real-time, intraday)
  // 3. CoinGecko (crypto only, free, no key)
  // 4. Alpha Vantage (free, ≤6mo only — skipped for 1y/2y/5y/10y)
  // 5. Stooq (real, no key, ~15min delay, daily resolution, 25y of history)
  // 6. Synthetic regime-switching GBM (last resort - so panels render at all)

  // Hot cache hit — return immediately without touching upstreams.
  const ck = cacheKey(symbol, range, interval);
  if (!bypassCache) {
    const cached = successCache.get(ck);
    if (cached && Date.now() - cached.at < SUCCESS_TTL_MS) {
      return NextResponse.json(
        { ...cached.payload, cached: true },
        { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } }
      );
    }
  }

  const yahoo = await yahooChart(symbol, range, interval);
  if (yahoo && yahoo.points.length > 0) {
    successCache.set(ck, { payload: yahoo, at: Date.now() });
    return NextResponse.json(
      { ...yahoo, source: "yahoo" },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } }
    );
  }

  // Crypto fallback.
  if (CG_MAP[symbol.toUpperCase()]) {
    const cg = await coingeckoChart(symbol, range, interval);
    if (cg && cg.points.length > 0) {
      successCache.set(ck, { payload: cg, at: Date.now() });
      return NextResponse.json(
        { ...cg, source: "coingecko" },
        { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } }
      );
    }
  }

  // Alpha Vantage fallback (free TIME_SERIES_DAILY, 25 req/day budget).
  // Keyed-only and aggressively cached upstream — see lib/alphavantage.ts.
  const av = await alphaVantageChartShim(symbol, range, interval);
  if (av && av.points.length > 0) {
    const avPayload: ChartPayload = { ...av, source: "alphavantage" };
    successCache.set(ck, { payload: avPayload, at: Date.now() });
    return NextResponse.json(
      { ...avPayload, message: "real data via Alpha Vantage (daily, 1h cache)" },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
    );
  }

  // Stooq fallback (free, no API key, ~15min delay, daily resolution).
  const stooq = await stooqChartShim(symbol, range, interval);
  if (stooq && stooq.points.length > 0) {
    const stooqPayload: ChartPayload = { ...stooq, source: "stooq" };
    successCache.set(ck, { payload: stooqPayload, at: Date.now() });
    return NextResponse.json(
      { ...stooqPayload, message: "real data via Stooq (~15min delay, daily)" },
      { headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } }
    );
  }

  // Synthetic OHLC fallback when ALL real providers are unavailable.
  // Deterministic GBM keyed off the symbol so the same ticker draws the same
  // synthetic curve across reloads. The Research terminal needs *some* bars
  // to drive the indicator math; without this, every panel renders empty.
  // We deliberately DO NOT cache synthetic responses — the next request
  // should retry Yahoo immediately (its per-IP rate-limit window may have
  // reset by then).
  const synth = synthChart(symbol, range, interval);
  const synthPayload: ChartPayload = { ...synth, source: "synthetic" };
  return NextResponse.json(
    { ...synthPayload, message: "all real providers unavailable; synthetic OHLC" },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

/**
 * Alpha Vantage adapter: pulls daily bars via lib/alphavantage.ts and
 * reshapes them into our standard {meta + points[]} response.
 *
 * Free-tier `outputsize=compact` returns only ~100 trading days (~5 months).
 * `outputsize=full` is premium-only on the 25-call/day free key. To prevent
 * 1Y/2Y/5Y/10Y ranges from rendering as visually-truncated 5-month charts,
 * we **short-circuit AV for any range longer than 6mo** and let the
 * fallback chain reach Stooq (which has 25+ years of CSV history).
 *
 * Returns null when the key is missing, the daily budget is exhausted,
 * the symbol isn't AV-supported on the free tier (crypto, FX, futures),
 * the requested range exceeds compact's capacity, or the upstream errors.
 */
const AV_LONG_RANGES = new Set(["1y", "2y", "5y", "10y", "ytd", "max"]);

async function alphaVantageChartShim(
  symbol: string,
  range: string,
  interval: string
): Promise<{
  symbol: string;
  currency: string;
  exchange: string;
  shortName: string;
  price: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketState: string;
  range: string;
  interval: string;
  points: { t: number; c: number; o: number; h: number; l: number; v: number }[];
} | null> {
  // Skip AV for long ranges — its compact (~100 day) response would render
  // as a visually-truncated 5-month chart even when the user clicks 5Y.
  if (AV_LONG_RANGES.has(range)) return null;
  const bars = await alphaVantageDaily(symbol);
  if (!bars || bars.length === 0) return null;
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : last;
  const recent = bars.slice(-252);
  return {
    symbol: symbol.toUpperCase(),
    currency: "USD",
    exchange: "ALPHAVANTAGE",
    shortName: symbol.toUpperCase(),
    price: last.c,
    previousClose: prev.c,
    open: last.o,
    dayHigh: last.h,
    dayLow: last.l,
    volume: last.v,
    fiftyTwoWeekHigh: Math.max(...recent.map((b) => b.h)),
    fiftyTwoWeekLow: Math.min(...recent.map((b) => b.l)),
    marketState: "REGULAR",
    range,
    interval,
    points: bars,
  };
}

/**
 * Stooq adapter: pulls historical bars via lib/stooq.ts and reshapes them
 * into our standard {meta + points[]} response. Stooq doesn't ship live
 * day-stats (high/low/volume for the latest session), so we reconstruct
 * those from the most recent bar.
 */
async function stooqChartShim(
  symbol: string,
  range: string,
  interval: string
): Promise<{
  symbol: string;
  currency: string;
  exchange: string;
  shortName: string;
  price: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketState: string;
  range: string;
  interval: string;
  points: { t: number; c: number; o: number; h: number; l: number; v: number }[];
} | null> {
  const bars = await stooqHistorical(symbol, range);
  if (!bars || bars.length === 0) return null;
  // Stooq is daily-only. If user requested intraday interval, we still serve
  // the daily series — better than nothing, and the UI doesn't typically
  // pick a sub-day interval for the Research terminal anyway.
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : last;
  const recent = bars.slice(-252);
  return {
    symbol: symbol.toUpperCase(),
    currency: "USD",
    exchange: "STOOQ",
    shortName: symbol.toUpperCase(),
    price: last.c,
    previousClose: prev.c,
    open: last.o,
    dayHigh: last.h,
    dayLow: last.l,
    volume: last.v,
    fiftyTwoWeekHigh: Math.max(...recent.map((b) => b.h)),
    fiftyTwoWeekLow: Math.min(...recent.map((b) => b.l)),
    marketState: "REGULAR",
    range,
    interval,
    points: bars,
  };
}

// ====================================================================
// Synthetic OHLC chart (used when Yahoo + CoinGecko are both unavailable).
// Deterministic GBM-style price walk with realistic vol and intraday bars.
// ====================================================================

function symbolHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// LCG seeded by symbol hash. Same symbol → same series.
function makeRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Inverse normal via Box-Muller — paired so we burn through the LCG predictably
function makeGaussian(rng: () => number) {
  let cached: number | null = null;
  return () => {
    if (cached != null) {
      const v = cached;
      cached = null;
      return v;
    }
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const m = Math.sqrt(-2 * Math.log(u));
    const a = m * Math.cos(2 * Math.PI * v);
    const b = m * Math.sin(2 * Math.PI * v);
    cached = b;
    return a;
  };
}

const PRICE_BY_TICKER: Record<string, number> = {
  AAPL: 195, MSFT: 410, GOOG: 175, AMZN: 185, NVDA: 880, META: 510, TSLA: 245, AMD: 175,
  AVGO: 1320, NFLX: 620, ORCL: 130, CRM: 280, INTC: 33, CSCO: 49, PYPL: 65, QCOM: 165,
  BAC: 38, JPM: 195, V: 275, MA: 470, UNH: 510, JNJ: 155, PFE: 28, MRK: 125,
  WMT: 60, HD: 350, PG: 165, KO: 62, PEP: 170, MCD: 280, NKE: 95, DIS: 110,
  SPY: 520, QQQ: 440, IWM: 200, IUSV: 90, IUSG: 110, MTUM: 200,
  XLK: 220, XLF: 42, XLE: 95, XLV: 145, XLY: 185, XLP: 78, XLI: 130, XLU: 73, XLB: 90, XLRE: 42, XLC: 88,
  "^GSPC": 5200, "^IXIC": 16400, "^DJI": 39500, "^RUT: 2050": 2050, "^VIX": 16,
  "BTC-USD": 65000, "ETH-USD": 3400,
};

function basePriceFor(symbol: string): number {
  const upper = symbol.toUpperCase();
  if (PRICE_BY_TICKER[upper]) return PRICE_BY_TICKER[upper];
  // Synthesize from the hash (in [50, 250])
  const h = symbolHash(upper);
  return 50 + (h % 200);
}

interface ChartPoint { t: number; c: number; o?: number; h?: number; l?: number; v?: number }

function synthChart(symbol: string, range: string, interval: string): {
  symbol: string;
  currency: string;
  exchange: string;
  shortName: string;
  price: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketState: string;
  range: string;
  interval: string;
  points: ChartPoint[];
} {
  const startPrice = basePriceFor(symbol);
  // Bar count: trading-day-based. 1y = 252 bars, 5y = 1260, etc. Intraday
  // intervals get scaled up from the daily count.
  const tradingDaysForRange: Record<string, number> = {
    "1d": 1, "5d": 5, "1mo": 21, "3mo": 63, "6mo": 126, "1y": 252,
    "2y": 504, "5y": 1260, "10y": 2520, "ytd": 100, "max": 2520,
  };
  // How many bars within a single trading day at this interval
  const barsPerDay: Record<string, number> = {
    "1m": 390, "2m": 195, "5m": 78, "15m": 26, "30m": 13, "60m": 7, "90m": 4, "1h": 7,
    "1d": 1, "5d": 0.2, "1wk": 0.2, "1mo": 1 / 21, "3mo": 1 / 63,
  };
  const tradingDays = tradingDaysForRange[range] ?? 252;
  const perDay = barsPerDay[interval] ?? 1;
  const N = Math.max(20, Math.min(1300, Math.round(tradingDays * perDay)));
  // Step in trading-days terms (used for scaling drift/vol). Daily = 1.
  const step = perDay > 0 ? 1 / perDay : 1;

  const rng = makeRng(symbolHash(symbol.toUpperCase()));
  const gauss = makeGaussian(rng);
  // Annualized drift + vol. Equities: μ ≈ 8%, σ ≈ 22%. ETFs/indices smaller.
  const isIndex = symbol.startsWith("^") || ["SPY", "QQQ", "IWM"].includes(symbol.toUpperCase());
  const annualMu = isIndex ? 0.07 : 0.08 + (rng() - 0.5) * 0.1;
  const annualSig = isIndex ? 0.16 : 0.22 + rng() * 0.18;
  // Daily approximation
  const dt = step / 252;
  const dailyMu = (annualMu - 0.5 * annualSig * annualSig) * dt;
  const dailySig = annualSig * Math.sqrt(dt);

  const points: ChartPoint[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const stepSec = Math.max(60, Math.round(step * 86400));
  let price = startPrice;
  // Walk forward with vol regimes — adds heteroscedasticity (low vol clusters
  // + high vol bursts) so RSI extremes, BB breakouts, and MA crosses all have
  // realistic chance to fire. Also injects mild auto-correlation in the drift
  // sign so crosses + RSI cycles emerge instead of pure GBM smoothness.
  const closes: number[] = [];
  let walking = startPrice;
  let regimeMu = 0;
  let regimeVol = 1.0;
  for (let i = 0; i < N; i++) {
    // Regime switching: every ~30 bars on average, flip drift sign and vol
    if (rng() < 1 / 30) {
      regimeMu = (rng() - 0.5) * 2 * dailyMu * 5; // overshoot baseline drift
      regimeVol = 0.6 + rng() * 1.6; // 0.6x .. 2.2x baseline vol
    }
    const z = gauss();
    const mu = dailyMu + regimeMu;
    const sig = dailySig * regimeVol;
    walking = walking * Math.exp(mu + sig * z);
    closes.push(walking);
  }
  // Compute final/peak/trough for the meta block
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    const prev = i > 0 ? closes[i - 1] : c;
    // Generate OHLC: o = prev close (with slight gap), h/l = bar's intraday range
    const gap = (rng() - 0.5) * 0.005 * prev;
    const o = prev + gap;
    const range = Math.abs(gauss()) * dailySig * c * 0.6 + 0.001 * c;
    const h = Math.max(o, c) + range * (0.3 + rng() * 0.7);
    const l = Math.min(o, c) - range * (0.3 + rng() * 0.7);
    const v = Math.round(1_000_000 + rng() * 9_000_000);
    const t = nowSec - (closes.length - 1 - i) * stepSec;
    points.push({ t, c: Number(c.toFixed(2)), o: Number(o.toFixed(2)), h: Number(h.toFixed(2)), l: Number(Math.max(0.01, l).toFixed(2)), v });
  }
  price = points[points.length - 1].c;
  const previousClose = points.length > 1 ? points[points.length - 2].c : price;
  const dayHigh = points[points.length - 1].h ?? price;
  const dayLow = points[points.length - 1].l ?? price;
  const volume = points[points.length - 1].v ?? 0;
  const fiftyTwoWeekHigh = Math.max(...points.slice(-252).map((p) => p.h ?? p.c));
  const fiftyTwoWeekLow = Math.min(...points.slice(-252).map((p) => p.l ?? p.c));

  return {
    symbol: symbol.toUpperCase(),
    currency: "USD",
    exchange: "NMS",
    shortName: symbol.toUpperCase(),
    price,
    previousClose,
    open: points[points.length - 1].o ?? price,
    dayHigh,
    dayLow,
    volume,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    marketState: "REGULAR",
    range,
    interval,
    points,
  };
}

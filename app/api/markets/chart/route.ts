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
  source: "yahoo" | "coingecko";
}

let cookieJar: string | null = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 30 * 60 * 1000;

async function ensureYahooCookies(): Promise<string | null> {
  if (cookieJar && Date.now() - cookieFetchedAt < COOKIE_TTL_MS) return cookieJar;
  try {
    const res = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": UA },
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
    return cookieJar || null;
  } catch {
    return null;
  }
}

async function yahooChart(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartPayload | null> {
  const cookie = await ensureYahooCookies();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 60 } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 350 + attempt * 600));
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

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!RANGE_OK.has(range) || !INTERVAL_OK.has(interval)) {
    return NextResponse.json(
      { error: "invalid range or interval" },
      { status: 400 }
    );
  }

  const yahoo = await yahooChart(symbol, range, interval);
  if (yahoo && yahoo.points.length > 0) {
    return NextResponse.json(yahoo, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
    });
  }

  // Crypto fallback.
  if (CG_MAP[symbol.toUpperCase()]) {
    const cg = await coingeckoChart(symbol, range, interval);
    if (cg && cg.points.length > 0) {
      return NextResponse.json(cg, {
        headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
      });
    }
  }

  return NextResponse.json(
    { error: "no data (upstream rate-limited or symbol unsupported)" },
    { status: 503 }
  );
}

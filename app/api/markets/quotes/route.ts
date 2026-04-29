/**
 * Multi-symbol quote proxy (markets module).
 *
 * Primary source: Yahoo Finance v8 chart endpoint (works without API keys for
 * indices, equities, ETFs, futures, FX, and crypto). We seed a session
 * cookie via fc.yahoo.com to dodge soft rate-limits, retry once on 429.
 *
 * Crypto fallback: CoinGecko's public API (no key, generous rate limit) for
 * any symbol matching <COIN>-USD when Yahoo can't service it.
 *
 * GET /api/markets/quotes?symbols=^GSPC,^IXIC,NVDA,BTC-USD
 */
import { NextRequest, NextResponse } from "next/server";
import { getSeedQuote } from "@/lib/marketsFallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuoteResult {
  symbol: string;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  currency: string | null;
  marketState: string | null;
  exchange: string | null;
  source: "yahoo" | "coingecko" | "seed" | "unavailable";
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Module-scope cookie cache; re-seeded every 30 minutes.
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
    // Node 18+ headers expose getSetCookie(); collect all set-cookie values.
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

async function yahooChart(symbol: string): Promise<QuoteResult> {
  const cookie = await ensureYahooCookies();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=5d&includePrePost=false`;
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 60 } });
      if (res.status === 429) {
        // brief backoff then retry once
        await new Promise((r) => setTimeout(r, 350 + attempt * 600));
        continue;
      }
      if (!res.ok) break;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) break;
      const price: number | null = meta.regularMarketPrice ?? null;
      const previousClose: number | null =
        meta.chartPreviousClose ?? meta.previousClose ?? null;
      const changePct =
        price != null && previousClose != null && previousClose !== 0
          ? ((price - previousClose) / previousClose) * 100
          : null;
      return {
        symbol: meta.symbol ?? symbol,
        shortName: meta.shortName ?? meta.longName ?? null,
        price,
        previousClose,
        changePct,
        currency: meta.currency ?? null,
        marketState: meta.marketState ?? null,
        exchange: meta.exchangeName ?? null,
        source: "yahoo",
      };
    } catch {
      // try next attempt
    }
  }
  return unavailable(symbol);
}

/** Map of Yahoo crypto symbols → CoinGecko coin IDs. Add as needed. */
const CG_MAP: Record<string, { id: string; name: string }> = {
  "BTC-USD": { id: "bitcoin", name: "Bitcoin" },
  "ETH-USD": { id: "ethereum", name: "Ethereum" },
  "SOL-USD": { id: "solana", name: "Solana" },
  "DOGE-USD": { id: "dogecoin", name: "Dogecoin" },
};

async function coingeckoQuote(symbol: string): Promise<QuoteResult> {
  const m = CG_MAP[symbol.toUpperCase()];
  if (!m) return unavailable(symbol);
  try {
    // /simple/price gives last + 24h change in one call.
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${m.id}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { Accept: "application/json", "User-Agent": UA }, next: { revalidate: 60 } }
    );
    if (!res.ok) return unavailable(symbol);
    const data = (await res.json()) as Record<
      string,
      { usd: number; usd_24h_change: number }
    >;
    const row = data[m.id];
    if (!row) return unavailable(symbol);
    const price = row.usd;
    const changePct = row.usd_24h_change ?? null;
    const previousClose =
      changePct != null && changePct !== -100
        ? price / (1 + changePct / 100)
        : null;
    return {
      symbol: symbol.toUpperCase(),
      shortName: m.name,
      price,
      previousClose,
      changePct,
      currency: "USD",
      marketState: "OPEN",
      exchange: "CoinGecko",
      source: "coingecko",
    };
  } catch {
    return unavailable(symbol);
  }
}

function unavailable(symbol: string): QuoteResult {
  return {
    symbol,
    shortName: null,
    price: null,
    previousClose: null,
    changePct: null,
    currency: null,
    marketState: null,
    exchange: null,
    source: "unavailable",
  };
}

function seedAsResult(symbol: string): QuoteResult | null {
  const seed = getSeedQuote(symbol);
  if (!seed) return null;
  const changePct =
    seed.previousClose !== 0 ? ((seed.price - seed.previousClose) / seed.previousClose) * 100 : null;
  return {
    symbol: seed.symbol,
    shortName: seed.shortName,
    price: seed.price,
    previousClose: seed.previousClose,
    changePct,
    currency: seed.currency,
    marketState: "CACHED",
    exchange: seed.exchange,
    source: "seed",
  };
}

/**
 * Two-mode fetch:
 *   liveFirst=true  → Try Yahoo / CoinGecko first; fall back to seed only
 *                     when upstreams fail. Used for single-symbol requests
 *                     (the focused ticker) so we always serve live data
 *                     when available.
 *   liveFirst=false → Seed-first. Used for big watchlist batches so we
 *                     don't fan 100+ requests into Yahoo and trigger a
 *                     guaranteed 429 storm.
 */
async function fetchOne(symbol: string, liveFirst: boolean): Promise<QuoteResult> {
  const upper = symbol.toUpperCase();
  const isCrypto = upper.endsWith("-USD") && !!CG_MAP[upper];

  if (liveFirst) {
    const y = await yahooChart(symbol);
    if (y.price != null) return y;
    if (isCrypto) {
      const cg = await coingeckoQuote(symbol);
      if (cg.price != null) return cg;
    }
    const seed = seedAsResult(symbol);
    if (seed) return seed;
    return y;
  }

  // Batch-friendly path: seed instantly when known.
  const seed = seedAsResult(symbol);
  if (seed) return seed;
  const y = await yahooChart(symbol);
  if (y.price != null) return y;
  if (isCrypto) {
    const cg = await coingeckoQuote(symbol);
    if (cg.price != null) return cg;
  }
  return y;
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }
  const symbols = Array.from(
    new Set(
      symbolsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  if (symbols.length === 0 || symbols.length > 200) {
    return NextResponse.json({ error: "1-200 symbols" }, { status: 400 });
  }
  // Single-symbol (or very small batch) → live-first; large batches →
  // seed-first so we never blast Yahoo with 100+ parallel requests.
  const liveFirst = symbols.length <= 3;
  const quotes = await Promise.all(symbols.map((s) => fetchOne(s, liveFirst)));
  const sourceCounts = quotes.reduce<Record<string, number>>(
    (acc, q) => ((acc[q.source] = (acc[q.source] ?? 0) + 1), acc),
    {}
  );
  const seedCount = sourceCounts.seed ?? 0;
  const naCount = sourceCounts.unavailable ?? 0;
  const liveCount = quotes.length - seedCount - naCount;
  let message: string | null = null;
  if (naCount === quotes.length) {
    message = "All upstreams down — try again in a minute.";
  } else if (seedCount > 0 && liveCount === 0) {
    message = "Live feed cooled off — showing latest cached snapshot for now.";
  } else if (seedCount > 0) {
    message = `${seedCount} of ${quotes.length} symbol(s) showing snapshot data; rest is live.`;
  } else if (naCount > 0) {
    message = `${naCount} of ${quotes.length} symbol(s) unavailable.`;
  }
  return NextResponse.json(
    {
      quotes,
      fetchedAt: Date.now(),
      degraded: seedCount > 0 || naCount > 0,
      message,
    },
    // Shorter cache so polling actually feels live.
    { headers: { "Cache-Control": "public, max-age=10, s-maxage=15" } }
  );
}

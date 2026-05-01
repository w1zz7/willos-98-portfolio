/**
 * Multi-symbol quote proxy (markets module).
 *
 * Provider failover chain:
 *   1. Yahoo Finance v8 chart (primary; cookies seeded from fc.yahoo.com,
 *      4-attempt retry alternating query1/query2 hosts, exponential backoff
 *      on 429/401/403, rotating UA).
 *   2. CoinGecko /simple/price (crypto only, free, no key).
 *   3. Stooq last-quote CSV (free, no API key, ~15 min delay - DELAYED tier).
 *   4. Seed cache (lib/marketsFallback.ts SEED_QUOTES) - last-known snapshot.
 *
 * Each response row carries a `source` field so the UI can surface
 * LIVE / DELAYED / CACHED / SYNTHETIC badges.
 *
 * GET /api/markets/quotes?symbols=^GSPC,^IXIC,NVDA,BTC-USD
 */
import { NextRequest, NextResponse } from "next/server";
import { getSeedQuote } from "@/lib/marketsFallback";
import { stooqLastQuote, stooqHistorical } from "@/lib/stooq";
import { alphaVantageQuote } from "@/lib/alphavantage";

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
  source: "yahoo" | "coingecko" | "stooq" | "alphavantage" | "seed" | "unavailable";
}

// Rotated User-Agent pool. Stops Yahoo from fingerprinting a single UA.
const UA_LIST = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
function pickUA(): string {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

// Module-scope cookie cache; re-seeded every 30 minutes.
let cookieJar: string | null = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 30 * 60 * 1000;

/**
 * Module-scope per-symbol quote cache.
 *
 * Two TTL profiles based on call shape:
 *
 *   - LIVE_TTL_MS (5s): single-symbol or small-batch live polls
 *     (the Research panel useLiveQuote hook fires at 5s — we don't want
 *     it to serve stale data older than the polling interval, otherwise
 *     "real-time" becomes "real every 30s")
 *
 *   - BATCH_TTL_MS (30s): watchlist + heatmap batch fetches. These don't
 *     need 5s freshness; the TTL is mainly there to absorb fan-out from
 *     the Scanner panel's ~50-symbol burst.
 *
 * The split is decided per-call inside fetchOne (the `liveFirst` flag
 * already discriminates these two paths).
 */
const LIVE_TTL_MS = 5 * 1000;
const BATCH_TTL_MS = 30 * 1000;
const quoteCache = new Map<string, { row: QuoteResult; at: number }>();

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

async function yahooChart(symbol: string): Promise<QuoteResult> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  // Pre-attempt jitter (0-200ms). Spreads parallel fan-outs so Yahoo's
  // burst limiter doesn't see them as one spike.
  await new Promise((r) => setTimeout(r, Math.random() * 200));
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = hosts[attempt % hosts.length];
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=1d&range=5d&includePrePost=false`;
    // Force-refresh cookie on attempt >= 2.
    const cookie = await ensureYahooCookies(attempt >= 2);
    const headers: Record<string, string> = {
      "User-Agent": pickUA(),
      Accept: "application/json",
    };
    if (cookie) headers["Cookie"] = cookie;
    try {
      const res = await fetch(url, { headers, next: { revalidate: 30 } });
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        // Exponential backoff: 250 → 750 → 1500 → 2500 ms
        await new Promise((r) => setTimeout(r, 250 + attempt * 600));
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
      { headers: { Accept: "application/json", "User-Agent": pickUA() }, next: { revalidate: 60 } }
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

/**
 * Stooq last-quote fallback. Stooq's last-quote CSV doesn't ship the prior
 * close, so when we have it we reconstruct previousClose from the second-to-
 * last bar of a tiny 5d historical pull (cached aggressively upstream).
 */
async function stooqQuote(symbol: string): Promise<QuoteResult> {
  const snap = await stooqLastQuote(symbol);
  if (!snap || snap.price == null) return unavailable(symbol);
  // Try to reconstruct previousClose from a small history pull. If history
  // is gated (Stooq now requires an API key for the historical CSV at some
  // points of the day), we still return the spot price with a null change %.
  let previousClose: number | null = null;
  try {
    const hist = await stooqHistorical(symbol, "5d");
    if (hist && hist.length >= 2) {
      previousClose = hist[hist.length - 2].c;
    }
  } catch {
    /* ignore */
  }
  const changePct =
    previousClose != null && previousClose !== 0
      ? ((snap.price - previousClose) / previousClose) * 100
      : null;
  return {
    symbol: symbol.toUpperCase(),
    shortName: symbol.toUpperCase(),
    price: snap.price,
    previousClose,
    changePct,
    currency: "USD",
    marketState: "DELAYED",
    exchange: "STOOQ",
    source: "stooq",
  };
}

/**
 * Alpha Vantage GLOBAL_QUOTE adapter. Free tier returns EOD-only data, so
 * this is a "yesterday's close" tier — better than the seed cache (which
 * is days old) but not real-time. Used after Yahoo / CoinGecko / Stooq
 * have all failed.
 */
async function avQuote(symbol: string): Promise<QuoteResult> {
  const snap = await alphaVantageQuote(symbol);
  if (!snap || snap.price == null) return unavailable(symbol);
  return {
    symbol: symbol.toUpperCase(),
    shortName: symbol.toUpperCase(),
    price: snap.price,
    previousClose: snap.previousClose,
    changePct: snap.changePct,
    currency: "USD",
    marketState: "EOD",
    exchange: "ALPHAVANTAGE",
    source: "alphavantage",
  };
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
 *   liveFirst=true  → Try Yahoo / CoinGecko / Stooq before falling back to
 *                     seed. Used for single-symbol requests (the focused
 *                     ticker) so we always try real data when available.
 *   liveFirst=false → Seed-first. Used for big watchlist batches so we
 *                     don't fan 100+ requests into Yahoo and trigger a
 *                     guaranteed 429 storm. Real-data refresh is async-able
 *                     by the caller.
 */
async function fetchOne(symbol: string, liveFirst: boolean): Promise<QuoteResult> {
  const upper = symbol.toUpperCase();
  const isCrypto = upper.endsWith("-USD") && !!CG_MAP[upper];

  // Pick TTL based on call shape: live polls (≤3 symbols) get 5s freshness;
  // batch polls (watchlist) get 30s. See block comment on the cache decl.
  const ttl = liveFirst ? LIVE_TTL_MS : BATCH_TTL_MS;

  // Hot in-memory cache hit — we already fetched this symbol within `ttl` ms.
  // Concurrent fan-outs (e.g. ticker tape + watchlist polling at the same
  // instant) should share the same upstream call.
  const cached = quoteCache.get(upper);
  if (cached && Date.now() - cached.at < ttl && cached.row.price != null) {
    return cached.row;
  }

  if (liveFirst) {
    const y = await yahooChart(symbol);
    if (y.price != null) {
      quoteCache.set(upper, { row: y, at: Date.now() });
      return y;
    }
    if (isCrypto) {
      const cg = await coingeckoQuote(symbol);
      if (cg.price != null) {
        quoteCache.set(upper, { row: cg, at: Date.now() });
        return cg;
      }
    }
    // Stooq is real data with ~15min delay - try before seed cache.
    const sq = await stooqQuote(symbol);
    if (sq.price != null) {
      quoteCache.set(upper, { row: sq, at: Date.now() });
      return sq;
    }
    // Alpha Vantage GLOBAL_QUOTE (EOD-only on free tier) - last-resort
    // real provider before we fall back to the static seed cache.
    const av = await avQuote(symbol);
    if (av.price != null) {
      quoteCache.set(upper, { row: av, at: Date.now() });
      return av;
    }
    const seed = seedAsResult(symbol);
    if (seed) return seed;
    return y;
  }

  // Batch-friendly path: seed instantly when known.
  const seed = seedAsResult(symbol);
  if (seed) return seed;
  const y = await yahooChart(symbol);
  if (y.price != null) {
    quoteCache.set(upper, { row: y, at: Date.now() });
    return y;
  }
  if (isCrypto) {
    const cg = await coingeckoQuote(symbol);
    if (cg.price != null) {
      quoteCache.set(upper, { row: cg, at: Date.now() });
      return cg;
    }
  }
  const sq = await stooqQuote(symbol);
  if (sq.price != null) {
    quoteCache.set(upper, { row: sq, at: Date.now() });
    return sq;
  }
  const av = await avQuote(symbol);
  if (av.price != null) {
    quoteCache.set(upper, { row: av, at: Date.now() });
    return av;
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
  // With the in-memory cache layer (QUOTE_TTL_MS = 30s) every symbol's
  // first upstream hit is shared across all concurrent callers, so we can
  // safely live-first for up to ~24 symbols. Beyond that, fall back to
  // seed-first to keep the watchlist responsive on cold start.
  const liveFirst = symbols.length <= 24;
  const quotes = await Promise.all(symbols.map((s) => fetchOne(s, liveFirst)));
  const sourceCounts = quotes.reduce<Record<string, number>>(
    (acc, q) => ((acc[q.source] = (acc[q.source] ?? 0) + 1), acc),
    {}
  );
  const seedCount = sourceCounts.seed ?? 0;
  const naCount = sourceCounts.unavailable ?? 0;
  const stooqCount = sourceCounts.stooq ?? 0;
  const liveCount = (sourceCounts.yahoo ?? 0) + (sourceCounts.coingecko ?? 0);
  let message: string | null = null;
  if (naCount === quotes.length) {
    message = "All upstreams down - try again in a minute.";
  } else if (seedCount > 0 && liveCount === 0 && stooqCount === 0) {
    message = "Live feed cooled off - showing latest cached snapshot for now.";
  } else if (stooqCount > 0 && liveCount === 0) {
    message = `Yahoo throttled - ${stooqCount} symbol(s) on Stooq (~15min delay).`;
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

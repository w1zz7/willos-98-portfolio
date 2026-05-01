/**
 * Alpha Vantage adapter — free-tier fallback for the willBB markets terminal.
 *
 * https://www.alphavantage.co/documentation/
 *
 * Free tier ceiling: 25 requests/day, 5/min. We treat AV as a third-tier
 * fallback (after Yahoo, before Stooq) and burn the daily budget very
 * conservatively:
 *
 *   - Module-scope success cache (1 hour TTL for daily, 5 min for quotes)
 *   - Process-wide daily-budget guard: stops calling once we've used 22
 *     calls in the rolling 24h window (we keep 3 in reserve for the user's
 *     manual symbol changes)
 *   - 5/min throttle: serialize requests with a min spacing of 13 sec
 *     (≈ 4.6 req/min — under the free-tier limit with margin)
 *
 * Endpoints we use (all FREE):
 *   TIME_SERIES_DAILY        - compact (last ~100 daily bars)
 *   GLOBAL_QUOTE             - last close (EOD only on free tier)
 *
 * Endpoints we deliberately skip:
 *   TIME_SERIES_INTRADAY     - premium
 *   REALTIME_BULK_QUOTES     - premium
 *   MACD/VWAP                - premium
 *
 * Symbol convention: AV uses bare US tickers (AAPL, MSFT) and dotted
 * exchange codes for non-US (TSCO.LON, RELIANCE.BSE). Indices use SPX
 * (S&P 500), DJI (Dow), COMP (Nasdaq Composite), etc., but those are
 * premium-only via INDEX_DATA so we map index symbols to their ETF
 * equivalent (^GSPC → SPY) for the free-tier daily endpoint.
 */

const BASE = "https://www.alphavantage.co/query";

function getKey(): string | null {
  return process.env.ALPHA_VANTAGE_API_KEY?.trim() || null;
}

// ============================================================================
// Daily budget guard (rolling 24h)
// ============================================================================

const DAILY_BUDGET = 22; // keep 3 in reserve under the 25/day free cap
const callTimestamps: number[] = []; // unix ms of every successful call

function canSpendCall(): boolean {
  const now = Date.now();
  const cutoff = now - 24 * 3600 * 1000;
  // Drop entries older than 24h
  while (callTimestamps.length > 0 && callTimestamps[0] < cutoff) {
    callTimestamps.shift();
  }
  return callTimestamps.length < DAILY_BUDGET;
}

function recordCall() {
  callTimestamps.push(Date.now());
}

// ============================================================================
// 5/min throttle: enforce ≥13s spacing between calls
// ============================================================================

let lastCallAt = 0;
const MIN_SPACING_MS = 13_000;

async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_SPACING_MS) {
    await new Promise((r) => setTimeout(r, MIN_SPACING_MS - elapsed));
  }
  lastCallAt = Date.now();
}

// ============================================================================
// Symbol normalization
// ============================================================================

/**
 * Translate willBB-style symbols to Alpha Vantage's expected form.
 * Yahoo-style index symbols (^GSPC, ^IXIC) are not on the AV free tier so
 * we substitute the corresponding ETF that tracks the index. Crypto pairs
 * (BTC-USD) aren't supported by TIME_SERIES_DAILY at all (would need
 * DIGITAL_CURRENCY_DAILY) so we skip them and let the caller fall through
 * to CoinGecko.
 */
export function toAlphaVantageSymbol(symbol: string): string | null {
  const u = symbol.toUpperCase();
  // Index → tracking ETF (free tier compatible)
  const indexMap: Record<string, string> = {
    "^GSPC": "SPY",
    "^IXIC": "QQQ",
    "^DJI": "DIA",
    "^RUT": "IWM",
    "^VIX": "VIXY", // proxy ETF; AV doesn't ship VIX on free tier
  };
  if (indexMap[u]) return indexMap[u];
  // Crypto / FX / futures - not free-tier on TIME_SERIES_DAILY
  if (u.endsWith("-USD")) return null;
  if (u.endsWith("=X") || u.endsWith("=F")) return null;
  if (u.startsWith("^")) return null;
  return u;
}

// ============================================================================
// TIME_SERIES_DAILY (free, compact = last ~100 daily bars)
// ============================================================================

export interface AVDailyBar {
  t: number; // unix seconds (16:00 UTC of the trading day)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface DailyResponse {
  "Meta Data"?: Record<string, string>;
  "Time Series (Daily)"?: Record<
    string,
    {
      "1. open": string;
      "2. high": string;
      "3. low": string;
      "4. close": string;
      "5. volume": string;
    }
  >;
  Note?: string; // "Thank you for using Alpha Vantage! ... 25 requests per day"
  Information?: string; // free-tier limit message
  "Error Message"?: string;
}

const dailyCache = new Map<string, { bars: AVDailyBar[]; at: number }>();
const DAILY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch daily bars (last ~100 trading days) for a US-listed equity or ETF.
 * Returns null if AV is unavailable, the symbol is unsupported, the daily
 * budget is exhausted, or the rate limit fires.
 */
export async function alphaVantageDaily(symbol: string): Promise<AVDailyBar[] | null> {
  const key = getKey();
  if (!key) return null;
  const avSym = toAlphaVantageSymbol(symbol);
  if (!avSym) return null;

  // Hot cache hit
  const cached = dailyCache.get(avSym);
  if (cached && Date.now() - cached.at < DAILY_CACHE_TTL) {
    return cached.bars;
  }

  if (!canSpendCall()) return null;

  await throttle();
  try {
    const url = `${BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
      avSym
    )}&outputsize=compact&datatype=json&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DailyResponse;
    if (data.Note || data.Information || data["Error Message"]) return null;
    const series = data["Time Series (Daily)"];
    if (!series) return null;
    const dates = Object.keys(series).sort(); // oldest → newest
    const bars: AVDailyBar[] = [];
    for (const d of dates) {
      const row = series[d];
      const o = parseFloat(row["1. open"]);
      const h = parseFloat(row["2. high"]);
      const l = parseFloat(row["3. low"]);
      const c = parseFloat(row["4. close"]);
      const v = parseFloat(row["5. volume"]);
      if (!Number.isFinite(c)) continue;
      // 16:00 UTC stamp aligns with US market close (mostly), and matches the
      // convention used by stooq.ts so the chart x-axis line up between sources.
      const t = Math.floor(new Date(d + "T16:00:00Z").getTime() / 1000);
      bars.push({ t, o, h, l, c, v });
    }
    if (bars.length === 0) return null;
    recordCall();
    dailyCache.set(avSym, { bars, at: Date.now() });
    return bars;
  } catch {
    return null;
  }
}

// ============================================================================
// GLOBAL_QUOTE (free, EOD)
// ============================================================================

export interface AVQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

interface GlobalQuoteResponse {
  "Global Quote"?: {
    "01. symbol": string;
    "02. open": string;
    "03. high": string;
    "04. low": string;
    "05. price": string;
    "06. volume": string;
    "07. latest trading day": string;
    "08. previous close": string;
    "09. change": string;
    "10. change percent": string;
  };
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}

const quoteCache = new Map<string, { row: AVQuote; at: number }>();
const QUOTE_CACHE_TTL = 5 * 60 * 1000; // 5 min — quote is EOD on free tier

export async function alphaVantageQuote(symbol: string): Promise<AVQuote | null> {
  const key = getKey();
  if (!key) return null;
  const avSym = toAlphaVantageSymbol(symbol);
  if (!avSym) return null;

  const cached = quoteCache.get(avSym);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_TTL) {
    return cached.row;
  }

  if (!canSpendCall()) return null;

  await throttle();
  try {
    const url = `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
      avSym
    )}&datatype=json&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GlobalQuoteResponse;
    if (data.Note || data.Information || data["Error Message"]) return null;
    const q = data["Global Quote"];
    if (!q) return null;
    const price = parseFloat(q["05. price"]);
    if (!Number.isFinite(price)) return null;
    const previousClose = parseFloat(q["08. previous close"]);
    const open = parseFloat(q["02. open"]);
    const high = parseFloat(q["03. high"]);
    const low = parseFloat(q["04. low"]);
    const volume = parseFloat(q["06. volume"]);
    const changePctRaw = (q["10. change percent"] || "").replace("%", "").trim();
    const changePct = parseFloat(changePctRaw);
    const row: AVQuote = {
      symbol: avSym,
      price,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      changePct: Number.isFinite(changePct) ? changePct : null,
      open: Number.isFinite(open) ? open : null,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      volume: Number.isFinite(volume) ? volume : null,
    };
    recordCall();
    quoteCache.set(avSym, { row, at: Date.now() });
    return row;
  } catch {
    return null;
  }
}

// ============================================================================
// Generic cached fetcher
//
// Used by every new endpoint below. Centralizes:
//   - Per-key cache (with configurable TTL per call site)
//   - Budget check before any upstream hit
//   - 5/min throttle
//   - Soft error suppression (returns null instead of throwing)
//
// On a cache hit we DO NOT spend a call. Only fresh upstream fetches count
// against the rolling 24h budget.
// ============================================================================

interface GenericCache<T> {
  data: T;
  at: number;
}
const genericCache = new Map<string, GenericCache<unknown>>();

async function cachedAVCall<T>(
  cacheKey: string,
  ttlMs: number,
  url: string,
  parse: (data: unknown) => T | null,
  opts: { forceCsv?: boolean } = {}
): Promise<T | null> {
  const key = getKey();
  if (!key) return null;
  // Hot cache hit
  const c = genericCache.get(cacheKey);
  if (c && Date.now() - c.at < ttlMs) return c.data as T;
  if (!canSpendCall()) return null;
  await throttle();
  try {
    const finalUrl = url + (url.includes("?") ? "&" : "?") + `apikey=${encodeURIComponent(key)}`;
    const res = await fetch(finalUrl, {
      headers: { Accept: opts.forceCsv ? "text/csv,*/*" : "application/json" },
      next: { revalidate: Math.floor(ttlMs / 1000) },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    const isCsv = opts.forceCsv || ct.includes("text/csv") || ct.includes("application/x-download") || url.includes("datatype=csv");
    let data: unknown;
    if (isCsv) {
      const text = await res.text();
      // AV's rate-limit message comes back as plain text starting with
      // "Information:" or "Note:" — check that before treating as CSV.
      if (/^\s*(Information|Note|Error Message)\s*[:{]/i.test(text)) return null;
      data = text;
    } else {
      data = await res.json();
      // AV returns 200 with body { Note | Information | Error Message }
      // when rate-limited or invalid — suppress those.
      const obj = data as Record<string, unknown>;
      if (obj.Note || obj.Information || obj["Error Message"]) return null;
    }
    const parsed = parse(data);
    if (parsed == null) return null;
    recordCall();
    genericCache.set(cacheKey, { data: parsed as unknown, at: Date.now() });
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// NEWS_SENTIMENT — Alpha Intelligence™ news + LLM sentiment per ticker
// Free tier; up to 1000 articles per call. Cached 15 min per ticker set.
// ============================================================================

export interface AVNewsItem {
  title: string;
  url: string;
  time_published: string; // YYYYMMDDTHHMMSS UTC
  summary: string;
  source: string;
  source_domain: string;
  topics: { topic: string; relevance_score: string }[];
  overall_sentiment_score: number;
  overall_sentiment_label: "Bearish" | "Somewhat-Bearish" | "Neutral" | "Somewhat-Bullish" | "Bullish";
  ticker_sentiment?: {
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }[];
  banner_image?: string | null;
}

export async function alphaVantageNews(
  tickers: string,
  topics?: string,
  limit: number = 25
): Promise<AVNewsItem[] | null> {
  const params = new URLSearchParams({
    function: "NEWS_SENTIMENT",
    tickers,
    limit: String(limit),
    sort: "LATEST",
  });
  if (topics) params.set("topics", topics);
  const url = `https://www.alphavantage.co/query?${params.toString()}`;
  return cachedAVCall<AVNewsItem[]>(`news:${tickers}:${topics ?? ""}:${limit}`, 15 * 60_000, url, (d) => {
    const obj = d as { feed?: AVNewsItem[] };
    if (!obj?.feed) return null;
    return obj.feed.slice(0, limit);
  });
}

// ============================================================================
// SYMBOL_SEARCH — autocomplete-style ticker lookup
// Cached 10 min per query; debounce-friendly.
// ============================================================================

export interface AVSearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
  matchScore: number;
}

export async function alphaVantageSearch(keywords: string): Promise<AVSearchResult[] | null> {
  const q = keywords.trim();
  if (q.length < 1) return [];
  const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}`;
  return cachedAVCall<AVSearchResult[]>(`search:${q.toLowerCase()}`, 10 * 60_000, url, (d) => {
    const obj = d as { bestMatches?: Record<string, string>[] };
    if (!obj?.bestMatches) return null;
    return obj.bestMatches.map((m) => ({
      symbol: m["1. symbol"] ?? "",
      name: m["2. name"] ?? "",
      type: m["3. type"] ?? "",
      region: m["4. region"] ?? "",
      currency: m["8. currency"] ?? "USD",
      matchScore: parseFloat(m["9. matchScore"] ?? "0"),
    })).filter((r) => r.symbol);
  });
}

// ============================================================================
// EARNINGS_CALL_TRANSCRIPT — full transcript with paragraph-level sentiment
// Cached 30 days (immutable once published).
// ============================================================================

export interface AVTranscriptParagraph {
  speaker: string;
  title: string;
  content: string;
  sentiment: string; // "0.55" etc.
}

export async function alphaVantageTranscript(
  symbol: string,
  quarter: string
): Promise<{ symbol: string; quarter: string; transcript: AVTranscriptParagraph[] } | null> {
  const sym = toAlphaVantageSymbol(symbol);
  if (!sym) return null;
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${encodeURIComponent(sym)}&quarter=${encodeURIComponent(quarter)}`;
  return cachedAVCall(`transcript:${sym}:${quarter}`, 30 * 24 * 3600_000, url, (d) => {
    const obj = d as { symbol?: string; quarter?: string; transcript?: AVTranscriptParagraph[] };
    if (!obj?.transcript) return null;
    return { symbol: obj.symbol ?? sym, quarter: obj.quarter ?? quarter, transcript: obj.transcript };
  });
}

// ============================================================================
// INSIDER_TRANSACTIONS / INSTITUTIONAL_HOLDINGS — Smart Money panels
// Cached 6h (insider), 24h (institutional - quarterly filings).
// ============================================================================

export interface AVInsiderTxn {
  transaction_date: string;
  ticker: string;
  executive: string;
  executive_title: string;
  security_type: string;
  acquisition_or_disposal: string; // "A" | "D"
  shares: string;
  share_price: string;
}

export async function alphaVantageInsider(symbol: string): Promise<AVInsiderTxn[] | null> {
  const sym = toAlphaVantageSymbol(symbol);
  if (!sym) return null;
  const url = `https://www.alphavantage.co/query?function=INSIDER_TRANSACTIONS&symbol=${encodeURIComponent(sym)}`;
  return cachedAVCall<AVInsiderTxn[]>(`insider:${sym}`, 6 * 3600_000, url, (d) => {
    const obj = d as { data?: AVInsiderTxn[] };
    if (!obj?.data) return null;
    return obj.data;
  });
}

export interface AVInstitutionalHolder {
  holder: string;
  shares: string;
  market_value: string;
  percent_of_outstanding: string;
  reporting_date: string;
}

export async function alphaVantageInstitutional(symbol: string): Promise<AVInstitutionalHolder[] | null> {
  const sym = toAlphaVantageSymbol(symbol);
  if (!sym) return null;
  const url = `https://www.alphavantage.co/query?function=INSTITUTIONAL_HOLDINGS&symbol=${encodeURIComponent(sym)}`;
  return cachedAVCall<AVInstitutionalHolder[]>(`inst:${sym}`, 24 * 3600_000, url, (d) => {
    const obj = d as { data?: AVInstitutionalHolder[] };
    if (!obj?.data) return null;
    return obj.data;
  });
}

// ============================================================================
// MACRO INDICATORS — Treasury / Fed Funds / CPI / GDP / Inflation / Unemployment
// All return a flat time-series of {date, value}. Cached 24h.
// ============================================================================

export interface AVMacroPoint {
  date: string;
  value: number;
}

interface AVMacroResp {
  name?: string;
  interval?: string;
  unit?: string;
  data?: { date: string; value: string }[];
}

function parseMacroResp(d: unknown): AVMacroPoint[] | null {
  const obj = d as AVMacroResp;
  if (!obj?.data) return null;
  return obj.data
    .map((r) => ({ date: r.date, value: parseFloat(r.value) }))
    .filter((p) => Number.isFinite(p.value));
}

export async function alphaVantageTreasuryYield(
  maturity: "3month" | "2year" | "5year" | "7year" | "10year" | "30year" = "10year",
  interval: "daily" | "weekly" | "monthly" = "monthly"
): Promise<AVMacroPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=${interval}&maturity=${maturity}`;
  return cachedAVCall(`tsy:${maturity}:${interval}`, 24 * 3600_000, url, parseMacroResp);
}

export async function alphaVantageFedFunds(
  interval: "daily" | "weekly" | "monthly" = "monthly"
): Promise<AVMacroPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=FEDERAL_FUNDS_RATE&interval=${interval}`;
  return cachedAVCall(`fedfunds:${interval}`, 24 * 3600_000, url, parseMacroResp);
}

export async function alphaVantageCPI(
  interval: "monthly" | "semiannual" = "monthly"
): Promise<AVMacroPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=CPI&interval=${interval}`;
  return cachedAVCall(`cpi:${interval}`, 24 * 3600_000, url, parseMacroResp);
}

export async function alphaVantageRealGDP(
  interval: "annual" | "quarterly" = "quarterly"
): Promise<AVMacroPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=REAL_GDP&interval=${interval}`;
  return cachedAVCall(`gdp:${interval}`, 24 * 3600_000, url, parseMacroResp);
}

export async function alphaVantageInflation(): Promise<AVMacroPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=INFLATION`;
  return cachedAVCall("inflation", 7 * 24 * 3600_000, url, parseMacroResp);
}

export async function alphaVantageUnemployment(): Promise<AVMacroPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=UNEMPLOYMENT`;
  return cachedAVCall("unemployment", 24 * 3600_000, url, parseMacroResp);
}

// ============================================================================
// COMMODITIES & FX — spot prices for the Markets ticker tape
// ============================================================================

export interface AVCommodityPoint {
  date: string;
  value: number;
}

/**
 * Generic commodity series fetcher. Supported `fn` values: `WTI`, `BRENT`,
 * `NATURAL_GAS`, `COPPER`, `ALUMINUM`, `WHEAT`, `CORN`, `COTTON`, `SUGAR`,
 * `COFFEE`, `ALL_COMMODITIES`. Returns the most recent N points (default 60).
 */
export async function alphaVantageCommodity(
  fn: "WTI" | "BRENT" | "NATURAL_GAS" | "COPPER" | "ALUMINUM" | "WHEAT" | "CORN" | "COTTON" | "SUGAR" | "COFFEE" | "ALL_COMMODITIES",
  interval: "daily" | "weekly" | "monthly" | "quarterly" | "annual" = "monthly"
): Promise<AVCommodityPoint[] | null> {
  const url = `https://www.alphavantage.co/query?function=${fn}&interval=${interval}`;
  return cachedAVCall(`com:${fn}:${interval}`, 60 * 60_000, url, parseMacroResp);
}

/**
 * Gold / silver SPOT (live quote). Use `symbol="GOLD"` or `"SILVER"`.
 */
export async function alphaVantageGoldSilverSpot(
  symbol: "GOLD" | "SILVER" | "XAU" | "XAG"
): Promise<{ price: number; currency: string; timestamp: string } | null> {
  const url = `https://www.alphavantage.co/query?function=GOLD_SILVER_SPOT&symbol=${symbol}`;
  return cachedAVCall(`spot:${symbol}`, 5 * 60_000, url, (d) => {
    const obj = d as Record<string, unknown>;
    // Response shape varies; defensively pull common fields.
    const priceField = obj["price"] ?? obj["spot_price"] ?? obj["Realtime Spot Price"];
    const price = typeof priceField === "string" ? parseFloat(priceField) : Number(priceField);
    if (!Number.isFinite(price)) return null;
    return {
      price,
      currency: (obj["currency"] as string) ?? "USD",
      timestamp: (obj["timestamp"] as string) ?? new Date().toISOString(),
    };
  });
}

/**
 * FX exchange rate (free, real-time). Used in the Markets ticker tape for
 * EUR/USD, GBP/USD, USD/JPY, etc.
 */
export async function alphaVantageFX(
  from: string,
  to: string
): Promise<{ rate: number; from: string; to: string; timestamp: string } | null> {
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(from)}&to_currency=${encodeURIComponent(to)}`;
  return cachedAVCall(`fx:${from}:${to}`, 5 * 60_000, url, (d) => {
    const obj = d as { "Realtime Currency Exchange Rate"?: Record<string, string> };
    const r = obj["Realtime Currency Exchange Rate"];
    if (!r) return null;
    const rate = parseFloat(r["5. Exchange Rate"]);
    if (!Number.isFinite(rate)) return null;
    return {
      rate,
      from: r["1. From_Currency Code"] ?? from,
      to: r["3. To_Currency Code"] ?? to,
      timestamp: r["6. Last Refreshed"] ?? new Date().toISOString(),
    };
  });
}

// ============================================================================
// CALENDARS — Earnings + IPO (CSV format → row objects)
// ============================================================================

export interface AVEarningsCalRow {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: string;
  currency: string;
}

export async function alphaVantageEarningsCalendar(
  horizon: "3month" | "6month" | "12month" = "3month",
  symbol?: string
): Promise<AVEarningsCalRow[] | null> {
  const sp = new URLSearchParams({ function: "EARNINGS_CALENDAR", horizon });
  if (symbol) sp.set("symbol", symbol);
  const url = `https://www.alphavantage.co/query?${sp.toString()}`;
  return cachedAVCall<AVEarningsCalRow[]>(`earncal:${horizon}:${symbol ?? ""}`, 24 * 3600_000, url, (d) => {
    const csv = d as string;
    if (typeof csv !== "string" || !csv.includes(",")) return null;
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows: AVEarningsCalRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < 4) continue; // need at least symbol, name, reportDate, fiscalDateEnding
      const row = Object.fromEntries(headers.map((h, j) => [h, cols[j]?.trim() ?? ""]));
      rows.push({
        symbol: row.symbol ?? "",
        name: row.name ?? "",
        reportDate: row.reportDate ?? "",
        fiscalDateEnding: row.fiscalDateEnding ?? "",
        estimate: row.estimate ?? "",
        currency: row.currency ?? "USD",
      });
    }
    // Filter to rows that look like real calendar entries (reportDate is
    // YYYY-MM-DD). AV's free tier sometimes returns a malformed body of
    // ~80 bytes when calendars aren't available — those rows fail this check.
    return rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.reportDate));
  }, { forceCsv: true });
}

export interface AVIPOCalRow {
  symbol: string;
  name: string;
  ipoDate: string;
  priceRangeLow: string;
  priceRangeHigh: string;
  currency: string;
  exchange: string;
}

export async function alphaVantageIPOCalendar(): Promise<AVIPOCalRow[] | null> {
  const url = `https://www.alphavantage.co/query?function=IPO_CALENDAR`;
  return cachedAVCall<AVIPOCalRow[]>(`ipocal`, 24 * 3600_000, url, (d) => {
    const csv = d as string;
    if (typeof csv !== "string" || !csv.includes(",")) return null;
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows: AVIPOCalRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < 3) continue;
      const row = Object.fromEntries(headers.map((h, j) => [h, cols[j]?.trim() ?? ""]));
      rows.push({
        symbol: row.symbol ?? "",
        name: row.name ?? "",
        ipoDate: row.ipoDate ?? "",
        priceRangeLow: row.priceRangeLow ?? "",
        priceRangeHigh: row.priceRangeHigh ?? "",
        currency: row.currency ?? "USD",
        exchange: row.exchange ?? "",
      });
    }
    // Same dateshape check as earnings calendar: reject malformed rate-limit body.
    return rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.ipoDate));
  }, { forceCsv: true });
}

// ============================================================================
// MARKET_STATUS — global market open/close (multi-exchange)
// ============================================================================

export interface AVMarketStatus {
  market_type: string;
  region: string;
  primary_exchanges: string;
  local_open: string;
  local_close: string;
  current_status: string;
  notes: string;
}

export async function alphaVantageMarketStatus(): Promise<AVMarketStatus[] | null> {
  const url = `https://www.alphavantage.co/query?function=MARKET_STATUS`;
  return cachedAVCall(`mkstat`, 60 * 60_000, url, (d) => {
    const obj = d as { markets?: AVMarketStatus[] };
    if (!obj?.markets) return null;
    return obj.markets;
  });
}

/**
 * Diagnostic helper for the markets routes — exposes the rolling-24h call
 * count without leaking the key. Useful in /api/markets/health (not yet
 * wired) or for debugging "why isn't AV firing?".
 */
export function alphaVantageBudgetState() {
  const now = Date.now();
  const cutoff = now - 24 * 3600 * 1000;
  while (callTimestamps.length > 0 && callTimestamps[0] < cutoff) {
    callTimestamps.shift();
  }
  return {
    keyPresent: !!getKey(),
    callsLast24h: callTimestamps.length,
    budget: DAILY_BUDGET,
    canSpend: callTimestamps.length < DAILY_BUDGET,
    cacheEntries: genericCache.size,
  };
}

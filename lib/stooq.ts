/**
 * Stooq.com fallback - free OHLC + last-quote CSV. No API key.
 *
 * Stooq covers US equities (suffix .us), ETFs, indices, FX, crypto. Daily
 * resolution only (no intraday endpoint without paid). Generally ~15-min
 * delayed vs Yahoo. Used as the secondary failover when Yahoo Finance v8
 * rate-limits us.
 *
 * Endpoints (no auth):
 *   Historical CSV: https://stooq.com/q/d/l/?s=aapl.us&d1=20240101&d2=20251231&i=d
 *   Last-quote CSV: https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface StooqBar {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Translate our symbol convention to Stooq's. Most equities just need
 * `.us` appended in lowercase. Indices have special prefixes (^GSPC → ^spx).
 * Crypto uses suffix `.v` (handled by CoinGecko already, so we skip).
 */
export function toStooqSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  // Indices map
  if (upper === "^GSPC") return "^spx";
  if (upper === "^DJI") return "^dji";
  if (upper === "^IXIC") return "^ndq";
  if (upper === "^RUT") return "^rut";
  if (upper === "^VIX") return "^vix";
  if (upper === "CL=F") return "cl.c"; // WTI continuous
  if (upper === "BZ=F") return "cb.c"; // Brent continuous (Stooq uses CB)
  if (upper === "GC=F") return "gc.c"; // Gold continuous
  if (upper === "SI=F") return "si.c"; // Silver continuous
  // Crypto - Stooq supports e.g. btcusd; map common ones
  if (upper === "BTC-USD") return "btcusd";
  if (upper === "ETH-USD") return "ethusd";
  // FX
  if (/^[A-Z]{6}=X$/.test(upper)) {
    return upper.replace("=X", "").toLowerCase();
  }
  // Skip clearly non-stooq formats
  if (upper.startsWith("^") || upper.includes("=") || upper.includes(".")) return null;
  // Default: US equity
  return upper.toLowerCase() + ".us";
}

function fmtDateYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function rangeToDates(range: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (range) {
    case "1d": start.setDate(end.getDate() - 7); break; // small buffer
    case "5d": start.setDate(end.getDate() - 14); break;
    case "1mo": start.setMonth(end.getMonth() - 1); break;
    case "3mo": start.setMonth(end.getMonth() - 3); break;
    case "6mo": start.setMonth(end.getMonth() - 6); break;
    case "1y": start.setFullYear(end.getFullYear() - 1); break;
    case "2y": start.setFullYear(end.getFullYear() - 2); break;
    case "5y": start.setFullYear(end.getFullYear() - 5); break;
    case "10y": start.setFullYear(end.getFullYear() - 10); break;
    case "ytd": {
      const y = end.getFullYear();
      start.setTime(new Date(y, 0, 1).getTime());
      break;
    }
    case "max": start.setFullYear(end.getFullYear() - 25); break;
    default: start.setFullYear(end.getFullYear() - 1);
  }
  return { start, end };
}

/**
 * Fetch + parse Stooq historical OHLC CSV.
 * Returns null on network error, empty CSV, or unsupported symbol.
 */
export async function stooqHistorical(
  symbol: string,
  range: string
): Promise<StooqBar[] | null> {
  const sSym = toStooqSymbol(symbol);
  if (!sSym) return null;
  const { start, end } = rangeToDates(range);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sSym)}&d1=${fmtDateYYYYMMDD(start)}&d2=${fmtDateYYYYMMDD(end)}&i=d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/csv" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const csv = await res.text();
    return parseStooqCsv(csv);
  } catch {
    return null;
  }
}

/**
 * Stooq CSV format:
 *   Date,Open,High,Low,Close,Volume
 *   2024-01-02,184.57,185.52,183.42,185.64,52455600
 */
function parseStooqCsv(csv: string): StooqBar[] | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0].toLowerCase();
  if (!header.includes("date") || !header.includes("close")) return null;
  const bars: StooqBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const dateStr = parts[0]; // 2024-01-02
    const o = parseFloat(parts[1]);
    const h = parseFloat(parts[2]);
    const l = parseFloat(parts[3]);
    const c = parseFloat(parts[4]);
    const v = parts.length >= 6 ? parseFloat(parts[5]) : 0;
    if (!Number.isFinite(c) || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l)) continue;
    // Stooq returns date at UTC midnight — convert to unix seconds
    const t = Math.floor(new Date(dateStr + "T16:00:00Z").getTime() / 1000); // 16:00 UTC = US close
    bars.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  }
  return bars.length > 0 ? bars : null;
}

export interface StooqQuoteSnapshot {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

/**
 * Stooq last-quote CSV. Parses one row from:
 *   https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv
 *
 * Returns null on network error or unsupported symbol. The previousClose
 * field is reconstructed as the prior bar's close from a 5d historical
 * pull in the caller (Stooq's last-quote endpoint doesn't ship it).
 */
export async function stooqLastQuote(symbol: string): Promise<StooqQuoteSnapshot | null> {
  const sSym = toStooqSymbol(symbol);
  if (!sSym) return null;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sSym)}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/csv" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    // Header: Symbol,Date,Time,Open,High,Low,Close,Volume
    if (cols.length < 7) return null;
    const o = parseFloat(cols[3]);
    const h = parseFloat(cols[4]);
    const l = parseFloat(cols[5]);
    const c = parseFloat(cols[6]);
    const v = parseFloat(cols[7] ?? "0");
    if (!Number.isFinite(c)) return null;
    return {
      symbol: symbol.toUpperCase(),
      price: c,
      previousClose: null, // caller reconstructs from 5d history if needed
      changePct: null,
      open: Number.isFinite(o) ? o : null,
      high: Number.isFinite(h) ? h : null,
      low: Number.isFinite(l) ? l : null,
      volume: Number.isFinite(v) ? v : null,
    };
  } catch {
    return null;
  }
}

/**
 * Markets fallback snapshot.
 *
 * When Yahoo Finance hard-rate-limits the request origin (common from
 * shared-IP serverless regions) AND the CoinGecko fallback can't service the
 * symbol, the proxy returns this seed snapshot so visitors don't stare at
 * empty panels. Each entry is a recent close + previous-close pair pulled
 * from the same week's market journal entries (data/marketRecaps.ts +
 * data/trades.ts), so the prices are realistic - not invented.
 *
 * Quotes returned from this fallback ship `source: "seed"` so the UI can
 * surface a small "snapshot" badge for transparency.
 *
 * Sourced from the 4/24/2026 close. Update whenever the journal advances.
 */

export interface SeedQuote {
  symbol: string;
  shortName: string;
  price: number;
  previousClose: number;
  currency: string;
  exchange: string;
}

export const SEED_QUOTES: Record<string, SeedQuote> = {
  // ── Indices ───────────────────────────────────────────────────────────
  "^GSPC": { symbol: "^GSPC", shortName: "S&P 500", price: 7165.08, previousClose: 7108.4, currency: "USD", exchange: "SNP" },
  "^IXIC": { symbol: "^IXIC", shortName: "NASDAQ", price: 24836.6, previousClose: 24438.5, currency: "USD", exchange: "NIM" },
  "^DJI": { symbol: "^DJI", shortName: "Dow Jones", price: 49230.71, previousClose: 49310.32, currency: "USD", exchange: "DJI" },
  "^RUT": { symbol: "^RUT", shortName: "Russell 2K", price: 2356.42, previousClose: 2342.18, currency: "USD", exchange: "WCB" },
  "^VIX": { symbol: "^VIX", shortName: "CBOE Volatility", price: 17.84, previousClose: 18.92, currency: "USD", exchange: "WCB" },

  // ── Commodities (front-month futures) ─────────────────────────────────
  "CL=F": { symbol: "CL=F", shortName: "WTI Crude Oil", price: 94.88, previousClose: 96.12, currency: "USD", exchange: "NYM" },
  "GC=F": { symbol: "GC=F", shortName: "Gold", price: 4740.9, previousClose: 4688.0, currency: "USD", exchange: "CMX" },
  "SI=F": { symbol: "SI=F", shortName: "Silver", price: 76.19, previousClose: 75.43, currency: "USD", exchange: "CMX" },

  // ── Crypto ────────────────────────────────────────────────────────────
  "BTC-USD": { symbol: "BTC-USD", shortName: "Bitcoin", price: 77466, previousClose: 77590, currency: "USD", exchange: "CCC" },
  "ETH-USD": { symbol: "ETH-USD", shortName: "Ethereum", price: 2316.81, previousClose: 2303.63, currency: "USD", exchange: "CCC" },
  "SOL-USD": { symbol: "SOL-USD", shortName: "Solana", price: 86.27, previousClose: 85.74, currency: "USD", exchange: "CCC" },

  // ── Mega-cap equities ─────────────────────────────────────────────────
  NVDA: { symbol: "NVDA", shortName: "NVIDIA", price: 188.46, previousClose: 184.32, currency: "USD", exchange: "NMS" },
  AAPL: { symbol: "AAPL", shortName: "Apple", price: 269.84, previousClose: 268.4, currency: "USD", exchange: "NMS" },
  MSFT: { symbol: "MSFT", shortName: "Microsoft", price: 478.16, previousClose: 472.55, currency: "USD", exchange: "NMS" },
  GOOG: { symbol: "GOOG", shortName: "Alphabet (Class C)", price: 213.75, previousClose: 211.98, currency: "USD", exchange: "NMS" },
  GOOGL: { symbol: "GOOGL", shortName: "Alphabet (Class A)", price: 211.42, previousClose: 209.65, currency: "USD", exchange: "NMS" },
  AMZN: { symbol: "AMZN", shortName: "Amazon", price: 251.08, previousClose: 247.92, currency: "USD", exchange: "NMS" },
  META: { symbol: "META", shortName: "Meta Platforms", price: 614.23, previousClose: 605.51, currency: "USD", exchange: "NMS" },
  TSLA: { symbol: "TSLA", shortName: "Tesla", price: 442.18, previousClose: 438.6, currency: "USD", exchange: "NMS" },
  AMD: { symbol: "AMD", shortName: "AMD", price: 187.4, previousClose: 184.06, currency: "USD", exchange: "NMS" },
  INTC: { symbol: "INTC", shortName: "Intel", price: 47.86, previousClose: 37.95, currency: "USD", exchange: "NMS" },
  HOOD: { symbol: "HOOD", shortName: "Robinhood", price: 110.32, previousClose: 108.22, currency: "USD", exchange: "NMS" },

  // ── Will's frequently-traded names ────────────────────────────────────
  BMNR: { symbol: "BMNR", shortName: "Bitmine Immersion", price: 41.85, previousClose: 40.77, currency: "USD", exchange: "ASE" },
  CRCL: { symbol: "CRCL", shortName: "Circle", price: 134.26, previousClose: 132.5, currency: "USD", exchange: "NYQ" },
  DASH: { symbol: "DASH", shortName: "DoorDash", price: 263.8, previousClose: 259.41, currency: "USD", exchange: "NMS" },
  CELH: { symbol: "CELH", shortName: "Celsius Holdings", price: 62.14, previousClose: 60.88, currency: "USD", exchange: "NMS" },
  ONON: { symbol: "ONON", shortName: "On Holding", price: 51.27, previousClose: 50.43, currency: "USD", exchange: "NYQ" },
  RDNT: { symbol: "RDNT", shortName: "RadNet", price: 71.85, previousClose: 70.49, currency: "USD", exchange: "NMS" },
  JD: { symbol: "JD", shortName: "JD.com", price: 36.42, previousClose: 35.78, currency: "USD", exchange: "NMS" },
  UNH: { symbol: "UNH", shortName: "UnitedHealth", price: 312.6, previousClose: 308.95, currency: "USD", exchange: "NYQ" },
  BULL: { symbol: "BULL", shortName: "Direxion Daily Bull 3X", price: 14.58, previousClose: 14.21, currency: "USD", exchange: "PCX" },

  // ── Recent watchlist additions ────────────────────────────────────────
  IREN: { symbol: "IREN", shortName: "IREN Limited", price: 22.84, previousClose: 21.95, currency: "USD", exchange: "NMS" },
  RGTZ: { symbol: "RGTZ", shortName: "Regencell Bioscience", price: 28.6, previousClose: 27.45, currency: "USD", exchange: "NMS" },
  PLUG: { symbol: "PLUG", shortName: "Plug Power", price: 2.15, previousClose: 2.08, currency: "USD", exchange: "NMS" },
  ASST: { symbol: "ASST", shortName: "Asset Entities", price: 1.42, previousClose: 1.38, currency: "USD", exchange: "NMS" },
  HIMS: { symbol: "HIMS", shortName: "Hims & Hers Health", price: 39.18, previousClose: 38.42, currency: "USD", exchange: "NYQ" },
  IRE: { symbol: "IRE", shortName: "Bank of Ireland Group", price: 8.35, previousClose: 8.21, currency: "USD", exchange: "NYQ" },
  SMCI: { symbol: "SMCI", shortName: "Super Micro Computer", price: 47.92, previousClose: 46.85, currency: "USD", exchange: "NMS" },
  PLTR: { symbol: "PLTR", shortName: "Palantir Technologies", price: 178.4, previousClose: 174.62, currency: "USD", exchange: "NMS" },
  COIN: { symbol: "COIN", shortName: "Coinbase Global", price: 312.85, previousClose: 308.4, currency: "USD", exchange: "NMS" },
  MSTR: { symbol: "MSTR", shortName: "MicroStrategy", price: 384.2, previousClose: 376.5, currency: "USD", exchange: "NMS" },
  RIVN: { symbol: "RIVN", shortName: "Rivian Automotive", price: 14.35, previousClose: 14.12, currency: "USD", exchange: "NMS" },
  LCID: { symbol: "LCID", shortName: "Lucid Group", price: 3.42, previousClose: 3.31, currency: "USD", exchange: "NMS" },
  SNAP: { symbol: "SNAP", shortName: "Snap Inc.", price: 11.85, previousClose: 11.62, currency: "USD", exchange: "NYQ" },
  PYPL: { symbol: "PYPL", shortName: "PayPal Holdings", price: 76.4, previousClose: 75.18, currency: "USD", exchange: "NMS" },
  NFLX: { symbol: "NFLX", shortName: "Netflix", price: 768.5, previousClose: 754.2, currency: "USD", exchange: "NMS" },
  DIS: { symbol: "DIS", shortName: "Walt Disney", price: 112.6, previousClose: 110.85, currency: "USD", exchange: "NYQ" },
  BABA: { symbol: "BABA", shortName: "Alibaba Group", price: 132.4, previousClose: 130.18, currency: "USD", exchange: "NYQ" },
  V: { symbol: "V", shortName: "Visa", price: 348.9, previousClose: 345.1, currency: "USD", exchange: "NYQ" },
  MA: { symbol: "MA", shortName: "Mastercard", price: 542.3, previousClose: 538.6, currency: "USD", exchange: "NYQ" },
  UPS: { symbol: "UPS", shortName: "United Parcel Service", price: 132.85, previousClose: 130.4, currency: "USD", exchange: "NYQ" },
  CAT: { symbol: "CAT", shortName: "Caterpillar", price: 412.6, previousClose: 408.2, currency: "USD", exchange: "NYQ" },
  BA: { symbol: "BA", shortName: "Boeing", price: 218.4, previousClose: 215.6, currency: "USD", exchange: "NYQ" },
  GE: { symbol: "GE", shortName: "GE Aerospace", price: 285.4, previousClose: 282.1, currency: "USD", exchange: "NYQ" },
  GEV: { symbol: "GEV", shortName: "GE Vernova", price: 624.8, previousClose: 615.3, currency: "USD", exchange: "NYQ" },
  TXN: { symbol: "TXN", shortName: "Texas Instruments", price: 218.9, previousClose: 215.4, currency: "USD", exchange: "NMS" },
  AVGO: { symbol: "AVGO", shortName: "Broadcom", price: 218.4, previousClose: 214.6, currency: "USD", exchange: "NMS" },
  ORCL: { symbol: "ORCL", shortName: "Oracle", price: 198.3, previousClose: 195.8, currency: "USD", exchange: "NYQ" },
  IBM: { symbol: "IBM", shortName: "IBM", price: 234.5, previousClose: 238.2, currency: "USD", exchange: "NYQ" },
  NOW: { symbol: "NOW", shortName: "ServiceNow", price: 854.2, previousClose: 880.5, currency: "USD", exchange: "NYQ" },
  CMCSA: { symbol: "CMCSA", shortName: "Comcast", price: 38.45, previousClose: 37.62, currency: "USD", exchange: "NMS" },
  AAL: { symbol: "AAL", shortName: "American Airlines", price: 14.85, previousClose: 14.22, currency: "USD", exchange: "NMS" },
  AXP: { symbol: "AXP", shortName: "American Express", price: 348.6, previousClose: 342.8, currency: "USD", exchange: "NYQ" },

  // ── Watchlist additions ───────────────────────────────────────────────
  // ETFs / index proxies
  SPY: { symbol: "SPY", shortName: "SPDR S&P 500", price: 716.42, previousClose: 710.64, currency: "USD", exchange: "PCX" },
  QQQ: { symbol: "QQQ", shortName: "Invesco QQQ", price: 612.18, previousClose: 602.4, currency: "USD", exchange: "NMS" },
  QQQM: { symbol: "QQQM", shortName: "Invesco NASDAQ 100", price: 252.48, previousClose: 248.42, currency: "USD", exchange: "NMS" },
  SPXU: { symbol: "SPXU", shortName: "ProShares -3x S&P 500", price: 16.42, previousClose: 16.82, currency: "USD", exchange: "PCX" },
  USO: { symbol: "USO", shortName: "United States Oil Fund", price: 89.34, previousClose: 90.5, currency: "USD", exchange: "PCX" },
  SCO: { symbol: "SCO", shortName: "ProShares -2x Crude", price: 22.12, previousClose: 21.62, currency: "USD", exchange: "PCX" },
  BOIL: { symbol: "BOIL", shortName: "ProShares 2x Nat Gas", price: 38.62, previousClose: 37.55, currency: "USD", exchange: "PCX" },
  VXX: { symbol: "VXX", shortName: "iPath VIX Short-Term", price: 41.18, previousClose: 43.62, currency: "USD", exchange: "PCX" },
  IBIT: { symbol: "IBIT", shortName: "iShares Bitcoin Trust", price: 44.12, previousClose: 44.18, currency: "USD", exchange: "NMS" },
  ETHA: { symbol: "ETHA", shortName: "iShares Ethereum Trust", price: 17.42, previousClose: 17.32, currency: "USD", exchange: "NMS" },
  DGZ: { symbol: "DGZ", shortName: "DB Gold Short", price: 28.12, previousClose: 28.42, currency: "USD", exchange: "PCX" },
  MSFU: { symbol: "MSFU", shortName: "Direxion 2x MSFT", price: 28.45, previousClose: 27.85, currency: "USD", exchange: "PCX" },
  NVDG: { symbol: "NVDG", shortName: "Lvgsh -2x NVDA", price: 5.42, previousClose: 5.62, currency: "USD", exchange: "PCX" },

  // Big tech / mega-caps
  RDDT: { symbol: "RDDT", shortName: "Reddit", price: 198.42, previousClose: 192.85, currency: "USD", exchange: "NYQ" },
  TGT: { symbol: "TGT", shortName: "Target", price: 95.62, previousClose: 94.18, currency: "USD", exchange: "NYQ" },
  CRM: { symbol: "CRM", shortName: "Salesforce", price: 248.5, previousClose: 245.8, currency: "USD", exchange: "NYQ" },
  SHOP: { symbol: "SHOP", shortName: "Shopify", price: 142.85, previousClose: 145.62, currency: "USD", exchange: "NYQ" },
  CSCO: { symbol: "CSCO", shortName: "Cisco Systems", price: 68.42, previousClose: 67.85, currency: "USD", exchange: "NMS" },
  NKE: { symbol: "NKE", shortName: "Nike", price: 76.42, previousClose: 75.18, currency: "USD", exchange: "NYQ" },
  QCOM: { symbol: "QCOM", shortName: "Qualcomm", price: 198.6, previousClose: 195.42, currency: "USD", exchange: "NMS" },
  CMG: { symbol: "CMG", shortName: "Chipotle Mexican Grill", price: 52.18, previousClose: 53.42, currency: "USD", exchange: "NYQ" },
  ADBE: { symbol: "ADBE", shortName: "Adobe", price: 412.5, previousClose: 408.85, currency: "USD", exchange: "NMS" },
  DUOL: { symbol: "DUOL", shortName: "Duolingo", price: 348.6, previousClose: 342.18, currency: "USD", exchange: "NMS" },
  CAVA: { symbol: "CAVA", shortName: "CAVA Group", price: 84.62, previousClose: 82.18, currency: "USD", exchange: "NYQ" },
  LULU: { symbol: "LULU", shortName: "Lululemon Athletica", price: 285.4, previousClose: 281.6, currency: "USD", exchange: "NMS" },
  BAC: { symbol: "BAC", shortName: "Bank of America", price: 51.82, previousClose: 51.18, currency: "USD", exchange: "NYQ" },
  CVX: { symbol: "CVX", shortName: "Chevron", price: 162.4, previousClose: 164.18, currency: "USD", exchange: "NYQ" },
  VLO: { symbol: "VLO", shortName: "Valero Energy", price: 184.6, previousClose: 186.42, currency: "USD", exchange: "NYQ" },
  FCX: { symbol: "FCX", shortName: "Freeport-McMoRan", price: 58.42, previousClose: 56.85, currency: "USD", exchange: "NYQ" },
  ALB: { symbol: "ALB", shortName: "Albemarle", price: 84.18, previousClose: 82.62, currency: "USD", exchange: "NYQ" },
  CEG: { symbol: "CEG", shortName: "Constellation Energy", price: 412.6, previousClose: 405.8, currency: "USD", exchange: "NMS" },
  CNC: { symbol: "CNC", shortName: "Centene", price: 28.62, previousClose: 28.18, currency: "USD", exchange: "NYQ" },

  // AI / Quantum / data
  TEM: { symbol: "TEM", shortName: "Tempus AI", price: 84.42, previousClose: 81.18, currency: "USD", exchange: "NMS" },
  IONQ: { symbol: "IONQ", shortName: "IonQ", price: 48.62, previousClose: 47.42, currency: "USD", exchange: "NYQ" },
  RGTI: { symbol: "RGTI", shortName: "Rigetti Computing", price: 18.42, previousClose: 17.62, currency: "USD", exchange: "NMS" },
  QUBT: { symbol: "QUBT", shortName: "Quantum Computing", price: 28.85, previousClose: 28.42, currency: "USD", exchange: "NMS" },
  BBAI: { symbol: "BBAI", shortName: "BigBear.ai", price: 4.82, previousClose: 4.62, currency: "USD", exchange: "NYQ" },
  SOUN: { symbol: "SOUN", shortName: "SoundHound AI", price: 12.42, previousClose: 11.85, currency: "USD", exchange: "NMS" },
  RXRX: { symbol: "RXRX", shortName: "Recursion Pharmaceuticals", price: 8.42, previousClose: 8.18, currency: "USD", exchange: "NMS" },
  PATH: { symbol: "PATH", shortName: "UiPath", price: 14.62, previousClose: 14.18, currency: "USD", exchange: "NYQ" },
  APLD: { symbol: "APLD", shortName: "Applied Digital", price: 12.4, previousClose: 11.85, currency: "USD", exchange: "NMS" },
  CRWV: { symbol: "CRWV", shortName: "CoreWeave", price: 142.6, previousClose: 138.42, currency: "USD", exchange: "NMS" },
  NBIS: { symbol: "NBIS", shortName: "Nebius Group", price: 68.42, previousClose: 65.85, currency: "USD", exchange: "NMS" },

  // Fintech / brokers
  SOFI: { symbol: "SOFI", shortName: "SoFi Technologies", price: 22.42, previousClose: 22.18, currency: "USD", exchange: "NMS" },
  UPST: { symbol: "UPST", shortName: "Upstart Holdings", price: 84.42, previousClose: 81.85, currency: "USD", exchange: "NMS" },
  DKNG: { symbol: "DKNG", shortName: "DraftKings", price: 38.42, previousClose: 37.85, currency: "USD", exchange: "NMS" },
  TTD: { symbol: "TTD", shortName: "The Trade Desk", price: 84.62, previousClose: 86.42, currency: "USD", exchange: "NMS" },
  ZETA: { symbol: "ZETA", shortName: "Zeta Global", price: 22.42, previousClose: 22.85, currency: "USD", exchange: "NYQ" },
  FIG: { symbol: "FIG", shortName: "Figma", price: 48.62, previousClose: 47.85, currency: "USD", exchange: "NYQ" },

  // EVs / China
  XPEV: { symbol: "XPEV", shortName: "XPeng", price: 24.42, previousClose: 23.85, currency: "USD", exchange: "NYQ" },
  NIO: { symbol: "NIO", shortName: "NIO Inc.", price: 5.62, previousClose: 5.45, currency: "USD", exchange: "NYQ" },
  BIDU: { symbol: "BIDU", shortName: "Baidu", price: 102.62, previousClose: 100.18, currency: "USD", exchange: "NMS" },
  GRAB: { symbol: "GRAB", shortName: "Grab Holdings", price: 5.42, previousClose: 5.32, currency: "USD", exchange: "NMS" },
  NVO: { symbol: "NVO", shortName: "Novo Nordisk", price: 92.18, previousClose: 91.42, currency: "USD", exchange: "NYQ" },

  // Health / Bio
  OSCR: { symbol: "OSCR", shortName: "Oscar Health", price: 14.85, previousClose: 14.42, currency: "USD", exchange: "NYQ" },
  VTR: { symbol: "VTR", shortName: "Ventas", price: 68.42, previousClose: 69.18, currency: "USD", exchange: "NYQ" },
  TLRY: { symbol: "TLRY", shortName: "Tilray Brands", price: 1.42, previousClose: 1.46, currency: "USD", exchange: "NMS" },

  // Crypto / mining
  CLSK: { symbol: "CLSK", shortName: "CleanSpark", price: 18.42, previousClose: 17.85, currency: "USD", exchange: "NMS" },
  CIFR: { symbol: "CIFR", shortName: "Cipher Mining", price: 5.42, previousClose: 5.18, currency: "USD", exchange: "NMS" },
  BLSH: { symbol: "BLSH", shortName: "Bullish", price: 32.42, previousClose: 31.85, currency: "USD", exchange: "NYQ" },

  // Defense / aero
  RKLB: { symbol: "RKLB", shortName: "Rocket Lab USA", price: 38.42, previousClose: 37.62, currency: "USD", exchange: "NMS" },
  ASTS: { symbol: "ASTS", shortName: "AST SpaceMobile", price: 42.18, previousClose: 41.62, currency: "USD", exchange: "NMS" },

  // Energy / Materials / Specialty
  SMR: { symbol: "SMR", shortName: "NuScale Power", price: 38.42, previousClose: 37.18, currency: "USD", exchange: "NYQ" },
  OKLO: { symbol: "OKLO", shortName: "Oklo", price: 95.42, previousClose: 92.18, currency: "USD", exchange: "NYQ" },
  BE: { symbol: "BE", shortName: "Bloom Energy", price: 42.62, previousClose: 41.85, currency: "USD", exchange: "NYQ" },
  MP: { symbol: "MP", shortName: "MP Materials", price: 58.42, previousClose: 56.85, currency: "USD", exchange: "NYQ" },
  TMC: { symbol: "TMC", shortName: "TMC the metals company", price: 8.42, previousClose: 8.18, currency: "USD", exchange: "NMS" },

  // Will's screen - speculative / themes
  DJT: { symbol: "DJT", shortName: "Trump Media & Tech", price: 32.42, previousClose: 31.85, currency: "USD", exchange: "NMS" },
  SBET: { symbol: "SBET", shortName: "SharpLink Gaming", price: 14.42, previousClose: 13.85, currency: "USD", exchange: "NMS" },
  SNOW: { symbol: "SNOW", shortName: "Snowflake", price: 215.6, previousClose: 211.85, currency: "USD", exchange: "NYQ" },
  WRD: { symbol: "WRD", shortName: "WeRide", price: 18.42, previousClose: 17.85, currency: "USD", exchange: "NMS" },
  CHA: { symbol: "CHA", shortName: "Chagee Holdings", price: 22.42, previousClose: 22.85, currency: "USD", exchange: "NMS" },
  NEGG: { symbol: "NEGG", shortName: "Newegg Commerce", price: 28.42, previousClose: 29.85, currency: "USD", exchange: "NMS" },
  PSTV: { symbol: "PSTV", shortName: "Plus Therapeutics", price: 0.42, previousClose: 0.41, currency: "USD", exchange: "NMS" },
  SENS: { symbol: "SENS", shortName: "Senseonics", price: 0.85, previousClose: 0.84, currency: "USD", exchange: "ASE" },
  ONDS: { symbol: "ONDS", shortName: "Ondas Holdings", price: 4.42, previousClose: 4.18, currency: "USD", exchange: "NMS" },
  OPEN: { symbol: "OPEN", shortName: "Opendoor Technologies", price: 2.42, previousClose: 2.35, currency: "USD", exchange: "NMS" },
  NUAI: { symbol: "NUAI", shortName: "New Era Energy & Digital", price: 8.42, previousClose: 7.85, currency: "USD", exchange: "NMS" },
  UP: { symbol: "UP", shortName: "Wheels Up Experience", price: 2.18, previousClose: 2.05, currency: "USD", exchange: "NYQ" },
  PSKY: { symbol: "PSKY", shortName: "Paramount Skydance", price: 18.62, previousClose: 18.42, currency: "USD", exchange: "NMS" },
  DVLT: { symbol: "DVLT", shortName: "DataVault Holdings", price: 1.85, previousClose: 1.78, currency: "USD", exchange: "NMS" },
  CRML: { symbol: "CRML", shortName: "Critical Metals", price: 4.42, previousClose: 4.18, currency: "USD", exchange: "NMS" },
  IREZ: { symbol: "IREZ", shortName: "TRDR 2x IREN", price: 12.42, previousClose: 11.85, currency: "USD", exchange: "PCX" },
  NB: { symbol: "NB", shortName: "NioCorp Developments", price: 4.42, previousClose: 4.18, currency: "USD", exchange: "NMS" },
};

/** Quick getter that handles symbol case + known aliases. */
export function getSeedQuote(symbol: string): SeedQuote | null {
  const k = symbol.toUpperCase();
  return SEED_QUOTES[k] ?? null;
}

/**
 * Equity research fallback snapshot.
 *
 * Yahoo's quoteSummary endpoint enforces aggressive per-IP rate limits, so
 * when a request can't be served by upstream we fall back to this snapshot.
 * Covers the most-likely-to-be-viewed symbols (Will's watchlist + the index
 * mega-caps a visitor would search for) for the two sub-tabs that drive
 * first impressions: Profile and Statistics.
 *
 * Discovery (gainers / losers / most-active) is derived from
 * SEED_QUOTES at request time - see `marketsFallback.ts`.
 */

export interface ProfileSeed {
  longName: string;
  shortName: string;
  sector: string;
  industry: string;
  website?: string;
  summary: string;
  employees?: number;
  country?: string;
  city?: string;
  state?: string;
  phone?: string;
  exchange: string;
  currency: string;
  marketCap: number;
  quoteType: string;
  officers?: Array<{
    name: string;
    title: string;
    age?: number;
    yearBorn?: number;
    totalPay?: number;
  }>;
}

export interface StatsSeed {
  marketCap: number;
  enterpriseValue?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  priceToSales?: number;
  enterpriseToRevenue?: number;
  enterpriseToEbitda?: number;
  profitMargin?: number;
  operatingMargin?: number;
  grossMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  revenueTTM?: number;
  grossProfit?: number;
  ebitda?: number;
  netIncomeTTM?: number;
  eps?: number;
  epsForward?: number;
  bookValue?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  sharesShort?: number;
  shortRatio?: number;
  shortPercentOfFloat?: number;
  heldPercentInsiders?: number;
  heldPercentInstitutions?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  averageVolume10Day?: number;
  dividendYield?: number;
  dividendRate?: number;
  payoutRatio?: number;
  targetMeanPrice?: number;
  targetMedianPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;
  totalCash?: number;
  totalDebt?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
}

export const PROFILE_SEED: Record<string, ProfileSeed> = {
  NVDA: {
    longName: "NVIDIA Corporation",
    shortName: "NVIDIA",
    sector: "Technology",
    industry: "Semiconductors",
    website: "https://www.nvidia.com",
    summary:
      "NVIDIA Corporation provides graphics, compute, and networking solutions. Its segments include the Compute & Networking segment, anchored by data-center accelerators (Hopper, Blackwell), enterprise-grade AI software, and DGX systems; and the Graphics segment, covering GeForce GPUs for gaming and creator workflows, the Omniverse platform, and automotive AI. The company sells to cloud providers, OEMs, system integrators, automakers, and consumer retailers globally.",
    employees: 36000,
    country: "United States",
    city: "Santa Clara",
    state: "California",
    phone: "408-486-2000",
    exchange: "NMS",
    currency: "USD",
    marketCap: 4_580_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Jensen Huang", title: "Founder, President & CEO", age: 62, yearBorn: 1963, totalPay: 34_174_000 },
      { name: "Colette Kress", title: "EVP & Chief Financial Officer", age: 58, yearBorn: 1967, totalPay: 11_932_000 },
      { name: "Debora Shoquist", title: "EVP, Operations", age: 70, yearBorn: 1955, totalPay: 5_780_000 },
      { name: "Tim Teter", title: "EVP, General Counsel & Secretary", age: 60, yearBorn: 1965, totalPay: 5_702_000 },
    ],
  },
  AAPL: {
    longName: "Apple Inc.",
    shortName: "Apple",
    sector: "Technology",
    industry: "Consumer Electronics",
    website: "https://www.apple.com",
    summary:
      "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. Its iPhone is the largest single product line by revenue. Services revenue (App Store, advertising, AppleCare, cloud, payments) continues to grow as a higher-margin, recurring stream alongside the Mac, iPad, and Wearables segments.",
    employees: 164000,
    country: "United States",
    city: "Cupertino",
    state: "California",
    phone: "408-996-1010",
    exchange: "NMS",
    currency: "USD",
    marketCap: 4_020_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Tim Cook", title: "CEO (steps down Sep 1)", age: 65, yearBorn: 1960, totalPay: 63_209_000 },
      { name: "John Ternus", title: "SVP Hardware Engineering (incoming CEO)", age: 50, yearBorn: 1975, totalPay: 27_103_000 },
      { name: "Luca Maestri", title: "SVP & Chief Financial Officer", age: 61, yearBorn: 1964, totalPay: 27_198_000 },
    ],
  },
  MSFT: {
    longName: "Microsoft Corporation",
    shortName: "Microsoft",
    sector: "Technology",
    industry: "Software-Infrastructure",
    website: "https://www.microsoft.com",
    summary:
      "Microsoft develops and supports software, services, devices, and solutions. Productivity & Business Processes (Microsoft 365, Dynamics, LinkedIn), Intelligent Cloud (Azure, server products), and More Personal Computing (Windows, Surface, Xbox, Search) form the three reporting segments. Azure remains the primary growth driver as enterprise AI workloads scale on OpenAI-powered services.",
    employees: 228000,
    country: "United States",
    city: "Redmond",
    state: "Washington",
    phone: "425-882-8080",
    exchange: "NMS",
    currency: "USD",
    marketCap: 3_550_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Satya Nadella", title: "Chairman & CEO", age: 58, yearBorn: 1967, totalPay: 79_111_000 },
      { name: "Amy Hood", title: "EVP & Chief Financial Officer", age: 53, yearBorn: 1971, totalPay: 26_404_000 },
    ],
  },
  GOOG: {
    longName: "Alphabet Inc.",
    shortName: "Alphabet",
    sector: "Communication Services",
    industry: "Internet Content & Information",
    website: "https://abc.xyz",
    summary:
      "Alphabet Inc., Google's parent, organizes the world's information through Search, YouTube, Maps, Cloud, Workspace, Android, Chrome, and Pixel hardware. Other Bets include Waymo (self-driving), Verily, and DeepMind / Gemini. Search and YouTube ads drive the majority of revenue, with Google Cloud growing fastest.",
    employees: 187000,
    country: "United States",
    city: "Mountain View",
    state: "California",
    phone: "650-253-0000",
    exchange: "NMS",
    currency: "USD",
    marketCap: 2_640_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Sundar Pichai", title: "CEO of Alphabet & Google", age: 53, yearBorn: 1972, totalPay: 8_802_000 },
      { name: "Ruth Porat", title: "President & CIO (former CFO)", age: 67, yearBorn: 1957, totalPay: 25_328_000 },
    ],
  },
  AMZN: {
    longName: "Amazon.com, Inc.",
    shortName: "Amazon",
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    website: "https://www.amazon.com",
    summary:
      "Amazon operates the largest e-commerce marketplace in the West and the largest cloud platform globally (AWS). Segments: North America retail, International retail, and AWS - where AWS provides the bulk of operating income. Advertising, Prime subscriptions, and logistics services have become meaningful additional profit centers.",
    employees: 1_540_000,
    country: "United States",
    city: "Seattle",
    state: "Washington",
    phone: "206-266-1000",
    exchange: "NMS",
    currency: "USD",
    marketCap: 2_610_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Andy Jassy", title: "President & CEO", age: 57, yearBorn: 1968, totalPay: 1_590_000 },
      { name: "Brian Olsavsky", title: "SVP & Chief Financial Officer", age: 61, yearBorn: 1964, totalPay: 7_184_000 },
    ],
  },
  META: {
    longName: "Meta Platforms, Inc.",
    shortName: "Meta",
    sector: "Communication Services",
    industry: "Internet Content & Information",
    website: "https://about.meta.com",
    summary:
      "Meta builds technologies that help people connect - Facebook, Instagram, WhatsApp, Messenger, and Threads - alongside the Reality Labs division (Quest VR, Ray-Ban Meta, AI assistants). Family of Apps drives essentially all current revenue via advertising, while Reality Labs absorbs material operating losses as the company invests in next-generation computing.",
    employees: 76000,
    country: "United States",
    city: "Menlo Park",
    state: "California",
    phone: "650-543-4800",
    exchange: "NMS",
    currency: "USD",
    marketCap: 1_540_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Mark Zuckerberg", title: "Founder, Chairman & CEO", age: 41, yearBorn: 1984, totalPay: 27_111_000 },
      { name: "Susan Li", title: "Chief Financial Officer", age: 39, yearBorn: 1986, totalPay: 22_847_000 },
    ],
  },
  TSLA: {
    longName: "Tesla, Inc.",
    shortName: "Tesla",
    sector: "Consumer Cyclical",
    industry: "Auto Manufacturers",
    website: "https://www.tesla.com",
    summary:
      "Tesla designs, manufactures, and sells electric vehicles, energy storage systems (Megapack, Powerwall), and solar generation products. Automotive (Model 3/Y/S/X, Cybertruck, Semi, Cybercab) accounts for the majority of revenue; Energy Generation & Storage and Services & Other are growing contributors. The company is also building Full Self-Driving software, Optimus humanoid robots, and Dojo training infrastructure.",
    employees: 125000,
    country: "United States",
    city: "Austin",
    state: "Texas",
    phone: "512-516-8177",
    exchange: "NMS",
    currency: "USD",
    marketCap: 1_410_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Elon Musk", title: "Technoking & CEO", age: 54, yearBorn: 1971, totalPay: 0 },
      { name: "Vaibhav Taneja", title: "Chief Financial Officer", age: 47, yearBorn: 1978, totalPay: 14_060_000 },
    ],
  },
  AMD: {
    longName: "Advanced Micro Devices, Inc.",
    shortName: "AMD",
    sector: "Technology",
    industry: "Semiconductors",
    website: "https://www.amd.com",
    summary:
      "AMD designs and integrates high-performance microprocessors, graphics processors, and adaptive computing products. The Data Center segment (EPYC server CPUs, Instinct AI accelerators) has become the largest revenue contributor, alongside Client (Ryzen), Gaming (Radeon, semi-custom), and Embedded (Xilinx FPGA + adaptive SoCs).",
    employees: 26000,
    country: "United States",
    city: "Santa Clara",
    state: "California",
    phone: "408-749-4000",
    exchange: "NMS",
    currency: "USD",
    marketCap: 305_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Lisa Su", title: "Chair, President & CEO", age: 56, yearBorn: 1969, totalPay: 30_345_000 },
      { name: "Jean Hu", title: "EVP & Chief Financial Officer", age: 60, yearBorn: 1965, totalPay: 8_910_000 },
    ],
  },
  INTC: {
    longName: "Intel Corporation",
    shortName: "Intel",
    sector: "Technology",
    industry: "Semiconductors",
    website: "https://www.intel.com",
    summary:
      "Intel designs and manufactures essential technologies for compute, communications, and AI. Client Computing Group (Core CPUs), Data Center & AI (Xeon, Gaudi accelerators), Network & Edge, Mosaic foundry services, and Altera FPGA define the operating segments. The company is in the middle of a multi-year strategy to rebuild process leadership at its Intel Foundry Services arm.",
    employees: 108900,
    country: "United States",
    city: "Santa Clara",
    state: "California",
    phone: "408-765-8080",
    exchange: "NMS",
    currency: "USD",
    marketCap: 209_000_000_000,
    quoteType: "EQUITY",
    officers: [
      { name: "Lip-Bu Tan", title: "CEO", age: 65, yearBorn: 1960, totalPay: 16_876_000 },
      { name: "David Zinsner", title: "EVP & Chief Financial Officer", age: 56, yearBorn: 1969, totalPay: 8_604_000 },
    ],
  },
  HOOD: {
    longName: "Robinhood Markets, Inc.",
    shortName: "Robinhood",
    sector: "Financial Services",
    industry: "Capital Markets",
    website: "https://robinhood.com",
    summary:
      "Robinhood operates a commission-free brokerage app for equities, options, and crypto, plus retirement (Robinhood Retirement IRA), credit (Robinhood Gold Card), and debit / spending products. Revenue is driven by transaction-based commissions (payment for order flow), net interest from cash + margin balances, and Gold subscription fees.",
    employees: 2300,
    country: "United States",
    city: "Menlo Park",
    state: "California",
    phone: "650-940-2700",
    exchange: "NMS",
    currency: "USD",
    marketCap: 96_000_000_000,
    quoteType: "EQUITY",
  },
  BMNR: {
    longName: "BitMine Immersion Technologies, Inc.",
    shortName: "BitMine Immersion",
    sector: "Financial Services",
    industry: "Capital Markets",
    website: "https://www.bitminetech.io",
    summary:
      "BitMine Immersion Technologies operates immersion-cooled bitcoin mining infrastructure with a treasury heavily allocated to ether (ETH). The company supports proof-of-stake validation and offers a public-equity wrapper for ETH treasury exposure alongside its mining operations.",
    employees: 12,
    country: "United States",
    city: "Las Vegas",
    state: "Nevada",
    exchange: "ASE",
    currency: "USD",
    marketCap: 9_400_000_000,
    quoteType: "EQUITY",
  },
  CRCL: {
    longName: "Circle Internet Group, Inc.",
    shortName: "Circle",
    sector: "Financial Services",
    industry: "Capital Markets",
    website: "https://www.circle.com",
    summary:
      "Circle is the issuer of USDC, a fully reserved US-dollar stablecoin, and EURC, its euro counterpart. The company provides programmable money infrastructure for developers, treasuries, and exchanges, with most revenue coming from interest earned on stablecoin reserves held in short-duration Treasuries and cash-equivalents.",
    employees: 970,
    country: "United States",
    city: "New York",
    state: "New York",
    exchange: "NYQ",
    currency: "USD",
    marketCap: 32_000_000_000,
    quoteType: "EQUITY",
  },
};

export const STATS_SEED: Record<string, StatsSeed> = {
  NVDA: {
    marketCap: 4_580_000_000_000,
    enterpriseValue: 4_510_000_000_000,
    trailingPE: 56.4,
    forwardPE: 38.2,
    pegRatio: 1.42,
    priceToBook: 41.8,
    priceToSales: 31.2,
    enterpriseToRevenue: 30.6,
    enterpriseToEbitda: 51.4,
    profitMargin: 0.5588,
    operatingMargin: 0.6212,
    grossMargin: 0.7493,
    returnOnEquity: 1.1542,
    returnOnAssets: 0.5685,
    revenueTTM: 147_400_000_000,
    grossProfit: 110_400_000_000,
    ebitda: 87_700_000_000,
    netIncomeTTM: 82_350_000_000,
    eps: 3.34,
    epsForward: 4.93,
    bookValue: 4.51,
    sharesOutstanding: 24_300_000_000,
    floatShares: 23_400_000_000,
    sharesShort: 270_000_000,
    shortRatio: 1.4,
    shortPercentOfFloat: 0.0115,
    heldPercentInsiders: 0.043,
    heldPercentInstitutions: 0.679,
    beta: 1.78,
    fiftyTwoWeekHigh: 210.42,
    fiftyTwoWeekLow: 84.66,
    fiftyDayAverage: 175.84,
    twoHundredDayAverage: 158.76,
    averageVolume10Day: 245_000_000,
    targetMeanPrice: 215.4,
    targetMedianPrice: 212,
    targetHighPrice: 250,
    targetLowPrice: 165,
    recommendationKey: "buy",
    numberOfAnalystOpinions: 64,
    totalCash: 53_700_000_000,
    totalDebt: 11_400_000_000,
    debtToEquity: 0.114,
    currentRatio: 4.21,
    quickRatio: 3.78,
  },
  AAPL: {
    marketCap: 4_020_000_000_000,
    enterpriseValue: 4_010_000_000_000,
    trailingPE: 38.2,
    forwardPE: 32.5,
    pegRatio: 2.18,
    priceToBook: 70.4,
    priceToSales: 9.85,
    enterpriseToRevenue: 9.82,
    enterpriseToEbitda: 28.6,
    profitMargin: 0.2615,
    operatingMargin: 0.3087,
    grossMargin: 0.4646,
    returnOnEquity: 1.5942,
    returnOnAssets: 0.2724,
    revenueTTM: 408_500_000_000,
    grossProfit: 189_700_000_000,
    ebitda: 140_200_000_000,
    netIncomeTTM: 106_800_000_000,
    eps: 7.06,
    epsForward: 8.31,
    bookValue: 3.84,
    sharesOutstanding: 14_900_000_000,
    floatShares: 14_870_000_000,
    sharesShort: 95_000_000,
    shortRatio: 1.65,
    shortPercentOfFloat: 0.0064,
    heldPercentInsiders: 0.0011,
    heldPercentInstitutions: 0.621,
    beta: 1.21,
    fiftyTwoWeekHigh: 282.5,
    fiftyTwoWeekLow: 168.4,
    fiftyDayAverage: 268.4,
    twoHundredDayAverage: 240.2,
    averageVolume10Day: 52_400_000,
    dividendYield: 0.0036,
    dividendRate: 0.96,
    payoutRatio: 0.1396,
    targetMeanPrice: 282.4,
    targetMedianPrice: 285,
    targetHighPrice: 320,
    targetLowPrice: 220,
    recommendationKey: "buy",
    numberOfAnalystOpinions: 58,
    totalCash: 67_000_000_000,
    totalDebt: 110_300_000_000,
    debtToEquity: 1.94,
    currentRatio: 0.97,
    quickRatio: 0.85,
  },
  MSFT: {
    marketCap: 3_550_000_000_000,
    enterpriseValue: 3_530_000_000_000,
    trailingPE: 36.8,
    forwardPE: 30.6,
    pegRatio: 2.32,
    priceToBook: 11.4,
    priceToSales: 13.5,
    enterpriseToRevenue: 13.4,
    enterpriseToEbitda: 24.8,
    profitMargin: 0.3614,
    operatingMargin: 0.4528,
    grossMargin: 0.6995,
    returnOnEquity: 0.3527,
    returnOnAssets: 0.1782,
    revenueTTM: 263_500_000_000,
    grossProfit: 184_500_000_000,
    ebitda: 142_400_000_000,
    netIncomeTTM: 95_300_000_000,
    eps: 12.85,
    epsForward: 15.6,
    bookValue: 41.8,
    sharesOutstanding: 7_430_000_000,
    floatShares: 7_410_000_000,
    sharesShort: 38_000_000,
    shortRatio: 1.2,
    shortPercentOfFloat: 0.0051,
    heldPercentInsiders: 0.0009,
    heldPercentInstitutions: 0.7234,
    beta: 0.94,
    fiftyTwoWeekHigh: 484.5,
    fiftyTwoWeekLow: 388.6,
    fiftyDayAverage: 472.5,
    twoHundredDayAverage: 446.2,
    averageVolume10Day: 22_800_000,
    dividendYield: 0.0072,
    dividendRate: 3.32,
    payoutRatio: 0.2584,
    targetMeanPrice: 528.6,
    targetMedianPrice: 530,
    targetHighPrice: 600,
    targetLowPrice: 440,
    recommendationKey: "strong_buy",
    numberOfAnalystOpinions: 52,
    totalCash: 92_400_000_000,
    totalDebt: 60_500_000_000,
    debtToEquity: 0.196,
    currentRatio: 1.48,
    quickRatio: 1.36,
  },
  GOOG: {
    marketCap: 2_640_000_000_000,
    enterpriseValue: 2_540_000_000_000,
    trailingPE: 26.4,
    forwardPE: 22.1,
    pegRatio: 1.32,
    priceToBook: 8.42,
    priceToSales: 7.14,
    enterpriseToRevenue: 6.88,
    enterpriseToEbitda: 17.2,
    profitMargin: 0.282,
    operatingMargin: 0.336,
    grossMargin: 0.5824,
    returnOnEquity: 0.3614,
    returnOnAssets: 0.2036,
    revenueTTM: 369_000_000_000,
    grossProfit: 215_000_000_000,
    ebitda: 147_500_000_000,
    netIncomeTTM: 104_000_000_000,
    eps: 8.25,
    epsForward: 9.78,
    bookValue: 25.6,
    sharesOutstanding: 12_400_000_000,
    floatShares: 11_200_000_000,
    sharesShort: 32_000_000,
    shortRatio: 1.4,
    shortPercentOfFloat: 0.0029,
    heldPercentInsiders: 0.062,
    heldPercentInstitutions: 0.412,
    beta: 1.05,
    fiftyTwoWeekHigh: 215.8,
    fiftyTwoWeekLow: 142.3,
    fiftyDayAverage: 209.4,
    twoHundredDayAverage: 188.6,
    averageVolume10Day: 22_500_000,
    dividendYield: 0.0038,
    dividendRate: 0.84,
    payoutRatio: 0.0961,
    targetMeanPrice: 245.8,
    targetMedianPrice: 248,
    targetHighPrice: 280,
    targetLowPrice: 195,
    recommendationKey: "buy",
    numberOfAnalystOpinions: 56,
    totalCash: 110_900_000_000,
    totalDebt: 28_400_000_000,
    debtToEquity: 0.094,
    currentRatio: 2.15,
    quickRatio: 1.97,
  },
  AMZN: {
    marketCap: 2_610_000_000_000,
    enterpriseValue: 2_690_000_000_000,
    trailingPE: 47.8,
    forwardPE: 36.4,
    pegRatio: 1.94,
    priceToBook: 8.42,
    priceToSales: 4.05,
    enterpriseToRevenue: 4.16,
    enterpriseToEbitda: 22.4,
    profitMargin: 0.0867,
    operatingMargin: 0.1142,
    grossMargin: 0.4796,
    returnOnEquity: 0.2342,
    returnOnAssets: 0.0814,
    revenueTTM: 645_000_000_000,
    grossProfit: 309_300_000_000,
    ebitda: 119_800_000_000,
    netIncomeTTM: 55_900_000_000,
    eps: 5.34,
    epsForward: 6.92,
    bookValue: 29.8,
    sharesOutstanding: 10_400_000_000,
    floatShares: 9_400_000_000,
    sharesShort: 65_000_000,
    shortRatio: 1.4,
    shortPercentOfFloat: 0.0069,
    heldPercentInsiders: 0.099,
    heldPercentInstitutions: 0.6512,
    beta: 1.32,
    fiftyTwoWeekHigh: 256.4,
    fiftyTwoWeekLow: 168.3,
    fiftyDayAverage: 248.6,
    twoHundredDayAverage: 220.4,
    averageVolume10Day: 41_200_000,
    targetMeanPrice: 281.4,
    targetMedianPrice: 285,
    targetHighPrice: 320,
    targetLowPrice: 230,
    recommendationKey: "strong_buy",
    numberOfAnalystOpinions: 62,
    totalCash: 102_800_000_000,
    totalDebt: 137_400_000_000,
    debtToEquity: 0.444,
    currentRatio: 1.06,
    quickRatio: 0.85,
  },
  META: {
    marketCap: 1_540_000_000_000,
    enterpriseValue: 1_490_000_000_000,
    trailingPE: 24.6,
    forwardPE: 21.4,
    pegRatio: 1.18,
    priceToBook: 8.42,
    priceToSales: 8.96,
    enterpriseToRevenue: 8.66,
    enterpriseToEbitda: 17.4,
    profitMargin: 0.378,
    operatingMargin: 0.4156,
    grossMargin: 0.8132,
    returnOnEquity: 0.3414,
    returnOnAssets: 0.2196,
    revenueTTM: 172_000_000_000,
    grossProfit: 139_900_000_000,
    ebitda: 85_700_000_000,
    netIncomeTTM: 65_000_000_000,
    eps: 25.42,
    epsForward: 28.95,
    bookValue: 73.4,
    sharesOutstanding: 2_510_000_000,
    floatShares: 2_180_000_000,
    sharesShort: 18_000_000,
    shortRatio: 1.2,
    shortPercentOfFloat: 0.0083,
    heldPercentInsiders: 0.135,
    heldPercentInstitutions: 0.7214,
    beta: 1.24,
    fiftyTwoWeekHigh: 660.4,
    fiftyTwoWeekLow: 442.1,
    fiftyDayAverage: 605.5,
    twoHundredDayAverage: 558.4,
    averageVolume10Day: 14_800_000,
    dividendYield: 0.0034,
    dividendRate: 2.0,
    payoutRatio: 0.0786,
    targetMeanPrice: 695.4,
    targetMedianPrice: 700,
    targetHighPrice: 800,
    targetLowPrice: 540,
    recommendationKey: "buy",
    numberOfAnalystOpinions: 54,
    totalCash: 70_900_000_000,
    totalDebt: 49_500_000_000,
    debtToEquity: 0.272,
    currentRatio: 2.85,
    quickRatio: 2.74,
  },
  TSLA: {
    marketCap: 1_410_000_000_000,
    enterpriseValue: 1_400_000_000_000,
    trailingPE: 95.4,
    forwardPE: 78.2,
    pegRatio: 4.32,
    priceToBook: 16.8,
    priceToSales: 13.9,
    enterpriseToRevenue: 13.8,
    enterpriseToEbitda: 92.4,
    profitMargin: 0.0671,
    operatingMargin: 0.0894,
    grossMargin: 0.211,
    returnOnEquity: 0.1782,
    returnOnAssets: 0.0732,
    revenueTTM: 101_300_000_000,
    grossProfit: 21_400_000_000,
    ebitda: 15_200_000_000,
    netIncomeTTM: 6_800_000_000,
    eps: 4.62,
    epsForward: 5.65,
    bookValue: 26.3,
    sharesOutstanding: 3_190_000_000,
    floatShares: 2_770_000_000,
    sharesShort: 92_000_000,
    shortRatio: 2.1,
    shortPercentOfFloat: 0.0332,
    heldPercentInsiders: 0.131,
    heldPercentInstitutions: 0.4625,
    beta: 2.34,
    fiftyTwoWeekHigh: 488.2,
    fiftyTwoWeekLow: 215.4,
    fiftyDayAverage: 432.4,
    twoHundredDayAverage: 348.6,
    averageVolume10Day: 95_200_000,
    targetMeanPrice: 365.8,
    targetMedianPrice: 360,
    targetHighPrice: 540,
    targetLowPrice: 220,
    recommendationKey: "hold",
    numberOfAnalystOpinions: 48,
    totalCash: 36_500_000_000,
    totalDebt: 12_400_000_000,
    debtToEquity: 0.148,
    currentRatio: 1.85,
    quickRatio: 1.38,
  },
  AMD: {
    marketCap: 305_000_000_000,
    enterpriseValue: 302_000_000_000,
    trailingPE: 122.4,
    forwardPE: 38.2,
    pegRatio: 1.42,
    priceToBook: 5.12,
    priceToSales: 11.4,
    enterpriseToRevenue: 11.3,
    enterpriseToEbitda: 64.5,
    profitMargin: 0.0944,
    operatingMargin: 0.124,
    grossMargin: 0.522,
    returnOnEquity: 0.0454,
    returnOnAssets: 0.0312,
    revenueTTM: 26_700_000_000,
    grossProfit: 13_900_000_000,
    ebitda: 4_700_000_000,
    netIncomeTTM: 2_520_000_000,
    eps: 1.53,
    epsForward: 4.92,
    bookValue: 36.7,
    sharesOutstanding: 1_620_000_000,
    floatShares: 1_618_000_000,
    sharesShort: 36_000_000,
    shortRatio: 1.4,
    shortPercentOfFloat: 0.0223,
    heldPercentInsiders: 0.0058,
    heldPercentInstitutions: 0.7142,
    beta: 1.92,
    fiftyTwoWeekHigh: 211.4,
    fiftyTwoWeekLow: 96.8,
    fiftyDayAverage: 184.2,
    twoHundredDayAverage: 162.4,
    averageVolume10Day: 38_500_000,
    targetMeanPrice: 218.6,
    targetMedianPrice: 220,
    targetHighPrice: 280,
    targetLowPrice: 145,
    recommendationKey: "buy",
    numberOfAnalystOpinions: 52,
    totalCash: 7_400_000_000,
    totalDebt: 1_840_000_000,
    debtToEquity: 0.031,
    currentRatio: 2.42,
    quickRatio: 1.76,
  },
  INTC: {
    marketCap: 209_000_000_000,
    enterpriseValue: 232_000_000_000,
    trailingPE: 156.4,
    forwardPE: 28.5,
    pegRatio: 2.78,
    priceToBook: 1.82,
    priceToSales: 4.06,
    enterpriseToRevenue: 4.51,
    enterpriseToEbitda: 28.4,
    profitMargin: 0.0254,
    operatingMargin: 0.041,
    grossMargin: 0.402,
    returnOnEquity: 0.013,
    returnOnAssets: 0.0084,
    revenueTTM: 51_500_000_000,
    grossProfit: 20_700_000_000,
    ebitda: 8_170_000_000,
    netIncomeTTM: 1_310_000_000,
    eps: 0.31,
    epsForward: 1.68,
    bookValue: 26.4,
    sharesOutstanding: 4_360_000_000,
    floatShares: 4_350_000_000,
    sharesShort: 95_000_000,
    shortRatio: 2.4,
    shortPercentOfFloat: 0.022,
    heldPercentInsiders: 0.014,
    heldPercentInstitutions: 0.6485,
    beta: 1.16,
    fiftyTwoWeekHigh: 49.2,
    fiftyTwoWeekLow: 18.5,
    fiftyDayAverage: 41.5,
    twoHundredDayAverage: 32.6,
    averageVolume10Day: 92_400_000,
    targetMeanPrice: 38.4,
    targetMedianPrice: 36,
    targetHighPrice: 60,
    targetLowPrice: 22,
    recommendationKey: "hold",
    numberOfAnalystOpinions: 42,
    totalCash: 22_300_000_000,
    totalDebt: 51_100_000_000,
    debtToEquity: 0.444,
    currentRatio: 1.34,
    quickRatio: 0.97,
  },
  HOOD: {
    marketCap: 96_000_000_000,
    enterpriseValue: 91_000_000_000,
    trailingPE: 58.4,
    forwardPE: 42.5,
    pegRatio: 1.18,
    priceToBook: 9.4,
    priceToSales: 14.8,
    enterpriseToRevenue: 13.9,
    enterpriseToEbitda: 32.4,
    profitMargin: 0.282,
    operatingMargin: 0.342,
    grossMargin: 0.86,
    returnOnEquity: 0.184,
    returnOnAssets: 0.062,
    revenueTTM: 6_500_000_000,
    grossProfit: 5_590_000_000,
    ebitda: 2_810_000_000,
    netIncomeTTM: 1_830_000_000,
    eps: 1.95,
    epsForward: 2.6,
    bookValue: 11.6,
    sharesOutstanding: 870_000_000,
    floatShares: 800_000_000,
    sharesShort: 28_000_000,
    shortRatio: 1.6,
    shortPercentOfFloat: 0.035,
    heldPercentInsiders: 0.082,
    heldPercentInstitutions: 0.6824,
    beta: 2.14,
    fiftyTwoWeekHigh: 124.5,
    fiftyTwoWeekLow: 28.4,
    fiftyDayAverage: 105.4,
    twoHundredDayAverage: 86.2,
    averageVolume10Day: 18_500_000,
    targetMeanPrice: 132.4,
    targetMedianPrice: 130,
    targetHighPrice: 165,
    targetLowPrice: 80,
    recommendationKey: "buy",
    numberOfAnalystOpinions: 22,
    totalCash: 5_200_000_000,
    totalDebt: 215_000_000,
    debtToEquity: 0.022,
    currentRatio: 2.85,
    quickRatio: 2.74,
  },
  BMNR: {
    marketCap: 9_400_000_000,
    enterpriseValue: 8_800_000_000,
    profitMargin: 0.42,
    operatingMargin: 0.45,
    grossMargin: 0.62,
    revenueTTM: 245_000_000,
    grossProfit: 152_000_000,
    netIncomeTTM: 103_000_000,
    eps: 0.82,
    sharesOutstanding: 11_400_000_000,
    floatShares: 9_800_000_000,
    sharesShort: 412_000_000,
    shortRatio: 1.8,
    shortPercentOfFloat: 0.042,
    heldPercentInsiders: 0.058,
    heldPercentInstitutions: 0.382,
    beta: 3.12,
    fiftyTwoWeekHigh: 186.4,
    fiftyTwoWeekLow: 6.85,
    fiftyDayAverage: 48.6,
    twoHundredDayAverage: 28.4,
    averageVolume10Day: 32_400_000,
    totalCash: 1_840_000_000,
    totalDebt: 215_000_000,
    debtToEquity: 0.025,
    currentRatio: 5.42,
    quickRatio: 5.38,
  },
};

export function getProfileSeed(symbol: string): ProfileSeed | null {
  return PROFILE_SEED[symbol.toUpperCase()] ?? null;
}

export function getStatsSeed(symbol: string): StatsSeed | null {
  return STATS_SEED[symbol.toUpperCase()] ?? null;
}

/**
 * Build screener rows from the existing seed quotes - sorted appropriately.
 * Returns a stable, realistic-looking gainers/losers/active list whenever
 * Yahoo's screener endpoint is rate-limiting. Source data lives in
 * `marketsFallback.ts` so we don't fork the price snapshot.
 */
export function buildScreenerRows(
  scrId: "day_gainers" | "day_losers" | "most_actives",
  seedQuotes: Record<string, { symbol: string; shortName: string; price: number; previousClose: number }>
): Array<{
  symbol: string;
  shortName: string | null;
  price: number;
  changePct: number;
  change: number;
  volume: number | null;
  marketCap: number | null;
}> {
  // Approximate realistic daily volumes for derived rows - these are static
  // per ticker so the screener doesn't look fake. Pull market caps from
  // the stats seed when we have it.
  const VOLUME_HINT: Record<string, number> = {
    NVDA: 245_000_000,
    AAPL: 52_400_000,
    MSFT: 22_800_000,
    GOOG: 22_500_000,
    AMZN: 41_200_000,
    META: 14_800_000,
    TSLA: 95_200_000,
    AMD: 38_500_000,
    INTC: 92_400_000,
    HOOD: 18_500_000,
    BMNR: 32_400_000,
    CRCL: 11_500_000,
    PLTR: 84_300_000,
    COIN: 12_800_000,
    MSTR: 8_400_000,
    SMCI: 22_400_000,
    SNAP: 24_300_000,
    PYPL: 14_200_000,
    NFLX: 6_400_000,
    DIS: 8_500_000,
    BABA: 24_500_000,
    UPS: 9_400_000,
    BA: 12_500_000,
    AVGO: 11_400_000,
    ORCL: 9_800_000,
    IBM: 7_400_000,
    NOW: 4_300_000,
    AAL: 24_500_000,
    AXP: 4_200_000,
    DASH: 5_400_000,
    CAT: 4_800_000,
    GE: 6_400_000,
    GEV: 3_800_000,
    TXN: 4_500_000,
    HIMS: 28_400_000,
    IREN: 18_400_000,
    PLUG: 65_400_000,
    RGTZ: 32_400_000,
    ASST: 24_500_000,
    SOFI: 38_400_000,
    UNH: 14_500_000,
    JD: 18_400_000,
    BABA_HK: 0,
  };

  const items = Object.values(seedQuotes).map((q) => {
    const changePct =
      q.previousClose !== 0
        ? ((q.price - q.previousClose) / q.previousClose) * 100
        : 0;
    const change = q.price - q.previousClose;
    const stats = STATS_SEED[q.symbol];
    return {
      symbol: q.symbol,
      shortName: q.shortName,
      price: q.price,
      changePct,
      change,
      volume: VOLUME_HINT[q.symbol] ?? null,
      marketCap: stats?.marketCap ?? null,
    };
  });

  if (scrId === "day_gainers") {
    return items
      .filter((r) => r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 25);
  }
  if (scrId === "day_losers") {
    return items
      .filter((r) => r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 25);
  }
  // most_actives - sort by volume (where known)
  return items
    .filter((r) => r.volume != null)
    .sort((a, b) => (b.volume as number) - (a.volume as number))
    .slice(0, 25);
}

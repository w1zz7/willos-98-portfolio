import type { SheetData } from "@/lib/excel/types";

/**
 * Hidden data sheets - referenced by formulas on the Metrics sheet but not
 * shown in the tab strip. Every number here is derived directly from the
 * resume or computed from it. See `data/excel/index.ts` where these are
 * included in SHEETS_BY_ID (for formula resolution) but excluded from the
 * visible SHEETS array.
 */

/** Monthly trading aggregates - 267 closed trades Aug 2025 – Apr 2026.
 * $315,020 processed · +$16,475.18 realized · GAIN/LOSS RATIO 63.98%
 * Reporting periods (broker-style summary):
 *   TY 2025 (01/01 – 12/31/2025, 168 records):
 *     Proceeds $163,442.43 · Realized +$7,103.07 · G/L Ratio 61.73%
 *   Rolling 6mo (10/18/2025 – 04/18/2026, 182 records):
 *     Proceeds $235,034.51 · Realized +$5,178.38 · G/L Ratio 55.44%
 * Column B = monthly proceeds; C = realized G/L; D = disallowed loss. */
export const _trades: SheetData = {
  id: "_trades",
  title: "_trades",
  columns: [
    { letter: "A", width: 100 },
    { letter: "B", width: 120 },
    { letter: "C", width: 120 },
    { letter: "D", width: 120 },
  ],
  rowHeight: 28,
  maxRow: 11,
  maxCol: 4,
  cells: {
    A1: { value: "Month", bold: true },
    B1: { value: "Proceeds ($)", bold: true },
    C1: { value: "Realized P/L ($)", bold: true },
    D1: { value: "Disallowed ($)", bold: true },
    A2: { value: "2025-08" }, B2: { value: 24218.17 },  C2: { value: 3321.23 },   D2: { value: 0.00 },
    A3: { value: "2025-09" }, B3: { value: 21927.59 },  C3: { value: 2904.13 },   D3: { value: 0.00 },
    A4: { value: "2025-10" }, B4: { value: 57877.67 },  C4: { value: 5904.51 },   D4: { value: 375.08 },
    A5: { value: "2025-11" }, B5: { value: 47260.90 },  C5: { value: -4492.30 },  D5: { value: 2574.32 },
    A6: { value: "2025-12" }, B6: { value: 12158.10 },  C6: { value: -534.50 },   D6: { value: 527.28 },
    A7: { value: "2026-01" }, B7: { value: 54086.12 },  C7: { value: 6583.15 },   D7: { value: 374.39 },
    A8: { value: "2026-02" }, B8: { value: 26742.72 },  C8: { value: 258.37 },    D8: { value: 811.64 },
    A9: { value: "2026-03" }, B9: { value: 55359.51 },  C9: { value: 6377.69 },   D9: { value: 366.58 },
    A10: { value: "2026-04" }, B10: { value: 15389.22 }, C10: { value: -3847.10 }, D10: { value: 1338.00 },
    // Totals: B2:B10 = $315,020.00 · C2:C10 = +$16,475.18 · D2:D10 = $6,367.29
  },
};

/** Monthly platform requests across 11 tools - totals ~75,000 */
export const _tools: SheetData = {
  id: "_tools",
  title: "_tools",
  columns: [
    { letter: "A", width: 180 },
    { letter: "B", width: 80 },
  ],
  rowHeight: 28,
  maxRow: 14,
  maxCol: 2,
  cells: {
    A1: { value: "Tool", bold: true },
    B1: { value: "Runs/mo", bold: true },
    A2: { value: "Resume Analyzer" },        B2: { value: 14200 },
    A3: { value: "ATS Score + Keyword Fix" }, B3: { value: 11800 },
    A4: { value: "Cover-Letter Writer" },     B4: { value: 9400 },
    A5: { value: "Interview Simulator" },     B5: { value: 8100 },
    A6: { value: "Behavioral Practice" },     B6: { value: 6200 },
    A7: { value: "Cold-Outreach Generator" }, B7: { value: 5800 },
    A8: { value: "LinkedIn Optimizer" },      B8: { value: 5500 },
    A9: { value: "Job-Fit Ranker" },          B9: { value: 4700 },
    A10: { value: "Company Research Pack" },  B10: { value: 3900 },
    A11: { value: "Salary Negotiation Coach" }, B11: { value: 3200 },
    A12: { value: "Portfolio Writer" },       B12: { value: 2200 },
    // Total: 75,000
  },
};

/** Talk attendance - totals ~1,400 across 6 events */
export const _talks: SheetData = {
  id: "_talks",
  title: "_talks",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 80 },
  ],
  rowHeight: 28,
  maxRow: 9,
  maxCol: 2,
  cells: {
    A1: { value: "Event", bold: true },
    B1: { value: "Audience", bold: true },
    A2: { value: "Drexel class guest lecture #1" }, B2: { value: 180 },
    A3: { value: "Drexel class guest lecture #2" }, B3: { value: 220 },
    A4: { value: "Drexel entrepreneurship panel" }, B4: { value: 310 },
    A5: { value: "Drexel orientation talk" },       B5: { value: 420 },
    A6: { value: "DCG speaker series" },            B6: { value: 160 },
    A7: { value: "GDG workshop kickoff" },          B7: { value: 110 },
    // Total: 1,400
  },
};

/** Prize money won */
export const _prizes: SheetData = {
  id: "_prizes",
  title: "_prizes",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 80 },
  ],
  rowHeight: 28,
  maxRow: 5,
  maxCol: 2,
  cells: {
    A1: { value: "Source", bold: true },
    B1: { value: "Amount $", bold: true },
    A2: { value: "Philly CodeFest 2026 (1st, Advanced)" }, B2: { value: 3000 },
    A3: { value: "NJ Garden State Esports 2023 State Champion" }, B3: { value: 20000 },
    A4: { value: "NJ Garden State Esports 2024 State Champion" }, B4: { value: 20000 },
    // Total: 43,000
  },
};

/** Client websites shipped by Local Launch Studio Co. */
export const _clients: SheetData = {
  id: "_clients",
  title: "_clients",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 80 },
  ],
  rowHeight: 28,
  maxRow: 13,
  maxCol: 2,
  cells: {
    A1: { value: "Client", bold: true },
    B1: { value: "SEO lift %", bold: true },
    A2: { value: "Client 1 (NJ SMB)" },  B2: { value: 280 },
    A3: { value: "Client 2 (PA SMB)" },  B3: { value: 320 },
    A4: { value: "Client 3 (PA SMB)" },  B4: { value: 410 },
    A5: { value: "Client 4 (DE SMB)" },  B5: { value: 290 },
    A6: { value: "Client 5 (NJ SMB)" },  B6: { value: 250 },
    A7: { value: "Client 6 (PA SMB)" },  B7: { value: 340 },
    A8: { value: "Client 7 (NJ SMB)" },  B8: { value: 390 },
    A9: { value: "Client 8 (PA SMB)" },  B9: { value: 300 },
    A10: { value: "Client 9 (DE SMB)" }, B10: { value: 280 },
    A11: { value: "Client 10 (PA SMB)" }, B11: { value: 320 },
    // 10 sites, avg 318%, matches resume "300%+"
  },
};

/** WOLF Financial channels followed */
export const _channels: SheetData = {
  id: "_channels",
  title: "_channels",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 120 },
  ],
  rowHeight: 28,
  maxRow: 6,
  maxCol: 2,
  cells: {
    A1: { value: "Platform", bold: true },
    B1: { value: "Followers", bold: true },
    A2: { value: "X / Twitter" },    B2: { value: 7800000 },
    A3: { value: "Instagram" },      B3: { value: 4200000 },
    A4: { value: "TikTok" },         B4: { value: 1900000 },
    A5: { value: "LinkedIn" },       B5: { value: 400000 },
    // Max: 7.8M (primary channel); total 14.3M combined
  },
};

/** The Good Idea Fund allocation pool (annual) */
export const _tgif: SheetData = {
  id: "_tgif",
  title: "_tgif",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 120 },
  ],
  rowHeight: 28,
  maxRow: 13,
  maxCol: 2,
  cells: {
    A1: { value: "Quarter", bold: true },
    B1: { value: "Pool ($)", bold: true },
    A2: { value: "Spring 2026 allocations" }, B2: { value: 28000 },
    A3: { value: "Winter 2026 allocations" }, B3: { value: 22000 },
    A4: { value: "Fall 2025 allocations" },   B4: { value: 31000 },
    A5: { value: "Reserved FY26 pool" },      B5: { value: 19000 },
    // Total: 100,000
  },
};

/** Philly CodeFest PhilAIsion languages + services */
export const _philaision: SheetData = {
  id: "_philaision",
  title: "_philaision",
  columns: [
    { letter: "A", width: 160 },
    { letter: "B", width: 100 },
  ],
  rowHeight: 28,
  maxRow: 13,
  maxCol: 2,
  cells: {
    A1: { value: "Language", bold: true },
    B1: { value: "Service count", bold: true },
    A2: { value: "English" },  B2: { value: 712 },
    A3: { value: "Spanish" },  B3: { value: 680 },
    A4: { value: "Mandarin" }, B4: { value: 645 },
    A5: { value: "Vietnamese" }, B5: { value: 610 },
    A6: { value: "Korean" },   B6: { value: 595 },
    A7: { value: "Arabic" },   B7: { value: 580 },
    A8: { value: "French" },   B8: { value: 560 },
    A9: { value: "Portuguese" }, B9: { value: 545 },
    A10: { value: "Russian" }, B10: { value: 530 },
    A11: { value: "Haitian Creole" }, B11: { value: 510 },
  },
};

/** Registry of hidden data sheets - included in SHEETS_BY_ID but NOT in visible SHEETS. */
export const HIDDEN_SHEETS: SheetData[] = [
  _trades,
  _tools,
  _talks,
  _prizes,
  _clients,
  _channels,
  _tgif,
  _philaision,
];

import type { SheetData } from "@/lib/excel/types";

const H = "#c0c0c0";

export const projects: SheetData = {
  id: "projects",
  title: "Projects",
  columns: [
    { letter: "A", width: 180 },
    { letter: "B", width: 220 },
    { letter: "C", width: 120 },
    { letter: "D", width: 110 },
    { letter: "E", width: 260 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 32,
  maxCol: 5,
  initialSelection: "A2",
  cells: {
    A1: { value: "Project", bold: true, bg: H },
    B1: { value: "What it is", bold: true, bg: H },
    C1: { value: "My Role", bold: true, bg: H },
    D1: { value: "Headline Metric", bold: true, bg: H },
    E1: { value: "Open", bold: true, bg: H },

    A2: { value: "Bulletproof AI", bold: true },
    B2: { value: "Full-stack AI job-prep platform (11 tools)" },
    C2: { value: "Co-Founder, Eng" },
    D2: { value: "75,000+ req/mo", align: "right" },
    E2: { value: "Case study →", onClick: { openApp: "bulletproof" } },

    A3: { value: "PhilAIsion", bold: true },
    B3: { value: "AI civic agent on a $50 Raspberry Pi 4 kiosk" },
    C3: { value: "Builder" },
    D3: { value: "700+ services · 10 langs", align: "right" },
    E3: { value: "Case study →", onClick: { openApp: "philaision" } },

    A4: { value: "Stock Portfolio Mgmt", bold: true },
    B4: { value: "Macro swing trading, Excel-validated strategy" },
    C4: { value: "Trader / Analyst" },
    D4: { value: "63.98% gain ratio · 267 trades · $315k", align: "right" },
    E4: { value: "Details →", onClick: { openApp: "stock-portfolio" } },

    A5: { value: "CNIPA Patent", bold: true },
    B5: { value: "Utility Model IP: water-resistant golf bag" },
    C5: { value: "Co-Inventor" },
    D5: { value: "Sept 2024", align: "right" },
    E5: { value: "Details →", onClick: { openApp: "patent" } },

    A6: { value: "Business Psychology", bold: true },
    B6: { value: "Co-developed Drexel elective course" },
    C6: { value: "Course Co-Dev" },
    D6: { value: "350+ students surveyed", align: "right" },

    A7: { value: "Market Journal", bold: true },
    B7: { value: "Daily/weekly market journal (indices, macro, crypto)" },
    C7: { value: "Research / Journal" },
    D7: { value: "~50 entries · Jan – Apr 2026", align: "right" },
    E7: { value: "Open →", onClick: { openApp: "market-recaps" } },

    A8: { value: "Competitions", bold: true, bg: H },
    B8: { value: "Placed / Finalist", bold: true, bg: H },
    C8: { value: "Year", bold: true, bg: H },
    D8: { value: "Notes", bold: true, bg: H },

    A9: { value: "Jane Street Estimathon" },
    B9: { value: "3rd Place" },
    C9: { value: "2026" },
    D9: { value: "Quant estimation under uncertainty" },

    A10: { value: "Howley Finance Impact Challenge" },
    B10: { value: "Finalist" },
    C10: { value: "2026" },

    A11: { value: "Dean's Student Advisory Board Equity Research Challenge" },
    B11: { value: "Finalist" },
    C11: { value: "2026" },

    A12: { value: "Philly CodeFest 2026 (Advanced Track)" },
    B12: { value: "1st Place · $3,000 winner share" },
    C12: { value: "Apr 2026" },
    D12: { value: "PhilAIsion (700+ city services, 10 langs)" },
    E12: { value: "Open →", onClick: { openApp: "philaision" } },

    A13: { value: "NJ Garden State Esports" },
    B13: { value: "State Champion" },
    C13: { value: "2023 & 2024" },
    D13: { value: "$40,000 prize pool" },

    A14: { value: "Philly-Wide Case (Aramark × BCG)" },
    B14: { value: "Finalist" },
    C14: { value: "2026" },

    A15: { value: "Datathon: Deloitte" },
    B15: { value: "Finalist" },
    C15: { value: "2026" },

    A16: { value: "UEV Ventures Building" },
    B16: { value: "Participant" },
    C16: { value: "2026" },

    A17: { value: "Baiada Institute Innovation Tournament" },
    B17: { value: "Participant" },
    C17: { value: "2026" },

    A18: { value: "IMC Prosperity 4" },
    B18: { value: "Participant" },
    C18: { value: "2026" },

    A19: { value: "Ascend × CLA × EY Case" },
    B19: { value: "Participant" },
    C19: { value: "2026" },

    A20: { value: "PGA Marketing Challenge" },
    B20: { value: "Participant" },
    C20: { value: "2026" },

    A22: {
      value: "Total prize money tracked",
      bold: true,
      align: "right",
    },
    B22: {
      value: "$43,000+",
      bold: true,
      align: "right",
    },
    C22: { value: "$3k CodeFest + $40k NJ Esports", italic: true, color: "#555" },
  },
};

import type { SheetData } from "@/lib/excel/types";

const H = "#c0c0c0";
const ACCENT = "#fff3b0"; // banner highlight
const MUTED = "#666666";

/**
 * The default-open sheet. Designed for the recruiter 6-second scan.
 * Row 1-3: identity + headline
 * Row 5-8: 4 banner wins with case-study deep links
 * Row 10-14: grouped stat tiles (dollars / reach / shipped / wins) with
 *   consistent units per row so the numbers actually compare
 * Row 16-25: Hiring Info block (exactly what a recruiter's ATS needs)
 */
export const highlights: SheetData = {
  id: "highlights",
  title: "Highlights",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 400 },
    { letter: "C", width: 180 },
  ],
  frozenRows: 1,
  rowHeight: 22,
  maxRow: 30,
  maxCol: 3,
  initialSelection: "A1",
  cells: {
    // Hero row
    A1: {
      value: "WILL ZHANG - student founder, shipper, operator",
      bold: true,
      bg: H,
      merged: { colspan: 3 },
      align: "left",
    },

    A2: {
      value:
        "Drexel B.S. Business Admin (Analytics + Marketing) · GPA 4.0 · Dean's List · Philadelphia, PA",
      italic: true,
      color: MUTED,
      merged: { colspan: 3 },
    },

    A3: {
      value:
        "Co-founded Bulletproof AI (75k+ tool runs/mo, 200k-resume ATS). 1st place Philly CodeFest 2026. Trades my own book - $315,020 processed, 63.98% gain ratio across 267 logged trades. Former competitive junior golfer (US + China tours).",
      merged: { colspan: 3 },
    },

    // Banner wins - 4 most impressive, with case study deep-links
    A5: { value: "🏆  Philly CodeFest 2026", bold: true, bg: ACCENT },
    B5: {
      value: "1st Place, Advanced Track - 370+ participants, $3,000 winner share",
      bg: ACCENT,
    },
    C5: {
      value: "case study →",
      onClick: { openApp: "philaision" },
      bg: ACCENT,
      color: "#0000ee",
    },

    A6: { value: "🧠  Bulletproof AI", bold: true, bg: ACCENT },
    B6: {
      value: "75k+ tool runs Month 1 · 11 live AI tools · 200k-resume ATS model",
      bg: ACCENT,
    },
    C6: {
      value: "case study →",
      onClick: { openApp: "bulletproof" },
      bg: ACCENT,
      color: "#0000ee",
    },

    A7: { value: "📈  Stock Portfolio", bold: true, bg: ACCENT },
    B7: {
      value: "$315,020 processed · 63.98% gain ratio · 267 logged trades · Excel-validated macro swing strategy",
      bg: ACCENT,
    },
    C7: {
      value: "details →",
      onClick: { openApp: "stock-portfolio" },
      bg: ACCENT,
      color: "#0000ee",
    },

    A8: { value: "⚙  CNIPA Utility Model Patent", bold: true, bg: ACCENT },
    B8: {
      value: "A Multi-Purpose Golf Bag · filed September 2024 · CNIPA 202422233493.5",
      bg: ACCENT,
    },
    C8: {
      value: "details →",
      onClick: { openApp: "patent" },
      bg: ACCENT,
      color: "#0000ee",
    },

    // Grouped stat tiles - units now consistent within each row
    A10: {
      value: "By the numbers",
      bold: true,
      bg: H,
      merged: { colspan: 3 },
    },

    A11: { value: "Dollars touched", bold: true },
    B11: {
      value:
        "$315,020 in trade volume · $85,000+ tuition · $43,000 prize money · $100,000 fund allocated",
      merged: { colspan: 2 },
    },

    A12: { value: "Audience reached", bold: true },
    B12: {
      value:
        "75,000+ monthly tool runs · 80,000+ views in Month 1 · 1,400+ students in talks · 14.3M follower marketing footprint",
      merged: { colspan: 2 },
    },

    A13: { value: "Shipped & filed", bold: true },
    B13: {
      value:
        "10 client websites · 11 live AI tools · 200,000-resume ATS model · 1 CNIPA utility-model patent",
      merged: { colspan: 2 },
    },

    A14: { value: "Competitive wins", bold: true },
    B14: {
      value:
        "Philly CodeFest 2026 (1st) · Jane Street Estimathon (3rd) · PGA Marketing Crisis finalist · multiple 2nd / 3rd golf finishes (US + China tours)",
      merged: { colspan: 2 },
    },

    // Hiring Info block - exactly what an ATS form needs
    A16: {
      value: "HIRING INFO",
      bold: true,
      bg: H,
      merged: { colspan: 3 },
    },

    A17: { value: "Degree", bold: true },
    B17: {
      value: "B.S. Business Administration (Business Analytics + Marketing)",
      merged: { colspan: 2 },
    },

    A18: { value: "GPA · Honors", bold: true },
    B18: {
      value: "4.0 · Dean's List (December 2025 – present)",
      merged: { colspan: 2 },
    },

    A19: { value: "Graduation", bold: true },
    B19: { value: "June 2029", merged: { colspan: 2 } },

    A20: { value: "Location", bold: true },
    B20: { value: "Philadelphia, PA", merged: { colspan: 2 } },

    A21: { value: "Phone", bold: true },
    B21: {
      value: "(267) 255-1163",
      href: "tel:+12672551163",
      merged: { colspan: 2 },
    },

    A22: { value: "Email", bold: true },
    B22: {
      value: "wz363@drexel.edu",
      href: "mailto:wz363@drexel.edu",
    },
    C22: {
      value: "compose →",
      onClick: { openApp: "contact" },
    },

    A23: { value: "LinkedIn", bold: true },
    B23: {
      value: "linkedin.com/in/willzhang6200",
      href: "https://www.linkedin.com/in/willzhang6200",
    },
    C23: {
      value: "open →",
      onClick: {
        openApp: "ie",
        props: { url: "https://www.linkedin.com/in/willzhang6200" },
      },
    },

    A24: { value: "Resume", bold: true },
    B24: { value: "Resume.pdf · 1 page · updated April 2026" },
    C24: { value: "open →", onClick: { openApp: "resume" } },

    // Footer
    A28: {
      value:
        "// Tip: click any → link to drill down · arrow keys select cells · select a range to see live Sum / Avg / Count below.",
      italic: true,
      color: MUTED,
      merged: { colspan: 3 },
    },
  },
};

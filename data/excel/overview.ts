import type { SheetData } from "@/lib/excel/types";

const HEADER_BG = "#c0c0c0";

export const overview: SheetData = {
  id: "overview",
  title: "Overview",
  columns: [
    { letter: "A", width: 140 },
    { letter: "B", width: 360 },
    { letter: "C", width: 120 },
    { letter: "D", width: 120 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 32,
  maxCol: 4,
  initialSelection: "B2",
  cells: {
    A1: { value: "Field", bold: true, bg: HEADER_BG, align: "center" },
    B1: { value: "Value", bold: true, bg: HEADER_BG, align: "center" },
    C1: { value: "Link", bold: true, bg: HEADER_BG, align: "center" },
    D1: { value: "Note", bold: true, bg: HEADER_BG, align: "center" },

    A2: { value: "Name", bold: true },
    B2: { value: "Will Zhang", bold: true },

    A3: { value: "Role" },
    B3: { value: "Student Founder · Builder · Operator" },

    A4: { value: "School" },
    B4: { value: "Drexel University" },
    C4: {
      value: "About →",
      onClick: { openApp: "about" },
      comment: "Open the About window",
    },

    A5: { value: "Degree" },
    B5: { value: "B.S. Business Admin · Business Analytics + Marketing" },

    A6: { value: "GPA" },
    B6: { value: 4.0, formula: "=4.0/4.0", align: "right" },
    D6: { value: "Dean's List · Dec 2025 –" },

    A7: { value: "Graduation" },
    B7: { value: "June 2029" },

    A8: { value: "Location" },
    B8: { value: "Philadelphia, PA" },

    A10: { value: "Current Focus", bold: true, bg: HEADER_BG },
    B10: { value: "Where I'm spending my time", bold: true, bg: HEADER_BG },

    A11: { value: "Bulletproof AI" },
    B11: {
      value: "Co-Founder · Drexel's largest student job-prep platform",
    },
    C11: {
      value: "Case study →",
      onClick: { openApp: "bulletproof" },
    },

    A12: { value: "The Good Idea Fund" },
    B12: { value: "Director of Relations · $100k+ student funding allocation" },
    C12: { value: "Leadership →", onClick: { openApp: "leadership" } },

    A13: { value: "Super Lychee Golf" },
    B13: { value: "Ops Team Lead · $85k+ tuition ops across Beijing/Shanghai" },

    A14: { value: "Drexel Consulting Group" },
    B14: {
      value: "Venture Advisory + Sports Entertainment Consultant · WOLF Financial (14.3M+ followers)",
    },

    A16: { value: "Selected Wins", bold: true, bg: HEADER_BG },
    B16: { value: "2024 – 2026", bold: true, bg: HEADER_BG },

    A17: { value: "🏆 Philly CodeFest 2026" },
    B17: {
      value: "1st Place, Advanced Track · PhilAIsion · 370+ participants",
    },
    C17: { value: "Case study →", onClick: { openApp: "philaision" } },

    A18: { value: "📈 Stock Portfolio" },
    B18: { value: "$315,020 processed · 63.98% gain ratio · 267 logged trades" },
    C18: { value: "Details →", onClick: { openApp: "stock-portfolio" } },
    D18: { value: "Live →", onClick: { openApp: "willbb" } },

    A19: { value: "⚙ CNIPA Patent" },
    B19: { value: "Utility Model · Water-resistant golf bag innovation" },
    C19: { value: "Details →", onClick: { openApp: "patent" } },

    A20: { value: "🏁 NJ Esports State Champion" },
    B20: { value: "2023 + 2024 · $40,000 prize pool" },

    A22: { value: "Contact", bold: true, bg: HEADER_BG },
    B22: { value: "", bold: true, bg: HEADER_BG },

    A23: { value: "Email" },
    B23: {
      value: "wz363@drexel.edu",
      href: "mailto:wz363@drexel.edu",
    },

    A24: { value: "LinkedIn" },
    B24: {
      value: "www.linkedin.com/in/willzhang6200",
      href: "https://www.linkedin.com/in/willzhang6200",
    },

    A25: { value: "Resume" },
    B25: { value: "Resume.pdf (open in viewer)", onClick: { openApp: "resume" } },

    A26: { value: "Phone" },
    B26: { value: "(267) 255-1163" },

    A28: {
      value: "// Tip: click any → link to dive deeper, or try the Projects tab →",
      italic: true,
      color: "#555",
      merged: { colspan: 4 },
    },
  },
};

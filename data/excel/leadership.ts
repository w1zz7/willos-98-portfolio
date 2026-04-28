import type { SheetData } from "@/lib/excel/types";

const H = "#c0c0c0";

export const leadership: SheetData = {
  id: "leadership",
  title: "Leadership",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 170 },
    { letter: "C", width: 120 },
    { letter: "D", width: 320 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 26,
  maxCol: 4,
  initialSelection: "A2",
  cells: {
    A1: { value: "Organization", bold: true, bg: H },
    B1: { value: "Role", bold: true, bg: H },
    C1: { value: "Since", bold: true, bg: H },
    D1: { value: "Scope", bold: true, bg: H },

    A2: { value: "The Good Idea Fund", bold: true },
    B2: { value: "Director of Relations" },
    C2: { value: "January 2026" },
    D2: {
      value:
        "Evaluate 100+ student funding proposals for Drexel's largest student-run fund ($100,000+ annual pool; final allocations by committee). Lead outreach, recruiting, and partner relationships.",
    },

    A4: { value: "Drexel Consulting Group", bold: true },
    B4: { value: "Venture Advisory Consultant, Sport Entertainment Consultant" },
    C4: { value: "March 2026" },
    D4: {
      value:
        "Growing Gen Z exposure by overseeing 14.3M+ total followers for WOLF Financial's Marketing Team.",
    },

    A6: { value: "Google Developer Group", bold: true },
    B6: { value: "Primary Technical Lead" },
    C6: { value: "March 2026" },
    D6: {
      value:
        "Lead Google CodeLab workshops on campus - Machine Learning, AI Studio, SubAgents.",
    },

    A8: { value: "Drexel High Finance Program", bold: true },
    B8: { value: "Public Market" },
    C8: { value: "April 2026" },
    D8: {
      value:
        "Selective LeBow College of Business cohort - market research and portfolio construction.",
    },

    A11: {
      value: "Leadership Footprint",
      bold: true,
      bg: H,
      merged: { colspan: 4 },
    },

    A12: { value: "Capital pool (evaluated 100+ proposals)" },
    B12: {
      value: "$100,000+",
      formula: "=SUM(_tgif!B2:B12)",
      bold: true,
      align: "right",
    },

    A13: { value: "Students reached (6 invited talks)" },
    B13: {
      value: "1,400+",
      formula: "=SUM(_talks!B2:B7)",
      bold: true,
      align: "right",
    },

    A14: { value: "Social audience planned for (4 platforms)" },
    B14: {
      value: "14.3M+",
      formula: "=MAX(_channels!B2:B5)",
      bold: true,
      align: "right",
    },

    A15: { value: "CodeLab tracks (ML · AI Studio · SubAgent)" },
    B15: {
      value: "3",
      bold: true,
      align: "right",
    },
  },
};

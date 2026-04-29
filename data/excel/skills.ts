import type { SheetData } from "@/lib/excel/types";

const H = "#c0c0c0";
const SUB = "#e8e8e8";

export const skills: SheetData = {
  id: "skills",
  title: "Skills",
  columns: [
    { letter: "A", width: 220 },
    { letter: "B", width: 720 },
    { letter: "C", width: 130 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 40,
  maxCol: 3,
  initialSelection: "A2",
  cells: {
    A1: { value: "Category", bold: true, bg: H },
    B1: { value: "Stack", bold: true, bg: H },
    C1: { value: "Level", bold: true, bg: H },

    A2: { value: "Modeling & Finance", bold: true, bg: SUB },
    B2: { value: "DCF · 3-Statement · FMVA® · UPenn Quant Modeling · multifamily underwriting (Project Destined)" },
    C2: { value: "Advanced", align: "center" },

    A3: { value: "Data & Analytics", bold: true, bg: SUB },
    B3: {
      value:
        "Python · SQL · Tableau · Power BI · Excel (Yellow Belt) · Google Sheets",
    },
    C3: { value: "Advanced", align: "center" },

    A4: { value: "AI & ML", bold: true, bg: SUB },
    B4: {
      value:
        "Claude Code · AI SubAgents · Prompt Engineering (few-shot, constraint-setting) · AI Prompting · AI Management · AI Equity Research · Retrieval-Augmented Generation (RAG) · ATS model training (200k resumes) · OpenAI + ElevenLabs agents",
    },
    C4: { value: "Advanced", align: "center" },

    A5: { value: "Engineering", bold: true, bg: SUB },
    B5: {
      value:
        "HTML · CSS · JavaScript · TypeScript · Next.js · React 18 · Vite · Node.js + Express + Prisma · Supabase · Framer Motion · Raspberry Pi 4 (PhilAIsion kiosk) · Google Cloud Platform · Web Hosting · Terminal Server",
    },
    C5: { value: "Proficient", align: "center" },

    A6: { value: "Sales & Growth", bold: true, bg: SUB },
    B6: {
      value:
        "Booth-based sales (Vovex $20k+, 60% engagement lift) · SMB consulting (Local Launch, 10 sites, 300%+ SEO lift) · Meta Social Media Marketing · Google Ads",
    },
    C6: { value: "Proficient", align: "center" },

    A7: { value: "Design & Ops", bold: true, bg: SUB },
    B7: { value: "Figma · Canva · Microsoft Office · Google Workspace" },
    C7: { value: "Proficient", align: "center" },

    A8: { value: "Languages", bold: true, bg: SUB },
    B8: { value: "English (native) · Mandarin Chinese (Seal of Biliteracy)" },
    C8: { value: "Bilingual", align: "center" },

    A10: {
      value: "Certifications",
      bold: true,
      bg: H,
      merged: { colspan: 3 },
    },

    A11: { value: "FMVA® - Financial Modeling & Valuation Analyst" },
    B11: { value: "Corporate Finance Institute · Issued Feb 2026" },

    A12: { value: "Data Analyst Associate" },
    B12: { value: "DataCamp · Feb 2026" },

    A13: { value: "Associate Data Analyst in SQL" },
    B13: { value: "DataCamp · Feb 2026" },

    A14: { value: "Python Programming Fundamentals" },
    B14: { value: "DataCamp · Jan 2026" },

    A15: { value: "AI Fundamentals" },
    B15: { value: "DataCamp · Jan 2026" },

    A16: { value: "Goldman Sachs - Operations Job Simulation" },
    B16: { value: "Forage · Jan 2026" },

    A17: { value: "Level 2: Excel Yellow Belt" },
    B17: { value: "McGraw Hill · Dec 2025" },

    A18: { value: "Meta Social Media Marketing Professional" },
    B18: { value: "Meta · Nov 2025" },

    A19: { value: "Fundamentals of Quantitative Modeling" },
    B19: { value: "University of Pennsylvania (Wharton / Coursera) · Nov 2025" },

    A20: { value: "CNIPA Utility Model Patent" },
    B20: {
      value: "China National IP Administration · Sep 2024 · A Multi-Purpose Golf Bag",
      onClick: { openApp: "patent" },
    },

    A21: { value: "Seal of Biliteracy - Chinese" },
    B21: { value: "State of New Jersey" },

    A23: {
      value:
        "// Stack philosophy: learn the tool, ship the thing, verify with the data.",
      italic: true,
      color: "#555",
      merged: { colspan: 3 },
    },
  },
};

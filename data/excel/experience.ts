import type { SheetData } from "@/lib/excel/types";

const H = "#c0c0c0";

export const experience: SheetData = {
  id: "experience",
  title: "Experience",
  columns: [
    { letter: "A", width: 200 },
    { letter: "B", width: 180 },
    { letter: "C", width: 140 },
    { letter: "D", width: 140 },
    { letter: "E", width: 340 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 30,
  maxCol: 5,
  initialSelection: "A2",
  cells: {
    A1: { value: "Company", bold: true, bg: H },
    B1: { value: "Role", bold: true, bg: H },
    C1: { value: "Location", bold: true, bg: H },
    D1: { value: "Dates", bold: true, bg: H },
    E1: { value: "Impact", bold: true, bg: H },

    // Bulletproof AI
    A2: {
      value: "Local Launch Studio Co. (Bulletproof AI)",
      bold: true,
      onClick: { openApp: "bulletproof" },
    },
    B2: { value: "Co-Founder" },
    C2: { value: "Philadelphia, PA" },
    D2: { value: "December 2025 – Present" },
    E2: {
      value:
        "Founded web dev + digital solutions agency serving SMBs in NJ/PA/DE; 10 client sites shipped (GrubGuide latest) with 300%+ average organic-search lift.",
    },

    A3: { value: "" },
    E3: {
      value:
        "Built BulletproofAI.org on Next.js · RAG pipeline · ATS model trained on 200,000 publicly sourced resumes · 75,000+ tool runs in Month 1 across 11 live AI tools.",
    },
    A4: { value: "" },
    E4: {
      value:
        "Leads 7-person distributed team across UVA, UMD, Purdue, MIT · presented to 1,400+ students across 6 invited talks · 80,000+ views across 3 platforms in first month.",
    },

    // Drexel High Finance Program
    A6: { value: "Drexel High Finance Program", bold: true },
    B6: { value: "Public Market" },
    C6: { value: "Philadelphia, PA" },
    D6: { value: "April 2026 – Present" },
    E6: {
      value:
        "Selective LeBow College of Business cohort - public-market research and portfolio construction.",
    },

    // The Good Idea Fund
    A8: { value: "The Good Idea Fund", bold: true, onClick: { openApp: "leadership" } },
    B8: { value: "Director of Relations" },
    C8: { value: "Philadelphia, PA" },
    D8: { value: "January 2026 – Present" },
    E8: {
      value:
        "Allocate $100,000+ for student-led programs + philanthropy by evaluating 100+ student budget proposals. Lead public outreach, recruiting, and partner relationships for Drexel's largest student-run funding organization.",
    },

    // Google Developer Group
    A13: { value: "Google Developer Group", bold: true },
    B13: { value: "Primary Technical Lead" },
    C13: { value: "Drexel (Philadelphia, PA)" },
    D13: { value: "March 2026 – Present" },
    E13: {
      value:
        "Instruct AI Workshops for Google technical CodeLab workshops on campus (Machine Learning, AI Studio, SubAgent).",
    },

    // Drexel Consulting Group
    A15: { value: "Drexel Consulting Group", bold: true },
    B15: { value: "Venture Advisory Consultant, Sport Entertainment Consultant" },
    C15: { value: "Philadelphia, PA" },
    D15: { value: "March 2026 – Present" },
    E15: {
      value:
        "Growing Gen Z exposure by overseeing 14.3M+ total followers for WOLF Financial's Marketing Team.",
    },

    // Super Lychee Golf Series
    A17: { value: "Super Lychee Golf Series", bold: true },
    B17: { value: "Operations Team Lead" },
    C17: { value: "Beijing / Shanghai, China" },
    D17: { value: "April 2024 – Present" },
    E17: {
      value:
        "Coordinate cross-functional collaboration with 10+ partners including event planning and logistics, contributing to 8 annual FCG China Series events and Foresight Sports' GCQuad golf simulator sponsorship.",
    },
    A18: { value: "" },
    E18: {
      value:
        "Collect $85,000+ tuition by maintaining communication, following up on payments, and tracking in Excel using automated formulas.",
    },
    A19: { value: "" },
    E19: {
      value:
        "Supervised 6 junior athletes with parents twice from China for a 2-month U.S. training program - managing 4 flights, 100+ hotel room nights, and registrations for 4 golf events.",
    },

    // Vovex Golf
    A21: { value: "Vovex Golf", bold: true },
    B21: { value: "Sales & Marketing Intern" },
    C21: { value: "San Diego, CA" },
    D21: { value: "June 2024 – August 2024" },
    E21: {
      value:
        "Generated $20,000+ in sales revenue selling 120+ units across 4 national golf tournaments by using custom sales pitches.",
    },
    A22: { value: "" },
    E22: {
      value:
        "Increased booth engagement by 60% by setting up 3 customized booth layouts and achieving 40+ sales in 5 hours.",
    },

    // Gen.G Esports
    A24: { value: "Gen.G Esports", bold: true },
    B24: { value: "Event Operations Analyst Intern" },
    C24: { value: "Shanghai, China" },
    D24: { value: "January 2024 – June 2024" },
    E24: {
      value:
        "Analyzed global data using Tableau / Power BI from 150+ esports tournaments and live streaming platforms to identify engagement and viewer behavior patterns, summarizing insights for the executive team.",
    },
    A25: { value: "" },
    E25: {
      value:
        "Evaluated 10+ sponsorship proposals, summarizing contributions and contract terms for a Brand & Partnerships pitch deck.",
    },

    // Summary row
    A28: { value: "Distinct roles (resume)", bold: true, align: "right" },
    B28: {
      value: 7,
      bold: true,
      align: "right",
    },
    C28: { value: "roles", italic: true, color: "#555" },

    A35: {
      value:
        "// Source: LinkedIn + resume. Click the Bulletproof AI rows to open the case study.",
      italic: true,
      color: "#555",
      merged: { colspan: 5 },
    },
  },
};

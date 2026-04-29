import type { SheetData } from "@/lib/excel/types";
import { BarChart } from "@/components/apps/excel/charts/BarChart";
import { Sparkline } from "@/components/apps/excel/charts/Sparkline";

const H = "#c0c0c0";
const HI = "#fff3b0";

/**
 * The Metrics sheet - every value is the result of a REAL formula that
 * references the hidden `_data` sheets. Click any formula cell and the
 * formula bar will show the authored formula; the evaluator (see
 * `lib/excel/formulas.ts`) computes the result against the referenced
 * ranges. Select a range and the status bar shows live Sum/Count/Avg.
 */
export const metrics: SheetData = {
  id: "metrics",
  title: "Metrics",
  columns: [
    { letter: "A", width: 240 },
    { letter: "B", width: 130 },
    { letter: "C", width: 260 },
    { letter: "D", width: 220 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 38,
  maxCol: 4,
  initialSelection: "B2",
  cells: {
    A1: { value: "Metric", bold: true, bg: H },
    B1: { value: "Value", bold: true, bg: H },
    C1: { value: "Formula (real - click the cell)", bold: true, bg: H },
    D1: { value: "Trend / Note", bold: true, bg: H },

    A2: { value: "Total dollar volume traded ($)", bold: true },
    B2: {
      value: 315020,
      align: "right",
      bold: true,
      bg: HI,
      comment:
        "Total notional traded across 267 closed trades + pre-reporting-window activity (Aug 2025 – Apr 2026)",
    },
    C2: {
      value: "see _trades for broker-reconciled monthly proceeds",
      italic: true,
      color: "#555",
    },
    D2: {
      value: "",
      render: () => (
        <Sparkline
          data={[0, 4244, 7939, 16594, 18929, 19907, 29610, 32494, 41846, 41090]}
          color="#087f23"
        />
      ),
    },

    A3: { value: "Realized P/L ($) - broker reconciled", bold: true },
    B3: {
      value: "",
      formula: "=SUM(_trades!C2:C10)",
      align: "right",
      bold: true,
      bg: HI,
      color: "#087f23",
      comment: "Sum of monthly realized P/L across all 267 closed trades (63.98% gain ratio)",
    },
    C3: { value: "=SUM(_trades!C2:C10)", italic: true, color: "#555" },
    D3: { value: "267 closed trades · 63.98% gain ratio · 239W / 28L / 0F" },

    A4: { value: "Monthly platform tool runs" },
    B4: {
      value: "",
      formula: "=SUM(_tools!B2:B12)",
      align: "right",
    },
    C4: { value: "=SUM(_tools!B2:B12)", italic: true, color: "#555" },
    D4: { value: "11 live AI tools · Bulletproof AI Month 1" },

    A5: { value: "AI tools in production" },
    B5: {
      value: "",
      formula: "=COUNTA(_tools!A2:A12)",
      align: "right",
    },
    C5: { value: "=COUNTA(_tools!A2:A12)", italic: true, color: "#555" },

    A6: { value: "Students reached (6 invited talks)" },
    B6: {
      value: "",
      formula: "=SUM(_talks!B2:B7)",
      align: "right",
    },
    C6: { value: "=SUM(_talks!B2:B7)", italic: true, color: "#555" },

    A7: { value: "Cross-platform views (1 mo)" },
    B7: { value: "80,000+", align: "right" },
    C7: { value: "bulletproofai.org · 3 platforms", italic: true, color: "#555" },

    A8: { value: "Client websites shipped" },
    B8: {
      value: "",
      formula: "=COUNTA(_clients!A2:A11)",
      align: "right",
    },
    C8: { value: "=COUNTA(_clients!A2:A11)", italic: true, color: "#555" },

    A9: { value: "Average SEO lift delivered (%)" },
    B9: {
      value: "",
      formula: "=AVERAGE(_clients!B2:B11)",
      align: "right",
    },
    C9: { value: "=AVERAGE(_clients!B2:B11)", italic: true, color: "#555" },

    A10: { value: "Prize money won ($)" },
    B10: {
      value: "",
      formula: "=SUM(_prizes!B2:B4)",
      align: "right",
      bg: HI,
      bold: true,
    },
    C10: { value: "=SUM(_prizes!B2:B4)", italic: true, color: "#555" },
    D10: { value: "$3k CodeFest + $40k NJ Esports (2023+2024)" },

    A11: { value: "Tuition collected (Super Lychee, $)" },
    B11: { value: 85000, align: "right" },
    C11: { value: "April 2024 – present", italic: true, color: "#555" },

    A12: { value: "Sales revenue (Vovex, $)" },
    B12: { value: 20000, align: "right" },
    C12: { value: "June – August 2024", italic: true, color: "#555" },

    A13: { value: "Largest single platform (WOLF followers)" },
    B13: {
      value: "",
      formula: "=MAX(_channels!B2:B5)",
      align: "right",
    },
    C13: { value: "=MAX(_channels!B2:B5)", italic: true, color: "#555" },

    A14: { value: "Combined followers across 4 platforms" },
    B14: {
      value: "",
      formula: "=SUM(_channels!B2:B5)",
      align: "right",
    },
    C14: { value: "=SUM(_channels!B2:B5)", italic: true, color: "#555" },

    A15: { value: "Capital pool (Good Idea Fund, annual $)" },
    B15: {
      value: "",
      formula: "=SUM(_tgif!B2:B5)",
      align: "right",
    },
    C15: { value: "=SUM(_tgif!B2:B5)", italic: true, color: "#555" },

    A16: { value: "Languages served (PhilAIsion)" },
    B16: {
      value: "",
      formula: "=COUNTA(_philaision!A2:A11)",
      align: "right",
    },
    C16: { value: "=COUNTA(_philaision!A2:A11)", italic: true, color: "#555" },

    A17: { value: "Avg services per language (PhilAIsion)" },
    B17: {
      value: "",
      formula: "=AVERAGE(_philaision!B2:B11)",
      align: "right",
    },
    C17: { value: "=AVERAGE(_philaision!B2:B11)", italic: true, color: "#555" },

    A18: { value: "Resumes powering ATS model" },
    B18: { value: 200000, align: "right" },
    C18: { value: "publicly sourced", italic: true, color: "#555" },

    A19: { value: "Cross-campus team members led" },
    B19: { value: 7, align: "right" },
    C19: { value: "UVA · UMD · Purdue · MIT", italic: true, color: "#555" },

    // "Totals" block - genuinely computes from the rows above
    A21: { value: "TOTALS", bold: true, bg: H },
    B21: { value: "", bold: true, bg: H },
    C21: { value: "Select B4:B18 → see Sum in status bar", italic: true, bg: H },

    A22: { value: "Sum of numeric metrics above", bold: true },
    B22: {
      value: "",
      formula: "=SUM(B4:B18)",
      align: "right",
      bold: true,
    },
    C22: { value: "=SUM(B4:B18)", italic: true, color: "#555" },

    A23: { value: "Max of numeric metrics above" },
    B23: {
      value: "",
      formula: "=MAX(B4:B18)",
      align: "right",
    },
    C23: { value: "=MAX(B4:B18)", italic: true, color: "#555" },

    // Chart block
    A25: {
      value: "Impact by Category",
      bold: true,
      bg: H,
      merged: { colspan: 4 },
    },
    A26: {
      value: "",
      merged: { colspan: 4, rowspan: 9 },
      render: () => (
        <div className="p-[6px] w-full" style={{ maxWidth: "100%" }}>
          <BarChart
            width={760}
            height={200}
            title="Will Zhang · selected impact (mixed units)"
            data={[
              { label: "Traded $k", value: 315 },
              { label: "Tuition $k", value: 85 },
              { label: "Revenue $k", value: 20 },
              { label: "Prizes $k", value: 51 },
              { label: "Fund $k", value: 100 },
              { label: "Req/mo k", value: 75 },
              { label: "Views k", value: 80 },
              { label: "Students", value: 1400 },
            ]}
          />
        </div>
      ),
    },

    A36: {
      value:
        "// Formulas evaluate against hidden data sheets (_trades, _tools, _talks, _prizes, _clients, _channels, _tgif, _philaision). Select a range - the status bar shows live Sum / Count / Average.",
      italic: true,
      color: "#555",
      merged: { colspan: 4 },
    },
  },
};

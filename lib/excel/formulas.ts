import type { CellRef, SheetData } from "./types";
import { parseRef, makeRef } from "./cellRef";

/**
 * Minimal formula evaluator - real enough to feel like Excel, small enough
 * to ship in ~150 LOC.
 *
 * Supports:
 *   =FN(ref)            single cell
 *   =FN(A1:A10)         range on same sheet
 *   =FN(sheet!A1:A10)   range on another sheet (including hidden `_data` sheets)
 *
 * where FN ∈ { SUM, AVERAGE, AVG, COUNTA, COUNT, MAX, MIN }.
 *
 * No operator precedence, parens, or arithmetic outside functions. A bare
 * reference like `=A5` is also supported (returns the referenced value).
 */

const FUNCTIONS = {
  SUM: (nums: number[]) => nums.reduce((a, b) => a + b, 0),
  AVERAGE: (nums: number[]) => (nums.length ? sum(nums) / nums.length : 0),
  AVG: (nums: number[]) => (nums.length ? sum(nums) / nums.length : 0),
  MAX: (nums: number[]) => (nums.length ? Math.max(...nums) : 0),
  MIN: (nums: number[]) => (nums.length ? Math.min(...nums) : 0),
  COUNT: (nums: number[]) => nums.length,
  COUNTA: (_nums: number[], raw: unknown[]) =>
    raw.filter((v) => v !== undefined && v !== null && v !== "").length,
} as const;

type FunctionName = keyof typeof FUNCTIONS;

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export interface EvalContext {
  /** The sheet currently hosting the formula - used to resolve relative refs. */
  sheet: SheetData;
  /** All sheets (including hidden ones) keyed by id. */
  sheetsById: Record<string, SheetData>;
}

/**
 * Evaluate a formula string (with or without leading `=`). Returns the
 * numeric result, or a string fallback for display errors.
 */
export function evaluate(
  formula: string,
  ctx: EvalContext
): number | string {
  if (formula == null) return "";
  const raw = formula.trim().replace(/^=/, "");
  if (!raw) return "";

  // Try bare reference first
  const ref = raw.match(/^(?:([A-Za-z_][A-Za-z0-9_]*)!)?([A-Za-z]+\d+)$/);
  if (ref) {
    const sheetId = ref[1];
    const cellRef = ref[2];
    return resolveCell(sheetId, cellRef, ctx);
  }

  // Function call: FN(inner)
  const fn = raw.match(/^([A-Za-z]+)\s*\(\s*(.+?)\s*\)\s*$/);
  if (!fn) return "#ERR";
  const name = fn[1].toUpperCase() as FunctionName;
  const inner = fn[2];
  if (!(name in FUNCTIONS)) return "#NAME?";

  const { raw: rawCells, nums } = resolveRange(inner, ctx);
  const impl = FUNCTIONS[name];
  try {
    return impl(nums, rawCells);
  } catch {
    return "#ERR";
  }
}

/**
 * Resolve a range argument like `A1:A10`, `sheet!A1:A10`, or a single `A1`.
 * Returns both the raw values (for COUNTA) and numeric values (for the rest).
 */
function resolveRange(
  arg: string,
  ctx: EvalContext
): { raw: unknown[]; nums: number[] } {
  // sheet!A1:B10 or A1:B10 or sheet!A5 or A5
  const m = arg.match(
    /^(?:([A-Za-z_][A-Za-z0-9_]*)!)?([A-Za-z]+\d+)(?::([A-Za-z]+\d+))?$/
  );
  if (!m) return { raw: [], nums: [] };

  const sheetId = m[1];
  const start = m[2];
  const end = m[3] ?? m[2];

  const sheet = sheetId
    ? ctx.sheetsById[sheetId] ?? ctx.sheet
    : ctx.sheet;

  const a = parseRef(start);
  const b = parseRef(end);
  const minC = Math.min(a.col, b.col);
  const maxC = Math.max(a.col, b.col);
  const minR = Math.min(a.row, b.row);
  const maxR = Math.max(a.row, b.row);

  const raw: unknown[] = [];
  const nums: number[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const cell = sheet.cells[makeRef(c, r)];
      const v = cell?.value;
      if (v !== undefined) raw.push(v);
      if (typeof v === "number") nums.push(v);
      else if (typeof v === "string") {
        const n = Number(v.replace(/[$,%\s]/g, ""));
        if (!Number.isNaN(n) && v.trim() !== "") nums.push(n);
      }
    }
  }
  return { raw, nums };
}

function resolveCell(
  sheetId: string | undefined,
  cellRef: CellRef,
  ctx: EvalContext
): number | string {
  const sheet = sheetId ? ctx.sheetsById[sheetId] ?? ctx.sheet : ctx.sheet;
  const v = sheet.cells[cellRef]?.value;
  if (v === undefined) return "";
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,%\s]/g, ""));
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  return String(v);
}

/**
 * Evaluate the computed value for a cell. Returns the cell's own value if
 * there's no formula, or the evaluated formula result otherwise.
 */
export function computedValue(
  sheet: SheetData,
  cellRef: CellRef,
  sheetsById: Record<string, SheetData>
): string | number {
  const cell = sheet.cells[cellRef];
  if (!cell) return "";
  if (cell.formula) {
    const result = evaluate(cell.formula, { sheet, sheetsById });
    return typeof result === "number" ? result : cell.value ?? result;
  }
  return cell.value;
}

import type { CellRef, SheetData } from "./types";
import { parseRef, makeRef } from "./cellRef";
import { computedValue } from "./formulas";
import type { SheetData as Sheet } from "./types";

export interface RangeStats {
  count: number;     // COUNTA (non-empty)
  countNum: number;  // COUNT (numeric only)
  sum: number;
  avg: number;
  min: number;
  max: number;
}

/**
 * Compute Sum / Count / Avg over the rectangular range [anchor, focus] on
 * `sheet`. Values come from `computedValue` so formulas are evaluated first.
 */
export function computeRangeStats(
  sheet: SheetData,
  anchor: CellRef,
  focus: CellRef,
  sheetsById: Record<string, Sheet>
): RangeStats {
  const a = parseRef(anchor);
  const b = parseRef(focus);
  const minC = Math.min(a.col, b.col);
  const maxC = Math.max(a.col, b.col);
  const minR = Math.min(a.row, b.row);
  const maxR = Math.max(a.row, b.row);

  let count = 0;
  let countNum = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const ref = makeRef(c, r);
      const v = computedValue(sheet, ref, sheetsById);
      if (v === "" || v === null || v === undefined) continue;
      count++;
      const n =
        typeof v === "number"
          ? v
          : Number(String(v).replace(/[$,%\s]/g, ""));
      if (!Number.isNaN(n) && isFinite(n) && String(v).trim() !== "") {
        countNum++;
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }
    }
  }

  return {
    count,
    countNum,
    sum,
    avg: countNum > 0 ? sum / countNum : 0,
    min: isFinite(min) ? min : 0,
    max: isFinite(max) ? max : 0,
  };
}

export function formatNumber(n: number): string {
  if (!isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

"use client";

import { useExcelStore } from "@/lib/excel/store";
import type { SheetData } from "@/lib/excel/types";
import { SHEETS_BY_ID } from "@/data/excel";
import { computedValue } from "@/lib/excel/formulas";

export function FormulaBar({ sheet }: { sheet: SheetData }) {
  const selectedCell = useExcelStore((s) => s.selectedCell);
  const cell = sheet.cells[selectedCell];

  // Prefer the authored formula for display ("show me the magic").
  // Fall back to the evaluated/computed value otherwise.
  let display = "";
  if (cell) {
    if (cell.formula) {
      display = cell.formula.startsWith("=") ? cell.formula : `=${cell.formula}`;
    } else if (cell.value != null) {
      display = String(cell.value);
    }
  }

  // Edge case: bare formula with no explicit value - evaluate it for display.
  if (cell?.formula && !cell.value && cell.value !== 0) {
    const evaluated = computedValue(sheet, selectedCell, SHEETS_BY_ID);
    if (evaluated !== "") display = `${cell.formula} → ${evaluated}`;
  }

  return (
    <div className="flex items-stretch h-[32px] win-raised border-b border-[#808080] gap-0">
      {/* Name box - selected cell ref (Excel 97 size) */}
      <div className="win-field flex items-center justify-between px-[4px] w-[84px] text-[18px] font-[var(--font-cell)] border-r border-[#808080]">
        <span className="truncate">{selectedCell}</span>
        <span
          className="shrink-0 pl-[2px] text-[color:var(--color-win-text-disabled)]"
          style={{ fontSize: 10, lineHeight: 1 }}
        >
          ▾
        </span>
      </div>
      {/* Cancel (red X) */}
      <button
        type="button"
        className="win-btn h-[32px] min-w-0 w-[28px] px-0"
        aria-label="Cancel edit"
        title="Cancel"
        disabled
      >
        <span style={{ color: "#c00", fontWeight: 700, fontSize: 16 }}>✕</span>
      </button>
      {/* Enter (green ✓) */}
      <button
        type="button"
        className="win-btn h-[32px] min-w-0 w-[28px] px-0"
        aria-label="Confirm entry"
        title="Enter"
        disabled
      >
        <span style={{ color: "#087f23", fontWeight: 700, fontSize: 16 }}>✓</span>
      </button>
      {/* fx button */}
      <button
        type="button"
        className="win-btn h-[32px] min-w-0 w-[30px] px-0 italic font-bold"
        aria-label="Insert function"
        title="Insert function"
      >
        <span style={{ fontFamily: "Georgia, serif", fontSize: 14 }}>fx</span>
      </button>
      {/* Formula/value display (read-only) */}
      <div className="win-field flex-1 flex items-center px-[8px] text-[18px] font-[var(--font-cell)] truncate">
        {display}
      </div>
    </div>
  );
}

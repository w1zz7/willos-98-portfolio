"use client";

import { useExcelStore } from "@/lib/excel/store";
import type { SheetData } from "@/lib/excel/types";
import { SHEETS_BY_ID } from "@/data/excel";
import { computeRangeStats, formatNumber } from "@/lib/excel/selectionStats";

export function StatusBar({ sheet }: { sheet: SheetData }) {
  const selectedCell = useExcelStore((s) => s.selectedCell);
  const selectionAnchor = useExcelStore((s) => s.selectionAnchor);
  const stats = computeRangeStats(
    sheet,
    selectionAnchor,
    selectedCell,
    SHEETS_BY_ID
  );

  // Right-side display: authentic Excel status-bar math
  let right = "";
  if (stats.countNum >= 2) {
    right = `Sum=${formatNumber(stats.sum)}  Count=${stats.count}  Average=${formatNumber(stats.avg)}`;
  } else if (stats.count >= 2) {
    right = `Count=${stats.count}`;
  }

  const isRange = selectedCell !== selectionAnchor;

  return (
    <div className="flex h-[28px] win-raised border-t border-[#808080]">
      <div
        className="win-field flex items-center px-[8px] text-[20px] w-[180px] shrink-0 border-r border-[#808080] truncate"
        title={
          isRange
            ? `Range: ${selectionAnchor}:${selectedCell}`
            : "Arrow keys move · shift-click extends selection"
        }
      >
        {isRange ? `${selectionAnchor}:${selectedCell}` : "Ready"}
      </div>
      <div className="win-field flex-1 min-w-0 flex items-center justify-end px-[12px] text-[20px] border-r border-[#808080] font-[var(--font-cell)] truncate">
        {right}
      </div>
      <div className="win-field flex items-center px-[8px] text-[20px] w-[80px] shrink-0 font-bold">
        NUM
      </div>
    </div>
  );
}

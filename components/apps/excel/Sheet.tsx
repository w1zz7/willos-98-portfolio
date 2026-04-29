"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useExcelStore } from "@/lib/excel/store";
import { colIndexToLetter, makeRef, moveRef, parseRef } from "@/lib/excel/cellRef";
import type { SheetData } from "@/lib/excel/types";
import { openApp } from "@/lib/wm/registry";
import { openLink } from "@/lib/wm/openLink";
import { SHEETS_BY_ID } from "@/data/excel";
import { computedValue } from "@/lib/excel/formulas";

/**
 * Renders a full Excel-style grid from declarative SheetData.
 *
 * Event delegation: one click handler on the grid reads data-cell-ref to
 * dispatch interactions; one keydown handler runs arrow/tab/enter nav;
 * shift+click extends the range selection.
 */
export function Sheet({ sheet }: { sheet: SheetData }) {
  const selectedCell = useExcelStore((s) => s.selectedCell);
  const selectionAnchor = useExcelStore((s) => s.selectionAnchor);
  const setSelection = useExcelStore((s) => s.setSelection);
  const extendSelection = useExcelStore((s) => s.extendSelection);
  const rowHeight = sheet.rowHeight ?? 28;
  const gridRef = useRef<HTMLDivElement>(null);

  // Ensure initial selection is applied when sheet changes
  useEffect(() => {
    if (sheet.initialSelection) setSelection(sheet.initialSelection);
    else setSelection("A1");
  }, [sheet.id, sheet.initialSelection, setSelection]);

  // Ensure selected cell is scrolled into view
  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLElement>(
      `[data-cell-ref="${selectedCell}"]`
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedCell]);

  // Range membership helper - is ref inside the [anchor..focus] box?
  const isInRange = useCallback(
    (col: number, row: number): boolean => {
      const a = parseRef(selectionAnchor);
      const b = parseRef(selectedCell);
      const minC = Math.min(a.col, b.col);
      const maxC = Math.max(a.col, b.col);
      const minR = Math.min(a.row, b.row);
      const maxR = Math.max(a.row, b.row);
      return col >= minC && col <= maxC && row >= minR && row <= maxR;
    },
    [selectionAnchor, selectedCell]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-cell-ref]"
      );
      if (!target) return;
      const ref = target.dataset.cellRef!;

      // Shift+click extends the range, doesn't fire the cell action
      if (e.shiftKey) {
        extendSelection(ref);
        e.preventDefault();
        return;
      }

      setSelection(ref);
      const cell = sheet.cells[ref];
      if (!cell) return;
      if (cell.onClick) {
        openApp(cell.onClick.openApp, cell.onClick.props);
      } else if (cell.href) {
        openLink(cell.href);
      }
    },
    [sheet.cells, setSelection, extendSelection]
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      const { selectedCell: cur } = useExcelStore.getState();
      let next = cur;
      switch (e.key) {
        case "ArrowUp":
          next = moveRef(cur, "up", sheet.maxCol, sheet.maxRow);
          break;
        case "ArrowDown":
          next = moveRef(cur, "down", sheet.maxCol, sheet.maxRow);
          break;
        case "ArrowLeft":
          next = moveRef(cur, "left", sheet.maxCol, sheet.maxRow);
          break;
        case "ArrowRight":
        case "Tab":
          next = moveRef(cur, "right", sheet.maxCol, sheet.maxRow);
          break;
        case "Enter": {
          const cell = sheet.cells[cur];
          if (cell?.onClick) {
            openApp(cell.onClick.openApp, cell.onClick.props);
          } else if (cell?.href) {
            openLink(cell.href);
          } else {
            next = moveRef(cur, "down", sheet.maxCol, sheet.maxRow);
          }
          break;
        }
        default:
          return;
      }
      if (next !== cur) {
        e.preventDefault();
        if (e.shiftKey) extendSelection(next);
        else setSelection(next);
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
      }
    },
    [sheet, setSelection, extendSelection]
  );

  const cols = useMemo(() => sheet.columns, [sheet.columns]);

  const selectedPos = parseRef(selectedCell);

  return (
    <div
      ref={gridRef}
      className="flex-1 min-h-0 min-w-0 w-full overflow-auto win-scroll bg-white"
      tabIndex={0}
      onKeyDown={handleKey}
      onClick={handleClick}
      style={{ outline: "none" }}
    >
      <table className="excel-grid">
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-20"
              style={{ width: 44, height: 28, minWidth: 44 }}
              aria-hidden
            />
            {cols.map((col, i) => (
              <th
                key={col.letter}
                className="sticky top-0 z-10"
                style={{ width: col.width, minWidth: col.width, height: 28 }}
                data-selected={selectedPos.col === i + 1}
              >
                {col.letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: sheet.maxRow }).map((_, rIdx) => {
            const rowNum = rIdx + 1;
            return (
              <tr key={rowNum} style={{ height: rowHeight }}>
                <th
                  className="sticky left-0 z-10"
                  style={{ width: 44, minWidth: 44 }}
                  data-selected={selectedPos.row === rowNum}
                >
                  {rowNum}
                </th>
                {cols.map((col, cIdx) => {
                  const colNum = cIdx + 1;
                  const ref = makeRef(colNum, rowNum);
                  const cell = sheet.cells[ref];
                  const isSelected = ref === selectedCell;
                  const inRange =
                    !isSelected && isInRange(colNum, rowNum);
                  const isLink = !!(cell?.href || cell?.onClick);

                  // Compute display value - if the cell has a formula, evaluate it
                  const displayValue =
                    cell?.formula != null && (cell.value == null || cell.value === "")
                      ? computedValue(sheet, ref, SHEETS_BY_ID)
                      : cell?.value ?? "";

                  const valueText = String(displayValue);
                  const alreadyHasArrow = valueText.includes("→");
                  const showArrow = isLink && !cell?.render && !alreadyHasArrow;

                  const style: React.CSSProperties = {
                    width: col.width,
                    minWidth: col.width,
                    background: inRange
                      ? "#e3ecf7"
                      : cell?.bg,
                    color: cell?.color,
                    fontWeight: cell?.bold ? "bold" : undefined,
                    fontStyle: cell?.italic ? "italic" : undefined,
                    textAlign:
                      cell?.align ??
                      (typeof displayValue === "number" ? "right" : "left"),
                  };

                  return (
                    <td
                      key={ref}
                      data-cell-ref={ref}
                      data-selected={isSelected}
                      data-in-range={inRange}
                      data-link={isLink}
                      data-has-arrow={showArrow}
                      title={cell?.comment}
                      colSpan={cell?.merged?.colspan}
                      rowSpan={cell?.merged?.rowspan}
                      style={style}
                    >
                      {cell?.render ? (
                        cell.render(cell)
                      ) : (
                        <>
                          {typeof displayValue === "number"
                            ? displayValue.toLocaleString()
                            : displayValue}
                          {showArrow && (
                            <span
                              aria-hidden
                              className="ml-[3px] opacity-70"
                            >
                              →
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <span className="hidden">{colIndexToLetter(1)}</span>
    </div>
  );
}

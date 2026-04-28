"use client";

import { useState } from "react";
import { SHEETS } from "@/data/excel";
import type { SheetData, Cell as CellT } from "@/lib/excel/types";
import { SHEETS_BY_ID } from "@/data/excel";
import { computedValue } from "@/lib/excel/formulas";
import { openApp } from "@/lib/wm/registry";
import { openLink } from "@/lib/wm/openLink";
import { showToast, ToastHost } from "@/components/primitives/Toast";
import { WindowLayer } from "@/components/wm/WindowLayer";

/**
 * Mobile experience - preserves the Win98 / Excel visual identity but drops
 * the window metaphor (which doesn't work on a 375px phone). Single-column
 * retro-chromed scroll. Sheet tabs at the top; active sheet renders below
 * as card/stack sections. Sticky bottom nav with the three conversion
 * targets + Hire Me.
 */
export function MobilePortfolio() {
  const [activeId, setActiveId] = useState<string>(SHEETS[0].id);
  const active = SHEETS.find((s) => s.id === activeId) ?? SHEETS[0];

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText("wz363@drexel.edu");
      showToast("Email copied - wz363@drexel.edu");
    } catch {
      showToast("Couldn't copy email");
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col bg-white"
      style={{ background: "var(--color-win-bg)" }}
    >
      {/* Retro titlebar */}
      <div className="win-titlebar-active flex items-center h-[28px] px-[8px] gap-[8px] shrink-0">
        <img
          src="/icons/excel.svg"
          alt=""
          width={24}
          height={24}
          className="shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="font-bold text-[18px] truncate flex-1 min-w-0">
          WillZhang.xlsx
        </span>
      </div>

      {/* Update timestamp */}
      <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)] px-[8px] py-[4px] border-b border-[#808080] bg-white shrink-0">
        Updated April 2026 · shipped while shipping
      </div>

      {/* Sheet tab strip - scrollable horizontal */}
      <div
        className="flex items-end h-[26px] win-raised border-b border-[#808080] overflow-x-auto win-scroll shrink-0"
        style={{ gap: 0 }}
      >
        {SHEETS.map((s) => (
          <button
            key={s.id}
            type="button"
            data-active={s.id === activeId}
            className="excel-tab shrink-0"
            onClick={() => setActiveId(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Active sheet rendered as card stack */}
      <div className="flex-1 min-h-0 overflow-auto win-scroll bg-white">
        <div className="p-[10px] pb-[80px] flex flex-col gap-[10px]">
          <MobileSheet sheet={active} />
        </div>
      </div>

      {/* Sticky bottom nav */}
      <nav
        className="win-raised flex items-stretch h-[48px] border-t-2 border-[#808080] shrink-0"
        style={{ gap: 0 }}
      >
        <NavBtn
          label="Resume"
          glyph="📄"
          onClick={() => openApp("resume")}
        />
        <NavBtn label="Copy Email" glyph="📋" onClick={copyEmail} />
        <NavBtn
          label="LinkedIn"
          glyph="in"
          onClick={() =>
            openLink("https://www.linkedin.com/in/willzhang6200")
          }
        />
        <NavBtn
          label="Contact"
          glyph="✉"
          onClick={() => openApp("contact")}
        />
      </nav>

      {/* Opened apps overlay the card stack fullscreen on mobile.
          Window.tsx renders them edge-to-edge when breakpoint !== "desktop". */}
      <WindowLayer />

      <ToastHost />
    </div>
  );
}

function NavBtn({
  label,
  glyph,
  onClick,
  accent,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-[2px] ${
        accent ? "hire-me" : ""
      } win-btn`}
      style={{
        minWidth: 0,
        height: "100%",
        borderRadius: 0,
        paddingLeft: 2,
        paddingRight: 2,
        fontSize: 12,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{glyph}</span>
      <span
        className="font-bold leading-none whitespace-nowrap"
        style={{
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: 12,
        }}
      >
        {label}
      </span>
    </button>
  );
}

/* --------------------------------------------------------------
   Render a sheet as mobile-friendly card stack instead of a grid.
   Each "row" of the sheet becomes a row in a single-column card.
   -------------------------------------------------------------- */
function MobileSheet({ sheet }: { sheet: SheetData }) {
  const rows: Array<{ row: number; cells: Array<{ col: number; ref: string; cell: CellT }> }> = [];
  for (let r = 1; r <= sheet.maxRow; r++) {
    const cols: typeof rows[number]["cells"] = [];
    for (let c = 1; c <= sheet.maxCol; c++) {
      const ref = `${colLetter(c)}${r}`;
      const cell = sheet.cells[ref];
      if (cell) cols.push({ col: c, ref, cell });
    }
    if (cols.length > 0) rows.push({ row: r, cells: cols });
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {rows.map(({ row, cells }) => {
        // Detect heading rows (single merged bold cell with bg)
        const isHeading =
          cells.length === 1 &&
          cells[0].cell.bold &&
          (cells[0].cell.merged?.colspan ?? 1) >= 2;
        if (isHeading) {
          return (
            <div
              key={row}
              className="font-bold text-[19px] border-b border-[#808080] pb-[2px] pt-[6px]"
              style={{ background: cells[0].cell.bg, padding: 4 }}
            >
              {renderValue(cells[0].cell, sheet)}
            </div>
          );
        }

        return (
          <div
            key={row}
            className="win-window bg-white p-[8px] flex flex-col gap-[2px] text-[18px]"
          >
            {cells.map(({ ref, cell }) => {
              const display = renderValue(cell, sheet);
              const isLink = !!(cell.href || cell.onClick);
              const label = cells[0].col === 1 ? null : undefined;
              void label;
              return (
                <div key={ref} className="flex items-baseline gap-[6px]">
                  {cells.length > 1 && cells[0].ref === ref ? (
                    <div className="font-bold shrink-0" style={{ color: cell.color }}>
                      {display}
                    </div>
                  ) : isLink ? (
                    <button
                      type="button"
                      className="text-left flex-1 text-[#0000ee] underline"
                      onClick={() => {
                        if (cell.onClick) openApp(cell.onClick.openApp, cell.onClick.props);
                        else if (cell.href) openLink(cell.href);
                      }}
                    >
                      {display}
                      {!String(display).includes("→") && " →"}
                    </button>
                  ) : (
                    <div
                      className="flex-1"
                      style={{
                        color: cell.color,
                        fontWeight: cell.bold ? "bold" : undefined,
                        fontStyle: cell.italic ? "italic" : undefined,
                      }}
                    >
                      {display}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function renderValue(cell: CellT, sheet: SheetData): React.ReactNode {
  if (cell.render) return cell.render(cell);
  const v =
    cell.formula != null && (cell.value == null || cell.value === "")
      ? computedValue(sheet, "", SHEETS_BY_ID) // formula only - fallback
      : cell.value;
  // Handle the case above: computedValue with empty ref is wrong; guard:
  if (cell.formula && (cell.value == null || cell.value === "")) {
    // Evaluate against this specific cell by looking it up
    const matchingRef = Object.keys(sheet.cells).find(
      (r) => sheet.cells[r] === cell
    );
    if (matchingRef) return computedValue(sheet, matchingRef, SHEETS_BY_ID);
  }
  if (typeof v === "number") return v.toLocaleString();
  return v ?? "";
}

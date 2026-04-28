import type { AppId } from "@/lib/wm/types";

export type CellRef = string; // "A1", "B12", etc.

export interface Cell {
  /** Text or number displayed in the cell. */
  value: string | number;
  /** Shown in the formula bar when selected (e.g. "=SUM(B2:B7)"). */
  formula?: string;
  align?: "left" | "right" | "center";
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bg?: string;
  /** If set, renders as a link; clicking opens in IE window. */
  href?: string;
  /** Intra-desktop click: opens another app (e.g. project detail window). */
  onClick?: { openApp: AppId; props?: Record<string, unknown> };
  /** Escape hatch for charts/sparklines/custom renderers. */
  render?: (cell: Cell) => React.ReactNode;
  merged?: { colspan?: number; rowspan?: number };
  /** Tooltip / comment shown on hover. */
  comment?: string;
}

export interface SheetColumn {
  letter: string;
  width: number; // px
}

export interface SheetData {
  id: string;
  title: string;
  columns: SheetColumn[];
  frozenRows?: number;
  frozenCols?: number;
  rowHeight?: number; // default 20
  cells: Record<CellRef, Cell>;
  maxRow: number;
  maxCol: number;
  /** Initial cell to select when the sheet opens. */
  initialSelection?: CellRef;
}

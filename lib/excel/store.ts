"use client";

import { create } from "zustand";
import type { CellRef } from "./types";

interface ExcelState {
  activeSheet: string;
  /** Cursor / single selection. */
  selectedCell: CellRef;
  /** Range anchor - where the user started the selection. For a single-cell
   *  selection this equals `selectedCell`. */
  selectionAnchor: CellRef;
  setActiveSheet: (id: string) => void;
  setSelection: (ref: CellRef) => void;
  /** Extend the selection to `ref` while keeping the current anchor (shift+click). */
  extendSelection: (ref: CellRef) => void;
}

export const useExcelStore = create<ExcelState>()((set) => ({
  activeSheet: "highlights",
  selectedCell: "A1",
  selectionAnchor: "A1",
  setActiveSheet: (id) =>
    set({ activeSheet: id, selectedCell: "A1", selectionAnchor: "A1" }),
  setSelection: (ref) => set({ selectedCell: ref, selectionAnchor: ref }),
  extendSelection: (ref) =>
    set((s) => ({ selectedCell: ref, selectionAnchor: s.selectionAnchor })),
}));

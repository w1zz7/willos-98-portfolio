import type { CellRef } from "./types";

/** "A" = 1, "B" = 2, ..., "Z" = 26, "AA" = 27. */
export function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

export function colIndexToLetter(index: number): string {
  let out = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    index = Math.floor((index - 1) / 26);
  }
  return out || "A";
}

export function parseRef(ref: CellRef): { col: number; row: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) return { col: 1, row: 1 };
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) };
}

export function makeRef(col: number, row: number): CellRef {
  return `${colIndexToLetter(col)}${row}`;
}

export type Direction = "up" | "down" | "left" | "right";

export function moveRef(
  ref: CellRef,
  dir: Direction,
  maxCol: number,
  maxRow: number
): CellRef {
  const { col, row } = parseRef(ref);
  switch (dir) {
    case "up":
      return makeRef(col, Math.max(1, row - 1));
    case "down":
      return makeRef(col, Math.min(maxRow, row + 1));
    case "left":
      return makeRef(Math.max(1, col - 1), row);
    case "right":
      return makeRef(Math.min(maxCol, col + 1), row);
  }
}

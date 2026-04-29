"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface MineCell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacent: number;
}

export type MineStatus = "idle" | "playing" | "won" | "lost";

export interface MineState {
  cells: MineCell[];
  status: MineStatus;
  width: number;
  height: number;
  mineCount: number;
  flagsLeft: number;
  elapsed: number;
}

const W = 9;
const H = 9;
const MINES = 10;

function emptyBoard(): MineCell[] {
  return Array.from({ length: W * H }, () => ({
    isMine: false,
    isRevealed: false,
    isFlagged: false,
    adjacent: 0,
  }));
}

function indexOf(x: number, y: number): number {
  return y * W + x;
}

function forEachNeighbor(
  x: number,
  y: number,
  fn: (nx: number, ny: number) => void
) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) fn(nx, ny);
    }
  }
}

function generateMines(avoidIdx: number): MineCell[] {
  const cells = emptyBoard();
  const forbidden = new Set<number>([avoidIdx]);
  // Also forbid neighbors of first click for a pleasant first reveal
  const fx = avoidIdx % W;
  const fy = Math.floor(avoidIdx / W);
  forEachNeighbor(fx, fy, (nx, ny) => forbidden.add(indexOf(nx, ny)));

  let placed = 0;
  while (placed < MINES) {
    const idx = Math.floor(Math.random() * cells.length);
    if (forbidden.has(idx) || cells[idx].isMine) continue;
    cells[idx].isMine = true;
    placed++;
  }
  // Compute adjacency
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = indexOf(x, y);
      if (cells[idx].isMine) continue;
      let count = 0;
      forEachNeighbor(x, y, (nx, ny) => {
        if (cells[indexOf(nx, ny)].isMine) count++;
      });
      cells[idx].adjacent = count;
    }
  }
  return cells;
}

function flood(cells: MineCell[], start: number): MineCell[] {
  const next = cells.slice();
  const stack = [start];
  const seen = new Set<number>();
  while (stack.length) {
    const idx = stack.pop()!;
    if (seen.has(idx)) continue;
    seen.add(idx);
    const c = next[idx];
    if (c.isFlagged || c.isMine) continue;
    next[idx] = { ...c, isRevealed: true };
    if (c.adjacent !== 0) continue;
    const x = idx % W;
    const y = Math.floor(idx / W);
    forEachNeighbor(x, y, (nx, ny) => stack.push(indexOf(nx, ny)));
  }
  return next;
}

function checkWin(cells: MineCell[]): boolean {
  return cells.every((c) => (c.isMine ? !c.isRevealed : c.isRevealed));
}

function revealAllMines(cells: MineCell[]): MineCell[] {
  return cells.map((c) => (c.isMine ? { ...c, isRevealed: true } : c));
}

export function useMinesweeper() {
  const [cells, setCells] = useState<MineCell[]>(emptyBoard);
  const [status, setStatus] = useState<MineStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => {
      if (startedRef.current != null) {
        setElapsed(Math.min(999, Math.floor((Date.now() - startedRef.current) / 1000)));
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [status]);

  const reset = useCallback(() => {
    setCells(emptyBoard());
    setStatus("idle");
    setElapsed(0);
    startedRef.current = null;
  }, []);

  const reveal = useCallback(
    (idx: number) => {
      setCells((cur) => {
        if (status === "won" || status === "lost") return cur;
        const c = cur[idx];
        if (c.isRevealed || c.isFlagged) return cur;

        let working = cur;
        if (status === "idle") {
          working = generateMines(idx);
          setStatus("playing");
          startedRef.current = Date.now();
        }
        if (working[idx].isMine) {
          const revealed = revealAllMines(working);
          revealed[idx] = { ...revealed[idx], isRevealed: true };
          setStatus("lost");
          return revealed;
        }
        const next = flood(working, idx);
        if (checkWin(next)) setStatus("won");
        return next;
      });
    },
    [status]
  );

  const toggleFlag = useCallback(
    (idx: number) => {
      setCells((cur) => {
        if (status === "won" || status === "lost") return cur;
        const c = cur[idx];
        if (c.isRevealed) return cur;
        const next = cur.slice();
        next[idx] = { ...c, isFlagged: !c.isFlagged };
        return next;
      });
    },
    [status]
  );

  const flagsUsed = cells.reduce((n, c) => n + (c.isFlagged ? 1 : 0), 0);

  return {
    cells,
    status,
    width: W,
    height: H,
    mineCount: MINES,
    flagsLeft: Math.max(0, MINES - flagsUsed),
    elapsed,
    reset,
    reveal,
    toggleFlag,
  };
}

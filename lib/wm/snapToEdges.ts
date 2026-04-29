import type { Point, Size } from "./types";

const SNAP = 12; // px

/** Returns a snapped position if close to viewport edges, else the input. */
export function snapToEdges(
  pos: Point,
  size: Size,
  viewport: Size
): Point {
  let { x, y } = pos;
  if (Math.abs(x) < SNAP) x = 0;
  if (Math.abs(y) < SNAP) y = 0;
  if (Math.abs(viewport.w - (x + size.w)) < SNAP) x = viewport.w - size.w;
  if (Math.abs(viewport.h - (y + size.h)) < SNAP) y = viewport.h - size.h;
  return { x, y };
}

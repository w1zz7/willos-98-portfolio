/**
 * Pure geometry math for the QuantChart canvas renderer.
 *
 * Lives in its own module (no React, no DOM) so it can be unit-tested
 * without a JSDOM environment. Two responsibilities:
 *
 *   1. computeGeometry(bars, overlays, …) — given the input data and the
 *      current viewport state, produce x/y scales, candle-width, sub-pane
 *      layouts, and y-grid ticks. Same shape used by both the canvas
 *      drawing pass and the SVG chrome overlay.
 *
 *   2. resolveViewport / clampViewport / wheelZoom / panBy — viewport
 *      transitions are pure; the React component just feeds them current
 *      state and applies the result. Makes the zoom/pan math trivially
 *      testable (and easier to reason about than scattered handler logic).
 *
 * Layout constants (PADDING_*, *_RATIO, SUB_PANE_PAD) are exported so
 * QuantChartCanvas can keep them as the single source of truth — change
 * a constant here and both rendering and tests stay in sync.
 */

export const PADDING_LEFT = 8;
export const PADDING_RIGHT = 64;
export const PADDING_TOP = 12;
export const PADDING_BOTTOM = 28;
export const MAIN_RATIO_NO_SUB = 0.92;
export const MAIN_RATIO_WITH_SUB = 0.62;
export const SUB_PANE_PAD = 4;

/** Minimum zoom: never show fewer than this many bars. */
export const MIN_VISIBLE_BARS = 20;

export interface BarLite {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface OverlayLite {
  data: (number | null)[];
  pane?: string;
  style?: "line" | "histogram" | "area";
}

export interface ChartGeometry {
  W: number;
  H: number;
  innerW: number;
  mainTop: number;
  mainH: number;
  viewStart: number;
  viewEnd: number;
  visBars: BarLite[];
  dx: number;
  candleW: number;
  yHi: number;
  yLo: number;
  yScale: (price: number) => number;
  xScale: (localIdx: number) => number;
  absToLocal: (absIdx: number) => number;
  yGrid: number[];
  subPanes: string[];
  subScales: Map<string, SubScale>;
}

export interface SubScale {
  lo: number;
  hi: number;
  top: number;
  bottom: number;
  yFor: (v: number) => number;
}

/**
 * Build chart geometry for a single render pass. Pure function — given
 * the same inputs returns the same shape.
 *
 * Defensive guards (so a mis-shaped input never produces NaN scales):
 *   - Empty bars / single-bar zoom → falls back to a tight ±0.5% window
 *     around the close so the candle isn't a degenerate hairline.
 *   - All-zero volume → hi=1 instead of 0 so the histogram baseline is sane.
 *   - Flat price window → expands by ±0.5% so the y-range never collapses.
 *   - Non-finite high/low values → ignored when computing min/max.
 */
export function computeGeometry(
  bars: BarLite[],
  overlays: OverlayLite[],
  showVolume: boolean,
  viewportStartIdx: number | null,
  visibleBarsState: number | null,
  W: number,
  H: number,
): ChartGeometry {
  const innerW = W - PADDING_LEFT - PADDING_RIGHT;

  const mainOverlays = overlays.filter((o) => !o.pane || o.pane === "main");

  const subPanesSet = new Set<string>();
  overlays.forEach((o) => {
    if (o.pane && o.pane !== "main") subPanesSet.add(o.pane);
  });
  if (showVolume) subPanesSet.add("sub-volume");
  const subPanes = [...subPanesSet].sort();

  const viewStart = Math.max(0, Math.min(Math.max(0, bars.length - 1), viewportStartIdx ?? 0));
  const viewCount = visibleBarsState ?? bars.length;
  const viewEnd = Math.max(viewStart + 1, Math.min(bars.length, viewStart + viewCount));
  const visBars = bars.slice(viewStart, viewEnd);
  const dx = innerW / Math.max(1, visBars.length);
  const candleW = Math.max(2, dx * 0.7);

  const mainTop = PADDING_TOP;
  const totalH = H;
  const mainH =
    subPanes.length === 0
      ? totalH * MAIN_RATIO_NO_SUB - PADDING_TOP - PADDING_BOTTOM
      : totalH * MAIN_RATIO_WITH_SUB - PADDING_TOP;
  const subAreaTotal = totalH - PADDING_BOTTOM - mainH - PADDING_TOP;
  const subH =
    subPanes.length > 0 ? (subAreaTotal - SUB_PANE_PAD * subPanes.length) / subPanes.length : 0;

  // Y range over the visible window only. We collect candidates first
  // (highs, lows, overlay values) then take min/max, with explicit checks
  // for empty arrays so Math.min(...[]) doesn't return Infinity.
  let allHi = -Infinity;
  let allLo = Infinity;
  for (const b of visBars) {
    if (Number.isFinite(b.h)) allHi = Math.max(allHi, b.h);
    if (Number.isFinite(b.l)) allLo = Math.min(allLo, b.l);
  }
  for (const o of mainOverlays) {
    for (let i = viewStart; i < viewEnd; i++) {
      const v = o.data[i];
      if (typeof v === "number" && Number.isFinite(v)) {
        if (v > allHi) allHi = v;
        if (v < allLo) allLo = v;
      }
    }
  }

  if (!Number.isFinite(allHi) || !Number.isFinite(allLo)) {
    const fallbackPx = visBars[0]?.c ?? bars[bars.length - 1]?.c ?? 100;
    allHi = fallbackPx * 1.005;
    allLo = fallbackPx * 0.995;
  } else if (allHi - allLo < Number.EPSILON) {
    const half = Math.max(allHi * 0.005, 0.01);
    allHi = allHi + half;
    allLo = allLo - half;
  }
  const padPrice = (allHi - allLo) * 0.05;
  const yHi = allHi + padPrice;
  const yLo = allLo - padPrice;
  const yRange = yHi - yLo > Number.EPSILON ? yHi - yLo : 1;

  const yScale = (price: number) => mainTop + ((yHi - price) / yRange) * mainH;
  const xScale = (localIdx: number) => PADDING_LEFT + localIdx * dx + dx / 2;
  const absToLocal = (absIdx: number) => absIdx - viewStart;

  const ySteps = 5;
  const yGrid: number[] = [];
  for (let s = 0; s <= ySteps; s++) yGrid.push(yLo + (s / ySteps) * (yHi - yLo));

  const subScales = new Map<string, SubScale>();
  for (let i = 0; i < subPanes.length; i++) {
    const paneId = subPanes[i];
    const seriesInPane = overlays.filter((o) => o.pane === paneId);
    const flat: number[] = [];
    for (const o of seriesInPane) {
      for (let bi = viewStart; bi < viewEnd; bi++) {
        const v = o.data[bi];
        if (typeof v === "number" && Number.isFinite(v)) flat.push(v);
      }
    }
    let lo = flat.length ? Math.min(...flat) : 0;
    let hi = flat.length ? Math.max(...flat) : 1;
    if (paneId === "sub-rsi" || paneId === "sub-stoch") {
      lo = 0;
      hi = 100;
    }
    if (paneId === "sub-volume") {
      let vmax = 0;
      for (const b of visBars) {
        if (Number.isFinite(b.v) && b.v > vmax) vmax = b.v;
      }
      lo = 0;
      hi = vmax > 0 ? vmax : 1;
    }
    if (lo === hi) hi = lo + 1;
    const padding = (hi - lo) * 0.08;
    const lo2 =
      paneId === "sub-rsi" || paneId === "sub-stoch" || paneId === "sub-volume" ? lo : lo - padding;
    const hi2 =
      paneId === "sub-rsi" || paneId === "sub-stoch" || paneId === "sub-volume" ? hi : hi + padding;
    const top = mainTop + mainH + SUB_PANE_PAD + i * (subH + SUB_PANE_PAD);
    const bottom = top + subH;
    const range = hi2 - lo2;
    const denom = Math.abs(range) > Number.EPSILON ? range : 1;
    subScales.set(paneId, {
      lo: lo2,
      hi: hi2,
      top,
      bottom,
      yFor: (v: number) => top + ((hi2 - v) / denom) * (bottom - top),
    });
  }

  return {
    W,
    H,
    innerW,
    mainTop,
    mainH,
    viewStart,
    viewEnd,
    visBars,
    dx,
    candleW,
    yHi,
    yLo,
    yScale,
    xScale,
    absToLocal,
    yGrid,
    subPanes,
    subScales,
  };
}

/* ----------------------------------------------------------------------
 * Viewport transition math — pure functions used by zoom / pan handlers.
 * Each takes the current viewport state and returns the next one without
 * touching React. Lets us test the logic exhaustively (boundary clamps,
 * cursor-anchored zoom, scroll-momentum) without mounting a component.
 * -------------------------------------------------------------------- */

export interface ViewportState {
  start: number;
  count: number;
}

/** Resolve nullable React state into a concrete viewport. */
export function resolveViewport(
  startState: number | null,
  countState: number | null,
  totalBars: number,
): ViewportState {
  const count = countState ?? totalBars;
  const start = Math.max(0, Math.min(totalBars - 1, startState ?? 0));
  return { start, count };
}

/** Clamp a viewport into bounds — start ≥ 0, start+count ≤ totalBars. */
export function clampViewport(v: ViewportState, totalBars: number): ViewportState {
  const count = Math.max(MIN_VISIBLE_BARS, Math.min(totalBars, Math.round(v.count)));
  const start = Math.max(0, Math.min(totalBars - count, Math.round(v.start)));
  return { start, count };
}

/**
 * Wheel-to-zoom anchored at a cursor position. The bar under the cursor
 * stays at the same screen X after the zoom — the same behavior as
 * TradingView. Without anchoring, zooming feels like the chart "jumps."
 */
export function wheelZoom(
  current: ViewportState,
  totalBars: number,
  cursorLocalIdx: number,
  factor: number,
): ViewportState {
  const newCount = Math.max(
    MIN_VISIBLE_BARS,
    Math.min(totalBars, Math.round(current.count * factor)),
  );
  if (newCount === current.count) return current;
  const absUnderCursor = current.start + cursorLocalIdx;
  const cursorFrac = current.count > 1 ? cursorLocalIdx / Math.max(1, current.count - 1) : 0;
  const newStart = Math.max(
    0,
    Math.min(totalBars - newCount, Math.round(absUnderCursor - cursorFrac * (newCount - 1))),
  );
  return { start: newStart, count: newCount };
}

/** Pan by N bars (positive = forward in time, negative = back). */
export function panViewport(
  current: ViewportState,
  totalBars: number,
  deltaBars: number,
): ViewportState {
  const newStart = Math.max(0, Math.min(totalBars - current.count, current.start + deltaBars));
  return { start: newStart, count: current.count };
}

/** Snap to the right edge while preserving the current zoom level. */
export function jumpToLatest(current: ViewportState, totalBars: number): ViewportState {
  const newStart = Math.max(0, totalBars - current.count);
  return { start: newStart, count: current.count };
}

/**
 * Convert a CSS-pixel cursor X into a window-local bar index. Used by
 * both wheel zoom (anchor) and hover crosshair to map mouse → data.
 */
export function cursorXtoLocalIdx(
  cursorCssX: number,
  containerWidth: number,
  viewportCount: number,
): number {
  // dx maps in SAME units as containerWidth (CSS pixels).
  const innerW = containerWidth - PADDING_LEFT - PADDING_RIGHT;
  const dx = innerW / Math.max(1, viewportCount);
  const localIdx = Math.floor((cursorCssX - PADDING_LEFT) / dx);
  return Math.max(0, Math.min(viewportCount - 1, localIdx));
}

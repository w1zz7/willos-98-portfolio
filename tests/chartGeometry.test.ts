/**
 * QuantChart geometry + viewport math tests.
 *
 * The drag/zoom UX has a lot of subtle edge cases (boundary clamps,
 * cursor-anchored zoom, single-bar zoom rendering, all-null overlays).
 * These tests pin down the pure math so a refactor of the canvas
 * renderer can't silently break the navigation feel.
 */

import { describe, expect, it } from "vitest";

import {
  clampViewport,
  computeGeometry,
  cursorXtoLocalIdx,
  jumpToLatest,
  MIN_VISIBLE_BARS,
  panViewport,
  resolveViewport,
  wheelZoom,
  type BarLite,
  type OverlayLite,
} from "@/components/apps/willbb/quantdesk/chartGeometry";

function makeBars(n: number, start = 100, drift = 0.001): BarLite[] {
  const bars: BarLite[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift);
    bars.push({
      t: 1700_000_000 + i * 86400,
      o: p * 0.998,
      h: p * 1.005,
      l: p * 0.995,
      c: p,
      v: 1_000_000,
    });
  }
  return bars;
}

describe("computeGeometry — basic layout", () => {
  it("returns full-bar window when viewport is auto (null/null)", () => {
    const bars = makeBars(100);
    const g = computeGeometry(bars, [], false, null, null, 1000, 400);
    expect(g.viewStart).toBe(0);
    expect(g.viewEnd).toBe(100);
    expect(g.visBars.length).toBe(100);
  });

  it("slices to the requested viewport when start+count are set", () => {
    const bars = makeBars(100);
    const g = computeGeometry(bars, [], false, 30, 20, 1000, 400);
    expect(g.viewStart).toBe(30);
    expect(g.viewEnd).toBe(50);
    expect(g.visBars.length).toBe(20);
  });

  it("yScale + xScale are inverses of mapping back through the viewport", () => {
    const bars = makeBars(100);
    const g = computeGeometry(bars, [], false, null, null, 1000, 400);
    // The first bar's close should map to a y position within the main pane.
    const y = g.yScale(bars[0].c);
    expect(y).toBeGreaterThanOrEqual(g.mainTop);
    expect(y).toBeLessThanOrEqual(g.mainTop + g.mainH);
    // localIdx=0 maps to a positive x within the inner width.
    const x = g.xScale(0);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(g.W);
  });

  it("absToLocal converts absolute → local correctly across viewport changes", () => {
    const bars = makeBars(100);
    const g = computeGeometry(bars, [], false, 20, 30, 1000, 400);
    expect(g.absToLocal(20)).toBe(0);
    expect(g.absToLocal(35)).toBe(15);
    expect(g.absToLocal(49)).toBe(29);
    // Out-of-range values: still arithmetically valid (caller filters them).
    expect(g.absToLocal(10)).toBe(-10);
    expect(g.absToLocal(60)).toBe(40);
  });
});

describe("computeGeometry — defensive guards", () => {
  it("never produces NaN scales when bars array is empty", () => {
    const g = computeGeometry([], [], false, null, null, 1000, 400);
    expect(g.visBars.length).toBe(0);
    // yScale/xScale shouldn't crash even on an empty viewport
    const y = g.yScale(100);
    const x = g.xScale(0);
    expect(Number.isFinite(y)).toBe(true);
    expect(Number.isFinite(x)).toBe(true);
  });

  it("expands a single-bar zoom into a tight ±0.5% window", () => {
    const bars = makeBars(50, 100);
    const g = computeGeometry(bars, [], false, 25, 1, 1000, 400);
    // Single-bar zoom: yHi/yLo should NOT collapse to the same value
    expect(g.yHi).toBeGreaterThan(g.yLo);
    expect(g.yHi - g.yLo).toBeGreaterThan(0);
  });

  it("ignores non-finite high/low values when computing y range", () => {
    const bars = makeBars(20);
    bars[5].h = NaN;
    bars[10].l = NaN;
    const g = computeGeometry(bars, [], false, null, null, 1000, 400);
    expect(Number.isFinite(g.yHi)).toBe(true);
    expect(Number.isFinite(g.yLo)).toBe(true);
  });

  it("falls back to a tight window around the close when ALL highs/lows are NaN", () => {
    const bars = makeBars(10).map((b) => ({ ...b, h: NaN, l: NaN }));
    const g = computeGeometry(bars, [], false, null, null, 1000, 400);
    expect(Number.isFinite(g.yHi)).toBe(true);
    expect(Number.isFinite(g.yLo)).toBe(true);
    expect(g.yHi).toBeGreaterThan(g.yLo);
  });

  it("ignores all-null overlay data without crashing", () => {
    const bars = makeBars(20);
    const overlays: OverlayLite[] = [
      { data: Array(20).fill(null), pane: "main" },
    ];
    const g = computeGeometry(bars, overlays, false, null, null, 1000, 400);
    expect(g.visBars.length).toBe(20);
    expect(Number.isFinite(g.yHi)).toBe(true);
  });
});

describe("computeGeometry — sub-panes", () => {
  it("RSI pane is fixed [0, 100] regardless of overlay values", () => {
    const bars = makeBars(20);
    const overlays: OverlayLite[] = [
      { data: Array(20).fill(50.5), pane: "sub-rsi" },
    ];
    const g = computeGeometry(bars, overlays, false, null, null, 1000, 400);
    const rsi = g.subScales.get("sub-rsi");
    expect(rsi).toBeDefined();
    expect(rsi!.lo).toBe(0);
    expect(rsi!.hi).toBe(100);
  });

  it("Volume pane has lo=0 and hi=max(volume) over visible window", () => {
    const bars = makeBars(20);
    bars[10].v = 5_000_000;
    const g = computeGeometry(bars, [], true, null, null, 1000, 400);
    const vol = g.subScales.get("sub-volume");
    expect(vol).toBeDefined();
    expect(vol!.lo).toBe(0);
    expect(vol!.hi).toBe(5_000_000);
  });

  it("MACD pane scales to its visible window", () => {
    const bars = makeBars(20);
    const overlays: OverlayLite[] = [
      { data: bars.map((_, i) => i - 10), pane: "sub-macd" },
    ];
    const g = computeGeometry(bars, overlays, false, null, null, 1000, 400);
    const macd = g.subScales.get("sub-macd");
    expect(macd).toBeDefined();
    expect(macd!.lo).toBeLessThan(macd!.hi);
    // Should include at least 0 in the [lo, hi] range so the zero-line
    // is renderable.
    expect(macd!.lo).toBeLessThanOrEqual(0);
    expect(macd!.hi).toBeGreaterThanOrEqual(0);
  });

  it("multiple sub-panes get distinct, non-overlapping vertical regions", () => {
    const bars = makeBars(20);
    const overlays: OverlayLite[] = [
      { data: Array(20).fill(50), pane: "sub-rsi" },
      { data: bars.map((_, i) => i - 10), pane: "sub-macd" },
    ];
    const g = computeGeometry(bars, overlays, true, null, null, 1000, 400);
    expect(g.subPanes.length).toBe(3); // sub-macd, sub-rsi, sub-volume
    const all = g.subPanes.map((p) => g.subScales.get(p)!);
    // Sort by top, ensure each pane's top >= prev pane's bottom
    all.sort((a, b) => a.top - b.top);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].top).toBeGreaterThanOrEqual(all[i - 1].bottom);
    }
  });
});

describe("resolveViewport / clampViewport", () => {
  it("resolveViewport falls back to (0, totalBars) when state is null/null", () => {
    const v = resolveViewport(null, null, 100);
    expect(v.start).toBe(0);
    expect(v.count).toBe(100);
  });

  it("clampViewport enforces MIN_VISIBLE_BARS lower bound", () => {
    const v = clampViewport({ start: 50, count: 5 }, 100);
    expect(v.count).toBe(MIN_VISIBLE_BARS);
  });

  it("clampViewport enforces totalBars upper bound", () => {
    const v = clampViewport({ start: 50, count: 200 }, 100);
    expect(v.count).toBe(100);
    expect(v.start).toBe(0);
  });

  it("clampViewport pins start so start+count never exceeds totalBars", () => {
    const v = clampViewport({ start: 80, count: 30 }, 100);
    expect(v.start + v.count).toBeLessThanOrEqual(100);
  });
});

describe("wheelZoom — TradingView-style cursor-anchored", () => {
  it("zoom in (factor < 1) reduces visible bar count", () => {
    const v = { start: 0, count: 100 };
    const next = wheelZoom(v, 100, 50, 1 / 1.15);
    expect(next.count).toBeLessThan(v.count);
  });

  it("zoom out (factor > 1) increases visible bar count, capped at totalBars", () => {
    const v = { start: 20, count: 60 };
    const next = wheelZoom(v, 100, 30, 1.15);
    expect(next.count).toBeGreaterThanOrEqual(v.count);
    expect(next.count).toBeLessThanOrEqual(100);
  });

  it("never zooms past MIN_VISIBLE_BARS", () => {
    let v = { start: 0, count: MIN_VISIBLE_BARS };
    // Try to zoom in 10× past the minimum
    for (let i = 0; i < 10; i++) v = wheelZoom(v, 100, 10, 0.5);
    expect(v.count).toBeGreaterThanOrEqual(MIN_VISIBLE_BARS);
  });

  it("anchors zoom around the cursor — cursor bar stays approximately under cursor", () => {
    // Before zoom: 100 bars, cursor at local idx 50 = absolute bar 50.
    const before = { start: 0, count: 100 };
    const cursorLocalIdx = 50;
    const after = wheelZoom(before, 100, cursorLocalIdx, 0.5);
    // After zoom: count is now ~50, the bar that was at local 50 is at
    // local idx 50/100*50 = 25 (cursorFrac=0.5 of new count).
    const expectedNewLocal = Math.round(0.5 * (after.count - 1));
    const cursorAbsAfter = after.start + expectedNewLocal;
    expect(Math.abs(cursorAbsAfter - 50)).toBeLessThanOrEqual(1);
  });

  it("returns same state when zoom would not change count (already at max/min)", () => {
    const v = { start: 0, count: 100 };
    const same = wheelZoom(v, 100, 0, 1.0001); // factor too close to 1
    expect(same.count).toBe(v.count);
  });
});

describe("panViewport", () => {
  it("pans forward by deltaBars", () => {
    const v = { start: 20, count: 50 };
    const next = panViewport(v, 100, 10);
    expect(next.start).toBe(30);
    expect(next.count).toBe(50);
  });

  it("pans backward by deltaBars", () => {
    const v = { start: 20, count: 50 };
    const next = panViewport(v, 100, -10);
    expect(next.start).toBe(10);
    expect(next.count).toBe(50);
  });

  it("clamps at the left edge (start ≥ 0)", () => {
    const v = { start: 5, count: 50 };
    const next = panViewport(v, 100, -100);
    expect(next.start).toBe(0);
  });

  it("clamps at the right edge (start+count ≤ totalBars)", () => {
    const v = { start: 30, count: 50 };
    const next = panViewport(v, 100, 100);
    expect(next.start).toBe(50); // 100 - 50 = 50
  });
});

describe("jumpToLatest", () => {
  it("snaps the viewport to the right edge", () => {
    const v = { start: 0, count: 30 };
    const next = jumpToLatest(v, 100);
    expect(next.start).toBe(70); // 100 - 30
    expect(next.count).toBe(30);
  });

  it("preserves the current zoom level", () => {
    const v = { start: 50, count: 25 };
    const next = jumpToLatest(v, 100);
    expect(next.count).toBe(25);
  });
});

describe("cursorXtoLocalIdx", () => {
  it("maps cursor at left edge of chart area to local idx 0", () => {
    // Cursor exactly at the left padding edge: dx = (1000 - 8 - 64) / 100
    // = 9.28, so localIdx = floor((8 - 8) / 9.28) = 0.
    const idx = cursorXtoLocalIdx(8, 1000, 100);
    expect(idx).toBe(0);
  });

  it("maps cursor at right edge to last visible bar", () => {
    const idx = cursorXtoLocalIdx(900, 1000, 100);
    expect(idx).toBeGreaterThan(80);
    expect(idx).toBeLessThan(100);
  });

  it("clamps cursor outside chart area to valid local idx", () => {
    expect(cursorXtoLocalIdx(-100, 1000, 100)).toBe(0);
    expect(cursorXtoLocalIdx(2000, 1000, 100)).toBe(99);
  });

  it("returns 0 when viewport count is 1 regardless of cursor X", () => {
    expect(cursorXtoLocalIdx(500, 1000, 1)).toBe(0);
  });
});

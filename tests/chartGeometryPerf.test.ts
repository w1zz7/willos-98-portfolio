/**
 * QuantChart geometry perf benchmark.
 *
 * Drag-pan re-runs `computeGeometry` on every viewport state update
 * (rAF-throttled to ~60 Hz). For the chart to feel responsive, the
 * geometry pass must finish well under one frame (16.7 ms). These
 * benchmarks pin a hard ceiling so a future "harmless looking" loop
 * doesn't regress drag latency.
 *
 * Targets (on a midrange laptop CI runner):
 *   ·   100 bars   <  0.5 ms
 *   · 1,000 bars   <  3.0 ms
 *   · 5,000 bars   < 15.0 ms
 */

import { describe, expect, it } from "vitest";
import {
  computeGeometry,
  type BarLite,
  type OverlayLite,
} from "@/components/apps/willbb/quantdesk/chartGeometry";

function makeBars(n: number): BarLite[] {
  const bars: BarLite[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p = p * (1 + (Math.random() - 0.5) * 0.02);
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

function makeOverlays(n: number): OverlayLite[] {
  // Realistic overlay set: SMA20, SMA50, BB upper, BB lower, RSI, MACD line,
  // MACD signal, MACD histogram. Mirrors what Cockpit renders by default.
  const make = () => Array.from({ length: n }, () => 100 + Math.random() * 20);
  return [
    { data: make(), pane: "main" },
    { data: make(), pane: "main" },
    { data: make(), pane: "main" },
    { data: make(), pane: "main" },
    { data: Array.from({ length: n }, () => 30 + Math.random() * 40), pane: "sub-rsi" },
    { data: Array.from({ length: n }, () => Math.random() * 2 - 1), pane: "sub-macd" },
    { data: Array.from({ length: n }, () => Math.random() * 2 - 1), pane: "sub-macd" },
    {
      data: Array.from({ length: n }, () => Math.random() * 2 - 1),
      pane: "sub-macd",
      style: "histogram",
    },
  ];
}

function bench(fn: () => void, iters: number): number {
  // Warm up — first few calls are skewed by JIT.
  for (let i = 0; i < 5; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - start) / iters;
}

describe("computeGeometry perf", () => {
  it("100 bars under 0.5 ms (drag-pan budget: ≤ 16 ms total per frame)", () => {
    const bars = makeBars(100);
    const overlays = makeOverlays(100);
    const ms = bench(
      () => computeGeometry(bars, overlays, true, null, null, 1000, 400),
      200,
    );
    expect(ms).toBeLessThan(0.5);
  });

  it("1,000 bars under 3 ms", () => {
    const bars = makeBars(1000);
    const overlays = makeOverlays(1000);
    const ms = bench(
      () => computeGeometry(bars, overlays, true, null, null, 1000, 400),
      50,
    );
    expect(ms).toBeLessThan(3);
  });

  it("5,000 bars under 15 ms", () => {
    const bars = makeBars(5000);
    const overlays = makeOverlays(5000);
    const ms = bench(
      () => computeGeometry(bars, overlays, true, null, null, 1000, 400),
      20,
    );
    expect(ms).toBeLessThan(15);
  });

  it("zoomed-in window stays fast even with full overlay arrays", () => {
    // Realistic drag scenario: 5,000 bars total but only 60 visible. The
    // geometry pass must scan only the visible window for overlay min/max,
    // not iterate the full 5K array.
    const bars = makeBars(5000);
    const overlays = makeOverlays(5000);
    const ms = bench(
      () => computeGeometry(bars, overlays, true, 4000, 60, 1000, 400),
      100,
    );
    expect(ms).toBeLessThan(2);
  });
});

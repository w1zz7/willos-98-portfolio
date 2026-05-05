"use client";

/**
 * Canvas-rendered candlestick chart — drop-in replacement for the SVG
 * QuantChart.
 *
 * Why canvas: a 1255-bar 5Y chart in SVG is ~6,000 DOM nodes (5 elements
 * per candle × 1000 visible + overlays + sub-panes). React reconciliation
 * through that many nodes drops drag-pan to ~10 fps on mid-range hardware.
 * A 2D canvas paints all 1000 candles in a single imperative pass and
 * holds 60 fps regardless of bar count.
 *
 * Hybrid rendering — canvas for the hot path, SVG/HTML for static chrome:
 *
 *   <canvas>          ← candles, overlays, sub-pane series, volume bars
 *   <svg>             ← axes, grid, labels, crosshair, watermark, live tag
 *   <div>             ← tooltip, reset/jump buttons
 *
 * The canvas redraws only when (bars | viewport | dimensions) change.
 * Drag and hover updates touch ONLY refs + the canvas — no React
 * reconciliation through the candle DOM. Hover crosshair lives in a
 * separate React-driven SVG layer that re-renders cheaply because it's
 * just two lines + two pills.
 *
 * Drop-in: same prop shape as QuantChart, same keyboard shortcuts, same
 * pan/zoom semantics. Cockpit and StrategyLab can swap in by changing
 * the import.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_MONO } from "../OpenBB";
import type { Bar } from "./indicators";
import {
  computeGeometry as _computeGeometry,
  type ChartGeometry,
  PADDING_BOTTOM,
  PADDING_LEFT,
  PADDING_RIGHT,
  PADDING_TOP,
  panViewport,
  resolveViewport,
  wheelZoom,
} from "./chartGeometry";

export interface OverlaySeries {
  name: string;
  data: (number | null)[];
  color: string;
  pane?: "main" | "sub-rsi" | "sub-macd" | "sub-stoch" | "sub-volume" | "sub-adx";
  style?: "line" | "histogram" | "area";
  fillBelow?: { otherIdx?: number; color?: string };
}

export interface ChartMarker {
  t: number;
  type: "entryLong" | "entryShort" | "exit";
  price: number;
}

export interface QuantChartCanvasProps {
  bars: Bar[];
  overlays?: OverlaySeries[];
  markers?: ChartMarker[];
  height?: number;
  showVolume?: boolean;
  livePrice?: number | null;
  livePrevClose?: number | null;
  watermark?: string | null;
  marketState?: string | null;
  hollowUp?: boolean;
}

/* ---------- helpers ---------- */

function fmtDate(t: number): string {
  const d = new Date(t * 1000);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "-";
  const abs = Math.abs(p);
  if (abs >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (abs >= 1) return p.toFixed(2);
  if (abs >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

function marketStateLabel(s: string): string {
  switch (s.toUpperCase()) {
    case "PRE":
    case "PREPRE":
      return "PRE-MARKET";
    case "POST":
    case "POSTPOST":
      return "AFTER HOURS";
    case "CLOSED":
      return "MARKET CLOSED";
    case "DELAYED":
      return "DELAYED";
    case "EOD":
      return "END-OF-DAY";
    case "CACHED":
      return "CACHED";
    default:
      return s.toUpperCase().slice(0, 14);
  }
}

/**
 * Imperative canvas paint. Renders candles + overlays + sub-pane series +
 * volume bars + trade markers in one synchronous pass. Called from a
 * useEffect with [bars, viewport, dimensions] in the dep list — drag/zoom
 * trigger a single canvas repaint instead of a React reconciliation.
 */
function drawChart(
  ctx: CanvasRenderingContext2D,
  geo: ChartGeometry,
  overlays: OverlaySeries[],
  markers: ChartMarker[],
  showVolume: boolean,
  hollowUp: boolean,
  bars: Bar[],
  dpr: number,
) {
  const { W, H, visBars, viewStart, dx, candleW, yScale, xScale, absToLocal, subPanes, subScales } = geo;

  // Clear (transform = scale by dpr applied externally).
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // -- Candles --
  for (let i = 0; i < visBars.length; i++) {
    const b = visBars[i];
    const x = xScale(i);
    const up = b.c >= b.o;
    const color = up ? COLORS.up : COLORS.down;
    const yOpen = yScale(b.o);
    const yClose = yScale(b.c);
    const yHigh = yScale(b.h);
    const yLow = yScale(b.l);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yClose - yOpen));
    const isHollow = up && hollowUp;

    // Wick.
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, yHigh);
    ctx.lineTo(x + 0.5, yLow);
    ctx.stroke();

    // Body.
    const bx = x - candleW / 2;
    if (isHollow) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.strokeRect(bx + 0.5, bodyTop + 0.5, candleW, bodyH);
    } else {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(bx, bodyTop, candleW, bodyH);
      ctx.globalAlpha = 1;
    }
  }

  // -- Main-pane overlays (line series) --
  const mainOverlays = overlays.filter((o) => !o.pane || o.pane === "main");
  for (const s of mainOverlays) {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    for (let li = 0; li < visBars.length; li++) {
      const v = s.data[viewStart + li];
      if (v == null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      const x = xScale(li);
      const y = yScale(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // -- Trade markers --
  for (const m of markers) {
    let bestI = 0;
    let bestDt = Infinity;
    for (let bi = 0; bi < bars.length; bi++) {
      const dt = Math.abs(bars[bi].t - m.t);
      if (dt < bestDt) { bestDt = dt; bestI = bi; }
    }
    const localI = absToLocal(bestI);
    if (localI < 0 || localI >= visBars.length) continue;
    const x = xScale(localI);
    const y = yScale(m.price);
    const color = m.type === "entryLong" ? COLORS.up : m.type === "entryShort" ? COLORS.down : COLORS.flat;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    if (m.type === "exit") {
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y - 4);
      ctx.lineTo(x, y + 4);
    } else if (m.type === "entryLong") {
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x - 5, y - 4);
      ctx.lineTo(x + 5, y - 4);
    } else {
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x - 5, y + 4);
      ctx.lineTo(x + 5, y + 4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // -- Sub-pane series --
  for (const paneId of subPanes) {
    const s = subScales.get(paneId);
    if (!s) continue;
    const seriesInPane = overlays.filter((o) => o.pane === paneId);

    if (paneId === "sub-volume") {
      // Volume histogram.
      for (let i = 0; i < visBars.length; i++) {
        const b = visBars[i];
        const h = ((b.v - s.lo) / Math.max(0.001, s.hi - s.lo)) * (s.bottom - s.top);
        const up = b.c >= b.o;
        ctx.fillStyle = up ? COLORS.up : COLORS.down;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(xScale(i) - candleW / 2, s.bottom - h, candleW, Math.max(0.5, h));
      }
      ctx.globalAlpha = 1;
    }

    for (const line of seriesInPane) {
      if (line.style === "histogram") {
        for (let li = 0; li < visBars.length; li++) {
          const v = line.data[viewStart + li];
          if (v == null || !Number.isFinite(v)) continue;
          const y0 = s.yFor(0);
          const yV = s.yFor(v);
          const top = Math.min(y0, yV);
          const h = Math.abs(yV - y0);
          ctx.fillStyle = line.color;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(xScale(li) - candleW / 2, top, candleW, Math.max(0.5, h));
        }
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.strokeStyle = line.color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let li = 0; li < visBars.length; li++) {
        const v = line.data[viewStart + li];
        if (v == null || !Number.isFinite(v)) {
          started = false;
          continue;
        }
        const x = xScale(li);
        const y = s.yFor(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

/* ---------- main component ---------- */

export default function QuantChartCanvas({
  bars,
  overlays = [],
  markers = [],
  height = 380,
  showVolume = false,
  livePrice = null,
  livePrevClose = null,
  watermark = null,
  marketState = null,
  hollowUp = true,
}: QuantChartCanvasProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);
  const [hoverClient, setHoverClient] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Track container width for canvas DPR sizing. Listen to ResizeObserver
  // so the chart adapts when the parent (Cockpit pane, modal, etc.) changes
  // dimensions — without this, the canvas would render at stale dimensions
  // after a window-resize.
  //
  // We also poll a few times during mount: ResizeObserver does NOT fire
  // when the observed element already has its final size at observe-time
  // (no resize *event* — the dimensions never changed from observation
  // start). Without the polled fallback, the canvas can stay stuck at the
  // initial 1000px when mounted into an already-laid-out flex/grid parent.
  const [width, setWidth] = useState<number>(1000);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const sync = () => {
      const w = el.clientWidth || el.getBoundingClientRect().width || 1000;
      setWidth((prev) => (Math.abs(w - prev) > 0.5 ? w : prev));
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    // Poll a few times during the first 500ms — covers the case where the
    // parent finishes laying out *after* this effect runs but before the
    // first ResizeObserver tick. Cheap (3 reads of clientWidth) and robust.
    const t1 = window.setTimeout(sync, 50);
    const t2 = window.setTimeout(sync, 200);
    const t3 = window.setTimeout(sync, 500);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  // Pan + zoom.
  const [viewportStartIdx, setViewportStartIdx] = useState<number | null>(null);
  const [visibleBarsState, setVisibleBarsState] = useState<number | null>(null);
  const dragRef = useRef<{
    startClientX: number;
    startIdx: number;
    widthCss: number;
    visibleAtStart: number;
  } | null>(null);

  // Reset pan/zoom on bar count change.
  const lastBarsLenRef = useRef<number>(bars.length);
  useEffect(() => {
    if (Math.abs(lastBarsLenRef.current - bars.length) > 5) {
      lastBarsLenRef.current = bars.length;
      setViewportStartIdx(null);
      setVisibleBarsState(null);
    } else {
      lastBarsLenRef.current = bars.length;
    }
  }, [bars.length]);

  // Geometry — depends on bars, overlays, viewport, dimensions.
  const geo = useMemo<ChartGeometry>(
    () =>
      _computeGeometry(
        bars,
        overlays,
        showVolume,
        viewportStartIdx,
        visibleBarsState,
        width,
        height,
      ),
    [bars, overlays, showVolume, viewportStartIdx, visibleBarsState, width, height],
  );

  // Imperative canvas paint. Runs after every relevant change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // Match canvas pixel buffer to (cssWidth, cssHeight) × dpr for crisp rendering.
    const cssW = width;
    const cssH = height;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    // Background fill (alpha:false canvas requires us to clear via fill).
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, targetW, targetH);
    drawChart(ctx, geo, overlays, markers, showVolume, hollowUp, bars, dpr);
  }, [geo, overlays, markers, showVolume, hollowUp, bars, width, height]);

  /* ---------- drag pan (rAF-throttled) ---------- */

  const panRef = useRef({ dx: 1, W: 1000, barsLen: bars.length });
  const pendingPanRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  panRef.current = { dx: geo.dx, W: width, barsLen: bars.length };

  useEffect(() => {
    function flushPan() {
      rafIdRef.current = null;
      if (pendingPanRef.current != null) {
        setViewportStartIdx(pendingPanRef.current);
        pendingPanRef.current = null;
      }
    }
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const { startClientX, startIdx, widthCss, visibleAtStart } = dragRef.current;
      const { dx: dxNow, barsLen } = panRef.current;
      const cssDeltaX = e.clientX - startClientX;
      // dxNow is in CSS pixels per bar (geo.dx already in css coords).
      const dragDeltaBars = -cssDeltaX / dxNow;
      const newStart = Math.max(
        0,
        Math.min(
          barsLen - visibleAtStart,
          Math.round(startIdx + dragDeltaBars),
        ),
      );
      pendingPanRef.current = newStart;
      if (rafIdRef.current == null) {
        rafIdRef.current = window.requestAnimationFrame(flushPan);
      }
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = "";
      }
      if (rafIdRef.current != null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (pendingPanRef.current != null) {
        setViewportStartIdx(pendingPanRef.current);
        pendingPanRef.current = null;
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Touch support — same logic, single-finger drag pans the chart.
    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current || e.touches.length === 0) return;
      const t = e.touches[0];
      onMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
    }
    function onTouchEnd() {
      onUp();
    }
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      if (rafIdRef.current != null) window.cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  /* ---------- hover crosshair (rAF-throttled) ---------- */

  const pendingHoverRef = useRef<{
    idx: number;
    px: { x: number; y: number };
    client: { x: number; y: number };
  } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const flushHover = useCallback(() => {
    hoverRafRef.current = null;
    const p = pendingHoverRef.current;
    if (!p) return;
    pendingHoverRef.current = null;
    setHoverIdx(p.idx);
    setHoverPx(p.px);
    setHoverClient(p.client);
  }, []);
  const scheduleHover = useCallback(
    (idx: number, px: { x: number; y: number }, client: { x: number; y: number }) => {
      pendingHoverRef.current = { idx, px, client };
      if (hoverRafRef.current == null) {
        hoverRafRef.current = window.requestAnimationFrame(flushHover);
      }
    },
    [flushHover],
  );
  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) window.cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  /* ---------- viewport navigation helpers ---------- */

  const isCustomView = viewportStartIdx !== null || visibleBarsState !== null;

  const resetViewport = useCallback(() => {
    setViewportStartIdx(null);
    setVisibleBarsState(null);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const currentCount = visibleBarsState ?? bars.length;
      const newCount = Math.max(20, Math.min(bars.length, Math.round(currentCount * factor)));
      if (newCount === currentCount) return;
      const currentStart = viewportStartIdx ?? 0;
      const midpoint = currentStart + currentCount / 2;
      const newStart = Math.max(0, Math.min(bars.length - newCount, Math.round(midpoint - newCount / 2)));
      setViewportStartIdx(newStart);
      setVisibleBarsState(newCount);
    },
    [bars.length, visibleBarsState, viewportStartIdx],
  );

  const panBy = useCallback(
    (deltaBars: number) => {
      const currentCount =
        visibleBarsState ?? Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.5)));
      const currentStart = viewportStartIdx ?? Math.max(0, bars.length - currentCount);
      const newStart = Math.max(0, Math.min(bars.length - currentCount, currentStart + deltaBars));
      if (newStart === currentStart && visibleBarsState != null) return;
      setViewportStartIdx(newStart);
      if (visibleBarsState == null) setVisibleBarsState(currentCount);
    },
    [bars.length, visibleBarsState, viewportStartIdx],
  );

  const jumpToLatest = useCallback(() => {
    const currentCount =
      visibleBarsState ?? Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.5)));
    const newStart = Math.max(0, bars.length - currentCount);
    setViewportStartIdx(newStart);
    if (visibleBarsState == null) setVisibleBarsState(currentCount);
  }, [bars.length, visibleBarsState]);

  /* ---------- render ---------- */

  if (bars.length === 0) {
    return (
      <div
        style={{
          height,
          background: COLORS.panel,
          color: COLORS.textFaint,
          fontFamily: FONT_MONO,
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        no bars yet
      </div>
    );
  }

  const { mainH, yHi, yLo, yGrid, subPanes, subScales, viewStart, visBars, dx, xScale, yScale, absToLocal } = geo;
  const totalH = height;

  const latestAbsIdx = bars.length - 1;
  const latestInVisibleWindow = absToLocal(latestAbsIdx) >= 0 && absToLocal(latestAbsIdx) < visBars.length;

  const hover = hoverIdx != null ? bars[hoverIdx] : null;
  const prevBar = hoverIdx != null && hoverIdx > 0 ? bars[hoverIdx - 1] : null;
  const hoverChangePct =
    hover && prevBar && prevBar.c > 0 ? ((hover.c - prevBar.c) / prevBar.c) * 100 : null;
  const hoverPrice =
    hoverPx && hoverPx.y >= PADDING_TOP && hoverPx.y <= PADDING_TOP + mainH
      ? yHi - ((hoverPx.y - PADDING_TOP) / mainH) * (yHi - yLo)
      : null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        background: COLORS.panel,
        position: "relative",
        height,
        cursor: isCustomView ? "grab" : "crosshair",
        outline: "none",
        // Avoid touch scroll hijacking the page when the user pans the chart.
        touchAction: "none",
      }}
      onMouseLeave={() => {
        setHoverIdx(null);
        setHoverPx(null);
        setHoverClient(null);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        resetViewport();
      }}
      onKeyDown={(e) => {
        const k = e.key;
        if (k === "f" || k === "F") {
          e.preventDefault();
          resetViewport();
        } else if (k === "+" || k === "=") {
          e.preventDefault();
          zoomBy(1 / 1.15);
        } else if (k === "-" || k === "_") {
          e.preventDefault();
          zoomBy(1.15);
        } else if (k === "ArrowLeft") {
          e.preventDefault();
          panBy(-10);
        } else if (k === "ArrowRight") {
          e.preventDefault();
          panBy(10);
        } else if (k === "Home") {
          e.preventDefault();
          const cnt = visibleBarsState ?? Math.min(bars.length, 60);
          setViewportStartIdx(0);
          setVisibleBarsState(cnt);
        } else if (k === "End") {
          e.preventDefault();
          jumpToLatest();
        }
      }}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) < 1) return;
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const xRel = e.clientX - rect.left;
        const localIdx = Math.max(0, Math.min(visBars.length - 1, Math.floor((xRel - PADDING_LEFT) / dx)));
        const absUnderCursor = viewStart + localIdx;
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const currentCount = visibleBarsState ?? bars.length;
        const newCount = Math.max(20, Math.min(bars.length, Math.round(currentCount * factor)));
        const cursorFrac = newCount > 0 ? localIdx / Math.max(1, currentCount - 1) : 0;
        const newStart = Math.max(
          0,
          Math.min(
            bars.length - newCount,
            Math.round(absUnderCursor - cursorFrac * (newCount - 1)),
          ),
        );
        setViewportStartIdx(newStart);
        setVisibleBarsState(newCount);
      }}
      onMouseDown={(e) => {
        // Ignore right-click + scroll-wheel-click.
        if (e.button !== 0) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const visibleAtStart = visibleBarsState ?? bars.length;
        dragRef.current = {
          startClientX: e.clientX,
          startIdx: viewportStartIdx ?? 0,
          widthCss: rect.width,
          visibleAtStart,
        };
        document.body.style.cursor = "grabbing";
        if (visibleBarsState == null) setVisibleBarsState(bars.length);
        if (viewportStartIdx == null) setViewportStartIdx(0);
      }}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const t = e.touches[0];
        dragRef.current = {
          startClientX: t.clientX,
          startIdx: viewportStartIdx ?? 0,
          widthCss: rect.width,
          visibleAtStart: visibleBarsState ?? bars.length,
        };
        if (visibleBarsState == null) setVisibleBarsState(bars.length);
        if (viewportStartIdx == null) setViewportStartIdx(0);
      }}
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const xRel = e.clientX - rect.left;
        const yRel = e.clientY - rect.top;
        const localIdx = Math.floor((xRel - PADDING_LEFT) / dx);
        if (localIdx >= 0 && localIdx < visBars.length) {
          scheduleHover(
            viewStart + localIdx,
            { x: xScale(localIdx), y: yRel },
            { x: xRel, y: yRel },
          );
        }
      }}
    >
      {/* Canvas layer — the hot path. */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          imageRendering: "auto",
        }}
      />

      {/* SVG overlay — axes, grid, labels, watermark, live tag, badges. */}
      <svg
        viewBox={`0 0 ${width} ${totalH}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {/* Y-grid + right-axis price labels */}
        {yGrid.map((p, i) => (
          <g key={`yg-${i}`}>
            <line
              x1={PADDING_LEFT}
              y1={yScale(p)}
              x2={width - PADDING_RIGHT}
              y2={yScale(p)}
              stroke={COLORS.borderSoft}
              strokeWidth={0.5}
              strokeDasharray="2,3"
            />
            <text
              x={width - PADDING_RIGHT + 6}
              y={yScale(p) + 3}
              fontSize={9}
              fill={COLORS.textFaint}
              fontFamily={FONT_MONO}
              textAnchor="start"
            >
              {fmtPrice(p)}
            </text>
          </g>
        ))}

        {/* Watermark — large faint ticker */}
        {watermark && (
          <text
            x={(PADDING_LEFT + (width - PADDING_RIGHT)) / 2}
            y={PADDING_TOP + mainH / 2 + 12}
            textAnchor="middle"
            fontSize={Math.max(48, Math.min(96, height * 0.22))}
            fontFamily={FONT_MONO}
            fontWeight={700}
            fill={COLORS.text}
            opacity={0.04}
            style={{ letterSpacing: "0.04em" }}
          >
            {watermark}
          </text>
        )}

        {/* Sub-pane top borders + labels + reference lines */}
        {subPanes.map((paneId) => {
          const s = subScales.get(paneId);
          if (!s) return null;
          return (
            <g key={paneId}>
              <line
                x1={PADDING_LEFT}
                y1={s.top}
                x2={width - PADDING_RIGHT}
                y2={s.top}
                stroke={COLORS.borderSoft}
                strokeWidth={0.5}
              />
              <text
                x={PADDING_LEFT}
                y={s.top + 10}
                fontSize={9}
                fill={COLORS.textFaint}
                fontFamily={FONT_MONO}
              >
                {paneId.replace("sub-", "").toUpperCase()}
              </text>
              {paneId === "sub-rsi" && (
                <>
                  <line
                    x1={PADDING_LEFT}
                    y1={s.yFor(70)}
                    x2={width - PADDING_RIGHT}
                    y2={s.yFor(70)}
                    stroke={COLORS.down}
                    strokeWidth={0.5}
                    strokeDasharray="2,3"
                  />
                  <line
                    x1={PADDING_LEFT}
                    y1={s.yFor(30)}
                    x2={width - PADDING_RIGHT}
                    y2={s.yFor(30)}
                    stroke={COLORS.up}
                    strokeWidth={0.5}
                    strokeDasharray="2,3"
                  />
                  <line
                    x1={PADDING_LEFT}
                    y1={s.yFor(50)}
                    x2={width - PADDING_RIGHT}
                    y2={s.yFor(50)}
                    stroke={COLORS.borderSoft}
                    strokeWidth={0.5}
                  />
                </>
              )}
              {paneId === "sub-macd" && (
                <line
                  x1={PADDING_LEFT}
                  y1={s.yFor(0)}
                  x2={width - PADDING_RIGHT}
                  y2={s.yFor(0)}
                  stroke={COLORS.borderSoft}
                  strokeWidth={0.5}
                />
              )}
              <text
                x={width - PADDING_RIGHT + 6}
                y={s.top + 12}
                fontSize={9}
                fill={COLORS.textFaint}
                fontFamily={FONT_MONO}
              >
                {s.hi.toFixed(paneId === "sub-rsi" || paneId === "sub-stoch" ? 0 : 2)}
              </text>
              <text
                x={width - PADDING_RIGHT + 6}
                y={s.bottom - 2}
                fontSize={9}
                fill={COLORS.textFaint}
                fontFamily={FONT_MONO}
              >
                {s.lo.toFixed(paneId === "sub-rsi" || paneId === "sub-stoch" ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* Live-tick indicators */}
        {livePrice != null &&
          bars.length > 0 &&
          (() => {
            const lastIdx = bars.length - 1;
            const lastLocalIdx = absToLocal(lastIdx);
            const lpY = yScale(livePrice);
            if (lpY < PADDING_TOP || lpY > PADDING_TOP + mainH) return null;
            const latestInWindow = lastLocalIdx >= 0 && lastLocalIdx < visBars.length;
            const up = livePrevClose == null ? null : livePrice >= livePrevClose;
            const tagColor = up == null ? COLORS.brand : up ? COLORS.up : COLORS.down;
            const x0 = latestInWindow ? xScale(lastLocalIdx) : width - PADDING_RIGHT;
            return (
              <g>
                <line
                  x1={x0}
                  y1={lpY}
                  x2={width - PADDING_RIGHT}
                  y2={lpY}
                  stroke={tagColor}
                  strokeWidth={0.8}
                  strokeDasharray="4,4"
                  opacity={0.55}
                />
                {latestInWindow && (
                  <circle
                    cx={x0}
                    cy={lpY}
                    r={4}
                    fill="none"
                    stroke={tagColor}
                    strokeWidth={1.2}
                    opacity={0.7}
                    style={{
                      transformOrigin: `${x0}px ${lpY}px`,
                      animation: "willbb-liveping 1.6s ease-out infinite",
                    }}
                  />
                )}
                {latestInWindow && (
                  <circle
                    cx={x0}
                    cy={lpY}
                    r={3}
                    fill={tagColor}
                    opacity={0.95}
                    style={{ filter: `drop-shadow(0 0 4px ${tagColor})` }}
                  />
                )}
                <g>
                  <rect
                    x={width - PADDING_RIGHT + 2}
                    y={lpY - 9}
                    width={PADDING_RIGHT - 4}
                    height={18}
                    fill={tagColor}
                    rx={2}
                    style={{ filter: `drop-shadow(0 0 4px ${tagColor}66)` }}
                  />
                  <text
                    x={width - PADDING_RIGHT + PADDING_RIGHT / 2}
                    y={lpY + 4}
                    fontSize={10}
                    fontFamily={FONT_MONO}
                    fill="#000"
                    textAnchor="middle"
                    fontWeight={700}
                  >
                    {fmtPrice(livePrice)}
                  </text>
                </g>
              </g>
            );
          })()}

        {/* Market state badge */}
        {marketState && marketState !== "REGULAR" && (
          <g>
            <rect
              x={width - PADDING_RIGHT - 92}
              y={PADDING_TOP + 4}
              width={88}
              height={16}
              fill={COLORS.panelDeep}
              stroke={COLORS.borderSoft}
              strokeWidth={0.5}
              opacity={0.92}
              rx={2}
            />
            <text
              x={width - PADDING_RIGHT - 48}
              y={PADDING_TOP + 15}
              fontSize={9}
              fontFamily={FONT_MONO}
              fill={COLORS.textDim}
              textAnchor="middle"
              letterSpacing="0.08em"
            >
              {marketStateLabel(marketState)}
            </text>
          </g>
        )}

        {/* X-axis date labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const localIdx = Math.floor(frac * Math.max(0, visBars.length - 1));
          const b = visBars[localIdx];
          if (!b) return null;
          return (
            <text
              key={`xl-${i}`}
              x={xScale(localIdx)}
              y={totalH - 8}
              fontSize={9}
              fill={COLORS.textFaint}
              fontFamily={FONT_MONO}
              textAnchor="middle"
            >
              {fmtDate(b.t)}
            </text>
          );
        })}

        {/* Hover crosshair */}
        {hoverIdx != null && hoverPx && (
          <g>
            <line
              x1={xScale(absToLocal(hoverIdx))}
              y1={PADDING_TOP}
              x2={xScale(absToLocal(hoverIdx))}
              y2={totalH - PADDING_BOTTOM}
              stroke={COLORS.text}
              strokeWidth={0.6}
              strokeDasharray="3,3"
              opacity={0.45}
            />
            {hoverPx.y >= PADDING_TOP && hoverPx.y <= totalH - PADDING_BOTTOM && (
              <line
                x1={PADDING_LEFT}
                y1={hoverPx.y}
                x2={width - PADDING_RIGHT}
                y2={hoverPx.y}
                stroke={COLORS.text}
                strokeWidth={0.6}
                strokeDasharray="3,3"
                opacity={0.45}
              />
            )}
            {hoverPrice != null && (
              <g>
                <rect
                  x={width - PADDING_RIGHT + 2}
                  y={hoverPx.y - 8}
                  width={PADDING_RIGHT - 4}
                  height={16}
                  fill={COLORS.brand}
                  opacity={0.95}
                  rx={2}
                />
                <text
                  x={width - PADDING_RIGHT + PADDING_RIGHT / 2}
                  y={hoverPx.y + 3}
                  fontSize={9}
                  fontFamily={FONT_MONO}
                  fill="#000"
                  textAnchor="middle"
                  fontWeight={700}
                >
                  {fmtPrice(hoverPrice)}
                </text>
              </g>
            )}
            {hover && (
              <g>
                <rect
                  x={xScale(absToLocal(hoverIdx)) - 38}
                  y={totalH - PADDING_BOTTOM + 4}
                  width={76}
                  height={16}
                  fill={COLORS.brand}
                  opacity={0.95}
                  rx={2}
                />
                <text
                  x={xScale(absToLocal(hoverIdx))}
                  y={totalH - PADDING_BOTTOM + 15}
                  fontSize={9}
                  fontFamily={FONT_MONO}
                  fill="#000"
                  textAnchor="middle"
                  fontWeight={700}
                >
                  {fmtDate(hover.t)}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>

      {/* Reset button */}
      {isCustomView && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            resetViewport();
          }}
          title="Reset pan + zoom (F or double-click).&#10;Pan: drag or ←/→.  Zoom: wheel or +/-.  End: jump to latest."
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(33, 33, 36, 0.92)",
            border: "1px solid " + COLORS.borderSoft,
            color: COLORS.textDim,
            padding: "3px 8px",
            fontSize: 10,
            fontFamily: FONT_MONO,
            cursor: "pointer",
            letterSpacing: "0.06em",
            zIndex: 5,
          }}
        >
          ↺ RESET
        </button>
      )}

      {/* Jump to latest */}
      {isCustomView && !latestInVisibleWindow && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            jumpToLatest();
          }}
          title="Latest bar is off-screen — click to jump to right edge (or press End)."
          style={{
            position: "absolute",
            top: 8,
            right: 76,
            background: "rgba(33, 33, 36, 0.92)",
            border: "1px solid " + COLORS.brand,
            color: COLORS.brand,
            padding: "3px 8px",
            fontSize: 10,
            fontFamily: FONT_MONO,
            cursor: "pointer",
            letterSpacing: "0.06em",
            zIndex: 5,
          }}
        >
          LATEST →
        </button>
      )}

      {/* Hover tooltip */}
      {hover && hoverClient && (
        <HoverTooltip
          bar={hover}
          changePct={hoverChangePct}
          overlays={overlays}
          hoverIdx={hoverIdx}
          containerWidth={width}
          containerHeight={height}
          x={hoverClient.x}
          y={hoverClient.y}
        />
      )}
    </div>
  );
}

/* ---------- tooltip ---------- */

function HoverTooltip({
  bar,
  changePct,
  overlays,
  hoverIdx,
  containerWidth,
  containerHeight,
  x,
  y,
}: {
  bar: Bar;
  changePct: number | null;
  overlays: OverlaySeries[];
  hoverIdx: number | null;
  containerWidth: number;
  containerHeight: number;
  x: number;
  y: number;
}) {
  const TOOLTIP_W = 200;
  const TOOLTIP_H =
    14 +
    18 +
    18 * 4 +
    18 +
    overlays.filter((o) => (o.pane ?? "main") === "main").length * 16;
  const flipX = x + TOOLTIP_W + 16 > containerWidth;
  const flipY = y + TOOLTIP_H + 16 > containerHeight;
  const left = flipX ? x - TOOLTIP_W - 12 : x + 12;
  const top = flipY ? y - TOOLTIP_H - 12 : y + 12;

  const mainOverlayValues =
    hoverIdx != null
      ? overlays
          .filter((o) => (o.pane ?? "main") === "main")
          .map((o) => ({ name: o.name, color: o.color, value: o.data[hoverIdx] }))
          .filter((r) => r.value != null && Number.isFinite(r.value as number))
      : [];

  const upColor = (changePct ?? 0) >= 0 ? COLORS.up : COLORS.down;

  return (
    <div
      style={{
        position: "absolute",
        left: Math.max(4, left),
        top: Math.max(4, top),
        background: "rgba(20, 20, 22, 0.97)",
        border: "1px solid " + COLORS.borderSoft,
        padding: "8px 12px",
        fontSize: 11,
        color: COLORS.text,
        fontFamily: FONT_MONO,
        pointerEvents: "none",
        minWidth: TOOLTIP_W,
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 6,
          marginBottom: 6,
          borderBottom: "1px solid " + COLORS.borderSoft,
        }}
      >
        <span style={{ color: COLORS.textFaint, fontSize: 10, letterSpacing: "0.04em" }}>
          {fmtDate(bar.t)}
        </span>
        {changePct != null && (
          <span style={{ color: upColor, fontWeight: 700 }}>
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <Row label="O" color={COLORS.textDim} value={bar.o} />
      <Row label="H" color={COLORS.up} value={bar.h} />
      <Row label="L" color={COLORS.down} value={bar.l} />
      <Row label="C" color={COLORS.text} value={bar.c} bold />
      {bar.v > 0 && <Row label="V" color={COLORS.textFaint} value={bar.v} formatter={fmtVolume} />}
      {mainOverlayValues.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid " + COLORS.borderSoft,
          }}
        >
          {mainOverlayValues.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 10,
              }}
            >
              <span style={{ color: r.color }}>{r.name}</span>
              <span style={{ color: COLORS.text }}>{(r.value as number).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  color,
  value,
  bold,
  formatter,
}: {
  label: string;
  color: string;
  value: number;
  bold?: boolean;
  formatter?: (v: number) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 11,
        marginBottom: 1,
      }}
    >
      <span style={{ color: COLORS.textFaint, width: 14 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400 }}>
        {formatter ? formatter(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

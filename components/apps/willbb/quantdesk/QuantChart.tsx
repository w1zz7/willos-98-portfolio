"use client";

/**
 * Hand-rolled SVG candlestick chart used by Cockpit + Strategy Lab.
 *
 * Avoids external dependencies (no lightweight-charts) - keeps the bundle
 * lean and gives us full control over overlays, sub-panes, and trade markers.
 *
 * Renders:
 *   - Main candlestick pane (OHLC, green up / red down)
 *   - Multiple overlay series (lines + bands, drawn on the main pane)
 *   - Optional sub-panes for indicators on a different scale (RSI, MACD, etc.)
 *   - Entry/exit triangle markers for trades
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_MONO } from "../OpenBB";
import type { Bar } from "./indicators";

export interface OverlaySeries {
  name: string;
  data: (number | null)[];
  color: string;
  pane?: "main" | "sub-rsi" | "sub-macd" | "sub-stoch" | "sub-volume" | "sub-adx";
  style?: "line" | "histogram" | "area";
  fillBelow?: { otherIdx?: number; color?: string };
}

export interface ChartMarker {
  t: number; // timestamp
  type: "entryLong" | "entryShort" | "exit";
  price: number;
}

export interface QuantChartProps {
  bars: Bar[];
  overlays?: OverlaySeries[];
  markers?: ChartMarker[];
  height?: number;
  showVolume?: boolean;
  /**
   * Latest live tick price. When provided, the chart draws TradingView-style
   * live indicators: a pulsing dot at the latest bar's close, a horizontal
   * dashed line at livePrice extending to the right edge, and a colored
   * price tag on the right-axis at livePrice's Y. Pass `null` to disable.
   */
  livePrice?: number | null;
  /**
   * Yesterday's close, used to color the live price tag green/red. If
   * absent, defaults to neutral (brand color).
   */
  livePrevClose?: number | null;
  /**
   * Faint ticker watermark behind the candles (Bloomberg / TV style).
   * E.g., "GOOG". Set to null/undefined/empty to hide.
   */
  watermark?: string | null;
  /**
   * Yahoo `marketState` string. Renders a "MARKET CLOSED" badge in the
   * top-right corner when the value indicates non-regular hours
   * (e.g., "CLOSED", "POSTPOST", "PREPRE").
   */
  marketState?: string | null;
  /**
   * Hollow up-candles (TradingView default style). Down-candles stay
   * filled. Default: true.
   */
  hollowUp?: boolean;
}

// TradingView-style layout: price scale on the RIGHT (default for pro
// terminals), small left margin for breathing room. The right margin is
// wider than the left because we need to fit the right-axis labels +
// the live price tag.
const PADDING_LEFT = 8;
const PADDING_RIGHT = 64;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28;

// Ratios of total height: main 0.65, optional sub-panes split the rest
const MAIN_RATIO_NO_SUB = 0.92;
const MAIN_RATIO_WITH_SUB = 0.62;
const SUB_PANE_PAD = 4;

export default function QuantChart({
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
}: QuantChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Pixel-space cursor (in viewBox units) so the horizontal crosshair tracks
  // the actual mouse Y, not the candle's body. Lets the price-axis pill
  // float exactly where the user is pointing, the way Bloomberg / TradingView do.
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);
  // CSS-pixel cursor coords for the floating tooltip (since the SVG is
  // viewBox-scaled, we keep the original event coords separately).
  const [hoverClient, setHoverClient] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // Pan + zoom state
  //
  //   viewportStartIdx — first absolute bar index visible (null = auto, show all)
  //   visibleBarsState — number of bars in the visible window (null = auto)
  //   dragRef          — mouse-drag bookkeeping for click-and-drag pan
  //
  // When both states are null, the chart renders all bars stretched across the
  // SVG width (legacy behavior). Once the user pans or zooms, both states get
  // concrete values and we slice `bars` to the viewport. Resets to null on
  // symbol/range change (i.e., when bars.length changes).
  // ============================================================================
  const [viewportStartIdx, setViewportStartIdx] = useState<number | null>(null);
  const [visibleBarsState, setVisibleBarsState] = useState<number | null>(null);
  const dragRef = useRef<{ startClientX: number; startIdx: number; widthCss: number; visibleAtStart: number } | null>(null);

  // Reset pan/zoom whenever the underlying bar count changes (new symbol/range).
  // We watch bars.length rather than bars (object identity) because the live-tick
  // splice produces a new bars array on every poll.
  const barsLen = bars.length;
  const lastBarsLenRef = useRef<number>(barsLen);
  if (lastBarsLenRef.current !== barsLen && Math.abs(lastBarsLenRef.current - barsLen) > 5) {
    // bar count materially changed → reset (>5 to ignore live-tick array
    // re-creates that don't change length)
    lastBarsLenRef.current = barsLen;
    if (viewportStartIdx !== null || visibleBarsState !== null) {
      // Defer the reset to a microtask to avoid setState-in-render warnings
      Promise.resolve().then(() => {
        setViewportStartIdx(null);
        setVisibleBarsState(null);
      });
    }
  } else {
    lastBarsLenRef.current = barsLen;
  }

  const subPanes = useMemo(() => {
    const used = new Set<string>();
    overlays.forEach((o) => {
      if (o.pane && o.pane !== "main") used.add(o.pane);
    });
    if (showVolume) used.add("sub-volume");
    return [...used].sort();
  }, [overlays, showVolume]);

  const mainOverlays = overlays.filter((o) => !o.pane || o.pane === "main");

  // Pan: install global mousemove/mouseup ONCE on mount. Each handler checks
  // dragRef.current itself — when null, it's a no-op. Stable ref `panRef`
  // holds the latest values needed inside the global handlers (dx, viewBox W,
  // bars.length); we update it on every render. We declare these BEFORE the
  // empty-bars early return to keep hook order stable across renders.
  //
  // CRITICAL: the global mousemove fires per-pixel during a drag. Without rAF
  // throttling, that's 60+ React re-renders/sec for a 1255-bar 5Y SVG chart,
  // which feels like glue. We coalesce all incoming move events into a single
  // setViewportStartIdx call per frame using requestAnimationFrame.
  const panRef = useRef({ dx: 1, W: 1000, barsLen: bars.length });
  const pendingPanRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
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
      const { dx: dxNow, W: WNow, barsLen } = panRef.current;
      const cssDeltaX = e.clientX - startClientX;
      const cssPerBar = (widthCss / WNow) * dxNow;
      const dragDeltaBars = -cssDeltaX / cssPerBar; // drag right = reveal earlier bars
      const newStart = Math.max(0, Math.min(barsLen - visibleAtStart, Math.round(startIdx + dragDeltaBars)));
      // Stash the latest target — coalesce into next animation frame.
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
      // Final flush in case the last frame is still pending.
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
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (rafIdRef.current != null) window.cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // rAF-throttle the hover-crosshair updates the same way. Without this, every
  // pixel of mouse movement over the chart triggers 3 setState calls — a 1255-bar
  // SVG re-render at 60+ Hz makes the cursor feel sluggish. We coalesce all
  // pending hover values into a single React update per animation frame.
  const pendingHoverRef = useRef<{ idx: number; px: { x: number; y: number }; client: { x: number; y: number } } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const flushHover = () => {
    hoverRafRef.current = null;
    const p = pendingHoverRef.current;
    if (!p) return;
    pendingHoverRef.current = null;
    setHoverIdx(p.idx);
    setHoverPx(p.px);
    setHoverClient(p.client);
  };
  const scheduleHover = (idx: number, px: { x: number; y: number }, client: { x: number; y: number }) => {
    pendingHoverRef.current = { idx, px, client };
    if (hoverRafRef.current == null) {
      hoverRafRef.current = window.requestAnimationFrame(flushHover);
    }
  };
  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) window.cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

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

  const W = 1000; // viewBox width; renders responsive via 100% width
  const innerW = W - PADDING_LEFT - PADDING_RIGHT;

  // === Viewport (pan/zoom) =================================================
  // When viewportStartIdx + visibleBarsState are null, render all bars (legacy).
  // When set, slice bars to [viewStart, viewEnd) and scale dx to the window.
  // visBars is the working slice; localIdx in [0, visBars.length).
  const isCustomView = viewportStartIdx !== null || visibleBarsState !== null;
  const viewStart = Math.max(0, Math.min(bars.length - 1, viewportStartIdx ?? 0));
  const viewCount = visibleBarsState ?? bars.length;
  const viewEnd = Math.max(viewStart + 1, Math.min(bars.length, viewStart + viewCount));
  const visBars = bars.slice(viewStart, viewEnd);
  const dx = innerW / Math.max(1, visBars.length);
  const candleW = Math.max(2, dx * 0.7);
  // Sync the panRef so global drag handlers (installed once on mount) see
  // the current dx + bars.length. This is intentionally NOT a hook — it's
  // a plain assignment that runs on every render after dx is known.
  panRef.current = { dx, W, barsLen: bars.length };
  // ==========================================================================

  // Sub-pane sizing
  const totalH = height;
  const mainH = subPanes.length === 0
    ? totalH * MAIN_RATIO_NO_SUB - PADDING_TOP - PADDING_BOTTOM
    : totalH * MAIN_RATIO_WITH_SUB - PADDING_TOP;
  const subAreaTotal = totalH - PADDING_BOTTOM - mainH - PADDING_TOP;
  const subH = subPanes.length > 0 ? (subAreaTotal - SUB_PANE_PAD * subPanes.length) / subPanes.length : 0;

  // Y-scale for main pane (price). Computed over the VISIBLE window so zooming
  // into a 5% slice rescales the y-axis to that slice's hi/lo automatically.
  const visMainOverlayValues = mainOverlays.flatMap((o) =>
    o.data.slice(viewStart, viewEnd).filter((v): v is number => v != null)
  );
  const allHi = Math.max(...visBars.map((b) => b.h), ...visMainOverlayValues);
  const allLo = Math.min(...visBars.map((b) => b.l), ...visMainOverlayValues);
  const padPrice = (allHi - allLo) * 0.05;
  const yHi = allHi + padPrice;
  const yLo = allLo - padPrice;
  const yScale = (price: number) => PADDING_TOP + ((yHi - price) / (yHi - yLo)) * mainH;
  // xScale takes a *window-local* index (0..visBars.length-1). Use absToLocal
  // for absolute-bar-index conversion (markers, live-tip dot).
  const xScale = (localIdx: number) => PADDING_LEFT + localIdx * dx + dx / 2;
  const absToLocal = (absIdx: number) => absIdx - viewStart;

  // Y-grid for main
  const ySteps = 5;
  const yGrid: number[] = [];
  for (let s = 0; s <= ySteps; s++) yGrid.push(yLo + (s / ySteps) * (yHi - yLo));

  // Sub-pane scale builder. Scales over the visible window only so panning
  // / zooming auto-rescales each sub-pane (RSI keeps fixed [0,100]; volume
  // and indicator-specific scales rescale to their visible portion).
  function subScale(paneId: string) {
    const seriesInPane = overlays.filter((o) => o.pane === paneId);
    const flat: number[] = seriesInPane.flatMap((o) => o.data.slice(viewStart, viewEnd).filter((v): v is number => v != null));
    let lo = flat.length ? Math.min(...flat) : 0;
    let hi = flat.length ? Math.max(...flat) : 1;
    if (paneId === "sub-rsi" || paneId === "sub-stoch") { lo = 0; hi = 100; }
    if (paneId === "sub-volume") { lo = 0; hi = Math.max(...visBars.map((b) => b.v)) || 1; }
    if (lo === hi) { hi = lo + 1; }
    const padding = (hi - lo) * 0.08;
    const lo2 = paneId === "sub-rsi" || paneId === "sub-stoch" || paneId === "sub-volume" ? lo : lo - padding;
    const hi2 = paneId === "sub-rsi" || paneId === "sub-stoch" || paneId === "sub-volume" ? hi : hi + padding;
    const idx = subPanes.indexOf(paneId);
    const top = PADDING_TOP + mainH + SUB_PANE_PAD + idx * (subH + SUB_PANE_PAD);
    const bottom = top + subH;
    return {
      lo: lo2,
      hi: hi2,
      top,
      bottom,
      yFor(v: number) {
        return top + ((hi2 - v) / Math.max(0.001, hi2 - lo2)) * (bottom - top);
      },
    };
  }

  const hover = hoverIdx != null ? bars[hoverIdx] : null;
  const prevBar = hoverIdx != null && hoverIdx > 0 ? bars[hoverIdx - 1] : null;
  const hoverChangePct =
    hover && prevBar && prevBar.c > 0 ? ((hover.c - prevBar.c) / prevBar.c) * 100 : null;

  // Whether the latest (most-recent) bar is currently inside the visible window.
  // When false (user has panned far enough back), we show a "→ jump to latest"
  // hint in the top-right so the live-tip dot isn't lost.
  const latestAbsIdx = bars.length - 1;
  const latestInVisibleWindow = absToLocal(latestAbsIdx) >= 0 && absToLocal(latestAbsIdx) < visBars.length;

  // Shared helpers for double-click + keyboard handlers.
  const resetViewport = () => {
    setViewportStartIdx(null);
    setVisibleBarsState(null);
  };
  const zoomBy = (factor: number) => {
    // factor < 1 = zoom in (fewer bars), factor > 1 = zoom out.
    // Anchor: keep the visible window centered on its current midpoint.
    const currentCount = visibleBarsState ?? bars.length;
    const newCount = Math.max(20, Math.min(bars.length, Math.round(currentCount * factor)));
    if (newCount === currentCount) return;
    const currentStart = viewportStartIdx ?? 0;
    const midpoint = currentStart + currentCount / 2;
    const newStart = Math.max(0, Math.min(bars.length - newCount, Math.round(midpoint - newCount / 2)));
    setViewportStartIdx(newStart);
    setVisibleBarsState(newCount);
  };
  const panBy = (deltaBars: number) => {
    const currentCount = visibleBarsState ?? Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.5)));
    const currentStart = viewportStartIdx ?? Math.max(0, bars.length - currentCount);
    const newStart = Math.max(0, Math.min(bars.length - currentCount, currentStart + deltaBars));
    if (newStart === currentStart && visibleBarsState != null) return;
    setViewportStartIdx(newStart);
    if (visibleBarsState == null) setVisibleBarsState(currentCount);
  };
  const jumpToLatest = () => {
    // Snap the viewport to the right edge while preserving zoom level.
    const currentCount = visibleBarsState ?? Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.5)));
    const newStart = Math.max(0, bars.length - currentCount);
    setViewportStartIdx(newStart);
    if (visibleBarsState == null) setVisibleBarsState(currentCount);
  };
  // Reverse the y-scale to convert hovered cursor Y back into a price for
  // the crosshair label.
  const hoverPrice =
    hoverPx && hoverPx.y >= PADDING_TOP && hoverPx.y <= PADDING_TOP + mainH
      ? yHi - ((hoverPx.y - PADDING_TOP) / mainH) * (yHi - yLo)
      : null;

  return (
    <div
      ref={containerRef}
      // tabIndex makes the chart focusable so onKeyDown fires for shortcuts
      // (F = fit, +/- = zoom, arrows = pan). outline:none keeps the focus ring
      // from clashing with the dark Bloomberg aesthetic.
      tabIndex={0}
      style={{
        background: COLORS.panel,
        position: "relative",
        height,
        cursor: isCustomView ? "grab" : "crosshair",
        outline: "none",
      }}
      onMouseLeave={() => {
        setHoverIdx(null);
        setHoverPx(null);
        setHoverClient(null);
      }}
      onDoubleClick={(e) => {
        // Double-click anywhere on the chart resets pan + zoom — faster than
        // aiming for the small ↺ RESET button in the top-right.
        e.preventDefault();
        e.stopPropagation();
        resetViewport();
      }}
      onKeyDown={(e) => {
        // TradingView-style keyboard shortcuts. We only intercept the keys
        // we use; everything else (Tab, Esc) falls through to default.
        const k = e.key;
        if (k === "f" || k === "F") {
          e.preventDefault();
          resetViewport();
        } else if (k === "+" || k === "=") {
          e.preventDefault();
          zoomBy(1 / 1.15); // zoom IN = fewer bars
        } else if (k === "-" || k === "_") {
          e.preventDefault();
          zoomBy(1.15); // zoom OUT = more bars
        } else if (k === "ArrowLeft") {
          e.preventDefault();
          panBy(-10);
        } else if (k === "ArrowRight") {
          e.preventDefault();
          panBy(10);
        } else if (k === "Home") {
          e.preventDefault();
          // Home = jump to oldest visible bar
          const cnt = visibleBarsState ?? Math.min(bars.length, 60);
          setViewportStartIdx(0);
          setVisibleBarsState(cnt);
        } else if (k === "End") {
          e.preventDefault();
          jumpToLatest();
        }
      }}
      onWheel={(e) => {
        // Wheel-to-zoom. Up = zoom in (fewer bars), Down = zoom out (more).
        // We anchor the zoom around the cursor's bar so the bar under the
        // cursor stays put — natural TradingView behavior.
        if (Math.abs(e.deltaY) < 1) return;
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const xRel = ((e.clientX - rect.left) / rect.width) * W;
        const localIdx = Math.max(0, Math.min(visBars.length - 1, Math.floor((xRel - PADDING_LEFT) / dx)));
        const absUnderCursor = viewStart + localIdx;
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15; // wheel down = zoom out
        const currentCount = visibleBarsState ?? bars.length;
        const newCount = Math.max(20, Math.min(bars.length, Math.round(currentCount * factor)));
        // Anchor: keep the bar under the cursor at the same screen position.
        const cursorFrac = newCount > 0 ? localIdx / Math.max(1, currentCount - 1) : 0;
        const newStart = Math.max(0, Math.min(bars.length - newCount, Math.round(absUnderCursor - cursorFrac * (newCount - 1))));
        setViewportStartIdx(newStart);
        setVisibleBarsState(newCount);
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block", userSelect: "none" }}
        onMouseDown={(e) => {
          // Begin a pan drag. Record the starting client X + viewportStart
          // so the global move listener can compute deltas.
          const rect = e.currentTarget.getBoundingClientRect();
          const visibleAtStart = visibleBarsState ?? bars.length;
          dragRef.current = {
            startClientX: e.clientX,
            startIdx: viewportStartIdx ?? 0,
            widthCss: rect.width,
            visibleAtStart,
          };
          document.body.style.cursor = "grabbing";
          // If we weren't in a custom view, initialize visibleBars to the
          // current bar count + viewportStart to 0 so the drag has something
          // to slide and the slicing logic kicks in immediately.
          if (visibleBarsState == null) setVisibleBarsState(bars.length);
          if (viewportStartIdx == null) setViewportStartIdx(0);
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const xRel = ((e.clientX - rect.left) / rect.width) * W;
          const yRel = ((e.clientY - rect.top) / rect.height) * totalH;
          // Compute window-local index, then convert to absolute so
          // bars[hoverIdx] stays valid across pan/zoom.
          const localIdx = Math.floor((xRel - PADDING_LEFT) / dx);
          if (localIdx >= 0 && localIdx < visBars.length) {
            // rAF-coalesce — a 1255-bar SVG re-renders too slowly to keep up
            // with raw 60 Hz mousemove. Schedule the latest values for the
            // next frame; intermediate moves get dropped on the floor.
            scheduleHover(
              viewStart + localIdx,
              { x: xScale(localIdx), y: yRel },
              { x: e.clientX - rect.left, y: e.clientY - rect.top },
            );
          }
        }}
      >
        {/* Main pane y-grid + RIGHT-axis price labels (TradingView style) */}
        {yGrid.map((p, i) => (
          <g key={`yg-${i}`}>
            <line
              x1={PADDING_LEFT}
              y1={yScale(p)}
              x2={W - PADDING_RIGHT}
              y2={yScale(p)}
              stroke={COLORS.borderSoft}
              strokeWidth={0.5}
              strokeDasharray="2,3"
            />
            <text
              x={W - PADDING_RIGHT + 6}
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

        {/* Watermark — large faint ticker behind the candles (Bloomberg / TV).
            Renders before candles so it sits in the background. */}
        {watermark && (
          <text
            x={(PADDING_LEFT + (W - PADDING_RIGHT)) / 2}
            y={PADDING_TOP + mainH / 2 + 12}
            textAnchor="middle"
            fontSize={Math.max(48, Math.min(96, height * 0.22))}
            fontFamily={FONT_MONO}
            fontWeight={700}
            fill={COLORS.text}
            opacity={0.04}
            pointerEvents="none"
            style={{ letterSpacing: "0.04em" }}
          >
            {watermark}
          </text>
        )}

        {/* Candles. Up-candles render hollow (stroke only) when hollowUp is
            on — this is the TradingView default. Down-candles always fill.
            We iterate visBars (the visible-window slice) so panning + zooming
            naturally drop bars outside the viewport. */}
        {visBars.map((b, i) => {
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
          return (
            <g key={`c-${i}`}>
              <line
                x1={x}
                y1={yHigh}
                x2={x}
                y2={yLow}
                stroke={color}
                strokeWidth={0.7}
              />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={isHollow ? "none" : color}
                stroke={color}
                strokeWidth={isHollow ? 1 : 0}
                opacity={0.95}
              />
            </g>
          );
        })}

        {/* Main pane overlays — iterate the visible window only.
            Local index `li` is window-local (0..visBars.length-1); the
            absolute index into the overlay's data array is `viewStart + li`. */}
        {mainOverlays.map((s, si) => {
          const pts: string[] = [];
          for (let li = 0; li < visBars.length; li++) {
            const v = s.data[viewStart + li];
            if (v == null) continue;
            pts.push(`${xScale(li)},${yScale(v)}`);
          }
          if (pts.length === 0) return null;
          return (
            <polyline
              key={`mo-${si}`}
              points={pts.join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={1.4}
              opacity={0.85}
            />
          );
        })}

        {/* Trade markers — only render those whose closest bar is inside the
            visible window. */}
        {markers.map((m, i) => {
          // find bar index closest to marker timestamp (search the FULL
          // bars array so we don't miss markers that fall on hidden bars
          // — they just get filtered out below)
          let bestI = 0;
          let bestDt = Infinity;
          for (let bi = 0; bi < bars.length; bi++) {
            const dt = Math.abs(bars[bi].t - m.t);
            if (dt < bestDt) { bestDt = dt; bestI = bi; }
          }
          const localI = absToLocal(bestI);
          if (localI < 0 || localI >= visBars.length) return null;
          const x = xScale(localI);
          const y = yScale(m.price);
          const color = m.type === "entryLong" ? COLORS.up : m.type === "entryShort" ? COLORS.down : COLORS.flat;
          const up = m.type === "entryLong" ? -1 : 1;
          const tri = m.type === "exit"
            ? `${x - 4},${y - 4} ${x + 4},${y - 4} ${x},${y + 4}` // simple down-tri exit
            : up === -1
              ? `${x},${y - 12} ${x - 5},${y - 4} ${x + 5},${y - 4}` // up-pointing
              : `${x},${y + 12} ${x - 5},${y + 4} ${x + 5},${y + 4}`;
          return (
            <polygon
              key={`m-${i}`}
              points={tri}
              fill={color}
              opacity={0.95}
              stroke="#000"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Sub-panes */}
        {subPanes.map((paneId) => {
          const s = subScale(paneId);
          const seriesInPane = overlays.filter((o) => o.pane === paneId);
          // Pane border + label
          return (
            <g key={paneId}>
              <line
                x1={PADDING_LEFT}
                y1={s.top}
                x2={W - PADDING_RIGHT}
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
              {/* Volume special-case: histogram bars (window-local) */}
              {paneId === "sub-volume" && (
                <>
                  {visBars.map((b, i) => {
                    const h = ((b.v - s.lo) / Math.max(0.001, s.hi - s.lo)) * (s.bottom - s.top);
                    const up = b.c >= b.o;
                    return (
                      <rect
                        key={`v-${i}`}
                        x={xScale(i) - candleW / 2}
                        y={s.bottom - h}
                        width={candleW}
                        height={Math.max(0.5, h)}
                        fill={up ? COLORS.up : COLORS.down}
                        opacity={0.45}
                      />
                    );
                  })}
                </>
              )}
              {/* RSI overbought/oversold lines */}
              {paneId === "sub-rsi" && (
                <>
                  <line
                    x1={PADDING_LEFT}
                    y1={s.yFor(70)}
                    x2={W - PADDING_RIGHT}
                    y2={s.yFor(70)}
                    stroke={COLORS.down}
                    strokeWidth={0.5}
                    strokeDasharray="2,3"
                  />
                  <line
                    x1={PADDING_LEFT}
                    y1={s.yFor(30)}
                    x2={W - PADDING_RIGHT}
                    y2={s.yFor(30)}
                    stroke={COLORS.up}
                    strokeWidth={0.5}
                    strokeDasharray="2,3"
                  />
                  <line
                    x1={PADDING_LEFT}
                    y1={s.yFor(50)}
                    x2={W - PADDING_RIGHT}
                    y2={s.yFor(50)}
                    stroke={COLORS.borderSoft}
                    strokeWidth={0.5}
                  />
                </>
              )}
              {/* MACD zero line */}
              {paneId === "sub-macd" && (
                <line
                  x1={PADDING_LEFT}
                  y1={s.yFor(0)}
                  x2={W - PADDING_RIGHT}
                  y2={s.yFor(0)}
                  stroke={COLORS.borderSoft}
                  strokeWidth={0.5}
                />
              )}
              {/* Series in this pane — iterate window-local indices, lookup
                  the data array by absolute idx (viewStart + localI). */}
              {seriesInPane.map((line, li) => {
                if (line.style === "histogram") {
                  const cells: React.ReactNode[] = [];
                  for (let localI = 0; localI < visBars.length; localI++) {
                    const v = line.data[viewStart + localI];
                    if (v == null) continue;
                    const y0 = s.yFor(0);
                    const yV = s.yFor(v);
                    const top = Math.min(y0, yV);
                    const h = Math.abs(yV - y0);
                    cells.push(
                      <rect
                        key={`h-${paneId}-${li}-${localI}`}
                        x={xScale(localI) - candleW / 2}
                        y={top}
                        width={candleW}
                        height={Math.max(0.5, h)}
                        fill={line.color}
                        opacity={0.7}
                      />
                    );
                  }
                  return cells;
                }
                const pts: string[] = [];
                for (let localI = 0; localI < visBars.length; localI++) {
                  const v = line.data[viewStart + localI];
                  if (v == null) continue;
                  pts.push(`${xScale(localI)},${s.yFor(v)}`);
                }
                if (pts.length === 0) return null;
                return (
                  <polyline
                    key={`sl-${paneId}-${li}`}
                    points={pts.join(" ")}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={1.4}
                    opacity={0.9}
                  />
                );
              })}
              {/* Pane y-axis labels (right side, matching main pane) */}
              <text
                x={W - PADDING_RIGHT + 6}
                y={s.top + 12}
                fontSize={9}
                fill={COLORS.textFaint}
                fontFamily={FONT_MONO}
                textAnchor="start"
              >
                {s.hi.toFixed(paneId === "sub-rsi" || paneId === "sub-stoch" ? 0 : 2)}
              </text>
              <text
                x={W - PADDING_RIGHT + 6}
                y={s.bottom - 2}
                fontSize={9}
                fill={COLORS.textFaint}
                fontFamily={FONT_MONO}
                textAnchor="start"
              >
                {s.lo.toFixed(paneId === "sub-rsi" || paneId === "sub-stoch" ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* ============= Live-tick indicators (TradingView style) =============
            All are gated on `livePrice != null && bars.length > 0`. Renders:
            1. Dashed horizontal line at the live price extending to the right edge
            2. Pulsing dot at the latest bar's close (foreground glow)
            3. Right-axis price tag (colored pill, green/red vs prev close)
            =================================================================== */}
        {livePrice != null && bars.length > 0 && (() => {
          const lastIdx = bars.length - 1;
          const lastLocalIdx = absToLocal(lastIdx);
          const lpY = yScale(livePrice);
          // Only render if the live price is within the visible y-range AND
          // the latest bar is inside the panned/zoomed window.
          if (lpY < PADDING_TOP || lpY > PADDING_TOP + mainH) return null;
          const latestInWindow = lastLocalIdx >= 0 && lastLocalIdx < visBars.length;
          const up = livePrevClose == null ? null : livePrice >= livePrevClose;
          const tagColor = up == null ? COLORS.brand : up ? COLORS.up : COLORS.down;
          // When the latest bar is panned off-screen, anchor the live-line
          // at the right edge so the tag still shows the current price.
          const x0 = latestInWindow ? xScale(lastLocalIdx) : W - PADDING_RIGHT;
          return (
            <g pointerEvents="none">
              {/* Dashed line from latest bar to right edge */}
              <line
                x1={x0}
                y1={lpY}
                x2={W - PADDING_RIGHT}
                y2={lpY}
                stroke={tagColor}
                strokeWidth={0.8}
                strokeDasharray="4,4"
                opacity={0.55}
              />
              {/* Outer expanding ring (CSS animation) — only when latest in view */}
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
              {/* Solid inner dot — only when latest in view */}
              {latestInWindow && (
                <circle
                  cx={x0}
                  cy={lpY}
                  r={3}
                  fill={tagColor}
                  opacity={0.95}
                  style={{
                    filter: `drop-shadow(0 0 4px ${tagColor})`,
                  }}
                />
              )}
              {/* Right-axis live price tag */}
              <g>
                <rect
                  x={W - PADDING_RIGHT + 2}
                  y={lpY - 9}
                  width={PADDING_RIGHT - 4}
                  height={18}
                  fill={tagColor}
                  rx={2}
                  style={{
                    filter: `drop-shadow(0 0 4px ${tagColor}66)`,
                  }}
                />
                <text
                  x={W - PADDING_RIGHT + PADDING_RIGHT / 2}
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

        {/* "MARKET CLOSED" badge in top-right corner when after-hours / weekend */}
        {marketState && marketState !== "REGULAR" && (
          <g pointerEvents="none">
            <rect
              x={W - PADDING_RIGHT - 92}
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
              x={W - PADDING_RIGHT - 48}
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

        {/* X-axis dates — sampled from the VISIBLE window so the date range
            shown matches what the user is currently looking at. */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const localIdx = Math.floor(frac * Math.max(0, visBars.length - 1));
          const b = visBars[localIdx];
          if (!b) return null;
          const date = new Date(b.t * 1000);
          const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
              {label}
            </text>
          );
        })}

        {/* Hover crosshair: vertical line at the bar, horizontal at cursor Y */}
        {hoverIdx != null && hoverPx && (
          <g pointerEvents="none">
            {/* Vertical line spans the entire chart (main + sub-panes) */}
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
            {/* Horizontal line follows cursor Y, only inside the chart area */}
            {hoverPx.y >= PADDING_TOP && hoverPx.y <= totalH - PADDING_BOTTOM && (
              <line
                x1={PADDING_LEFT}
                y1={hoverPx.y}
                x2={W - PADDING_RIGHT}
                y2={hoverPx.y}
                stroke={COLORS.text}
                strokeWidth={0.6}
                strokeDasharray="3,3"
                opacity={0.45}
              />
            )}
            {/* Price-axis pill on the RIGHT side (TradingView-style) at
                the cursor's Y. Only renders when cursor is within the
                main price pane. */}
            {hoverPrice != null && (
              <g>
                <rect
                  x={W - PADDING_RIGHT + 2}
                  y={hoverPx.y - 8}
                  width={PADDING_RIGHT - 4}
                  height={16}
                  fill={COLORS.brand}
                  opacity={0.95}
                  rx={2}
                />
                <text
                  x={W - PADDING_RIGHT + PADDING_RIGHT / 2}
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
            {/* Date pill at the bar's X, in the bottom margin */}
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

      {/* Reset pan/zoom button — only shown when the user has actually
          panned or zoomed. Click to revert to "show all bars" auto mode.
          Hover tooltip lists the keyboard shortcuts so this also serves as
          discoverability for the F / +/- / arrow shortcuts. */}
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

      {/* "Jump to latest →" hint — appears in the top-right when the user has
          panned far enough back that the latest (live-tip) bar is no longer in
          the visible window. One click snaps the viewport to the right edge
          while preserving the current zoom level. */}
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
            right: 76, // sits to the LEFT of the ↺ RESET button (which is at right:8)
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

      {/* Floating cursor-following tooltip — OHLC + change + volume + overlay
          values at the hovered bar. Positioned to stay within the container. */}
      {hover && hoverClient && (
        <HoverTooltip
          bar={hover}
          changePct={hoverChangePct}
          overlays={overlays}
          hoverIdx={hoverIdx}
          containerWidth={containerRef.current?.clientWidth ?? 800}
          containerHeight={height}
          x={hoverClient.x}
          y={hoverClient.y}
        />
      )}
    </div>
  );
}

// ============================================================================
// Floating tooltip — OHLC + indicator values at hovered bar
// ============================================================================

function fmtDate(t: number): string {
  const d = new Date(t * 1000);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * Price label formatter for axis + tooltips. Defensive across the wide range
 * of prices we render — high-priced indices ($5,000+), penny stocks, FX
 * pairs (1.07 EURUSD), crypto ($65k BTC).
 */
function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "-";
  const abs = Math.abs(p);
  if (abs >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (abs >= 1) return p.toFixed(2);
  if (abs >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

/**
 * Map Yahoo's marketState codes to a short user-facing label rendered in
 * the chart's top-right corner. We only show the badge for non-regular
 * states — REGULAR is the default and doesn't need a label.
 */
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
  // Tooltip box estimate so we can flip to the left side of the cursor when
  // we're close to the right edge.
  const TOOLTIP_W = 200;
  const TOOLTIP_H = 14 +
    18 + // Header (date + change)
    18 * 4 + // OHLC rows
    18 + // Volume row
    overlays.filter((o) => (o.pane ?? "main") === "main").length * 16;
  const flipX = x + TOOLTIP_W + 16 > containerWidth;
  const flipY = y + TOOLTIP_H + 16 > containerHeight;
  const left = flipX ? x - TOOLTIP_W - 12 : x + 12;
  const top = flipY ? y - TOOLTIP_H - 12 : y + 12;

  // Sample overlay values at the hovered bar index
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
      {/* Date + day-over-day change */}
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
            {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </span>
        )}
      </div>
      {/* OHLC */}
      <Row label="O" color={COLORS.textDim} value={bar.o} />
      <Row label="H" color={COLORS.up} value={bar.h} />
      <Row label="L" color={COLORS.down} value={bar.l} />
      <Row label="C" color={COLORS.text} value={bar.c} bold />
      {bar.v > 0 && (
        <Row label="V" color={COLORS.textFaint} value={bar.v} formatter={fmtVolume} />
      )}
      {/* Overlay readouts at this bar (e.g., SMA50 = 192.34, BB upper = 198.10) */}
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

function fmtVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

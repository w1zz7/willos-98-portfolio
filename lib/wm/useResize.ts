"use client";

import { useCallback, useRef } from "react";
import { useWindowStore } from "./store";

export type ResizeEdge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

/**
 * Pointer-events resize hook.
 *
 * Same high-perf strategy as useDrag - inline-style mutation via rAF while
 * pointer is down, then commit to Zustand on pointerup.
 */
export function useResize(
  windowId: string,
  elementRef: React.RefObject<HTMLDivElement | null>
) {
  const resizeState = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    originW: number;
    originH: number;
    curLeft: number;
    curTop: number;
    curW: number;
    curH: number;
    rafId: number | null;
  } | null>(null);

  const begin = useCallback(
    (edge: ResizeEdge) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const el = elementRef.current;
        if (!el) return;
        const win = useWindowStore.getState().windows[windowId];
        if (!win || win.isMaximized || win.noResize) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();

        resizeState.current = {
          edge,
          startX: e.clientX,
          startY: e.clientY,
          originLeft: rect.left,
          originTop: rect.top,
          originW: rect.width,
          originH: rect.height,
          curLeft: rect.left,
          curTop: rect.top,
          curW: rect.width,
          curH: rect.height,
          rafId: null,
        };
        el.style.willChange = "width, height, left, top";
        useWindowStore.getState().focusWindow(windowId);
      },
    [windowId, elementRef]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = resizeState.current;
      const el = elementRef.current;
      if (!s || !el) return;

      const win = useWindowStore.getState().windows[windowId];
      if (!win) return;
      const minW = win.minSize.w;
      const minH = win.minSize.h;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      let newL = s.originLeft;
      let newT = s.originTop;
      let newW = s.originW;
      let newH = s.originH;

      if (s.edge.includes("e")) newW = Math.max(minW, s.originW + dx);
      if (s.edge.includes("s")) newH = Math.max(minH, s.originH + dy);
      if (s.edge.includes("w")) {
        const candW = Math.max(minW, s.originW - dx);
        newL = s.originLeft + (s.originW - candW);
        newW = candW;
      }
      if (s.edge.includes("n")) {
        const candH = Math.max(minH, s.originH - dy);
        newT = s.originTop + (s.originH - candH);
        newH = candH;
      }

      s.curLeft = newL;
      s.curTop = newT;
      s.curW = newW;
      s.curH = newH;

      if (s.rafId == null) {
        s.rafId = requestAnimationFrame(() => {
          const cur = resizeState.current;
          if (!cur || !el) return;
          el.style.left = `${cur.curLeft}px`;
          el.style.top = `${cur.curTop}px`;
          el.style.width = `${cur.curW}px`;
          el.style.height = `${cur.curH}px`;
          cur.rafId = null;
        });
      }
    },
    [windowId, elementRef]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = resizeState.current;
      const el = elementRef.current;
      if (!s || !el) return;
      if (s.rafId != null) cancelAnimationFrame(s.rafId);
      el.style.willChange = "";

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      useWindowStore.getState().updateWindow(windowId, {
        position: { x: s.curLeft, y: s.curTop },
        size: { w: s.curW, h: s.curH },
      });
      resizeState.current = null;
    },
    [windowId, elementRef]
  );

  return { begin, onPointerMove, onPointerUp };
}

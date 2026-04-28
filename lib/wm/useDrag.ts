"use client";

import { useCallback, useRef } from "react";
import { useWindowStore } from "./store";
import { snapToEdges } from "./snapToEdges";

/**
 * Pointer-events drag hook.
 *
 * On pointerdown on the titlebar, captures the pointer and starts mutating
 * the window element's inline style transform directly via rAF. React state
 * only updates once on pointerup. This keeps drag buttery at 60fps even
 * with many windows open.
 *
 * The returned handler is intended to be attached to the titlebar.
 */
export function useDrag(windowId: string, elementRef: React.RefObject<HTMLDivElement | null>) {
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    rafId: number | null;
    currentX: number;
    currentY: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ignore clicks on buttons inside the titlebar
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      if (e.button !== 0) return;
      const el = elementRef.current;
      if (!el) return;

      // Focus this window immediately on drag start
      useWindowStore.getState().focusWindow(windowId);
      const win = useWindowStore.getState().windows[windowId];
      if (!win || win.isMaximized) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();

      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: rect.left,
        originY: rect.top,
        currentX: rect.left,
        currentY: rect.top,
        rafId: null,
      };
      el.style.willChange = "transform";
    },
    [windowId, elementRef]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragState.current;
      const el = elementRef.current;
      if (!s || !el) return;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      s.currentX = s.originX + dx;
      s.currentY = s.originY + dy;

      if (s.rafId == null) {
        s.rafId = requestAnimationFrame(() => {
          const cur = dragState.current;
          if (!cur || !el) return;
          el.style.left = `${cur.currentX}px`;
          el.style.top = `${cur.currentY}px`;
          cur.rafId = null;
        });
      }
    },
    [elementRef]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragState.current;
      const el = elementRef.current;
      if (!s || !el) return;
      if (s.rafId != null) cancelAnimationFrame(s.rafId);
      el.style.willChange = "";

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      const win = useWindowStore.getState().windows[windowId];
      if (win) {
        const snapped = snapToEdges(
          { x: s.currentX, y: s.currentY },
          win.size,
          { w: window.innerWidth, h: window.innerHeight - 30 } // leave taskbar
        );
        // Also constrain so titlebar never leaves viewport
        const constrained = {
          x: Math.max(-win.size.w + 80, Math.min(window.innerWidth - 80, snapped.x)),
          y: Math.max(0, Math.min(window.innerHeight - 60, snapped.y)),
        };
        useWindowStore.getState().setPosition(windowId, constrained);
        // Reflect final in inline style (React will take over next paint)
        el.style.left = `${constrained.x}px`;
        el.style.top = `${constrained.y}px`;
      }
      dragState.current = null;
    },
    [windowId, elementRef]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}

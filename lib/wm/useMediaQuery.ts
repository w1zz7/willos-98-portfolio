"use client";

import { useEffect, useState } from "react";

/** SSR-safe matchMedia hook. Returns false during SSR. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setMatches(("matches" in e ? e.matches : false) as boolean);
    handler(mq);
    mq.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
    return () =>
      mq.removeEventListener(
        "change",
        handler as (e: MediaQueryListEvent) => void
      );
  }, [query]);

  return matches;
}

export type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * The desktop metaphor needs enough width AND height to be usable.
 *
 * - desktop (≥ 1024 × ≥ 620): full drag/resize desktop experience
 * - tablet  (640–1023 or viewport too short): fullscreen with touch-friendly
 *   window swap via taskbar tab strip; no drag/resize
 * - mobile  (< 640): same as tablet but even chunkier touch targets
 */
export function useBreakpoint(): Breakpoint {
  const lg = useMediaQuery("(min-width: 1024px) and (min-height: 620px)");
  const sm = useMediaQuery("(min-width: 640px)");
  if (lg) return "desktop";
  if (sm) return "tablet";
  return "mobile";
}

/** Convenience booleans */
export function useIsMobile(): boolean {
  return useBreakpoint() !== "desktop";
}

/** Viewport dimensions - SSR-safe. */
export function useViewport(): { w: number; h: number } {
  const [size, setSize] = useState({ w: 1024, h: 768 });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    handler();
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, []);
  return size;
}

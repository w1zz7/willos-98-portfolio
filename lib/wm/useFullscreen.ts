"use client";

/**
 * Browser Fullscreen API hook.
 *
 * Lets visitors run WillOS edge-to-edge so it actually feels like a desktop.
 * Esc exits natively. We listen for `fullscreenchange` to keep the UI state
 * in sync if the user exits via Esc, dev tools, or browser chrome.
 *
 * Some embedded contexts (iframes without `allow="fullscreen"`) reject the
 * request - we degrade gracefully and the toggle button hides.
 */

import { useCallback, useEffect, useState } from "react";

interface FullscreenAPI {
  isFullscreen: boolean;
  supported: boolean;
  toggle: () => void;
  enter: () => void;
  exit: () => void;
}

export function useFullscreen(): FullscreenAPI {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const supportsApi =
      typeof document.documentElement.requestFullscreen === "function" ||
      // Safari prefix (older builds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (document.documentElement as any).webkitRequestFullscreen ===
        "function";
    setSupported(supportsApi);

    const sync = () =>
      setIsFullscreen(
        !!(
          document.fullscreenElement ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).webkitFullscreenElement
        )
      );
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const enter = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const req =
      el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(el);
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {
            /* user dismissed or iframe blocked */
          });
        }
      } catch {
        /* noop */
      }
    }
  }, []);

  const exit = useCallback(() => {
    if (typeof document === "undefined") return;
    const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    const ex = d.exitFullscreen ?? d.webkitExitFullscreen;
    if (ex) {
      try {
        const p = ex.call(d);
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }
      } catch {
        /* noop */
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (typeof document === "undefined") return;
    if (
      document.fullscreenElement ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).webkitFullscreenElement
    )
      exit();
    else enter();
  }, [enter, exit]);

  return { isFullscreen, supported, toggle, enter, exit };
}

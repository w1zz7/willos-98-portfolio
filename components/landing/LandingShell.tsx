"use client";

/**
 * LandingShell — fullscreen black backdrop hosting the MobiusButton on a
 * fresh page load. Provides:
 *
 *   - Subtle mouse-move parallax (the whole canvas slides ±8px against
 *     the cursor for a "the world is responding to you" feel)
 *   - "click anywhere to enter" hint that fades in after 1.5 s
 *   - "click anywhere" semantics — entire viewport is the click target,
 *     not just the mesh, so users can't miss
 *   - Mobile perf degrade — bloom + extra sparkles disabled below 768px
 *   - Calls `setEntryStage("boot")` once the click animation completes
 *
 * The shell itself does not render the boot playback; that's a separate
 * sibling triggered by store state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MobiusButton } from "./MobiusButton";
import { useWindowStore } from "@/lib/wm/store";
import { useMediaQuery } from "@/lib/wm/useMediaQuery";

export function LandingShell() {
  const setEntryStage = useWindowStore.getState().setEntryStage;
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [hintVisible, setHintVisible] = useState(false);
  const [activated, setActivated] = useState(false);
  const [fading, setFading] = useState(false);
  // `clicked` here drives the mobius collapse animation regardless of
  // whether the user clicked the mesh itself or empty space.
  const [clicked, setClicked] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Fade in the "click anywhere to enter" hint after 1.5s of dwell.
  useEffect(() => {
    const t = window.setTimeout(() => setHintVisible(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  // Mouse-move parallax. We mutate transform via ref to skip React re-renders.
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: PointerEvent) => {
      const inner = innerRef.current;
      if (!inner) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = ((e.clientX - cx) / cx) * 8; // ±8px max
      const dy = ((e.clientY - cy) / cy) * 8;
      inner.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [isMobile]);

  const advance = useCallback(() => {
    if (activated) return;
    setActivated(true);
    setFading(true);
    // 200ms fade overlap while boot mounts under us.
    window.setTimeout(() => setEntryStage("boot"), 220);
  }, [activated, setEntryStage]);

  // Any click anywhere on the shell triggers the mobius collapse animation.
  // We listen at the WINDOW level via a native listener instead of React's
  // synthetic onClick — clicks on the R3F canvas don't reliably bubble
  // through React's event delegation (the canvas absorbs the pointer event
  // chain into its own pointer system), so React onClick on a div above
  // the canvas can silently never fire. A native window listener guarantees
  // we hear about every click on the page.
  const triggerClick = useCallback(() => {
    if (clicked) return;
    setClicked(true);
  }, [clicked]);

  useEffect(() => {
    const onClick = () => triggerClick();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        triggerClick();
      }
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [triggerClick]);

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[100000] overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at center, #0a0d12 0%, #000 70%)",
        opacity: fading ? 0 : 1,
        transition: "opacity 220ms ease-out",
        cursor: "pointer",
      }}
      aria-label="Welcome — click to enter"
    >
      {/* Optional faint scanlines for that CRT vibe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 3px)",
          mixBlendMode: "screen",
        }}
      />

      {/* Mouse-parallaxed canvas wrapper. */}
      <div
        ref={innerRef}
        className="absolute inset-0"
        style={{ transition: "transform 120ms ease-out", willChange: "transform" }}
      >
        <MobiusButton clicked={clicked} onActivate={advance} reduced={isMobile} />
      </div>

      {/* Brand watermark — top-left. */}
      <div
        className="pointer-events-none absolute top-[18px] left-[22px] flex items-baseline gap-[8px] select-none"
        style={{
          fontFamily: "var(--font-chrome, ui-sans-serif), system-ui",
          color: "rgba(255,255,255,0.55)",
          letterSpacing: "0.16em",
          fontSize: 13,
          textTransform: "uppercase",
        }}
      >
        <span>WillOS</span>
        <span style={{ color: "#ffcc00" }}>98</span>
        <span style={{ opacity: 0.45, letterSpacing: "0.1em" }}>· entry</span>
      </div>

      {/* "click to enter" hint — fades in after 1.5s. */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none"
        style={{
          bottom: 56,
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
          color: "rgba(255,255,255,0.78)",
          letterSpacing: "0.22em",
          fontSize: 12,
          textTransform: "uppercase",
          opacity: hintVisible ? 1 : 0,
          transform: hintVisible ? "translate(-50%, 0)" : "translate(-50%, 6px)",
          transition: "opacity 700ms ease-out, transform 700ms ease-out",
        }}
      >
        <span style={{ color: "#33BBFF" }}>›</span>{" "}
        click anywhere to enter{" "}
        <span style={{ color: "#33BBFF" }}>‹</span>
      </div>

      {/* Tagline — fades in with the hint. */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none text-center"
        style={{
          bottom: 30,
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
          color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.14em",
          fontSize: 10,
          opacity: hintVisible ? 1 : 0,
          transition: "opacity 800ms ease-out 200ms",
        }}
      >
        Will Zhang · Drexel LeBow · 2028
      </div>

      {/* Pulsing dot in the corner for "live" feel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: 22,
          right: 24,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#33BBFF",
          boxShadow: "0 0 12px #33BBFF",
          animation: "landing-pulse 1.6s ease-in-out infinite",
        }}
      />

      <style>{`
        @keyframes landing-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}

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
        // Slightly cooler bias on the radial — old CRT phosphors tend toward a
        // hint of blue-green at full black. Pure #000 reads as flat OLED; this
        // reads as "old monitor in a dark room."
        background:
          "radial-gradient(ellipse at center, #08111a 0%, #02030a 55%, #000005 100%)",
        opacity: fading ? 0 : 1,
        transition: "opacity 220ms ease-out",
        cursor: "pointer",
      }}
      aria-label="Welcome — click to enter"
    >
      {/* CRT scanlines — every 3px, very subtle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 3px)",
          mixBlendMode: "screen",
        }}
      />

      {/* Film grain — animated SVG noise. SVG `feTurbulence` generates a
          fractal noise field; we tile it and animate via CSS. The
          mix-blend-mode "overlay" stamps the noise over the image without
          tinting flat areas. ~6 KB; rendered once and animated by transform
          so the GPU handles it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 landing-grain"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.7 0 0 0 0 0.7 0 0 0 0 0.7 0 0 0 0.45 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          opacity: 0.08,
          mixBlendMode: "overlay",
        }}
      />

      {/* Slow horizontal sync line — a ~3px-tall bright band that travels
          down the screen every 6.5s, like a TV that's just barely losing
          v-hold. Pure flavor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 landing-sync"
        style={{
          height: 3,
          background:
            "linear-gradient(180deg, transparent 0%, rgba(51,187,255,0.18) 30%, rgba(255,255,255,0.10) 50%, rgba(51,187,255,0.18) 70%, transparent 100%)",
          mixBlendMode: "screen",
        }}
      />

      {/* Soft CRT vignette on the corners — a radial darkening that anchors
          the strip to the center. Sits OVER the canvas but under the chrome. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
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

      {/* "Work in progress" badge — top-right corner. The site is actively
          under development, so the visitor sees a clear visual signal that
          some pieces may be incomplete or rough. Pulses subtly so it reads
          as "active" rather than "stuck."

          Mirrors the brand watermark at top-left (top:18 / left:22) — same
          baseline, same edge inset, so the two corner elements feel like
          symmetric anchors rather than one floating loose. The live-pulse
          dot lives INSIDE the badge so we don't have a second cyan dot
          floating at a slightly-different y. */}
      <div
        className="pointer-events-none absolute select-none flex items-center gap-[8px]"
        style={{
          top: 18,
          right: 22,
          padding: "4px 10px",
          background: "rgba(255, 204, 0, 0.12)",
          border: "1px solid rgba(255, 204, 0, 0.55)",
          borderRadius: 3,
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
          color: "rgba(255, 230, 130, 0.95)",
          letterSpacing: "0.18em",
          fontSize: 10,
          textTransform: "uppercase",
          backdropFilter: "blur(4px)",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#ffcc00",
            boxShadow: "0 0 6px #ffcc00",
            animation: "landing-pulse 1.6s ease-in-out infinite",
          }}
        />
        <span>Work in Progress</span>
      </div>

      {/* Vintage status bar at the bottom — single horizontal strip, three
          sections (left | center | right), full viewport width. Replaces the
          previous floating "click anywhere" hint + tagline pair which sat at
          slightly-mismatched bottom insets (56 vs 30) and didn't read as a
          unified element. The status bar reads like the bottom of an old
          terminal/DOS shell — clearly anchored, balanced, and period-correct.

          Sections:
            LEFT    [POWER●] WILLOS-98 v1.0 · MOBIUS LOADER · READY
            CENTER  ›  click anywhere to enter  ‹       (the action prompt)
            RIGHT   WILL ZHANG · DREXEL LEBOW · 2029  (identity stamp)

          Border-top + faint background separates it from the canvas without
          breaking the immersion. Fades in with the rest of the chrome. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 select-none"
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.78) 100%)",
          borderTop: "1px solid rgba(51,187,255,0.18)",
          opacity: hintVisible ? 1 : 0,
          transition: "opacity 700ms ease-out 100ms",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {/* Left — system identifier with a "power on" LED */}
        <div className="flex items-center gap-[10px]">
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#5dd39e",
              boxShadow: "0 0 6px #5dd39e",
              animation: "landing-led 2.2s ease-in-out infinite",
            }}
          />
          <span style={{ color: "rgba(255,255,255,0.78)" }}>WillOS-98</span>
          <span style={{ color: "rgba(255,255,255,0.18)" }}>│</span>
          <span style={{ color: "rgba(255,255,255,0.45)" }}>Mobius Loader v1.0</span>
          <span style={{ color: "rgba(255,255,255,0.18)" }}>│</span>
          <span style={{ color: "#5dd39e" }}>[ READY ]</span>
        </div>

        {/* Center — the action prompt. Slightly larger + subtle blink to
            telegraph "this is what you do next." */}
        <div
          className="landing-prompt"
          style={{
            color: "rgba(255,255,255,0.92)",
            letterSpacing: "0.22em",
            fontSize: 11,
          }}
        >
          <span style={{ color: "#33BBFF" }}>›</span>{" "}
          click anywhere to enter{" "}
          <span style={{ color: "#33BBFF" }}>‹</span>
        </div>

        {/* Right — identity stamp */}
        <div style={{ color: "rgba(255,255,255,0.40)" }}>
          Will Zhang · Drexel LeBow · 2029
        </div>
      </div>

      <style>{`
        @keyframes landing-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.7); }
        }
        @keyframes landing-led {
          0%, 100% { opacity: 1; }
          47%, 53% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        @keyframes landing-prompt-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .landing-prompt {
          animation: landing-prompt-blink 2.4s ease-in-out infinite;
        }
        @keyframes landing-grain-shift {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-3%, 2%); }
          50% { transform: translate(2%, -2%); }
          75% { transform: translate(-2%, -3%); }
          100% { transform: translate(0, 0); }
        }
        .landing-grain {
          background-size: 160px 160px;
          animation: landing-grain-shift 1.2s steps(4) infinite;
        }
        @keyframes landing-sync-travel {
          0% { top: -4%; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { top: 104%; opacity: 0; }
        }
        .landing-sync {
          animation: landing-sync-travel 6.5s linear infinite;
        }
      `}</style>
    </div>
  );
}

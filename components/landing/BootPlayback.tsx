"use client";

/**
 * BootPlayback — 4-stage authentic Windows 98 boot sequence.
 *
 *   Stage 1 — BIOS POST    (Award Modular BIOS · white-on-black · Energy Star)
 *   Stage 2 — Win98 splash  (cloudy sky · "Microsoft Windows 98" + 3D flag
 *                            wordmark · shifting blue/grey gradient bar)
 *   Stage 3 — MS-DOS Prompt (classic Win98 chrome window framing the bio
 *                            playback in Lucida Console / Terminal font)
 *   Stage 4 — Fade to desktop
 *
 * References used to stay faithful to the era:
 *   - LOGO.SYS was 320×400 8-bit RLE bitmap, animated via palette rotation
 *     (not real motion). Visible artifact: a horizontal gradient bar at
 *     bottom-right that appears to shift as the palette cycles.
 *   - "Microsoft Windows 98" wordmark sat below the cloud + 3D Windows
 *     logo and was set in Franklin Gothic, black.
 *   - Award Modular BIOS v4.51PG was the most common Win98-era POST,
 *     white/grey monospace on black, with the small Energy Star icon
 *     and "Press DEL to enter SETUP" line.
 *
 * Skippable at any time:
 *   - ESC keydown → instant cut to desktop
 *   - "skip intro" button bottom-right (fades in after 1 s)
 *   - Click anywhere outside the skip button → also skips
 *
 * No localStorage; every visit replays.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useWindowStore } from "@/lib/wm/store";
import {
  BIOS_DURATION_MS,
  BIOS_LINES,
  FADE_DURATION_MS,
  SPLASH_DURATION_MS,
  type BootLine,
} from "./biosLines";
// MobiusButton is the same R3F scene that used to live on the standalone
// Landing page (now removed). Reusing it here as the 3D centerpiece of the
// "Starting Windows 98" splash so the visitor's first impression is the
// hero mesh inside the period-correct boot frame.
import { MobiusButton } from "./MobiusButton";

// "bio" stage removed — the WHO-IS-WILL.BAT MS-DOS prompt pane was retired
// in favor of letting the Win98 splash carry the entire "first impression"
// via a 3D Mobius scene rendered into the splash itself.
type Stage = "bios" | "splash" | "fade";

/* Authentic Win98 palette references.
 *   - System colors: Win98 default theme (silver chrome, navy title bars)
 *   - BIOS: Award default — bright white text, dim grey labels
 *   - MS-DOS Prompt: silver-on-black (Lucida Console default)
 */
const COLORS = {
  bios: {
    bg: "#000000",
    fg: "#FFFFFF",       // bright white — Award BIOS default text
    fgDim: "#A0A0A0",    // dim grey for labels
    fgFaint: "#5A5A5A",  // very dim for non-essential
    info: "#FFFFFF",     // BIOS doesn't really use color — keep flat
    warn: "#FFFF00",
    err: "#FF5555",
    ok: "#FFFFFF",
  },
  // MS-DOS Prompt classic look: silver-on-black monospace.
  prompt: {
    bg: "#000000",
    fg: "#C0C0C0",       // classic Win98 silver
    fgDim: "#808080",    // mid-grey
    fgFaint: "#5A5A5A",
    accent: "#FFFFFF",   // white for emphasis (info lines)
    ok: "#A0FFA0",       // soft green for [ OK ] ticks
    warn: "#FFFF55",
  },
  // Win98 chrome (used for the MS-DOS Prompt window frame).
  win: {
    titleBar: "#000080",       // navy
    titleBarText: "#FFFFFF",
    chromeBg: "#C0C0C0",       // silver
    chromeShadow: "#808080",
    chromeHighlight: "#FFFFFF",
    chromeDark: "#000000",
  },
  // Splash sky background — cyan-blue gradient matching the LOGO.SYS palette.
  // Reference: Win98 LOGO.SYS was an 8-bit RLE bitmap with a sky that runs
  // from a saturated mid-blue near the top through a cooler cyan to a near-
  // white horizon. These hex picks are close to the period-correct palette
  // without copying the bitmap directly.
  splash: {
    skyTop: "#2e6ca8",
    skyMid: "#6ca7d5",
    skyBottom: "#cce4ee",
    cloud: "#f3f7fa",
  },
} as const;

const FONT_DOS = "'Lucida Console', 'Consolas', 'Courier New', monospace";
// Franklin Gothic isn't on most systems by default; fall back through the
// closest condensed sans candidates so the splash wordmark still reads as
// "official Microsoft" even without the original face.
const FONT_FRANKLIN =
  "'Franklin Gothic Medium', 'Franklin Gothic', 'Arial Narrow', 'Helvetica Neue Condensed Bold', 'Arial', sans-serif";

export function BootPlayback() {
  const setEntryStage = useWindowStore.getState().setEntryStage;
  const [stage, setStage] = useState<Stage>("bios");
  const [skipVisible, setSkipVisible] = useState(false);
  const [skipping, setSkipping] = useState(false);
  // splashReady = the splash has been visible long enough to let the
  // visitor admire the 3D Mobius hero. Once true, the next click /
  // ESC / Enter / Space advances to desktop. Auto-advance fires
  // SPLASH_DURATION_MS after splash starts so visitors don't get
  // stuck if they don't notice the click affordance.
  const [splashReady, setSplashReady] = useState(false);
  const skippingRef = useRef(false);

  /** Force-quit boot — drop straight to desktop. ESC + Skip Intro button. */
  const skip = useCallback(() => {
    if (skippingRef.current) return;
    skippingRef.current = true;
    setSkipping(true);
    // Brief 200ms fade before unmount.
    window.setTimeout(() => setEntryStage("desktop"), 200);
  }, [setEntryStage]);

  /**
   * User explicitly chose to advance from the bio page → desktop.
   * Plays the proper FADE_DURATION_MS fade so the desktop slides in
   * smoothly instead of cutting like skip() does.
   */
  const advanceToDesktop = useCallback(() => {
    if (skippingRef.current) return;
    skippingRef.current = true;
    setStage("fade");
    window.setTimeout(() => setEntryStage("desktop"), FADE_DURATION_MS);
  }, [setEntryStage]);

  /**
   * Drive stage transitions on a chained timer.
   *
   * BIOS (auto, 2.4s) → splash (auto, then auto-advance to desktop after
   * SPLASH_DURATION_MS so the visitor isn't held forever on the 3D scene).
   * The visitor can also click / ESC / Enter / Space at any point during
   * the splash to skip to desktop.
   */
  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setStage("splash"), BIOS_DURATION_MS));
    // Mark splash as "click to skip" the moment it starts.
    timers.push(window.setTimeout(() => setSplashReady(true), BIOS_DURATION_MS + 200));
    // Auto-advance to desktop after the full splash window.
    timers.push(
      window.setTimeout(
        () => advanceToDesktop(),
        BIOS_DURATION_MS + SPLASH_DURATION_MS,
      ),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // advanceToDesktop is stable for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reveal "skip intro" affordance after 1 s so users discover it. */
  useEffect(() => {
    const t = window.setTimeout(() => setSkipVisible(true), 1000);
    return () => window.clearTimeout(t);
  }, []);

  /**
   * Keyboard:
   *   - ESC anywhere → instant skip to desktop (cuts past whatever stage)
   *   - Enter/Space on the bio "ready" prompt → graceful advance to desktop
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && stage === "splash" && splashReady) {
        e.preventDefault();
        advanceToDesktop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, advanceToDesktop, stage, splashReady]);

  /**
   * Click anywhere on the boot surface:
   *   - During BIOS/splash/mid-bio-stream: inert (don't let the user
   *     accidentally skip past the bio they came here to read).
   *   - After the bio has finished streaming: advance to desktop.
   * The Skip Intro button + ESC remain available for power-users to
   * bypass everything; the button stops propagation so it doesn't also
   * trigger this handler.
   */
  const onBackdropClick = () => {
    if (stage === "splash" && splashReady) advanceToDesktop();
  };

  // Cursor flips to a pointer once clicks become meaningful.
  const showPointerCursor = stage === "splash" && splashReady;

  // Background per stage. Splash is a vertical sky gradient.
  const bgForStage =
    stage === "splash"
      ? `linear-gradient(180deg, ${COLORS.splash.skyTop} 0%, ${COLORS.splash.skyMid} 55%, ${COLORS.splash.skyBottom} 100%)`
      : COLORS.bios.bg;

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-[100000] overflow-hidden"
      style={{
        background: bgForStage,
        opacity: skipping || stage === "fade" ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out, background 220ms ease`,
        cursor: showPointerCursor ? "pointer" : "default",
      }}
      aria-label="Booting WillOS 98"
    >
      {stage === "bios" && <BiosStage />}
      {(stage === "splash" || stage === "fade") && <SplashStage />}

      {/* "skip intro" bottom-right — Win98 raised button. */}
      {skipVisible && stage !== "fade" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
          className="absolute"
          style={{
            bottom: 18,
            right: 22,
            padding: "4px 14px",
            background: COLORS.win.chromeBg,
            color: "#000",
            // classic Win98 raised border: bright top/left, dark bottom/right
            border: "none",
            boxShadow:
              `inset 1px 1px 0 ${COLORS.win.chromeHighlight}, ` +
              `inset -1px -1px 0 ${COLORS.win.chromeDark}, ` +
              `inset 2px 2px 0 ${COLORS.win.chromeBg}, ` +
              `inset -2px -2px 0 ${COLORS.win.chromeShadow}`,
            fontFamily: "'Tahoma', 'Geneva', sans-serif",
            fontSize: 11,
            cursor: "pointer",
            opacity: 0,
            animation: "boot-skip-fade 600ms ease-out forwards",
          }}
        >
          Skip intro
        </button>
      )}

      <style>{`
        @keyframes boot-skip-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes boot-line-fade {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes boot-blink {
          50% { opacity: 0; }
        }
        /* Palette-rotation trick for the Win98 splash progress bar:
           a tile with a horizontal cyan-to-grey gradient that scrolls
           across a fixed window. Mimics the LOGO.SYS animation that
           cycled palette indices to make the bar appear to shimmer. */
        @keyframes boot-splash-bar {
          0% { background-position: 0 0; }
          100% { background-position: 200px 0; }
        }
        @keyframes boot-prompt-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 1 — Award Modular BIOS POST                                   */
/* ------------------------------------------------------------------ */

function BiosStage() {
  const [visible, setVisible] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);

  useEffect(() => {
    const timers = BIOS_LINES.map((line, i) =>
      window.setTimeout(() => setVisible((v) => Math.max(v, i + 1)), line.delayMs),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  // Animate the memory test count from 0 → 524,288 KB during the first 700ms
  // of stage. Award BIOS counted in 64KB blocks visibly during POST, so it
  // looked like a counter spinning up to the total RAM.
  useEffect(() => {
    const TARGET = 524288; // KB
    const STEP = 8192; // 8 MB per tick
    const INTERVAL = 12; // ms
    let n = 0;
    const id = window.setInterval(() => {
      n = Math.min(TARGET, n + STEP);
      setMemoryCount(n);
      if (n >= TARGET) window.clearInterval(id);
    }, INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="absolute inset-0 px-[40px] py-[28px] overflow-hidden"
      style={{
        fontFamily: FONT_DOS,
        fontSize: 14,
        lineHeight: "20px",
        color: COLORS.bios.fg,
      }}
    >
      {/* Award BIOS header banner. Period-correct copy: BIOS string,
          Energy Star ally tagline, copyright line. */}
      <div className="mb-[16px]" style={{ color: COLORS.bios.fg }}>
        <div className="flex items-center gap-[12px]">
          <EnergyStarLogo />
          <div>
            <div style={{ fontWeight: "bold" }}>
              Award Modular BIOS v4.51PG, An Energy Star Ally
            </div>
            <div style={{ color: COLORS.bios.fgDim }}>
              Copyright (C) 1984-98, Award Software, Inc.
            </div>
          </div>
        </div>
      </div>

      {/* Memory test — animated counter (~700ms). */}
      <div className="mb-[8px]">
        <span>Main Processor : Drexel LeBow Quad-Core 4.0 GHz</span>
      </div>
      <div className="mb-[12px]">
        <span>Memory Testing : </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {memoryCount.toLocaleString()}K
        </span>
        <span style={{ color: COLORS.bios.fgDim }}>
          {" "}
          OK
        </span>
      </div>

      {/* Streaming POST lines. */}
      <div className="relative">
        {BIOS_LINES.slice(0, visible).map((line, i) => (
          <BiosLine key={i} line={line} />
        ))}
        {/* Live cursor only while still streaming. */}
        {visible < BIOS_LINES.length && (
          <span
            aria-hidden
            className="inline-block ml-[2px]"
            style={{
              width: 9,
              height: 16,
              background: COLORS.bios.fg,
              animation: "boot-blink 0.7s steps(2) infinite",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>

      {/* Footer hint — exactly the line every Award BIOS showed. */}
      <div
        className="absolute"
        style={{
          left: 40,
          bottom: 24,
          color: COLORS.bios.fgDim,
        }}
      >
        Press <span style={{ color: COLORS.bios.fg }}>DEL</span> to enter SETUP
        <span className="ml-[24px]" style={{ color: COLORS.bios.fgFaint }}>
          12/14/1998-i440BX-W977-2A6LGS39C-00
        </span>
      </div>
    </div>
  );
}

/** Tiny Energy Star "ally" logo — recognizable star inside ring. */
function EnergyStarLogo() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden>
      <circle
        cx="21"
        cy="21"
        r="18"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.4"
      />
      {/* Five-point star, rotated to point up. */}
      <path
        d="M21 7 L24 17 L34 17 L26 23 L29 33 L21 27 L13 33 L16 23 L8 17 L18 17 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function BiosLine({ line }: { line: BootLine }) {
  const c = COLORS.bios;
  const lineColor =
    line.status === "warn"
      ? c.warn
      : line.status === "err"
      ? c.err
      : c.fg;
  // Authentic Award BIOS rendered the [ OK ] tag IMMEDIATELY after the
  // text, not pushed to the right margin. We render it inline by setting
  // whitespace: pre so leading-space indents like "  Found: ..." survive,
  // and skipping `flex: 1` on the text span.
  return (
    <div
      style={{
        whiteSpace: "pre",
        opacity: 0,
        animation: "boot-line-fade 200ms ease-out forwards",
      }}
    >
      <span style={{ color: lineColor }}>{line.text}</span>
      {line.ok && (
        <span style={{ color: c.fg, fontWeight: "bold", marginLeft: 8 }}>
          [ OK ]
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 2 — "Starting Windows 98" splash                              */
/* Faithful to LOGO.SYS: cloud sky + 3D-style Windows logo + wordmark   */
/* in Franklin Gothic + bottom-right shifting gradient bar.            */
/* ------------------------------------------------------------------ */

function SplashStage() {
  // Try to play the chime; silently no-op if the file is missing or muted.
  useEffect(() => {
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    try {
      audio = new Audio("/sounds/win98-chime.wav");
      audio.volume = 0.45;
      // First-page autoplay needs a user gesture. Many browsers will reject
      // this and the .catch handler eats it silently — that's fine, the
      // visuals stand on their own without the chime.
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      // ignore
    }
    return () => {
      cancelled = true;
      if (audio) {
        try {
          audio.pause();
        } catch {
          // ignore
        }
      }
      void cancelled;
    };
  }, []);

  return (
    <div className="absolute inset-0">
      {/* Cloud strata — soft, drifting. The Win98 LOGO.SYS sky stays as the
          painterly backdrop. The 3D Mobius mounts in front of it; the
          contrast between the soft painterly clouds and the sharp metallic
          3D mesh is exactly the "memory of Win98 meets the present" vibe. */}
      <CloudStrata />

      {/* 3D Mobius scene — same R3F mesh that used to live on the standalone
          landing page (now removed). Transparent canvas so the clouds show
          through. clicked=false + a no-op onActivate keeps the strip in its
          continuous-rotation state — no collapse-on-click, no early advance;
          the parent BootPlayback drives stage transitions on its own timer. */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
      >
        <MobiusButton clicked={false} onActivate={() => {}} reduced={false} />
      </div>

      {/* The Win98 wordmark — overlaid on top of the 3D scene. The static
          Win98FlagLogo SVG is dropped (the 3D Mobius is now the hero); the
          text label stays so the visitor still reads "Microsoft Windows 98"
          and recognizes the period it's set in. Positioned lower than before
          so it doesn't intersect the Mobius mesh sitting at the visual
          center. */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          bottom: 110,
          transform: "translateX(-50%)",
          textAlign: "center",
          fontFamily: FONT_FRANKLIN,
          color: "#000000",
          lineHeight: 1,
          // Soft glow + drop shadow so the dark text reads cleanly against
          // both bright cloud and dark 3D Mobius backdrops.
          textShadow:
            "0 0 12px rgba(255,255,255,0.95), 0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            fontWeight: 400,
            fontStyle: "italic",
            fontSize: 26,
            letterSpacing: 0,
            marginBottom: 4,
          }}
        >
          Microsoft
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          Windows<span style={{ marginLeft: 14 }}>98</span>
        </div>
      </div>

      {/* Bottom-right shifting gradient bar — the LOGO.SYS palette-rotation
          progress indicator. Tiles a horizontal cyan→grey gradient and
          scrolls it across a fixed window. */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 24,
          right: 24,
          bottom: 26,
          height: 12,
          border: "1px solid #000",
          background: "#888",
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "linear-gradient(90deg, #1c4d72 0%, #3679a8 25%, #6fb1d6 50%, #3679a8 75%, #1c4d72 100%)",
            backgroundSize: "200px 100%",
            backgroundRepeat: "repeat-x",
            animation: "boot-splash-bar 1100ms linear infinite",
          }}
        />
      </div>
    </div>
  );
}

/** Multi-layer cloud strata — five soft ellipses with varying opacity, a
 *  passable approximation of the painterly LOGO.SYS background. */
function CloudStrata() {
  const cloud = COLORS.splash.cloud;
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="cloudA" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={cloud} stopOpacity="0.85" />
          <stop offset="60%" stopColor={cloud} stopOpacity="0.4" />
          <stop offset="100%" stopColor={cloud} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="200" cy="180" rx="400" ry="120" fill="url(#cloudA)" />
      <ellipse cx="900" cy="120" rx="500" ry="100" fill="url(#cloudA)" />
      <ellipse cx="1400" cy="260" rx="380" ry="120" fill="url(#cloudA)" />
      <ellipse cx="500" cy="500" rx="600" ry="160" fill="url(#cloudA)" />
      <ellipse cx="1200" cy="620" rx="500" ry="140" fill="url(#cloudA)" />
      <ellipse cx="300" cy="780" rx="500" ry="120" fill="url(#cloudA)" />
    </svg>
  );
}

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
  BIO_DURATION_MS,
  BIO_LINES,
  BIOS_DURATION_MS,
  BIOS_LINES,
  FADE_DURATION_MS,
  SPLASH_DURATION_MS,
  type BootLine,
} from "./biosLines";

type Stage = "bios" | "splash" | "bio" | "fade";

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
  const skippingRef = useRef(false);

  /** Force-quit boot — drop straight to desktop. */
  const skip = useCallback(() => {
    if (skippingRef.current) return;
    skippingRef.current = true;
    setSkipping(true);
    // Brief 200ms fade before unmount.
    window.setTimeout(() => setEntryStage("desktop"), 200);
  }, [setEntryStage]);

  /** Drive stage transitions on a single chained timer. */
  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setStage("splash"), BIOS_DURATION_MS));
    timers.push(
      window.setTimeout(
        () => setStage("bio"),
        BIOS_DURATION_MS + SPLASH_DURATION_MS,
      ),
    );
    timers.push(
      window.setTimeout(
        () => setStage("fade"),
        BIOS_DURATION_MS + SPLASH_DURATION_MS + BIO_DURATION_MS,
      ),
    );
    timers.push(
      window.setTimeout(
        () => setEntryStage("desktop"),
        BIOS_DURATION_MS + SPLASH_DURATION_MS + BIO_DURATION_MS + FADE_DURATION_MS,
      ),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [setEntryStage]);

  /** Reveal "skip intro" affordance after 1 s so users discover it. */
  useEffect(() => {
    const t = window.setTimeout(() => setSkipVisible(true), 1000);
    return () => window.clearTimeout(t);
  }, []);

  /** ESC anywhere → skip. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        skip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  /** Click on the backdrop (but not on the skip button) → skip. */
  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) skip();
  };

  // Background per stage. Splash is a vertical sky gradient.
  const bgForStage =
    stage === "splash"
      ? `linear-gradient(180deg, ${COLORS.splash.skyTop} 0%, ${COLORS.splash.skyMid} 55%, ${COLORS.splash.skyBottom} 100%)`
      : COLORS.bios.bg;

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-[100000] overflow-hidden cursor-pointer"
      style={{
        background: bgForStage,
        opacity: skipping || stage === "fade" ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out, background 220ms ease`,
      }}
      aria-label="Booting WillOS 98"
    >
      {stage === "bios" && <BiosStage />}
      {stage === "splash" && <SplashStage />}
      {(stage === "bio" || stage === "fade") && <BioStage />}

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
      // We're after a user gesture (mobius click) — autoplay is allowed.
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
      {/* Cloud strata — soft, drifting. Multiple layered ellipses give the
          painterly look of the original LOGO.SYS bitmap. */}
      <CloudStrata />

      {/* The hero stack — 3D Windows flag + wordmark. */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "44%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          // Soft drop shadow under the entire mark, just like LOGO.SYS.
          filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.35))",
        }}
      >
        <Win98FlagLogo size={160} />
        {/* "Microsoft" sat above "Windows 98" on the LOGO.SYS, both centered
            and baseline-aligned. Two lines, not one — the smaller italic
            "Microsoft" is its own line above the bigger bold "Windows 98". */}
        <div
          style={{
            marginTop: 14,
            fontFamily: FONT_FRANKLIN,
            color: "#000000",
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          <div
            style={{
              fontWeight: 400,
              fontStyle: "italic",
              fontSize: 28,
              letterSpacing: 0,
              marginBottom: 4,
            }}
          >
            Microsoft
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            Windows<span style={{ marginLeft: 14 }}>98</span>
          </div>
        </div>
      </div>

      {/* Bottom-right shifting gradient bar — the LOGO.SYS palette-rotation
          progress indicator. Tiles a horizontal cyan→grey gradient and
          scrolls it across a fixed window. */}
      <div
        className="absolute"
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

/** 3D-style Windows flag — four panels (red top-left, green top-right,
 *  blue bottom-left, yellow bottom-right) with a wave on the leading edge.
 *  Done with a SVG path per panel + inner shadow for the "wavy" suggestion. */
function Win98FlagLogo({ size }: { size: number }) {
  const w = size;
  const h = size * 0.85;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 200 170"
      aria-hidden
      style={{ display: "inline-block" }}
    >
      <defs>
        {/* A soft "wave" gradient overlay — lighter on the curl tip. */}
        <linearGradient id="flagShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
        {/* Per-quadrant tint: brighter face, darker shadow. */}
        <linearGradient id="redG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5d4a" />
          <stop offset="100%" stopColor="#c62b1c" />
        </linearGradient>
        <linearGradient id="grnG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7be37b" />
          <stop offset="100%" stopColor="#1f7d2e" />
        </linearGradient>
        <linearGradient id="bluG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5ea7ff" />
          <stop offset="100%" stopColor="#1144aa" />
        </linearGradient>
        <linearGradient id="ylwG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe666" />
          <stop offset="100%" stopColor="#cc8a14" />
        </linearGradient>
      </defs>

      {/* The classic 4-panel flag with a sweeping tilt + waved leading edge.
          Path forms a parallelogram that's deeper on the right, mimicking
          the iconic perspective view of the Win9x logo. */}
      <g transform="translate(20, 18) skewX(-8)">
        {/* Top-left = Red */}
        <path d="M 0 0 Q 30 -6 70 0 L 70 70 Q 30 64 0 70 Z" fill="url(#redG)" />
        {/* Top-right = Green */}
        <path d="M 76 0 Q 110 -6 150 0 L 150 70 Q 110 64 76 70 Z" fill="url(#grnG)" />
        {/* Bottom-left = Blue */}
        <path d="M 0 76 Q 30 70 70 76 L 70 146 Q 30 140 0 146 Z" fill="url(#bluG)" />
        {/* Bottom-right = Yellow */}
        <path
          d="M 76 76 Q 110 70 150 76 L 150 146 Q 110 140 76 146 Z"
          fill="url(#ylwG)"
        />
        {/* Highlight overlay across the whole flag for the "wave" feel. */}
        <rect x="0" y="-8" width="150" height="160" fill="url(#flagShine)" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 3 — MS-DOS Prompt window framing the bio playback             */
/* ------------------------------------------------------------------ */

function BioStage() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = BIO_LINES.map((line, i) =>
      window.setTimeout(() => setVisible((v) => Math.max(v, i + 1)), line.delayMs),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  return (
    // Surface = teal Win98 desktop wallpaper underneath; the MS-DOS Prompt
    // window floats on top.
    <div
      className="absolute inset-0"
      style={{
        background:
          "url('/wallpaper/golf-course.svg') center bottom / cover no-repeat, #008080",
        imageRendering: "pixelated",
      }}
    >
      {/* The classic Win98 MS-DOS Prompt window. */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(900px, 90vw)",
          height: "min(560px, 80vh)",
          background: COLORS.win.chromeBg,
          // Win98 raised window border: 2px outer dance.
          boxShadow:
            `inset 1px 1px 0 ${COLORS.win.chromeHighlight}, ` +
            `inset -1px -1px 0 ${COLORS.win.chromeDark}, ` +
            `inset 2px 2px 0 ${COLORS.win.chromeBg}, ` +
            `inset -2px -2px 0 ${COLORS.win.chromeShadow}, ` +
            `0 4px 16px rgba(0,0,0,0.45)`,
          padding: 3,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Tahoma', 'Geneva', sans-serif",
          fontSize: 11,
          color: "#000",
        }}
      >
        {/* Title bar — navy, white text, classic Win98 control buttons. */}
        <div
          style={{
            background:
              `linear-gradient(90deg, ${COLORS.win.titleBar} 0%, #1084d0 100%)`,
            color: COLORS.win.titleBarText,
            padding: "3px 4px 3px 4px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontWeight: "bold",
          }}
        >
          <MsDosIcon />
          <span style={{ flex: 1 }}>MS-DOS Prompt — WHO-IS-WILL.BAT</span>
          <Win98ChromeButton label="_" />
          <Win98ChromeButton label="□" />
          <Win98ChromeButton label="×" emphasised />
        </div>

        {/* Toolbar — Mark / Copy / Paste / Full Screen / Properties etc.
            The real Win98 MS-DOS Prompt window had this row of small icons
            below the menu strip; included here as a visual accent so the
            window feels lived-in, not like an empty stub. */}
        <div
          style={{
            background: COLORS.win.chromeBg,
            padding: "2px 4px",
            display: "flex",
            alignItems: "center",
            gap: 2,
            borderBottom: `1px solid ${COLORS.win.chromeShadow}`,
            // Win98 raised toolbar separator above.
            boxShadow: `inset 0 1px 0 ${COLORS.win.chromeHighlight}`,
          }}
        >
          {[
            { glyph: "■", title: "Mark" },
            { glyph: "⧉", title: "Copy" },
            { glyph: "⎘", title: "Paste" },
            { glyph: "⤢", title: "Full Screen" },
            { glyph: "⧈", title: "Properties" },
            { glyph: "A", title: "Font" },
          ].map((b) => (
            <span
              key={b.title}
              title={b.title}
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: COLORS.win.chromeBg,
                color: "#000",
                fontSize: 12,
                fontFamily: "'Tahoma', sans-serif",
                boxShadow:
                  `inset 1px 1px 0 ${COLORS.win.chromeHighlight}, ` +
                  `inset -1px -1px 0 ${COLORS.win.chromeShadow}`,
              }}
            >
              {b.glyph}
            </span>
          ))}
        </div>

        {/* Menu strip — File / Edit / View / etc. */}
        <div
          style={{
            background: COLORS.win.chromeBg,
            padding: "2px 6px",
            display: "flex",
            gap: 12,
            fontSize: 11,
            color: "#000",
            borderBottom: `1px solid ${COLORS.win.chromeShadow}`,
          }}
        >
          {["File", "Edit", "View", "Help"].map((m, i) => (
            <span key={m}>
              <span style={{ textDecoration: "underline" }}>{m[0]}</span>
              {m.slice(1)}
              {i === 0 && <span />}
            </span>
          ))}
        </div>

        {/* The actual MS-DOS terminal pane — sunken, black bg, silver text. */}
        <div
          className="flex-1 min-h-0 overflow-hidden relative"
          style={{
            background: COLORS.prompt.bg,
            color: COLORS.prompt.fg,
            fontFamily: FONT_DOS,
            fontSize: 14,
            lineHeight: "20px",
            padding: "8px 12px",
            // Sunken inner border.
            boxShadow:
              `inset 1px 1px 0 ${COLORS.win.chromeShadow}, ` +
              `inset -1px -1px 0 ${COLORS.win.chromeHighlight}, ` +
              `inset 2px 2px 0 #000, ` +
              `inset -2px -2px 0 ${COLORS.win.chromeBg}`,
          }}
        >
          {/* Faux DOS prompt header. */}
          <div style={{ color: COLORS.prompt.fg, marginBottom: 6 }}>
            Microsoft(R) Windows 98
          </div>
          <div style={{ color: COLORS.prompt.fg, marginBottom: 14 }}>
            <span>(C)Copyright Microsoft Corp 1981-1998.</span>
          </div>
          <div style={{ color: COLORS.prompt.fg, marginBottom: 4 }}>
            C:\WINDOWS&gt; <span style={{ color: COLORS.prompt.accent }}>type</span>{" "}
            who-is-will.txt
          </div>

          {/* Streaming bio. */}
          <div className="relative">
            {BIO_LINES.slice(0, visible).map((line, i) => (
              <BioLineRow key={i} line={line} />
            ))}
            {/* Cursor / final prompt. */}
            {visible < BIO_LINES.length ? (
              <span
                aria-hidden
                className="inline-block"
                style={{
                  width: 9,
                  height: 14,
                  background: COLORS.prompt.fg,
                  animation: "boot-prompt-cursor 0.9s steps(2) infinite",
                  verticalAlign: "middle",
                }}
              />
            ) : (
              <div style={{ marginTop: 12 }}>
                C:\WINDOWS&gt;
                <span
                  aria-hidden
                  className="inline-block ml-[6px]"
                  style={{
                    width: 9,
                    height: 14,
                    background: COLORS.prompt.fg,
                    animation: "boot-prompt-cursor 0.9s steps(2) infinite",
                    verticalAlign: "middle",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The classic Win98 "MS-DOS Prompt" title-bar icon — a tiny black monitor
 * with a white "MS-DOS" prompt visible on its screen and a beige base.
 * Drawn at 16×16 to match the Win98 small-icon size convention.
 */
function MsDosIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {/* Beige monitor base / stand */}
      <rect x="5" y="13" width="6" height="2" fill="#c0c0c0" stroke="#000" strokeWidth="0.5" />
      {/* Monitor bezel */}
      <rect x="1" y="2" width="14" height="11" fill="#c0c0c0" stroke="#000" strokeWidth="0.5" />
      {/* Screen — black with white "C:\" prompt text */}
      <rect x="2.5" y="3.5" width="11" height="8" fill="#000000" />
      <text
        x="3.4"
        y="9.6"
        fontFamily="'Lucida Console', 'Courier New', monospace"
        fontSize="6"
        fill="#FFFFFF"
        fontWeight="bold"
      >
        C:\&gt;_
      </text>
    </svg>
  );
}

/** A small Win98 chrome button used for minimize/maximize/close. */
function Win98ChromeButton({
  label,
  emphasised,
}: {
  label: string;
  emphasised?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 14,
        background: emphasised ? "#c0c0c0" : "#c0c0c0",
        color: "#000",
        fontFamily: "'Tahoma', sans-serif",
        fontSize: 10,
        lineHeight: 1,
        boxShadow:
          `inset 1px 1px 0 ${COLORS.win.chromeHighlight}, ` +
          `inset -1px -1px 0 ${COLORS.win.chromeDark}`,
      }}
    >
      {label}
    </span>
  );
}

function BioLineRow({ line }: { line: BootLine }) {
  const c = COLORS.prompt;
  const lineColor =
    line.status === "ok"
      ? c.ok
      : line.status === "info"
      ? c.accent
      : line.status === "warn"
      ? c.warn
      : c.fg;
  // Inline layout (no flex:1) so [ OK ] sits IMMEDIATELY after the text
  // rather than getting stretched to the right margin — matches both
  // real Win98 console output and the existing willBB Markets boot
  // screen cadence we're echoing here.
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        opacity: 0,
        animation: "boot-line-fade 220ms ease-out forwards",
      }}
    >
      <span style={{ color: c.fgFaint, opacity: 0.9 }}>
        [{((line.delayMs + 100) / 1000).toFixed(2)}s]
      </span>
      <span style={{ color: lineColor, marginLeft: 8 }}>{line.text}</span>
      {line.ok && (
        <span style={{ color: c.ok, fontWeight: "bold", marginLeft: 8 }}>
          [ OK ]
        </span>
      )}
    </div>
  );
}

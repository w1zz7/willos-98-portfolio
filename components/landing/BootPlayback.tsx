"use client";

/**
 * BootPlayback — 4-stage Win98-flavored boot sequence that plays after the
 * mobius button is clicked.
 *
 *   Stage 1 — BIOS POST  (green-on-black monospace, fake CRT scanlines)
 *   Stage 2 — Win98 splash (teal cloud + wordmark + scrolling progress)
 *   Stage 3 — Bio playback (cyan terminal style, biographical lines)
 *   Stage 4 — Fade to desktop  (calls setEntryStage("desktop"))
 *
 * Skippable at any time:
 *   - ESC keydown → instant cut to desktop
 *   - "skip intro" button bottom-right (fades in after 1s)
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

const COLORS = {
  bios: {
    bg: "#000000",
    fg: "#33FF33",
    fgDim: "#1a8a1a",
    fgFaint: "#0a4f0a",
    info: "#33ddff",
    warn: "#ffcc00",
    err: "#ff5555",
    ok: "#33FF33",
  },
  bio: {
    bg: "#0a0d12",
    fg: "#FFFFFF",
    fgDim: "#9793b0",
    fgFaint: "#8A8A90",
    brand: "#33BBFF",
    ok: "#5dd39e",
    warn: "#f0686a",
  },
} as const;

const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

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

  /** Reveal "skip intro" affordance after 1s so users discover it. */
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

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-[100000] overflow-hidden cursor-pointer"
      style={{
        background: stage === "bios" ? COLORS.bios.bg : COLORS.bio.bg,
        opacity: skipping || stage === "fade" ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out, background-color 220ms ease`,
      }}
      aria-label="Booting WillOS 98"
    >
      {stage === "bios" && <BiosStage onClick={skip} />}
      {stage === "splash" && <SplashStage />}
      {(stage === "bio" || stage === "fade") && <BioStage />}

      {/* "skip intro" bottom-right. */}
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
            padding: "6px 12px",
            background: "rgba(0,0,0,0.6)",
            color: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 4,
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            opacity: 0,
            animation: "boot-skip-fade 600ms ease-out forwards",
            backdropFilter: "blur(4px)",
          }}
        >
          skip intro →
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
        @keyframes boot-progress-blocks {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes boot-cloud-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 1 — BIOS POST                                                 */
/* ------------------------------------------------------------------ */

function BiosStage({ onClick: _onClick }: { onClick: () => void }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = BIOS_LINES.map((line, i) =>
      window.setTimeout(() => setVisible((v) => Math.max(v, i + 1)), line.delayMs),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  return (
    <div
      className="absolute inset-0 px-[26px] py-[22px] overflow-hidden"
      style={{
        fontFamily: FONT_MONO,
        fontSize: 13,
        lineHeight: "20px",
        color: COLORS.bios.fg,
      }}
    >
      {/* Faint CRT scanline overlay. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,255,0,0.05) 0px, rgba(0,255,0,0.05) 1px, transparent 1px, transparent 3px)",
        }}
      />
      {/* Subtle vignette. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.7) 100%)",
        }}
      />

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
              height: 14,
              background: COLORS.bios.fg,
              animation: "boot-blink 0.7s steps(2) infinite",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>
    </div>
  );
}

function BiosLine({ line }: { line: BootLine }) {
  const colorMap = COLORS.bios;
  const lineColor =
    line.status === "info"
      ? colorMap.info
      : line.status === "warn"
      ? colorMap.warn
      : line.status === "err"
      ? colorMap.err
      : colorMap.fg;
  return (
    <div
      className="flex items-baseline gap-[8px]"
      style={{ opacity: 0, animation: "boot-line-fade 200ms ease-out forwards" }}
    >
      <span style={{ color: colorMap.fgFaint }}>
        [{((line.delayMs + 1000) / 1000).toFixed(2)}s]
      </span>
      <span style={{ color: lineColor, flex: 1 }}>{line.text}</span>
      {line.ok && (
        <span style={{ color: colorMap.ok, opacity: 0.95 }}>[ OK ]</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 2 — Starting Windows 98 splash                                */
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
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background:
          "linear-gradient(180deg, #0c8ec5 0%, #1ba6e0 35%, #4dc4f0 65%, #008cba 100%)",
      }}
    >
      {/* Cloud SVG centerpiece + wordmark. */}
      <div
        className="flex flex-col items-center"
        style={{ animation: "boot-cloud-pulse 2.4s ease-in-out infinite" }}
      >
        <Win98CloudSvg />
        <div
          className="mt-[18px] flex items-baseline gap-[10px] select-none"
          style={{
            fontFamily: "Tahoma, Geneva, Verdana, sans-serif",
            color: "#ffffff",
            textShadow: "2px 2px 0 rgba(0,0,0,0.45)",
          }}
        >
          <span style={{ fontSize: 28, letterSpacing: "0.02em" }}>Microsoft</span>
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            Windows
          </span>
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1,
              color: "#ffe066",
            }}
          >
            98
          </span>
        </div>
        <div
          className="mt-[6px] select-none"
          style={{
            fontFamily: "Tahoma, Geneva, Verdana, sans-serif",
            color: "rgba(255,255,255,0.7)",
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          WillOS Edition · Build 2026.05
        </div>
      </div>

      {/* Scrolling "marching blocks" progress at bottom. */}
      <div
        className="absolute"
        style={{
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 56,
          width: 280,
          height: 14,
          border: "1px solid #013864",
          background: "#0a4673",
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            gap: 4,
            padding: 2,
            animation: "boot-progress-blocks 1400ms linear infinite",
            width: "200%",
          }}
        >
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: "0 0 24px",
                height: "100%",
                background: "linear-gradient(180deg, #6dd4f7 0%, #1995cf 100%)",
                border: "1px solid #024a7d",
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom-left "preparing personalized settings" line. */}
      <div
        className="absolute"
        style={{
          bottom: 24,
          left: 28,
          fontFamily: "Tahoma, Geneva, Verdana, sans-serif",
          color: "rgba(255,255,255,0.85)",
          fontSize: 12,
        }}
      >
        Loading personalized settings for <strong>Will Zhang</strong>...
      </div>
    </div>
  );
}

/** Stylized cloud SVG echoing the iconic Win98 splash. */
function Win98CloudSvg() {
  return (
    <svg
      width="180"
      height="120"
      viewBox="0 0 180 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.35))" }}
    >
      <defs>
        <linearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e8f6ff" />
        </linearGradient>
      </defs>
      <g>
        <ellipse cx="50" cy="78" rx="38" ry="30" fill="url(#cloudGrad)" />
        <ellipse cx="92" cy="58" rx="44" ry="36" fill="url(#cloudGrad)" />
        <ellipse cx="132" cy="80" rx="36" ry="28" fill="url(#cloudGrad)" />
        <ellipse cx="68" cy="58" rx="28" ry="22" fill="url(#cloudGrad)" />
        <ellipse cx="118" cy="42" rx="22" ry="18" fill="url(#cloudGrad)" />
      </g>
      {/* Win98 4-color flag sweep across the cloud. */}
      <g transform="translate(64, 50)" opacity="0.92">
        <path d="M 0 8 Q 14 0 28 8 Q 14 18 0 14 Z" fill="#e74c3c" />
        <path d="M 26 8 Q 40 0 54 8 Q 40 18 26 14 Z" fill="#f1c40f" />
        <path d="M 0 22 Q 14 14 28 22 Q 14 32 0 28 Z" fill="#2ecc71" />
        <path d="M 26 22 Q 40 14 54 22 Q 40 32 26 28 Z" fill="#3498db" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 3 — Bio playback                                              */
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
    <div
      className="absolute inset-0 px-[28px] py-[24px] overflow-hidden"
      style={{
        fontFamily: FONT_MONO,
        fontSize: 13,
        lineHeight: "22px",
        color: COLORS.bio.fg,
      }}
    >
      {/* Subtle scanlines. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Header. */}
      <div
        className="relative mb-[14px] flex items-center gap-[12px] pb-[8px]"
        style={{ borderBottom: "1px solid #2a2d34" }}
      >
        <span
          aria-hidden
          className="inline-block"
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: COLORS.bio.brand,
            boxShadow: `0 0 12px ${COLORS.bio.brand}`,
            animation: "boot-blink 1.4s ease-in-out infinite",
          }}
        />
        <span
          className="font-semibold"
          style={{ color: COLORS.bio.fg, fontFamily: FONT_MONO, fontSize: 14 }}
        >
          WillOS 98 · userland boot
        </span>
        <span
          className="text-[10px] uppercase ml-auto"
          style={{ color: COLORS.bio.fgDim, letterSpacing: "0.18em" }}
        >
          /etc/who-is-will
        </span>
      </div>

      {/* Streaming bio. */}
      <div className="relative">
        {BIO_LINES.slice(0, visible).map((line, i) => (
          <BioLineRow key={i} line={line} />
        ))}
        {visible < BIO_LINES.length && (
          <span
            aria-hidden
            className="inline-block ml-[6px]"
            style={{
              width: 9,
              height: 14,
              background: COLORS.bio.brand,
              animation: "boot-blink 0.7s steps(2) infinite",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>
    </div>
  );
}

function BioLineRow({ line }: { line: BootLine }) {
  const c = COLORS.bio;
  const lineColor =
    line.status === "ok"
      ? c.ok
      : line.status === "info"
      ? c.brand
      : line.status === "warn"
      ? c.warn
      : c.fg;
  return (
    <div
      className="flex items-baseline gap-[8px]"
      style={{ opacity: 0, animation: "boot-line-fade 220ms ease-out forwards" }}
    >
      <span style={{ color: c.fgFaint, opacity: 0.7 }}>
        [{((line.delayMs + 100) / 1000).toFixed(2)}s]
      </span>
      <span style={{ color: c.brand, opacity: 0.85 }}>›</span>
      <span style={{ color: lineColor, flex: 1 }}>{line.text}</span>
      {line.ok && (
        <span style={{ color: c.ok, opacity: 0.95 }}>[ OK ]</span>
      )}
    </div>
  );
}

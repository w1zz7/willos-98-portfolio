"use client";

/**
 * WillBB Markets Terminal - boot sequence.
 *
 * Plays for ~2.4s when the terminal first opens, then fades into the
 * live dashboard. Lines stream in like a Bloomberg cold start: cyan
 * accent, monospace, progress bar, and a final "READY" handshake.
 *
 * Pure presentation - no data fetching, no side-effects beyond a single
 * setInterval that drives the line cadence and a setTimeout that fires
 * `onComplete` when the sequence ends.
 */

import { useEffect, useMemo, useRef, useState } from "react";

const COLORS = {
  bg: "#0a0d12",
  panel: "#151518",
  border: "#46464F",
  text: "#FFFFFF",
  textDim: "#9793b0",
  textFaint: "#8A8A90",
  brand: "#33BBFF",
  brandSoft: "rgba(51,187,255,0.08)",
  up: "#5dd39e",
  err: "#f0686a",
} as const;

const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";
const FONT_UI =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

interface Line {
  prefix: string;
  text: string;
  status?: "ok" | "info" | "warn";
  delayMs: number;
}

const LINES: Line[] = [
  { prefix: ">", text: "WillBB Markets Terminal · v1.0", status: "info", delayMs: 0 },
  { prefix: ">", text: "boot · loading config from /etc/willbb.toml", status: "ok", delayMs: 220 },
  { prefix: ">", text: "auth · cookies seeded · crumb cached (30 min TTL)", status: "ok", delayMs: 360 },
  { prefix: ">", text: "feed · subscribing to Yahoo Finance v8 + CoinGecko fallback", status: "ok", delayMs: 460 },
  { prefix: ">", text: "watchlist · 144 symbols loaded from will.watchlist", status: "ok", delayMs: 580 },
  { prefix: ">", text: "indices · ^GSPC ^IXIC ^DJI ^RUT ^VIX CL=F GC=F BTC-USD ETH-USD", status: "ok", delayMs: 700 },
  { prefix: ">", text: "engine · TradingView widget (MA · RSI · MACD pre-loaded)", status: "ok", delayMs: 860 },
  { prefix: ">", text: "research · 12 modules wired (profile · technicals · financials · holders · options)", status: "ok", delayMs: 1000 },
  { prefix: ">", text: "discovery · gainers · losers · most-active screeners ready", status: "ok", delayMs: 1160 },
  { prefix: ">", text: "snapshot · 113 / 144 symbols cached · live feed warming", status: "info", delayMs: 1320 },
  { prefix: ">", text: "ALL SYSTEMS GO · welcome back, Will", status: "ok", delayMs: 1500 },
];

const TOTAL_MS = LINES[LINES.length - 1].delayMs + 700;

export default function BootScreen({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [fading, setFading] = useState<boolean>(false);
  const startedAt = useRef<number>(Date.now());

  // Stream lines in on their delays.
  useEffect(() => {
    const timers = LINES.map((line, i) =>
      window.setTimeout(() => setVisible((v) => Math.max(v, i + 1)), line.delayMs)
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Smooth progress bar.
  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setProgress(Math.min(100, (elapsed / TOTAL_MS) * 100));
      if (elapsed >= TOTAL_MS) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  // Fade to dashboard when sequence completes.
  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setFading(true), TOTAL_MS - 200);
    const doneTimer = window.setTimeout(() => onComplete(), TOTAL_MS + 280);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  // Allow user to skip with any key or click.
  useEffect(() => {
    function skip() {
      setProgress(100);
      setVisible(LINES.length);
      setFading(true);
      window.setTimeout(onComplete, 240);
    }
    window.addEventListener("keydown", skip, { once: true });
    return () => window.removeEventListener("keydown", skip);
  }, [onComplete]);

  const stamp = useMemo(() => {
    return new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, []);

  return (
    <div
      onClick={() => {
        setProgress(100);
        setVisible(LINES.length);
        setFading(true);
        window.setTimeout(onComplete, 240);
      }}
      className="absolute inset-0 z-30 flex flex-col cursor-pointer overflow-hidden"
      style={{
        background: COLORS.bg,
        opacity: fading ? 0 : 1,
        transition: "opacity 280ms ease-out",
      }}
    >
      {/* Scanline overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)",
        }}
      />
      {/* Subtle radial vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Header */}
      <div
        className="px-[18px] py-[10px] flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid " + COLORS.border, background: COLORS.panel }}
      >
        <div className="flex items-center gap-[12px]">
          <span
            aria-hidden
            className="inline-block"
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: COLORS.brand,
              boxShadow: "0 0 12px " + COLORS.brand,
              animation: "willbb-pulse 1.4s ease-in-out infinite",
            }}
          />
          <span
            className="text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: COLORS.text, fontFamily: FONT_UI }}
          >
            WillBB
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: COLORS.textDim, fontFamily: FONT_UI }}
          >
            Markets Terminal · v1.0
          </span>
        </div>
        <div
          className="text-[11px] tabular-nums"
          style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
        >
          {stamp}
        </div>
      </div>

      {/* ASCII brand */}
      <div className="px-[18px] pt-[14px] shrink-0" style={{ fontFamily: FONT_MONO }}>
        <pre
          className="leading-tight m-0 select-none"
          style={{
            color: COLORS.brand,
            fontSize: 11,
            textShadow: "0 0 8px rgba(51,187,255,0.5)",
            opacity: 0.92,
          }}
        >
{`
   __        ___ _ _ ____  ____    __  __            _        _
   \\ \\      / (_) | | __ )| __ )  |  \\/  | __ _ _ __| | _____| |_ ___
    \\ \\ /\\ / /| | | |  _ \\|  _ \\  | |\\/| |/ _\` | '__| |/ / _ \\ __/ __|
     \\ V  V / | | | | |_) | |_) | | |  | | (_| | |  |   <  __/ |_\\__ \\
      \\_/\\_/  |_|_|_|____/|____/  |_|  |_|\\__,_|_|  |_|\\_\\___|\\__|___/
                                                                          `}
        </pre>
      </div>

      {/* Streaming log */}
      <div
        className="flex-1 min-h-0 overflow-hidden px-[18px] pt-[6px]"
        style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: "20px" }}
      >
        {LINES.slice(0, visible).map((line, i) => (
          <div
            key={i}
            className="flex items-baseline gap-[6px]"
            style={{
              color:
                line.status === "ok"
                  ? COLORS.up
                  : line.status === "warn"
                  ? COLORS.err
                  : COLORS.brand,
              opacity: 0,
              animation: "willbb-fade-in 220ms ease-out forwards",
            }}
          >
            <span style={{ color: COLORS.textFaint, opacity: 0.7 }}>
              [{String((line.delayMs / 1000).toFixed(2)).padStart(5, "0")}s]
            </span>
            <span style={{ color: COLORS.brand, opacity: 0.85 }}>{line.prefix}</span>
            <span style={{ color: COLORS.text }}>{line.text}</span>
          </div>
        ))}
        {/* Live cursor */}
        {visible < LINES.length && (
          <span
            aria-hidden
            className="inline-block ml-[6px]"
            style={{
              width: 9,
              height: 14,
              background: COLORS.brand,
              animation: "willbb-blink 0.7s steps(2) infinite",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>

      {/* Progress bar */}
      <div
        className="px-[18px] pb-[18px] shrink-0"
        style={{ fontFamily: FONT_MONO, fontSize: 11 }}
      >
        <div className="flex items-baseline justify-between mb-[4px]">
          <span style={{ color: COLORS.textDim }}>
            {progress < 100 ? "loading…" : "ready · click or press any key to continue"}
          </span>
          <span style={{ color: COLORS.brand }}>{Math.floor(progress)}%</span>
        </div>
        <div
          className="w-full"
          style={{
            height: 5,
            background: COLORS.panel,
            border: "1px solid " + COLORS.border,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background:
                "linear-gradient(90deg, rgba(51,187,255,0.4) 0%, " +
                COLORS.brand +
                " 100%)",
              transition: "width 60ms linear",
              boxShadow: "0 0 8px " + COLORS.brand,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes willbb-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes willbb-fade-in {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes willbb-blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

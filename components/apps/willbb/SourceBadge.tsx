"use client";

/**
 * SourceBadge - unified data-provenance pill used across willBB.
 *
 * Maps the API response `source` field to a 4-state user-facing label:
 *
 *   yahoo                  → LIVE       (green pulse, real-time)
 *   stooq                  → DELAYED    (amber, ~15min lag, daily resolution)
 *   coingecko              → LIVE       (green, real-time crypto)
 *   seed | cached          → CACHED     (gray, last-known snapshot)
 *   synthetic              → SYNTHETIC  (red, regime-switching GBM placeholder)
 *
 * Hover tooltip explains the tier so a viewer who isn't a quant can still tell
 * how trustworthy the readout is. Used in OpenBB Markets header, Cockpit /
 * StrategyLab / RiskDashboard symbol bars, and Scanner aggregate footer.
 */
import { COLORS, FONT_UI, FONT_MONO } from "./OpenBB";

export type DataSource =
  | "yahoo"
  | "stooq"
  | "coingecko"
  | "alphavantage"
  | "seed"
  | "cached"
  | "synthetic"
  | "mixed"
  | "unavailable"
  | null
  | undefined;

interface BadgeStyle {
  label: string;
  color: string;
  bg: string;
  pulse: boolean;
  title: string;
}

function styleFor(src: DataSource): BadgeStyle {
  switch (src) {
    case "yahoo":
    case "coingecko":
      return {
        label: "LIVE",
        color: COLORS.up,
        bg: "rgba(93,211,158,0.10)",
        pulse: true,
        title:
          "LIVE - Yahoo Finance v8 / CoinGecko, real-time. Refreshes every 15s.",
      };
    case "stooq":
      return {
        label: "DELAYED",
        color: "#f5b042",
        bg: "rgba(245,176,66,0.10)",
        pulse: false,
        title:
          "DELAYED - Stooq daily CSV, free fallback when Yahoo is throttled. ~15-min delay.",
      };
    case "alphavantage":
      return {
        label: "EOD",
        color: "#c9a3ff",
        bg: "rgba(201,163,255,0.10)",
        pulse: false,
        title:
          "EOD - Alpha Vantage TIME_SERIES_DAILY / GLOBAL_QUOTE. End-of-day data on the free tier (25 req/day, 1h cache). Fires when Yahoo and Stooq both fail.",
      };
    case "seed":
    case "cached":
      return {
        label: "CACHED",
        color: COLORS.textDim,
        bg: "rgba(151,147,176,0.10)",
        pulse: false,
        title:
          "CACHED - last known snapshot from our seed cache. All real providers are unavailable.",
      };
    case "synthetic":
      return {
        label: "SYNTHETIC",
        color: COLORS.down,
        bg: "rgba(240,104,106,0.10)",
        pulse: false,
        title:
          "SYNTHETIC - regime-switching GBM placeholder OHLC. Used only when Yahoo, Stooq, and CoinGecko are all unavailable so the panel still renders.",
      };
    case "mixed":
      return {
        label: "MIXED",
        color: COLORS.brand,
        bg: "rgba(51,187,255,0.10)",
        pulse: false,
        title:
          "MIXED - some symbols live, some on cache or delayed feed. Hover individual rows for detail.",
      };
    case "unavailable":
      return {
        label: "DOWN",
        color: COLORS.down,
        bg: "rgba(240,104,106,0.10)",
        pulse: false,
        title:
          "DOWN - all upstream providers refused this symbol. Try another ticker or wait 30s.",
      };
    default:
      return {
        label: "—",
        color: COLORS.textFaint,
        bg: "rgba(138,138,144,0.06)",
        pulse: false,
        title: "Source unknown.",
      };
  }
}

export function SourceBadge({
  source,
  size = "sm",
  ageSeconds,
}: {
  source: DataSource;
  size?: "xs" | "sm" | "md";
  ageSeconds?: number | null;
}) {
  const s = styleFor(source);
  const fontSize = size === "xs" ? 9 : size === "md" ? 11 : 10;
  const padX = size === "xs" ? 5 : size === "md" ? 9 : 7;
  const padY = size === "xs" ? 1 : size === "md" ? 3 : 2;
  const dot = size === "xs" ? 5 : size === "md" ? 7 : 6;
  return (
    <span
      className="inline-flex items-center gap-[5px]"
      style={{
        background: s.bg,
        border: `1px solid ${s.color}33`,
        padding: `${padY}px ${padX}px`,
        fontFamily: FONT_UI,
        fontSize,
        letterSpacing: "0.14em",
        whiteSpace: "nowrap",
      }}
      title={s.title}
    >
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={{
          width: dot,
          height: dot,
          background: s.color,
          boxShadow: s.pulse ? `0 0 6px ${s.color}` : "none",
        }}
      />
      <span style={{ color: s.color }}>{s.label}</span>
      {ageSeconds != null && Number.isFinite(ageSeconds) && (
        <span style={{ color: COLORS.textFaint, fontFamily: FONT_MONO, fontSize: fontSize - 1 }}>
          · {ageSeconds}s
        </span>
      )}
    </span>
  );
}

/**
 * Aggregate a list of source strings into a single badge state. Used in the
 * Markets header where the strip is built from multiple symbols.
 */
export function aggregateSource(sources: (DataSource | string | undefined)[]): DataSource {
  if (sources.length === 0) return null;
  const norm = sources.map((s) =>
    s === "seed" || s === "cached" ? "cached" : (s as DataSource)
  );
  const set = new Set(norm);
  if (set.size === 1) return Array.from(set)[0] as DataSource;
  // Highest-trust label wins for "all real": yahoo > coingecko > stooq.
  // If any synthetic / unavailable sneaks in, surface MIXED so the viewer
  // knows to look at individual rows.
  if (set.has("synthetic") || set.has("unavailable")) return "mixed";
  if (set.has("cached")) return "mixed";
  return "mixed";
}

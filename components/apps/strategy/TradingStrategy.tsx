"use client";

/**
 * Trading Strategy - a content/document app that documents Will's actual
 * trading approach (Section 1, in his own words) followed by an educational
 * 5-point technical framework (Section 2).
 *
 * No data fetching. Pure content, Win98-styled, similar visual rhythm to
 * About / Speaking / HighSchool.
 */

import type { WindowState } from "@/lib/wm/types";
import { openApp } from "@/lib/wm/registry";

interface KeyConcept {
  label: string;
  body: string;
  /** Hex used for the small left-edge color stripe. Win98 palette only. */
  accent: string;
}

const KEY_CONCEPTS: KeyConcept[] = [
  {
    label: "Support / Resistance",
    body: "Levels where price has held or rejected before. The market remembers them.",
    accent: "#3465a4",
  },
  {
    label: "Prior Highs / Lows",
    body: "Recent swing pivots that act as magnets - price tends to revisit them.",
    accent: "#73d216",
  },
  {
    label: "Gaps",
    body: "Overnight or session gaps that often get filled. Watch the edges.",
    accent: "#f57900",
  },
  {
    label: "Reaction Zones",
    body: "Areas where price previously had strong moves - volatility tends to repeat.",
    accent: "#ad7fa8",
  },
  {
    label: "Pre-market Plan",
    body: "Knowing in advance what to do if price tests each level. No improvising.",
    accent: "#ef2929",
  },
];

type Bias = "bullish" | "neutral" | "bearish";

interface FrameworkPoint {
  n: number;
  title: string;
  measures: string;
  signals: { bias: Bias; text: string }[];
}

const FRAMEWORK: FrameworkPoint[] = [
  {
    n: 1,
    title: "Fundamentals First",
    measures:
      "Before any chart talk: revenue growth, profit margins, cash flow, debt levels, competitive positioning, and valuation (P/E, P/B, EV/EBITDA). Confirm the latest quarterly print, gross-margin trend, and balance-sheet strength versus peers (e.g. Apple's services mix + iPhone unit growth + cash position).",
    signals: [
      {
        bias: "bullish",
        text: "Accelerating revenue + expanding margins + manageable debt + reasonable multiple vs peers",
      },
      {
        bias: "neutral",
        text: "Steady fundamentals but no clear edge, or fairly priced",
      },
      {
        bias: "bearish",
        text: "Decelerating sales, margin compression, leverage creep, or stretched valuation",
      },
    ],
  },
  {
    n: 2,
    title: "Trend & Moving Averages",
    measures:
      "Where is price relative to the 50-day SMA? The single fastest read on overall trend. A fresh cross above the 50-day signals a nascent uptrend (e.g. AAPL just reclaimed it).",
    signals: [
      { bias: "bullish", text: "Price above the 50-day SMA, MA sloping up" },
      { bias: "neutral", text: "Price hugging the 50-day, flat slope" },
      { bias: "bearish", text: "Price below the 50-day SMA, MA sloping down" },
    ],
  },
  {
    n: 3,
    title: "Momentum (RSI & MACD)",
    measures:
      "Is the move backed by momentum? RSI 40–60 = healthy, >70 overbought, <30 oversold. MACD line crossing above its signal line + positive histogram = bullish (e.g. AAPL RSI ~60 with a fresh MACD cross).",
    signals: [
      {
        bias: "bullish",
        text: "RSI 40-60 healthy + MACD line above signal + positive histogram",
      },
      { bias: "neutral", text: "RSI flat near 50, MACD flat / wrapping signal" },
      {
        bias: "bearish",
        text: "RSI > 70 (overbought) or < 30 (oversold) + MACD rolling over",
      },
    ],
  },
  {
    n: 4,
    title: "Volume Confirmation",
    measures:
      "Does the tape agree? Rising price on higher volume confirms strength; falling price on higher volume signals selling pressure. Look for green volume bars expanding into the rally.",
    signals: [
      { bias: "bullish", text: "Rising price on rising volume = real demand" },
      { bias: "neutral", text: "Move on light volume = unconfirmed" },
      {
        bias: "bearish",
        text: "Falling price on rising volume = active selling pressure",
      },
    ],
  },
  {
    n: 5,
    title: "Support & Resistance Levels",
    measures:
      "Identify recent swing highs and lows. The level you marked pre-market is the playbook (e.g. AAPL: 274–276 resistance, 250 support). A clean break + retest changes the bias.",
    signals: [
      {
        bias: "bullish",
        text: "Price reclaiming prior resistance, prior lows holding as support",
      },
      { bias: "neutral", text: "Range-bound between clear S/R" },
      {
        bias: "bearish",
        text: "Breaking prior support, recent highs unrejected becomes resistance",
      },
    ],
  },
];

const BIAS_COLOR: Record<Bias, { bg: string; fg: string; border: string }> = {
  bullish: { bg: "#dff5d8", fg: "#0a5b16", border: "#73d216" },
  neutral: { bg: "#f1f1f1", fg: "#444444", border: "#808080" },
  bearish: { bg: "#fbe0dd", fg: "#8b1c12", border: "#ef2929" },
};

const BIAS_LABEL: Record<Bias, string> = {
  bullish: "BULLISH",
  neutral: "NEUTRAL",
  bearish: "BEARISH",
};

export default function TradingStrategy({ window: _ }: { window: WindowState }) {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto win-scroll bg-[color:var(--color-win-bg)]">
        {/* ---------- Document title strip ---------- */}
        <div
          className="flex items-center gap-[8px] px-[14px] py-[10px] border-b border-[#808080]"
          style={{
            background:
              "linear-gradient(180deg, #1e3a8a 0%, #08246b 100%)",
            color: "#fff",
          }}
        >
          <img
            src="/icons/strategy.svg"
            alt=""
            width={24}
            height={24}
            style={{ imageRendering: "pixelated" }}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[18px] leading-tight">
              Trading Strategy
            </div>
            <div className="text-[14px] opacity-90 leading-tight">
              How Will trades - pre-market levels + a fundamentals-first checklist
            </div>
          </div>
        </div>

        {/* =========================================================
             SECTION 1 - In his own words
             ========================================================= */}
        <SectionHeader
          eyebrow="Section 1"
          title="Pre-market Level Mapping"
          subtitle="How I trade, in my own words"
        />

        <div className="px-[14px] pt-[12px] pb-[14px] flex flex-col gap-[12px]">
          {/* Pull-quote card */}
          <div
            className="win-window p-[14px] flex gap-[12px] items-start"
            style={{ background: "#fffef0" }}
          >
            <div
              className="shrink-0 font-serif font-bold leading-none"
              style={{
                color: "#000080",
                fontSize: 56,
                lineHeight: "40px",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
              aria-hidden
            >
              &ldquo;
            </div>
            <blockquote
              className="m-0 italic text-[#222] leading-relaxed"
              style={{ fontSize: 18 }}
            >
              My strategy has been centered on mapping key levels ahead of
              time. I pay close attention to support, resistance, prior highs
              and lows, gaps, and areas where price previously had strong
              reactions. It is a great feeling to know before the market
              opens what levels matter and what I am likely to do if price
              gets there.
              <footer
                className="mt-[8px] not-italic font-bold text-[15px] flex items-center gap-[8px]"
                style={{ color: "#0a3a8a" }}
              >
                <span
                  className="inline-block"
                  style={{
                    width: 18,
                    height: 2,
                    background: "#0a3a8a",
                  }}
                  aria-hidden
                />
                Will Zhang
              </footer>
            </blockquote>
          </div>

          {/* Key concepts grid */}
          <div>
            <div className="font-bold text-[15px] uppercase tracking-wide text-[color:var(--color-win-text-disabled)] mb-[6px]">
              Key concepts
            </div>
            <div
              className="grid gap-[8px]"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              {KEY_CONCEPTS.map((k) => (
                <div
                  key={k.label}
                  className="win-sunken bg-white flex"
                  style={{ minHeight: 70 }}
                >
                  <div
                    style={{
                      width: 6,
                      background: k.accent,
                      flexShrink: 0,
                    }}
                    aria-hidden
                  />
                  <div className="flex-1 p-[10px]">
                    <div className="font-bold text-[16px] leading-tight">
                      {k.label}
                    </div>
                    <div className="text-[14px] text-[#333] leading-snug mt-[2px]">
                      {k.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* =========================================================
             SECTION 2 - Full evaluation framework
             ========================================================= */}
        <SectionHeader
          eyebrow="Section 2"
          title="Evaluation Framework"
          subtitle="Fundamentals first, then technicals - 5 checks before sizing in"
        />

        <div className="px-[14px] pt-[12px] pb-[14px] flex flex-col gap-[10px]">
          {FRAMEWORK.map((p) => (
            <FrameworkCard key={p.n} point={p} />
          ))}

          {/* Closing one-liner */}
          <div
            className="win-window p-[12px] flex items-start gap-[10px]"
            style={{ background: "#eef3f8" }}
          >
            <div
              className="shrink-0 flex items-center justify-center font-bold text-white"
              style={{
                width: 28,
                height: 28,
                background: "#0a3a8a",
                borderRadius: 2,
                fontSize: 16,
              }}
              aria-hidden
            >
              &#x2714;
            </div>
            <div className="flex-1">
              <div
                className="text-[15px] font-bold uppercase tracking-wide"
                style={{ color: "#0a3a8a" }}
              >
                Bottom line
              </div>
              <div className="text-[16px] leading-relaxed mt-[2px] italic">
                Fundamentals get the green light first - revenue, margins,
                cash, valuation. Then if the technicals align (uptrend,
                positive momentum, volume confirmation, price defending
                support), the stock looks good to consider. Otherwise wait
                for a cleaner signal.
              </div>
            </div>
          </div>
        </div>

        {/* CTA strip */}
        <div className="px-[14px] py-[10px] border-t border-[#808080] flex gap-[6px] flex-wrap bg-[color:var(--color-win-bg)]">
          <button
            type="button"
            className="win-btn"
            onClick={() => openApp("market-recaps")}
          >
            Open Market Journal
          </button>
          <button
            type="button"
            className="win-btn"
            onClick={() => openApp("stock-portfolio")}
          >
            Open Stock Portfolio
          </button>
          <button
            type="button"
            className="win-btn"
            onClick={() => openApp("willbb")}
          >
            Open WillBB Terminal
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   SectionHeader - the gray Win98 header bar that splits the doc
   into Section 1 / Section 2.
   ---------------------------------------------------------------- */
function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="px-[14px] py-[8px] border-y border-[#808080] flex items-baseline gap-[10px]"
      style={{
        background:
          "linear-gradient(180deg, #d4d0c8 0%, #b6b3ad 100%)",
      }}
    >
      <div
        className="text-[12px] font-bold uppercase px-[6px] py-[1px] text-white"
        style={{ background: "#000080", letterSpacing: "0.6px" }}
      >
        {eyebrow}
      </div>
      <div className="font-bold text-[18px] leading-tight">{title}</div>
      {subtitle && (
        <div className="text-[14px] italic text-[#444] leading-tight">
          - {subtitle}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   FrameworkCard - one numbered point in the 5-point framework, with
   a "what it measures" line and three bullish/neutral/bearish chips.
   ---------------------------------------------------------------- */
function FrameworkCard({ point }: { point: FrameworkPoint }) {
  return (
    <div className="win-window bg-white p-[12px] flex flex-col gap-[8px]">
      {/* Header: number badge + title */}
      <div className="flex items-start gap-[10px]">
        <div
          className="shrink-0 flex items-center justify-center font-bold text-white"
          style={{
            width: 32,
            height: 32,
            background: "#000080",
            borderRadius: 2,
            fontSize: 18,
          }}
          aria-hidden
        >
          {point.n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[17px] leading-tight">
            {point.title}
          </div>
          <div className="text-[15px] text-[#333] leading-snug mt-[2px]">
            {point.measures}
          </div>
        </div>
      </div>

      {/* Signal chips */}
      <div
        className="grid gap-[6px]"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {point.signals.map((s, i) => {
          const c = BIAS_COLOR[s.bias];
          return (
            <div
              key={i}
              className="flex items-start gap-[8px] p-[8px]"
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 2,
              }}
            >
              <span
                className="shrink-0 px-[5px] py-[1px] text-[11px] font-bold uppercase tracking-wide text-white"
                style={{
                  background: c.border,
                  letterSpacing: "0.4px",
                  borderRadius: 2,
                }}
              >
                {BIAS_LABEL[s.bias]}
              </span>
              <span
                className="text-[14px] leading-snug"
                style={{ color: c.fg }}
              >
                {s.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

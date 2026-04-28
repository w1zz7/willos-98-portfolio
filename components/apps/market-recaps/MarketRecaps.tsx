"use client";

/**
 * Market Journal - chronological log of daily + weekly market entries
 * plus VIP commentary threads (Jan 21 – Apr 17, 2026).
 *
 * Each entry renders a card with:
 *   · date + headline
 *   · Dow / S&P 500 / Nasdaq grid with pct-coloring
 *   · macro bullets, standout movers
 *   · sector winners / losers chips
 *   · crypto + commodities mini-row
 *   · "Looking ahead" + TLDR
 */

import type { WindowState } from "@/lib/wm/types";
import {
  MARKET_RECAPS,
  RECAPS_RANGE,
  type MarketRecap,
} from "@/data/marketRecaps";
import { useMemo, useState } from "react";

type FilterId = "all" | "daily" | "weekly" | "intel";

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtNum(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pctColor(pct: number): string {
  if (pct > 0) return "#087f23";
  if (pct < 0) return "#c00";
  return "#444";
}

function bgTint(pct: number): string {
  if (pct > 0) return "#e8f6ea";
  if (pct < 0) return "#fde8e8";
  return "#f0f0f0";
}

export default function MarketRecaps({ window: _ }: { window: WindowState }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MARKET_RECAPS.filter((r) => {
      if (filter !== "all" && r.type !== filter) return false;
      if (q) {
        const hay = [
          r.label,
          r.headline,
          r.tldr ?? "",
          (r.macro ?? []).join(" "),
          (r.movers ?? []).join(" "),
          (r.sectorsUp ?? []).join(" "),
          (r.sectorsDown ?? []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filter, search]);

  // Aggregate stats for the "at a glance" row.
  const totalEntries = MARKET_RECAPS.length;
  const dailyCount = MARKET_RECAPS.filter((r) => r.type === "daily").length;
  const weeklyCount = MARKET_RECAPS.filter((r) => r.type === "weekly").length;
  const intelCount = MARKET_RECAPS.filter((r) => r.type === "intel").length;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Title band */}
      <div className="win-raised flex items-center gap-[8px] px-[8px] py-[6px] border-b border-[#808080]">
        <img
          src="/icons/news.svg"
          alt=""
          width={30}
          height={30}
          className="pixelated shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[18px]">Market Journal</div>
          <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)]">
            {RECAPS_RANGE}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-auto win-scroll">
        {/* Narrative intro */}
        <div className="p-[12px] border-b border-[#808080] bg-[#fffbe8] text-[20px] leading-relaxed">
          <p className="mb-[6px]">
            I read (and log) the market every trading day. Most of the macro
            reasoning inside my swing trades comes from these daily recaps -
            Fed policy, sector rotation, geopolitical shocks, crypto flows,
            commodities moves. I keep the raw text here as a reference journal
            alongside the trade log in Stock Portfolio.
          </p>
          <p className="italic text-[color:var(--color-win-text-disabled)]">
            Coverage: <b>{RECAPS_RANGE}</b> - {totalEntries} entries (
            {dailyCount} daily, {weeklyCount} weekly, {intelCount} intel).
            Filter by type below or search any ticker/sector/theme.
          </p>
        </div>

        {/* Filter + search */}
        <div className="p-[10px] border-b border-[#808080] bg-[#f0f0f0] flex items-center flex-wrap gap-[6px]">
          <span className="text-[18px] font-bold uppercase tracking-wide text-[color:var(--color-win-text-disabled)] mr-[4px]">
            Filter:
          </span>
          {(
            [
              { id: "all", label: `All (${totalEntries})` },
              { id: "daily", label: `Daily (${dailyCount})` },
              { id: "weekly", label: `Weekly (${weeklyCount})` },
              { id: "intel", label: `Intel (${intelCount})` },
            ] as { id: FilterId; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="excel-tab shrink-0"
              data-active={filter === f.id}
            >
              {f.label}
            </button>
          ))}
          <div className="flex-1" />
          <input
            type="text"
            placeholder="search (e.g. Nvidia, Fed, oil)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="win-sunken px-[6px] py-[2px] text-[18px] bg-white"
            style={{
              minWidth: 180,
              border: "1px inset #808080",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Count line */}
        <div className="px-[12px] py-[6px] text-[18px] italic text-[color:var(--color-win-text-disabled)] border-b border-[#808080]">
          Showing {filtered.length} of {totalEntries} entries (most recent first).
        </div>

        {/* Cards */}
        <div className="p-[12px] flex flex-col gap-[10px]">
          {filtered.length === 0 && (
            <div className="win-sunken p-[16px] text-center text-[19px] italic text-[color:var(--color-win-text-disabled)]">
              No entries match &ldquo;{search}&rdquo;.
            </div>
          )}
          {filtered.map((r) => (
            <RecapCard key={r.date + r.label} recap={r} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#808080] px-[10px] py-[4px] text-[19px] text-[color:var(--color-win-text-disabled)] flex justify-between gap-[10px] flex-wrap">
        <span>
          {totalEntries} entries · {RECAPS_RANGE}
        </span>
        <span>Daily market journal</span>
      </div>
    </div>
  );
}

function RecapCard({ recap }: { recap: MarketRecap }) {
  const {
    label,
    headline,
    type,
    indices,
    macro,
    movers,
    sectorsUp,
    sectorsDown,
    crypto,
    commodities,
    lookingAhead,
    tldr,
  } = recap;

  const typeTag =
    type === "weekly"
      ? "weekly recap"
      : type === "intel"
      ? "market intel"
      : "daily recap";

  return (
    <div className="win-window bg-white p-[10px] flex flex-col gap-[8px]">
      {/* Header */}
      <div className="flex items-baseline gap-[6px] flex-wrap border-b border-[#808080] pb-[4px]">
        <div className="font-bold text-[18px]">{label}</div>
        <span
          className="text-[17px] uppercase tracking-wide border border-[#808080] px-[4px] py-[1px]"
          style={{ background: "#fff3b0" }}
        >
          {typeTag}
        </span>
      </div>

      {/* Headline */}
      <div className="text-[20px] font-bold leading-snug">{headline}</div>

      {/* Indices grid */}
      {indices && (
        <div
          className="grid gap-[6px]"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <IndexCell label="Dow" move={indices.dow} />
          <IndexCell label="S&P 500" move={indices.sp500} />
          <IndexCell label="Nasdaq" move={indices.nasdaq} />
        </div>
      )}

      {/* Macro bullets */}
      {macro && macro.length > 0 && (
        <div>
          <SectionLabel>Macro</SectionLabel>
          <ul className="list-disc pl-[18px] text-[19px] leading-relaxed">
            {macro.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Movers */}
      {movers && movers.length > 0 && (
        <div>
          <SectionLabel>Standout movers</SectionLabel>
          <ul className="list-disc pl-[18px] text-[19px] leading-relaxed">
            {movers.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sectors */}
      {(sectorsUp?.length || sectorsDown?.length) && (
        <div className="flex flex-col gap-[4px]">
          {sectorsUp && sectorsUp.length > 0 && (
            <div className="flex flex-wrap gap-[4px] items-center">
              <span className="text-[18px] font-bold text-[#087f23] mr-[2px]">
                Up:
              </span>
              {sectorsUp.map((s) => (
                <span
                  key={s}
                  className="text-[18px] border border-[#808080] px-[4px] py-[1px]"
                  style={{ background: "#e8f6ea", color: "#087f23" }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {sectorsDown && sectorsDown.length > 0 && (
            <div className="flex flex-wrap gap-[4px] items-center">
              <span className="text-[18px] font-bold text-[#c00] mr-[2px]">
                Down:
              </span>
              {sectorsDown.map((s) => (
                <span
                  key={s}
                  className="text-[18px] border border-[#808080] px-[4px] py-[1px]"
                  style={{ background: "#fde8e8", color: "#c00" }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Crypto + commodities mini-row */}
      {(crypto || commodities) && (
        <div
          className="grid gap-[6px]"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          }}
        >
          {crypto?.btc !== undefined && (
            <MiniStat label="BTC" value={"$" + fmtInt(crypto.btc)} accent="#f7931a" />
          )}
          {crypto?.eth !== undefined && (
            <MiniStat label="ETH" value={"$" + fmtNum(crypto.eth)} accent="#627eea" />
          )}
          {crypto?.sol !== undefined && (
            <MiniStat label="SOL" value={"$" + fmtNum(crypto.sol)} accent="#9945ff" />
          )}
          {commodities?.oil !== undefined && (
            <MiniStat label="Oil" value={"$" + fmtNum(commodities.oil)} accent="#444" />
          )}
          {commodities?.gold !== undefined && (
            <MiniStat
              label="Gold"
              value={"$" + fmtInt(commodities.gold)}
              accent="#b8860b"
            />
          )}
          {commodities?.silver !== undefined && (
            <MiniStat
              label="Silver"
              value={"$" + fmtNum(commodities.silver)}
              accent="#808080"
            />
          )}
        </div>
      )}

      {/* Looking ahead */}
      {lookingAhead && lookingAhead.length > 0 && (
        <div>
          <SectionLabel>Looking ahead</SectionLabel>
          <ul className="list-disc pl-[18px] text-[19px] leading-relaxed">
            {lookingAhead.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {/* TLDR */}
      {tldr && (
        <div
          className="win-sunken p-[8px] text-[19px] leading-relaxed"
          style={{ background: "#fffbe8" }}
        >
          <span className="font-bold uppercase tracking-wide text-[17px] mr-[4px]">
            TL;DR
          </span>
          {tldr}
        </div>
      )}
    </div>
  );
}

function IndexCell({
  label,
  move,
}: {
  label: string;
  move: { pct: number; value: number };
}) {
  return (
    <div
      className="win-sunken p-[6px] flex flex-col gap-[1px]"
      style={{ background: bgTint(move.pct) }}
    >
      <div className="text-[18px] font-bold">{label}</div>
      <div className="text-[20px] font-bold" style={{ color: pctColor(move.pct) }}>
        {fmtPct(move.pct)}
      </div>
      <div className="text-[17px] text-[color:var(--color-win-text-disabled)]">
        {fmtNum(move.value)}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="win-sunken bg-white p-[4px] flex flex-col gap-[1px]">
      <div
        className="text-[16px] font-bold uppercase tracking-wide"
        style={{ color: accent }}
      >
        {label}
      </div>
      <div className="text-[18px] font-bold">{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-bold text-[17px] uppercase tracking-wide text-[color:var(--color-win-text-disabled)] mb-[2px]"
    >
      {children}
    </div>
  );
}

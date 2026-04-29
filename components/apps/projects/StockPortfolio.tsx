"use client";

import type { WindowState } from "@/lib/wm/types";
import { Sparkline } from "@/components/apps/excel/charts/Sparkline";
import {
  REAL_TRADES,
  TY_2025,
  ROLLING_6M,
  ALL_TIME,
  MONTHLY_STATS,
  type PeriodStats,
} from "@/data/trades";
import { openApp } from "@/lib/wm/registry";
import { useMemo, useState } from "react";

function fmt(n: number, dp = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}
function signed(n: number, dp = 2): string {
  return (n >= 0 ? "+" : "") + "$" + fmt(n, dp);
}
function signedPct(n: number, dp = 2): string {
  return (n >= 0 ? "+" : "") + fmt(n, dp) + "%";
}

type SortKey = "date" | "ticker" | "shares" | "price" | "proceeds" | "realized";

const PERIODS: { id: string; stats: PeriodStats }[] = [
  { id: "rolling", stats: ROLLING_6M },
  { id: "ty2025", stats: TY_2025 },
  { id: "all", stats: ALL_TIME },
];

export default function StockPortfolio({ window: _ }: { window: WindowState }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<string>("");
  const [activePeriod, setActivePeriod] = useState<string>("rolling");

  const activeStats =
    PERIODS.find((p) => p.id === activePeriod)?.stats ?? ROLLING_6M;

  const filteredTrades = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return f ? REAL_TRADES.filter((t) => t.ticker.includes(f)) : REAL_TRADES;
  }, [filter]);

  const sorted = useMemo(() => {
    const arr = [...filteredTrades];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null || bv == null) return 0;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredTrades, sortKey, sortDir]);

  // Cumulative realized PnL series across monthly buckets
  const cumulativeSeries = useMemo(() => {
    const series: number[] = [0];
    let run = 0;
    for (const m of MONTHLY_STATS) {
      run += m.realized;
      series.push(run);
    }
    return series;
  }, []);

  const filteredProceeds = sorted.reduce((s, t) => s + t.proceeds, 0);
  const filteredRealized = sorted.reduce((s, t) => s + t.realized, 0);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Title band */}
      <div className="p-[16px] border-b border-[#808080] flex items-center gap-[10px] shrink-0">
        <img
          src="/icons/chart.svg"
          alt=""
          width={56}
          height={56}
          className="pixelated"
          style={{ imageRendering: "pixelated" }}
        />
        <div>
          <div className="font-bold text-[20px]">Stock Portfolio Management</div>
          <div className="text-[20px] italic">
            Personal book · {ALL_TIME.count} closed trades · broker-reconciled
            FIFO · Aug 2025 – Apr 2026
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto win-scroll">
        <div className="p-[16px] space-y-[12px] text-[20px] leading-relaxed">
          {/* Period tabs - switch between official reporting windows */}
          <div className="flex flex-wrap items-center gap-[6px]">
            <span className="text-[19px] font-bold uppercase tracking-wide text-[color:var(--color-win-text-disabled)]">
              Reporting period:
            </span>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePeriod(p.id)}
                className="excel-tab shrink-0"
                data-active={activePeriod === p.id}
              >
                {p.stats.label.replace(" (broker-reconciled)", "")}
              </button>
            ))}
          </div>

          {/* Official report card - mirrors the brokerage summary layout */}
          <div
            className="win-window p-[10px] flex flex-col gap-[6px]"
            style={{ background: "#fff" }}
          >
            <div className="flex items-baseline justify-between flex-wrap gap-[6px]">
              <div className="font-bold text-[18px]">
                {activeStats.label} - {activeStats.count} records
              </div>
              <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)]">
                {activeStats.startDate} to {activeStats.endDate}
              </div>
            </div>
            <div
              className="grid gap-[6px] mt-[4px]"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              }}
            >
              <Stat
                label={
                  activeStats === ALL_TIME ? "Total $ Volume Traded" : "Total Proceeds"
                }
                value={`$${fmt(activeStats.proceeds)}`}
              />
              <Stat label="Total Cost Basis" value={`$${fmt(activeStats.basis)}`} />
              <Stat
                label={`Net ${activeStats.realized >= 0 ? "Gain" : "Loss"}`}
                value={signed(activeStats.realized)}
                pct={signedPct(activeStats.returnPct)}
                color={activeStats.realized >= 0 ? "#087f23" : "#c00"}
              />
              <Stat
                label="Gain/Loss Ratio"
                value={`${fmt(activeStats.gainLossRatio)}%`}
                hint="gains ÷ (gains + |losses|)"
              />
            </div>
            <div
              className="grid gap-[6px] mt-[2px]"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              }}
            >
              <Stat
                label="Total Gains"
                value={signed(activeStats.gains)}
                color="#087f23"
              />
              <Stat
                label="Total Losses"
                value={signed(activeStats.losses)}
                color="#c00"
              />
              <Stat
                label="Disallowed Loss (wash)"
                value={`-$${fmt(activeStats.disallowed)}`}
                color="#c00"
              />
              <Stat
                label="W / L / Flat"
                value={`${activeStats.wins} / ${activeStats.lossCount} / ${activeStats.flats}`}
              />
            </div>
            <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)] mt-[2px]">
              Broker-reconciled. Matches the Account Total line verbatim - every
              proceeds, gain, loss, wash-sale disallowance was parsed from the
              brokerage export.
            </div>
          </div>

          {/* Cumulative realized PnL sparkline */}
          <div className="flex items-center gap-[10px] win-window p-[10px]">
            <div>
              <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
                Cumulative realized (monthly)
              </div>
              <div
                className="text-[19px] font-bold"
                style={{ color: ALL_TIME.realized >= 0 ? "#087f23" : "#c00" }}
              >
                {signed(ALL_TIME.realized, 2)}
              </div>
              <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
                all-time · {ALL_TIME.count} trades · wash-adj tracked
              </div>
            </div>
            <div className="flex-1 flex justify-end">
              <Sparkline
                data={cumulativeSeries}
                width={220}
                height={52}
                color={ALL_TIME.realized >= 0 ? "#087f23" : "#c00"}
              />
            </div>
          </div>

          {/* Summary note */}
          <div
            className="win-sunken p-[8px] text-[20px] leading-relaxed"
            style={{ background: "#fffbe8" }}
          >
            <b>What the numbers actually say:</b> processed{" "}
            <b>$315,020 in equity trades</b> using macro swing trading and
            realized a{" "}
            <span style={{ color: "#087f23", fontWeight: 700 }}>
              63.98% gain ratio
            </span>{" "}
            across 267 closed trades. Every entry validated through an Excel
            tracker against S/R levels, 50/200 moving averages, and momentum
            studies (RSI, MACD divergence). <b>239 wins / 28 losses</b> with
            every FIFO close logged and every wash-sale flagged.
            <div className="mt-[6px] text-[19px] italic text-[#555]">
              Most of the macro read comes from a daily journal I keep -{" "}
              <button
                type="button"
                className="underline text-[#0000ee] bg-transparent"
                onClick={() => openApp("market-recaps")}
              >
                Open Market Journal →
              </button>
            </div>
          </div>

          {/* Monthly breakdown */}
          <div>
            <div className="font-bold text-[18px] mb-[4px]">
              Monthly realized P/L (all months)
            </div>
            <div
              className="win-sunken bg-white overflow-x-auto win-scroll"
              style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              <table
                className="w-full border-collapse text-[20px]"
                style={{ minWidth: 440 }}
              >
                <thead>
                  <tr style={{ background: "#c0c0c0" }}>
                    <Th>Month</Th>
                    <Th align="right">Proceeds</Th>
                    <Th align="right">Realized P/L</Th>
                    <Th align="right">Disallowed</Th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHLY_STATS.map((m) => (
                    <tr
                      key={m.month}
                      style={{ borderBottom: "1px solid #e0e0e0" }}
                    >
                      <Td bold>{m.month}</Td>
                      <Td align="right">${fmt(m.proceeds, 0)}</Td>
                      <Td
                        align="right"
                        bold
                        color={m.realized >= 0 ? "#087f23" : "#c00"}
                      >
                        {signed(m.realized, 0)}
                      </Td>
                      <Td align="right" color="#888">
                        {m.disallowed > 0 ? `-$${fmt(m.disallowed, 0)}` : "-"}
                      </Td>
                    </tr>
                  ))}
                  <tr style={{ background: "#fff3b0", fontWeight: "bold" }}>
                    <Td bold>ALL TIME</Td>
                    <Td align="right" bold>
                      ${fmt(ALL_TIME.proceeds, 0)}
                    </Td>
                    <Td
                      align="right"
                      bold
                      color={ALL_TIME.realized >= 0 ? "#087f23" : "#c00"}
                    >
                      {signed(ALL_TIME.realized, 0)}
                    </Td>
                    <Td align="right" bold color="#888">
                      -${fmt(ALL_TIME.disallowed, 0)}
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Full trade log - sortable, filterable */}
          <div>
            <div className="flex items-baseline gap-[8px] mb-[4px] flex-wrap">
              <div className="font-bold text-[18px]">
                Full closed-trade log ({sorted.length} rows)
              </div>
              <input
                type="text"
                placeholder="Filter ticker…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-[#808080] bg-white px-[4px] py-[1px] text-[20px]"
                style={{ width: 120 }}
              />
              <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
                Click a column to sort
              </div>
              {filter && (
                <div className="text-[19px]">
                  Filtered P/L:{" "}
                  <span
                    style={{
                      fontWeight: 700,
                      color: filteredRealized >= 0 ? "#087f23" : "#c00",
                    }}
                  >
                    {signed(filteredRealized, 2)}
                  </span>{" "}
                  on ${fmt(filteredProceeds, 0)} proceeds
                </div>
              )}
            </div>
            <div
              className="win-sunken bg-white"
              style={{
                fontFamily: "Arial, Helvetica, sans-serif",
                maxHeight: 340,
                overflow: "auto",
              }}
            >
              <table
                className="w-full border-collapse text-[20px]"
                style={{ minWidth: 620 }}
              >
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#c0c0c0",
                    zIndex: 1,
                  }}
                >
                  <tr>
                    <SortTh
                      label="Date"
                      keyName="date"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortTh
                      label="Ticker"
                      keyName="ticker"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortTh
                      label="Shares"
                      keyName="shares"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      align="right"
                    />
                    <SortTh
                      label="Price"
                      keyName="price"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      align="right"
                    />
                    <SortTh
                      label="Proceeds"
                      keyName="proceeds"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      align="right"
                    />
                    <SortTh
                      label="P/L"
                      keyName="realized"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t, i) => (
                    <tr
                      key={i}
                      className="hover:bg-[#e8e8e8]"
                      style={{ borderBottom: "1px solid #eee" }}
                    >
                      <Td>{t.date}</Td>
                      <Td bold>{t.ticker}</Td>
                      <Td align="right">{t.shares.toLocaleString()}</Td>
                      <Td align="right">${fmt(t.price)}</Td>
                      <Td align="right">${fmt(t.proceeds)}</Td>
                      <Td
                        align="right"
                        bold
                        color={
                          t.realized > 0.005
                            ? "#087f23"
                            : t.realized < -0.005
                              ? "#c00"
                              : undefined
                        }
                      >
                        {t.realized === 0 ? "$0.00" : signed(t.realized)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Section title="Strategy">
            Macro swing trading with real-money stakes - small concentration of
            names per week, daily chart longer than intraday. Every close FIFO,
            every wash flagged.
            <ul className="list-disc pl-[18px] mt-[4px] space-y-[2px]">
              <li>Support / resistance + moving averages (50/200)</li>
              <li>Momentum (RSI, MACD divergence)</li>
              <li>Macro catalysts (rates, earnings windows, sector flow)</li>
              <li>
                Leveraged 2x-daily ETF exposure (IRE, IREZ, RGTZ, NBIL, METU,
                MSFU) - where most of the volatility lives and most of the
                lessons came from
              </li>
            </ul>
          </Section>

          <Section title="Top lessons from the drawdowns">
            <ul className="list-disc pl-[18px] space-y-[2px]">
              <li>
                <b>BMNR</b> (Bitmine Immersion): the biggest single-name
                lesson. Concentrated size through a sharp reversal. Now I cap
                single-name exposure on small-cap miners.
              </li>
              <li>
                <b>IRE / IREZ</b> (leveraged IREN 2x-daily): compounded both
                ways. 2x-daily products are tactical-only and sized down
                significantly going forward.
              </li>
              <li>
                <b>Wash sales track in real time</b> - ${fmt(
                  ALL_TIME.disallowed,
                  0
                )}{" "}
                of disallowed losses is a signal I was re-entering too fast.
                Cooling-off rules now built in.
              </li>
            </ul>
          </Section>

          <Section title="Why it reflects how I work">
            Before I had returns, I had a spreadsheet. Systems-first, conviction
            second, and full ownership of the L column - not just the W column.
            The broker tells the same story I tell.
          </Section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  pct,
  color,
  hint,
}: {
  label: string;
  value: string;
  pct?: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="win-sunken p-[6px] bg-white flex flex-col gap-[1px]">
      <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
        {label}
      </div>
      <div className="text-[19px] font-bold" style={{ color }}>
        {value}
        {pct && (
          <span className="text-[19px] font-normal ml-[4px]" style={{ color }}>
            ({pct})
          </span>
        )}
      </div>
      {hint && (
        <div
          className="text-[18px] italic"
          style={{ color: "var(--color-win-text-disabled)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="px-[6px] py-[2px] font-bold border-r border-[#808080] border-b border-[#808080]"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function SortTh({
  label,
  keyName,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  keyName: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = active === keyName;
  return (
    <th
      className="px-[6px] py-[2px] font-bold border-r border-[#808080] border-b border-[#808080] cursor-pointer select-none hover:bg-[#b0b0b0]"
      style={{ textAlign: align }}
      onClick={() => onClick(keyName)}
    >
      {label}
      {isActive ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold,
  color,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  bold?: boolean;
  color?: string;
}) {
  return (
    <td
      className="px-[6px] py-[1px]"
      style={{
        textAlign: align,
        fontWeight: bold ? "bold" : undefined,
        color,
      }}
    >
      {children}
    </td>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-bold text-[18px] mb-[2px]">{title}</div>
      <div>{children}</div>
    </div>
  );
}

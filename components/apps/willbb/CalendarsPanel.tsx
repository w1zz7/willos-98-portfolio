"use client";

/**
 * CalendarsPanel — Earnings calendar (next 3 months) + IPO calendar
 * (next 3 months), powered by Alpha Vantage's CSV endpoints.
 *
 * Each calendar gets its own column, sortable by date. Click a row's symbol
 * to jump to Equity Research for that ticker.
 */

import { useEffect, useMemo, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "./OpenBB";

interface EarningsRow {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: string;
  currency: string;
}

interface IPORow {
  symbol: string;
  name: string;
  ipoDate: string;
  priceRangeLow: string;
  priceRangeHigh: string;
  currency: string;
  exchange: string;
}

function fmtDateUS(s: string): string {
  if (!s) return "—";
  // AV returns YYYY-MM-DD
  const d = new Date(s + "T12:00:00");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysFromNow(s: string): number {
  if (!s) return 999;
  const d = new Date(s + "T12:00:00");
  if (isNaN(d.getTime())) return 999;
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / (24 * 3600 * 1000));
}

export default function CalendarsPanel({ onPick }: { onPick: (s: string) => void }) {
  const [earnings, setEarnings] = useState<EarningsRow[] | null>(null);
  const [earningsUnavailable, setEarningsUnavailable] = useState(false);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [ipos, setIpos] = useState<IPORow[] | null>(null);
  const [iposUnavailable, setIposUnavailable] = useState(false);
  const [iposLoading, setIposLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/markets/alpha?fn=EARNINGS_CALENDAR&horizon=3month", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: EarningsRow[]; unavailable?: boolean } | null) => {
        if (!d || d.unavailable || !d.data) setEarningsUnavailable(true);
        else setEarnings(d.data);
        setEarningsLoading(false);
      })
      .catch(() => {
        setEarningsUnavailable(true);
        setEarningsLoading(false);
      });
    fetch("/api/markets/alpha?fn=IPO_CALENDAR", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: IPORow[]; unavailable?: boolean } | null) => {
        if (!d || d.unavailable || !d.data) setIposUnavailable(true);
        else setIpos(d.data);
        setIposLoading(false);
      })
      .catch(() => {
        setIposUnavailable(true);
        setIposLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const earningsSorted = useMemo(() => {
    if (!earnings) return [];
    return [...earnings]
      .filter((e) => daysFromNow(e.reportDate) >= 0)
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }, [earnings]);

  const iposSorted = useMemo(() => {
    if (!ipos) return [];
    return [...ipos]
      .filter((e) => daysFromNow(e.ipoDate) >= 0)
      .sort((a, b) => a.ipoDate.localeCompare(b.ipoDate));
  }, [ipos]);

  return (
    <div
      className="grid h-full overflow-hidden"
      style={{
        gridTemplateColumns: "1fr 1fr",
        background: COLORS.bg,
        fontFamily: FONT_UI,
      }}
    >
      {/* Earnings Calendar */}
      <div
        className="flex flex-col min-h-0 overflow-hidden"
        style={{ borderRight: "1px solid " + COLORS.border, background: COLORS.panel }}
      >
        <div
          className="px-[14px] py-[10px] shrink-0"
          style={{ borderBottom: "1px solid " + COLORS.border, background: COLORS.panelAlt }}
        >
          <div className="flex items-baseline gap-[8px]">
            <span className="text-[14px] font-semibold" style={{ color: COLORS.up, fontFamily: FONT_UI }}>
              Earnings Calendar
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.16em]"
              style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
            >
              next 3 months · {earningsSorted.length} reports
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {earningsLoading ? (
            <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}>
              loading earnings…
            </div>
          ) : earningsUnavailable ? (
            <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textFaint }}>
              Earnings calendar unavailable. Daily AV budget may be exhausted.
            </div>
          ) : earningsSorted.length === 0 ? (
            <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textDim }}>
              No upcoming earnings in the next 3 months.
            </div>
          ) : (
            earningsSorted.map((e, i) => {
              const days = daysFromNow(e.reportDate);
              const urgent = days <= 7;
              return (
                <button
                  key={`${e.symbol}-${e.reportDate}-${i}`}
                  type="button"
                  onClick={() => onPick(e.symbol)}
                  className="w-full px-[14px] py-[8px] flex items-center gap-[10px] text-left"
                  style={{
                    background: i % 2 === 0 ? "transparent" : COLORS.panelAlt,
                    borderBottom: "1px solid " + COLORS.borderSoft,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      flexShrink: 0,
                      textAlign: "center",
                      padding: "4px 6px",
                      background: urgent ? COLORS.brand + "33" : "transparent",
                      border: "1px solid " + (urgent ? COLORS.brand : COLORS.borderSoft),
                      fontFamily: FONT_MONO,
                    }}
                  >
                    <div style={{ fontSize: 9, color: COLORS.textFaint, letterSpacing: "0.04em" }}>
                      {fmtDateUS(e.reportDate).split(",")[0]}
                    </div>
                    <div style={{ fontSize: 10, color: urgent ? COLORS.brand : COLORS.textDim, fontWeight: 700, marginTop: 1 }}>
                      D{days >= 0 ? `+${days}` : days}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, fontFamily: FONT_MONO, letterSpacing: "0.04em" }}>
                      {e.symbol}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: COLORS.textDim,
                        fontFamily: FONT_UI,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.name}
                    </div>
                  </div>
                  {e.estimate && (
                    <div style={{ fontSize: 10, color: COLORS.textDim, fontFamily: FONT_MONO, textAlign: "right", flexShrink: 0 }}>
                      <div>EST EPS</div>
                      <div style={{ color: COLORS.text, fontWeight: 700 }}>${e.estimate}</div>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* IPO Calendar */}
      <div className="flex flex-col min-h-0 overflow-hidden" style={{ background: COLORS.panel }}>
        <div
          className="px-[14px] py-[10px] shrink-0"
          style={{ borderBottom: "1px solid " + COLORS.border, background: COLORS.panelAlt }}
        >
          <div className="flex items-baseline gap-[8px]">
            <span className="text-[14px] font-semibold" style={{ color: COLORS.brand, fontFamily: FONT_UI }}>
              IPO Calendar
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.16em]"
              style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}
            >
              next 3 months · {iposSorted.length} listings
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {iposLoading ? (
            <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}>
              loading IPOs…
            </div>
          ) : iposUnavailable ? (
            <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textFaint }}>
              IPO calendar unavailable.
            </div>
          ) : iposSorted.length === 0 ? (
            <div className="px-[14px] py-[10px] text-[12px]" style={{ color: COLORS.textDim }}>
              No upcoming IPOs in the next 3 months.
            </div>
          ) : (
            iposSorted.map((e, i) => {
              const days = daysFromNow(e.ipoDate);
              const urgent = days <= 7;
              const lo = parseFloat(e.priceRangeLow);
              const hi = parseFloat(e.priceRangeHigh);
              const range =
                Number.isFinite(lo) && Number.isFinite(hi)
                  ? `$${lo.toFixed(2)} - $${hi.toFixed(2)}`
                  : "—";
              return (
                <div
                  key={`${e.symbol}-${e.ipoDate}-${i}`}
                  className="w-full px-[14px] py-[8px] flex items-center gap-[10px]"
                  style={{
                    background: i % 2 === 0 ? "transparent" : COLORS.panelAlt,
                    borderBottom: "1px solid " + COLORS.borderSoft,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      flexShrink: 0,
                      textAlign: "center",
                      padding: "4px 6px",
                      background: urgent ? COLORS.brand + "33" : "transparent",
                      border: "1px solid " + (urgent ? COLORS.brand : COLORS.borderSoft),
                      fontFamily: FONT_MONO,
                    }}
                  >
                    <div style={{ fontSize: 9, color: COLORS.textFaint, letterSpacing: "0.04em" }}>
                      {fmtDateUS(e.ipoDate).split(",")[0]}
                    </div>
                    <div style={{ fontSize: 10, color: urgent ? COLORS.brand : COLORS.textDim, fontWeight: 700, marginTop: 1 }}>
                      D{days >= 0 ? `+${days}` : days}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, fontFamily: FONT_MONO, letterSpacing: "0.04em" }}>
                      {e.symbol}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: COLORS.textDim,
                        fontFamily: FONT_UI,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.name}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textDim, fontFamily: FONT_MONO, textAlign: "right", flexShrink: 0 }}>
                    <div>{e.exchange}</div>
                    <div style={{ color: COLORS.text, fontWeight: 700 }}>{range}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

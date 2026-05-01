"use client";

/**
 * Equity Research view - comprehensive single-symbol research surface.
 *
 * Sub-tabs:
 *   Profile     · company name, sector, HQ, executives
 *   Technicals  · client-computed SMA / RSI / MACD / volume / S&R verdict
 *   Statistics  · valuation, margins, share, dividend, analyst targets
 *   Income      · annual + quarterly income statement
 *   Balance     · annual + quarterly balance sheet
 *   Cash Flow   · annual + quarterly cash-flow statement
 *   Analysts    · price-target consensus + recommendation trend + upgrades
 *   Earnings    · EPS history + next event
 *   Holders     · institutional, fund, and insider positions
 *   Dividends   · payout history + splits
 *   Options     · calls/puts chain by expiration
 *   News        · 15 latest company headlines
 *
 * Everything flows through /api/markets/equity?module=…&symbol=… - one
 * server-side proxy, Yahoo Finance + CoinGecko fallback, no API keys.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import TechnicalsView from "./TechnicalsView";
import { NewsAndSentimentView, SmartMoneyView, TranscriptView } from "./EquityAlphaViews";

// Refresh nonce - bump from EquityResearch and every useEquityModule
// re-fetches. Used by the manual "Refresh" button.
const EquityRefreshContext = createContext<number>(0);

const COLORS = {
  bg: "#151518",
  panel: "#212124",
  panelAlt: "#1f1e23",
  panelDeep: "#24242a",
  border: "#46464F",
  borderSoft: "rgba(70,70,79,0.5)",
  text: "#FFFFFF",
  textSecondary: "#EBEBED",
  textDim: "#9793b0",
  textFaint: "#8A8A90",
  up: "#5dd39e",
  down: "#f0686a",
  flat: "#9793b0",
  brand: "#33BBFF",
  brandSoft: "rgba(0,136,204,0.30)",
} as const;

const FONT_UI =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

type SubTab =
  | "profile"
  | "technicals"
  | "statistics"
  | "income"
  | "balance"
  | "cashflow"
  | "analysts"
  | "earnings"
  | "holders"
  | "smartmoney"
  | "transcript"
  | "dividends"
  | "options"
  | "news";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "technicals", label: "Technicals" },
  { id: "statistics", label: "Statistics" },
  { id: "income", label: "Income" },
  { id: "balance", label: "Balance" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "analysts", label: "Analysts" },
  { id: "earnings", label: "Earnings" },
  { id: "holders", label: "Holders" },
  { id: "smartmoney", label: "Smart Money" },
  { id: "transcript", label: "Transcript" },
  { id: "dividends", label: "Dividends" },
  { id: "options", label: "Options" },
  { id: "news", label: "News+S" },
];

interface SearchHit {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
  sector?: string;
  industry?: string;
}

// ---------- helpers ----------

function fmtBig(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n: number | null | undefined, fromRatio = false): string {
  if (n == null) return "-";
  const v = fromRatio ? n * 100 : n;
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function pctColor(n: number | null | undefined): string {
  if (n == null) return COLORS.flat;
  if (n > 0.0001) return COLORS.up;
  if (n < -0.0001) return COLORS.down;
  return COLORS.flat;
}

function fmtDate(epoch: number | null | undefined): string {
  if (epoch == null) return "-";
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------- main component ----------

export default function EquityResearch({
  symbol,
  setSymbol,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
}) {
  const [sub, setSub] = useState<SubTab>("profile");
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const refresh = () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setNonce((n) => n + 1);
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  };

  // Profile module doubles as a canary for "is upstream serving this IP?"
  // When Yahoo is rate-limiting, our seed dictionary covers the popular
  // tickers and Profile/Statistics still populate (with `source: "seed"`).
  // Show a soft note when we're on seed; show a hard banner only when even
  // seed didn't catch the ticker.
  const canary = useEquityModule<{
    symbol?: string;
    longName?: string | null;
    source?: string;
  }>(symbol, "profile");
  const upstreamDown = !!canary.error && !canary.data;
  const usingSeed = canary.data?.source === "seed";

  return (
    <EquityRefreshContext.Provider value={nonce}>
    <div className="flex flex-col h-full" style={{ background: COLORS.bg }}>
      <SymbolBar
        symbol={symbol}
        setSymbol={setSymbol}
        onRefresh={refresh}
        refreshing={refreshing}
      />
      {upstreamDown && (
        <div
          className="px-[14px] py-[6px] text-[12px] shrink-0"
          style={{
            background: "rgba(0,136,204,0.10)",
            borderBottom: "1px solid " + COLORS.brand,
            color: COLORS.text,
            fontFamily: FONT_UI,
          }}
        >
          ⚠ {symbol} isn&apos;t in our snapshot dictionary and Yahoo is
          rate-limiting this server. Try a major ticker (NVDA, AAPL, MSFT,
          GOOG, AMZN, META, TSLA, AMD, INTC, HOOD, BMNR) or come back when
          the cooldown clears. The TradingView chart on Technicals stays
          live regardless.
        </div>
      )}
      {usingSeed && !upstreamDown && (
        <div
          className="px-[14px] py-[5px] text-[11px] shrink-0"
          style={{
            background: COLORS.panelDeep,
            borderBottom: "1px solid " + COLORS.borderSoft,
            color: COLORS.textDim,
            fontFamily: FONT_UI,
          }}
        >
          Showing snapshot data for {symbol} - upstream rate-limited from
          this server. Numbers refresh once the cooldown clears.
        </div>
      )}
      <SubTabBar sub={sub} setSub={setSub} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sub === "profile" && <ProfileView symbol={symbol} />}
        {sub === "technicals" && <TechnicalsView symbol={symbol} />}
        {sub === "statistics" && <StatisticsView symbol={symbol} />}
        {sub === "income" && <FinancialView symbol={symbol} module="income" />}
        {sub === "balance" && <FinancialView symbol={symbol} module="balance" />}
        {sub === "cashflow" && <FinancialView symbol={symbol} module="cashflow" />}
        {sub === "analysts" && <AnalystsView symbol={symbol} />}
        {sub === "earnings" && <EarningsView symbol={symbol} />}
        {sub === "holders" && <HoldersView symbol={symbol} />}
        {sub === "smartmoney" && <SmartMoneyView symbol={symbol} />}
        {sub === "transcript" && <TranscriptView symbol={symbol} />}
        {sub === "dividends" && <DividendsView symbol={symbol} />}
        {sub === "options" && <OptionsView symbol={symbol} />}
        {sub === "news" && <NewsAndSentimentView symbol={symbol} />}
      </div>
    </div>
    </EquityRefreshContext.Provider>
  );
}

// ---------- symbol search bar ----------

function SymbolBar({
  symbol,
  setSymbol,
  onRefresh,
  refreshing,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search.
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(
          "/api/markets/equity?module=search&q=" + encodeURIComponent(query.trim())
        );
        if (!res.ok) return;
        const data = (await res.json()) as { quotes: SearchHit[] };
        setHits(data.quotes ?? []);
        setOpen(true);
      } catch {
        /* swallow */
      }
    }, 220);
    return () => window.clearTimeout(id);
  }, [query]);

  function pick(s: SearchHit) {
    if (!s.symbol) return;
    setSymbol(s.symbol);
    setQuery("");
    setHits([]);
    setOpen(false);
  }

  return (
    <div
      className="px-[14px] py-[10px] flex items-center gap-[12px] shrink-0"
      style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
    >
      <div className="flex items-baseline gap-[8px]">
        <span
          className="text-[10px] uppercase tracking-[0.16em]"
          style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
        >
          Symbol
        </span>
        <span
          className="text-[18px] font-semibold tabular-nums"
          style={{ color: COLORS.text, fontFamily: FONT_MONO }}
        >
          {symbol}
        </span>
      </div>
      <div ref={ref} className="relative flex-1 max-w-[420px]">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => hits.length && setOpen(true)}
          placeholder="Search ticker or company name…"
          className="w-full px-[12px] py-[6px] outline-none"
          style={{
            background: COLORS.panelDeep,
            border: "1px solid " + COLORS.borderSoft,
            color: COLORS.text,
            fontFamily: FONT_MONO,
            fontSize: 13,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              setSymbol(query.trim().toUpperCase());
              setQuery("");
              setOpen(false);
            }
          }}
        />
        {open && hits.length > 0 && (
          <div
            className="absolute left-0 right-0 z-10 max-h-[260px] overflow-y-auto"
            style={{
              top: "calc(100% + 4px)",
              background: COLORS.panel,
              border: "1px solid " + COLORS.border,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {hits.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(h)}
                className="w-full text-left px-[12px] py-[6px] flex items-baseline justify-between gap-[10px]"
                style={{ borderBottom: "1px solid " + COLORS.borderSoft }}
              >
                <span style={{ fontFamily: FONT_MONO, color: COLORS.brand, fontWeight: 600 }}>
                  {h.symbol}
                </span>
                <span
                  className="text-[12px] flex-1 truncate"
                  style={{ color: COLORS.text, fontFamily: FONT_UI }}
                >
                  {h.shortname ?? h.longname ?? "-"}
                </span>
                <span
                  className="text-[10px] uppercase"
                  style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
                >
                  {h.quoteType} · {h.exchange}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="px-[10px] py-[5px] flex items-center gap-[6px]"
        style={{
          color: refreshing ? COLORS.textFaint : COLORS.text,
          background: COLORS.panelDeep,
          border: "1px solid " + COLORS.borderSoft,
          cursor: refreshing ? "default" : "pointer",
          fontFamily: FONT_UI,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
        title="Force refresh - re-fetch every research module"
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            transform: refreshing ? "rotate(360deg)" : "rotate(0deg)",
            transition: refreshing ? "transform 600ms linear" : "transform 200ms",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ⟳
        </span>
        {refreshing ? "loading" : "refresh"}
      </button>
      <span
        className="text-[10px] uppercase tracking-[0.14em]"
        style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
      >
        equity research
      </span>
    </div>
  );
}

// ---------- sub-tab bar ----------

function SubTabBar({ sub, setSub }: { sub: SubTab; setSub: (s: SubTab) => void }) {
  return (
    <div
      className="flex shrink-0 overflow-x-auto"
      style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
    >
      {SUB_TABS.map((t) => {
        const active = t.id === sub;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className="px-[14px] py-[8px] text-[12px] tracking-[0.04em] whitespace-nowrap"
            style={{
              color: active ? COLORS.text : COLORS.textDim,
              borderBottom: active ? "2px solid " + COLORS.brand : "2px solid transparent",
              background: "transparent",
              fontWeight: active ? 600 : 500,
              fontFamily: FONT_UI,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- shared module fetcher hook ----------
//
// Client-side stale-while-revalidate cache for /api/markets/equity calls.
// Without this, clicking a sub-tab (Statistics → Income → Statistics)
// re-fetches every time even though the data hasn't changed. Module data
// (statistics, income, balance, etc.) updates at most quarterly so a 5-min
// stale window is plenty fresh while making sub-tab navigation instant.
//
// Keyed on (symbol, moduleName, ...deps). LRU-bounded at 64 entries —
// covers ~5 symbols × 13 modules. Bumping the refresh nonce (the user
// clicking the manual Refresh button) bypasses the cache for all modules
// of the active symbol; no per-module invalidation needed because the
// nonce changes the cache key indirectly via the deps array.
const equityCache = new Map<string, { data: unknown; at: number }>();
const EQUITY_STALE_MS = 5 * 60_000; // 5 min — equity research is quarterly data
const EQUITY_MAX_ENTRIES = 64;
const equityInflight = new Map<string, Promise<unknown>>();

function equityCacheKey(symbol: string, moduleName: string, deps: unknown[], nonce: number): string {
  return `${symbol.toUpperCase()}|${moduleName}|${deps.join("|")}|${nonce}`;
}
function equityCacheTouch(key: string, value: { data: unknown; at: number }) {
  equityCache.delete(key);
  equityCache.set(key, value);
  while (equityCache.size > EQUITY_MAX_ENTRIES) {
    const oldest = equityCache.keys().next().value;
    if (oldest) equityCache.delete(oldest);
    else break;
  }
}

function useEquityModule<T>(symbol: string, moduleName: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number>(0);
  const nonce = useContext(EquityRefreshContext);
  useEffect(() => {
    if (!symbol) return;
    const key = equityCacheKey(symbol, moduleName, deps, nonce);

    // Synchronous cache read — instant render of any cached entry.
    const cached = equityCache.get(key);
    if (cached) {
      setData(cached.data as T);
      setFetchedAt(cached.at);
      setError(null);
      // If still fresh, no network round-trip needed.
      if (Date.now() - cached.at < EQUITY_STALE_MS) {
        setLoading(false);
        return;
      }
    } else {
      // Only show loading badge on a true cache miss — sub-tab round-trips
      // (where stale data is already on-screen) refresh silently.
      setLoading(true);
      setError(null);
    }

    let cancelled = false;
    const params = new URLSearchParams({ module: moduleName, symbol });
    for (const d of deps) {
      if (typeof d === "string" && d) params.append(moduleName === "options" ? "expiration" : "extra", d);
    }
    const url = "/api/markets/equity?" + params.toString();

    // In-flight dedup — concurrent sub-tab mounts for the same key share one fetch.
    let promise = equityInflight.get(key);
    if (!promise) {
      promise = fetch(url)
        .then(async (r) => {
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error ?? `HTTP ${r.status}`);
          }
          return r.json();
        })
        .then((d) => {
          if ((d as { error?: string }).error) throw new Error((d as { error: string }).error);
          equityCacheTouch(key, { data: d, at: Date.now() });
          return d;
        })
        .finally(() => {
          equityInflight.delete(key);
        });
      equityInflight.set(key, promise);
    }

    promise
      .then((d) => {
        if (!cancelled) {
          setData(d as T);
          setFetchedAt(Date.now());
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, moduleName, nonce, ...deps]);
  return { data, error, loading, fetchedAt };
}

// ---------- shared layout primitives ----------

function Panel({ children, title, className = "" }: { children: React.ReactNode; title: string; className?: string }) {
  return (
    <div className={className}>
      <div
        className="text-[10px] uppercase tracking-[0.16em] mb-[6px]"
        style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
      >
        {title}
      </div>
      <div style={{ background: COLORS.panel, border: "1px solid " + COLORS.border }}>
        {children}
      </div>
    </div>
  );
}

function StatList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  // Pad to a multiple of 3 so the last row of the 3-col grid never shows
  // the dark gap-color through empty slots.
  const padCount = (3 - (rows.length % 3)) % 3;
  return (
    <div
      className="grid gap-[1px]"
      style={{ gridTemplateColumns: "1fr 1fr 1fr", background: COLORS.border }}
    >
      {rows.map(([k, v], i) => (
        <div
          key={i}
          className="px-[12px] py-[8px]"
          style={{ background: COLORS.panel }}
        >
          <div
            className="text-[10px] uppercase tracking-[0.14em]"
            style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
          >
            {k}
          </div>
          <div
            className="text-[13px] mt-[2px] tabular-nums"
            style={{ color: COLORS.text, fontFamily: FONT_MONO }}
          >
            {v}
          </div>
        </div>
      ))}
      {Array.from({ length: padCount }).map((_, i) => (
        <div
          key={`pad-${i}`}
          className="px-[12px] py-[8px]"
          style={{ background: COLORS.panel }}
          aria-hidden
        />
      ))}
    </div>
  );
}

function LoadingShell({ label }: { label: string }) {
  return (
    <div className="px-[16px] py-[14px] text-[13px]" style={{ color: COLORS.textDim, fontFamily: FONT_UI }}>
      loading {label}…
    </div>
  );
}

function ErrorShell({ error }: { error: string }) {
  return (
    <div
      className="m-[14px] px-[12px] py-[8px] text-[12px]"
      style={{
        color: COLORS.down,
        background: "rgba(240,104,106,0.08)",
        border: "1px solid " + COLORS.down,
        fontFamily: FONT_UI,
      }}
    >
      ⚠ {error}
    </div>
  );
}

// ---------- Profile ----------

interface ProfilePayload {
  longName: string | null;
  shortName: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  summary: string | null;
  employees: number | null;
  country: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  exchange: string | null;
  currency: string | null;
  marketCap: number | null;
  quoteType: string | null;
  officers: Array<{
    name?: string;
    title?: string;
    age?: number | null;
    yearBorn?: number | null;
    totalPay?: number | null;
  }>;
}

function ProfileView({ symbol }: { symbol: string }) {
  const { data, error, loading } = useEquityModule<ProfilePayload>(symbol, "profile");
  if (loading) return <LoadingShell label="profile" />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;
  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      <div>
        <div className="text-[22px] font-semibold" style={{ color: COLORS.text, fontFamily: FONT_UI }}>
          {data.longName ?? data.shortName ?? symbol}
        </div>
        <div className="text-[13px] mt-[2px]" style={{ color: COLORS.textDim, fontFamily: FONT_UI }}>
          {[data.sector, data.industry, data.exchange].filter(Boolean).join(" · ")}
        </div>
        {data.website && (
          <a
            href={data.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] mt-[4px] inline-block"
            style={{ color: COLORS.brand, fontFamily: FONT_MONO }}
          >
            {data.website} ↗
          </a>
        )}
      </div>

      <Panel title="Overview">
        <StatList
          rows={[
            ["Market Cap", fmtBig(data.marketCap)],
            ["Employees", fmtBig(data.employees)],
            ["Quote Type", data.quoteType ?? "-"],
            ["Country", data.country ?? "-"],
            ["HQ", [data.city, data.state, data.country].filter(Boolean).join(", ") || "-"],
            ["Phone", data.phone ?? "-"],
          ]}
        />
      </Panel>

      {data.summary && (
        <Panel title="Business Summary">
          <p
            className="px-[14px] py-[10px] text-[13px] leading-[1.6]"
            style={{ color: COLORS.textSecondary, fontFamily: FONT_UI }}
          >
            {data.summary}
          </p>
        </Panel>
      )}

      {data.officers.length > 0 && (
        <Panel title="Key Executives">
          <div className="grid gap-[1px]" style={{ gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", background: COLORS.border }}>
            <HeaderCell>Name</HeaderCell>
            <HeaderCell>Title</HeaderCell>
            <HeaderCell align="right">Age</HeaderCell>
            <HeaderCell align="right">Born</HeaderCell>
            <HeaderCell align="right">Total Pay</HeaderCell>
            {data.officers.slice(0, 12).map((o, i) => (
              <RowFrag
                key={i}
                cells={[
                  <span key="n" style={{ color: COLORS.text }}>{o.name ?? "-"}</span>,
                  <span key="t" style={{ color: COLORS.textDim }}>{o.title ?? "-"}</span>,
                  <span key="a" style={{ color: COLORS.text }}>{o.age ?? "-"}</span>,
                  <span key="b" style={{ color: COLORS.text }}>{o.yearBorn ?? "-"}</span>,
                  <span key="p" style={{ color: COLORS.text }}>${fmtBig(o.totalPay)}</span>,
                ]}
                rightAligned={[2, 3, 4]}
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ---------- Statistics ----------

interface StatisticsPayload {
  marketCap: number | null;
  enterpriseValue: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseToRevenue: number | null;
  enterpriseToEbitda: number | null;
  profitMargin: number | null;
  operatingMargin: number | null;
  grossMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  revenueTTM: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  netIncomeTTM: number | null;
  eps: number | null;
  epsForward: number | null;
  bookValue: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  sharesShort: number | null;
  shortRatio: number | null;
  shortPercentOfFloat: number | null;
  heldPercentInsiders: number | null;
  heldPercentInstitutions: number | null;
  beta: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  averageVolume10Day: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  targetMeanPrice: number | null;
  targetMedianPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
}

function StatisticsView({ symbol }: { symbol: string }) {
  const { data, error, loading } = useEquityModule<StatisticsPayload>(symbol, "statistics");
  if (loading) return <LoadingShell label="key statistics" />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;
  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      <Panel title="Valuation">
        <StatList
          rows={[
            ["Market Cap", fmtBig(data.marketCap)],
            ["Enterprise Value", fmtBig(data.enterpriseValue)],
            ["P/E (Trailing)", fmtNum(data.trailingPE)],
            ["P/E (Forward)", fmtNum(data.forwardPE)],
            ["PEG Ratio", fmtNum(data.pegRatio)],
            ["Price/Book", fmtNum(data.priceToBook)],
            ["Price/Sales", fmtNum(data.priceToSales)],
            ["EV/Revenue", fmtNum(data.enterpriseToRevenue)],
            ["EV/EBITDA", fmtNum(data.enterpriseToEbitda)],
          ]}
        />
      </Panel>

      <Panel title="Profitability & Margins">
        <StatList
          rows={[
            ["Gross Margin", fmtPct(data.grossMargin, true)],
            ["Operating Margin", fmtPct(data.operatingMargin, true)],
            ["Profit Margin", fmtPct(data.profitMargin, true)],
            ["Return on Equity", fmtPct(data.returnOnEquity, true)],
            ["Return on Assets", fmtPct(data.returnOnAssets, true)],
            ["EPS (TTM)", fmtNum(data.eps)],
            ["EPS (Forward)", fmtNum(data.epsForward)],
            ["Book Value/Share", fmtNum(data.bookValue)],
            ["Beta (5Y)", fmtNum(data.beta)],
          ]}
        />
      </Panel>

      <Panel title="Income & Cash">
        <StatList
          rows={[
            ["Revenue (TTM)", fmtBig(data.revenueTTM)],
            ["Gross Profit", fmtBig(data.grossProfit)],
            ["EBITDA", fmtBig(data.ebitda)],
            ["Net Income (TTM)", fmtBig(data.netIncomeTTM)],
            ["Total Cash", fmtBig(data.totalCash)],
            ["Total Debt", fmtBig(data.totalDebt)],
            ["Debt/Equity", fmtNum(data.debtToEquity)],
            ["Current Ratio", fmtNum(data.currentRatio)],
            ["Quick Ratio", fmtNum(data.quickRatio)],
          ]}
        />
      </Panel>

      <Panel title="Shares">
        <StatList
          rows={[
            ["Shares Outstanding", fmtBig(data.sharesOutstanding)],
            ["Float", fmtBig(data.floatShares)],
            ["Insider Ownership", fmtPct(data.heldPercentInsiders, true)],
            ["Institutional Ownership", fmtPct(data.heldPercentInstitutions, true)],
            ["Short % of Float", fmtPct(data.shortPercentOfFloat, true)],
            ["Short Ratio", fmtNum(data.shortRatio)],
            ["Avg Volume (10d)", fmtBig(data.averageVolume10Day)],
            ["50d MA", fmtNum(data.fiftyDayAverage)],
            ["200d MA", fmtNum(data.twoHundredDayAverage)],
          ]}
        />
      </Panel>

      {(data.dividendRate || data.dividendYield) && (
        <Panel title="Dividend">
          <StatList
            rows={[
              ["Dividend Yield", fmtPct(data.dividendYield, true)],
              ["Dividend Rate", fmtNum(data.dividendRate)],
              ["Payout Ratio", fmtPct(data.payoutRatio, true)],
            ]}
          />
        </Panel>
      )}

      {data.numberOfAnalystOpinions && (
        <Panel title="Analyst Targets">
          <StatList
            rows={[
              ["Target Mean", fmtNum(data.targetMeanPrice)],
              ["Target Median", fmtNum(data.targetMedianPrice)],
              ["Target High", fmtNum(data.targetHighPrice)],
              ["Target Low", fmtNum(data.targetLowPrice)],
              ["Analyst Count", String(data.numberOfAnalystOpinions ?? "-")],
              ["Recommendation", data.recommendationKey ?? "-"],
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

// ---------- Financial statements ----------

interface FinancialPayload {
  fields: string[];
  annual: Array<{ endDate: string; values: Record<string, number | null> }>;
  quarterly: Array<{ endDate: string; values: Record<string, number | null> }>;
}

function FinancialView({
  symbol,
  module,
}: {
  symbol: string;
  module: "income" | "balance" | "cashflow";
}) {
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const { data, error, loading } = useEquityModule<FinancialPayload>(symbol, module);
  if (loading) return <LoadingShell label={module} />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;
  const rows = period === "annual" ? data.annual : data.quarterly;
  return (
    <div className="px-[16px] py-[14px]">
      <div className="flex items-center justify-between mb-[10px]">
        <div
          className="text-[10px] uppercase tracking-[0.16em]"
          style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
        >
          {module === "income"
            ? "Income Statement"
            : module === "balance"
            ? "Balance Sheet"
            : "Cash Flow Statement"}
        </div>
        <div style={{ border: "1px solid " + COLORS.border }} className="flex">
          {(["annual", "quarterly"] as const).map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="px-[12px] py-[5px] text-[11px] uppercase tracking-[0.08em]"
                style={{
                  color: active ? COLORS.text : COLORS.textDim,
                  background: active ? COLORS.brandSoft : "transparent",
                  borderRight: "1px solid " + COLORS.border,
                  fontFamily: FONT_UI,
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: COLORS.textDim }}>
          No {period} data available.
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ border: "1px solid " + COLORS.border }}>
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.panelDeep }}>
                <th
                  className="text-left px-[12px] py-[6px]"
                  style={{
                    color: COLORS.textFaint,
                    fontFamily: FONT_UI,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontSize: 10,
                    borderBottom: "1px solid " + COLORS.border,
                  }}
                >
                  Line Item
                </th>
                {rows.map((r) => (
                  <th
                    key={r.endDate}
                    className="text-right px-[12px] py-[6px] tabular-nums"
                    style={{
                      color: COLORS.textFaint,
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      borderBottom: "1px solid " + COLORS.border,
                      borderLeft: "1px solid " + COLORS.borderSoft,
                    }}
                  >
                    {r.endDate}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.fields.map((f) => (
                <tr key={f}>
                  <td
                    className="px-[12px] py-[5px]"
                    style={{
                      color: COLORS.text,
                      borderBottom: "1px solid " + COLORS.borderSoft,
                      fontFamily: FONT_UI,
                    }}
                  >
                    {humanizeField(f)}
                  </td>
                  {rows.map((r) => (
                    <td
                      key={r.endDate + f}
                      className="text-right px-[12px] py-[5px] tabular-nums"
                      style={{
                        color: COLORS.text,
                        borderBottom: "1px solid " + COLORS.borderSoft,
                        borderLeft: "1px solid " + COLORS.borderSoft,
                        fontFamily: FONT_MONO,
                      }}
                    >
                      {fmtBig(r.values[f])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function humanizeField(s: string): string {
  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Analysts ----------

interface AnalystsPayload {
  target: {
    mean: number | null;
    median: number | null;
    high: number | null;
    low: number | null;
    analysts: number | null;
    recommendationKey: string | null;
    recommendationMean: number | null;
  };
  trend: Array<{
    period: string | undefined;
    strongBuy: number | null;
    buy: number | null;
    hold: number | null;
    sell: number | null;
    strongSell: number | null;
  }>;
  upgrades: Array<{
    firm?: string;
    toGrade?: string;
    fromGrade?: string;
    action?: string;
    date: string | null;
  }>;
}

function AnalystsView({ symbol }: { symbol: string }) {
  const { data, error, loading } = useEquityModule<AnalystsPayload>(symbol, "analysts");
  if (loading) return <LoadingShell label="analyst coverage" />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;
  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      <Panel title="Price Target Consensus">
        <StatList
          rows={[
            ["Target Mean", fmtNum(data.target.mean)],
            ["Target Median", fmtNum(data.target.median)],
            ["Target High", fmtNum(data.target.high)],
            ["Target Low", fmtNum(data.target.low)],
            ["Recommendation", data.target.recommendationKey ?? "-"],
            ["Mean Score", fmtNum(data.target.recommendationMean)],
            ["# Analysts", String(data.target.analysts ?? "-")],
          ]}
        />
      </Panel>

      {data.trend.length > 0 && (
        <Panel title="Recommendation Trend">
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.panelDeep }}>
                {["Period", "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"].map((h) => (
                  <th
                    key={h}
                    className="text-right px-[12px] py-[6px]"
                    style={{
                      color: COLORS.textFaint,
                      fontFamily: FONT_UI,
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      borderBottom: "1px solid " + COLORS.border,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.trend.map((t, i) => (
                <tr key={i}>
                  <td className="px-[12px] py-[5px]" style={{ color: COLORS.text, fontFamily: FONT_UI, borderBottom: "1px solid " + COLORS.borderSoft }}>
                    {t.period ?? "-"}
                  </td>
                  {[t.strongBuy, t.buy, t.hold, t.sell, t.strongSell].map((v, j) => (
                    <td
                      key={j}
                      className="text-right px-[12px] py-[5px] tabular-nums"
                      style={{
                        color: COLORS.text,
                        fontFamily: FONT_MONO,
                        borderBottom: "1px solid " + COLORS.borderSoft,
                      }}
                    >
                      {v ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {data.upgrades.length > 0 && (
        <Panel title="Analyst Actions (Recent)">
          <div className="grid gap-[1px]" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", background: COLORS.border }}>
            <HeaderCell>Date</HeaderCell>
            <HeaderCell>Firm</HeaderCell>
            <HeaderCell>From</HeaderCell>
            <HeaderCell>To</HeaderCell>
            <HeaderCell>Action</HeaderCell>
            {data.upgrades.map((u, i) => (
              <RowFrag
                key={i}
                cells={[
                  <span key="d" style={{ color: COLORS.text, fontFamily: FONT_MONO }}>{u.date ?? "-"}</span>,
                  <span key="f" style={{ color: COLORS.text }}>{u.firm ?? "-"}</span>,
                  <span key="fg" style={{ color: COLORS.textDim }}>{u.fromGrade ?? "-"}</span>,
                  <span key="tg" style={{ color: COLORS.text, fontWeight: 600 }}>{u.toGrade ?? "-"}</span>,
                  <span key="a" style={{ color: COLORS.brand }}>{u.action ?? "-"}</span>,
                ]}
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ---------- Earnings ----------

interface EarningsPayload {
  next: {
    date: string[];
    epsAvg: number | null;
    epsHigh: number | null;
    epsLow: number | null;
    revenueAvg: number | null;
  };
  quarterly: Array<{
    quarter: string | null;
    period?: string;
    estimate: number | null;
    actual: number | null;
    surprisePct: number | null;
  }>;
  annual: Array<{ year: number | null; revenue: number | null; earnings: number | null }>;
}

function EarningsView({ symbol }: { symbol: string }) {
  const { data, error, loading } = useEquityModule<EarningsPayload>(symbol, "earnings");
  if (loading) return <LoadingShell label="earnings" />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;
  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      <Panel title="Next Earnings">
        <StatList
          rows={[
            ["Date(s)", data.next.date.length ? data.next.date.join(" / ") : "-"],
            ["EPS Avg", fmtNum(data.next.epsAvg)],
            ["EPS High", fmtNum(data.next.epsHigh)],
            ["EPS Low", fmtNum(data.next.epsLow)],
            ["Revenue Avg", fmtBig(data.next.revenueAvg)],
          ]}
        />
      </Panel>

      <Panel title="EPS History (Quarterly)">
        <div className="grid gap-[1px]" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", background: COLORS.border }}>
          <HeaderCell>Quarter</HeaderCell>
          <HeaderCell>Period</HeaderCell>
          <HeaderCell align="right">Estimate</HeaderCell>
          <HeaderCell align="right">Actual</HeaderCell>
          <HeaderCell align="right">Surprise</HeaderCell>
          {data.quarterly.map((q, i) => (
            <RowFrag
              key={i}
              cells={[
                <span key="q" style={{ color: COLORS.text, fontFamily: FONT_MONO }}>{q.quarter ?? "-"}</span>,
                <span key="p" style={{ color: COLORS.textDim }}>{q.period ?? "-"}</span>,
                <span key="e" style={{ color: COLORS.text }}>{fmtNum(q.estimate)}</span>,
                <span key="a" style={{ color: COLORS.text }}>{fmtNum(q.actual)}</span>,
                <span key="s" style={{ color: pctColor(q.surprisePct) }}>{fmtPct(q.surprisePct)}</span>,
              ]}
              rightAligned={[2, 3, 4]}
            />
          ))}
        </div>
      </Panel>

      {data.annual.length > 0 && (
        <Panel title="Revenue & Earnings (Annual)">
          <div className="grid gap-[1px]" style={{ gridTemplateColumns: "1fr 1fr 1fr", background: COLORS.border }}>
            <HeaderCell>Year</HeaderCell>
            <HeaderCell align="right">Revenue</HeaderCell>
            <HeaderCell align="right">Earnings</HeaderCell>
            {data.annual.map((y, i) => (
              <RowFrag
                key={i}
                cells={[
                  <span key="y" style={{ color: COLORS.text, fontFamily: FONT_MONO }}>{y.year ?? "-"}</span>,
                  <span key="r" style={{ color: COLORS.text }}>${fmtBig(y.revenue)}</span>,
                  <span key="e" style={{ color: COLORS.text }}>${fmtBig(y.earnings)}</span>,
                ]}
                rightAligned={[1, 2]}
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ---------- Holders (institutional + insider) ----------

interface InstitutionalPayload {
  institutional: Array<{
    organization?: string;
    pctHeld: number | null;
    position: number | null;
    value: number | null;
    reportDate: string | null;
  }>;
  funds: Array<{
    organization?: string;
    pctHeld: number | null;
    position: number | null;
    value: number | null;
    reportDate: string | null;
  }>;
}

interface InsiderPayload {
  transactions: Array<{
    name?: string;
    relation?: string;
    transactionText?: string;
    shares: number | null;
    value: number | null;
    date: string | null;
  }>;
  holders: Array<{
    name?: string;
    relation?: string;
    mostRecent: string | null;
    shares: number | null;
    value: number | null;
  }>;
  netActivity: {
    buyInfoShares: number | null;
    buyInfoCount: number | null;
    sellInfoShares: number | null;
    sellInfoCount: number | null;
    netInfoShares: number | null;
    netInfoCount: number | null;
    totalInsiderShares: number | null;
  };
}

function HoldersView({ symbol }: { symbol: string }) {
  const inst = useEquityModule<InstitutionalPayload>(symbol, "institutional");
  const ins = useEquityModule<InsiderPayload>(symbol, "insider");
  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      {inst.loading && <LoadingShell label="institutional holders" />}
      {inst.error && <ErrorShell error={inst.error} />}
      {inst.data?.institutional && inst.data.institutional.length > 0 && (
        <Panel title="Top Institutional Holders">
          <div className="grid gap-[1px]" style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr", background: COLORS.border }}>
            <HeaderCell>Organization</HeaderCell>
            <HeaderCell align="right">% Held</HeaderCell>
            <HeaderCell align="right">Shares</HeaderCell>
            <HeaderCell align="right">Value</HeaderCell>
            <HeaderCell align="right">Report Date</HeaderCell>
            {inst.data.institutional.map((o, i) => (
              <RowFrag
                key={i}
                cells={[
                  <span key="o" style={{ color: COLORS.text }}>{o.organization ?? "-"}</span>,
                  <span key="p" style={{ color: COLORS.text }}>{fmtPct(o.pctHeld, true)}</span>,
                  <span key="s" style={{ color: COLORS.text }}>{fmtBig(o.position)}</span>,
                  <span key="v" style={{ color: COLORS.text }}>${fmtBig(o.value)}</span>,
                  <span key="d" style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}>{o.reportDate ?? "-"}</span>,
                ]}
                rightAligned={[1, 2, 3, 4]}
              />
            ))}
          </div>
        </Panel>
      )}
      {inst.data?.funds && inst.data.funds.length > 0 && (
        <Panel title="Top Mutual Fund Holders">
          <div className="grid gap-[1px]" style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr", background: COLORS.border }}>
            <HeaderCell>Fund</HeaderCell>
            <HeaderCell align="right">% Held</HeaderCell>
            <HeaderCell align="right">Shares</HeaderCell>
            <HeaderCell align="right">Value</HeaderCell>
            <HeaderCell align="right">Report Date</HeaderCell>
            {inst.data.funds.map((o, i) => (
              <RowFrag
                key={i}
                cells={[
                  <span key="o" style={{ color: COLORS.text }}>{o.organization ?? "-"}</span>,
                  <span key="p" style={{ color: COLORS.text }}>{fmtPct(o.pctHeld, true)}</span>,
                  <span key="s" style={{ color: COLORS.text }}>{fmtBig(o.position)}</span>,
                  <span key="v" style={{ color: COLORS.text }}>${fmtBig(o.value)}</span>,
                  <span key="d" style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}>{o.reportDate ?? "-"}</span>,
                ]}
                rightAligned={[1, 2, 3, 4]}
              />
            ))}
          </div>
        </Panel>
      )}

      {ins.loading && <LoadingShell label="insider activity" />}
      {ins.error && <ErrorShell error={ins.error} />}
      {ins.data && (
        <>
          <Panel title="Net Insider Activity (6M)">
            <StatList
              rows={[
                ["Buys (shares)", fmtBig(ins.data.netActivity.buyInfoShares)],
                ["Buy Filings", fmtBig(ins.data.netActivity.buyInfoCount)],
                ["Sells (shares)", fmtBig(ins.data.netActivity.sellInfoShares)],
                ["Sell Filings", fmtBig(ins.data.netActivity.sellInfoCount)],
                ["Net (shares)", fmtBig(ins.data.netActivity.netInfoShares)],
                ["Net Filings", fmtBig(ins.data.netActivity.netInfoCount)],
                ["Total Insider Shares", fmtBig(ins.data.netActivity.totalInsiderShares)],
              ]}
            />
          </Panel>
          {ins.data.transactions.length > 0 && (
            <Panel title="Insider Transactions">
              <div className="grid gap-[1px]" style={{ gridTemplateColumns: "1fr 2fr 1fr 2fr 1fr 1fr", background: COLORS.border }}>
                <HeaderCell>Date</HeaderCell>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Role</HeaderCell>
                <HeaderCell>Action</HeaderCell>
                <HeaderCell align="right">Shares</HeaderCell>
                <HeaderCell align="right">Value</HeaderCell>
                {ins.data.transactions.map((t, i) => (
                  <RowFrag
                    key={i}
                    cells={[
                      <span key="d" style={{ color: COLORS.text, fontFamily: FONT_MONO }}>{t.date ?? "-"}</span>,
                      <span key="n" style={{ color: COLORS.text }}>{t.name ?? "-"}</span>,
                      <span key="r" style={{ color: COLORS.textDim }}>{t.relation ?? "-"}</span>,
                      <span key="a" style={{ color: COLORS.text }}>{t.transactionText ?? "-"}</span>,
                      <span key="s" style={{ color: COLORS.text }}>{fmtBig(t.shares)}</span>,
                      <span key="v" style={{ color: COLORS.text }}>${fmtBig(t.value)}</span>,
                    ]}
                    rightAligned={[4, 5]}
                  />
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Dividends + Splits ----------

interface DividendsPayload {
  dividends: Array<{ date: string | null; amount: number | null }>;
}

interface SplitsPayload {
  splits: Array<{ date: string | null; ratio?: string; numerator: number | null; denominator: number | null }>;
}

function DividendsView({ symbol }: { symbol: string }) {
  const div = useEquityModule<DividendsPayload>(symbol, "dividends");
  const sp = useEquityModule<SplitsPayload>(symbol, "splits");
  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      {div.loading && <LoadingShell label="dividends" />}
      {div.error && <ErrorShell error={div.error} />}
      {div.data && (
        <Panel title="Historical Dividends">
          {div.data.dividends.length === 0 ? (
            <div className="px-[14px] py-[10px] text-[13px]" style={{ color: COLORS.textDim }}>
              No dividend history.
            </div>
          ) : (
            <div className="grid gap-[1px]" style={{ gridTemplateColumns: "1fr 1fr", background: COLORS.border }}>
              <HeaderCell>Ex-Date</HeaderCell>
              <HeaderCell align="right">Amount</HeaderCell>
              {div.data.dividends.map((d, i) => (
                <RowFrag
                  key={i}
                  cells={[
                    <span key="d" style={{ color: COLORS.text, fontFamily: FONT_MONO }}>{d.date ?? "-"}</span>,
                    <span key="a" style={{ color: COLORS.text }}>${fmtNum(d.amount, 4)}</span>,
                  ]}
                  rightAligned={[1]}
                />
              ))}
            </div>
          )}
        </Panel>
      )}
      {sp.loading && <LoadingShell label="splits" />}
      {sp.data && (
        <Panel title="Historical Splits">
          {sp.data.splits.length === 0 ? (
            <div className="px-[14px] py-[10px] text-[13px]" style={{ color: COLORS.textDim }}>
              No split history.
            </div>
          ) : (
            <div className="grid gap-[1px]" style={{ gridTemplateColumns: "1fr 1fr", background: COLORS.border }}>
              <HeaderCell>Date</HeaderCell>
              <HeaderCell align="right">Ratio</HeaderCell>
              {sp.data.splits.map((s, i) => (
                <RowFrag
                  key={i}
                  cells={[
                    <span key="d" style={{ color: COLORS.text, fontFamily: FONT_MONO }}>{s.date ?? "-"}</span>,
                    <span key="r" style={{ color: COLORS.text }}>{s.ratio ?? `${s.numerator ?? "?"}:${s.denominator ?? "?"}`}</span>,
                  ]}
                  rightAligned={[1]}
                />
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

// ---------- Options ----------

interface OptionsPayload {
  expirations: string[];
  expiration: string | null;
  calls: Array<{
    contractSymbol?: string;
    strike: number | null;
    lastPrice: number | null;
    bid: number | null;
    ask: number | null;
    volume: number | null;
    openInterest: number | null;
    impliedVolatility: number | null;
    inTheMoney?: boolean;
  }>;
  puts: OptionsPayload["calls"];
}

function OptionsView({ symbol }: { symbol: string }) {
  const [exp, setExp] = useState<string>("");
  const { data, error, loading } = useEquityModule<OptionsPayload>(symbol, "options", [exp]);
  if (loading && !data) return <LoadingShell label="options chain" />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;

  return (
    <div className="px-[16px] py-[14px] space-y-[12px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <span
          className="text-[10px] uppercase tracking-[0.16em]"
          style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
        >
          Expiration
        </span>
        {data.expirations.slice(0, 12).map((e) => {
          const active = e === (exp || data.expiration);
          return (
            <button
              key={e}
              type="button"
              onClick={() => setExp(e)}
              className="px-[10px] py-[3px] text-[11px] tabular-nums"
              style={{
                color: active ? COLORS.text : COLORS.textDim,
                background: active ? COLORS.brandSoft : "transparent",
                border: "1px solid " + (active ? COLORS.brand : COLORS.border),
                fontFamily: FONT_MONO,
              }}
            >
              {e}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
        <ChainTable title="Calls" rows={data.calls} side="call" />
        <ChainTable title="Puts" rows={data.puts} side="put" />
      </div>
    </div>
  );
}

function ChainTable({
  title,
  rows,
  side,
}: {
  title: string;
  rows: OptionsPayload["calls"];
  side: "call" | "put";
}) {
  return (
    <Panel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: COLORS.panelDeep }}>
              {["Strike", "Last", "Bid", "Ask", "Vol", "OI", "IV"].map((h) => (
                <th
                  key={h}
                  className="text-right px-[8px] py-[5px]"
                  style={{
                    color: COLORS.textFaint,
                    fontFamily: FONT_UI,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    borderBottom: "1px solid " + COLORS.border,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((r, i) => (
              <tr
                key={i}
                style={{
                  background: r.inTheMoney
                    ? side === "call"
                      ? "rgba(93,211,158,0.06)"
                      : "rgba(240,104,106,0.06)"
                    : "transparent",
                }}
              >
                {[
                  fmtNum(r.strike),
                  fmtNum(r.lastPrice),
                  fmtNum(r.bid),
                  fmtNum(r.ask),
                  fmtBig(r.volume),
                  fmtBig(r.openInterest),
                  fmtPct(r.impliedVolatility, true),
                ].map((v, j) => (
                  <td
                    key={j}
                    className="text-right px-[8px] py-[3px] tabular-nums"
                    style={{
                      color: COLORS.text,
                      fontFamily: FONT_MONO,
                      borderBottom: "1px solid " + COLORS.borderSoft,
                    }}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------- News ----------

interface NewsPayload {
  news: Array<{
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime: number | null;
    type?: string;
    relatedTickers?: string[];
    thumbnail?: string | null;
  }>;
}

function NewsView({ symbol }: { symbol: string }) {
  const { data, error, loading } = useEquityModule<NewsPayload>(symbol, "news");
  if (loading) return <LoadingShell label="news" />;
  if (error) return <ErrorShell error={error} />;
  if (!data) return null;
  return (
    <div className="px-[16px] py-[14px] space-y-[8px]">
      {data.news.length === 0 ? (
        <div className="text-[13px]" style={{ color: COLORS.textDim }}>
          No recent headlines.
        </div>
      ) : (
        data.news.map((n, i) => (
          <a
            key={i}
            href={n.link ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="px-[12px] py-[10px] flex gap-[12px] items-start"
            style={{
              background: COLORS.panel,
              border: "1px solid " + COLORS.border,
            }}
          >
            {n.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={n.thumbnail}
                alt=""
                style={{
                  width: 64,
                  height: 64,
                  objectFit: "cover",
                  flexShrink: 0,
                  border: "1px solid " + COLORS.borderSoft,
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div
                className="text-[14px] font-semibold leading-snug"
                style={{ color: COLORS.text, fontFamily: FONT_UI }}
              >
                {n.title ?? "-"}
              </div>
              <div
                className="text-[11px] mt-[3px] flex gap-[10px]"
                style={{ color: COLORS.textDim, fontFamily: FONT_UI }}
              >
                <span>{n.publisher ?? "-"}</span>
                <span>·</span>
                <span style={{ fontFamily: FONT_MONO }}>{fmtDate(n.providerPublishTime)}</span>
                {n.relatedTickers && n.relatedTickers.length > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: COLORS.brand, fontFamily: FONT_MONO }}>
                      {n.relatedTickers.slice(0, 4).join(", ")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </a>
        ))
      )}
    </div>
  );
}

// ---------- shared row primitives ----------

function HeaderCell({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className="px-[12px] py-[6px]"
      style={{
        background: COLORS.panelDeep,
        color: COLORS.textFaint,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        textAlign: align === "right" ? "right" : "left",
        fontFamily: FONT_UI,
      }}
    >
      {children}
    </div>
  );
}

function RowFrag({
  cells,
  rightAligned = [],
}: {
  cells: React.ReactNode[];
  rightAligned?: number[];
}) {
  const set = new Set(rightAligned);
  return (
    <>
      {cells.map((c, i) => (
        <div
          key={i}
          className="px-[12px] py-[5px] text-[12px] tabular-nums"
          style={{
            background: COLORS.panel,
            textAlign: set.has(i) ? "right" : "left",
            fontFamily: FONT_MONO,
          }}
        >
          {c}
        </div>
      ))}
    </>
  );
}

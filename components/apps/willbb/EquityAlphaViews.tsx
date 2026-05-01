"use client";

/**
 * Equity Research panels powered by Alpha Vantage's Alpha Intelligence™ +
 * fundamental endpoints, behind the unified /api/markets/alpha route.
 *
 *   NewsAndSentimentView   — AV NEWS_SENTIMENT, ticker-scoped, with LLM
 *                            sentiment scores per article + topics
 *   SmartMoneyView         — INSIDER_TRANSACTIONS + INSTITUTIONAL_HOLDINGS
 *                            in a side-by-side panel
 *   TranscriptView         — EARNINGS_CALL_TRANSCRIPT with paragraph-level
 *                            sentiment scoring; quarter selector at top
 *
 * All data is server-cached (15min → 30day depending on volatility), so
 * tab-switching between symbols doesn't re-burn the daily AV budget on
 * the same ticker.
 */

import { useEffect, useMemo, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "./OpenBB";

// ============================================================================
// Shared shells
// ============================================================================

function LoadingShell({ label }: { label: string }) {
  return (
    <div
      className="px-[16px] py-[12px] text-[12px]"
      style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}
    >
      Loading {label}...
    </div>
  );
}

function ErrorShell({ msg }: { msg: string }) {
  return (
    <div
      className="px-[16px] py-[12px] text-[12px]"
      style={{ color: COLORS.down, fontFamily: FONT_MONO }}
    >
      {msg}
    </div>
  );
}

function UnavailableShell({ msg }: { msg: string }) {
  return (
    <div
      className="px-[16px] py-[12px] text-[12px]"
      style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
    >
      {msg}
    </div>
  );
}

// ============================================================================
// NewsAndSentimentView
// ============================================================================

interface NewsItem {
  title: string;
  url: string;
  time_published: string;
  summary: string;
  source: string;
  source_domain: string;
  topics: { topic: string; relevance_score: string }[];
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment?: {
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }[];
  banner_image?: string | null;
}

function fmtAVTime(t: string): string {
  // AV format: 20260501T172300
  if (t.length !== 15 || t[8] !== "T") return t;
  const y = t.slice(0, 4);
  const m = t.slice(4, 6);
  const d = t.slice(6, 8);
  const hh = t.slice(9, 11);
  const mm = t.slice(11, 13);
  const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sentimentColor(label: string): string {
  if (/bullish/i.test(label)) return COLORS.up;
  if (/bearish/i.test(label)) return COLORS.down;
  return COLORS.textDim;
}

export function NewsAndSentimentView({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [unavailable, setUnavailable] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    setUnavailable(false);
    setItems(null);
    const ctrl = new AbortController();
    fetch(
      `/api/markets/alpha?fn=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=30`,
      { signal: ctrl.signal }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { feed?: NewsItem[]; unavailable?: boolean } | null) => {
        if (!d) {
          setUnavailable(true);
          return;
        }
        if (d.unavailable || !d.feed) {
          setUnavailable(true);
          setItems([]);
          return;
        }
        setItems(d.feed);
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [symbol]);

  // Aggregate sentiment across all returned articles for the gauge
  const tickerSentimentSummary = useMemo(() => {
    if (!items || items.length === 0) return null;
    const scores: number[] = [];
    let bullish = 0;
    let bearish = 0;
    let neutral = 0;
    for (const it of items) {
      const ts = it.ticker_sentiment?.find((t) => t.ticker.toUpperCase() === symbol.toUpperCase());
      const s = ts ? parseFloat(ts.ticker_sentiment_score) : it.overall_sentiment_score;
      if (Number.isFinite(s)) {
        scores.push(s);
        if (s > 0.15) bullish++;
        else if (s < -0.15) bearish++;
        else neutral++;
      }
    }
    if (scores.length === 0) return null;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      mean,
      n: scores.length,
      bullish,
      bearish,
      neutral,
      label:
        mean > 0.15
          ? "Bullish"
          : mean > 0.05
          ? "Somewhat-Bullish"
          : mean < -0.15
          ? "Bearish"
          : mean < -0.05
          ? "Somewhat-Bearish"
          : "Neutral",
    };
  }, [items, symbol]);

  if (loading) return <LoadingShell label="news + sentiment" />;
  if (unavailable && (!items || items.length === 0)) {
    return (
      <UnavailableShell msg="Alpha Vantage news + sentiment unavailable. Daily budget may be exhausted, or no recent articles for this ticker." />
    );
  }
  if (!items) return null;

  return (
    <div className="px-[16px] py-[14px] space-y-[10px]" style={{ fontFamily: FONT_UI }}>
      {/* Aggregate sentiment gauge */}
      {tickerSentimentSummary && (
        <div
          className="flex items-center justify-between px-[14px] py-[10px]"
          style={{
            background: COLORS.panel,
            border: "1px solid " + COLORS.border,
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: COLORS.textFaint, letterSpacing: "0.08em" }}>
              AGGREGATE SENTIMENT · {symbol} · LAST {tickerSentimentSummary.n} ARTICLES
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: FONT_MONO,
                color: sentimentColor(tickerSentimentSummary.label),
                marginTop: 2,
              }}
            >
              {tickerSentimentSummary.label}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, fontFamily: FONT_MONO, marginTop: 2 }}>
              mean score = {tickerSentimentSummary.mean.toFixed(3)}
            </div>
          </div>
          <div className="flex gap-[16px]" style={{ fontFamily: FONT_MONO, fontSize: 11 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: COLORS.up, fontSize: 18, fontWeight: 700 }}>
                {tickerSentimentSummary.bullish}
              </div>
              <div style={{ color: COLORS.textFaint, fontSize: 9, letterSpacing: "0.06em" }}>BULLISH</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: COLORS.textDim, fontSize: 18, fontWeight: 700 }}>
                {tickerSentimentSummary.neutral}
              </div>
              <div style={{ color: COLORS.textFaint, fontSize: 9, letterSpacing: "0.06em" }}>NEUTRAL</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: COLORS.down, fontSize: 18, fontWeight: 700 }}>
                {tickerSentimentSummary.bearish}
              </div>
              <div style={{ color: COLORS.textFaint, fontSize: 9, letterSpacing: "0.06em" }}>BEARISH</div>
            </div>
          </div>
        </div>
      )}
      {/* Article list */}
      {items.length === 0 ? (
        <div style={{ color: COLORS.textDim, fontSize: 13 }}>No recent articles.</div>
      ) : (
        items.map((n, i) => {
          const ts = n.ticker_sentiment?.find(
            (t) => t.ticker.toUpperCase() === symbol.toUpperCase()
          );
          const score = ts
            ? parseFloat(ts.ticker_sentiment_score)
            : n.overall_sentiment_score;
          const label = ts ? ts.ticker_sentiment_label : n.overall_sentiment_label;
          const color = sentimentColor(label);
          return (
            <a
              key={`${n.url}-${i}`}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-[12px] py-[10px] flex gap-[12px] items-start"
              style={{
                background: COLORS.panel,
                border: "1px solid " + COLORS.border,
              }}
            >
              {n.banner_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={n.banner_image}
                  alt=""
                  style={{
                    width: 88,
                    height: 56,
                    objectFit: "cover",
                    flexShrink: 0,
                    border: "1px solid " + COLORS.borderSoft,
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div
                  className="flex items-start justify-between gap-[10px]"
                  style={{ marginBottom: 3 }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.35,
                      color: COLORS.text,
                    }}
                  >
                    {n.title}
                  </div>
                  <div
                    style={{
                      flexShrink: 0,
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      color,
                      border: "1px solid " + color + "55",
                      background: color + "11",
                      padding: "1px 6px",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                    title={`Score: ${score.toFixed(3)} · Relevance: ${ts?.relevance_score ?? "—"}`}
                  >
                    {label.toUpperCase()} {Number.isFinite(score) ? `· ${score.toFixed(2)}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.textDim,
                    marginTop: 2,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{n.source}</span>
                  <span>{fmtAVTime(n.time_published)}</span>
                  {n.topics?.slice(0, 3).map((t, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: 9,
                        color: COLORS.textFaint,
                        border: "1px solid " + COLORS.borderSoft,
                        padding: "0 4px",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t.topic.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                {n.summary && (
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.textDim,
                      marginTop: 5,
                      lineHeight: 1.4,
                    }}
                  >
                    {n.summary.slice(0, 220)}
                    {n.summary.length > 220 ? "…" : ""}
                  </div>
                )}
              </div>
            </a>
          );
        })
      )}
      <div
        style={{
          fontSize: 9,
          color: COLORS.textFaint,
          fontFamily: FONT_MONO,
          letterSpacing: "0.06em",
          textAlign: "right",
          marginTop: 8,
        }}
      >
        powered by Alpha Vantage NEWS_SENTIMENT · sentiment scored by LLM
      </div>
    </div>
  );
}

// ============================================================================
// SmartMoneyView — Insider Transactions + Institutional Holdings
// ============================================================================

interface InsiderTxn {
  transaction_date: string;
  ticker: string;
  executive: string;
  executive_title: string;
  security_type: string;
  acquisition_or_disposal: string;
  shares: string;
  share_price: string;
}

interface InstitutionalHolder {
  holder: string;
  shares: string;
  market_value: string;
  percent_of_outstanding: string;
  reporting_date: string;
}

function fmtBigNum(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}

export function SmartMoneyView({ symbol }: { symbol: string }) {
  const [insider, setInsider] = useState<InsiderTxn[] | null>(null);
  const [insiderUnavailable, setInsiderUnavailable] = useState(false);
  const [inst, setInst] = useState<InstitutionalHolder[] | null>(null);
  const [instUnavailable, setInstUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setInsider(null);
    setInst(null);
    setInsiderUnavailable(false);
    setInstUnavailable(false);
    const ctrl = new AbortController();

    Promise.all([
      fetch(`/api/markets/alpha?fn=INSIDER&symbol=${encodeURIComponent(symbol)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/markets/alpha?fn=INSTITUTIONAL&symbol=${encodeURIComponent(symbol)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([ins, instr]: [{ data?: InsiderTxn[]; unavailable?: boolean } | null, { data?: InstitutionalHolder[]; unavailable?: boolean } | null]) => {
      if (!ins || ins.unavailable) setInsiderUnavailable(true);
      else setInsider(ins.data ?? []);
      if (!instr || instr.unavailable) setInstUnavailable(true);
      else setInst(instr.data ?? []);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [symbol]);

  if (loading) return <LoadingShell label="smart money" />;

  return (
    <div className="px-[16px] py-[14px] grid grid-cols-1 md:grid-cols-2 gap-[12px]" style={{ fontFamily: FONT_UI }}>
      {/* Insider Transactions */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: COLORS.textFaint,
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          INSIDER TRANSACTIONS · LAST 50
        </div>
        {insiderUnavailable ? (
          <UnavailableShell msg="Insider transaction data unavailable for this ticker." />
        ) : !insider || insider.length === 0 ? (
          <div style={{ color: COLORS.textDim, fontSize: 12 }}>No recent insider transactions.</div>
        ) : (
          <div style={{ background: COLORS.panel, border: "1px solid " + COLORS.border, maxHeight: 460, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: 11, fontFamily: FONT_MONO, borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: COLORS.panelDeep }}>
                <tr style={{ color: COLORS.textFaint }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Insider</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Type</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Shares</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Px</th>
                </tr>
              </thead>
              <tbody>
                {insider.slice(0, 50).map((t, i) => {
                  const isAcq = t.acquisition_or_disposal === "A";
                  return (
                    <tr key={i} style={{ borderTop: "1px solid " + COLORS.borderSoft }}>
                      <td style={{ padding: "5px 8px", color: COLORS.textDim }}>{t.transaction_date}</td>
                      <td style={{ padding: "5px 8px", color: COLORS.text }}>
                        <div style={{ fontWeight: 600 }}>{t.executive}</div>
                        <div style={{ fontSize: 9, color: COLORS.textFaint }}>{t.executive_title}</div>
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: isAcq ? COLORS.up : COLORS.down, fontWeight: 700 }}>
                        {isAcq ? "BUY" : "SELL"}
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: COLORS.text }}>{fmtBigNum(t.shares)}</td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: COLORS.textDim }}>${parseFloat(t.share_price).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Institutional Holdings */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: COLORS.textFaint,
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          INSTITUTIONAL HOLDINGS · TOP 25
        </div>
        {instUnavailable ? (
          <UnavailableShell msg="Institutional holdings unavailable for this ticker." />
        ) : !inst || inst.length === 0 ? (
          <div style={{ color: COLORS.textDim, fontSize: 12 }}>No institutional holders on file.</div>
        ) : (
          <div style={{ background: COLORS.panel, border: "1px solid " + COLORS.border, maxHeight: 460, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: 11, fontFamily: FONT_MONO, borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: COLORS.panelDeep }}>
                <tr style={{ color: COLORS.textFaint }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Holder</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Shares</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Value</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>%O/S</th>
                </tr>
              </thead>
              <tbody>
                {inst.slice(0, 25).map((h, i) => (
                  <tr key={i} style={{ borderTop: "1px solid " + COLORS.borderSoft }}>
                    <td style={{ padding: "5px 8px", color: COLORS.text }}>{h.holder}</td>
                    <td style={{ textAlign: "right", padding: "5px 8px", color: COLORS.text }}>{fmtBigNum(h.shares)}</td>
                    <td style={{ textAlign: "right", padding: "5px 8px", color: COLORS.text }}>${fmtBigNum(h.market_value)}</td>
                    <td style={{ textAlign: "right", padding: "5px 8px", color: COLORS.brand }}>
                      {parseFloat(h.percent_of_outstanding).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TranscriptView — earnings call transcript with paragraph-level sentiment
// ============================================================================

interface TranscriptParagraph {
  speaker: string;
  title: string;
  content: string;
  sentiment: string;
}

function makeQuarterOptions(): string[] {
  // Last 8 quarters
  const out: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    out.push(`${y}Q${q}`);
    q--;
    if (q === 0) {
      q = 4;
      y--;
    }
  }
  return out;
}

export function TranscriptView({ symbol }: { symbol: string }) {
  const quarters = useMemo(() => makeQuarterOptions(), []);
  const [quarter, setQuarter] = useState<string>(quarters[0]);
  const [paragraphs, setParagraphs] = useState<TranscriptParagraph[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setLoading(true);
    setUnavailable(false);
    setParagraphs(null);
    const ctrl = new AbortController();
    fetch(
      `/api/markets/alpha?fn=TRANSCRIPT&symbol=${encodeURIComponent(symbol)}&quarter=${encodeURIComponent(quarter)}`,
      { signal: ctrl.signal }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: { transcript?: TranscriptParagraph[]; unavailable?: boolean } | null
        ) => {
          if (!d || d.unavailable || !d.transcript) {
            setUnavailable(true);
            setParagraphs([]);
            return;
          }
          setParagraphs(d.transcript);
        }
      )
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [symbol, quarter]);

  // Speaker-level sentiment averages (top 6 speakers by paragraph count)
  const speakerStats = useMemo(() => {
    if (!paragraphs || paragraphs.length === 0) return null;
    const map = new Map<string, { name: string; title: string; scores: number[] }>();
    for (const p of paragraphs) {
      const k = p.speaker;
      if (!map.has(k)) map.set(k, { name: k, title: p.title, scores: [] });
      const s = parseFloat(p.sentiment);
      if (Number.isFinite(s)) map.get(k)!.scores.push(s);
    }
    return Array.from(map.values())
      .filter((s) => s.scores.length > 0)
      .map((s) => ({
        name: s.name,
        title: s.title,
        n: s.scores.length,
        mean: s.scores.reduce((a, b) => a + b, 0) / s.scores.length,
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
  }, [paragraphs]);

  return (
    <div className="px-[16px] py-[14px]" style={{ fontFamily: FONT_UI }}>
      <div
        className="flex items-center gap-[12px] flex-wrap"
        style={{ marginBottom: 10 }}
      >
        <div style={{ fontSize: 11, color: COLORS.textDim, fontFamily: FONT_MONO, letterSpacing: "0.06em" }}>
          QUARTER
        </div>
        <select
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          style={{
            background: COLORS.panelDeep,
            color: COLORS.text,
            border: "1px solid " + COLORS.borderSoft,
            padding: "3px 8px",
            fontSize: 11,
            fontFamily: FONT_MONO,
          }}
        >
          {quarters.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        {loading && (
          <span style={{ fontSize: 10, color: COLORS.brand, fontFamily: FONT_MONO }}>
            loading transcript...
          </span>
        )}
      </div>

      {unavailable && (!paragraphs || paragraphs.length === 0) && (
        <UnavailableShell msg={`No transcript available for ${symbol} ${quarter}. Try a more recent quarter.`} />
      )}

      {!loading && paragraphs && paragraphs.length > 0 && (
        <>
          {/* Speaker sentiment summary */}
          {speakerStats && speakerStats.length > 0 && (
            <div
              className="grid grid-cols-2 md:grid-cols-3 gap-[8px]"
              style={{ marginBottom: 14 }}
            >
              {speakerStats.map((s) => {
                const color = s.mean > 0.15 ? COLORS.up : s.mean < -0.15 ? COLORS.down : COLORS.textDim;
                return (
                  <div
                    key={s.name}
                    style={{
                      padding: "6px 10px",
                      background: COLORS.panel,
                      border: "1px solid " + COLORS.border,
                    }}
                  >
                    <div style={{ fontSize: 11, color: COLORS.text, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 9, color: COLORS.textFaint, marginTop: 1, fontFamily: FONT_UI }}>
                      {s.title}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color,
                        fontWeight: 700,
                        fontFamily: FONT_MONO,
                        marginTop: 3,
                      }}
                    >
                      {s.mean >= 0 ? "+" : ""}
                      {s.mean.toFixed(3)}
                      <span style={{ fontSize: 9, color: COLORS.textFaint, marginLeft: 6, fontWeight: 400 }}>
                        n={s.n}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paragraphs */}
          <div className="space-y-[8px]">
            {paragraphs.map((p, i) => {
              const s = parseFloat(p.sentiment);
              const color = s > 0.15 ? COLORS.up : s < -0.15 ? COLORS.down : COLORS.textDim;
              return (
                <div
                  key={i}
                  style={{
                    background: COLORS.panel,
                    border: "1px solid " + COLORS.border,
                    padding: "10px 12px",
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <div
                    className="flex items-center justify-between"
                    style={{ marginBottom: 4 }}
                  >
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>
                        {p.speaker}
                      </span>
                      <span style={{ fontSize: 10, color: COLORS.textFaint, marginLeft: 8 }}>
                        {p.title}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: FONT_MONO,
                        color,
                        background: color + "11",
                        border: "1px solid " + color + "55",
                        padding: "1px 6px",
                      }}
                    >
                      {Number.isFinite(s) ? (s >= 0 ? "+" : "") + s.toFixed(3) : "—"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.text,
                      lineHeight: 1.5,
                    }}
                  >
                    {p.content}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              fontSize: 9,
              color: COLORS.textFaint,
              fontFamily: FONT_MONO,
              letterSpacing: "0.06em",
              textAlign: "right",
              marginTop: 12,
            }}
          >
            powered by Alpha Vantage EARNINGS_CALL_TRANSCRIPT · sentiment scored by LLM
          </div>
        </>
      )}
    </div>
  );
}

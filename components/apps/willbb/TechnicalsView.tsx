"use client";

/**
 * Technical Analysis Guide.
 *
 * Walks the focused symbol through a 5-step checklist:
 *   1. Trend & Moving Averages   - close vs SMA(50) and SMA(200)
 *   2. Momentum                  - RSI(14) + MACD(12,26,9)
 *   3. Volume confirmation       - last bar volume vs SMA(20) volume,
 *                                  rising/falling on price direction
 *   4. Support & Resistance      - local swing highs / lows over last 60 bars
 *   5. Fundamentals (sanity)     - P/E, earnings, analyst rec from
 *                                  /api/markets/equity?module=statistics
 *
 * Every section reports the raw value, a verdict (bullish / neutral /
 * bearish), and a one-sentence interpretation. A header verdict aggregates
 * the bullish/bearish weight across all sections.
 */

import { useEffect, useMemo, useState } from "react";
import TradingViewChart from "./TradingViewChart";

const COLORS = {
  bg: "#151518",
  panel: "#212124",
  panelDeep: "#24242a",
  border: "#46464F",
  borderSoft: "rgba(70,70,79,0.5)",
  text: "#FFFFFF",
  textDim: "#9793b0",
  textFaint: "#8A8A90",
  up: "#5dd39e",
  down: "#f0686a",
  flat: "#9793b0",
  brand: "#33BBFF",
} as const;

const FONT_UI =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

interface Bar {
  t: number;
  c: number;
  o?: number;
  h?: number;
  l?: number;
  v?: number;
}

interface ChartPayload {
  symbol: string;
  shortName: string | null;
  price: number | null;
  previousClose: number | null;
  points: Bar[];
}

interface StatsPayload {
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  targetMeanPrice: number | null;
  beta: number | null;
}

type Verdict = "bullish" | "bearish" | "neutral" | "n/a";

// ---------- math ----------

function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (n + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    if (i === n - 1) {
      // Seed with simple average of first n.
      let s = 0;
      for (let j = 0; j < n; j++) s += values[j];
      prev = s / n;
      out.push(prev);
      continue;
    }
    const cur: number = values[i] * k + (prev as number) * (1 - k);
    prev = cur;
    out.push(cur);
  }
  return out;
}

function rsi(values: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= n;
  avgLoss /= n;
  out[n] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (n - 1) + gain) / n;
    avgLoss = (avgLoss * (n - 1) + loss) / n;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function macd(values: number[]): {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
} {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const macdLine: (number | null)[] = values.map((_, i) =>
    e12[i] != null && e26[i] != null ? (e12[i] as number) - (e26[i] as number) : null
  );
  // Signal = EMA(9) on the non-null portion of macdLine.
  const compact = macdLine.map((v) => (v == null ? 0 : v));
  const startIdx = macdLine.findIndex((v) => v != null);
  const signalRaw = ema(compact, 9);
  const signal: (number | null)[] = macdLine.map((v, i) =>
    v == null || i < startIdx + 8 ? null : signalRaw[i]
  );
  const hist = macdLine.map((v, i) =>
    v != null && signal[i] != null ? v - (signal[i] as number) : null
  );
  return { macd: macdLine, signal, hist };
}

/** Simple swing detection: a bar is a local max if its high beats the `lookback`
 *  bars before AND after. Returns the most recent N maxima/minima below the
 *  current bar so we don't pick "today". */
function swingLevels(
  bars: Bar[],
  lookback = 5,
  takeMax = 3
): { resistances: number[]; supports: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const h = bars[i].h ?? bars[i].c;
    const l = bars[i].l ?? bars[i].c;
    let isHi = true;
    let isLo = true;
    for (let j = -lookback; j <= lookback; j++) {
      if (j === 0) continue;
      const ref = bars[i + j];
      if ((ref.h ?? ref.c) > h) isHi = false;
      if ((ref.l ?? ref.c) < l) isLo = false;
    }
    if (isHi) highs.push(h);
    if (isLo) lows.push(l);
  }
  const last = bars[bars.length - 1].c;
  // Take the most recent N that are *near* current price.
  const resistances = highs.filter((h) => h >= last).slice(-takeMax);
  const supports = lows.filter((l) => l <= last).slice(-takeMax);
  return { resistances, supports };
}

// ---------- formatters ----------

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function verdictColor(v: Verdict): string {
  if (v === "bullish") return COLORS.up;
  if (v === "bearish") return COLORS.down;
  if (v === "neutral") return COLORS.brand;
  return COLORS.flat;
}

function verdictLabel(v: Verdict): string {
  if (v === "bullish") return "BULLISH";
  if (v === "bearish") return "BEARISH";
  if (v === "neutral") return "NEUTRAL";
  return "N/A";
}

// ---------- main ----------

export default function TechnicalsView({ symbol }: { symbol: string }) {
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch 6mo daily for analysis (long enough for SMA200 stub + recent moves).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChartErr(null);
    Promise.allSettled([
      fetch(`/api/markets/chart?symbol=${encodeURIComponent(symbol)}&range=1y&interval=1d`).then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `chart HTTP ${r.status}`);
        }
        return (await r.json()) as ChartPayload;
      }),
      fetch(`/api/markets/equity?module=statistics&symbol=${encodeURIComponent(symbol)}`).then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as StatsPayload | { error?: string };
        if ("error" in d && d.error) return null;
        return d as StatsPayload;
      }),
    ]).then(([chartRes, statsRes]) => {
      if (cancelled) return;
      if (chartRes.status === "fulfilled") setChart(chartRes.value);
      else setChartErr(chartRes.reason?.message ?? "chart load failed");
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const analysis = useMemo(() => {
    if (!chart || chart.points.length < 30) return null;
    return computeAnalysis(chart, stats);
  }, [chart, stats]);

  // TradingView chart is independent of our API - always render it at the
  // top so visitors get the visual even when Yahoo is rate-limiting our
  // analysis pipeline. The checklist sections below explain their own state.

  return (
    <div className="px-[16px] py-[14px] space-y-[16px]">
      {analysis && (
        <Verdict overall={analysis.overall} score={analysis.score} symbol={symbol} />
      )}
      {!analysis && (
        <div
          className="px-[14px] py-[10px] text-[12px]"
          style={{
            background: COLORS.panel,
            border: "1px solid " + COLORS.border,
            color: COLORS.textDim,
            fontFamily: FONT_UI,
          }}
        >
          {loading
            ? `Loading ${symbol} 1y daily bars + fundamentals for the analysis checklist…`
            : chartErr
            ? `Analysis checklist unavailable (${chartErr}). The interactive chart below is sourced separately from TradingView and remains live.`
            : `Not enough history to run analysis on ${symbol}. The TradingView chart below is still live.`}
        </div>
      )}
      <div
        style={{
          height: 420,
          background: COLORS.bg,
          border: "1px solid " + COLORS.border,
        }}
      >
        <TradingViewChart
          symbol={symbol}
          interval="D"
          height="100%"
          studies={[
            "MASimple@tv-basicstudies",
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies",
          ]}
        />
      </div>
      {analysis && (
        <>
          <Section
            title="1. Trend · Moving Averages"
            rule="Price above the 50-day SMA = bullish; below = bearish. The 50/200-day cross (golden vs death cross) is a longer-horizon signal."
            verdict={analysis.trend.verdict}
            rows={analysis.trend.rows}
            interpretation={analysis.trend.note}
          />
          <Section
            title="2. Momentum · RSI(14) + MACD(12,26,9)"
            rule="RSI 40–60 healthy · >70 overbought · <30 oversold. MACD line crossing above signal with positive histogram = bullish momentum."
            verdict={analysis.momentum.verdict}
            rows={analysis.momentum.rows}
            interpretation={analysis.momentum.note}
          />
          <Section
            title="3. Volume Confirmation"
            rule="Rising price on rising volume confirms strength. Falling price on rising volume signals selling pressure."
            verdict={analysis.volume.verdict}
            rows={analysis.volume.rows}
            interpretation={analysis.volume.note}
          />
          <Section
            title="4. Support · Resistance"
            rule="Identify recent swing highs/lows. Resistance = ceilings to break; support = floors that should hold."
            verdict={analysis.sr.verdict}
            rows={analysis.sr.rows}
            interpretation={analysis.sr.note}
          />
          <Section
            title="5. Fundamentals (Sanity Check)"
            rule="Even with chart strength, the company's earnings, valuation, and analyst view should justify the technical setup."
            verdict={analysis.fundamentals.verdict}
            rows={analysis.fundamentals.rows}
            interpretation={analysis.fundamentals.note}
          />
        </>
      )}
      <Disclaimer />
    </div>
  );
}

// ---------- analysis pipeline ----------

interface SectionResult {
  verdict: Verdict;
  rows: Array<[string, React.ReactNode]>;
  note: string;
}

function computeAnalysis(chart: ChartPayload, stats: StatsPayload | null): {
  overall: Verdict;
  score: number;
  trend: SectionResult;
  momentum: SectionResult;
  volume: SectionResult;
  sr: SectionResult;
  fundamentals: SectionResult;
} {
  const bars = chart.points;
  const closes = bars.map((b) => b.c);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;

  // ---- Trend ----
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const sma50Last = sma50[sma50.length - 1] ?? null;
  const sma200Last = sma200[sma200.length - 1] ?? null;
  // Find the day the trend's 50-day relationship flipped most recently.
  let lastCrossDays: number | null = null;
  for (let i = closes.length - 2; i >= 50; i--) {
    if (sma50[i] == null) break;
    const aboveNow = closes[i + 1] > (sma50[i + 1] as number);
    const aboveBefore = closes[i] > (sma50[i] as number);
    if (aboveNow !== aboveBefore) {
      lastCrossDays = closes.length - 1 - i;
      break;
    }
  }
  const aboveSma50 = sma50Last != null && last > sma50Last;
  const aboveSma200 = sma200Last != null && last > sma200Last;
  const goldenCross =
    sma50Last != null && sma200Last != null && sma50Last > sma200Last;
  let trendVerdict: Verdict = "neutral";
  if (aboveSma50 && aboveSma200) trendVerdict = "bullish";
  else if (!aboveSma50 && !aboveSma200) trendVerdict = "bearish";
  const trend: SectionResult = {
    verdict: trendVerdict,
    rows: [
      ["Last close", `$${fmt(last)}`],
      ["SMA(50)", sma50Last != null ? `$${fmt(sma50Last)}` : "-"],
      ["SMA(200)", sma200Last != null ? `$${fmt(sma200Last)}` : "-"],
      ["Price vs 50-day", aboveSma50 ? "ABOVE" : "BELOW"],
      ["Price vs 200-day", aboveSma200 ? "ABOVE" : "BELOW"],
      [
        "50/200 cross",
        sma50Last == null || sma200Last == null
          ? "-"
          : goldenCross
          ? "Golden (50 > 200)"
          : "Death (50 < 200)",
      ],
    ],
    note: aboveSma50
      ? `${chart.symbol} is trading above its 50-day SMA${
          lastCrossDays != null ? ` (crossed up ~${lastCrossDays} session(s) ago)` : ""
        }${aboveSma200 ? " and above its 200-day SMA - clean uptrend." : " but still below the 200-day."}`
      : `${chart.symbol} is below its 50-day SMA - the short-term trend is down${
          aboveSma200 ? " though the longer 200-day still slopes up." : "."
        }`,
  };

  // ---- Momentum ----
  const rsiArr = rsi(closes, 14);
  const rsiLast = rsiArr[rsiArr.length - 1];
  const m = macd(closes);
  const macdLast = m.macd[m.macd.length - 1];
  const sigLast = m.signal[m.signal.length - 1];
  const histLast = m.hist[m.hist.length - 1];
  const histPrev = m.hist[m.hist.length - 2];
  let momentumVerdict: Verdict = "neutral";
  if (rsiLast != null && macdLast != null && sigLast != null && histLast != null) {
    const rsiHealthy = rsiLast > 50 && rsiLast < 70;
    const rsiHot = rsiLast >= 70;
    const rsiCold = rsiLast <= 30;
    const macdBull = macdLast > sigLast && histLast > 0;
    const macdBear = macdLast < sigLast && histLast < 0;
    if ((rsiHealthy && macdBull) || (rsiHot && macdBull)) momentumVerdict = "bullish";
    else if ((rsiCold && macdBear) || (rsiLast < 50 && macdBear)) momentumVerdict = "bearish";
  }
  const histTurning =
    histLast != null && histPrev != null
      ? histLast > histPrev
        ? "rising (improving)"
        : "falling (deteriorating)"
      : "-";
  const momentum: SectionResult = {
    verdict: momentumVerdict,
    rows: [
      ["RSI(14)", rsiLast != null ? fmt(rsiLast, 1) : "-"],
      [
        "RSI zone",
        rsiLast == null
          ? "-"
          : rsiLast >= 70
          ? "Overbought ≥70"
          : rsiLast <= 30
          ? "Oversold ≤30"
          : rsiLast >= 50
          ? "Healthy 50–70"
          : "Soft <50",
      ],
      ["MACD", macdLast != null ? fmt(macdLast, 3) : "-"],
      ["Signal", sigLast != null ? fmt(sigLast, 3) : "-"],
      ["Histogram", histLast != null ? fmt(histLast, 3) : "-"],
      ["Histogram trend", histTurning],
    ],
    note:
      rsiLast == null || macdLast == null
        ? "Not enough bars to compute RSI/MACD."
        : momentumVerdict === "bullish"
        ? `RSI is ${fmt(rsiLast, 1)} (positive but not extreme) and MACD has crossed above its signal - momentum is constructive.`
        : momentumVerdict === "bearish"
        ? `RSI is ${fmt(rsiLast, 1)} and MACD is below its signal - momentum is rolling over.`
        : `RSI is ${fmt(rsiLast, 1)} and MACD is mixed - momentum is indecisive, wait for confirmation.`,
  };

  // ---- Volume ----
  const vols = bars.map((b) => b.v ?? 0);
  const volSma20 = sma(vols, 20);
  const volSmaLast = volSma20[volSma20.length - 1] ?? null;
  const lastVol = vols[vols.length - 1];
  const priceUp = last > prev;
  const volRatio = volSmaLast ? lastVol / volSmaLast : null;
  let volumeVerdict: Verdict = "neutral";
  let volumeNote = "";
  if (volSmaLast == null || lastVol === 0) {
    volumeVerdict = "n/a";
    volumeNote = "No per-bar volume reported (common for indices, FX, and some crypto sources).";
  } else if (priceUp && (volRatio as number) > 1.0) {
    volumeVerdict = "bullish";
    volumeNote = `Today's volume ran ${fmt((volRatio as number - 1) * 100, 0)}% above the 20-day average on a green day - buying confirmed.`;
  } else if (!priceUp && (volRatio as number) > 1.0) {
    volumeVerdict = "bearish";
    volumeNote = `Today's volume ran ${fmt((volRatio as number - 1) * 100, 0)}% above the 20-day average on a red day - distribution / selling pressure.`;
  } else if (priceUp && (volRatio as number) <= 1.0) {
    volumeVerdict = "neutral";
    volumeNote = "Price moved up but on lighter-than-average volume - rally lacks conviction.";
  } else {
    volumeVerdict = "neutral";
    volumeNote = "Price moved down on average / lighter volume - pullback isn't urgent.";
  }
  const volumeSection: SectionResult = {
    verdict: volumeVerdict,
    rows: [
      ["Last bar volume", fmtBig(lastVol)],
      ["20-day avg volume", volSmaLast != null ? fmtBig(volSmaLast) : "-"],
      ["Ratio (last / avg)", volRatio != null ? `${fmt(volRatio, 2)}×` : "-"],
      ["Last bar price action", priceUp ? "UP" : "DOWN"],
    ],
    note: volumeNote,
  };

  // ---- Support / Resistance ----
  const recent = bars.slice(-90);
  const { resistances, supports } = swingLevels(recent, 5, 3);
  const nearestRes = resistances.length ? Math.min(...resistances) : null;
  const nearestSup = supports.length ? Math.max(...supports) : null;
  const distToRes = nearestRes != null ? ((nearestRes - last) / last) * 100 : null;
  const distToSup = nearestSup != null ? ((nearestSup - last) / last) * 100 : null;
  let srVerdict: Verdict = "neutral";
  let srNote = "";
  if (nearestRes != null && nearestSup != null) {
    const room = nearestRes - nearestSup;
    const inUpperHalf = last - nearestSup > room / 2;
    if (inUpperHalf && (distToRes ?? 0) < 3) {
      srVerdict = "neutral";
      srNote = `${chart.symbol} is pressing into resistance near $${fmt(nearestRes)} - a clean break = bullish; rejection = bearish.`;
    } else if (inUpperHalf) {
      srVerdict = "bullish";
      srNote = `${chart.symbol} sits in the upper half of its recent range. Resistance ≈ $${fmt(nearestRes)}, support ≈ $${fmt(nearestSup)}.`;
    } else {
      srVerdict = "bearish";
      srNote = `${chart.symbol} is in the lower half of its recent range. Watch support ≈ $${fmt(nearestSup)} - a break = next leg down.`;
    }
  } else {
    srNote = "Not enough recent swings to anchor support/resistance.";
  }
  const sr: SectionResult = {
    verdict: srVerdict,
    rows: [
      [
        "Nearest resistance",
        nearestRes != null
          ? `$${fmt(nearestRes)} (${distToRes != null ? fmtPct(distToRes) : "-"} away)`
          : "-",
      ],
      [
        "Nearest support",
        nearestSup != null
          ? `$${fmt(nearestSup)} (${distToSup != null ? fmtPct(distToSup) : "-"} away)`
          : "-",
      ],
      ["Resistances spotted", resistances.length ? resistances.map((v) => `$${fmt(v)}`).join(", ") : "-"],
      ["Supports spotted", supports.length ? supports.map((v) => `$${fmt(v)}`).join(", ") : "-"],
    ],
    note: srNote,
  };

  // ---- Fundamentals ----
  const peTrailing = stats?.trailingPE ?? null;
  const peForward = stats?.forwardPE ?? null;
  const peg = stats?.pegRatio ?? null;
  const profitMargin = stats?.profitMargin ?? null;
  const recKey = stats?.recommendationKey ?? null;
  const recMean = stats?.recommendationMean ?? null;
  const target = stats?.targetMeanPrice ?? null;
  const upsidePct = target != null ? ((target - last) / last) * 100 : null;
  let fundVerdict: Verdict = "neutral";
  let fundNote = "";
  if (stats == null) {
    fundVerdict = "n/a";
    fundNote = "Fundamentals couldn't be retrieved (upstream rate-limited). Don't act on technicals alone.";
  } else {
    let bullPoints = 0;
    let bearPoints = 0;
    if (peg != null && peg > 0 && peg < 1) bullPoints++; // PEG <1 = growth justifies P/E
    if (peg != null && peg > 2.5) bearPoints++;
    if (profitMargin != null && profitMargin > 0.1) bullPoints++; // >10% margin
    if (profitMargin != null && profitMargin < 0) bearPoints++;
    if (recMean != null && recMean <= 2) bullPoints++; // 1=strong buy, 2=buy
    if (recMean != null && recMean >= 4) bearPoints++;
    if (upsidePct != null && upsidePct >= 10) bullPoints++;
    if (upsidePct != null && upsidePct <= -5) bearPoints++;
    if (bullPoints - bearPoints >= 2) fundVerdict = "bullish";
    else if (bearPoints - bullPoints >= 2) fundVerdict = "bearish";
    else fundVerdict = "neutral";
    fundNote =
      fundVerdict === "bullish"
        ? `Fundamentals support the chart: ${
            peg != null && peg < 1 ? `PEG ${fmt(peg, 2)}, ` : ""
          }${profitMargin != null ? `${fmt(profitMargin * 100, 1)}% profit margin, ` : ""}${
            recKey ? `consensus = ${recKey}` : ""
          }.`
        : fundVerdict === "bearish"
        ? "Fundamentals look stretched relative to the chart - be cautious extending here."
        : "Fundamentals are mixed - the technical setup carries more of the weight.";
  }
  const fundamentals: SectionResult = {
    verdict: fundVerdict,
    rows: [
      ["P/E (Trailing)", fmt(peTrailing)],
      ["P/E (Forward)", fmt(peForward)],
      ["PEG Ratio", fmt(peg)],
      ["Profit Margin", profitMargin != null ? fmtPct(profitMargin * 100) : "-"],
      ["Analyst Rec.", recKey ?? "-"],
      [
        "Target Upside",
        upsidePct != null ? `${fmtPct(upsidePct)} → $${fmt(target as number)}` : "-",
      ],
    ],
    note: fundNote,
  };

  // ---- Aggregate ----
  const sections: Verdict[] = [
    trend.verdict,
    momentum.verdict,
    volumeSection.verdict,
    sr.verdict,
    fundamentals.verdict,
  ];
  let score = 0;
  for (const v of sections) {
    if (v === "bullish") score += 1;
    else if (v === "bearish") score -= 1;
  }
  let overall: Verdict = "neutral";
  if (score >= 2) overall = "bullish";
  else if (score <= -2) overall = "bearish";

  return {
    overall,
    score,
    trend,
    momentum,
    volume: volumeSection,
    sr,
    fundamentals,
  };
}

function fmtBig(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ---------- presentation ----------

function Verdict({
  overall,
  score,
  symbol,
}: {
  overall: Verdict;
  score: number;
  symbol: string;
}) {
  const text =
    overall === "bullish"
      ? "Most signals align bullish - setup looks attractive to consider."
      : overall === "bearish"
      ? "Most signals point bearish - wait for a cleaner setup."
      : "Signals are mixed - wait for confirmation before acting.";
  return (
    <div
      className="px-[16px] py-[12px]"
      style={{
        background: COLORS.panel,
        border: "1px solid " + verdictColor(overall),
      }}
    >
      <div className="flex items-baseline justify-between gap-[10px]">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: COLORS.textFaint, fontFamily: FONT_UI }}
          >
            Overall Verdict · {symbol}
          </div>
          <div
            className="text-[20px] font-semibold mt-[2px]"
            style={{ color: verdictColor(overall), fontFamily: FONT_UI }}
          >
            {verdictLabel(overall)}
          </div>
        </div>
        <div
          className="text-[12px] tabular-nums"
          style={{ color: COLORS.textDim, fontFamily: FONT_MONO }}
        >
          score {score >= 0 ? "+" : ""}
          {score} / 5
        </div>
      </div>
      <div
        className="text-[13px] mt-[6px]"
        style={{ color: COLORS.text, fontFamily: FONT_UI }}
      >
        {text}
      </div>
    </div>
  );
}

function Section({
  title,
  rule,
  verdict,
  rows,
  interpretation,
}: {
  title: string;
  rule: string;
  verdict: Verdict;
  rows: Array<[string, React.ReactNode]>;
  interpretation: string;
}) {
  // Pad rows to a multiple of 3 so the grid never leaks the dark gap color.
  const padCount = (3 - (rows.length % 3)) % 3;
  return (
    <div>
      <div
        className="flex items-baseline justify-between gap-[10px] mb-[6px]"
      >
        <div
          className="text-[12px] uppercase tracking-[0.14em]"
          style={{ color: COLORS.text, fontFamily: FONT_UI, fontWeight: 600 }}
        >
          {title}
        </div>
        <span
          className="px-[8px] py-[1px] text-[10px] uppercase tracking-[0.18em]"
          style={{
            color: verdictColor(verdict),
            background: COLORS.panelDeep,
            border: "1px solid " + verdictColor(verdict),
            fontFamily: FONT_UI,
            fontWeight: 600,
          }}
        >
          {verdictLabel(verdict)}
        </span>
      </div>
      <p
        className="text-[12px] mb-[8px]"
        style={{ color: COLORS.textDim, fontFamily: FONT_UI }}
      >
        <span style={{ color: COLORS.brand }}>Rule:</span> {rule}
      </p>
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
          <div key={`pad-${i}`} className="px-[12px] py-[8px]" style={{ background: COLORS.panel }} aria-hidden />
        ))}
      </div>
      <p
        className="text-[13px] mt-[8px] leading-snug"
        style={{ color: COLORS.text, fontFamily: FONT_UI }}
      >
        <span style={{ color: COLORS.brand }}>Read:</span> {interpretation}
      </p>
    </div>
  );
}

function Disclaimer() {
  return (
    <div
      className="text-[11px] px-[12px] py-[8px] mt-[8px]"
      style={{
        color: COLORS.textFaint,
        background: COLORS.panel,
        border: "1px solid " + COLORS.borderSoft,
        fontFamily: FONT_UI,
      }}
    >
      Educational only - not investment advice. Indicators are computed from
      Yahoo Finance bars (or CoinGecko for crypto). Always pair signals with
      your own research and risk tolerance.
    </div>
  );
}

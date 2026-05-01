/**
 * Pine-style preset strategies for the Quant Desk Strategy Lab.
 *
 * Each preset is authored as a JS function that takes (bars, indicators, ctx)
 * and returns an array of signals. The host UI compiles by running the body
 * inside `new Function(...)`. Presets are pre-tested and ship as a starter
 * library; users can edit any one of them in the in-app code editor.
 *
 * The strategy function receives:
 *   bars            - Bar[]: { t, o, h, l, c, v }
 *   ind             - the indicators library
 *   ctx             - { i: number, signals: Signal[], position: "flat" | "long" | "short" }
 *
 * It is called once per bar by the engine. Each call may push 0..N signals
 * into ctx.signals via helper methods (long, short, exit).
 */

export interface Preset {
  id: string;
  name: string;
  category: "Trend" | "Mean Reversion" | "Volatility" | "Combo";
  description: string;
  source: string;
}

export const PRESETS: Preset[] = [
  {
    id: "ma-crossover",
    name: "MA Crossover (50/200)",
    category: "Trend",
    description:
      "Classic golden-cross / death-cross. Long when fast SMA crosses above slow; close on the reverse cross.",
    source: `// Inputs
const fastN = 50;
const slowN = 200;

// Compute indicators
const closes = bars.map(b => b.c);
const fast = ind.sma(closes, fastN);
const slow = ind.sma(closes, slowN);

// Plot indicator overlays so the chart shows them
plot("fast SMA", fast, "#33BBFF");
plot("slow SMA", slow, "#f0a020");

// Signal logic - runs once per bar
const i = ctx.i;
if (i < 1) return;

if (fast[i-1] != null && slow[i-1] != null && fast[i] != null && slow[i] != null) {
  if (fast[i-1] <= slow[i-1] && fast[i] > slow[i] && ctx.position !== "long") {
    long(bars[i].c);
  } else if (fast[i-1] >= slow[i-1] && fast[i] < slow[i] && ctx.position === "long") {
    exit(bars[i].c);
  }
}`,
  },
  {
    id: "rsi-mr",
    name: "RSI Mean Reversion (14, 30/70)",
    category: "Mean Reversion",
    description:
      "Buy when RSI dips below 30 (oversold), close when RSI rallies above 70 (overbought). Counter-trend.",
    source: `const rsiN = 14;
const lowThresh = 30;
const highThresh = 70;

const closes = bars.map(b => b.c);
const rsiVals = ind.rsi(closes, rsiN);

// Plot RSI in its sub-pane
plot("RSI", rsiVals, "#e063b8", "sub-rsi");

const i = ctx.i;
if (i < 1) return;
const r = rsiVals[i];
const rPrev = rsiVals[i-1];
if (r == null || rPrev == null) return;

if (rPrev >= lowThresh && r < lowThresh && ctx.position !== "long") {
  long(bars[i].c);
} else if (rPrev <= highThresh && r > highThresh && ctx.position === "long") {
  exit(bars[i].c);
}`,
  },
  {
    id: "macd-trend",
    name: "MACD Trend",
    category: "Trend",
    description:
      "Long when MACD line crosses above its signal line; close on the reverse cross.",
    source: `const closes = bars.map(b => b.c);
const m = ind.macd(closes, 12, 26, 9);

plot("MACD", m.macd, "#33BBFF", "sub-macd");
plot("Signal", m.signal, "#f0a020", "sub-macd");
plot("Hist", m.hist, "#5dd39e", "sub-macd", "histogram");

const i = ctx.i;
if (i < 1) return;
const macdNow = m.macd[i];
const sigNow = m.signal[i];
const macdPrev = m.macd[i-1];
const sigPrev = m.signal[i-1];
if (macdNow == null || sigNow == null || macdPrev == null || sigPrev == null) return;

if (macdPrev <= sigPrev && macdNow > sigNow && ctx.position !== "long") {
  long(bars[i].c);
} else if (macdPrev >= sigPrev && macdNow < sigNow && ctx.position === "long") {
  exit(bars[i].c);
}`,
  },
  {
    id: "bb-breakout",
    name: "Bollinger Breakout",
    category: "Volatility",
    description:
      "Long when price breaks above the upper Bollinger band (20, 2σ); exit when it crosses back below the middle band.",
    source: `const closes = bars.map(b => b.c);
const b = ind.bb(closes, 20, 2);

plot("BB upper", b.upper, "#9a8df0");
plot("BB middle", b.middle, "#9a8df0");
plot("BB lower", b.lower, "#9a8df0");

const i = ctx.i;
if (i < 1 || b.upper[i] == null || b.middle[i] == null) return;

const cur = bars[i].c;
const prevC = bars[i-1].c;

if (prevC <= b.upper[i-1] && cur > b.upper[i] && ctx.position !== "long") {
  long(cur);
} else if (prevC >= b.middle[i-1] && cur < b.middle[i] && ctx.position === "long") {
  exit(cur);
}`,
  },
  {
    id: "atr-trail",
    name: "ATR Trailing Stop",
    category: "Volatility",
    description:
      "Trend-follow long, exit when price falls more than 3×ATR from the highest close since entry.",
    source: `const closes = bars.map(b => b.c);
const atrVals = ind.atr(bars, 14);
const fast = ind.sma(closes, 20);
const slow = ind.sma(closes, 50);

plot("SMA 20", fast, "#33BBFF");
plot("SMA 50", slow, "#f0a020");

const i = ctx.i;
if (i < 1) return;
const a = atrVals[i];
if (a == null) return;

// Track highest close since long entry across the run
ctx.state = ctx.state || { highSince: 0 };

if (fast[i-1] != null && slow[i-1] != null && fast[i] != null && slow[i] != null) {
  if (fast[i-1] <= slow[i-1] && fast[i] > slow[i] && ctx.position !== "long") {
    long(bars[i].c);
    ctx.state.highSince = bars[i].c;
  }
}

if (ctx.position === "long") {
  if (bars[i].c > ctx.state.highSince) ctx.state.highSince = bars[i].c;
  if (bars[i].c < ctx.state.highSince - 3 * a) {
    exit(bars[i].c);
    ctx.state.highSince = 0;
  }
}`,
  },
  {
    id: "rsi-macd-combo",
    name: "RSI + MACD Combo",
    category: "Combo",
    description:
      "Two-confirmation entry: RSI oversold AND MACD bullish cross. Exit on either RSI overbought or MACD bearish cross.",
    source: `const closes = bars.map(b => b.c);
const rsiVals = ind.rsi(closes, 14);
const m = ind.macd(closes, 12, 26, 9);

plot("RSI", rsiVals, "#e063b8", "sub-rsi");
plot("MACD", m.macd, "#33BBFF", "sub-macd");
plot("Signal", m.signal, "#f0a020", "sub-macd");

const i = ctx.i;
if (i < 1) return;
const r = rsiVals[i];
const rPrev = rsiVals[i-1];
const macdNow = m.macd[i];
const sigNow = m.signal[i];
const macdPrev = m.macd[i-1];
const sigPrev = m.signal[i-1];
if (r == null || rPrev == null || macdNow == null || sigNow == null || macdPrev == null || sigPrev == null) return;

const rsiOversold = r < 35 && rPrev >= 35;
const rsiOverbought = r > 65 && rPrev <= 65;
const macdBull = macdPrev <= sigPrev && macdNow > sigNow;
const macdBear = macdPrev >= sigPrev && macdNow < sigNow;

if ((rsiOversold || macdBull) && ctx.position !== "long") {
  long(bars[i].c);
} else if ((rsiOverbought || macdBear) && ctx.position === "long") {
  exit(bars[i].c);
}`,
  },
];

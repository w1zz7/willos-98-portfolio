/**
 * One-shot data prep for the Golf Data Lab app.
 *
 * Reads CSVs from /Users/willzzh/Downloads/archive/, trains a logistic
 * regression on the wide-format weather/play data, and aggregates the
 * 36k-row PGA Tour 2015-2022 dataset down to ~250KB of JSONs that ship
 * with the bundle.
 *
 * Run:  node scripts/prep-golf-data.mjs
 * Outputs to: data/golfdata/*.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORTFOLIO_ROOT = join(__dirname, "..");
const ARCHIVE = "/Users/willzzh/Downloads/archive";
const OUT_DIR = join(PORTFOLIO_ROOT, "data", "golfdata");

mkdirSync(OUT_DIR, { recursive: true });

// ---------- CSV helpers ----------

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cells[j];
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function num(v) {
  if (v == null || v === "" || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- Wide-format weather/play data ----------

const wideText = readFileSync(join(ARCHIVE, "golf_dataset_wide_format.csv"), "utf-8");
const wide = parseCSV(wideText);
console.log("Wide rows:", wide.length);

// Reshape to per-day records (avg play across A-G players)
const days = wide.map((r) => {
  const playCols = ["Play_A", "Play_B", "Play_C", "Play_D", "Play_E", "Play_F", "Play_G"];
  const hourCols = playCols.map((p) => p.replace("Play_", "PlayTimeHour_"));
  const playSum = playCols.reduce((a, c) => a + (num(r[c]) || 0), 0);
  const hourSum = hourCols.reduce((a, c) => a + (num(r[c]) || 0), 0);
  return {
    date: r.Date,
    weekday: num(r.Weekday),
    month: r.Month,
    season: r.Season,
    holiday: num(r.Holiday) === 1,
    temp: num(r.Temperature),
    humidity: num(r.Humidity),
    windy: num(r.Windy) === 1,
    outlook: r.Outlook,
    crowdedness: num(r.Crowdedness),
    playersPlayed: playSum, // 0..7
    avgPlayHours: playSum > 0 ? hourSum / playSum : 0,
    anyPlay: playSum > 0 ? 1 : 0, // binary target
  };
});

// ---------- Train logistic regression ----------
// Features: temp_norm, humidity_norm, windy, outlook one-hot (sunny/overcast/rain/snow)
// Target: anyPlay (1 if any of 7 players played)

const OUTLOOKS = ["sunny", "overcast", "rain", "snow"];

function featurize(d) {
  // Normalize: temp roughly -10..40°C → 0..1; humidity 0..100 → 0..1
  const ol = OUTLOOKS.map((o) => (d.outlook === o ? 1 : 0));
  return [
    1, // bias
    Math.max(0, Math.min(1, ((d.temp ?? 15) + 10) / 50)),
    Math.max(0, Math.min(1, (d.humidity ?? 50) / 100)),
    d.windy ? 1 : 0,
    ...ol,
  ];
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Seeded LCG (linear congruential generator) — deterministic so model weights
 * are reproducible run-to-run. Math.random() leaks non-determinism into the
 * trained model, which jiggles every metric in the UI between prep runs.
 */
function makeSeededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function trainLR(rows, epochs = 800, lr = 0.05) {
  const X = rows.map(featurize);
  const y = rows.map((r) => r.anyPlay);
  const nFeat = X[0].length;
  let w = new Array(nFeat).fill(0);
  const rng = makeSeededRng(42);
  // Small deterministic init (not on bias) to break symmetry.
  for (let i = 1; i < nFeat; i++) w[i] = (rng() - 0.5) * 0.1;

  for (let e = 0; e < epochs; e++) {
    const grad = new Array(nFeat).fill(0);
    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((s, v, k) => s + v * w[k], 0);
      const p = sigmoid(z);
      const err = p - y[i];
      for (let k = 0; k < nFeat; k++) grad[k] += err * X[i][k];
    }
    for (let k = 0; k < nFeat; k++) w[k] -= (lr * grad[k]) / X.length;
  }

  // Final accuracy
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const z = X[i].reduce((s, v, k) => s + v * w[k], 0);
    const p = sigmoid(z);
    if ((p > 0.5 ? 1 : 0) === y[i]) correct++;
  }

  return { weights: w, accuracy: correct / X.length, n: X.length };
}

const cleanDays = days.filter((d) => d.outlook && d.temp != null && d.humidity != null);
const lr = trainLR(cleanDays);
console.log(`LR trained on ${lr.n} days. Accuracy: ${(lr.accuracy * 100).toFixed(2)}%`);

const featureNames = [
  "bias",
  "temp_norm",
  "humidity_norm",
  "windy",
  ...OUTLOOKS.map((o) => `outlook_${o}`),
];

writeFileSync(
  join(OUT_DIR, "model.json"),
  JSON.stringify(
    {
      weights: lr.weights,
      featureNames,
      accuracy: lr.accuracy,
      trainedOn: lr.n,
      target: "any of 7 players played that day",
      hyperparams: { epochs: 800, lr: 0.05, optimizer: "batch GD" },
    },
    null,
    2
  )
);

// ---------- 3D scatter sample (full year, sampled) ----------
// Send ~365 points (one year) for the 3D viz. Each: temp, humidity,
// crowdedness, anyPlay, season, outlook.

const yearOne = days.slice(0, 365).filter((d) => d.temp != null && d.humidity != null);
writeFileSync(
  join(OUT_DIR, "scatter3d.json"),
  JSON.stringify(
    yearOne.map((d) => ({
      d: d.date,
      t: Math.round(d.temp * 10) / 10,
      h: Math.round(d.humidity * 10) / 10,
      c: Math.round((d.crowdedness ?? 0) * 100) / 100,
      p: d.anyPlay,
      o: d.outlook,
      s: d.season,
      hr: Math.round(d.avgPlayHours * 10) / 10,
    })),
    null
  )
);

// ---------- EDA aggregates ----------

const byOutlook = {};
const bySeason = {};
const byMonth = {};
for (const d of days) {
  if (d.outlook) {
    const o = byOutlook[d.outlook] ?? { total: 0, played: 0, sumHours: 0 };
    o.total++;
    o.played += d.anyPlay;
    o.sumHours += d.avgPlayHours;
    byOutlook[d.outlook] = o;
  }
  if (d.season) {
    const s = bySeason[d.season] ?? { total: 0, played: 0, sumHours: 0, sumTemp: 0 };
    s.total++;
    s.played += d.anyPlay;
    s.sumHours += d.avgPlayHours;
    s.sumTemp += d.temp ?? 0;
    bySeason[d.season] = s;
  }
  if (d.month) {
    const m = byMonth[d.month] ?? { total: 0, played: 0, sumHours: 0, sumTemp: 0 };
    m.total++;
    m.played += d.anyPlay;
    m.sumHours += d.avgPlayHours;
    m.sumTemp += d.temp ?? 0;
    byMonth[d.month] = m;
  }
}

const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const seasonOrder = ["Winter", "Spring", "Summer", "Autumn"];

writeFileSync(
  join(OUT_DIR, "eda.json"),
  JSON.stringify(
    {
      totalDays: days.length,
      byOutlook: Object.entries(byOutlook).map(([k, v]) => ({
        outlook: k,
        days: v.total,
        playRate: v.played / v.total,
        avgHoursWhenPlayed: v.sumHours / Math.max(1, v.played),
      })),
      bySeason: seasonOrder
        .map((s) => {
          const v = bySeason[s];
          if (!v) return null;
          return {
            season: s,
            days: v.total,
            playRate: v.played / v.total,
            avgTemp: v.sumTemp / v.total,
            avgHoursWhenPlayed: v.sumHours / Math.max(1, v.played),
          };
        })
        .filter(Boolean),
      byMonth: monthOrder
        .map((m) => {
          const v = byMonth[m];
          if (!v) return null;
          return {
            month: m,
            days: v.total,
            playRate: v.played / v.total,
            avgTemp: v.sumTemp / v.total,
          };
        })
        .filter(Boolean),
    },
    null,
    2
  )
);

// ---------- Sample text records ----------

// === Phase E: text samples removed ===
// The long-format text dataset (reviews / emails / maintenance) had no
// connection to the real PGA Tour analysis and read like synthetic
// scaffolding. Killing the block to tighten the project to two honest
// datasets: weather (pedagogical) + PGA Tour (real).

// ---------- PGA Tour aggregation ----------

const pgaText = readFileSync(join(ARCHIVE, "ASA All PGA Raw Data - Tourn Level.csv"), "utf-8");
const pga = parseCSV(pgaText);
console.log("PGA rows:", pga.length);

// Per-season per-player aggregates
const playerSeason = new Map();
for (const r of pga) {
  const season = num(r.season);
  const player = (r.player || "").trim();
  if (!season || !player) continue;
  const sgTotal = num(r.sg_total);
  const sgPutt = num(r.sg_putt);
  const sgArg = num(r.sg_arg);
  const sgApp = num(r.sg_app);
  const sgOtt = num(r.sg_ott);
  const madeCut = num(r.made_cut);
  const purse = num(r.purse);
  const rounds = num(r.n_rounds);
  const finish = num(r.Finish?.replace?.(/[^0-9]/g, ""));

  const key = `${season}__${player}`;
  const cur =
    playerSeason.get(key) ??
    {
      player,
      season,
      events: 0,
      cuts: 0,
      sgTotalSum: 0,
      sgTotalN: 0,
      sgPuttSum: 0,
      sgArgSum: 0,
      sgAppSum: 0,
      sgOttSum: 0,
      sgCompN: 0,
      purseSum: 0,
      bestFinish: 999,
      wins: 0,
      top10: 0,
      rounds: 0,
    };
  cur.events++;
  if (madeCut === 1) cur.cuts++;
  if (sgTotal != null) {
    cur.sgTotalSum += sgTotal;
    cur.sgTotalN++;
  }
  if (sgPutt != null && sgArg != null && sgApp != null && sgOtt != null) {
    cur.sgPuttSum += sgPutt;
    cur.sgArgSum += sgArg;
    cur.sgAppSum += sgApp;
    cur.sgOttSum += sgOtt;
    cur.sgCompN++;
  }
  if (purse != null) cur.purseSum += purse;
  if (rounds != null) cur.rounds += rounds;
  if (finish != null && finish > 0) {
    if (finish < cur.bestFinish) cur.bestFinish = finish;
    if (finish === 1) cur.wins++;
    if (finish <= 10) cur.top10++;
  }
  playerSeason.set(key, cur);
}

const seasonsAll = [...new Set([...playerSeason.values()].map((p) => p.season))].sort();
console.log("Seasons:", seasonsAll.join(", "));

// Top 30 per season by avg sg_total (min 5 events)
const seasonsOut = {};
for (const s of seasonsAll) {
  const all = [...playerSeason.values()].filter((p) => p.season === s && p.events >= 5);
  const ranked = all
    .map((p) => ({
      player: p.player,
      events: p.events,
      cutPct: p.cuts / p.events,
      avgSgTotal: p.sgTotalN > 0 ? p.sgTotalSum / p.sgTotalN : null,
      avgSgPutt: p.sgCompN > 0 ? p.sgPuttSum / p.sgCompN : null,
      avgSgArg: p.sgCompN > 0 ? p.sgArgSum / p.sgCompN : null,
      avgSgApp: p.sgCompN > 0 ? p.sgAppSum / p.sgCompN : null,
      avgSgOtt: p.sgCompN > 0 ? p.sgOttSum / p.sgCompN : null,
      bestFinish: p.bestFinish === 999 ? null : p.bestFinish,
      wins: p.wins,
      top10: p.top10,
      rounds: p.rounds,
    }))
    .filter((p) => p.avgSgTotal != null)
    .sort((a, b) => b.avgSgTotal - a.avgSgTotal)
    .slice(0, 30);
  seasonsOut[s] = ranked;
}

// Top 50 across all seasons by total events × avg SG
const allTime = [...playerSeason.values()].reduce((acc, p) => {
  const cur =
    acc.get(p.player) ??
    {
      player: p.player,
      events: 0,
      cuts: 0,
      wins: 0,
      top10: 0,
      sgTotalSum: 0,
      sgTotalN: 0,
      seasons: new Set(),
    };
  cur.events += p.events;
  cur.cuts += p.cuts;
  cur.wins += p.wins;
  cur.top10 += p.top10;
  cur.sgTotalSum += p.sgTotalSum;
  cur.sgTotalN += p.sgTotalN;
  cur.seasons.add(p.season);
  acc.set(p.player, cur);
  return acc;
}, new Map());

const topAll = [...allTime.values()]
  .filter((p) => p.events >= 30 && p.sgTotalN > 0)
  .map((p) => ({
    player: p.player,
    events: p.events,
    cutPct: p.cuts / p.events,
    wins: p.wins,
    top10: p.top10,
    avgSgTotal: p.sgTotalSum / p.sgTotalN,
    seasons: [...p.seasons].sort(),
  }))
  .sort((a, b) => b.avgSgTotal - a.avgSgTotal)
  .slice(0, 50);

// Course aggregates: avg score relative to par per course
const byCourse = {};
for (const r of pga) {
  const c = (r.course || "").trim();
  const sgTotal = num(r.sg_total);
  if (!c || sgTotal == null) continue;
  const cur = byCourse[c] ?? { events: 0, sgTotalSum: 0, players: new Set() };
  cur.events++;
  cur.sgTotalSum += sgTotal;
  if (r.player) cur.players.add(r.player.trim());
  byCourse[c] = cur;
}
const courseList = Object.entries(byCourse)
  .filter(([, v]) => v.events >= 50)
  .map(([course, v]) => ({
    course,
    events: v.events,
    uniquePlayers: v.players.size,
    avgSgTotal: v.sgTotalSum / v.events,
  }))
  .sort((a, b) => b.events - a.events)
  .slice(0, 25);

// Per-player season-by-season trend for the top 50 (drill-down data)
const topPlayerNames = new Set(topAll.map((p) => p.player));
const playerTrends = {};
for (const p of [...playerSeason.values()].filter((p) => topPlayerNames.has(p.player))) {
  const arr = playerTrends[p.player] ?? [];
  arr.push({
    season: p.season,
    events: p.events,
    cutPct: p.cuts / p.events,
    wins: p.wins,
    top10: p.top10,
    avgSgTotal: p.sgTotalN > 0 ? p.sgTotalSum / p.sgTotalN : null,
    avgSgPutt: p.sgCompN > 0 ? p.sgPuttSum / p.sgCompN : null,
    avgSgArg: p.sgCompN > 0 ? p.sgArgSum / p.sgCompN : null,
    avgSgApp: p.sgCompN > 0 ? p.sgAppSum / p.sgCompN : null,
    avgSgOtt: p.sgCompN > 0 ? p.sgOttSum / p.sgCompN : null,
  });
  playerTrends[p.player] = arr.sort((a, b) => a.season - b.season);
}

writeFileSync(
  join(OUT_DIR, "pga_tour.json"),
  JSON.stringify(
    {
      totalRows: pga.length,
      seasons: seasonsAll,
      bySeason: seasonsOut,
      topAllTime: topAll,
      topCourses: courseList,
      playerTrends,
    },
    null
  )
);

// =====================================================================
// === ML #2: PGA Cut Prediction (logistic regression) ================
// =====================================================================
// Features per tournament-row:
//   season_sg_total_lagged (player's prior-season avg SG-Total or 0)
//   prior_cut_pct          (player's prior-season cut rate or 0.5)
//   prior_top10_rate       (prior-season top-10 / events or 0.05)
//   purse_norm             (tournament purse normalized 0..1)
//   season_idx             (encoded 0..7 for 2015..2022 - minor effect)
// Target: made_cut binary

console.log("\nTraining PGA cut-prediction logistic regression...");

// Build per-player season-level lagged features
const playerSeasonStats = new Map();
for (const r of pga) {
  const season = num(r.season);
  const player = (r.player || "").trim();
  if (!season || !player) continue;
  const k = `${season}__${player}`;
  const cur =
    playerSeasonStats.get(k) ?? { events: 0, cuts: 0, top10: 0, sgTotalSum: 0, sgTotalN: 0 };
  cur.events++;
  if (num(r.made_cut) === 1) cur.cuts++;
  const f = num(r.Finish?.replace?.(/[^0-9]/g, ""));
  if (f != null && f > 0 && f <= 10) cur.top10++;
  const s = num(r.sg_total);
  if (s != null) {
    cur.sgTotalSum += s;
    cur.sgTotalN++;
  }
  playerSeasonStats.set(k, cur);
}

const purseMin = Math.min(
  ...pga.map((r) => num(r.purse)).filter((v) => v != null && v > 0)
);
const purseMax = Math.max(...pga.map((r) => num(r.purse)).filter((v) => v != null));

const cutTrainRows = [];
for (const r of pga) {
  const season = num(r.season);
  const player = (r.player || "").trim();
  const madeCut = num(r.made_cut);
  if (!season || !player || madeCut == null) continue;
  if (season === seasonsAll[0]) continue; // need lag - skip earliest season

  const priorKey = `${season - 1}__${player}`;
  const prior = playerSeasonStats.get(priorKey);
  const purse = num(r.purse) ?? 0;
  const purseNorm = (purse - purseMin) / Math.max(1, purseMax - purseMin);

  cutTrainRows.push({
    season,
    x: [
      1, // bias
      prior && prior.sgTotalN > 0 ? prior.sgTotalSum / prior.sgTotalN : 0, // lagged SG-Total
      prior ? prior.cuts / Math.max(1, prior.events) : 0.5, // prior cut rate
      prior ? prior.top10 / Math.max(1, prior.events) : 0.05, // prior top10 rate
      Math.max(0, Math.min(1, purseNorm)), // purse normalized
      (season - seasonsAll[0]) / (seasonsAll.length - 1), // season index 0..1
    ],
    y: madeCut,
  });
}

console.log(`Cut model train rows: ${cutTrainRows.length}`);

function trainLR2(rows, epochs = 600, lr = 0.1) {
  const X = rows.map((r) => r.x);
  const y = rows.map((r) => r.y);
  const nFeat = X[0].length;
  let w = new Array(nFeat).fill(0);
  const rng = makeSeededRng(42);
  for (let i = 1; i < nFeat; i++) w[i] = (rng() - 0.5) * 0.1;
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(nFeat).fill(0);
    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((s, v, k) => s + v * w[k], 0);
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[i];
      for (let k = 0; k < nFeat; k++) grad[k] += err * X[i][k];
    }
    for (let k = 0; k < nFeat; k++) w[k] -= (lr * grad[k]) / X.length;
  }
  let correct = 0;
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < X.length; i++) {
    const z = X[i].reduce((s, v, k) => s + v * w[k], 0);
    const p = 1 / (1 + Math.exp(-z));
    const pred = p > 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
    if (pred === 1 && y[i] === 1) tp++;
    if (pred === 1 && y[i] === 0) fp++;
    if (pred === 0 && y[i] === 1) fn++;
    if (pred === 0 && y[i] === 0) tn++;
  }
  return {
    weights: w,
    accuracy: correct / X.length,
    n: X.length,
    confusion: { tp, fp, fn, tn },
    baseRate: y.reduce((a, b) => a + b, 0) / y.length,
  };
}

const cutModel = trainLR2(cutTrainRows);
console.log(
  `  Cut LR accuracy: ${(cutModel.accuracy * 100).toFixed(2)}% on ${cutModel.n} rows (base rate ${(cutModel.baseRate * 100).toFixed(1)}%)`
);

// === Walk-forward CV: 3 folds, test seasons 2020/2021/2022 ===========
// For each test season Y, train on rows where season < Y, then predict
// rows where season === Y. Persist per-fold OOS accuracy + lift over base
// rate, plus a 10-decile calibration table over the stitched OOS predictions.
console.log("  Running walk-forward CV on cut model (test seasons 2020/2021/2022)...");

function predictLR(weights, x) {
  const z = x.reduce((s, v, k) => s + v * weights[k], 0);
  return 1 / (1 + Math.exp(-z));
}

const cutTestSeasons = [2020, 2021, 2022];
const cutFolds = [];
const oosPreds = []; // { p, y } across all folds for stitched calibration
for (const testSeason of cutTestSeasons) {
  const trainSlice = cutTrainRows.filter((r) => r.season < testSeason);
  const testSlice = cutTrainRows.filter((r) => r.season === testSeason);
  if (trainSlice.length < 100 || testSlice.length < 50) continue;
  const foldModel = trainLR2(trainSlice);
  let correct = 0;
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let yMean = 0;
  for (const row of testSlice) {
    const p = predictLR(foldModel.weights, row.x);
    const pred = p > 0.5 ? 1 : 0;
    if (pred === row.y) correct++;
    if (pred === 1 && row.y === 1) tp++;
    if (pred === 1 && row.y === 0) fp++;
    if (pred === 0 && row.y === 1) fn++;
    if (pred === 0 && row.y === 0) tn++;
    yMean += row.y;
    oosPreds.push({ p, y: row.y });
  }
  const baseRate = yMean / testSlice.length;
  const accuracy = correct / testSlice.length;
  cutFolds.push({
    testSeason,
    nTrain: trainSlice.length,
    nTest: testSlice.length,
    accuracy: Number(accuracy.toFixed(4)),
    baseRate: Number(baseRate.toFixed(4)),
    lift: Number((accuracy - baseRate).toFixed(4)),
    confusion: { tp, fp, fn, tn },
  });
}

// 10-decile calibration: bucket OOS predictions by predicted P(cut),
// average actual cut rate inside each bucket → diagonal = perfect calibration
const calibrationBins = [];
const NB = 10;
for (let b = 0; b < NB; b++) {
  const lo = b / NB;
  const hi = (b + 1) / NB;
  const bucket = oosPreds.filter((o) => o.p >= lo && o.p < (b === NB - 1 ? 1.0001 : hi));
  if (bucket.length === 0) {
    calibrationBins.push({ bin: b, lo, hi, n: 0, predMean: (lo + hi) / 2, actualRate: 0 });
    continue;
  }
  const predMean = bucket.reduce((a, o) => a + o.p, 0) / bucket.length;
  const actualRate = bucket.reduce((a, o) => a + o.y, 0) / bucket.length;
  calibrationBins.push({
    bin: b,
    lo: Number(lo.toFixed(2)),
    hi: Number(hi.toFixed(2)),
    n: bucket.length,
    predMean: Number(predMean.toFixed(4)),
    actualRate: Number(actualRate.toFixed(4)),
  });
}

// Brier score: mean((p - y)^2) - lower is better; perfect = 0
const brier = oosPreds.length
  ? oosPreds.reduce((a, o) => a + (o.p - o.y) ** 2, 0) / oosPreds.length
  : 0;

console.log(`  OOS folds: ${cutFolds.length}, mean lift over base rate: ${(cutFolds.reduce((a, f) => a + f.lift, 0) / Math.max(1, cutFolds.length) * 100).toFixed(2)}pp, Brier: ${brier.toFixed(4)}`);

writeFileSync(
  join(OUT_DIR, "cut_model.json"),
  JSON.stringify(
    {
      weights: cutModel.weights,
      featureNames: [
        "bias",
        "prior_season_sg_total",
        "prior_cut_pct",
        "prior_top10_rate",
        "purse_norm",
        "season_idx",
      ],
      featureLabels: [
        "Baseline",
        "Prior-season SG-Total",
        "Prior cut rate",
        "Prior top-10 rate",
        "Tournament purse",
        "Season (era)",
      ],
      accuracy: cutModel.accuracy,
      baseRate: cutModel.baseRate,
      trainedOn: cutModel.n,
      confusion: cutModel.confusion,
      hyperparams: { epochs: 600, lr: 0.1, optimizer: "batch GD" },
      target: "made_cut (binary) on row-level tournament data 2016-2022",
      note: "Features are lagged from the player's prior season - leak-free.",
      walkForward: {
        method: "Per test season Y, train on rows season<Y, test on season===Y",
        testSeasons: cutTestSeasons,
        folds: cutFolds,
        meanOosLift: Number((cutFolds.reduce((a, f) => a + f.lift, 0) / Math.max(1, cutFolds.length)).toFixed(4)),
        meanOosAccuracy: Number((cutFolds.reduce((a, f) => a + f.accuracy, 0) / Math.max(1, cutFolds.length)).toFixed(4)),
        meanOosBaseRate: Number((cutFolds.reduce((a, f) => a + f.baseRate, 0) / Math.max(1, cutFolds.length)).toFixed(4)),
      },
      calibration: {
        method: "10-decile bucketing of stitched OOS predictions",
        bins: calibrationBins,
        brierScore: Number(brier.toFixed(4)),
        nOosPredictions: oosPreds.length,
      },
    },
    null,
    2
  )
);

// =====================================================================
// === Unsupervised: K-means archetype clustering on top 50 ===========
// =====================================================================
// Input features per player (z-scored): avgSgPutt, avgSgArg, avgSgApp, avgSgOtt
// Result: cluster id per player + named archetype (Pure putter, Ball striker, etc.)

console.log("\nClustering top 50 players into archetypes (k-means k=4)...");

// Career averages from playerSeason aggregates
const careerByPlayer = new Map();
for (const p of playerSeason.values()) {
  const cur =
    careerByPlayer.get(p.player) ??
    {
      player: p.player,
      events: 0,
      sgPuttSum: 0,
      sgArgSum: 0,
      sgAppSum: 0,
      sgOttSum: 0,
      sgCompN: 0,
      sgTotalSum: 0,
      sgTotalN: 0,
      wins: 0,
      top10: 0,
    };
  cur.events += p.events;
  cur.sgPuttSum += p.sgPuttSum;
  cur.sgArgSum += p.sgArgSum;
  cur.sgAppSum += p.sgAppSum;
  cur.sgOttSum += p.sgOttSum;
  cur.sgCompN += p.sgCompN;
  cur.sgTotalSum += p.sgTotalSum;
  cur.sgTotalN += p.sgTotalN;
  cur.wins += p.wins;
  cur.top10 += p.top10;
  careerByPlayer.set(p.player, cur);
}

const clusterPool = [...careerByPlayer.values()]
  .filter((p) => p.events >= 30 && p.sgCompN > 0 && p.sgTotalN > 0)
  .map((p) => ({
    player: p.player,
    events: p.events,
    wins: p.wins,
    top10: p.top10,
    putt: p.sgPuttSum / p.sgCompN,
    arg: p.sgArgSum / p.sgCompN,
    app: p.sgAppSum / p.sgCompN,
    ott: p.sgOttSum / p.sgCompN,
    total: p.sgTotalSum / p.sgTotalN,
  }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 60);

// z-score each feature across the pool
function zScore(arr, sel) {
  const vals = arr.map(sel);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance) || 1;
  return { mean, std };
}
const zPutt = zScore(clusterPool, (p) => p.putt);
const zArg = zScore(clusterPool, (p) => p.arg);
const zApp = zScore(clusterPool, (p) => p.app);
const zOtt = zScore(clusterPool, (p) => p.ott);
const featuresZ = clusterPool.map((p) => [
  (p.putt - zPutt.mean) / zPutt.std,
  (p.arg - zArg.mean) / zArg.std,
  (p.app - zApp.mean) / zApp.std,
  (p.ott - zOtt.mean) / zOtt.std,
]);

function kmeans(X, k, maxIter = 100, seed = 7) {
  // Deterministic init via fixed seed (linear congruential)
  let rng = seed;
  const rand = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  // Init: pick k random points
  const centroids = [];
  const usedIdx = new Set();
  while (centroids.length < k) {
    const i = Math.floor(rand() * X.length);
    if (usedIdx.has(i)) continue;
    usedIdx.add(i);
    centroids.push([...X[i]]);
  }
  const assign = new Array(X.length).fill(0);
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    for (let i = 0; i < X.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let j = 0; j < X[i].length; j++) d += (X[i][j] - centroids[c][j]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    if (!changed && it > 0) break;
    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = [];
      for (let i = 0; i < X.length; i++) if (assign[i] === c) members.push(X[i]);
      if (members.length === 0) continue;
      for (let j = 0; j < centroids[c].length; j++) {
        centroids[c][j] =
          members.reduce((a, m) => a + m[j], 0) / members.length;
      }
    }
  }
  return { assign, centroids };
}

const km = kmeans(featuresZ, 4);

// === Phase F: K-means k justification (elbow + silhouette) ===========
// "Why k=4?" - sweep k=2..6 on the same z-scored career-SG matrix and
// persist within-cluster sum-of-squares (WCSS) plus average silhouette
// score per k. WCSS shows the elbow; silhouette shows internal cluster
// quality.

function computeWcss(X, assign, centroids) {
  let wcss = 0;
  for (let i = 0; i < X.length; i++) {
    const c = centroids[assign[i]];
    for (let j = 0; j < X[i].length; j++) wcss += (X[i][j] - c[j]) ** 2;
  }
  return wcss;
}

function computeSilhouette(X, assign, k) {
  // a(i) = avg distance from i to other points in same cluster
  // b(i) = min over other clusters of avg distance from i to that cluster
  // s(i) = (b - a) / max(a, b);  ranges [-1, 1]; >0.5 = strong; <0.25 = weak
  const N = X.length;
  function dist(a, b) {
    let s = 0;
    for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
    return Math.sqrt(s);
  }
  let total = 0;
  let counted = 0;
  for (let i = 0; i < N; i++) {
    const myCluster = assign[i];
    const sumDistByCluster = new Array(k).fill(0);
    const countByCluster = new Array(k).fill(0);
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const d = dist(X[i], X[j]);
      sumDistByCluster[assign[j]] += d;
      countByCluster[assign[j]]++;
    }
    if (countByCluster[myCluster] === 0) continue; // singleton cluster
    const a = sumDistByCluster[myCluster] / countByCluster[myCluster];
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      if (countByCluster[c] === 0) continue;
      const meanD = sumDistByCluster[c] / countByCluster[c];
      if (meanD < b) b = meanD;
    }
    if (b === Infinity) continue;
    const s = (b - a) / Math.max(a, b);
    total += s;
    counted++;
  }
  return counted > 0 ? total / counted : 0;
}

const kmeansDiagnostics = [];
for (let k = 2; k <= 6; k++) {
  const trial = kmeans(featuresZ, k);
  const wcss = computeWcss(featuresZ, trial.assign, trial.centroids);
  const silhouette = computeSilhouette(featuresZ, trial.assign, k);
  kmeansDiagnostics.push({
    k,
    wcss: Number(wcss.toFixed(2)),
    silhouette: Number(silhouette.toFixed(4)),
  });
}
console.log(`  K-means diagnostics: ${kmeansDiagnostics.map((d) => `k=${d.k} WCSS=${d.wcss.toFixed(0)} sil=${d.silhouette.toFixed(2)}`).join(", ")}`);

writeFileSync(
  join(OUT_DIR, "pga_kmeans_diagnostics.json"),
  JSON.stringify({
    diagnostics: kmeansDiagnostics,
    chosenK: 4,
    nPlayers: featuresZ.length,
    features: ["putt", "arg", "app", "ott"],
    method: "Sweep k=2..6 on z-scored career-SG signatures. WCSS = within-cluster sum of squared distances (lower=tighter clusters). Silhouette = mean (b-a)/max(a,b) where a=intra-cluster avg dist, b=nearest other-cluster avg dist; range [-1,1], >0.5 strong, ~0 weak.",
  })
);

// Name each cluster by its centroid signature
function archetypeName(centroid) {
  const [putt, arg, app, ott] = centroid;
  const sorted = [
    { k: "putt", label: "Putting", v: putt },
    { k: "arg", label: "Around-Green", v: arg },
    { k: "app", label: "Approach", v: app },
    { k: "ott", label: "Off-the-Tee", v: ott },
  ].sort((a, b) => b.v - a.v);
  const top = sorted[0];
  const second = sorted[1];
  // If everything roughly balanced (max - min < 0.6 std)
  const range = sorted[0].v - sorted[3].v;
  if (range < 0.6) return "All-Rounder";
  if (top.v > 0 && top.v >= second.v + 0.3) return `${top.label} Specialist`;
  return `${top.label}-${second.label} Type`;
}

const clusterArchetypes = km.centroids.map((c) => ({
  centroid: c,
  archetype: archetypeName(c),
}));

const playerArchetypes = clusterPool.map((p, i) => ({
  player: p.player,
  cluster: km.assign[i],
  archetype: clusterArchetypes[km.assign[i]].archetype,
  events: p.events,
  wins: p.wins,
  top10: p.top10,
  putt: Number(p.putt.toFixed(3)),
  arg: Number(p.arg.toFixed(3)),
  app: Number(p.app.toFixed(3)),
  ott: Number(p.ott.toFixed(3)),
  total: Number(p.total.toFixed(3)),
}));

// =====================================================================
// === SG correlation matrix (4 components × {Total, Wins, Top10}) ====
// =====================================================================

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const corrComponents = ["putt", "arg", "app", "ott"];
const corrTargets = ["total", "wins", "top10", "events"];
const corrMatrix = corrComponents.map((c) => {
  const row = { component: c };
  for (const t of corrTargets) {
    row[t] = pearson(
      clusterPool.map((p) => p[c]),
      clusterPool.map((p) => p[t])
    );
  }
  return row;
});

// =====================================================================
// === Year-over-year improvement leaders ==============================
// =====================================================================

const improvementLeaders = [];
for (const p of careerByPlayer.values()) {
  const trend = playerTrends[p.player];
  if (!trend || trend.length < 3) continue;
  const validSeasons = trend.filter((t) => t.avgSgTotal != null);
  if (validSeasons.length < 3) continue;
  // Best season vs worst season
  const sorted = [...validSeasons].sort((a, b) => a.avgSgTotal - b.avgSgTotal);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const delta = best.avgSgTotal - worst.avgSgTotal;
  improvementLeaders.push({
    player: p.player,
    worstSeason: worst.season,
    worstSg: Number(worst.avgSgTotal.toFixed(2)),
    bestSeason: best.season,
    bestSg: Number(best.avgSgTotal.toFixed(2)),
    delta: Number(delta.toFixed(2)),
    direction: best.season > worst.season ? "up" : "down",
  });
}
improvementLeaders.sort((a, b) => b.delta - a.delta);
const topRisers = improvementLeaders
  .filter((p) => p.direction === "up")
  .slice(0, 15);
const topFallers = improvementLeaders
  .filter((p) => p.direction === "down")
  .slice(0, 15);

// =====================================================================
// === P(play) surface grids (one per outlook) for the LR weather model
// =====================================================================
// 25×25 grids over temp -10..40°C × humidity 0..100%, calm + windy=false.
// We generate ONE grid per outlook because the model is dominated by
// outlook + wind; the within-outlook (temp, humidity) tilt is small but
// crosses the 0.5 boundary for some outlooks (rain, in particular).

const w = lr.weights;
const TEMP_STEPS = 24;
const HUM_STEPS = 24;
const OUTLOOK_LIST = ["sunny", "overcast", "rain", "snow"];

function gridForOutlook(outlook) {
  const out = [];
  for (let i = 0; i <= TEMP_STEPS; i++) {
    const temp = -10 + (50 * i) / TEMP_STEPS;
    for (let j = 0; j <= HUM_STEPS; j++) {
      const hum = (100 * j) / HUM_STEPS;
      const x = [
        1,
        Math.max(0, Math.min(1, (temp + 10) / 50)),
        Math.max(0, Math.min(1, hum / 100)),
        0, // calm
        outlook === "sunny" ? 1 : 0,
        outlook === "overcast" ? 1 : 0,
        outlook === "rain" ? 1 : 0,
        outlook === "snow" ? 1 : 0,
      ];
      const z = x.reduce((s, v, k) => s + v * w[k], 0);
      const p = 1 / (1 + Math.exp(-z));
      out.push({ t: temp, h: hum, p });
    }
  }
  return out;
}

const surfacesByOutlook = {};
for (const o of OUTLOOK_LIST) surfacesByOutlook[o] = gridForOutlook(o);

// Default scene shows whichever outlook has the most balanced predictions
// (decision boundary inside the visible cube). Pick the outlook whose
// average P(play) is closest to 0.5.
const meanP = OUTLOOK_LIST.map((o) => ({
  outlook: o,
  meanP: surfacesByOutlook[o].reduce((a, c) => a + c.p, 0) / surfacesByOutlook[o].length,
}));
meanP.sort((a, b) => Math.abs(a.meanP - 0.5) - Math.abs(b.meanP - 0.5));
const defaultOutlook = meanP[0].outlook;
console.log("Surface mean p per outlook:", meanP.map((m) => `${m.outlook}=${m.meanP.toFixed(2)}`).join(" · "));

// Backwards-compatible: keep `grid` set to the default outlook so older
// consumers don't break.
const surfaceGrid = surfacesByOutlook[defaultOutlook];

// =====================================================================
// === Per-quadrant evidence stats for Scene 1 right-rail bullets =====
// =====================================================================
// Quadrant definitions over the (temp, humidity) plane:
//   warmDry:  temp >= 18°C AND humidity <= 60%
//   coldHumid: temp <= 8°C AND humidity >= 70%
//   tempBands: <5°C, 5-15°C, 15-25°C, >25°C

function pct(played, total) {
  return total > 0 ? played / total : 0;
}

let warmDry = { played: 0, total: 0 };
let coldHumid = { played: 0, total: 0 };
let tempBands = {
  "lt5": { played: 0, total: 0 },
  "5to15": { played: 0, total: 0 },
  "15to25": { played: 0, total: 0 },
  "gt25": { played: 0, total: 0 },
};
let lowHum = { played: 0, total: 0 };
let highHum = { played: 0, total: 0 };
let windyDay = { played: 0, total: 0 };
let calmDay = { played: 0, total: 0 };

for (const d of days) {
  if (d.temp == null || d.humidity == null) continue;
  if (d.temp >= 18 && d.humidity <= 60) {
    warmDry.total++;
    if (d.anyPlay) warmDry.played++;
  }
  if (d.temp <= 8 && d.humidity >= 70) {
    coldHumid.total++;
    if (d.anyPlay) coldHumid.played++;
  }
  const band = d.temp < 5 ? "lt5" : d.temp < 15 ? "5to15" : d.temp < 25 ? "15to25" : "gt25";
  tempBands[band].total++;
  if (d.anyPlay) tempBands[band].played++;
  if (d.humidity <= 50) {
    lowHum.total++;
    if (d.anyPlay) lowHum.played++;
  } else {
    highHum.total++;
    if (d.anyPlay) highHum.played++;
  }
  if (d.windy) {
    windyDay.total++;
    if (d.anyPlay) windyDay.played++;
  } else {
    calmDay.total++;
    if (d.anyPlay) calmDay.played++;
  }
}

const evidence = {
  warmDry: { rate: pct(warmDry.played, warmDry.total), n: warmDry.total },
  coldHumid: { rate: pct(coldHumid.played, coldHumid.total), n: coldHumid.total },
  tempBands: Object.fromEntries(
    Object.entries(tempBands).map(([k, v]) => [k, { rate: pct(v.played, v.total), n: v.total }])
  ),
  lowHum: { rate: pct(lowHum.played, lowHum.total), n: lowHum.total },
  highHum: { rate: pct(highHum.played, highHum.total), n: highHum.total },
  windy: { rate: pct(windyDay.played, windyDay.total), n: windyDay.total },
  calm: { rate: pct(calmDay.played, calmDay.total), n: calmDay.total },
};

writeFileSync(
  join(OUT_DIR, "pga_analysis.json"),
  JSON.stringify(
    {
      archetypes: clusterArchetypes.map((a, i) => ({
        cluster: i,
        archetype: a.archetype,
        centroid: {
          putt: Number(a.centroid[0].toFixed(3)),
          arg: Number(a.centroid[1].toFixed(3)),
          app: Number(a.centroid[2].toFixed(3)),
          ott: Number(a.centroid[3].toFixed(3)),
        },
        members: playerArchetypes
          .filter((p) => p.cluster === i)
          .map((p) => p.player),
      })),
      players: playerArchetypes,
      correlation: corrMatrix,
      topRisers,
      topFallers,
    },
    null,
    2
  )
);

writeFileSync(
  join(OUT_DIR, "play_surface.json"),
  JSON.stringify(
    {
      tempSteps: TEMP_STEPS + 1,
      humSteps: HUM_STEPS + 1,
      tempRange: [-10, 40],
      humRange: [0, 100],
      defaultOutlook,
      meanByOutlook: Object.fromEntries(meanP.map((m) => [m.outlook, m.meanP])),
      grid: surfaceGrid, // back-compat: default outlook
      surfacesByOutlook,
      evidence,
    },
    null
  )
);

// =====================================================================
// === A1. PCA on player 4D signatures =================================
// =====================================================================

console.log("\nRunning PCA on top-60 player 4D signatures...");

// Build matrix of z-scored (Putt, Arg, App, Ott) - already in featuresZ + clusterPool
const playerNames = clusterPool.map((p) => p.player);
const n = featuresZ.length;
const dim = 4;

// 4×4 covariance matrix
function covariance(rows) {
  const m = rows[0].length;
  const means = new Array(m).fill(0);
  for (const r of rows) for (let j = 0; j < m; j++) means[j] += r[j];
  for (let j = 0; j < m; j++) means[j] /= rows.length;
  const cov = Array.from({ length: m }, () => new Array(m).fill(0));
  for (const r of rows) {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        cov[i][j] += (r[i] - means[i]) * (r[j] - means[j]);
      }
    }
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) cov[i][j] /= rows.length - 1;
  return cov;
}

// Jacobi eigendecomposition for symmetric matrix
function jacobiEigen(A, maxIter = 100, tol = 1e-10) {
  const m = A.length;
  // Copy A
  const D = A.map((row) => [...row]);
  // Identity for V (eigenvectors as columns)
  const V = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => (i === j ? 1 : 0))
  );
  for (let iter = 0; iter < maxIter; iter++) {
    // Find off-diagonal element with largest abs value
    let p = 0,
      q = 1,
      maxVal = Math.abs(D[0][1]);
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        if (Math.abs(D[i][j]) > maxVal) {
          maxVal = Math.abs(D[i][j]);
          p = i;
          q = j;
        }
      }
    }
    if (maxVal < tol) break;
    // Compute rotation angle
    const theta = (D[q][q] - D[p][p]) / (2 * D[p][q]);
    const t =
      theta >= 0
        ? 1 / (theta + Math.sqrt(1 + theta * theta))
        : 1 / (theta - Math.sqrt(1 + theta * theta));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    // Apply rotation
    const Dpp = D[p][p];
    const Dqq = D[q][q];
    const Dpq = D[p][q];
    D[p][p] = c * c * Dpp - 2 * s * c * Dpq + s * s * Dqq;
    D[q][q] = s * s * Dpp + 2 * s * c * Dpq + c * c * Dqq;
    D[p][q] = D[q][p] = 0;
    for (let i = 0; i < m; i++) {
      if (i !== p && i !== q) {
        const Dip = D[i][p];
        const Diq = D[i][q];
        D[i][p] = D[p][i] = c * Dip - s * Diq;
        D[i][q] = D[q][i] = s * Dip + c * Diq;
      }
      const Vip = V[i][p];
      const Viq = V[i][q];
      V[i][p] = c * Vip - s * Viq;
      V[i][q] = s * Vip + c * Viq;
    }
  }
  // Extract eigenvalues + eigenvectors
  const eigenvalues = D.map((row, i) => row[i]);
  const eigenvectors = V[0].map((_, j) => V.map((r) => r[j]));
  // Sort descending by eigenvalue
  const idx = eigenvalues.map((_, i) => i).sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  return {
    eigenvalues: idx.map((i) => eigenvalues[i]),
    eigenvectors: idx.map((i) => eigenvectors[i]),
  };
}

const cov = covariance(featuresZ);
const eig = jacobiEigen(cov);
const totalVar = eig.eigenvalues.reduce((a, b) => a + b, 0);
const varExplained = eig.eigenvalues.map((v) => v / totalVar);

// Project each player onto first 3 PCs
const projections = featuresZ.map((row, i) => {
  const proj = eig.eigenvectors.slice(0, 3).map((vec) =>
    row.reduce((s, v, k) => s + v * vec[k], 0)
  );
  return {
    player: playerNames[i],
    pc1: Number(proj[0].toFixed(3)),
    pc2: Number(proj[1].toFixed(3)),
    pc3: Number(proj[2].toFixed(3)),
    putt: clusterPool[i].putt,
    arg: clusterPool[i].arg,
    app: clusterPool[i].app,
    ott: clusterPool[i].ott,
    total: clusterPool[i].total,
    wins: clusterPool[i].wins,
    events: clusterPool[i].events,
  };
});

// Loadings: project unit vectors of each original feature onto PCs
// (the eigenvector matrix transposed, scaled by sqrt of eigenvalue)
const featLabels = ["putt", "arg", "app", "ott"];
const loadings = featLabels.map((label, j) => ({
  feature: label,
  pc1: Number(eig.eigenvectors[0][j].toFixed(3)),
  pc2: Number(eig.eigenvectors[1][j].toFixed(3)),
  pc3: Number(eig.eigenvectors[2][j].toFixed(3)),
}));

console.log(
  "  PCA variance explained:",
  varExplained.map((v, i) => `PC${i + 1}=${(v * 100).toFixed(1)}%`).join(" · ")
);

writeFileSync(
  join(OUT_DIR, "pca.json"),
  JSON.stringify(
    {
      eigenvalues: eig.eigenvalues.map((v) => Number(v.toFixed(4))),
      varExplained: varExplained.map((v) => Number(v.toFixed(4))),
      eigenvectors: eig.eigenvectors.map((v) => v.map((x) => Number(x.toFixed(4)))),
      featureLabels: featLabels,
      loadings,
      projections,
      n,
    },
    null,
    2
  )
);

// =====================================================================
// === A2. Per-season cluster snapshots for Cluster Timeline animation
// =====================================================================

console.log("\nBuilding per-season cluster snapshots...");

const clusterTimeline = {};
for (const seasonY of seasonsAll) {
  // Top 30 players in this season by avg sg_total (need sg_compN > 0)
  const seasonPlayers = [...playerSeason.values()]
    .filter(
      (p) =>
        p.season === seasonY && p.events >= 5 && p.sgCompN > 0
    )
    .map((p) => ({
      player: p.player,
      season: p.season,
      events: p.events,
      wins: p.wins,
      putt: p.sgPuttSum / p.sgCompN,
      arg: p.sgArgSum / p.sgCompN,
      app: p.sgAppSum / p.sgCompN,
      ott: p.sgOttSum / p.sgCompN,
      total: p.sgTotalN > 0 ? p.sgTotalSum / p.sgTotalN : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  if (seasonPlayers.length < 4) {
    clusterTimeline[seasonY] = { players: seasonPlayers, centroids: [] };
    continue;
  }

  // z-score the components
  const components = ["putt", "arg", "app", "ott"];
  const stats = components.map((c) => {
    const vals = seasonPlayers.map((p) => p[c]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return { mean, std: Math.sqrt(variance) || 1 };
  });
  const X = seasonPlayers.map((p) =>
    components.map((c, i) => (p[c] - stats[i].mean) / stats[i].std)
  );
  // k-means k=4 on the season's normalized data
  const k = Math.min(4, seasonPlayers.length);
  const km = kmeans(X, k);

  // Compute centroid coords in original (un-z-scored) space for rendering
  const centroidsOrig = km.centroids.map((c) =>
    c.map((v, i) => v * stats[i].std + stats[i].mean)
  );

  clusterTimeline[seasonY] = {
    players: seasonPlayers.map((p, i) => ({
      ...p,
      cluster: km.assign[i],
      // Round to keep payload small
      putt: Number(p.putt.toFixed(3)),
      arg: Number(p.arg.toFixed(3)),
      app: Number(p.app.toFixed(3)),
      ott: Number(p.ott.toFixed(3)),
      total: Number(p.total.toFixed(3)),
    })),
    centroids: centroidsOrig.map((c) => ({
      putt: Number(c[0].toFixed(3)),
      arg: Number(c[1].toFixed(3)),
      app: Number(c[2].toFixed(3)),
      ott: Number(c[3].toFixed(3)),
    })),
  };
}

writeFileSync(
  join(OUT_DIR, "pga_cluster_timeline.json"),
  JSON.stringify({ seasons: seasonsAll, byYear: clusterTimeline }, null)
);

// =====================================================================
// === A3 + A4. Course difficulty deeper stats + Player×Course matrix
// =====================================================================

console.log("\nBuilding course difficulty stats + player×course matrix...");

// Per-course aggregates with variance + winners
const courseDeepMap = new Map();
for (const r of pga) {
  const c = (r.course || "").trim();
  const sgTotal = num(r.sg_total);
  const finish = num(r.Finish?.replace?.(/[^0-9]/g, ""));
  const player = (r.player || "").trim();
  const season = num(r.season);
  if (!c) continue;
  const cur =
    courseDeepMap.get(c) ??
    {
      course: c,
      events: 0,
      sgs: [],
      winners: new Map(),
      seasons: new Set(),
    };
  cur.events++;
  if (sgTotal != null) cur.sgs.push(sgTotal);
  if (finish === 1 && player) {
    cur.winners.set(player, (cur.winners.get(player) ?? 0) + 1);
  }
  if (season) cur.seasons.add(season);
  courseDeepMap.set(c, cur);
}

const coursesDeepFull = [...courseDeepMap.values()]
  .filter((c) => c.events >= 50 && c.sgs.length > 0)
  .map((c) => {
    const mean = c.sgs.reduce((a, b) => a + b, 0) / c.sgs.length;
    const variance =
      c.sgs.reduce((a, b) => a + (b - mean) ** 2, 0) / c.sgs.length;
    const top3 = [...c.winners.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([player, wins]) => ({ player, wins }));
    return {
      course: c.course,
      events: c.events,
      avgSgTotal: Number(mean.toFixed(3)),
      variance: Number(variance.toFixed(3)),
      stdDev: Number(Math.sqrt(variance).toFixed(3)),
      seasons: [...c.seasons].sort(),
      top3Winners: top3,
    };
  })
  .sort((a, b) => a.avgSgTotal - b.avgSgTotal); // hardest first (most negative)

const coursesDeepTop25 = coursesDeepFull.slice(0, 25);

writeFileSync(
  join(OUT_DIR, "pga_courses_deep.json"),
  JSON.stringify({ courses: coursesDeepFull, top25: coursesDeepTop25 }, null, 2)
);

// Player × Course matrix: top 15 most-played courses × top 15 by career SG
const top15Courses = coursesDeepFull
  .sort((a, b) => b.events - a.events)
  .slice(0, 15);
const top15Players = [...allTime.values()]
  .map((p) => ({
    player: p.player,
    events: p.events,
    sgTotalSum: p.sgTotalSum,
    sgTotalN: p.sgTotalN,
  }))
  .filter((p) => p.sgTotalN >= 30)
  .map((p) => ({ ...p, avgSgTotal: p.sgTotalSum / p.sgTotalN }))
  .sort((a, b) => b.avgSgTotal - a.avgSgTotal)
  .slice(0, 15);

// Build the matrix: per (player, course), avg SG-Total + n
const pcMatrix = top15Players.map((player) => {
  const cells = top15Courses.map((course) => {
    const rows = pga.filter(
      (r) =>
        r.player?.trim() === player.player &&
        r.course?.trim() === course.course
    );
    const sgs = rows.map((r) => num(r.sg_total)).filter((v) => v != null);
    if (sgs.length < 2) {
      return { course: course.course, n: sgs.length, avgSg: null };
    }
    const mean = sgs.reduce((a, b) => a + b, 0) / sgs.length;
    return {
      course: course.course,
      n: sgs.length,
      avgSg: Number(mean.toFixed(2)),
    };
  });
  return { player: player.player, careerSg: Number(player.avgSgTotal.toFixed(2)), cells };
});

writeFileSync(
  join(OUT_DIR, "pga_player_course.json"),
  JSON.stringify(
    {
      courses: top15Courses.map((c) => ({ course: c.course, events: c.events })),
      players: pcMatrix,
    },
    null,
    2
  )
);

// =====================================================================
// === A5. Major championship splits ====================================
// =====================================================================

console.log("\nBuilding major championship splits...");

const MAJOR_RX = /(masters|pga championship|u\.?s\.? open|(british|the) open|open championship)/i;
const isMajor = (name) => name && MAJOR_RX.test(name);

const playerMajorStats = new Map();
for (const r of pga) {
  const player = (r.player || "").trim();
  const tname = r.tournament_name || r["tournament name"] || "";
  if (!player) continue;
  const major = isMajor(tname);
  const sgTotal = num(r.sg_total);
  const finish = num(r.Finish?.replace?.(/[^0-9]/g, ""));
  const madeCut = num(r.made_cut);
  const cur =
    playerMajorStats.get(player) ??
    {
      player,
      majors: { events: 0, cuts: 0, wins: 0, top10: 0, sgSum: 0, sgN: 0 },
      regular: { events: 0, cuts: 0, wins: 0, top10: 0, sgSum: 0, sgN: 0 },
    };
  const bucket = major ? cur.majors : cur.regular;
  bucket.events++;
  if (madeCut === 1) bucket.cuts++;
  if (finish === 1) bucket.wins++;
  if (finish != null && finish > 0 && finish <= 10) bucket.top10++;
  if (sgTotal != null) {
    bucket.sgSum += sgTotal;
    bucket.sgN++;
  }
  playerMajorStats.set(player, cur);
}

const majorSplits = [...playerMajorStats.values()]
  .filter((p) => p.majors.events >= 4 && p.regular.events >= 20 && p.majors.sgN > 0 && p.regular.sgN > 0)
  .map((p) => {
    const majorAvg = p.majors.sgSum / p.majors.sgN;
    const regAvg = p.regular.sgSum / p.regular.sgN;
    return {
      player: p.player,
      majorEvents: p.majors.events,
      majorCuts: p.majors.cuts,
      majorWins: p.majors.wins,
      majorTop10: p.majors.top10,
      majorAvgSg: Number(majorAvg.toFixed(2)),
      regularEvents: p.regular.events,
      regularCuts: p.regular.cuts,
      regularWins: p.regular.wins,
      regularAvgSg: Number(regAvg.toFixed(2)),
      majorEdge: Number((majorAvg - regAvg).toFixed(2)),
    };
  });

const bigGame = [...majorSplits].sort((a, b) => b.majorEdge - a.majorEdge).slice(0, 15);
const chokers = [...majorSplits].sort((a, b) => a.majorEdge - b.majorEdge).slice(0, 15);

writeFileSync(
  join(OUT_DIR, "pga_majors.json"),
  JSON.stringify(
    {
      players: majorSplits,
      bigGame,
      chokers,
    },
    null,
    2
  )
);

// =====================================================================
// === A6. Tournament Finish linear regression =========================
// =====================================================================

console.log("\nTraining tournament-finish linear regression...");

// Build courseDifficulty lookup (avg SG per course, normalized -1..1)
const courseDifficultyMap = new Map();
for (const c of coursesDeepFull) {
  courseDifficultyMap.set(c.course, c.avgSgTotal);
}

// Compute global course difficulty range for normalization
const courseSgs = coursesDeepFull.map((c) => c.avgSgTotal);
const courseSgMin = Math.min(...courseSgs);
const courseSgMax = Math.max(...courseSgs);
function courseDifficultyNorm(course) {
  const v = courseDifficultyMap.get(course);
  if (v == null) return 0;
  // Map (min..max) → 0..1; harder course = higher value
  return (courseSgMax - v) / Math.max(0.001, courseSgMax - courseSgMin);
}

// Reuse playerSeasonStats from earlier (lagged) for prior-season SG components
// We need lagged components per player per season.
const playerSeasonByKey = new Map();
for (const p of playerSeason.values()) {
  const key = `${p.season}__${p.player}`;
  if (p.sgCompN > 0) {
    playerSeasonByKey.set(key, {
      putt: p.sgPuttSum / p.sgCompN,
      arg: p.sgArgSum / p.sgCompN,
      app: p.sgAppSum / p.sgCompN,
      ott: p.sgOttSum / p.sgCompN,
      events: p.events,
    });
  }
}

// === Phase D: Reframe as Top-10 binary classifier ====================
// v1 was a linear regression on `finish` (1..100). R² ≈ 7% - essentially
// noise. Reframe: target is `made_top10 ∈ {0,1}`. Same lagged features,
// trained as logistic regression, evaluated walk-forward (per test season)
// with AUC + 10-decile calibration.
const top10Rows = [];
for (const r of pga) {
  const season = num(r.season);
  const player = (r.player || "").trim();
  const finish = num(r.Finish?.replace?.(/[^0-9]/g, ""));
  if (!season || !player || !finish || finish < 1 || finish > 100) continue;
  if (season === seasonsAll[0]) continue; // need lag

  const priorKey = `${season - 1}__${player}`;
  const prior = playerSeasonByKey.get(priorKey);
  if (!prior || prior.events < 5) continue;

  const tname = r.tournament_name || r["tournament name"] || "";
  const courseDiff = courseDifficultyNorm((r.course || "").trim());
  const purse = num(r.purse) ?? 0;
  const purseNorm = (purse - purseMin) / Math.max(1, purseMax - purseMin);

  top10Rows.push({
    season,
    x: [
      1, // bias
      prior.putt,
      prior.arg,
      prior.app,
      prior.ott,
      Math.max(0, Math.min(1, courseDiff)),
      Math.max(0, Math.min(1, purseNorm)),
      isMajor(tname) ? 1 : 0,
    ],
    y: finish <= 10 ? 1 : 0, // binary top-10
  });
}

console.log(`  Top-10 classifier train rows: ${top10Rows.length}`);

// Logistic regression with feature standardization (bias intact).
function trainLogisticRegression(rows, epochs = 600, lr = 0.1) {
  const X = rows.map((r) => r.x);
  const y = rows.map((r) => r.y);
  const nFeat = X[0].length;

  // Standardize features (skip bias index 0)
  const featMeans = new Array(nFeat).fill(0);
  const featStds = new Array(nFeat).fill(1);
  for (let j = 1; j < nFeat; j++) {
    let sum = 0;
    for (let i = 0; i < X.length; i++) sum += X[i][j];
    featMeans[j] = sum / X.length;
    let var2 = 0;
    for (let i = 0; i < X.length; i++) var2 += (X[i][j] - featMeans[j]) ** 2;
    featStds[j] = Math.sqrt(var2 / X.length) || 1;
  }
  const Xs = X.map((row) =>
    row.map((v, j) => (j === 0 ? 1 : (v - featMeans[j]) / featStds[j]))
  );

  let w = new Array(nFeat).fill(0);
  const rng = makeSeededRng(42);
  for (let i = 1; i < nFeat; i++) w[i] = (rng() - 0.5) * 0.05;
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(nFeat).fill(0);
    for (let i = 0; i < Xs.length; i++) {
      const z = Xs[i].reduce((s, v, k) => s + v * w[k], 0);
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[i];
      for (let k = 0; k < nFeat; k++) grad[k] += err * Xs[i][k];
    }
    for (let k = 0; k < nFeat; k++) w[k] -= (lr * grad[k]) / Xs.length;
  }
  return { weights: w, featMeans, featStds, n: Xs.length };
}

function predictLR8(weights, featMeans, featStds, xRaw) {
  const xs = xRaw.map((v, j) => (j === 0 ? 1 : (v - featMeans[j]) / featStds[j]));
  const z = xs.reduce((s, v, k) => s + v * weights[k], 0);
  return 1 / (1 + Math.exp(-z));
}

// AUC via rank-based U statistic (Mann-Whitney): correct & numerically stable.
function computeAuc(preds) {
  const n = preds.length;
  if (n === 0) return 0;
  // Sort by predicted prob ascending
  const sorted = [...preds].sort((a, b) => a.p - b.p);
  // Assign average ranks to handle ties
  let i = 0;
  const ranks = new Array(n);
  while (i < n) {
    let j = i;
    while (j < n - 1 && sorted[j + 1].p === sorted[i].p) j++;
    const avgRank = (i + j) / 2 + 1; // 1-indexed average rank
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  let sumRanksPos = 0;
  let nPos = 0;
  for (let k = 0; k < n; k++) {
    if (sorted[k].y === 1) {
      sumRanksPos += ranks[k];
      nPos++;
    }
  }
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (sumRanksPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

const top10Model = trainLogisticRegression(top10Rows);
// In-sample fit metrics - for reference; OOS is what matters.
let isAucPreds = top10Rows.map((r) => ({ p: predictLR8(top10Model.weights, top10Model.featMeans, top10Model.featStds, r.x), y: r.y }));
const isAuc = computeAuc(isAucPreds);
const isBaseRate = top10Rows.reduce((a, r) => a + r.y, 0) / top10Rows.length;
console.log(`  Top-10 IS AUC: ${isAuc.toFixed(3)} · base rate: ${(isBaseRate * 100).toFixed(2)}%`);

// === Walk-forward CV: train on season<Y, test on season===Y ==========
const top10TestSeasons = [2020, 2021, 2022];
const top10Folds = [];
const top10OosPreds = [];
for (const testSeason of top10TestSeasons) {
  const train = top10Rows.filter((r) => r.season < testSeason);
  const test = top10Rows.filter((r) => r.season === testSeason);
  if (train.length < 100 || test.length < 50) continue;
  const foldModel = trainLogisticRegression(train);
  const foldPreds = test.map((r) => ({
    p: predictLR8(foldModel.weights, foldModel.featMeans, foldModel.featStds, r.x),
    y: r.y,
  }));
  const auc = computeAuc(foldPreds);
  const baseRate = test.reduce((a, r) => a + r.y, 0) / test.length;
  top10Folds.push({
    testSeason,
    nTrain: train.length,
    nTest: test.length,
    auc: Number(auc.toFixed(4)),
    baseRate: Number(baseRate.toFixed(4)),
  });
  top10OosPreds.push(...foldPreds);
}

const oosAuc = computeAuc(top10OosPreds);

// 10-decile calibration on stitched OOS predictions
const top10CalibrationBins = [];
for (let b = 0; b < 10; b++) {
  const lo = b / 10;
  const hi = (b + 1) / 10;
  const bucket = top10OosPreds.filter((o) => o.p >= lo && o.p < (b === 9 ? 1.0001 : hi));
  if (bucket.length === 0) {
    top10CalibrationBins.push({ bin: b, lo, hi, n: 0, predMean: (lo + hi) / 2, actualRate: 0 });
    continue;
  }
  const predMean = bucket.reduce((a, o) => a + o.p, 0) / bucket.length;
  const actualRate = bucket.reduce((a, o) => a + o.y, 0) / bucket.length;
  top10CalibrationBins.push({
    bin: b,
    lo: Number(lo.toFixed(2)),
    hi: Number(hi.toFixed(2)),
    n: bucket.length,
    predMean: Number(predMean.toFixed(4)),
    actualRate: Number(actualRate.toFixed(4)),
  });
}

const top10Brier = top10OosPreds.length
  ? top10OosPreds.reduce((a, o) => a + (o.p - o.y) ** 2, 0) / top10OosPreds.length
  : 0;

console.log(`  Top-10 OOS AUC: ${oosAuc.toFixed(3)}, Brier: ${top10Brier.toFixed(4)}`);

// Repurpose `finishModel` variable name so downstream JSON key stays `finish_model.json`
// but with totally new schema (top-10 binary classifier).
const finishModel = {
  weights: top10Model.weights,
  featMeans: top10Model.featMeans,
  featStds: top10Model.featStds,
  isAuc,
  isBaseRate,
  n: top10Model.n,
  oosAuc,
  oosFolds: top10Folds,
  calibrationBins: top10CalibrationBins,
  brierScore: top10Brier,
  nOosPredictions: top10OosPreds.length,
};

// =====================================================================
// === Per-season course-difficulty timeline (for animated Scene C4) ===
// =====================================================================
// For each course in top25 + each season, compute that season's avg SG-Total
// at that course (using only that season's rows). Output a matrix: courses
// × seasons → avgSg + n.

console.log("\nBuilding per-season course-difficulty timeline...");

const courseTimelineMap = new Map();
for (const r of pga) {
  const c = (r.course || "").trim();
  const season = num(r.season);
  const sgTotal = num(r.sg_total);
  if (!c || !season || sgTotal == null) continue;
  const key = `${c}__${season}`;
  const cur = courseTimelineMap.get(key) ?? { course: c, season, sgs: [] };
  cur.sgs.push(sgTotal);
  courseTimelineMap.set(key, cur);
}

// Filter to the top25 courses (already computed earlier as `coursesDeepTop25`)
const top25CourseSet = new Set(coursesDeepTop25.map((c) => c.course));
const courseTimeline = {};
for (const c of top25CourseSet) {
  courseTimeline[c] = {};
  for (const s of seasonsAll) {
    const entry = courseTimelineMap.get(`${c}__${s}`);
    if (!entry || entry.sgs.length < 5) {
      courseTimeline[c][s] = { avgSg: null, n: entry?.sgs.length ?? 0 };
      continue;
    }
    const avg = entry.sgs.reduce((a, b) => a + b, 0) / entry.sgs.length;
    courseTimeline[c][s] = {
      avgSg: Number(avg.toFixed(3)),
      n: entry.sgs.length,
    };
  }
}

writeFileSync(
  join(OUT_DIR, "pga_courses_timeline.json"),
  JSON.stringify(
    {
      seasons: seasonsAll,
      courses: coursesDeepTop25.map((c) => c.course),
      timeline: courseTimeline,
    },
    null
  )
);

// =====================================================================
// === Per-player chronological SG-Total + rolling μ + EWMA σ
// === (Used by Model D: GBM Career Simulator)
// =====================================================================
// For each top-50 player, build the per-event SG-Total series sorted by
// date. Compute:
//   · 12-event rolling mean (μ_t)            - the "true level" estimate
//   · 12-event rolling std-dev (σ_t)         - raw rolling volatility
//   · EWMA σ_t (λ=0.94, RiskMetrics standard) - time-varying vol that
//     reacts to recent shocks (an IGARCH(1,1) special case)
//   · Career μ and σ (defaults for GBM forward sim)

console.log("\nBuilding per-player chronological career paths + rolling stats...");

const careerPathsByPlayer = new Map();
for (const r of pga) {
  const player = (r.player || "").trim();
  const sgTotal = num(r.sg_total);
  const date = r.date;
  if (!player || sgTotal == null || !date) continue;
  const arr = careerPathsByPlayer.get(player) ?? [];
  arr.push({ date, sgTotal });
  careerPathsByPlayer.set(player, arr);
}

// Sort each player's events chronologically
for (const arr of careerPathsByPlayer.values()) {
  arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Top 50 players by total event count with ≥40 events
const careerPathPlayers = [...careerPathsByPlayer.entries()]
  .filter(([, arr]) => arr.length >= 40)
  .map(([player, arr]) => ({ player, n: arr.length }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 50)
  .map((p) => p.player);

const ROLLING_WINDOW = 12;
const EWMA_LAMBDA = 0.94;

function rollingMean(arr, window) {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= window) sum -= arr[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

function rollingStd(arr, mean, window) {
  const out = new Array(arr.length).fill(null);
  for (let i = window - 1; i < arr.length; i++) {
    let s2 = 0;
    for (let k = i - window + 1; k <= i; k++) {
      const d = arr[k] - mean[i];
      s2 += d * d;
    }
    out[i] = Math.sqrt(s2 / window);
  }
  return out;
}

// EWMA variance: σ²_t = (1-λ) · ε²_{t-1} + λ · σ²_{t-1}
// Initialize σ²_0 = sample variance of first 20 obs
function ewmaSigma(arr, lambda) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < 5) return out;
  const initLen = Math.min(20, arr.length);
  const initMean = arr.slice(0, initLen).reduce((a, b) => a + b, 0) / initLen;
  let sigma2 = arr.slice(0, initLen).reduce((a, b) => a + (b - initMean) ** 2, 0) / initLen;
  let runMean = initMean;
  for (let i = 0; i < arr.length; i++) {
    if (i > 0) {
      runMean = (runMean * i + arr[i]) / (i + 1);
      const eps = arr[i] - runMean;
      sigma2 = (1 - lambda) * eps * eps + lambda * sigma2;
    }
    out[i] = Math.sqrt(sigma2);
  }
  return out;
}

const careerPaths = {};
for (const player of careerPathPlayers) {
  const arr = careerPathsByPlayer.get(player) ?? [];
  const sgs = arr.map((e) => e.sgTotal);
  const dates = arr.map((e) => e.date);
  const rollMu = rollingMean(sgs, ROLLING_WINDOW);
  const rollSig = rollingStd(sgs, rollMu, ROLLING_WINDOW);
  const ewmaSig = ewmaSigma(sgs, EWMA_LAMBDA);

  // Career-wide μ and σ (used as GBM defaults)
  const careerMu = sgs.reduce((a, b) => a + b, 0) / sgs.length;
  const careerVar = sgs.reduce((a, b) => a + (b - careerMu) ** 2, 0) / sgs.length;
  const careerSig = Math.sqrt(careerVar);

  // Trim payload: keep ~120 most recent events per player + every nth before
  const events = arr.map((e, i) => ({
    d: e.date,
    sg: Number(sgs[i].toFixed(2)),
    mu: rollMu[i] != null ? Number(rollMu[i].toFixed(3)) : null,
    rs: rollSig[i] != null ? Number(rollSig[i].toFixed(3)) : null,
    es: ewmaSig[i] != null ? Number(ewmaSig[i].toFixed(3)) : null,
  }));

  careerPaths[player] = {
    events,
    careerMu: Number(careerMu.toFixed(3)),
    careerSig: Number(careerSig.toFixed(3)),
    n: events.length,
  };
}

writeFileSync(
  join(OUT_DIR, "pga_career_paths.json"),
  JSON.stringify(
    {
      players: careerPathPlayers,
      paths: careerPaths,
      rollingWindow: ROLLING_WINDOW,
      ewmaLambda: EWMA_LAMBDA,
    },
    null
  )
);

// =====================================================================
// === Strategy backtest panel: per-month per-player avg SG-Total
// === + horizon-bucketed vol cone data (for the Strategy Lab + Vol Cone)
// =====================================================================

console.log("\nBuilding strategy backtest panel + vol cone...");

// Aggregate per-month per-player avg SG-Total. Format YYYY-MM.
const monthly = new Map();
for (const r of pga) {
  const player = (r.player || "").trim();
  const sgTotal = num(r.sg_total);
  const date = r.date;
  if (!player || sgTotal == null || !date) continue;
  const month = date.slice(0, 7);
  const key = `${month}__${player}`;
  const cur = monthly.get(key) ?? { month, player, sgs: [] };
  cur.sgs.push(sgTotal);
  monthly.set(key, cur);
}

// Universe: top 100 players by event count
const PANEL_UNIVERSE_SIZE = 100;
const panelPlayers = [...careerPathsByPlayer.entries()]
  .map(([player, arr]) => ({ player, n: arr.length }))
  .sort((a, b) => b.n - a.n)
  .slice(0, PANEL_UNIVERSE_SIZE)
  .map((p) => p.player);
const panelSet = new Set(panelPlayers);

// All months that appear, sorted
const allMonths = [...new Set([...monthly.values()].filter((e) => panelSet.has(e.player)).map((e) => e.month))].sort();

// Build wide-format panel: months as rows, players as cols, value = avg sg
const panel = {};
for (const m of allMonths) panel[m] = {};
for (const e of monthly.values()) {
  if (!panelSet.has(e.player)) continue;
  panel[e.month][e.player] = {
    sg: Number((e.sgs.reduce((a, b) => a + b, 0) / e.sgs.length).toFixed(3)),
    n: e.sgs.length,
  };
}

// Coverage stats
const monthsWithPlayer = new Map();
for (const m of allMonths) {
  for (const p of panelPlayers) {
    if (panel[m][p]) {
      monthsWithPlayer.set(p, (monthsWithPlayer.get(p) ?? 0) + 1);
    }
  }
}

writeFileSync(
  join(OUT_DIR, "pga_strategy_panel.json"),
  JSON.stringify(
    {
      months: allMonths,
      players: panelPlayers,
      panel,
      universeSize: PANEL_UNIVERSE_SIZE,
    },
    null
  )
);

// Vol cone: for each forward horizon k in {1, 3, 6, 12, 24, 48}, compute
// rolling sample std of avg-SG over k events, pooled across all players.
// Output: percentile (5/25/50/75/95) vol at each horizon.

const HORIZONS = [1, 3, 6, 12, 24, 48];
const volCone = {};
for (const k of HORIZONS) {
  const sigmas = [];
  for (const player of careerPathPlayers) {
    const arr = careerPathsByPlayer.get(player) ?? [];
    const sgs = arr.map((e) => e.sgTotal);
    if (sgs.length < k * 2) continue;
    // Sliding-window σ of the average over k consecutive events
    for (let i = k; i + k <= sgs.length; i++) {
      const window = sgs.slice(i, i + k);
      const m = window.reduce((a, b) => a + b, 0) / k;
      const var2 = window.reduce((a, b) => a + (b - m) ** 2, 0) / k;
      sigmas.push(Math.sqrt(var2));
    }
  }
  sigmas.sort((a, b) => a - b);
  const pct = (p) => sigmas[Math.floor(p * sigmas.length)];
  volCone[k] = {
    p5: Number(pct(0.05).toFixed(3)),
    p25: Number(pct(0.25).toFixed(3)),
    p50: Number(pct(0.50).toFixed(3)),
    p75: Number(pct(0.75).toFixed(3)),
    p95: Number(pct(0.95).toFixed(3)),
    n: sigmas.length,
  };
}

// Per-player current σ̂ per horizon (for "drop player on the cone")
const playerVolByHorizon = {};
for (const player of careerPathPlayers) {
  const arr = careerPathsByPlayer.get(player) ?? [];
  const sgs = arr.map((e) => e.sgTotal);
  const out = {};
  for (const k of HORIZONS) {
    if (sgs.length < k * 2) continue;
    // Use the most recent k events to compute σ
    const recent = sgs.slice(-k);
    const m = recent.reduce((a, b) => a + b, 0) / k;
    const var2 = recent.reduce((a, b) => a + (b - m) ** 2, 0) / k;
    out[k] = Number(Math.sqrt(var2).toFixed(3));
  }
  playerVolByHorizon[player] = out;
}

writeFileSync(
  join(OUT_DIR, "pga_vol_cone.json"),
  JSON.stringify(
    {
      horizons: HORIZONS,
      cone: volCone,
      perPlayer: playerVolByHorizon,
      players: careerPathPlayers,
    },
    null,
    2
  )
);

writeFileSync(
  join(OUT_DIR, "finish_model.json"),
  JSON.stringify(
    {
      // Phase D: Top-10 binary classifier replaces the v1 finish-position
      // regression (R² ≈ 7%, essentially noise). Same lagged-feature spine,
      // logistic regression, walk-forward OOS AUC, 10-decile calibration.
      modelType: "logistic_classifier",
      target: "made_top10 (binary): 1 if finish ≤ 10 else 0",
      weights: finishModel.weights,
      featMeans: finishModel.featMeans,
      featStds: finishModel.featStds,
      featureNames: [
        "bias",
        "prior_sg_putt",
        "prior_sg_arg",
        "prior_sg_app",
        "prior_sg_ott",
        "course_difficulty",
        "purse_norm",
        "major_event",
      ],
      featureLabels: [
        "Baseline",
        "Prior SG-Putt",
        "Prior SG-Arg",
        "Prior SG-App",
        "Prior SG-Ott",
        "Course difficulty",
        "Purse",
        "Major event",
      ],
      // In-sample metrics
      isAuc: Number(finishModel.isAuc.toFixed(4)),
      isBaseRate: Number(finishModel.isBaseRate.toFixed(4)),
      trainedOn: finishModel.n,
      // Walk-forward OOS metrics
      walkForward: {
        method: "Per test season Y, train rows season<Y, test on season===Y",
        folds: finishModel.oosFolds,
        meanOosAuc: finishModel.oosFolds.length > 0
          ? Number((finishModel.oosFolds.reduce((a, f) => a + f.auc, 0) / finishModel.oosFolds.length).toFixed(4))
          : 0,
        stitchedOosAuc: Number(finishModel.oosAuc.toFixed(4)),
      },
      calibration: {
        method: "10-decile bucketing of stitched OOS predictions",
        bins: finishModel.calibrationBins,
        brierScore: Number(finishModel.brierScore.toFixed(4)),
        nOosPredictions: finishModel.nOosPredictions,
      },
      hyperparams: { epochs: 600, lr: 0.1, optimizer: "batch GD on standardized features", target: "binary cross-entropy via sigmoid" },
    },
    null,
    2
  )
);

// =====================================================================
// === Walk-forward backtest matrix: per-(year × signal) IS / OOS Sharpe
// === Pre-computed to feed the 14th 3D scene (Walk-Forward Sharpe Heatmap)
// =====================================================================

console.log("\nBuilding walk-forward Sharpe matrix...");

(function buildWalkforwardMatrix() {
  const SIGNALS = ["momentum", "meanRev", "sharpe", "blend"];
  const SIGNAL_LABELS = {
    momentum: "Momentum",
    meanRev: "Mean-Rev",
    sharpe: "Sharpe-Rank",
    blend: "Equal-Blend",
  };
  const lookback = 12;
  const longPct = 0.2;
  const shortPct = 0.2;
  const targetVolMonthly = 0.005; // 0.5% monthly vol target
  const minHistory = 6;
  const months = allMonths;
  const players = panelPlayers;
  const T = months.length;
  const P = players.length;

  // Build X[t][p]
  const X = Array.from({ length: T }, () => new Array(P).fill(null));
  for (let ti = 0; ti < T; ti++) {
    const m = months[ti];
    for (let pi = 0; pi < P; pi++) {
      const cell = panel[m]?.[players[pi]];
      X[ti][pi] = cell?.sg ?? null;
    }
  }

  // Per-player rolling mean/std + career mean
  function rollMean(arr, k) {
    const out = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
      if (i + 1 < k) continue;
      let sum = 0; let cnt = 0;
      for (let j = i + 1 - k; j <= i; j++) {
        if (arr[j] != null) { sum += arr[j]; cnt++; }
      }
      out[i] = cnt > 0 ? sum / cnt : null;
    }
    return out;
  }
  function rollStd(arr, k) {
    const out = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
      if (i + 1 < k) continue;
      const window = [];
      for (let j = i + 1 - k; j <= i; j++) if (arr[j] != null) window.push(arr[j]);
      if (window.length < 2) continue;
      const m = window.reduce((a, b) => a + b, 0) / window.length;
      const v = window.reduce((a, b) => a + (b - m) ** 2, 0) / (window.length - 1);
      out[i] = Math.sqrt(v);
    }
    return out;
  }

  const perPlayerMu = [];
  const perPlayerSig = [];
  // Phase A2 mirror: expanding past-only career mean (no full-sample look-ahead).
  const perPlayerCareerMuTo = [];
  for (let pi = 0; pi < P; pi++) {
    const arr = X.map((row) => row[pi]);
    perPlayerMu.push(rollMean(arr, lookback));
    perPlayerSig.push(rollStd(arr, lookback));
    const muTo = [];
    let sum = 0;
    let n = 0;
    for (let t = 0; t < arr.length; t++) {
      muTo.push(n > 0 ? sum / n : null);
      if (arr[t] != null) {
        sum += arr[t];
        n++;
      }
    }
    perPlayerCareerMuTo.push(muTo);
  }

  // Signal helpers
  function signalAt(t, pi, signal) {
    const mu = perPlayerMu[pi][t];
    const sig = perPlayerSig[pi][t];
    if (mu == null) return null;
    const momVal = mu;
    let mrVal = null;
    {
      const vals = [X[t - 2]?.[pi], X[t - 1]?.[pi], X[t]?.[pi]].filter((v) => v != null);
      if (vals.length > 0) {
        const m3 = vals.reduce((a, b) => a + b, 0) / vals.length;
        const careerMu = perPlayerCareerMuTo[pi][t];
        if (careerMu != null) mrVal = -(m3 - careerMu);
      }
    }
    let sharpeVal = null;
    if (sig != null && sig > 0) sharpeVal = mu / sig;

    if (signal === "momentum") return momVal;
    if (signal === "meanRev") return mrVal;
    if (signal === "sharpe") return sharpeVal;
    if (signal === "blend") {
      if (momVal == null || mrVal == null || sharpeVal == null) return null;
      return (momVal + mrVal + sharpeVal) / 3;
    }
    return null;
  }

  // Run strategy through a list of (sorted) month indices, return monthly returns array
  function runOnIndices(indices, signal) {
    const returns = [];
    for (const t of indices) {
      // Need t+1 to realize a return
      if (t + 1 >= T) continue;
      // Eligible: minHistory observations up to t
      const eligible = [];
      const sigVals = [];
      for (let pi = 0; pi < P; pi++) {
        let priorN = 0;
        for (let s = 0; s <= t; s++) if (X[s][pi] != null) priorN++;
        if (priorN < minHistory) continue;
        const sv = signalAt(t, pi, signal);
        if (sv == null) continue;
        eligible.push(pi);
        sigVals.push(sv);
      }
      if (eligible.length < 10) continue;
      // Quintile split by signal value
      const sorted = eligible.map((pi, k) => ({ pi, sv: sigVals[k] })).sort((a, b) => b.sv - a.sv);
      const longN = Math.max(1, Math.floor(sorted.length * longPct));
      const shortN = Math.max(1, Math.floor(sorted.length * shortPct));
      const longs = sorted.slice(0, longN);
      const shorts = sorted.slice(sorted.length - shortN);
      // Equal weights, vol-target sized via inverse rolling σ̂
      const weights = new Array(P).fill(0);
      const longInvSigs = longs.map((x) => {
        const s = perPlayerSig[x.pi][t];
        return s != null && s > 0 ? 1 / s : 1;
      });
      const longSum = longInvSigs.reduce((a, b) => a + b, 0);
      longs.forEach((x, k) => { weights[x.pi] = +0.5 * (longInvSigs[k] / longSum); });
      const shortInvSigs = shorts.map((x) => {
        const s = perPlayerSig[x.pi][t];
        return s != null && s > 0 ? 1 / s : 1;
      });
      const shortSum = shortInvSigs.reduce((a, b) => a + b, 0);
      shorts.forEach((x, k) => { weights[x.pi] = -0.5 * (shortInvSigs[k] / shortSum); });
      // Realize next-month return
      let r = 0;
      for (let pi = 0; pi < P; pi++) {
        const nx = X[t + 1][pi];
        if (nx == null || weights[pi] === 0) continue;
        r += weights[pi] * nx;
      }
      returns.push(r);
    }
    return returns;
  }

  function meanStd(xs) {
    if (xs.length < 2) return [0, 0];
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
    return [m, Math.sqrt(v)];
  }
  function annualSharpe(xs) {
    const [m, s] = meanStd(xs);
    if (s === 0) return 0;
    // Vol-target rescale to match StrategyLab: scale return series so realized σ ≈ targetVolMonthly
    const scale = s > 0 ? targetVolMonthly / s : 1;
    const m2 = m * scale;
    const s2 = s * scale;
    if (s2 === 0) return 0;
    return (m2 / s2) * Math.sqrt(12);
  }

  const yearsPresent = [...new Set(months.map((m) => parseInt(m.slice(0, 4), 10)))].sort();
  // Need 36 months prior data → start at the year where we have ≥ 36 months before Jan
  const wfYears = yearsPresent.filter((y) => {
    const beforeCount = months.filter((m) => parseInt(m.slice(0, 4), 10) < y).length;
    const inYearCount = months.filter((m) => parseInt(m.slice(0, 4), 10) === y).length;
    return beforeCount >= 24 && inYearCount >= 6;
  });

  const matrix = []; // [yearIdx][signalIdx] = { isSharpe, oosSharpe, isMonths, oosMonths }
  for (const year of wfYears) {
    const row = [];
    const trainIdx = [];
    const testIdx = [];
    for (let ti = 0; ti < T; ti++) {
      const y = parseInt(months[ti].slice(0, 4), 10);
      if (y < year) trainIdx.push(ti);
      else if (y === year) testIdx.push(ti);
    }
    for (const sig of SIGNALS) {
      const isReturns = runOnIndices(trainIdx, sig);
      const oosReturns = runOnIndices(testIdx, sig);
      row.push({
        signal: sig,
        isSharpe: Number(annualSharpe(isReturns).toFixed(3)),
        oosSharpe: Number(annualSharpe(oosReturns).toFixed(3)),
        isMonths: isReturns.length,
        oosMonths: oosReturns.length,
      });
    }
    matrix.push({ year, signals: row });
  }

  // Median OOS Sharpe per signal (across years)
  const medianOos = {};
  for (const sig of SIGNALS) {
    const vals = matrix.map((row) => row.signals.find((s) => s.signal === sig).oosSharpe).sort((a, b) => a - b);
    medianOos[sig] = vals.length === 0 ? 0 : vals[Math.floor(vals.length / 2)];
  }

  writeFileSync(
    join(OUT_DIR, "pga_walkforward.json"),
    JSON.stringify({
      years: wfYears,
      signals: SIGNALS,
      signalLabels: SIGNAL_LABELS,
      matrix,
      medianOos,
      params: {
        lookback,
        longPct,
        shortPct,
        targetVolMonthly,
        minHistory,
        trainMonthsMin: 24,
        testMonthsMin: 6,
      },
    })
  );
})();

// ---------- Done ----------

import { statSync } from "node:fs";
const files = [
  "model.json",
  "scatter3d.json",
  "eda.json",
  "pga_tour.json",
  "cut_model.json",
  "pga_analysis.json",
  "play_surface.json",
  "pca.json",
  "pga_cluster_timeline.json",
  "pga_courses_deep.json",
  "pga_player_course.json",
  "pga_majors.json",
  "finish_model.json",
  "pga_courses_timeline.json",
  "pga_career_paths.json",
  "pga_strategy_panel.json",
  "pga_vol_cone.json",
  "pga_walkforward.json",
  "pga_kmeans_diagnostics.json",
];
console.log("\nOutput sizes:");
for (const f of files) {
  const sz = statSync(join(OUT_DIR, f)).size;
  console.log(`  ${f.padEnd(20)}  ${(sz / 1024).toFixed(1)} KB`);
}
console.log(`\nAll files written to ${OUT_DIR}`);

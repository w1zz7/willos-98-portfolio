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

function trainLR(rows, epochs = 800, lr = 0.05) {
  const X = rows.map(featurize);
  const y = rows.map((r) => r.anyPlay);
  const nFeat = X[0].length;
  let w = new Array(nFeat).fill(0);
  // Add small random init (not on bias) to break symmetry
  for (let i = 1; i < nFeat; i++) w[i] = (Math.random() - 0.5) * 0.1;

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

const longText = readFileSync(join(ARCHIVE, "golf_dataset_long_format_with_text.csv"), "utf-8");
const long = parseCSV(longText);
console.log("Long rows:", long.length);

const seenEmails = new Set();
const seenTasks = new Set();
const reviews = long
  .filter((r) => r.Review && r.Review.length > 20 && r.Review.length < 280)
  .slice(0, 30)
  .map((r) => ({ d: r.Date, p: `Player ${r.ID ?? "?"}`, r: r.Review }));
const emails = [];
for (const r of long) {
  if (!r.EmailCampaign || r.EmailCampaign.length < 20) continue;
  if (seenEmails.has(r.EmailCampaign)) continue;
  seenEmails.add(r.EmailCampaign);
  emails.push({ d: r.Date, e: r.EmailCampaign });
  if (emails.length >= 12) break;
}
const tasks = [];
for (const r of long) {
  if (!r.MaintenanceTask || r.MaintenanceTask.length < 20) continue;
  if (seenTasks.has(r.MaintenanceTask)) continue;
  seenTasks.add(r.MaintenanceTask);
  tasks.push({ d: r.Date, t: r.MaintenanceTask });
  if (tasks.length >= 15) break;
}

writeFileSync(
  join(OUT_DIR, "text_samples.json"),
  JSON.stringify({ reviews, emails, tasks }, null, 2)
);

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
//   season_idx             (encoded 0..7 for 2015..2022 — minor effect)
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
  if (season === seasonsAll[0]) continue; // need lag — skip earliest season

  const priorKey = `${season - 1}__${player}`;
  const prior = playerSeasonStats.get(priorKey);
  const purse = num(r.purse) ?? 0;
  const purseNorm = (purse - purseMin) / Math.max(1, purseMax - purseMin);

  cutTrainRows.push({
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
  for (let i = 1; i < nFeat; i++) w[i] = (Math.random() - 0.5) * 0.1;
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
      note: "Features are lagged from the player's prior season — leak-free.",
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

// Build matrix of z-scored (Putt, Arg, App, Ott) — already in featuresZ + clusterPool
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

const finishRows = [];
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

  finishRows.push({
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
    y: finish, // 1..100
  });
}

console.log(`  Finish model train rows: ${finishRows.length}`);

// Linear regression via batch gradient descent on standardized features
function trainLinearRegression(rows, epochs = 400, lr = 0.01) {
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
  // Standardize y too (predict standardized; un-standardize at inference)
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const yStd = Math.sqrt(y.reduce((a, b) => a + (b - yMean) ** 2, 0) / y.length) || 1;

  const Xs = X.map((row) =>
    row.map((v, j) => (j === 0 ? 1 : (v - featMeans[j]) / featStds[j]))
  );
  const ys = y.map((v) => (v - yMean) / yStd);

  let w = new Array(nFeat).fill(0);
  for (let i = 1; i < nFeat; i++) w[i] = (Math.random() - 0.5) * 0.05;

  for (let e = 0; e < epochs; e++) {
    const grad = new Array(nFeat).fill(0);
    for (let i = 0; i < Xs.length; i++) {
      const pred = Xs[i].reduce((s, v, k) => s + v * w[k], 0);
      const err = pred - ys[i];
      for (let k = 0; k < nFeat; k++) grad[k] += err * Xs[i][k];
    }
    for (let k = 0; k < nFeat; k++) w[k] -= (lr * grad[k]) / Xs.length;
  }

  // Eval R² + RMSE on TRAINING set (no test split — small disclaimer in UI)
  let ssRes = 0;
  let ssTot = 0;
  let sqErr = 0;
  for (let i = 0; i < Xs.length; i++) {
    const predStd = Xs[i].reduce((s, v, k) => s + v * w[k], 0);
    const predFinish = predStd * yStd + yMean;
    const actual = y[i];
    sqErr += (predFinish - actual) ** 2;
    ssRes += (predFinish - actual) ** 2;
    ssTot += (actual - yMean) ** 2;
  }
  const r2 = 1 - ssRes / ssTot;
  const rmse = Math.sqrt(sqErr / Xs.length);

  return {
    weights: w,
    featMeans,
    featStds,
    yMean,
    yStd,
    r2,
    rmse,
    n: Xs.length,
  };
}

const finishModel = trainLinearRegression(finishRows);
console.log(
  `  Finish LR R²: ${finishModel.r2.toFixed(3)} · RMSE: ${finishModel.rmse.toFixed(2)} on ${finishModel.n} rows`
);

writeFileSync(
  join(OUT_DIR, "finish_model.json"),
  JSON.stringify(
    {
      weights: finishModel.weights,
      featMeans: finishModel.featMeans,
      featStds: finishModel.featStds,
      yMean: finishModel.yMean,
      yStd: finishModel.yStd,
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
      r2: Number(finishModel.r2.toFixed(4)),
      rmse: Number(finishModel.rmse.toFixed(2)),
      trainedOn: finishModel.n,
      target: "Finish position (1=win, capped at 100)",
      yRange: [1, 100],
      hyperparams: { epochs: 400, lr: 0.01, optimizer: "batch GD on standardized features" },
    },
    null,
    2
  )
);

// ---------- Done ----------

import { statSync } from "node:fs";
const files = [
  "model.json",
  "scatter3d.json",
  "eda.json",
  "text_samples.json",
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
];
console.log("\nOutput sizes:");
for (const f of files) {
  const sz = statSync(join(OUT_DIR, f)).size;
  console.log(`  ${f.padEnd(20)}  ${(sz / 1024).toFixed(1)} KB`);
}
console.log(`\nAll files written to ${OUT_DIR}`);

"use client";

/**
 * Model D - GBM Career Simulator (stochastic process)
 *
 * Treats a player's per-event SG-Total as a discrete-time stochastic
 * process. Fits μ̂ (drift) and σ̂ (vol) from history with optional
 * rolling-window or career defaults; runs N Monte Carlo random walks
 * forward; renders the simulated paths + a histogram of terminal SG.
 *
 * Math (one-step return):
 *     SG_t = μ + σ · Z_t,    Z_t ~ N(0, 1)
 *
 * EWMA σ̂_t (RiskMetrics, λ=0.94) is shown alongside rolling σ̂_t to
 * demonstrate time-varying volatility - the "GARCH(1,1) with α + β = 1"
 * special case.
 */

import { useMemo, useState } from "react";
import careerPaths from "@/data/golfdata/pga_career_paths.json";

interface Colors {
  bg: string;
  panel: string;
  panelAlt: string;
  panelDeep: string;
  border: string;
  borderSoft: string;
  text: string;
  textDim: string;
  textFaint: string;
  brand: string;
  brandSoft: string;
  accent: string;
  warn: string;
}

interface PathEvent {
  d: string;
  sg: number;
  mu: number | null;
  rs: number | null;
  es: number | null;
}

interface CareerPath {
  events: PathEvent[];
  careerMu: number;
  careerSig: number;
  n: number;
}

interface CareerPathsJson {
  players: string[];
  paths: Record<string, CareerPath>;
  rollingWindow: number;
  ewmaLambda: number;
}

const data = careerPaths as CareerPathsJson;

interface Props {
  colors: Colors;
  fontMono: string;
}

const RED = "#f0686a";
const GREEN = "#5dd39e";

// Box-Muller for fast standard-normal sampling.
function gaussian(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface SimResult {
  paths: number[][];
  terminals: number[];
  median: number[];
  p5: number[];
  p95: number[];
  meanTerminal: number;
  medianTerminal: number;
  p5Terminal: number;
  p95Terminal: number;
  pPositive: number; // probability terminal > 0
}

function runGBM(
  startSg: number,
  mu: number,
  sigma: number,
  steps: number,
  nPaths: number
): SimResult {
  const paths: number[][] = [];
  const terminals: number[] = [];
  for (let p = 0; p < nPaths; p++) {
    const path: number[] = [startSg];
    let cur = startSg;
    for (let t = 0; t < steps; t++) {
      // One-step shock: μ + σ · z. Note this is the SG-Total realization
      // for that event (not a price/return). For "average SG over the
      // player's next k events", we'll average the simulated walk.
      const next = mu + sigma * gaussian();
      path.push(next);
      cur = next;
    }
    paths.push(path);
    // Terminal "career-form" = avg SG over the simulated horizon
    const avg = path.slice(1).reduce((a, b) => a + b, 0) / steps;
    terminals.push(avg);
  }
  // Sort terminals for percentiles
  const sorted = [...terminals].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor(p * sorted.length)];

  // Per-step median + 5/95 quantile bands
  const median: number[] = [];
  const p5: number[] = [];
  const p95: number[] = [];
  for (let t = 0; t <= steps; t++) {
    const sliceVals = paths.map((p) => p[t]).sort((a, b) => a - b);
    median.push(sliceVals[Math.floor(0.5 * sliceVals.length)]);
    p5.push(sliceVals[Math.floor(0.05 * sliceVals.length)]);
    p95.push(sliceVals[Math.floor(0.95 * sliceVals.length)]);
  }

  return {
    paths,
    terminals,
    median,
    p5,
    p95,
    meanTerminal: terminals.reduce((a, b) => a + b, 0) / terminals.length,
    medianTerminal: pct(0.5),
    p5Terminal: pct(0.05),
    p95Terminal: pct(0.95),
    pPositive: terminals.filter((t) => t > 0).length / terminals.length,
  };
}

const VOL_MODES = ["career", "rolling", "ewma"] as const;
type VolMode = (typeof VOL_MODES)[number];

export default function CareerSimulator({ colors, fontMono }: Props) {
  const [player, setPlayer] = useState<string>(data.players[0] ?? "Jon Rahm");
  const [steps, setSteps] = useState<number>(20);
  const [nPaths, setNPaths] = useState<number>(300);
  const [muOverride, setMuOverride] = useState<number | null>(null);
  const [volMultiplier, setVolMultiplier] = useState<number>(1.0);
  const [volMode, setVolMode] = useState<VolMode>("ewma");

  const path = data.paths[player];
  const fittedParams = useMemo(() => {
    if (!path) return { mu: 0, sigma: 1, sigmaSource: "-" };
    const last = path.events[path.events.length - 1];
    let sigma = path.careerSig;
    let sigmaSource = `career σ̂ = ${path.careerSig.toFixed(2)}`;
    if (volMode === "rolling" && last?.rs != null) {
      sigma = last.rs;
      sigmaSource = `rolling-12 σ̂ = ${last.rs.toFixed(2)}`;
    } else if (volMode === "ewma" && last?.es != null) {
      sigma = last.es;
      sigmaSource = `EWMA σ̂ = ${last.es.toFixed(2)}`;
    }
    const mu = muOverride ?? path.careerMu;
    return { mu, sigma, sigmaSource };
  }, [path, volMode, muOverride]);

  const sim = useMemo(() => {
    if (!path) return null;
    const startSg = path.events[path.events.length - 1].sg;
    return runGBM(
      startSg,
      fittedParams.mu,
      fittedParams.sigma * volMultiplier,
      steps,
      nPaths
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, fittedParams.mu, fittedParams.sigma, volMultiplier, steps, nPaths]);

  if (!path) {
    return (
      <div style={{ padding: 20, color: colors.textDim }}>
        No career path data for {player}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-[14px]">
      <div>
        <h3 style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.005em" }}>
          Player + simulation parameters
        </h3>
        <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 14 }}>
          Treats per-event SG-Total as a discrete stochastic process:{" "}
          <span style={{ fontFamily: fontMono, color: colors.text }}>SG_t = μ + σ · Z_t</span>{" "}
          with <span style={{ fontFamily: fontMono, color: colors.text }}>Z_t ~ N(0,1)</span>.
          Fits μ̂ and σ̂ from this player&apos;s actual history (
          {path.events.length} events) and runs N Monte Carlo random walks forward.
        </p>

        <Label colors={colors}>Player</Label>
        <select
          value={player}
          onChange={(e) => {
            setPlayer(e.target.value);
            setMuOverride(null);
          }}
          style={{
            width: "100%",
            background: colors.panelDeep,
            color: colors.text,
            border: "1px solid " + colors.borderSoft,
            padding: "5px 8px",
            fontSize: 12,
            fontFamily: "inherit",
            marginBottom: 12,
          }}
        >
          {data.players.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <div className="mt-[8px]">
          <Label colors={colors}>Volatility model</Label>
          <div className="flex gap-[4px]">
            {(
              [
                ["career", "Career σ̂"],
                ["rolling", "Rolling-12 σ̂"],
                ["ewma", "EWMA λ=0.94"],
              ] as [VolMode, string][]
            ).map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVolMode(v)}
                className="px-[10px] py-[4px]"
                style={{
                  background: volMode === v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (volMode === v ? colors.brand : colors.borderSoft),
                  color: volMode === v ? colors.text : colors.textDim,
                  fontSize: 11,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 4, fontFamily: fontMono }}>
            Currently using: {fittedParams.sigmaSource}
          </div>
        </div>

        <Slider
          label="Drift μ̂ (per-event mean)"
          value={fittedParams.mu}
          min={-2}
          max={2}
          step={0.05}
          unit=""
          onChange={(v) => setMuOverride(v)}
          colors={colors}
          fontMono={fontMono}
          track={colors.brand}
          fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)}
        />
        <Slider
          label="Vol multiplier (× σ̂)"
          value={volMultiplier}
          min={0.25}
          max={3.0}
          step={0.05}
          unit=""
          onChange={setVolMultiplier}
          colors={colors}
          fontMono={fontMono}
          track={colors.warn}
          fmt={(v) => v.toFixed(2) + "×"}
        />
        <Slider
          label="Forward horizon (events)"
          value={steps}
          min={5}
          max={100}
          step={1}
          unit=" events"
          onChange={setSteps}
          colors={colors}
          fontMono={fontMono}
          track={colors.accent}
          fmt={(v) => `${v} events`}
        />
        <Slider
          label="Monte Carlo paths"
          value={nPaths}
          min={50}
          max={1000}
          step={50}
          unit=" paths"
          onChange={setNPaths}
          colors={colors}
          fontMono={fontMono}
          track={colors.brand}
          fmt={(v) => `${v} paths`}
        />

        <div
          style={{
            marginTop: 18,
            padding: 12,
            background: colors.panelDeep,
            border: "1px solid " + colors.borderSoft,
            fontSize: 10.5,
            color: colors.textDim,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontSize: 9, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 6 }}>
            Methodology + caveats
          </div>
          <strong>Stochastic process:</strong>{" "}
          <span style={{ fontFamily: fontMono }}>
            SG<sub>t</sub> = μ + σ · Z<sub>t</sub>
          </span>
          . This is a discrete-time independent-increment process (the
          discrete cousin of geometric Brownian motion) - each event is an
          independent draw, no autocorrelation, no momentum.
          <br />
          <strong>Vol estimator:</strong> rolling σ uses a fixed 12-event
          window;{" "}
          <span style={{ fontFamily: fontMono }}>
            σ²<sub>t</sub> = (1−λ)·ε²<sub>t−1</sub> + λ·σ²<sub>t−1</sub>
          </span>{" "}
          (RiskMetrics EWMA, IGARCH(1,1) special case with α+β=1) gives a
          time-varying estimator that reacts to recent shocks.
          <br />
          <strong>Limitations:</strong> independent-increment assumption
          ignores autocorrelation in form (real careers cluster); μ̂ from
          career mean is biased toward survivor pool; σ̂ from EWMA assumes
          ω=0 which can drift down in calm periods.
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.005em" }}>
          Distribution of outcomes
        </h3>

        <div
          className="px-[14px] py-[14px] mb-[12px]"
          style={{ background: colors.panelDeep, border: "1px solid " + colors.border }}
        >
          <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.18em" }}>
            Median terminal SG-Total
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: sim && sim.medianTerminal >= 0 ? colors.brand : RED,
              fontFamily: fontMono,
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            {sim ? (sim.medianTerminal >= 0 ? "+" : "") + sim.medianTerminal.toFixed(2) : "-"}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 6, fontFamily: fontMono }}>
            5th pctl: {sim ? (sim.p5Terminal >= 0 ? "+" : "") + sim.p5Terminal.toFixed(2) : "-"} ·{" "}
            95th pctl: {sim ? (sim.p95Terminal >= 0 ? "+" : "") + sim.p95Terminal.toFixed(2) : "-"}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4, fontFamily: fontMono }}>
            P(positive SG over horizon): {sim ? (sim.pPositive * 100).toFixed(0) : "-"}%
          </div>
        </div>

        {sim && (
          <>
            <Label colors={colors}>Random walks ({sim.paths.length} paths over {steps} events)</Label>
            <PathsChart sim={sim} colors={colors} />

            <Label colors={colors}>Terminal SG distribution</Label>
            <Histogram terminals={sim.terminals} colors={colors} fontMono={fontMono} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------- charts ----------

function PathsChart({ sim, colors }: { sim: SimResult; colors: Colors }) {
  const W = 360;
  const H = 140;
  const PAD = 6;
  const T = sim.paths[0].length;
  const allVals = sim.paths.flat();
  const yMin = Math.min(...allVals, ...sim.p5);
  const yMax = Math.max(...allVals, ...sim.p95);
  const xs = (i: number) => PAD + (i / (T - 1)) * (W - 2 * PAD);
  const ys = (v: number) => H - PAD - ((v - yMin) / Math.max(0.01, yMax - yMin)) * (H - 2 * PAD);
  const zeroY = ys(0);

  const renderPaths = sim.paths.slice(0, Math.min(80, sim.paths.length));

  const polylineFor = (path: number[]) =>
    path.map((v, i) => `${xs(i)},${ys(v)}`).join(" ");

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft, marginBottom: 14 }}>
      {/* Zero baseline */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={colors.borderSoft} strokeDasharray="3,3" />
      {/* Quantile band fill */}
      <polygon
        points={
          sim.p95.map((v, i) => `${xs(i)},${ys(v)}`).join(" ") +
          " " +
          [...sim.p5].reverse().map((v, i) => `${xs(T - 1 - i)},${ys(v)}`).join(" ")
        }
        fill={colors.brand}
        opacity={0.10}
      />
      {/* All paths */}
      {renderPaths.map((p, i) => (
        <polyline key={i} points={polylineFor(p)} fill="none" stroke={colors.brand} opacity={0.18} strokeWidth={0.8} />
      ))}
      {/* Median line */}
      <polyline points={polylineFor(sim.median)} fill="none" stroke="#fff" strokeWidth={1.6} />
    </svg>
  );
}

function Histogram({ terminals, colors, fontMono }: { terminals: number[]; colors: Colors; fontMono: string }) {
  const W = 360;
  const H = 110;
  const PAD = 6;
  const NB = 24;
  const min = Math.min(...terminals);
  const max = Math.max(...terminals);
  const bins = new Array(NB).fill(0);
  for (const t of terminals) {
    const idx = Math.min(NB - 1, Math.floor(((t - min) / Math.max(0.001, max - min)) * NB));
    bins[idx]++;
  }
  const maxCount = Math.max(...bins, 1);
  const bw = (W - 2 * PAD) / NB;
  const median = [...terminals].sort((a, b) => a - b)[Math.floor(terminals.length / 2)];
  const medianX = PAD + ((median - min) / Math.max(0.001, max - min)) * (W - 2 * PAD);
  const zeroX = min < 0 && max > 0 ? PAD + ((0 - min) / (max - min)) * (W - 2 * PAD) : null;

  return (
    <>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft }}>
        {bins.map((c, i) => {
          const x = PAD + i * bw;
          const h = (c / maxCount) * (H - 16);
          const y = H - 12 - h;
          // Color: greener for higher SG, reder for lower
          const cx = min + ((i + 0.5) / NB) * (max - min);
          const fill = cx >= 0 ? colors.brand : "#f0686a";
          return (
            <rect
              key={i}
              x={x + 1}
              y={y}
              width={Math.max(0.5, bw - 2)}
              height={Math.max(0.5, h)}
              fill={fill}
              opacity={0.85}
            />
          );
        })}
        {/* Zero line */}
        {zeroX != null && <line x1={zeroX} y1={2} x2={zeroX} y2={H - 12} stroke={colors.borderSoft} strokeDasharray="2,2" />}
        {/* Median marker */}
        <line x1={medianX} y1={2} x2={medianX} y2={H - 12} stroke="#fff" strokeWidth={1.4} />
        {/* X-axis labels */}
        <text x={PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono}>
          {min.toFixed(2)}
        </text>
        <text x={W - PAD} y={H - 2} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="end">
          {max.toFixed(2)}
        </text>
        <text x={medianX} y={H - 2} fontSize={9} fill="#fff" fontFamily={fontMono} textAnchor="middle">
          median
        </text>
      </svg>
      <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 4, fontFamily: fontMono }}>
        Histogram of {terminals.length} simulated terminal avg-SG values · white line = median ·{" "}
        <span style={{ color: GREEN }}>green</span> = positive · <span style={{ color: RED }}>red</span> = negative
      </div>
    </>
  );
}

// ---------- helpers ----------

function Slider({
  label, value, min, max, step, unit, onChange, colors, fontMono, track, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; colors: Colors; fontMono: string; track: string; fmt?: (v: number) => string;
}) {
  return (
    <div className="mt-[10px]">
      <div className="flex items-baseline justify-between mb-[4px]">
        <Label colors={colors}>{label}</Label>
        <span style={{ fontFamily: fontMono, fontSize: 13, color: colors.text, fontVariantNumeric: "tabular-nums" }}>
          {fmt ? fmt(value) : value.toFixed(step < 1 ? 1 : 0) + unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: track }}
      />
    </div>
  );
}

function Label({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 4 }}>
      {children}
    </div>
  );
}

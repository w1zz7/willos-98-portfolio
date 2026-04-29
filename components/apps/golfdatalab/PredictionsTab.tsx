"use client";

/**
 * Predictions tab: two trained ML models, both run in-browser.
 *
 *   Model A — Play probability (logistic regression, weather → anyPlay)
 *             1,095-day train, 8 features, 69% accuracy
 *
 *   Model B — PGA cut probability (logistic regression, lagged player profile
 *             + tournament purse → made_cut)
 *             32,690-row train, 6 features, 61.6% accuracy vs 60.1% base rate
 *
 * Both have weights shipped as static JSON (~1.5KB total). Inference is pure
 * arithmetic — sliders change → probability updates same frame.
 */

import { useMemo, useState } from "react";
import model from "@/data/golfdata/model.json";
import cutModel from "@/data/golfdata/cut_model.json";
import finishModel from "@/data/golfdata/finish_model.json";

interface Colors {
  bg: string; panel: string; panelAlt: string; panelDeep: string;
  border: string; borderSoft: string;
  text: string; textDim: string; textFaint: string;
  brand: string; brandSoft: string; accent: string; warn: string;
}

interface Props {
  colors: Colors;
  fontMono: string;
  fontUi: string;
}

type ModelTab = "play" | "cut" | "finish";

const OUTLOOKS = ["sunny", "overcast", "rain", "snow"] as const;
type Outlook = (typeof OUTLOOKS)[number];

interface PlayInputs {
  temp: number;
  humidity: number;
  windy: boolean;
  outlook: Outlook;
}

interface CutInputs {
  priorSgTotal: number; // -2..3
  priorCutPct: number; // 0..1
  priorTop10Rate: number; // 0..0.4
  purseNorm: number; // 0..1
  seasonIdx: number; // 0..1
}

const PLAY_FEATURE_LABELS: Record<string, string> = {
  bias: "Baseline (intercept)",
  temp_norm: "Temperature",
  humidity_norm: "Humidity",
  windy: "Windy",
  outlook_sunny: "Outlook = sunny",
  outlook_overcast: "Outlook = overcast",
  outlook_rain: "Outlook = rain",
  outlook_snow: "Outlook = snow",
};

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

function featurizePlay(inp: PlayInputs): number[] {
  return [
    1,
    Math.max(0, Math.min(1, (inp.temp + 10) / 50)),
    Math.max(0, Math.min(1, inp.humidity / 100)),
    inp.windy ? 1 : 0,
    inp.outlook === "sunny" ? 1 : 0,
    inp.outlook === "overcast" ? 1 : 0,
    inp.outlook === "rain" ? 1 : 0,
    inp.outlook === "snow" ? 1 : 0,
  ];
}

function featurizeCut(inp: CutInputs): number[] {
  return [
    1,
    inp.priorSgTotal,
    inp.priorCutPct,
    inp.priorTop10Rate,
    inp.purseNorm,
    inp.seasonIdx,
  ];
}

const PLAY_PRESETS: { name: string; inputs: PlayInputs; rationale: string }[] = [
  {
    name: "Perfect summer day",
    inputs: { temp: 24, humidity: 45, windy: false, outlook: "sunny" },
    rationale: "Warm, dry, calm, sunny — model maximum",
  },
  {
    name: "Stormy day",
    inputs: { temp: 8, humidity: 92, windy: true, outlook: "rain" },
    rationale: "Cold, humid, windy, raining — model minimum",
  },
  {
    name: "Mild overcast",
    inputs: { temp: 17, humidity: 65, windy: false, outlook: "overcast" },
    rationale: "Moderate everything — uncertain zone",
  },
  {
    name: "Cold but clear",
    inputs: { temp: 2, humidity: 50, windy: false, outlook: "sunny" },
    rationale: "Sunny but freezing — winter trade-off",
  },
];

const CUT_PRESETS: { name: string; inputs: CutInputs; rationale: string }[] = [
  {
    name: "Elite Tour pro",
    inputs: { priorSgTotal: 1.5, priorCutPct: 0.85, priorTop10Rate: 0.25, purseNorm: 0.5, seasonIdx: 0.7 },
    rationale: "Top-30 player at a mid-purse event",
  },
  {
    name: "Borderline veteran",
    inputs: { priorSgTotal: 0.0, priorCutPct: 0.6, priorTop10Rate: 0.05, purseNorm: 0.3, seasonIdx: 0.5 },
    rationale: "Average pro fighting to keep card",
  },
  {
    name: "Major championship rookie",
    inputs: { priorSgTotal: -0.3, priorCutPct: 0.45, priorTop10Rate: 0.0, purseNorm: 1.0, seasonIdx: 0.9 },
    rationale: "Below-tour-avg player at the year's biggest purse",
  },
  {
    name: "Resurgent comeback",
    inputs: { priorSgTotal: 0.7, priorCutPct: 0.7, priorTop10Rate: 0.15, purseNorm: 0.4, seasonIdx: 1.0 },
    rationale: "Recently improving player at a 2022 stop",
  },
];

export default function PredictionsTab({ colors, fontMono, fontUi }: Props) {
  const [tab, setTab] = useState<ModelTab>("play");

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: fontUi }}>
      <div
        className="flex shrink-0"
        style={{ background: colors.panel, borderBottom: "1px solid " + colors.border }}
      >
        {(
          [
            { id: "play", label: "Model A · Play prediction", sub: "weather → anyPlay" },
            { id: "cut", label: "Model B · PGA cut prediction", sub: "lagged form + purse → made_cut" },
            { id: "finish", label: "Model C · Tournament finish", sub: "lagged SG + course + major → finish" },
          ] as { id: ModelTab; label: string; sub: string }[]
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-[16px] py-[8px] text-left"
              style={{
                color: active ? colors.text : colors.textDim,
                borderBottom: active
                  ? "2px solid " + colors.brand
                  : "2px solid transparent",
                background: "transparent",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, letterSpacing: "0.04em" }}>
                {t.label}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: active ? colors.textDim : colors.textFaint,
                  fontFamily: fontMono,
                  marginTop: 1,
                }}
              >
                {t.sub}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-[16px]">
        {tab === "play" && <PlayModelView colors={colors} fontMono={fontMono} />}
        {tab === "cut" && <CutModelView colors={colors} fontMono={fontMono} />}
        {tab === "finish" && <FinishModelView colors={colors} fontMono={fontMono} />}
      </div>
    </div>
  );
}

// ============================================================
// MODEL A: Play prediction
// ============================================================

function PlayModelView({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  const [inp, setInp] = useState<PlayInputs>({
    temp: 22,
    humidity: 55,
    windy: false,
    outlook: "sunny",
  });

  const result = useMemo(() => {
    const x = featurizePlay(inp);
    const w = model.weights;
    const contributions = x.map((xi, i) => xi * w[i]);
    const z = contributions.reduce((a, b) => a + b, 0);
    const p = sigmoid(z);
    return { x, w, contributions, z, p };
  }, [inp]);

  const playPct = (result.p * 100).toFixed(1);
  const verdict =
    result.p > 0.7 ? "Likely play" : result.p > 0.4 ? "Could go either way" : "Unlikely play";
  const verdictColor =
    result.p > 0.7 ? colors.brand : result.p > 0.4 ? colors.warn : "#f0686a";
  const maxAbsContrib = Math.max(...result.contributions.slice(1).map((c) => Math.abs(c)));

  return (
    <div className="grid grid-cols-2 gap-[14px]">
      <div>
        <h3
          style={{
            fontSize: 13,
            color: colors.text,
            fontWeight: 600,
            marginBottom: 8,
            letterSpacing: "-0.005em",
          }}
        >
          Inputs
        </h3>
        <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 14 }}>
          Adjust the weather and the model re-scores the day live. Pre-trained on{" "}
          {model.trainedOn.toLocaleString()} days · 8 features · batch gradient descent · 800
          epochs · lr 0.05.
        </p>

        <Slider
          label="Temperature"
          value={inp.temp}
          min={-10}
          max={40}
          step={0.5}
          unit="°C"
          onChange={(temp) => setInp({ ...inp, temp })}
          colors={colors}
          fontMono={fontMono}
          track={colors.warn}
        />
        <Slider
          label="Humidity"
          value={inp.humidity}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(humidity) => setInp({ ...inp, humidity })}
          colors={colors}
          fontMono={fontMono}
          track={colors.brand}
        />

        <div className="mt-[14px]">
          <Label colors={colors}>Windy</Label>
          <div className="flex gap-[6px]">
            {[
              { v: false, lbl: "Calm" },
              { v: true, lbl: "Windy" },
            ].map((opt) => (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => setInp({ ...inp, windy: opt.v })}
                className="px-[14px] py-[5px]"
                style={{
                  background: inp.windy === opt.v ? colors.brandSoft : colors.panelDeep,
                  border:
                    "1px solid " + (inp.windy === opt.v ? colors.brand : colors.borderSoft),
                  color: inp.windy === opt.v ? colors.text : colors.textDim,
                  fontSize: 12,
                  letterSpacing: "0.06em",
                }}
              >
                {opt.lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-[14px]">
          <Label colors={colors}>Outlook</Label>
          <div className="flex flex-wrap gap-[6px]">
            {OUTLOOKS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setInp({ ...inp, outlook: o })}
                className="px-[12px] py-[5px]"
                style={{
                  background: inp.outlook === o ? colors.brandSoft : colors.panelDeep,
                  border:
                    "1px solid " + (inp.outlook === o ? colors.brand : colors.borderSoft),
                  color: inp.outlook === o ? colors.text : colors.textDim,
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "capitalize",
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-[16px]">
          <Label colors={colors}>Presets</Label>
          <div className="grid grid-cols-2 gap-[6px]">
            {PLAY_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setInp(p.inputs)}
                className="px-[10px] py-[6px] text-left"
                style={{
                  background: colors.panelDeep,
                  border: "1px solid " + colors.borderSoft,
                }}
              >
                <div style={{ fontSize: 11, color: colors.text, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>
                  {p.rationale}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Methodology colors={colors} fontMono={fontMono}>
          <strong>Loss:</strong> binary cross-entropy.{" "}
          <strong>Optimizer:</strong> batch gradient descent, no momentum.{" "}
          <strong>Why LR not a tree?</strong> The dataset is small (1,095 rows), the features are
          smooth weather variables, and a linear-in-features decision surface is interpretable —
          you can read each weight as a per-feature pull on the logit.{" "}
          <strong>Limitations:</strong> no held-out test split (small data), seasonal correlation
          isn&apos;t modeled, and the snow class only has ~50 days/year so its weight is noisy.
        </Methodology>
      </div>

      <div>
        <h3
          style={{
            fontSize: 13,
            color: colors.text,
            fontWeight: 600,
            marginBottom: 8,
            letterSpacing: "-0.005em",
          }}
        >
          Prediction
        </h3>

        <ScoreCard
          colors={colors}
          fontMono={fontMono}
          label="P(play)"
          pct={result.p}
          verdict={verdict}
          verdictColor={verdictColor}
          ratePct={playPct}
        />

        <Label colors={colors}>Per-feature contribution to logit</Label>
        <p style={{ fontSize: 10, color: colors.textFaint, marginBottom: 10 }}>
          Each row shows weight × input. Sum + bias = logit z = {result.z.toFixed(2)},
          σ(z) = P(play). Symmetric bar means zero contribution; full-width = strongest signal in
          the current input.
        </p>

        <div className="space-y-[3px]">
          {model.featureNames.map((name, i) => (
            <ContribRow
              key={name}
              label={PLAY_FEATURE_LABELS[name]}
              contribution={result.contributions[i]}
              weight={result.w[i]}
              input={result.x[i]}
              isBias={i === 0}
              maxAbs={maxAbsContrib || 1}
              colors={colors}
              fontMono={fontMono}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 10,
            color: colors.textFaint,
            fontFamily: fontMono,
          }}
        >
          Train accuracy: {(model.accuracy * 100).toFixed(1)}% · base rate ~67%.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODEL B: PGA cut prediction
// ============================================================

function CutModelView({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  const [inp, setInp] = useState<CutInputs>({
    priorSgTotal: 0.5,
    priorCutPct: 0.7,
    priorTop10Rate: 0.1,
    purseNorm: 0.5,
    seasonIdx: 0.7,
  });

  const result = useMemo(() => {
    const x = featurizeCut(inp);
    const w = cutModel.weights;
    const contributions = x.map((xi, i) => xi * w[i]);
    const z = contributions.reduce((a, b) => a + b, 0);
    const p = sigmoid(z);
    return { x, w, contributions, z, p };
  }, [inp]);

  const cutPct = (result.p * 100).toFixed(1);
  const verdict =
    result.p > 0.7
      ? "Strong cut favorite"
      : result.p > 0.55
      ? "Likely to make cut"
      : result.p > 0.45
      ? "Coin flip"
      : "Likely missed cut";
  const verdictColor =
    result.p > 0.7
      ? colors.brand
      : result.p > 0.55
      ? "#a4d99a"
      : result.p > 0.45
      ? colors.warn
      : "#f0686a";
  const maxAbsContrib = Math.max(...result.contributions.slice(1).map((c) => Math.abs(c)));

  const conf = cutModel.confusion;
  const precision = conf.tp / Math.max(1, conf.tp + conf.fp);
  const recall = conf.tp / Math.max(1, conf.tp + conf.fn);
  const f1 = (2 * precision * recall) / Math.max(0.0001, precision + recall);

  return (
    <div className="grid grid-cols-2 gap-[14px]">
      <div>
        <h3
          style={{
            fontSize: 13,
            color: colors.text,
            fontWeight: 600,
            marginBottom: 8,
            letterSpacing: "-0.005em",
          }}
        >
          Player profile inputs
        </h3>
        <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 14 }}>
          Trained on {cutModel.trainedOn.toLocaleString()} tournament-rounds (2016–2022) — features
          are <em>lagged</em> from the player&apos;s prior season so there&apos;s no leakage from the
          cut being predicted. Adjust below to see what kind of player profile produces a strong
          cut probability.
        </p>

        <Slider
          label="Prior-season SG-Total"
          value={inp.priorSgTotal}
          min={-2}
          max={3}
          step={0.05}
          unit=""
          onChange={(v) => setInp({ ...inp, priorSgTotal: v })}
          colors={colors}
          fontMono={fontMono}
          track={colors.brand}
          fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)}
        />
        <Slider
          label="Prior cut rate"
          value={inp.priorCutPct}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={(v) => setInp({ ...inp, priorCutPct: v })}
          colors={colors}
          fontMono={fontMono}
          track={colors.accent}
          fmt={(v) => (v * 100).toFixed(0) + "%"}
        />
        <Slider
          label="Prior top-10 rate"
          value={inp.priorTop10Rate}
          min={0}
          max={0.4}
          step={0.005}
          unit=""
          onChange={(v) => setInp({ ...inp, priorTop10Rate: v })}
          colors={colors}
          fontMono={fontMono}
          track={colors.warn}
          fmt={(v) => (v * 100).toFixed(1) + "%"}
        />
        <Slider
          label="Tournament purse (normalized)"
          value={inp.purseNorm}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={(v) => setInp({ ...inp, purseNorm: v })}
          colors={colors}
          fontMono={fontMono}
          track={colors.warn}
          fmt={(v) => v.toFixed(2)}
        />
        <Slider
          label="Era (2016 → 2022)"
          value={inp.seasonIdx}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={(v) => setInp({ ...inp, seasonIdx: v })}
          colors={colors}
          fontMono={fontMono}
          track={colors.textDim}
          fmt={(v) => `${(2016 + v * 6).toFixed(1)}`}
        />

        <div className="mt-[16px]">
          <Label colors={colors}>Player presets</Label>
          <div className="grid grid-cols-2 gap-[6px]">
            {CUT_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setInp(p.inputs)}
                className="px-[10px] py-[6px] text-left"
                style={{
                  background: colors.panelDeep,
                  border: "1px solid " + colors.borderSoft,
                }}
              >
                <div style={{ fontSize: 11, color: colors.text, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>
                  {p.rationale}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Methodology colors={colors} fontMono={fontMono}>
          <strong>Why a cut model is hard:</strong> base rate is ~60% (most rows are pros who
          regularly make cuts), so a model that just predicts &quot;always made&quot; would beat 60% on
          its own. Beating that ~1.5pp is real signal — it means the model is using the
          lagged-form features beyond a no-information majority guess.
          <br />
          <strong>Confusion matrix on train:</strong>{" "}
          <span style={{ fontFamily: fontMono }}>
            TP {conf.tp} · FP {conf.fp} · FN {conf.fn} · TN {conf.tn}
          </span>
          <br />
          Precision {(precision * 100).toFixed(1)}% · Recall {(recall * 100).toFixed(1)}% · F1{" "}
          {f1.toFixed(2)}
          <br />
          <strong>Limitations:</strong> course-difficulty isn&apos;t modeled, head-to-head field
          strength is collapsed into the purse signal, and the lag is one season — a hot start
          this season doesn&apos;t reflect.
        </Methodology>
      </div>

      <div>
        <h3
          style={{
            fontSize: 13,
            color: colors.text,
            fontWeight: 600,
            marginBottom: 8,
            letterSpacing: "-0.005em",
          }}
        >
          Cut probability
        </h3>

        <ScoreCard
          colors={colors}
          fontMono={fontMono}
          label="P(made cut)"
          pct={result.p}
          verdict={verdict}
          verdictColor={verdictColor}
          ratePct={cutPct}
          bracket={`vs base rate ${(cutModel.baseRate * 100).toFixed(0)}%`}
        />

        <Label colors={colors}>Per-feature contribution to logit</Label>
        <p style={{ fontSize: 10, color: colors.textFaint, marginBottom: 10 }}>
          z = {result.z.toFixed(2)} · σ(z) = P(made cut). Positive contributions (green) push the
          player toward making the cut; negative (red) push toward missing.
        </p>

        <div className="space-y-[3px]">
          {cutModel.featureNames.map((name, i) => (
            <ContribRow
              key={name}
              label={cutModel.featureLabels[i] ?? name}
              contribution={result.contributions[i]}
              weight={result.w[i]}
              input={result.x[i]}
              isBias={i === 0}
              maxAbs={maxAbsContrib || 1}
              colors={colors}
              fontMono={fontMono}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 10,
            color: colors.textFaint,
            fontFamily: fontMono,
          }}
        >
          Train accuracy: {(cutModel.accuracy * 100).toFixed(1)}% · base rate{" "}
          {(cutModel.baseRate * 100).toFixed(1)}% · Δ +{((cutModel.accuracy - cutModel.baseRate) * 100).toFixed(2)}pp.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODEL C: Tournament Finish (linear regression)
// ============================================================

interface FinishInputs {
  priorPutt: number;
  priorArg: number;
  priorApp: number;
  priorOtt: number;
  courseDifficulty: number; // 0..1
  purseNorm: number; // 0..1
  major: boolean;
}

const FINISH_PRESETS: { name: string; inputs: FinishInputs; rationale: string }[] = [
  {
    name: "Top-10 player at the Masters",
    inputs: { priorPutt: 0.3, priorArg: 0.3, priorApp: 0.8, priorOtt: 0.5, courseDifficulty: 0.95, purseNorm: 0.85, major: true },
    rationale: "Strong all-around at the season's hardest stage",
  },
  {
    name: "Mid-tier pro at fall opposite event",
    inputs: { priorPutt: 0.0, priorArg: 0.0, priorApp: 0.2, priorOtt: 0.0, courseDifficulty: 0.3, purseNorm: 0.25, major: false },
    rationale: "Average player at a low-purse weak-field event",
  },
  {
    name: "Struggling vet at U.S. Open",
    inputs: { priorPutt: -0.5, priorArg: -0.2, priorApp: -0.3, priorOtt: -0.4, courseDifficulty: 1.0, purseNorm: 0.85, major: true },
    rationale: "Below-tour-avg form at the year's toughest test",
  },
  {
    name: "Rising rookie at PGA Championship",
    inputs: { priorPutt: 0.2, priorArg: 0.4, priorApp: 0.5, priorOtt: 0.3, courseDifficulty: 0.85, purseNorm: 0.85, major: true },
    rationale: "Improving young player at the year's 2nd major",
  },
];

function featurizeFinish(inp: FinishInputs): number[] {
  return [
    1,
    inp.priorPutt,
    inp.priorArg,
    inp.priorApp,
    inp.priorOtt,
    inp.courseDifficulty,
    inp.purseNorm,
    inp.major ? 1 : 0,
  ];
}

function FinishModelView({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  const [inp, setInp] = useState<FinishInputs>({
    priorPutt: 0.1,
    priorArg: 0.1,
    priorApp: 0.4,
    priorOtt: 0.2,
    courseDifficulty: 0.5,
    purseNorm: 0.5,
    major: false,
  });

  const result = useMemo(() => {
    const x = featurizeFinish(inp);
    const w = finishModel.weights;
    const featMeans = finishModel.featMeans;
    const featStds = finishModel.featStds;

    // Standardize the input features (skip bias)
    const xStd = x.map((v, j) => (j === 0 ? 1 : (v - featMeans[j]) / featStds[j]));
    // Compute standardized prediction (sum of weight × standardized input)
    const predStd = xStd.reduce((s, v, k) => s + v * w[k], 0);
    // Un-standardize
    const predFinish = predStd * finishModel.yStd + finishModel.yMean;
    const clipped = Math.max(1, Math.min(100, predFinish));

    // Per-feature contributions in standardized space, then convert to "Finish positions" by multiplying by yStd
    const contribs = xStd.map((v, j) => {
      if (j === 0) return w[j] * finishModel.yStd; // bias contribution to position
      return v * w[j] * finishModel.yStd;
    });

    return { x, xStd, predStd, predFinish, clipped, contribs };
  }, [inp]);

  const verdict =
    result.clipped <= 5
      ? "Win contender"
      : result.clipped <= 15
      ? "Top 15 contender"
      : result.clipped <= 30
      ? "Made cut, mid-pack"
      : result.clipped <= 60
      ? "Backmarker (made cut)"
      : "Likely missed cut";
  const verdictColor =
    result.clipped <= 5
      ? colors.brand
      : result.clipped <= 15
      ? "#a4d99a"
      : result.clipped <= 30
      ? colors.warn
      : "#f0686a";

  const maxAbsContrib = Math.max(
    ...result.contribs.slice(1).map((c) => Math.abs(c))
  );
  const r2Pct = Math.max(0, finishModel.r2 * 100);

  return (
    <div className="grid grid-cols-2 gap-[14px]">
      <div>
        <h3 style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.005em" }}>
          Tournament context
        </h3>
        <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 14 }}>
          Linear regression trained on{" "}
          {finishModel.trainedOn.toLocaleString()} tournament rows (2016–2022) — features are{" "}
          <em>lagged</em> from the player&apos;s prior season so there&apos;s no leakage. R² is{" "}
          modest ({r2Pct.toFixed(1)}%) — finish position is dominated by within-week variance and
          field strength that the lagged features can&apos;t fully capture.
        </p>

        <Slider label="Prior SG-Putt" value={inp.priorPutt} min={-1.5} max={1.5} step={0.05} unit="" onChange={(v) => setInp({ ...inp, priorPutt: v })} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)} />
        <Slider label="Prior SG-Arg" value={inp.priorArg} min={-1.5} max={1.5} step={0.05} unit="" onChange={(v) => setInp({ ...inp, priorArg: v })} colors={colors} fontMono={fontMono} track="#e063b8" fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)} />
        <Slider label="Prior SG-Approach" value={inp.priorApp} min={-1.5} max={1.5} step={0.05} unit="" onChange={(v) => setInp({ ...inp, priorApp: v })} colors={colors} fontMono={fontMono} track={colors.accent} fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)} />
        <Slider label="Prior SG-Off-the-Tee" value={inp.priorOtt} min={-1.5} max={1.5} step={0.05} unit="" onChange={(v) => setInp({ ...inp, priorOtt: v })} colors={colors} fontMono={fontMono} track={colors.brand} fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)} />
        <Slider label="Course difficulty (0=easy, 1=hardest)" value={inp.courseDifficulty} min={0} max={1} step={0.01} unit="" onChange={(v) => setInp({ ...inp, courseDifficulty: v })} colors={colors} fontMono={fontMono} track={colors.brand} fmt={(v) => v.toFixed(2)} />
        <Slider label="Purse (normalized 0..1)" value={inp.purseNorm} min={0} max={1} step={0.01} unit="" onChange={(v) => setInp({ ...inp, purseNorm: v })} colors={colors} fontMono={fontMono} track={colors.warn} fmt={(v) => v.toFixed(2)} />

        <div className="mt-[14px]">
          <Label colors={colors}>Major championship</Label>
          <div className="flex gap-[6px]">
            {[
              { v: false, lbl: "Regular event" },
              { v: true, lbl: "Major" },
            ].map((opt) => (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => setInp({ ...inp, major: opt.v })}
                className="px-[14px] py-[5px]"
                style={{
                  background: inp.major === opt.v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (inp.major === opt.v ? colors.brand : colors.borderSoft),
                  color: inp.major === opt.v ? colors.text : colors.textDim,
                  fontSize: 12,
                  letterSpacing: "0.06em",
                }}
              >
                {opt.lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-[16px]">
          <Label colors={colors}>Player presets</Label>
          <div className="grid grid-cols-2 gap-[6px]">
            {FINISH_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setInp(p.inputs)}
                className="px-[10px] py-[6px] text-left"
                style={{ background: colors.panelDeep, border: "1px solid " + colors.borderSoft }}
              >
                <div style={{ fontSize: 11, color: colors.text, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>{p.rationale}</div>
              </button>
            ))}
          </div>
        </div>

        <Methodology colors={colors} fontMono={fontMono}>
          <strong>Why R² is modest:</strong> finish position is dominated by within-tournament
          variance — putts that lipped out, an unlucky tee time draw, weather wave splits. The
          lagged features capture the floor of a player&apos;s ability but can&apos;t predict
          which week they&apos;ll catch fire.
          <br />
          <strong>RMSE:</strong> {finishModel.rmse.toFixed(1)} positions on average. A predicted
          T20 might actually finish anywhere from T1 to T40. Use the prediction as a base
          expectation, not a forecast.
          <br />
          <strong>Limitations:</strong> not modeled — current-season form (rolling 4 events),
          head-to-head field strength, course-specific player history (which is what Scene 6 in
          the 3D Visuals tab tries to convey).
        </Methodology>
      </div>

      <div>
        <h3 style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.005em" }}>
          Predicted finish
        </h3>

        <div
          className="px-[16px] py-[18px] mb-[10px]"
          style={{ background: colors.panelDeep, border: "1px solid " + colors.border }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.18em" }}>
              Predicted finish position
            </span>
            <span style={{ fontSize: 10, color: colors.textFaint, fontFamily: fontMono }}>
              (1 = win, 100 = back of pack)
            </span>
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 600,
              color: verdictColor,
              fontFamily: fontMono,
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            T{Math.round(result.clipped)}
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 6, letterSpacing: "0.04em" }}>
            <span style={{ color: verdictColor }}>● </span>
            {verdict}
          </div>
          <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 8, fontFamily: fontMono }}>
            ± {finishModel.rmse.toFixed(0)} positions (RMSE)
          </div>
          <div
            style={{
              marginTop: 12,
              height: 8,
              background: colors.panel,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (result.clipped / 100) * 100)}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${colors.brand} 0%, ${verdictColor} 100%)`,
                transition: "width 200ms",
              }}
            />
          </div>
        </div>

        <Label colors={colors}>Per-feature contribution (in finish positions)</Label>
        <p style={{ fontSize: 10, color: colors.textFaint, marginBottom: 10 }}>
          Each row shows how that feature, at the current input, pushes the predicted finish
          relative to the field average. Negative (green) = pulls toward winning (lower number);
          positive (red) = pushes toward back of pack.
        </p>

        <div className="space-y-[3px]">
          {finishModel.featureNames.map((name, i) => (
            <ContribRow
              key={name}
              label={finishModel.featureLabels[i] ?? name}
              contribution={result.contribs[i]}
              weight={finishModel.weights[i]}
              input={result.x[i]}
              isBias={i === 0}
              maxAbs={maxAbsContrib || 1}
              colors={colors}
              fontMono={fontMono}
              invertColor
            />
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: colors.textFaint, fontFamily: fontMono }}>
          R²: {(finishModel.r2 * 100).toFixed(1)}% · RMSE: {finishModel.rmse.toFixed(2)} · n =
          {" "}{finishModel.trainedOn.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared UI bits
// ============================================================

function ScoreCard({
  colors,
  fontMono,
  label,
  pct,
  verdict,
  verdictColor,
  ratePct,
  bracket,
}: {
  colors: Colors;
  fontMono: string;
  label: string;
  pct: number;
  verdict: string;
  verdictColor: string;
  ratePct: string;
  bracket?: string;
}) {
  void fontMono;
  return (
    <div
      className="px-[16px] py-[18px] mb-[10px]"
      style={{ background: colors.panelDeep, border: "1px solid " + colors.border }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            color: colors.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
          }}
        >
          {label}
        </span>
        {bracket && (
          <span style={{ fontSize: 10, color: colors.textFaint, fontFamily: fontMono }}>
            ({bracket})
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 600,
          color: verdictColor,
          fontFamily: fontMono,
          lineHeight: 1,
          marginTop: 8,
        }}
      >
        {ratePct}%
      </div>
      <div
        style={{
          fontSize: 12,
          color: colors.textDim,
          marginTop: 6,
          letterSpacing: "0.04em",
        }}
      >
        <span style={{ color: verdictColor }}>● </span>
        {verdict}
      </div>
      <div
        style={{
          marginTop: 12,
          height: 8,
          background: colors.panel,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${colors.warn} 0%, ${verdictColor} 100%)`,
            transition: "width 200ms",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: colors.borderSoft,
          }}
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  colors,
  fontMono,
  track,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  colors: Colors;
  fontMono: string;
  track: string;
  fmt?: (v: number) => string;
}) {
  return (
    <div className="mt-[12px]">
      <div className="flex items-baseline justify-between mb-[4px]">
        <Label colors={colors}>{label}</Label>
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 13,
            color: colors.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: colors.textFaint,
          fontFamily: fontMono,
        }}
      >
        <span>
          {fmt ? fmt(min) : min + unit}
        </span>
        <span>
          {fmt ? fmt(max) : max + unit}
        </span>
      </div>
    </div>
  );
}

function Label({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: colors.textFaint,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function ContribRow({
  label,
  contribution,
  weight,
  input,
  isBias,
  maxAbs,
  colors,
  fontMono,
  invertColor,
}: {
  label: string;
  contribution: number;
  weight: number;
  input: number;
  isBias: boolean;
  maxAbs: number;
  colors: Colors;
  fontMono: string;
  invertColor?: boolean;
}) {
  // For finish-prediction, lower predicted position = better, so we want
  // negative contributions (toward winning) shown in green and positive
  // (toward back of pack) in red. invertColor=true flips the color mapping.
  const sign = contribution >= 0 ? 1 : -1;
  const isGood = invertColor ? sign < 0 : sign > 0;
  const pct = isBias ? 0 : Math.min(100, (Math.abs(contribution) / maxAbs) * 100);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px 1fr 130px",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 10.5, color: colors.textDim }}>{label}</span>
      <div
        style={{
          height: 10,
          background: colors.panel,
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: `${pct / 2}%`,
            height: "100%",
            background: isGood ? colors.brand : "#f0686a",
            marginLeft: sign > 0 ? "50%" : `${50 - pct / 2}%`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: colors.borderSoft,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: isGood ? colors.brand : "#f0686a",
          fontFamily: fontMono,
          textAlign: "right",
        }}
      >
        {contribution >= 0 ? "+" : ""}
        {contribution.toFixed(2)}
        {!isBias && (
          <span style={{ color: colors.textFaint }}>
            {" "}
            (w={weight.toFixed(2)} · x={input.toFixed(2)})
          </span>
        )}
      </span>
    </div>
  );
}

function Methodology({
  colors,
  fontMono,
  children,
}: {
  colors: Colors;
  fontMono: string;
  children: React.ReactNode;
}) {
  void fontMono;
  return (
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
      <div
        style={{
          fontSize: 9,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          marginBottom: 6,
        }}
      >
        Methodology + caveats
      </div>
      {children}
    </div>
  );
}

"use client";

/**
 * Learning tab: explain what's in the data, show EDA aggregates as bar charts.
 *
 * Data sources:
 *   - data/golfdata/eda.json  - Quinlan-style weather × play (1,095 days, pedagogical)
 *   - data/golfdata/pga_*.json - real PGA Tour 2015–2022 (36,864 rows, 400+ pros)
 */

import { useMemo } from "react";
import edaData from "@/data/golfdata/eda.json";
import kmeansDiagnostics from "@/data/golfdata/pga_kmeans_diagnostics.json";

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

interface Props {
  colors: Colors;
  fontMono: string;
  fontUi: string;
}

export default function LearningTab({ colors, fontMono, fontUi }: Props) {
  void fontUi;

  const outlookMax = useMemo(
    () => Math.max(...edaData.byOutlook.map((o) => o.playRate)),
    []
  );
  const monthMax = useMemo(
    () => Math.max(...edaData.byMonth.map((m) => m.playRate)),
    []
  );

  return (
    <div className="h-full overflow-y-auto p-[16px]" style={{ fontFamily: fontUi }}>
      <SectionTitle colors={colors}>Why this dataset?</SectionTitle>
      <p style={{ color: colors.textDim, fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}>
        Two datasets. The Quinlan &quot;play golf&quot; weather dataset (1,095 days × 7 players,
        binary &quot;did anyone play?&quot; target) is the classic ML teaching case - pedagogical,
        not predictive of anything a fund cares about. The real work is on a PGA Tour 2015–2022
        feed (36,864 tournament rows with strokes-gained) - every supervised model and the
        Strategy Lab is built on this. Everything below was pre-aggregated client-side so there
        are no API calls and the models run in your browser.
      </p>

      {/* SG (Strokes Gained) explainer - most viewers don't know what SG is */}
      <SectionTitle colors={colors}>What is Strokes Gained (SG)?</SectionTitle>
      <p style={{ color: colors.textDim, fontSize: 13, lineHeight: 1.55, maxWidth: 720, marginBottom: 12 }}>
        Most PGA scenes in this lab use <strong style={{ color: colors.text }}>Strokes Gained</strong>{" "}
        on their axes. SG is how many strokes a player saves vs the field average on a shot type
        - positive = better than the field, 0 = average, negative = worse. Benchmarks below.
      </p>

      <div
        className="grid gap-[8px] mb-[14px]"
        style={{ gridTemplateColumns: "repeat(3, 1fr)", background: colors.border }}
      >
        <SgBenchCard label="Elite top-50" value="+1.0" tone={colors.brand} body="Players who consistently save a stroke per round vs the field - the elite envelope." colors={colors} fontMono={fontMono} />
        <SgBenchCard label="Tour-average" value="0.0" tone={colors.textDim} body="The field-average baseline. By definition this is what the average tour pro hits each round." colors={colors} fontMono={fontMono} />
        <SgBenchCard label="Struggling" value="−1.0" tone="#f0686a" body="Below-field-average. A pro at this level is fighting to keep their tour card." colors={colors} fontMono={fontMono} />
      </div>

      <div
        className="grid gap-[1px] mb-[14px]"
        style={{ gridTemplateColumns: "repeat(2, 1fr)", background: colors.border }}
      >
        <SgComponentCard color="#f0a020" label="SG-Putt" body="Strokes saved on the green vs field. +0.5 = elite putting touch on a given round." colors={colors} fontMono={fontMono} />
        <SgComponentCard color="#e063b8" label="SG-Around-Green (Arg)" body="Chipping, pitching, sand within ~30 yards. Captures short-game touch." colors={colors} fontMono={fontMono} />
        <SgComponentCard color="#33BBFF" label="SG-Approach (App)" body="Iron play from the fairway, ~100-225 yards. Often the biggest separator at the elite level." colors={colors} fontMono={fontMono} />
        <SgComponentCard color="#5dd39e" label="SG-Off-the-Tee (Ott)" body="Driving distance + accuracy. Sets up every other shot - elite ball-strikers build their edge here." colors={colors} fontMono={fontMono} />
      </div>

      <div
        style={{
          padding: 10,
          background: colors.panelDeep,
          border: "1px solid " + colors.borderSoft,
          fontSize: 11,
          color: colors.textDim,
          lineHeight: 1.55,
          marginBottom: 18,
        }}
      >
        <strong style={{ color: colors.text }}>Math:</strong>{" "}
        <span style={{ fontFamily: fontMono }}>
          SG-Putt + SG-Arg + SG-App + SG-Ott ≈ SG-Total
        </span>{" "}
        (with rounding noise). Every PGA-related 3D scene in this lab has a{" "}
        <strong style={{ color: colors.text }}>&ldquo;What is SG?&rdquo;</strong> button in the
        canvas corner that opens this same reference if you forget mid-scene.
      </div>

      <SectionTitle colors={colors}>Methods used</SectionTitle>
      <div
        className="grid grid-cols-2 gap-[1px]"
        style={{ background: colors.border }}
      >
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Supervised - Classification (Logistic Regression)"
          body="Three LR classifiers trained offline with batch gradient descent: (A) play prediction on weather → anyPlay (pedagogical, 1,095 rows). (B) PGA cut prediction on lagged player profile → made_cut, 32,690 rows; walk-forward OOS validated across 2020/2021/2022 with ~+2.5pp lift over base rate and 10-decile calibration. (C) Top-10 classifier on lagged SG components + course difficulty + purse + major flag, 12,868 rows; walk-forward OOS AUC ~0.64 (was a finish-position regression with R²=7% - reframed as binary because 'made top 10?' is a question a fund actually asks)."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="OOS validation - Walk-forward CV + calibration"
          body="Both supervised PGA models (cut & top-10) are evaluated walk-forward by season: train on rows season<Y, predict season===Y, repeat for Y ∈ {2020, 2021, 2022}. Stitched OOS predictions feed a 10-decile calibration plot (predicted probability vs actual rate) plus Brier score. Per-fold lift / AUC tables surface in the Predictions tab. This is the only way to know if in-sample fit generalizes."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Unsupervised - K-means k=4 + PCA"
          body="K-means clusters the top 60 PGA pros on z-scored career SG signatures. The 'Why k=4?' panel above shows the elbow + silhouette sweep across k=2..6 - silhouette actually peaks at k=2; we chose k=4 for interpretability (one cluster per SG component), not statistical optimality. PCA on the same 4D space (eigendecomposition via Jacobi rotation) collapses it to 2 meaningful dimensions you can read in the PCA Biplot scene."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Stochastic - GBM + EWMA volatility"
          body="Model D treats per-event SG-Total as a discrete stochastic process: SG_t = μ + σ·Z_t with Z_t~N(0,1). Drift μ̂ from career mean; volatility σ̂ from career, rolling-12, or RiskMetrics EWMA (λ=0.94, the IGARCH(1,1) special case). Runs 50–1000 Monte Carlo paths forward, renders the random walks + a histogram of terminal outcomes."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Quant research - L/S backtest + walk-forward CV + blend (bias-corrected)"
          body="The Strategy Lab runs cross-sectional momentum / mean-rev / Sharpe-rank / blend signals on a 100-player universe with vol-target inverse-σ sizing. Past-only signals: rolling vol-target uses last-12-months realized σ̂ (no full-sample look-ahead); mean-rev baseline uses an EXPANDING (past-only) career mean rather than the v1 full-sample mean. Walk-forward CV: rolling train/test windows, OOS equity stitched across folds, OOS market series stitched alongside (no zero-vector benchmark). When signal=blend, blend weights are RE-OPTIMIZED on the train slice each fold - the per-fold weight drift table makes signal instability visible. Risk panel: Sharpe / Sortino / Calmar / CVaR(5%) / max-DD-duration / monthly heatmap / rolling-12m Sharpe (clearly labeled as SG-signal Sharpe, not market Sharpe). Cost model: bps-per-L1-turnover with break-even cost. Regime split: bull/bear/majors. Attribution: per-month returns decomposed by DYNAMIC per-season k-means archetype (Putting / Approach / Around-Green / Off-the-Tee), so attribution honors a player's profile evolution. Blend mode runs a 66-point 3-simplex grid sweep on the active sample only (display purposes); walk-forward re-optimizes per fold. The Walk-Forward Sharpe 3D scene plots OOS Sharpe per (year × signal) so IS→OOS deflation is legible at a glance."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Descriptive - EDA + Pearson r + Time-series"
          body="Bar charts, SG-component correlation matrix, year-over-year improvement leaders, major-vs-regular splits, player×course matrix, per-season cluster snapshots for the animated 3D Cluster Timeline. All aggregated to JSON at build time."
        />
      </div>

      <SectionTitle colors={colors}>Why k=4? - k-means justification</SectionTitle>
      <KmeansDiagnosticsPanel colors={colors} fontMono={fontMono} />

      <div className="mt-[18px] grid grid-cols-3 gap-[1px]" style={{ background: colors.border }}>
        <Stat label="Total days" value={edaData.totalDays.toLocaleString()} colors={colors} fontMono={fontMono} />
        <Stat label="Outlooks tracked" value={String(edaData.byOutlook.length)} colors={colors} fontMono={fontMono} />
        <Stat label="Avg play rate" value={`${(avgPlayRate() * 100).toFixed(1)}%`} colors={colors} fontMono={fontMono} />
      </div>

      <SectionTitle colors={colors}>Play rate by outlook</SectionTitle>
      <div className="space-y-[6px]">
        {edaData.byOutlook
          .sort((a, b) => b.playRate - a.playRate)
          .map((o) => (
            <BarRow
              key={o.outlook}
              label={o.outlook}
              value={o.playRate}
              max={outlookMax}
              right={`${(o.playRate * 100).toFixed(1)}% · ${o.days} days · ${o.avgHoursWhenPlayed.toFixed(1)}h avg`}
              colors={colors}
              fontMono={fontMono}
              barColor={
                o.outlook === "sunny"
                  ? colors.warn
                  : o.outlook === "overcast"
                  ? colors.accent
                  : o.outlook === "rain"
                  ? "#5fa3d6"
                  : colors.textFaint
              }
            />
          ))}
      </div>

      <SectionTitle colors={colors}>Play rate by month</SectionTitle>
      <div className="space-y-[4px]">
        {edaData.byMonth.map((m) => (
          <BarRow
            key={m.month}
            label={m.month}
            value={m.playRate}
            max={monthMax}
            right={`${(m.playRate * 100).toFixed(0)}% · ${m.avgTemp.toFixed(1)}°C avg`}
            colors={colors}
            fontMono={fontMono}
            barColor={colors.brand}
          />
        ))}
      </div>

      <SectionTitle colors={colors}>Play rate by season</SectionTitle>
      <div
        className="grid grid-cols-4 gap-[1px]"
        style={{ background: colors.border }}
      >
        {edaData.bySeason.map((s) => (
          <SeasonCard key={s.season} season={s} colors={colors} fontMono={fontMono} />
        ))}
      </div>

      <div className="mt-[20px] mb-[8px]" style={{ height: 20 }} />
    </div>
  );
}

function SgBenchCard({
  label,
  value,
  tone,
  body,
  colors,
  fontMono,
}: {
  label: string;
  value: string;
  tone: string;
  body: string;
  colors: Colors;
  fontMono: string;
}) {
  return (
    <div className="px-[12px] py-[10px]" style={{ background: colors.panelDeep }}>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 24,
          fontWeight: 600,
          color: tone,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: colors.textFaint,
          marginTop: 4,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}

function SgComponentCard({
  color,
  label,
  body,
  colors,
  fontMono,
}: {
  color: string;
  label: string;
  body: string;
  colors: Colors;
  fontMono: string;
}) {
  void fontMono;
  return (
    <div className="px-[12px] py-[10px]" style={{ background: colors.panelDeep }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 10,
            height: 10,
            background: color,
            borderRadius: 2,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, color: color }}>{label}</div>
      </div>
      <div style={{ fontSize: 11, color: colors.textDim, marginTop: 6, lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

function MethodCard({
  colors,
  fontMono,
  title,
  body,
}: {
  colors: Colors;
  fontMono: string;
  title: string;
  body: string;
}) {
  void fontMono;
  return (
    <div className="px-[12px] py-[10px]" style={{ background: colors.panelDeep }}>
      <div
        style={{
          fontSize: 10,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {title}
      </div>
      <div
        style={{ fontSize: 11, color: colors.textDim, marginTop: 6, lineHeight: 1.55 }}
      >
        {body}
      </div>
    </div>
  );
}

function avgPlayRate(): number {
  const total = edaData.byOutlook.reduce((a, o) => a + o.days, 0);
  const played = edaData.byOutlook.reduce((a, o) => a + o.days * o.playRate, 0);
  return played / total;
}

function SectionTitle({
  colors,
  children,
}: {
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <h3
      className="mt-[20px] mb-[10px]"
      style={{
        color: colors.text,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        borderBottom: "1px solid " + colors.borderSoft,
        paddingBottom: 6,
      }}
    >
      {children}
    </h3>
  );
}

function Stat({
  label,
  value,
  colors,
  fontMono,
}: {
  label: string;
  value: string;
  colors: Colors;
  fontMono: string;
}) {
  return (
    <div className="px-[12px] py-[10px]" style={{ background: colors.panelDeep }}>
      <div
        style={{
          fontSize: 10,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 18, color: colors.text, fontFamily: fontMono, marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  right,
  colors,
  fontMono,
  barColor,
}: {
  label: string;
  value: number;
  max: number;
  right: string;
  colors: Colors;
  fontMono: string;
  barColor: string;
}) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-[10px]">
      <div
        style={{
          width: 80,
          fontSize: 11,
          color: colors.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div className="flex-1 relative" style={{ height: 14, background: colors.panelDeep }}>
        <div
          style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width 200ms" }}
        />
      </div>
      <div
        style={{
          minWidth: 200,
          fontSize: 11,
          color: colors.textDim,
          fontFamily: fontMono,
          textAlign: "right",
        }}
      >
        {right}
      </div>
    </div>
  );
}

function KmeansDiagnosticsPanel({
  colors,
  fontMono,
}: {
  colors: Colors;
  fontMono: string;
}) {
  const diag = kmeansDiagnostics.diagnostics;
  const chosenK = kmeansDiagnostics.chosenK;
  const W = 540;
  const H = 180;
  const PAD = 36;
  const ks = diag.map((d) => d.k);
  const wcssVals = diag.map((d) => d.wcss);
  const silVals = diag.map((d) => d.silhouette);
  const minK = Math.min(...ks);
  const maxK = Math.max(...ks);
  const wcssMax = Math.max(...wcssVals);
  const wcssMin = Math.min(...wcssVals);
  const silMax = Math.max(...silVals, 0.5);
  const silMin = Math.min(...silVals, 0);
  const xs = (k: number) => PAD + ((k - minK) / Math.max(1, maxK - minK)) * (W - 2 * PAD);
  const yWcss = (v: number) => H - PAD - ((v - wcssMin) / Math.max(0.001, wcssMax - wcssMin)) * (H - 2 * PAD);
  const ySil = (v: number) => H - PAD - ((v - silMin) / Math.max(0.001, silMax - silMin)) * (H - 2 * PAD);
  // Best k by silhouette
  const bestSilK = diag.reduce((best, d) => (d.silhouette > best.silhouette ? d : best), diag[0]);

  return (
    <div
      style={{
        background: colors.panelDeep,
        border: "1px solid " + colors.borderSoft,
        padding: 12,
        marginBottom: 18,
      }}
    >
      <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginBottom: 10 }}>
        Sweep k=2..6 on the same z-scored 4D career-SG matrix. <strong style={{ color: colors.text }}>Two diagnostics:</strong>{" "}
        WCSS (within-cluster sum of squares - lower = tighter clusters; always drops with k, look
        for the elbow) and average <strong style={{ color: colors.text }}>silhouette score</strong>{" "}
        (intra-vs-inter-cluster distance ratio; higher = better-separated clusters; ranges [-1, 1],
        &gt;0.5 strong, &gt;0.25 weak-but-real).
      </p>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: colors.panel, border: "1px solid " + colors.borderSoft }}>
        {/* Y axes - WCSS on left, Silhouette on right */}
        <text x={4} y={PAD - 4} fontSize={10} fill={colors.brand} fontFamily={fontMono}>WCSS</text>
        <text x={W - 4} y={PAD - 4} fontSize={10} fill={colors.warn} fontFamily={fontMono} textAnchor="end">silhouette</text>

        {/* WCSS line */}
        <polyline
          points={diag.map((d) => `${xs(d.k)},${yWcss(d.wcss)}`).join(" ")}
          fill="none"
          stroke={colors.brand}
          strokeWidth={2}
        />
        {diag.map((d) => (
          <g key={`wcss-${d.k}`}>
            <circle cx={xs(d.k)} cy={yWcss(d.wcss)} r={4} fill={colors.brand} />
            <text x={xs(d.k)} y={yWcss(d.wcss) - 8} fontSize={9} fill={colors.brand} fontFamily={fontMono} textAnchor="middle">
              {d.wcss.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Silhouette line */}
        <polyline
          points={diag.map((d) => `${xs(d.k)},${ySil(d.silhouette)}`).join(" ")}
          fill="none"
          stroke={colors.warn}
          strokeWidth={2}
          strokeDasharray="4,2"
        />
        {diag.map((d) => (
          <g key={`sil-${d.k}`}>
            <circle cx={xs(d.k)} cy={ySil(d.silhouette)} r={4} fill={colors.warn} />
            <text x={xs(d.k)} y={ySil(d.silhouette) + 14} fontSize={9} fill={colors.warn} fontFamily={fontMono} textAnchor="middle">
              {d.silhouette.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Highlight chosen k */}
        <line x1={xs(chosenK)} y1={PAD - 4} x2={xs(chosenK)} y2={H - PAD + 4} stroke={colors.text} strokeDasharray="2,2" opacity={0.4} />
        <text x={xs(chosenK)} y={H - 6} fontSize={10} fill={colors.text} fontFamily={fontMono} textAnchor="middle" fontWeight={700}>
          k={chosenK} chosen
        </text>

        {/* X-axis k labels */}
        {ks.map((k) => (
          <text key={`xl-${k}`} x={xs(k)} y={H - 18} fontSize={9} fill={colors.textFaint} fontFamily={fontMono} textAnchor="middle">
            {k}
          </text>
        ))}
        <text x={W / 2} y={H - 4} fontSize={10} fill={colors.textDim} fontFamily={fontMono} textAnchor="middle">
          k (number of clusters)
        </text>
      </svg>

      <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55, marginTop: 10 }}>
        <strong style={{ color: colors.text }}>Honest read:</strong> the silhouette score actually peaks at <span style={{ color: colors.warn, fontFamily: fontMono }}>k={bestSilK.k} ({bestSilK.silhouette.toFixed(2)})</span>; k=4 ({(diag.find((d) => d.k === 4)?.silhouette ?? 0).toFixed(2)}) is weaker by that metric. We chose <strong style={{ color: colors.text }}>k=4</strong> because the four SG components (Putt / Arg / App / Ott) suggest a 4-archetype carving that's interpretable to a domain reader, even if the geometry would prefer fewer clusters. WCSS shows a soft elbow around k=3 that supports this - past k=3 the marginal WCSS reduction flattens, suggesting added clusters are splitting noise. The honest framing: <em>k=4 is an interpretability choice, not a statistical optimum.</em>
      </p>
    </div>
  );
}

function SeasonCard({
  season,
  colors,
  fontMono,
}: {
  season: { season: string; days: number; playRate: number; avgTemp: number; avgHoursWhenPlayed: number };
  colors: Colors;
  fontMono: string;
}) {
  return (
    <div className="px-[12px] py-[10px]" style={{ background: colors.panelDeep }}>
      <div
        style={{
          fontSize: 11,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {season.season}
      </div>
      <div
        style={{ fontSize: 18, color: colors.brand, fontFamily: fontMono, marginTop: 4 }}
      >
        {(season.playRate * 100).toFixed(0)}%
      </div>
      <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4, lineHeight: 1.4 }}>
        {season.days} days · {season.avgTemp.toFixed(1)}°C avg
        <br />
        {season.avgHoursWhenPlayed.toFixed(1)}h when played
      </div>
    </div>
  );
}


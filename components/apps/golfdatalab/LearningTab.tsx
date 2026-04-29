"use client";

/**
 * Learning tab: explain what's in the data, show EDA aggregates as bar charts,
 * surface a few sample text records (reviews, emails, maintenance tasks).
 *
 * Data source: data/golfdata/eda.json + text_samples.json
 */

import { useMemo, useState } from "react";
import edaData from "@/data/golfdata/eda.json";
import textData from "@/data/golfdata/text_samples.json";

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

type TextKind = "reviews" | "emails" | "tasks";

export default function LearningTab({ colors, fontMono, fontUi }: Props) {
  const [textKind, setTextKind] = useState<TextKind>("reviews");

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
        The Quinlan &quot;play golf&quot; dataset is the classic ML teaching case — 14 rows
        of weather features and a binary &quot;did anyone play?&quot; target. This lab wraps
        an expanded version (1,095 days × 7 players + reviews/emails/maintenance text)
        and a real PGA Tour 2015–2022 feed (36,864 tournament rows with strokes-gained)
        into one interactive surface. Everything below was pre-aggregated client-side so
        there are no API calls and both models run in your browser.
      </p>

      <div
        className="mt-[14px] grid grid-cols-2 gap-[1px]"
        style={{ background: colors.border }}
      >
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Supervised — Classification (Logistic Regression)"
          body="Two LR classifiers trained offline with batch gradient descent: (A) play prediction on weather → anyPlay, 1,095 rows, 8 features, 69% acc. (B) PGA cut prediction on lagged player profile → made_cut, 32,690 rows, 6 features, 61.6% acc vs 60.1% base rate."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Supervised — Regression (Linear)"
          body="Model C predicts numeric tournament finish position (1=win, 100=back of pack) from lagged SG components + course difficulty + purse + major flag. 12,868 rows, 8 features. Modest R² (~7%) — finish is dominated by within-week variance, but the lagged signals do capture the floor of player ability."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Unsupervised — K-means k=4 + PCA"
          body="K-means clusters the top 60 PGA pros on z-scored career SG signatures into 4 archetypes. PCA on the same 4D space (eigendecomposition via Jacobi rotation) collapses it to 2 meaningful dimensions you can read in the PCA Biplot scene."
        />
        <MethodCard
          colors={colors}
          fontMono={fontMono}
          title="Descriptive — EDA + Pearson r + Time-series"
          body="Bar charts, SG-component correlation matrix, year-over-year improvement leaders, major-vs-regular splits, player×course matrix, per-season cluster snapshots for the animated 3D Cluster Timeline. All aggregated to JSON at build time."
        />
      </div>

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

      <SectionTitle colors={colors}>Sample text records</SectionTitle>
      <div className="flex gap-[6px] mb-[10px]">
        {(
          [
            ["reviews", `${textData.reviews.length} reviews`],
            ["emails", `${textData.emails.length} emails`],
            ["tasks", `${textData.tasks.length} tasks`],
          ] as [TextKind, string][]
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTextKind(k)}
            className="px-[10px] py-[3px]"
            style={{
              background: textKind === k ? colors.brandSoft : colors.panelDeep,
              border: "1px solid " + (textKind === k ? colors.brand : colors.borderSoft),
              color: textKind === k ? colors.text : colors.textDim,
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: fontUi,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
      <div className="space-y-[6px]">
        {textKind === "reviews" &&
          textData.reviews.slice(0, 8).map((r, i) => (
            <TextCard key={i} colors={colors} fontMono={fontMono}>
              <span style={{ color: colors.textFaint, fontFamily: fontMono }}>{r.d} · {r.p}</span>
              <div style={{ marginTop: 3, color: colors.text, fontSize: 12.5, lineHeight: 1.5 }}>
                &ldquo;{r.r}&rdquo;
              </div>
            </TextCard>
          ))}
        {textKind === "emails" &&
          textData.emails.slice(0, 6).map((e, i) => (
            <TextCard key={i} colors={colors} fontMono={fontMono}>
              <span style={{ color: colors.textFaint, fontFamily: fontMono }}>{e.d} · campaign</span>
              <div style={{ marginTop: 3, color: colors.text, fontSize: 12.5, lineHeight: 1.5 }}>
                {e.e}
              </div>
            </TextCard>
          ))}
        {textKind === "tasks" &&
          textData.tasks.slice(0, 8).map((t, i) => (
            <TextCard key={i} colors={colors} fontMono={fontMono}>
              <span style={{ color: colors.textFaint, fontFamily: fontMono }}>{t.d} · maintenance</span>
              <div style={{ marginTop: 3, color: colors.text, fontSize: 12.5, lineHeight: 1.5 }}>
                {t.t}
              </div>
            </TextCard>
          ))}
      </div>

      <div className="mt-[20px] mb-[8px]" style={{ height: 20 }} />
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

function TextCard({
  colors,
  fontMono,
  children,
}: {
  colors: Colors;
  fontMono: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="px-[12px] py-[8px]"
      style={{
        background: colors.panelDeep,
        border: "1px solid " + colors.borderSoft,
      }}
    >
      <div style={{ fontSize: 10, fontFamily: fontMono }}>{children}</div>
    </div>
  );
}

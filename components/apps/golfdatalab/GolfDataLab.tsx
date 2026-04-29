"use client";

/**
 * Golf Data Lab — interactive analysis of three golf datasets:
 *
 *   1. The classic 1,095-day weather × play dataset (3 years, 7 players)
 *   2. The 7,665-row long-format dataset with reviews / emails / maintenance
 *   3. PGA Tour tournament-level data 2015-2022 (36,864 rows, strokes-gained)
 *
 * Four tabs:
 *   · Learning      — what's in the data, EDA, sample text records
 *   · 3D Visuals    — rotatable Three.js scatter plot of weather × play
 *   · Predictions   — live in-browser logistic regression on weather inputs
 *   · PGA Tour      — season leaderboards by avg SG-Total + player drill-down
 *
 * All datasets pre-aggregated into JSON at build time by
 * scripts/prep-golf-data.mjs (~190KB total). No API calls — fully static.
 */

import { useState } from "react";
import type { WindowState } from "@/lib/wm/types";
import LearningTab from "./LearningTab";
import ThreeDTab from "./ThreeDTab";
import PredictionsTab from "./PredictionsTab";
import PgaTourTab from "./PgaTourTab";

const COLORS = {
  bg: "#0a1f12",
  panel: "#0d2818",
  panelAlt: "#102e1c",
  panelDeep: "#143b25",
  border: "#234a35",
  borderSoft: "rgba(35,74,53,0.6)",
  text: "#FFFFFF",
  textDim: "#9aa89e",
  textFaint: "#6a7670",
  brand: "#5dd39e",
  brandSoft: "rgba(93,211,158,0.18)",
  accent: "#33BBFF",
  warn: "#f0a020",
} as const;

const FONT_UI = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

type TabId = "learning" | "threed" | "predictions" | "pga";

const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: "learning", label: "Learning", sub: "EDA + ML methodology" },
  { id: "threed", label: "3D Visuals", sub: "8 scenes · 4 categories" },
  { id: "predictions", label: "Predictions", sub: "3 in-browser ML models" },
  { id: "pga", label: "PGA Tour 2015–2022", sub: "8 analysis views" },
];

export default function GolfDataLab({ window: _w }: { window: WindowState }) {
  const [tab, setTab] = useState<TabId>("learning");

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: FONT_UI }}
    >
      <Header />
      <TabBar tab={tab} setTab={setTab} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "learning" && <LearningTab colors={COLORS} fontMono={FONT_MONO} fontUi={FONT_UI} />}
        {tab === "threed" && <ThreeDTab colors={COLORS} fontMono={FONT_MONO} fontUi={FONT_UI} />}
        {tab === "predictions" && (
          <PredictionsTab colors={COLORS} fontMono={FONT_MONO} fontUi={FONT_UI} />
        )}
        {tab === "pga" && <PgaTourTab colors={COLORS} fontMono={FONT_MONO} fontUi={FONT_UI} />}
      </div>
      <StatusBar tab={tab} />
    </div>
  );
}

function Header() {
  return (
    <div
      className="flex items-center justify-between px-[14px] py-[8px] shrink-0"
      style={{ background: COLORS.panel, borderBottom: "1px solid " + COLORS.border }}
    >
      <div className="flex items-center gap-[10px]">
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Golf Data Lab
        </span>
        <span aria-hidden style={{ width: 1, height: 14, background: COLORS.border }} />
        <span
          style={{
            fontSize: 11,
            color: COLORS.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
          }}
        >
          Interactive ML + Visualization
        </span>
        <span
          style={{
            fontSize: 10,
            color: COLORS.textFaint,
            fontFamily: FONT_MONO,
            letterSpacing: "0.18em",
          }}
        >
          v1.0
        </span>
      </div>
      <div className="flex items-center gap-[10px]">
        <Pill color={COLORS.brand} label="3 trained ML models" />
        <Pill color={COLORS.warn} label="8 interactive 3D scenes" />
        <Pill color={COLORS.accent} label="36,864 PGA tournament rows" />
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="px-[8px] py-[2px] flex items-center gap-[6px]"
      style={{
        background: COLORS.panelDeep,
        border: "1px solid " + COLORS.borderSoft,
        fontSize: 10,
        letterSpacing: "0.14em",
        fontFamily: FONT_UI,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ color: COLORS.textDim }}>{label}</span>
    </span>
  );
}

function TabBar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <div
      className="flex shrink-0"
      style={{ borderBottom: "1px solid " + COLORS.border, background: COLORS.panel }}
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-[18px] py-[10px] text-left"
            style={{
              color: active ? COLORS.text : COLORS.textDim,
              borderBottom: active ? "2px solid " + COLORS.brand : "2px solid transparent",
              background: "transparent",
              fontFamily: FONT_UI,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, letterSpacing: "0.04em" }}>
              {t.label}
            </div>
            <div
              style={{
                fontSize: 10,
                color: active ? COLORS.textDim : COLORS.textFaint,
                marginTop: 1,
              }}
            >
              {t.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StatusBar({ tab }: { tab: TabId }) {
  const path: Record<TabId, string> = {
    learning: "lab/eda/overview",
    threed: "lab/viz/3d-scatter",
    predictions: "lab/model/logistic-regression",
    pga: "lab/pga/seasons",
  };
  return (
    <div
      className="px-[10px] py-[3px] flex justify-between text-[11px] shrink-0"
      style={{
        borderTop: "1px solid " + COLORS.border,
        background: "#061a0d",
        color: COLORS.textDim,
      }}
    >
      <span>
        <code style={{ color: COLORS.brand }}>&gt;</code> {path[tab]}
      </span>
      <span>data: prepped offline · sources: original golf dataset + ASA PGA Tour</span>
    </div>
  );
}

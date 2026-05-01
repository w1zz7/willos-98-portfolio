"use client";

/**
 * PGA Tour 2015-2022 tab: deep statistical analysis across 6 sub-views.
 *
 *   Season         - leaderboard of top 30 by avg SG-Total per season
 *   All-Time       - career leaderboard across all 8 seasons
 *   Courses        - top venues by tournament-rounds + avg SG-Total
 *   Archetypes     - k-means clusters of player SG signatures (NEW)
 *   Correlations   - Pearson matrix: SG components × performance (NEW)
 *   Trends         - year-over-year improvement leaders + decline (NEW)
 *
 * Player drill-down (right rail) shows full SG component breakdown.
 *
 * 36,864 raw PGA rows → ~175KB JSONs (pga_tour + pga_analysis).
 */

import { useMemo, useState } from "react";
import pga from "@/data/golfdata/pga_tour.json";
import pgaAnalysis from "@/data/golfdata/pga_analysis.json";
import pgaMajors from "@/data/golfdata/pga_majors.json";
import pgaPlayerCourse from "@/data/golfdata/pga_player_course.json";

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

interface SeasonPlayer {
  player: string;
  events: number;
  cutPct: number;
  avgSgTotal: number | null;
  avgSgPutt?: number | null;
  avgSgArg?: number | null;
  avgSgApp?: number | null;
  avgSgOtt?: number | null;
  bestFinish: number | null;
  wins: number;
  top10: number;
  rounds: number;
}

// playerTrends entries omit `player` (it's the key) and don't carry
// bestFinish/rounds for the per-season trend rows.
interface TrendEntry {
  season: number;
  events: number;
  cutPct: number;
  wins: number;
  top10: number;
  avgSgTotal: number | null;
  avgSgPutt: number | null;
  avgSgArg: number | null;
  avgSgApp: number | null;
  avgSgOtt: number | null;
}

interface AllTimePlayer {
  player: string;
  events: number;
  cutPct: number;
  wins: number;
  top10: number;
  avgSgTotal: number;
  seasons: number[];
}

type View = "season" | "alltime" | "courses" | "archetypes" | "correlations" | "trends" | "majors" | "playerCourse";

interface MajorPlayer {
  player: string;
  majorEvents: number;
  majorCuts: number;
  majorWins: number;
  majorTop10: number;
  majorAvgSg: number;
  regularEvents: number;
  regularCuts: number;
  regularWins: number;
  regularAvgSg: number;
  majorEdge: number;
}

interface PlayerCoursePlayer {
  player: string;
  careerSg: number;
  cells: { course: string; n: number; avgSg: number | null }[];
}

interface ArchetypePlayer {
  player: string;
  cluster: number;
  archetype: string;
  events: number;
  wins: number;
  top10: number;
  putt: number;
  arg: number;
  app: number;
  ott: number;
  total: number;
}

interface ArchetypeCluster {
  cluster: number;
  archetype: string;
  centroid: { putt: number; arg: number; app: number; ott: number };
  members: string[];
}

interface CorrelationRow {
  component: string;
  total: number;
  wins: number;
  top10: number;
  events: number;
}

interface ImprovementRow {
  player: string;
  worstSeason: number;
  worstSg: number;
  bestSeason: number;
  bestSg: number;
  delta: number;
  direction: "up" | "down";
}

const CLUSTER_COLORS = ["#5dd39e", "#33BBFF", "#f0a020", "#e063b8"];

export default function PgaTourTab({ colors, fontMono, fontUi }: Props) {
  const [view, setView] = useState<View>("season");
  const [season, setSeason] = useState<number>(2022);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const seasonRanked = useMemo(
    () => (pga.bySeason as Record<string, SeasonPlayer[]>)[String(season)] ?? [],
    [season]
  );
  const allTimeRanked = pga.topAllTime as AllTimePlayer[];
  const courses = pga.topCourses as { course: string; events: number; uniquePlayers: number; avgSgTotal: number }[];

  const playerTrend = useMemo<TrendEntry[]>(
    () =>
      selectedPlayer
        ? (pga.playerTrends as unknown as Record<string, TrendEntry[]>)[selectedPlayer] ?? []
        : [],
    [selectedPlayer]
  );

  return (
    <div
      className="h-full grid"
      style={{ gridTemplateColumns: selectedPlayer ? "1fr 360px" : "1fr", fontFamily: fontUi }}
    >
      <div className="flex flex-col h-full min-h-0">
        <div
          className="px-[14px] py-[10px] flex items-center gap-[10px] shrink-0"
          style={{ background: colors.panel, borderBottom: "1px solid " + colors.border }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
            ASA PGA Tour Tournament Data
          </span>
          <span style={{ fontSize: 10, color: colors.textFaint, fontFamily: fontMono }}>
            36,864 rows · 8 seasons · 2015–2022
          </span>
          <div className="ml-auto flex gap-[4px] flex-wrap">
            {(
              [
                ["season", "By Season"],
                ["alltime", "All-Time"],
                ["courses", "Courses"],
                ["archetypes", "Archetypes"],
                ["correlations", "Correlations"],
                ["trends", "Trends"],
                ["majors", "Majors"],
                ["playerCourse", "Player × Course"],
              ] as [View, string][]
            ).map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  setSelectedPlayer(null);
                }}
                className="px-[10px] py-[3px]"
                style={{
                  background: view === v ? colors.brandSoft : colors.panelDeep,
                  border: "1px solid " + (view === v ? colors.brand : colors.borderSoft),
                  color: view === v ? colors.text : colors.textDim,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontFamily: fontUi,
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {view === "season" && (
          <>
            <div
              className="px-[14px] py-[8px] flex items-center gap-[6px] flex-wrap shrink-0"
              style={{ background: colors.panelAlt, borderBottom: "1px solid " + colors.borderSoft }}
            >
              <span style={{ fontSize: 10, color: colors.textFaint, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Season
              </span>
              {pga.seasons.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSeason(s);
                    setSelectedPlayer(null);
                  }}
                  className="px-[10px] py-[3px]"
                  style={{
                    background: season === s ? colors.brandSoft : "transparent",
                    border: "1px solid " + (season === s ? colors.brand : colors.borderSoft),
                    color: season === s ? colors.text : colors.textDim,
                    fontSize: 11,
                    fontFamily: fontMono,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <SeasonTable
                rows={seasonRanked}
                colors={colors}
                fontMono={fontMono}
                onPick={setSelectedPlayer}
                selected={selectedPlayer}
              />
            </div>
          </>
        )}

        {view === "alltime" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AllTimeTable
              rows={allTimeRanked}
              colors={colors}
              fontMono={fontMono}
              onPick={setSelectedPlayer}
              selected={selectedPlayer}
            />
          </div>
        )}

        {view === "courses" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CoursesTable rows={courses} colors={colors} fontMono={fontMono} />
          </div>
        )}

        {view === "archetypes" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ArchetypesView
              clusters={pgaAnalysis.archetypes as ArchetypeCluster[]}
              players={pgaAnalysis.players as ArchetypePlayer[]}
              colors={colors}
              fontMono={fontMono}
              fontUi={fontUi}
              onPick={setSelectedPlayer}
              selected={selectedPlayer}
            />
          </div>
        )}

        {view === "correlations" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CorrelationsView
              rows={pgaAnalysis.correlation as CorrelationRow[]}
              colors={colors}
              fontMono={fontMono}
              fontUi={fontUi}
            />
          </div>
        )}

        {view === "trends" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TrendsView
              risers={pgaAnalysis.topRisers as ImprovementRow[]}
              fallers={pgaAnalysis.topFallers as ImprovementRow[]}
              colors={colors}
              fontMono={fontMono}
              fontUi={fontUi}
              onPick={setSelectedPlayer}
              selected={selectedPlayer}
            />
          </div>
        )}

        {view === "majors" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MajorsView
              bigGame={pgaMajors.bigGame as MajorPlayer[]}
              chokers={pgaMajors.chokers as MajorPlayer[]}
              colors={colors}
              fontMono={fontMono}
              fontUi={fontUi}
              onPick={setSelectedPlayer}
              selected={selectedPlayer}
            />
          </div>
        )}

        {view === "playerCourse" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PlayerCourseView
              players={pgaPlayerCourse.players as PlayerCoursePlayer[]}
              courses={(pgaPlayerCourse.courses as { course: string; events: number }[])}
              colors={colors}
              fontMono={fontMono}
              fontUi={fontUi}
              onPick={setSelectedPlayer}
              selected={selectedPlayer}
            />
          </div>
        )}
      </div>

      {selectedPlayer && (
        <PlayerDrilldown
          player={selectedPlayer}
          trend={playerTrend}
          colors={colors}
          fontMono={fontMono}
          fontUi={fontUi}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}

function SeasonTable({
  rows,
  colors,
  fontMono,
  onPick,
  selected,
}: {
  rows: SeasonPlayer[];
  colors: Colors;
  fontMono: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontMono }}>
      <thead style={{ position: "sticky", top: 0, background: colors.panelAlt }}>
        <tr style={{ borderBottom: "1px solid " + colors.border }}>
          <Th colors={colors}>#</Th>
          <Th colors={colors} align="left">Player</Th>
          <Th colors={colors}>Events</Th>
          <Th colors={colors}>Cuts</Th>
          <Th colors={colors}>Wins</Th>
          <Th colors={colors}>Top 10</Th>
          <Th colors={colors}>SG-Total</Th>
          <Th colors={colors}>SG-Putt</Th>
          <Th colors={colors}>SG-App</Th>
          <Th colors={colors}>SG-Ott</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const active = selected === p.player;
          return (
            <tr
              key={p.player}
              onClick={() => onPick(p.player)}
              style={{
                cursor: "pointer",
                background: active ? colors.brandSoft : i % 2 === 0 ? colors.panel : colors.panelAlt,
                borderLeft: active ? "2px solid " + colors.brand : "2px solid transparent",
              }}
            >
              <Td colors={colors}>{i + 1}</Td>
              <Td colors={colors} align="left" style={{ color: active ? colors.brand : colors.text, fontWeight: 600 }}>
                {p.player}
              </Td>
              <Td colors={colors}>{p.events}</Td>
              <Td colors={colors}>{(p.cutPct * 100).toFixed(0)}%</Td>
              <Td colors={colors}>{p.wins}</Td>
              <Td colors={colors}>{p.top10}</Td>
              <Td
                colors={colors}
                style={{ color: (p.avgSgTotal ?? 0) > 0 ? colors.brand : "#f0686a", fontWeight: 600 }}
              >
                {fmtSg(p.avgSgTotal)}
              </Td>
              <Td colors={colors}>{fmtSg(p.avgSgPutt ?? null)}</Td>
              <Td colors={colors}>{fmtSg(p.avgSgApp ?? null)}</Td>
              <Td colors={colors}>{fmtSg(p.avgSgOtt ?? null)}</Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AllTimeTable({
  rows,
  colors,
  fontMono,
  onPick,
  selected,
}: {
  rows: AllTimePlayer[];
  colors: Colors;
  fontMono: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontMono }}>
      <thead style={{ position: "sticky", top: 0, background: colors.panelAlt }}>
        <tr style={{ borderBottom: "1px solid " + colors.border }}>
          <Th colors={colors}>#</Th>
          <Th colors={colors} align="left">Player</Th>
          <Th colors={colors}>Events</Th>
          <Th colors={colors}>Cut %</Th>
          <Th colors={colors}>Wins</Th>
          <Th colors={colors}>Top 10</Th>
          <Th colors={colors}>Avg SG-Total</Th>
          <Th colors={colors} align="left">Seasons active</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const active = selected === p.player;
          return (
            <tr
              key={p.player}
              onClick={() => onPick(p.player)}
              style={{
                cursor: "pointer",
                background: active ? colors.brandSoft : i % 2 === 0 ? colors.panel : colors.panelAlt,
                borderLeft: active ? "2px solid " + colors.brand : "2px solid transparent",
              }}
            >
              <Td colors={colors}>{i + 1}</Td>
              <Td colors={colors} align="left" style={{ color: active ? colors.brand : colors.text, fontWeight: 600 }}>
                {p.player}
              </Td>
              <Td colors={colors}>{p.events}</Td>
              <Td colors={colors}>{(p.cutPct * 100).toFixed(0)}%</Td>
              <Td colors={colors}>{p.wins}</Td>
              <Td colors={colors}>{p.top10}</Td>
              <Td
                colors={colors}
                style={{ color: p.avgSgTotal > 0 ? colors.brand : "#f0686a", fontWeight: 600 }}
              >
                {fmtSg(p.avgSgTotal)}
              </Td>
              <Td colors={colors} align="left">
                <span style={{ color: colors.textDim, fontSize: 10 }}>
                  {p.seasons[0]}–{p.seasons[p.seasons.length - 1]} ({p.seasons.length})
                </span>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CoursesTable({
  rows,
  colors,
  fontMono,
}: {
  rows: { course: string; events: number; uniquePlayers: number; avgSgTotal: number }[];
  colors: Colors;
  fontMono: string;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontMono }}>
      <thead style={{ position: "sticky", top: 0, background: colors.panelAlt }}>
        <tr style={{ borderBottom: "1px solid " + colors.border }}>
          <Th colors={colors}>#</Th>
          <Th colors={colors} align="left">Course</Th>
          <Th colors={colors}>Tournament-rounds</Th>
          <Th colors={colors}>Unique players</Th>
          <Th colors={colors}>Avg SG-Total</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c, i) => (
          <tr
            key={c.course}
            style={{ background: i % 2 === 0 ? colors.panel : colors.panelAlt }}
          >
            <Td colors={colors}>{i + 1}</Td>
            <Td colors={colors} align="left" style={{ color: colors.text }}>
              {c.course}
            </Td>
            <Td colors={colors}>{c.events.toLocaleString()}</Td>
            <Td colors={colors}>{c.uniquePlayers}</Td>
            <Td
              colors={colors}
              style={{ color: c.avgSgTotal > 0 ? colors.brand : "#f0686a" }}
            >
              {c.avgSgTotal.toFixed(2)}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayerDrilldown({
  player,
  trend,
  colors,
  fontMono,
  fontUi,
  onClose,
}: {
  player: string;
  trend: TrendEntry[];
  colors: Colors;
  fontMono: string;
  fontUi: string;
  onClose: () => void;
}) {
  const totalEvents = trend.reduce((a, t) => a + t.events, 0);
  const totalWins = trend.reduce((a, t) => a + t.wins, 0);
  const totalTop10 = trend.reduce((a, t) => a + t.top10, 0);
  const valid = trend.filter((t) => t.avgSgTotal != null);
  const career =
    valid.length > 0
      ? valid.reduce((a, t) => a + (t.avgSgTotal ?? 0), 0) / valid.length
      : 0;

  // Find max abs of all SG components for chart scaling
  const allSg = trend.flatMap((t) => [
    t.avgSgPutt ?? 0,
    t.avgSgArg ?? 0,
    t.avgSgApp ?? 0,
    t.avgSgOtt ?? 0,
  ]);
  const maxAbsSg = Math.max(...allSg.map((s) => Math.abs(s)), 0.5);

  return (
    <div
      className="overflow-y-auto"
      style={{
        background: colors.panel,
        borderLeft: "1px solid " + colors.border,
        fontFamily: fontUi,
      }}
    >
      <div
        className="px-[14px] py-[12px] flex items-start justify-between"
        style={{ borderBottom: "1px solid " + colors.border }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{player}</div>
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>
            {trend.length} season{trend.length === 1 ? "" : "s"} · {totalEvents} events ·{" "}
            {totalWins} wins · {totalTop10} top 10s
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drill-down"
          style={{
            color: colors.textDim,
            fontSize: 16,
            padding: "0 6px",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <div
        className="grid grid-cols-2 gap-[1px] m-[14px]"
        style={{ background: colors.border }}
      >
        <DrillStat label="Career SG-Total" value={fmtSg(career)} colors={colors} fontMono={fontMono} />
        <DrillStat
          label="Best SG year"
          value={
            valid.length > 0
              ? fmtSg(Math.max(...valid.map((t) => t.avgSgTotal ?? -99)))
              : "-"
          }
          colors={colors}
          fontMono={fontMono}
        />
        <DrillStat
          label="Cut % avg"
          value={
            trend.length > 0
              ? `${((trend.reduce((a, t) => a + t.cutPct * t.events, 0) / Math.max(1, totalEvents)) * 100).toFixed(0)}%`
              : "-"
          }
          colors={colors}
          fontMono={fontMono}
        />
        <DrillStat label="Total events" value={String(totalEvents)} colors={colors} fontMono={fontMono} />
      </div>

      <div className="px-[14px] mt-[8px]">
        <div
          style={{
            fontSize: 10,
            color: colors.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            marginBottom: 8,
          }}
        >
          Year-over-year SG breakdown
        </div>
        <p style={{ fontSize: 10, color: colors.textFaint, marginBottom: 10, lineHeight: 1.4 }}>
          Strokes gained vs the field. Positive (green) = better than field avg, negative (red) = worse. Components: Putt, Arg (around-green), App (approach), Ott (off-the-tee).
        </p>
      </div>

      <div className="px-[14px] pb-[16px]">
        {trend.map((t) => (
          <div
            key={t.season}
            className="mb-[10px] px-[10px] py-[8px]"
            style={{ background: colors.panelDeep, border: "1px solid " + colors.borderSoft }}
          >
            <div className="flex items-baseline justify-between mb-[6px]">
              <span style={{ fontFamily: fontMono, fontSize: 13, color: colors.text }}>{t.season}</span>
              <span style={{ fontSize: 10, color: colors.textDim }}>
                {t.events} ev · {t.wins} W · {t.top10} T10 · {(t.cutPct * 100).toFixed(0)}% cuts
              </span>
            </div>
            {[
              ["Putt", t.avgSgPutt],
              ["Arg", t.avgSgArg],
              ["App", t.avgSgApp],
              ["Ott", t.avgSgOtt],
            ].map(([lbl, v]) => (
              <SgRow
                key={lbl as string}
                label={lbl as string}
                value={(v as number) ?? null}
                maxAbs={maxAbsSg}
                colors={colors}
                fontMono={fontMono}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SgRow({
  label,
  value,
  maxAbs,
  colors,
  fontMono,
}: {
  label: string;
  value: number | null;
  maxAbs: number;
  colors: Colors;
  fontMono: string;
}) {
  if (value == null)
    return (
      <div style={{ fontSize: 10, color: colors.textFaint, marginBottom: 2 }}>
        {label}: <span style={{ fontFamily: fontMono }}>-</span>
      </div>
    );
  const pct = Math.min(100, (Math.abs(value) / maxAbs) * 100);
  const positive = value >= 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr 50px",
        alignItems: "center",
        gap: 6,
        marginBottom: 2,
      }}
    >
      <span style={{ fontSize: 10, color: colors.textDim }}>{label}</span>
      <div
        style={{
          height: 8,
          background: colors.panel,
          position: "relative",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${pct / 2}%`,
            height: "100%",
            background: positive ? colors.brand : "#f0686a",
            marginLeft: positive ? "50%" : `${50 - pct / 2}%`,
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
          fontFamily: fontMono,
          fontSize: 10,
          color: positive ? colors.brand : "#f0686a",
          textAlign: "right",
        }}
      >
        {positive ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function DrillStat({
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
    <div className="px-[10px] py-[8px]" style={{ background: colors.panelDeep }}>
      <div
        style={{
          fontSize: 9,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 14, color: colors.text, fontFamily: fontMono, marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  colors,
  align = "right",
}: {
  children: React.ReactNode;
  colors: Colors;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "6px 8px",
        fontSize: 10,
        color: colors.textFaint,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  colors,
  align = "right",
  style,
}: {
  children: React.ReactNode;
  colors: Colors;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "6px 8px",
        fontSize: 11,
        color: colors.textDim,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function fmtSg(v: number | null | undefined): string {
  if (v == null) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

// ============================================================
// Archetypes view - k-means clusters of player SG signatures
// ============================================================

function ArchetypesView({
  clusters,
  players,
  colors,
  fontMono,
  fontUi,
  onPick,
  selected,
}: {
  clusters: ArchetypeCluster[];
  players: ArchetypePlayer[];
  colors: Colors;
  fontMono: string;
  fontUi: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  return (
    <div className="p-[16px]" style={{ fontFamily: fontUi }}>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Player archetypes - k-means clustering
      </h3>
      <p style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginBottom: 14, maxWidth: 720 }}>
        The top 60 PGA pros by career SG-Total are clustered on their z-scored 4D
        signature <em>(SG-Putt, SG-Around-Green, SG-Approach, SG-Off-the-Tee)</em>.
        K-means with k=4, deterministic seed, 100 iterations max. Each cluster is
        named by its centroid&apos;s strongest dimension. The 3D Visuals tab
        renders these clusters in the SG cube - each octahedron gem is a
        centroid.
      </p>

      <div className="grid grid-cols-2 gap-[10px] mb-[14px]">
        {clusters.map((c, i) => (
          <ClusterCard
            key={c.cluster}
            cluster={c}
            color={CLUSTER_COLORS[i % CLUSTER_COLORS.length]}
            colors={colors}
            fontMono={fontMono}
            players={players.filter((p) => p.cluster === c.cluster)}
            onPick={onPick}
          />
        ))}
      </div>

      <h4
        style={{
          fontSize: 11,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          marginTop: 18,
          marginBottom: 8,
        }}
      >
        Full member roster
      </h4>

      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontMono }}>
        <thead style={{ position: "sticky", top: 0, background: colors.panelAlt, zIndex: 1 }}>
          <tr style={{ borderBottom: "1px solid " + colors.border }}>
            <Th colors={colors} align="left">Cluster</Th>
            <Th colors={colors} align="left">Player</Th>
            <Th colors={colors}>Events</Th>
            <Th colors={colors}>Wins</Th>
            <Th colors={colors}>SG-Putt</Th>
            <Th colors={colors}>SG-Arg</Th>
            <Th colors={colors}>SG-App</Th>
            <Th colors={colors}>SG-Ott</Th>
            <Th colors={colors}>Total</Th>
          </tr>
        </thead>
        <tbody>
          {[...players]
            .sort((a, b) => a.cluster - b.cluster || b.total - a.total)
            .map((p, i) => {
              const active = selected === p.player;
              const color = CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length];
              return (
                <tr
                  key={p.player}
                  onClick={() => onPick(p.player)}
                  style={{
                    cursor: "pointer",
                    background: active
                      ? colors.brandSoft
                      : i % 2 === 0
                      ? colors.panel
                      : colors.panelAlt,
                    borderLeft: active ? "2px solid " + colors.brand : "2px solid transparent",
                  }}
                >
                  <Td colors={colors} align="left">
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: color,
                        marginRight: 6,
                        verticalAlign: "middle",
                      }}
                    />
                    <span style={{ color: color, fontSize: 10, letterSpacing: "0.04em" }}>
                      {p.archetype}
                    </span>
                  </Td>
                  <Td colors={colors} align="left" style={{ color: colors.text, fontWeight: 600 }}>
                    {p.player}
                  </Td>
                  <Td colors={colors}>{p.events}</Td>
                  <Td colors={colors}>{p.wins}</Td>
                  <Td colors={colors}>{fmtSg(p.putt)}</Td>
                  <Td colors={colors}>{fmtSg(p.arg)}</Td>
                  <Td colors={colors}>{fmtSg(p.app)}</Td>
                  <Td colors={colors}>{fmtSg(p.ott)}</Td>
                  <Td
                    colors={colors}
                    style={{ color: p.total > 0 ? colors.brand : "#f0686a", fontWeight: 600 }}
                  >
                    {fmtSg(p.total)}
                  </Td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function ClusterCard({
  cluster,
  color,
  colors,
  fontMono,
  players,
  onPick,
}: {
  cluster: ArchetypeCluster;
  color: string;
  colors: Colors;
  fontMono: string;
  players: ArchetypePlayer[];
  onPick: (p: string) => void;
}) {
  const topMembers = [...players].sort((a, b) => b.total - a.total).slice(0, 5);
  return (
    <div
      style={{
        background: colors.panelDeep,
        border: "1px solid " + colors.borderSoft,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            width: 12,
            height: 12,
            background: color,
            borderRadius: 2,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
        <span style={{ fontSize: 14, color: colors.text, fontWeight: 600 }}>
          {cluster.archetype}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: colors.textFaint,
            fontFamily: fontMono,
          }}
        >
          n={players.length}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
        <CentroidCell label="Putt" value={cluster.centroid.putt} colors={colors} fontMono={fontMono} />
        <CentroidCell label="Arg" value={cluster.centroid.arg} colors={colors} fontMono={fontMono} />
        <CentroidCell label="App" value={cluster.centroid.app} colors={colors} fontMono={fontMono} />
        <CentroidCell label="Ott" value={cluster.centroid.ott} colors={colors} fontMono={fontMono} />
      </div>

      <div
        style={{
          fontSize: 10,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          marginBottom: 4,
        }}
      >
        Top members
      </div>
      <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5 }}>
        {topMembers.map((p) => (
          <button
            key={p.player}
            type="button"
            onClick={() => onPick(p.player)}
            style={{
              background: "transparent",
              border: 0,
              color: colors.text,
              padding: 0,
              cursor: "pointer",
              marginRight: 8,
              fontSize: 11,
              borderBottom: "1px dotted " + color,
            }}
          >
            {p.player}
          </button>
        ))}
      </div>
    </div>
  );
}

function CentroidCell({
  label,
  value,
  colors,
  fontMono,
}: {
  label: string;
  value: number;
  colors: Colors;
  fontMono: string;
}) {
  const positive = value >= 0;
  return (
    <div
      style={{
        background: colors.panel,
        padding: "5px 6px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: colors.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: positive ? "#5dd39e" : "#f0686a",
          fontFamily: fontMono,
          marginTop: 1,
        }}
      >
        {positive ? "+" : ""}
        {value.toFixed(2)}σ
      </div>
    </div>
  );
}

// ============================================================
// Correlations view - Pearson matrix
// ============================================================

function CorrelationsView({
  rows,
  colors,
  fontMono,
  fontUi,
}: {
  rows: CorrelationRow[];
  colors: Colors;
  fontMono: string;
  fontUi: string;
}) {
  const targets: { key: keyof CorrelationRow; label: string }[] = [
    { key: "total", label: "SG-Total" },
    { key: "wins", label: "Career Wins" },
    { key: "top10", label: "Top 10s" },
    { key: "events", label: "Total Events" },
  ];

  const componentLabels: Record<string, string> = {
    putt: "SG-Putt",
    arg: "SG-Around-Green",
    app: "SG-Approach",
    ott: "SG-Off-the-Tee",
  };

  function corrColor(r: number) {
    // -1..1 → red..white..green
    const a = Math.min(1, Math.abs(r));
    if (r >= 0) {
      const g = Math.round(0x33 + (0xd3 - 0x33) * a);
      return `rgba(93,${g},158,${0.25 + a * 0.55})`;
    }
    const g = Math.round(0x68 + (0xa0 - 0x68) * a);
    return `rgba(240,${g},106,${0.25 + a * 0.55})`;
  }

  return (
    <div className="p-[16px]" style={{ fontFamily: fontUi }}>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        SG component correlations - Pearson r
      </h3>
      <p style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginBottom: 16, maxWidth: 720 }}>
        How strongly does each strokes-gained component correlate with overall career success?
        Computed across the same top-60 player pool used for clustering. Values close to +1 mean
        &quot;players strong here also tend to score well overall&quot;; values near 0 mean
        &quot;independent dimensions.&quot; Negative values would indicate trade-offs.
      </p>

      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, fontFamily: fontMono }}>
        <thead>
          <tr>
            <th
              style={{
                fontSize: 10,
                color: colors.textFaint,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontWeight: 600,
                textAlign: "left",
                padding: 6,
              }}
            >
              Component
            </th>
            {targets.map((t) => (
              <th
                key={t.key as string}
                style={{
                  fontSize: 10,
                  color: colors.textFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  fontWeight: 600,
                  textAlign: "center",
                  padding: 6,
                }}
              >
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.component}>
              <td
                style={{
                  fontSize: 12,
                  color: colors.text,
                  padding: 6,
                  fontWeight: 600,
                  fontFamily: fontUi,
                }}
              >
                {componentLabels[row.component] ?? row.component}
              </td>
              {targets.map((t) => {
                const r = row[t.key] as number;
                return (
                  <td
                    key={t.key as string}
                    style={{
                      background: corrColor(r),
                      color: colors.text,
                      textAlign: "center",
                      padding: "10px 6px",
                      fontSize: 14,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r >= 0 ? "+" : ""}
                    {r.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 18,
          padding: 12,
          background: colors.panelDeep,
          border: "1px solid " + colors.borderSoft,
          fontSize: 11,
          color: colors.textDim,
          lineHeight: 1.6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: colors.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            marginBottom: 8,
          }}
        >
          What this tells us
        </div>
        <p style={{ marginBottom: 8 }}>
          The strongest predictor of career SG-Total at the top tier is{" "}
          <span style={{ color: colors.text, fontWeight: 600 }}>SG-Off-the-Tee</span> at r ≈ 0.56,
          followed by <span style={{ color: colors.text, fontWeight: 600 }}>SG-Approach</span> at
          ≈ 0.42. Within an already-elite pool, putting and short-game baselines are similar
          across players - what separates the very best is how far and how accurately they hit
          it from the tee, then how clean their iron play is from there. Wins correlate with
          SG-Off-the-Tee at ≈ 0.41, the only single-component coefficient that crosses 0.4
          against career wins.
        </p>
        <p style={{ marginBottom: 8 }}>
          <span style={{ color: colors.text, fontWeight: 600 }}>SG-Putt</span> has the weakest
          correlation with wins (≈ 0.14) - putting is volatile and noisy, so within an elite-only
          pool it doesn&apos;t predict career wins cleanly. Conventional pro-tour wisdom:
          &quot;putt your way IN to a Tour card, ball-strike your way to wins.&quot; The data
          here supports that.
        </p>
        <p>
          The <span style={{ color: colors.text, fontWeight: 600 }}>Total Events</span> column
          captures volume / durability. SG-Approach correlates <em>negatively</em> with events
          (≈ −0.25) - a possible &quot;burns bright, plays fewer events&quot; pattern: top
          approach players make more cuts and play more weekends but may also be selective
          about their schedules. SG-Around-Green is the only component positively correlated
          with events, suggesting tour vets accumulate around-green skill over career.
        </p>
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 10,
          color: colors.textFaint,
          fontFamily: fontMono,
        }}
      >
        Method: Pearson correlation coefficient · n=60 players · top by career SG-Total · 8 seasons
        2015–2022. NaN where SG-component sample size = 0 (players with no rounds-with-SG-data).
      </div>
    </div>
  );
}

// ============================================================
// Trends view - improvement leaders
// ============================================================

function TrendsView({
  risers,
  fallers,
  colors,
  fontMono,
  fontUi,
  onPick,
  selected,
}: {
  risers: ImprovementRow[];
  fallers: ImprovementRow[];
  colors: Colors;
  fontMono: string;
  fontUi: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  return (
    <div className="p-[16px]" style={{ fontFamily: fontUi }}>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Year-over-year SG-Total movers
      </h3>
      <p style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginBottom: 16, maxWidth: 760 }}>
        For each player with at least 3 seasons of data, the largest gap between their best
        and worst season&apos;s avg SG-Total. <em>Risers</em> peak in a later season than they
        bottom; <em>Fallers</em> peak earlier - these are the players with the steepest
        career arcs in either direction across the 2015–2022 window.
      </p>

      <div className="grid grid-cols-2 gap-[14px]">
        <ImprovementCol
          title="Top Risers"
          subtitle="best season comes after worst"
          rows={risers}
          colors={colors}
          fontMono={fontMono}
          tone={colors.brand}
          onPick={onPick}
          selected={selected}
        />
        <ImprovementCol
          title="Steepest Fallers"
          subtitle="best season precedes worst"
          rows={fallers}
          colors={colors}
          fontMono={fontMono}
          tone="#f0686a"
          onPick={onPick}
          selected={selected}
        />
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 12,
          background: colors.panelDeep,
          border: "1px solid " + colors.borderSoft,
          fontSize: 11,
          color: colors.textDim,
          lineHeight: 1.6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: colors.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            marginBottom: 8,
          }}
        >
          How to read this
        </div>
        <p style={{ marginBottom: 8 }}>
          ΔSG = best season&apos;s avg SG-Total − worst season&apos;s avg. A delta of +2.0 means
          a swing of two strokes per round between the player&apos;s peak and trough years -
          that&apos;s a difference between &quot;competing for wins&quot; and &quot;fighting for
          a Tour card.&quot;
        </p>
        <p style={{ marginBottom: 8 }}>
          Risers tend to be young pros earning Tour status mid-window (think 2018-2020 graduates).
          Fallers cluster around veterans whose ball-striking declined while they kept teeing it up.
          Click any name to open their full year-by-year SG breakdown in the right rail.
        </p>
        <p style={{ fontSize: 10, color: colors.textFaint, fontFamily: fontMono }}>
          Filter: ≥3 seasons of valid SG-Total data per player. n = top 15 each direction.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Majors view - big-game / choke-artist split
// ============================================================

function MajorsView({
  bigGame,
  chokers,
  colors,
  fontMono,
  fontUi,
  onPick,
  selected,
}: {
  bigGame: MajorPlayer[];
  chokers: MajorPlayer[];
  colors: Colors;
  fontMono: string;
  fontUi: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  return (
    <div className="p-[16px]" style={{ fontFamily: fontUi }}>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Major championship splits
      </h3>
      <p style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginBottom: 16, maxWidth: 760 }}>
        For each player with at least 4 major appearances and 20 regular events, the difference
        between their average SG-Total in majors vs regular events. <em>Big-game players</em>{" "}
        outperform their baseline at majors; <em>choke artists</em> underperform. Note: small
        sample sizes (4-15 majors per player) make these signals noisy - interpret as suggestive,
        not definitive.
      </p>

      <div className="grid grid-cols-2 gap-[14px]">
        <MajorsCol
          title="Big-Game Players"
          subtitle="major SG > regular SG"
          rows={bigGame}
          colors={colors}
          fontMono={fontMono}
          tone={colors.brand}
          onPick={onPick}
          selected={selected}
        />
        <MajorsCol
          title="Choke Artists"
          subtitle="major SG < regular SG"
          rows={chokers}
          colors={colors}
          fontMono={fontMono}
          tone="#f0686a"
          onPick={onPick}
          selected={selected}
        />
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 12,
          background: colors.panelDeep,
          border: "1px solid " + colors.borderSoft,
          fontSize: 11,
          color: colors.textDim,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>
          What this tells us
        </div>
        <p style={{ marginBottom: 8 }}>
          Major edge = (avg SG-Total in majors) − (avg SG-Total in regular events). A +0.5 edge
          means a player gains an extra half-stroke per round at majors compared to their
          baseline - a meaningful boost for an event with deep, strong fields.
        </p>
        <p>
          Course conditions at majors (firmer greens, taller rough, narrower fairways) tend to
          punish wild ball-strikers and reward patient course management. Players with strong
          positive edges often share that profile; chokers tend to be putters whose flat-stick
          touch doesn&apos;t carry to bumpy major-Sunday greens.
        </p>
      </div>
    </div>
  );
}

function MajorsCol({
  title,
  subtitle,
  rows,
  colors,
  fontMono,
  tone,
  onPick,
  selected,
}: {
  title: string;
  subtitle: string;
  rows: MajorPlayer[];
  colors: Colors;
  fontMono: string;
  tone: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.majorEdge)), 0.5);
  return (
    <div>
      <div style={{ padding: "8px 12px", background: colors.panelDeep, borderTop: "2px solid " + tone, marginBottom: 6 }}>
        <div style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}>{subtitle}</div>
      </div>
      {rows.map((r, i) => {
        const active = selected === r.player;
        const pct = Math.min(100, (Math.abs(r.majorEdge) / maxAbs) * 100);
        return (
          <button
            key={r.player + i}
            type="button"
            onClick={() => onPick(r.player)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              background: active ? colors.brandSoft : i % 2 === 0 ? colors.panel : colors.panelAlt,
              borderLeft: active ? "2px solid " + colors.brand : "2px solid transparent",
              borderBottom: "1px solid " + colors.borderSoft,
              cursor: "pointer",
              display: "block",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: colors.text, fontWeight: 600 }}>
                {i + 1}. {r.player}
              </span>
              <span style={{ fontSize: 11, color: tone, fontFamily: fontMono, fontWeight: 600 }}>
                {r.majorEdge >= 0 ? "+" : ""}
                {r.majorEdge.toFixed(2)} edge
              </span>
            </div>
            <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fontMono, marginTop: 2 }}>
              Majors: {fmtSg(r.majorAvgSg)} ({r.majorEvents}ev, {r.majorWins}W) · Reg: {fmtSg(r.regularAvgSg)} ({r.regularEvents}ev)
            </div>
            <div style={{ marginTop: 4, height: 4, background: colors.panelDeep, position: "relative" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: tone }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Player × Course view - full heatmap of SG by venue
// ============================================================

function PlayerCourseView({
  players,
  courses,
  colors,
  fontMono,
  fontUi,
  onPick,
  selected,
}: {
  players: PlayerCoursePlayer[];
  courses: { course: string; events: number }[];
  colors: Colors;
  fontMono: string;
  fontUi: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  // Find max abs SG across the matrix for color scaling
  const allSgs = players.flatMap((p) =>
    p.cells.map((c) => c.avgSg).filter((v): v is number => v != null)
  );
  const maxAbs = Math.max(...allSgs.map((v) => Math.abs(v)), 1);

  function cellColor(sg: number | null, n: number): string {
    if (sg == null || n < 2) return colors.panel;
    const t = Math.min(1, Math.abs(sg) / maxAbs);
    if (sg >= 0) {
      return `rgba(93,211,158,${0.18 + t * 0.6})`;
    }
    return `rgba(240,104,106,${0.18 + t * 0.6})`;
  }

  return (
    <div className="p-[16px]" style={{ fontFamily: fontUi }}>
      <h3 style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>
        Player × Course matrix - avg SG-Total per venue
      </h3>
      <p style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginBottom: 12, maxWidth: 760 }}>
        Top 15 players by career SG (rows) × top 15 most-played venues (columns). Cells show the
        player&apos;s average SG-Total at that course. Green = course favorite; red = struggle;
        gray = sample size below 2 visits. Click any row to highlight that player.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 1, fontFamily: fontMono, fontSize: 10 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", textAlign: "left", color: colors.textFaint, fontFamily: fontUi, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Player
              </th>
              <th style={{ padding: "6px 6px", textAlign: "right", color: colors.textFaint, fontFamily: fontUi, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Career
              </th>
              {courses.map((c) => (
                <th
                  key={c.course}
                  style={{
                    padding: "4px 4px",
                    color: colors.textFaint,
                    fontFamily: fontUi,
                    fontSize: 9,
                    fontWeight: 600,
                    textAlign: "center",
                    minWidth: 50,
                    maxWidth: 80,
                    verticalAlign: "bottom",
                  }}
                  title={c.course}
                >
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", lineHeight: 1.2 }}>
                    {c.course.replace(/^(.*?) - .*/, "$1").slice(0, 18)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const active = selected === p.player;
              return (
                <tr
                  key={p.player}
                  onClick={() => onPick(p.player)}
                  style={{
                    cursor: "pointer",
                    background: active ? colors.brandSoft : i % 2 === 0 ? colors.panel : colors.panelAlt,
                    borderLeft: active ? "2px solid " + colors.brand : "2px solid transparent",
                  }}
                >
                  <td style={{ padding: "6px 8px", color: active ? colors.brand : colors.text, fontWeight: 600, fontFamily: fontUi, fontSize: 11, whiteSpace: "nowrap" }}>
                    {p.player}
                  </td>
                  <td style={{ padding: "6px 6px", color: p.careerSg > 0 ? colors.brand : "#f0686a", textAlign: "right", fontFamily: fontMono }}>
                    {fmtSg(p.careerSg)}
                  </td>
                  {p.cells.map((cell) => (
                    <td
                      key={cell.course}
                      style={{
                        background: cellColor(cell.avgSg, cell.n),
                        padding: "4px 4px",
                        textAlign: "center",
                        color: cell.avgSg == null || cell.n < 2 ? colors.textFaint : colors.text,
                        fontFamily: fontMono,
                        fontSize: 10,
                      }}
                      title={`${cell.course}: ${cell.avgSg != null ? fmtSg(cell.avgSg) : "-"} (n=${cell.n})`}
                    >
                      {cell.avgSg != null && cell.n >= 2 ? cell.avgSg.toFixed(2) : "-"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 12,
          background: colors.panelDeep,
          border: "1px solid " + colors.borderSoft,
          fontSize: 11,
          color: colors.textDim,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>
          How to read this
        </div>
        <p style={{ marginBottom: 8 }}>
          Each cell is one player&apos;s average strokes-gained across all rounds at that venue.
          A player with mostly green cells consistently outperforms the field; mixed rows show
          venue-dependent games.
        </p>
        <p>
          Look for vertical patterns too - courses where most rows are green or red reveal
          venues that disproportionately reward (or punish) the elite. Those are the courses
          where ranking matters most.
        </p>
      </div>
    </div>
  );
}

function ImprovementCol({
  title,
  subtitle,
  rows,
  colors,
  fontMono,
  tone,
  onPick,
  selected,
}: {
  title: string;
  subtitle: string;
  rows: ImprovementRow[];
  colors: Colors;
  fontMono: string;
  tone: string;
  onPick: (p: string) => void;
  selected: string | null;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.delta)));
  return (
    <div>
      <div
        style={{
          padding: "8px 12px",
          background: colors.panelDeep,
          borderTop: "2px solid " + tone,
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}>{subtitle}</div>
      </div>
      {rows.map((r, i) => {
        const active = selected === r.player;
        const pct = Math.min(100, (Math.abs(r.delta) / maxAbs) * 100);
        return (
          <button
            key={r.player + i}
            type="button"
            onClick={() => onPick(r.player)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              background: active ? colors.brandSoft : i % 2 === 0 ? colors.panel : colors.panelAlt,
              borderLeft: active ? "2px solid " + colors.brand : "2px solid transparent",
              borderBottom: "1px solid " + colors.borderSoft,
              cursor: "pointer",
              display: "block",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: colors.text, fontWeight: 600 }}>
                {i + 1}. {r.player}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: tone,
                  fontFamily: fontMono,
                  fontWeight: 600,
                }}
              >
                {r.direction === "up" ? "+" : "−"}
                {Math.abs(r.delta).toFixed(2)}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: colors.textDim,
                fontFamily: fontMono,
                marginTop: 2,
              }}
            >
              {r.worstSeason} ({fmtSg(r.worstSg)}) → {r.bestSeason} ({fmtSg(r.bestSg)})
            </div>
            <div
              style={{
                marginTop: 4,
                height: 4,
                background: colors.panelDeep,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: tone,
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

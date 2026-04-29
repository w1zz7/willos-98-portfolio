"use client";

/**
 * 3D Visuals tab — categorized sidebar nav, 8 scenes across 4 categories,
 * each with camera presets and a thesis-driven right-rail panel.
 *
 *   WEATHER          → Weather × Play
 *   PLAYER PROFILES  → SG-Cube · Archetypes · Career Arc (NEW)
 *   TOURNAMENTS      → Course Terrain (NEW) · Player × Course (NEW)
 *   MODELS & TIME    → PCA Biplot (NEW) · Cluster Timeline (NEW, animated)
 *
 * The retired scene (P(play) Surface) was visually weak because the LR
 * is outlook-dominated. PCA Biplot + Cluster Timeline replace it with
 * stronger ML interpretation visuals.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import scatter from "@/data/golfdata/scatter3d.json";
import pgaAnalysis from "@/data/golfdata/pga_analysis.json";
import pgaTour from "@/data/golfdata/pga_tour.json";
import pgaCoursesDeep from "@/data/golfdata/pga_courses_deep.json";
import pgaPlayerCourse from "@/data/golfdata/pga_player_course.json";
import pcaData from "@/data/golfdata/pca.json";
import clusterTimeline from "@/data/golfdata/pga_cluster_timeline.json";
import surfaceData from "@/data/golfdata/play_surface.json";
import edaData from "@/data/golfdata/eda.json";

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

interface WeatherPoint {
  d: string; t: number; h: number; c: number; p: number; o: string; s: string; hr: number;
}
interface PgaPlayer {
  player: string; cluster: number; archetype: string;
  events: number; wins: number; top10: number;
  putt: number; arg: number; app: number; ott: number; total: number;
}
interface ArchetypeCluster {
  cluster: number; archetype: string;
  centroid: { putt: number; arg: number; app: number; ott: number };
  members: string[];
}
interface SurfaceCell { t: number; h: number; p: number; }
interface SurfaceJson {
  defaultOutlook: string;
  meanByOutlook: Record<string, number>;
  surfacesByOutlook: Record<string, SurfaceCell[]>;
  evidence: {
    warmDry: { rate: number; n: number };
    coldHumid: { rate: number; n: number };
    tempBands: Record<string, { rate: number; n: number }>;
    lowHum: { rate: number; n: number };
    highHum: { rate: number; n: number };
    windy: { rate: number; n: number };
    calm: { rate: number; n: number };
  };
}
interface PcaProjection {
  player: string; pc1: number; pc2: number; pc3: number;
  putt: number; arg: number; app: number; ott: number;
  total: number; wins: number; events: number;
}
interface PcaLoading { feature: string; pc1: number; pc2: number; pc3: number; }
interface PcaJson {
  varExplained: number[];
  loadings: PcaLoading[];
  projections: PcaProjection[];
  featureLabels: string[];
}
interface CoursesDeepJson {
  courses: { course: string; events: number; avgSgTotal: number; variance: number; stdDev: number; top3Winners: { player: string; wins: number }[]; seasons: number[] }[];
  top25: { course: string; events: number; avgSgTotal: number; variance: number; stdDev: number; top3Winners: { player: string; wins: number }[]; seasons: number[] }[];
}
interface PlayerCourseJson {
  courses: { course: string; events: number }[];
  players: {
    player: string;
    careerSg: number;
    cells: { course: string; n: number; avgSg: number | null }[];
  }[];
}
interface ClusterTimelinePlayer {
  player: string; season: number; cluster: number;
  events: number; wins: number;
  putt: number; arg: number; app: number; ott: number; total: number;
}
interface ClusterTimelineCentroid { putt: number; arg: number; app: number; ott: number; }
interface ClusterTimelineJson {
  seasons: number[];
  byYear: Record<string, { players: ClusterTimelinePlayer[]; centroids: ClusterTimelineCentroid[] }>;
}
interface PlayerTrendEntry {
  season: number; events: number; cutPct: number; wins: number; top10: number;
  avgSgTotal: number | null; avgSgPutt: number | null; avgSgArg: number | null;
  avgSgApp: number | null; avgSgOtt: number | null;
}
interface PgaTourJson {
  playerTrends: Record<string, PlayerTrendEntry[]>;
  topAllTime: { player: string; events: number; avgSgTotal: number; wins: number; top10: number; seasons: number[] }[];
}

type SceneId =
  | "weather"
  | "sg-cube"
  | "archetypes"
  | "career-arc"
  | "course-terrain"
  | "player-course"
  | "pca"
  | "cluster-timeline";

interface SceneDef {
  id: SceneId;
  label: string;
  category: "WEATHER" | "PLAYER PROFILES" | "TOURNAMENTS" | "MODELS & TIME";
}

const SCENES: SceneDef[] = [
  { id: "weather", label: "Weather × Play", category: "WEATHER" },
  { id: "sg-cube", label: "SG-Cube", category: "PLAYER PROFILES" },
  { id: "archetypes", label: "Archetypes", category: "PLAYER PROFILES" },
  { id: "career-arc", label: "Career Arc", category: "PLAYER PROFILES" },
  { id: "course-terrain", label: "Course Terrain", category: "TOURNAMENTS" },
  { id: "player-course", label: "Player × Course", category: "TOURNAMENTS" },
  { id: "pca", label: "PCA Biplot", category: "MODELS & TIME" },
  { id: "cluster-timeline", label: "Cluster Timeline", category: "MODELS & TIME" },
];

const CLUSTER_COLORS = ["#5dd39e", "#33BBFF", "#f0a020", "#e063b8"];
const RED = "#f0686a";
const GREEN = "#5dd39e";

interface CameraPreset {
  label: string;
  pos: [number, number, number];
}

const CAMERA_DEFAULTS: Record<SceneId, [number, number, number]> = {
  "weather": [3.2, 2.4, 4.0],
  "sg-cube": [3.6, 3.0, 3.2],
  "archetypes": [3.6, 2.8, 3.6],
  "career-arc": [4.5, 1.6, 0.5],
  "course-terrain": [4.0, 4.0, 4.0],
  "player-course": [3.8, 3.6, 3.8],
  "pca": [0, 1.2, 4.5],
  "cluster-timeline": [3.6, 3.0, 3.2],
};

const CAMERA_PRESETS: Record<SceneId, CameraPreset[]> = {
  "weather": [
    { label: "Default", pos: [3.2, 2.4, 4.0] },
    { label: "Top-down", pos: [0, 5, 0.1] },
    { label: "Side", pos: [5, 0.5, 0.1] },
  ],
  "sg-cube": [
    { label: "Default", pos: [3.6, 3.0, 3.2] },
    { label: "Elite octant", pos: [4.0, 1.5, 4.0] },
    { label: "Top-down", pos: [0.1, 5, 0.1] },
  ],
  "archetypes": [
    { label: "Default", pos: [3.6, 2.8, 3.6] },
    { label: "Top-down", pos: [0, 5, 0.1] },
    { label: "Front", pos: [0, 0.5, 5] },
  ],
  "career-arc": [
    { label: "Front (timeline)", pos: [4.5, 1.6, 0.5] },
    { label: "Side (SG profile)", pos: [0.5, 1.6, 4.5] },
    { label: "Top-down (path)", pos: [0.1, 5, 0.5] },
  ],
  "course-terrain": [
    { label: "Default", pos: [4.0, 4.0, 4.0] },
    { label: "Bird's-eye", pos: [0.1, 6, 0.1] },
    { label: "Side", pos: [6, 0.5, 0.1] },
  ],
  "player-course": [
    { label: "Default", pos: [3.8, 3.6, 3.8] },
    { label: "Top-down", pos: [0.1, 6, 0.1] },
  ],
  "pca": [
    { label: "Standard biplot", pos: [0, 1.2, 4.5] },
    { label: "Tilted (3D)", pos: [3.0, 2.0, 3.0] },
  ],
  "cluster-timeline": [
    { label: "Default", pos: [3.6, 3.0, 3.2] },
    { label: "Top-down", pos: [0.1, 5, 0.1] },
  ],
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================

export default function ThreeDTab({ colors, fontMono, fontUi }: Props) {
  const [scene, setScene] = useState<SceneId>("weather");
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>(
    CAMERA_DEFAULTS["weather"]
  );

  // Reset camera on scene change
  useEffect(() => {
    setCameraTarget(CAMERA_DEFAULTS[scene]);
  }, [scene]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "190px 1fr 290px",
        gap: 0,
        background: colors.bg,
        height: "100%",
        minHeight: 0,
        fontFamily: fontUi,
      }}
    >
      <Sidebar scene={scene} setScene={setScene} colors={colors} fontUi={fontUi} fontMono={fontMono} />

      <div
        style={{
          position: "relative",
          background: "#06160d",
          borderRight: "1px solid " + colors.border,
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Canvas
          camera={{ position: CAMERA_DEFAULTS[scene], fov: 45 }}
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #06160d 0%, #0a1f12 100%)",
          }}
          key={scene}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 5, 5]} intensity={0.7} />
          <directionalLight position={[-5, -3, -5]} intensity={0.3} color={colors.accent} />
          <CameraLerp target={cameraTarget} />

          <Suspense fallback={null}>
            {scene === "weather" && <WeatherScene colors={colors} />}
            {scene === "sg-cube" && <SgCubeScene colors={colors} />}
            {scene === "archetypes" && <ArchetypesScene colors={colors} />}
            {scene === "career-arc" && <CareerArcScene colors={colors} />}
            {scene === "course-terrain" && <CourseTerrainScene colors={colors} />}
            {scene === "player-course" && <PlayerCourseScene colors={colors} />}
            {scene === "pca" && <PcaScene colors={colors} />}
            {scene === "cluster-timeline" && <ClusterTimelineScene colors={colors} />}
          </Suspense>

          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            minDistance={1.5}
            maxDistance={20}
            enablePan
            makeDefault
          />
        </Canvas>

        <CameraPresetBar
          presets={CAMERA_PRESETS[scene]}
          onPick={(p) => setCameraTarget(p)}
          colors={colors}
          fontUi={fontUi}
        />

        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 12,
            color: colors.textFaint,
            fontFamily: fontMono,
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          drag · orbit  ·  scroll · zoom  ·  shift+drag · pan
        </div>
      </div>

      <div
        className="overflow-y-auto"
        style={{ background: colors.panel, fontFamily: fontUi, padding: 14 }}
      >
        {scene === "weather" && <WeatherInfo colors={colors} />}
        {scene === "sg-cube" && <SgCubeInfo colors={colors} />}
        {scene === "archetypes" && <ArchetypesInfo colors={colors} />}
        {scene === "career-arc" && <CareerArcInfo colors={colors} fontMono={fontMono} />}
        {scene === "course-terrain" && <CourseTerrainInfo colors={colors} fontMono={fontMono} />}
        {scene === "player-course" && <PlayerCourseInfo colors={colors} fontMono={fontMono} />}
        {scene === "pca" && <PcaInfo colors={colors} />}
        {scene === "cluster-timeline" && <ClusterTimelineInfo colors={colors} fontMono={fontMono} />}
      </div>
    </div>
  );
}

// =====================================================================
// Sidebar nav (categorized)
// =====================================================================

function Sidebar({
  scene,
  setScene,
  colors,
  fontUi,
  fontMono,
}: {
  scene: SceneId;
  setScene: (s: SceneId) => void;
  colors: Colors;
  fontUi: string;
  fontMono: string;
}) {
  void fontMono;
  const categories = ["WEATHER", "PLAYER PROFILES", "TOURNAMENTS", "MODELS & TIME"] as const;
  return (
    <div
      style={{
        background: colors.panelAlt,
        borderRight: "1px solid " + colors.border,
        overflowY: "auto",
        padding: "10px 0",
        fontFamily: fontUi,
      }}
    >
      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div
            style={{
              padding: "6px 14px",
              fontSize: 9,
              color: colors.textFaint,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              fontWeight: 600,
              borderBottom: "1px solid " + colors.borderSoft,
              marginBottom: 4,
            }}
          >
            {cat}
          </div>
          {SCENES.filter((s) => s.category === cat).map((s) => {
            const active = scene === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScene(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: active ? colors.brandSoft : "transparent",
                  borderLeft: active
                    ? "3px solid " + colors.brand
                    : "3px solid transparent",
                  color: active ? colors.text : colors.textDim,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: fontUi,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// Camera preset bar (overlay)
// =====================================================================

function CameraPresetBar({
  presets,
  onPick,
  colors,
  fontUi,
}: {
  presets: CameraPreset[];
  onPick: (pos: [number, number, number]) => void;
  colors: Colors;
  fontUi: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        maxWidth: 320,
      }}
    >
      {presets.map((p, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(p.pos)}
          style={{
            background: "rgba(13,40,24,0.85)",
            border: "1px solid " + colors.borderSoft,
            color: colors.textDim,
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "4px 8px",
            fontFamily: fontUi,
            cursor: "pointer",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function CameraLerp({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  const targetVec = useMemo(() => new THREE.Vector3(...target), [target]);
  const lerpProgress = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const lastTarget = useRef<string>("");

  useEffect(() => {
    const key = target.join(",");
    if (key === lastTarget.current) return;
    startPos.current.copy(camera.position);
    lerpProgress.current = 0;
    lastTarget.current = key;
  }, [target, camera]);

  useFrame((_, delta) => {
    if (lerpProgress.current >= 1) return;
    lerpProgress.current = Math.min(1, lerpProgress.current + delta * 1.6);
    const t = easeInOut(lerpProgress.current);
    camera.position.lerpVectors(startPos.current, targetVec, t);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// =====================================================================
// Shared geometry/util
// =====================================================================

function Axes({
  xLabel,
  yLabel,
  zLabel,
  xColor,
  yColor,
  zColor,
  boundsScale = 1,
}: {
  xLabel: string;
  yLabel: string;
  zLabel: string;
  xColor: string;
  yColor: string;
  zColor: string;
  boundsScale?: number;
}) {
  const b = 1.5 * boundsScale;
  return (
    <group>
      <line>
        <bufferGeometry attach="geometry" {...lineGeom([-1.7, -b, -b], [1.7, -b, -b])} />
        <lineBasicMaterial color={xColor} />
      </line>
      <Text position={[1.85, -b, -b]} fontSize={0.16} color={xColor}>
        {xLabel}
      </Text>
      <line>
        <bufferGeometry
          attach="geometry"
          {...lineGeom([-b, -1.7, -b], [-b, 1.7 * boundsScale, -b])}
        />
        <lineBasicMaterial color={yColor} />
      </line>
      <Text position={[-b, 1.85 * boundsScale, -b]} fontSize={0.16} color={yColor}>
        {yLabel}
      </Text>
      <line>
        <bufferGeometry attach="geometry" {...lineGeom([-b, -b, -1.7], [-b, -b, 1.7])} />
        <lineBasicMaterial color={zColor} />
      </line>
      <Text position={[-b, -b, 1.85]} fontSize={0.16} color={zColor}>
        {zLabel}
      </Text>
    </group>
  );
}

function lineGeom(a: [number, number, number], b: [number, number, number]) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b], 3));
  return { geometry: geom };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}

// =====================================================================
// SCENE 1: Weather × Play (kept from v2 — sharp thesis already)
// =====================================================================

function WeatherScene({ colors }: { colors: Colors }) {
  void colors;
  const points = scatter as WeatherPoint[];
  const sorted = useMemo(() => [...points].sort((a, b) => a.p - b.p), [points]);
  return (
    <group>
      <Axes
        xLabel="Temp →"
        yLabel="Crowd ↑"
        zLabel="Humidity →"
        xColor="#f0a020"
        yColor="#33BBFF"
        zColor="#5dd39e"
      />
      <gridHelper args={[3, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      <mesh position={[0.85, 0, -0.85]}>
        <boxGeometry args={[1.3, 3, 1.3]} />
        <meshBasicMaterial color={GREEN} opacity={0.06} transparent />
      </mesh>
      <mesh position={[-0.85, 0, 0.85]}>
        <boxGeometry args={[1.3, 3, 1.3]} />
        <meshBasicMaterial color={RED} opacity={0.06} transparent />
      </mesh>
      <Text position={[0.85, 1.65, -0.85]} fontSize={0.15} color={GREEN} anchorX="center" outlineColor="#06160d" outlineWidth={0.01}>
        PLAY ZONE
      </Text>
      <Text position={[-0.85, 1.65, 0.85]} fontSize={0.15} color={RED} anchorX="center" outlineColor="#06160d" outlineWidth={0.01}>
        NO-PLAY ZONE
      </Text>
      {sorted.map((p, i) => {
        const x = ((p.t + 10) / 50) * 3 - 1.5;
        const y = p.c * 3 - 1.5;
        const z = (p.h / 100) * 3 - 1.5;
        const size = p.p ? 0.04 + (p.hr ?? 0) * 0.012 : 0.035;
        const color = p.p ? (p.hr > 4 ? "#7eddb0" : GREEN) : RED;
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[size, 12, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={p.p ? 0.5 : 0.15}
              metalness={0.1}
              roughness={0.4}
              opacity={p.p ? 1.0 : 0.32}
              transparent={!p.p}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// =====================================================================
// SCENE 2: PGA SG-Cube (kept from v2)
// =====================================================================

function SgCubeScene({ colors }: { colors: Colors }) {
  const players = pgaAnalysis.players as PgaPlayer[];
  const ranges = useMemo(() => {
    const putts = players.map((p) => p.putt);
    const apps = players.map((p) => p.app);
    const otts = players.map((p) => p.ott);
    const totals = players.map((p) => p.total);
    return {
      putt: [Math.min(...putts), Math.max(...putts)],
      app: [Math.min(...apps), Math.max(...apps)],
      ott: [Math.min(...otts), Math.max(...otts)],
      total: [Math.min(...totals), Math.max(...totals)],
    };
  }, [players]);
  const norm = (v: number, [lo, hi]: number[]) =>
    ((v - lo) / Math.max(0.001, hi - lo)) * 3 - 1.5;
  const zeroX = norm(0, ranges.putt);
  const zeroY = norm(0, ranges.app);
  const zeroZ = norm(0, ranges.ott);
  const colorFor = (total: number) => {
    const [lo, hi] = ranges.total;
    const t = (total - lo) / Math.max(0.001, hi - lo);
    const r = Math.round(0x33 + (0x5d - 0x33) * t);
    const g = Math.round(0xbb + (0xd3 - 0xbb) * t);
    const b = Math.round(0xff - (0xff - 0x9e) * t);
    return `rgb(${r},${g},${b})`;
  };
  const topTen = useMemo(
    () => [...players].sort((a, b) => b.total - a.total).slice(0, 10).map((p) => p.player),
    [players]
  );
  const eliteCenter: [number, number, number] = [
    (zeroX + 1.5) / 2,
    (zeroY + 1.5) / 2,
    (zeroZ + 1.5) / 2,
  ];
  const eliteSize: [number, number, number] = [1.5 - zeroX, 1.5 - zeroY, 1.5 - zeroZ];
  return (
    <group>
      <Axes xLabel="SG-Putt →" yLabel="SG-Approach ↑" zLabel="SG-Off-the-Tee →" xColor="#f0a020" yColor="#33BBFF" zColor="#5dd39e" />
      <gridHelper args={[3, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      <ZeroPlane position={[zeroX, 0, 0]} normal="x" />
      <ZeroPlane position={[0, zeroY, 0]} normal="y" />
      <ZeroPlane position={[0, 0, zeroZ]} normal="z" />
      <mesh position={eliteCenter}>
        <boxGeometry args={eliteSize} />
        <meshBasicMaterial color={GREEN} opacity={0.07} transparent />
      </mesh>
      <Text position={[eliteCenter[0], 1.7, eliteCenter[2]]} fontSize={0.13} color={GREEN} anchorX="center" outlineColor="#06160d" outlineWidth={0.008}>
        ELITE OCTANT
      </Text>
      <mesh position={[zeroX, zeroY, zeroZ]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial color={colors.textFaint} />
      </mesh>
      <Text position={[zeroX, zeroY - 0.16, zeroZ]} fontSize={0.08} color={colors.textDim} anchorX="center" outlineColor="#06160d" outlineWidth={0.006}>
        TOUR AVG (0,0,0)
      </Text>
      {players.map((p, i) => {
        const x = norm(p.putt, ranges.putt);
        const y = norm(p.app, ranges.app);
        const z = norm(p.ott, ranges.ott);
        const size = 0.06 + Math.sqrt(p.wins + 1) * 0.025;
        const color = colorFor(p.total);
        const isTop = topTen.includes(p.player);
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[size, 16, 16]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isTop ? 0.7 : 0.18}
              metalness={0.2}
              roughness={0.4}
              opacity={isTop ? 1 : 0.5}
              transparent={!isTop}
            />
          </mesh>
        );
      })}
      {/* Top-10 nameplates rendered separately (after spheres) so the
          backing planes always render on top of nearby points + leader
          lines come out cleanly. */}
      {players
        .filter((p) => topTen.includes(p.player))
        .map((p, i) => {
          const x = norm(p.putt, ranges.putt);
          const y = norm(p.app, ranges.app);
          const z = norm(p.ott, ranges.ott);
          const size = 0.06 + Math.sqrt(p.wins + 1) * 0.025;
          const color = colorFor(p.total);
          const labelY = 0.4;
          // Each label gets a slight rank-based vertical offset so adjacent
          // players don't pile on top of each other when the cube is tight.
          const rankOffset = (i % 3) * 0.06;
          return (
            <group key={`label-${i}`} position={[x, y, z]}>
              <line>
                <bufferGeometry
                  attach="geometry"
                  {...lineGeom([0, size, 0], [0, labelY + rankOffset - 0.04, 0])}
                />
                <lineBasicMaterial color={color} />
              </line>
              {/* No backing plate — adjacent labels would occlude each other.
                  Rely on a thick text outline for contrast against the dark canvas. */}
              <Text
                position={[0, labelY + rankOffset, 0]}
                fontSize={0.1}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineColor="#06160d"
                outlineWidth={0.018}
                fontWeight={700}
              >
                {p.player}
              </Text>
            </group>
          );
        })}
    </group>
  );
}

function ZeroPlane({ position, normal }: { position: [number, number, number]; normal: "x" | "y" | "z" }) {
  const rot: [number, number, number] =
    normal === "x" ? [0, Math.PI / 2, 0] : normal === "y" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={position} rotation={rot}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial color="#5dd39e" opacity={0.04} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// =====================================================================
// SCENE 3: Archetypes (kept from v2)
// =====================================================================

function ArchetypesScene({ colors }: { colors: Colors }) {
  void colors;
  const players = pgaAnalysis.players as PgaPlayer[];
  const archetypes = pgaAnalysis.archetypes as ArchetypeCluster[];
  const ranges = useMemo(() => {
    const putts = players.map((p) => p.putt);
    const apps = players.map((p) => p.app);
    const otts = players.map((p) => p.ott);
    return {
      putt: [Math.min(...putts), Math.max(...putts)],
      app: [Math.min(...apps), Math.max(...apps)],
      ott: [Math.min(...otts), Math.max(...otts)],
    };
  }, [players]);
  const norm = (v: number, [lo, hi]: number[]) => ((v - lo) / Math.max(0.001, hi - lo)) * 3 - 1.5;
  const clusterMeta = useMemo(() => {
    return archetypes.map((a) => {
      const members = a.members
        .map((m) => players.find((p) => p.player === m))
        .filter((p): p is PgaPlayer => !!p);
      const coords = members.map((m) => [
        norm(m.putt, ranges.putt),
        norm(m.app, ranges.app),
        norm(m.ott, ranges.ott),
      ]);
      const cx = coords.reduce((s, c) => s + c[0], 0) / Math.max(1, coords.length);
      const cy = coords.reduce((s, c) => s + c[1], 0) / Math.max(1, coords.length);
      const cz = coords.reduce((s, c) => s + c[2], 0) / Math.max(1, coords.length);
      const radius = Math.max(
        ...coords.map((c) => Math.sqrt((c[0] - cx) ** 2 + (c[1] - cy) ** 2 + (c[2] - cz) ** 2)),
        0.2
      );
      const reps = members
        .sort((a, b) => b.total - a.total)
        .slice(0, 2)
        .map((m) => ({
          player: m.player,
          coord: [norm(m.putt, ranges.putt), norm(m.app, ranges.app), norm(m.ott, ranges.ott)] as [number, number, number],
        }));
      return { cluster: a.cluster, archetype: a.archetype, cx, cy, cz, radius, reps };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetypes, players, ranges]);
  return (
    <group>
      <Axes xLabel="SG-Putt →" yLabel="SG-Approach ↑" zLabel="SG-Off-the-Tee →" xColor="#f0a020" yColor="#33BBFF" zColor="#5dd39e" />
      <gridHelper args={[3, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      {clusterMeta.map((m, i) => {
        const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
        return (
          <mesh key={`hull-${i}`} position={[m.cx, m.cy, m.cz]}>
            <sphereGeometry args={[m.radius * 1.1, 24, 24]} />
            <meshBasicMaterial color={color} opacity={0.08} transparent />
          </mesh>
        );
      })}
      {players.map((p, i) => {
        const x = norm(p.putt, ranges.putt);
        const y = norm(p.app, ranges.app);
        const z = norm(p.ott, ranges.ott);
        const meta = clusterMeta.find((m) => m.cluster === p.cluster);
        if (!meta) return null;
        const color = CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length];
        return (
          <line key={`line-${i}`}>
            <bufferGeometry attach="geometry" {...lineGeom([x, y, z], [meta.cx, meta.cy, meta.cz])} />
            <lineBasicMaterial color={color} opacity={0.25} transparent />
          </line>
        );
      })}
      {players.map((p, i) => {
        const x = norm(p.putt, ranges.putt);
        const y = norm(p.app, ranges.app);
        const z = norm(p.ott, ranges.ott);
        const color = CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length];
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.1} roughness={0.4} />
          </mesh>
        );
      })}
      {clusterMeta.map((m, i) => {
        const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
        return (
          <group key={`centroid-${i}`} position={[m.cx, m.cy, m.cz]}>
            <mesh>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} opacity={0.92} transparent />
            </mesh>
            <Text position={[0, 0.42, 0]} fontSize={0.13} color={color} anchorX="center" outlineColor="#06160d" outlineWidth={0.008}>
              {m.archetype.toUpperCase()}
            </Text>
          </group>
        );
      })}
      {clusterMeta.flatMap((m, i) => {
        const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
        return m.reps.map((rep) => (
          <Text key={`rep-${rep.player}`} position={[rep.coord[0], rep.coord[1] + 0.16, rep.coord[2]]} fontSize={0.07} color={color} anchorX="center" outlineColor="#06160d" outlineWidth={0.005}>
            {rep.player}
          </Text>
        ));
      })}
    </group>
  );
}

// =====================================================================
// SCENE 4 (NEW): Career Arc — pick a player, see their career trajectory
// =====================================================================

const CAREER_PLAYER_LIST = (() => {
  const trends = (pgaTour as PgaTourJson).playerTrends;
  return Object.keys(trends)
    .filter((p) => trends[p].length >= 4)
    .sort();
})();

function CareerArcScene({ colors }: { colors: Colors }) {
  void colors;
  // Read player A/B from window (set via the right rail)
  const [playerA, setPlayerA] = useState<string>("Jon Rahm");
  const [playerB, setPlayerB] = useState<string>("");

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ a: string; b: string }>;
      setPlayerA(ce.detail.a);
      setPlayerB(ce.detail.b);
    };
    window.addEventListener("career-arc-players", handler as EventListener);
    return () => window.removeEventListener("career-arc-players", handler as EventListener);
  }, []);

  const trends = (pgaTour as PgaTourJson).playerTrends;
  const trendA = trends[playerA] ?? [];
  const trendB = playerB ? trends[playerB] ?? [] : [];

  return (
    <group>
      <Axes xLabel="Season →" yLabel="SG-Total ↑" zLabel="Cumulative wins →" xColor="#f0a020" yColor="#5dd39e" zColor="#33BBFF" />
      <gridHelper args={[3, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      <CareerArcLine trend={trendA} color={GREEN} player={playerA} />
      {playerB && <CareerArcLine trend={trendB} color="#33BBFF" player={playerB} />}
    </group>
  );
}

function CareerArcLine({ trend, color, player }: { trend: PlayerTrendEntry[]; color: string; player: string }) {
  const seasons = (pgaTour as PgaTourJson).playerTrends[player]?.map((t) => t.season) ?? [];
  void seasons;

  const points: [number, number, number][] = trend.map((t, i) => {
    const x = -1.5 + (i / Math.max(1, trend.length - 1)) * 3;
    const y = Math.max(-1.5, Math.min(1.5, ((t.avgSgTotal ?? 0) / 2.5) * 1.5));
    let cumWins = 0;
    for (let k = 0; k <= i; k++) cumWins += trend[k].wins;
    const z = -1.5 + Math.min(1, cumWins / 25) * 3;
    return [x, y, z];
  });

  if (points.length === 0) return null;

  return (
    <group>
      {/* The arc as connected line segments */}
      {points.slice(0, -1).map((p, i) => (
        <line key={`seg-${i}`}>
          <bufferGeometry attach="geometry" {...lineGeom(p, points[i + 1])} />
          <lineBasicMaterial color={color} linewidth={2} />
        </line>
      ))}
      {/* Spheres at each season's data point */}
      {points.map((p, i) => {
        const t = trend[i];
        const size = 0.04 + Math.min(0.06, t.events * 0.003);
        return (
          <group key={`pt-${i}`} position={p}>
            <mesh>
              <sphereGeometry args={[size, 16, 16]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
            </mesh>
            <Text position={[0, 0.13, 0]} fontSize={0.06} color={color} anchorX="center" outlineColor="#06160d" outlineWidth={0.005}>
              {String(t.season)}
            </Text>
          </group>
        );
      })}
      {/* Player name at start of arc */}
      {points.length > 0 && (
        <Text
          position={[points[0][0] - 0.15, points[0][1], points[0][2]]}
          fontSize={0.1}
          color={color}
          anchorX="right"
          outlineColor="#06160d"
          outlineWidth={0.006}
        >
          {player}
        </Text>
      )}
    </group>
  );
}

// =====================================================================
// SCENE 5 (NEW): Course Difficulty Terrain — 5×5 bar towers
// =====================================================================

function CourseTerrainScene({ colors }: { colors: Colors }) {
  void colors;
  const data = pgaCoursesDeep as CoursesDeepJson;
  const courses = data.top25;
  const sgs = courses.map((c) => c.avgSgTotal);
  const variances = courses.map((c) => c.variance);
  const minSg = Math.min(...sgs);
  const maxSg = Math.max(...sgs);
  const maxVar = Math.max(...variances);

  return (
    <group>
      <Axes xLabel="" yLabel="Difficulty ↑" zLabel="" xColor="#666" yColor="#5dd39e" zColor="#666" boundsScale={1.2} />
      <gridHelper args={[5, 10, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      {courses.map((c, i) => {
        const ix = i % 5;
        const iy = Math.floor(i / 5);
        const x = -2 + ix * 1.0;
        const z = -2 + iy * 1.0;
        // Height scales with difficulty (more negative SG = harder = taller bar)
        const difficulty = (maxSg - c.avgSgTotal) / Math.max(0.001, maxSg - minSg);
        const height = 0.2 + difficulty * 2.6;
        const y = -1.5 + height / 2;
        // Color: variance ratio, low var = consistent = green; high var = volatile = orange
        const varRatio = c.variance / Math.max(0.001, maxVar);
        const hue = (1 - varRatio) * 110; // 0 (red) → 110 (green)
        const [r, g, b] = hslToRgb(hue / 360, 0.6, 0.5);
        const colorStr = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        // Short course name (first 3 words or 16 chars)
        const shortName = c.course
          .replace(/^(.*?) - .*/, "$1")
          .slice(0, 18);
        return (
          <group key={c.course} position={[x, y, z]}>
            <mesh>
              <boxGeometry args={[0.7, height, 0.7]} />
              <meshStandardMaterial color={colorStr} emissive={colorStr} emissiveIntensity={0.25} metalness={0.2} roughness={0.5} />
            </mesh>
            <Text
              position={[0, height / 2 + 0.12, 0]}
              fontSize={0.07}
              color={colorStr}
              anchorX="center"
              outlineColor="#06160d"
              outlineWidth={0.005}
              rotation={[-Math.PI / 6, Math.PI / 8, 0]}
            >
              {shortName}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

// =====================================================================
// SCENE 6 (NEW): Player × Course Heatmap
// =====================================================================

function PlayerCourseScene({ colors }: { colors: Colors }) {
  void colors;
  const data = pgaPlayerCourse as PlayerCourseJson;
  // Take top 12 of each
  const players = data.players.slice(0, 12);
  const courses = data.courses.slice(0, 12);

  // Find max abs SG for color scaling
  const allSgs = players.flatMap((p) =>
    p.cells.slice(0, 12).map((c) => c.avgSg).filter((v): v is number => v != null)
  );
  const maxAbsSg = Math.max(...allSgs.map((v) => Math.abs(v)), 1.5);

  return (
    <group>
      <gridHelper args={[5, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      {/* Each cell = 3D bar */}
      {players.map((p, pi) =>
        p.cells.slice(0, 12).map((cell, ci) => {
          const x = -2.2 + (pi * 4.4) / 11;
          const z = -2.2 + (ci * 4.4) / 11;
          const sg = cell.avgSg ?? 0;
          const positive = sg >= 0;
          // Height: scaled by abs SG, capped at 2
          const heightAbs = Math.min(2.5, (Math.abs(sg) / maxAbsSg) * 2);
          const halfH = heightAbs / 2;
          // Bar grows up from 0 (positive) or down from 0 (negative). Center at -1.5 (floor)
          const y = positive ? -1.5 + halfH : -1.5 - halfH;
          // Color
          let colorStr: string;
          if (cell.n < 2) colorStr = "#3a3a3a";
          else {
            const ratio = Math.min(1, Math.abs(sg) / maxAbsSg);
            const hue = positive ? 110 : 0; // green or red
            const [r, g, b] = hslToRgb(hue / 360, 0.65, 0.5 - ratio * 0.15);
            colorStr = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
          }
          return (
            <mesh key={`${pi}-${ci}`} position={[x, y, z]}>
              <boxGeometry args={[0.32, heightAbs, 0.32]} />
              <meshStandardMaterial color={colorStr} emissive={colorStr} emissiveIntensity={cell.n < 2 ? 0 : 0.25} metalness={0.2} roughness={0.5} opacity={cell.n < 2 ? 0.4 : 1} transparent={cell.n < 2} />
            </mesh>
          );
        })
      )}
      {/* Player labels along X edge (front) */}
      {players.map((p, pi) => {
        const x = -2.2 + (pi * 4.4) / 11;
        return (
          <Text
            key={`pl-${pi}`}
            position={[x, -1.45, -2.5]}
            fontSize={0.08}
            color="#9aa89e"
            anchorX="center"
            anchorY="middle"
            outlineColor="#06160d"
            outlineWidth={0.005}
            rotation={[-Math.PI / 2.3, 0, 0]}
          >
            {p.player.split(" ").slice(-1)[0]}
          </Text>
        );
      })}
      {/* Course labels along Z edge */}
      {courses.slice(0, 12).map((c, ci) => {
        const z = -2.2 + (ci * 4.4) / 11;
        const shortName = c.course.replace(/^(.*?) - .*/, "$1").slice(0, 14);
        return (
          <Text
            key={`co-${ci}`}
            position={[-2.5, -1.45, z]}
            fontSize={0.07}
            color="#9aa89e"
            anchorX="right"
            anchorY="middle"
            outlineColor="#06160d"
            outlineWidth={0.005}
          >
            {shortName}
          </Text>
        );
      })}
      <Text position={[0, 2, -2.6]} fontSize={0.13} color={GREEN} anchorX="center">
        Green = course favorite · Red = struggle · Gray = small sample
      </Text>
    </group>
  );
}

// =====================================================================
// SCENE 7 (NEW): PCA Biplot — replaces P(play) Surface
// =====================================================================

function PcaScene({ colors }: { colors: Colors }) {
  void colors;
  const data = pcaData as PcaJson;
  const projections = data.projections;
  const loadings = data.loadings;
  const varEx = data.varExplained;

  const xs = projections.map((p) => p.pc1);
  const ys = projections.map((p) => p.pc3);
  const zs = projections.map((p) => p.pc2);
  const xExt = Math.max(...xs.map((v) => Math.abs(v)));
  const yExt = Math.max(...ys.map((v) => Math.abs(v)));
  const zExt = Math.max(...zs.map((v) => Math.abs(v)));

  const norm1 = (v: number, e: number) => (v / Math.max(0.001, e)) * 1.4;
  const topByTotal = useMemo(
    () => [...projections].sort((a, b) => b.total - a.total).slice(0, 8).map((p) => p.player),
    [projections]
  );

  // Loading arrow colors (per feature)
  const featColors: Record<string, string> = {
    putt: "#f0a020",
    arg: "#e063b8",
    app: "#33BBFF",
    ott: "#5dd39e",
  };

  return (
    <group>
      <Axes
        xLabel={`PC1 (${(varEx[0] * 100).toFixed(0)}%)`}
        yLabel={`PC3 (${(varEx[2] * 100).toFixed(0)}%)`}
        zLabel={`PC2 (${(varEx[1] * 100).toFixed(0)}%)`}
        xColor="#f0a020"
        yColor="#5dd39e"
        zColor="#33BBFF"
      />
      <gridHelper args={[3, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      {/* Player points */}
      {projections.map((p, i) => {
        const x = norm1(p.pc1, xExt);
        const y = norm1(p.pc3, yExt);
        const z = norm1(p.pc2, zExt);
        const size = 0.06 + Math.sqrt(p.wins + 1) * 0.02;
        const isTop = topByTotal.includes(p.player);
        const color = p.total >= 0 ? GREEN : "#33BBFF";
        return (
          <group key={i} position={[x, y, z]}>
            <mesh>
              <sphereGeometry args={[size, 14, 14]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isTop ? 0.6 : 0.3} />
            </mesh>
            {isTop && (
              <Text position={[0, size + 0.1, 0]} fontSize={0.08} color={color} anchorX="center" outlineColor="#06160d" outlineWidth={0.005}>
                {p.player}
              </Text>
            )}
          </group>
        );
      })}
      {/* Loading arrows from origin */}
      {loadings.map((l) => {
        const lx = norm1(l.pc1 * 1.5, xExt);
        const ly = norm1(l.pc3 * 1.5, yExt);
        const lz = norm1(l.pc2 * 1.5, zExt);
        const color = featColors[l.feature] ?? "#fff";
        const dir = new THREE.Vector3(lx, ly, lz);
        const len = dir.length();
        const unit = dir.clone().normalize();
        // Cylinder from origin to (lx, ly, lz) — using a thin arrow
        const midpoint: [number, number, number] = [lx / 2, ly / 2, lz / 2];
        // Compute rotation to align cylinder Y-axis with `unit`
        const yAxis = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, unit);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        return (
          <group key={l.feature}>
            <mesh position={midpoint} rotation={euler.toArray().slice(0, 3) as [number, number, number]}>
              <cylinderGeometry args={[0.018, 0.018, len, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
            </mesh>
            {/* Cone tip */}
            <mesh position={[lx, ly, lz]} rotation={euler.toArray().slice(0, 3) as [number, number, number]}>
              <coneGeometry args={[0.05, 0.12, 12]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
            </mesh>
            <Text position={[lx * 1.25, ly * 1.25, lz * 1.25]} fontSize={0.11} color={color} anchorX="center" outlineColor="#06160d" outlineWidth={0.006}>
              {l.feature.toUpperCase()}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

// =====================================================================
// SCENE 8 (NEW): Cluster Timeline (animated 2015→2022)
// =====================================================================

function ClusterTimelineScene({ colors }: { colors: Colors }) {
  void colors;
  const data = clusterTimeline as ClusterTimelineJson;
  const seasons = data.seasons;
  const [progress, setProgress] = useState(0); // 0..1 across seasons
  const [playing, setPlaying] = useState(false);

  // Auto-advance
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 0.005;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [playing]);

  // Listen for play/pause from right rail
  useEffect(() => {
    const playHandler = () => {
      if (progress >= 1) setProgress(0);
      setPlaying(true);
    };
    const pauseHandler = () => setPlaying(false);
    const restartHandler = () => {
      setProgress(0);
      setPlaying(true);
    };
    window.addEventListener("cluster-tl-play", playHandler);
    window.addEventListener("cluster-tl-pause", pauseHandler);
    window.addEventListener("cluster-tl-restart", restartHandler);
    return () => {
      window.removeEventListener("cluster-tl-play", playHandler);
      window.removeEventListener("cluster-tl-pause", pauseHandler);
      window.removeEventListener("cluster-tl-restart", restartHandler);
    };
  }, [progress]);

  // Compute current season (interpolated)
  const positionInSeasons = progress * (seasons.length - 1);
  const i0 = Math.floor(positionInSeasons);
  const i1 = Math.min(seasons.length - 1, i0 + 1);
  const t = positionInSeasons - i0;
  const season0 = seasons[i0];
  const season1 = seasons[i1];
  const data0 = data.byYear[String(season0)];
  const data1 = data.byYear[String(season1)];

  // Range across all seasons for stable axis scaling
  const allPlayers = useMemo(() => {
    return seasons.flatMap((s) => data.byYear[String(s)]?.players ?? []);
  }, [seasons, data]);
  const ranges = useMemo(() => {
    const putts = allPlayers.map((p) => p.putt);
    const apps = allPlayers.map((p) => p.app);
    const otts = allPlayers.map((p) => p.ott);
    return {
      putt: [Math.min(...putts), Math.max(...putts)],
      app: [Math.min(...apps), Math.max(...apps)],
      ott: [Math.min(...otts), Math.max(...otts)],
    };
  }, [allPlayers]);
  const norm = (v: number, [lo, hi]: number[]) => ((v - lo) / Math.max(0.001, hi - lo)) * 3 - 1.5;

  // For each player visible in BOTH seasons, interpolate position
  // For players only in one, fade in/out
  const playersA = data0?.players ?? [];
  const playersB = data1?.players ?? [];
  const allKeys = new Set([
    ...playersA.map((p) => p.player),
    ...playersB.map((p) => p.player),
  ]);

  return (
    <group>
      <Axes xLabel="SG-Putt →" yLabel="SG-Approach ↑" zLabel="SG-Off-the-Tee →" xColor="#f0a020" yColor="#33BBFF" zColor="#5dd39e" />
      <gridHelper args={[3, 12, "#1a3d2a", "#143b25"]} position={[0, -1.5, 0]} />
      {/* Season label top-center */}
      <Text position={[0, 1.85, 0]} fontSize={0.22} color={GREEN} anchorX="center" outlineColor="#06160d" outlineWidth={0.012}>
        SEASON: {Math.round(season0 + (season1 - season0) * t)}
      </Text>
      {/* Render each player */}
      {[...allKeys].map((key) => {
        const pa = playersA.find((p) => p.player === key);
        const pb = playersB.find((p) => p.player === key);
        if (!pa && !pb) return null;
        let putt: number, arg: number, app: number, ott: number;
        let opacity = 1;
        let cluster: number;
        if (pa && pb) {
          putt = pa.putt + (pb.putt - pa.putt) * t;
          arg = pa.arg + (pb.arg - pa.arg) * t;
          app = pa.app + (pb.app - pa.app) * t;
          ott = pa.ott + (pb.ott - pa.ott) * t;
          cluster = t < 0.5 ? pa.cluster : pb.cluster;
        } else if (pa) {
          putt = pa.putt; arg = pa.arg; app = pa.app; ott = pa.ott;
          cluster = pa.cluster;
          opacity = 1 - t;
        } else if (pb) {
          putt = pb.putt; arg = pb.arg; app = pb.app; ott = pb.ott;
          cluster = pb.cluster;
          opacity = t;
        } else return null;
        void arg;
        const x = norm(putt, ranges.putt);
        const y = norm(app, ranges.app);
        const z = norm(ott, ranges.ott);
        const color = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
        return (
          <mesh key={key} position={[x, y, z]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} opacity={opacity} transparent={opacity < 1} />
          </mesh>
        );
      })}
      {/* Centroids (interpolated) */}
      {data0 && data1 && data0.centroids.map((c0, i) => {
        const c1 = data1.centroids[i];
        if (!c1) return null;
        const putt = c0.putt + (c1.putt - c0.putt) * t;
        const app = c0.app + (c1.app - c0.app) * t;
        const ott = c0.ott + (c1.ott - c0.ott) * t;
        const x = norm(putt, ranges.putt);
        const y = norm(app, ranges.app);
        const z = norm(ott, ranges.ott);
        const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
        return (
          <mesh key={`c-${i}`} position={[x, y, z]}>
            <octahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} opacity={0.85} transparent />
          </mesh>
        );
      })}
    </group>
  );
}

// =====================================================================
// Right-rail panels
// =====================================================================

function ThesisPanel({
  colors,
  thesis,
  evidence,
  howToRead,
  method,
  extra,
}: {
  colors: Colors;
  thesis: string;
  evidence: { label: string; value: string }[];
  howToRead: React.ReactNode;
  method: string;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <div style={{ background: "rgba(93,211,158,0.10)", border: "1px solid " + colors.brand, padding: "10px 12px", marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: colors.brand, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 600, marginBottom: 6 }}>
          Thesis
        </div>
        <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, lineHeight: 1.45 }}>
          {thesis}
        </div>
      </div>
      {extra}
      <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>
        Evidence
      </div>
      {evidence.map((e, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "5px 0", borderBottom: i < evidence.length - 1 ? "1px solid " + colors.borderSoft : "none", fontSize: 11 }}>
          <span style={{ color: colors.textDim }}>{e.label}</span>
          <span style={{ color: colors.text, fontWeight: 600 }}>{e.value}</span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 16, marginBottom: 8 }}>
        How to read
      </div>
      <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.55 }}>{howToRead}</div>
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid " + colors.borderSoft, fontSize: 9.5, color: colors.textFaint, letterSpacing: "0.04em", lineHeight: 1.5 }}>
        {method}
      </div>
    </>
  );
}

function WeatherInfo({ colors }: { colors: Colors }) {
  const data = surfaceData as unknown as SurfaceJson;
  const e = data.evidence;
  return (
    <ThesisPanel
      colors={colors}
      thesis="Hot + dry days are play days. Cold + humid days aren't. The split is clean enough that the green cluster visibly dominates the warm-dry corner of the cube."
      evidence={[
        { label: "Warm + dry play rate", value: `${(e.warmDry.rate * 100).toFixed(0)}% (n=${e.warmDry.n})` },
        { label: "Cold + humid play rate", value: `${(e.coldHumid.rate * 100).toFixed(0)}% (n=${e.coldHumid.n})` },
        { label: ">25°C any humidity", value: `${(e.tempBands.gt25.rate * 100).toFixed(0)}% (n=${e.tempBands.gt25.n})` },
        { label: "<5°C any humidity", value: `${(e.tempBands.lt5.rate * 100).toFixed(0)}% (n=${e.tempBands.lt5.n})` },
      ]}
      howToRead={<>Each sphere = one day. <span style={{ color: GREEN }}>Green</span> = play; <span style={{ color: RED }}>red</span> = no play. Translucent slabs mark the warm-dry vs cold-humid quadrants.</>}
      method="365 days from year 1 of the wide-format weather × play dataset."
    />
  );
}

function SgCubeInfo({ colors }: { colors: Colors }) {
  const players = pgaAnalysis.players as PgaPlayer[];
  const positiveAll3 = players.filter((p) => p.putt > 0 && p.app > 0 && p.ott > 0).length;
  const negativeAll3 = players.filter((p) => p.putt < 0 && p.app < 0 && p.ott < 0).length;
  const top1 = [...players].sort((a, b) => b.total - a.total)[0];
  return (
    <ThesisPanel
      colors={colors}
      thesis={`Elite Tour pros sit in the positive octant. Most carry a negative dimension somewhere — only ${positiveAll3} of ${players.length} (${((positiveAll3 / players.length) * 100).toFixed(0)}%) are positive across all three.`}
      evidence={[
        { label: "Players positive on all 3 axes", value: `${positiveAll3} / ${players.length}` },
        { label: "Players negative on all 3 axes", value: `${negativeAll3} / ${players.length}` },
        { label: "Top SG-Total", value: `${top1.player} (+${top1.total.toFixed(2)})` },
        { label: "Pool size", value: `${players.length} pros, 8 seasons` },
      ]}
      howToRead={<>Each sphere = one player. Position = career SG signature; size = wins; color = career SG-Total. <span style={{ color: GREEN }}>Green box</span> = elite octant; dim sphere at center = Tour-average baseline. Top 10 by SG-Total are labeled.</>}
      method="Top 60 players by career SG-Total across 36,864 PGA tournament rows, 2015–2022. Three faint planes = SG=0 boundaries."
    />
  );
}

function ArchetypesInfo({ colors }: { colors: Colors }) {
  const archetypes = pgaAnalysis.archetypes as ArchetypeCluster[];
  const totalPlayers = (pgaAnalysis.players as PgaPlayer[]).length;
  return (
    <ThesisPanel
      colors={colors}
      thesis="Four distinct profiles emerge from the same elite pool. The largest cluster is approach-driven; pure putters and around-greeners cover smaller, distinct regions of SG space."
      evidence={[...archetypes].sort((a, b) => b.members.length - a.members.length).map((a) => ({
        label: a.archetype,
        value: `n=${a.members.length} (${((a.members.length / totalPlayers) * 100).toFixed(0)}%)`,
      }))}
      howToRead={<>Each sphere = one player; color = k-means cluster. Translucent halos show cluster extent (radius = max distance from centroid in normalized space). Connector lines run from each player to their cluster gem. Two highest-SG players per cluster are labeled.</>}
      method="K-means k=4 on z-scored career (Putt, Arg, App, Ott). Deterministic seed, 100-iter cap. Archetype names auto-derived from each centroid's strongest dimension."
    />
  );
}

function CareerArcInfo({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  void fontMono;
  const [playerA, setPlayerA] = useState<string>("Jon Rahm");
  const [playerB, setPlayerB] = useState<string>("");

  // Push player selection to scene via custom event
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("career-arc-players", { detail: { a: playerA, b: playerB } }));
  }, [playerA, playerB]);

  const trends = (pgaTour as PgaTourJson).playerTrends;
  const trendA = trends[playerA] ?? [];
  const totalEventsA = trendA.reduce((s, t) => s + t.events, 0);
  const totalWinsA = trendA.reduce((s, t) => s + t.wins, 0);
  const peakA = trendA.reduce(
    (best, t) => (t.avgSgTotal != null && (best.avgSgTotal == null || t.avgSgTotal > (best.avgSgTotal ?? -99)) ? t : best),
    {} as PlayerTrendEntry
  );
  return (
    <ThesisPanel
      colors={colors}
      thesis={`A career has shape. ${playerA}'s arc${playerB ? ` vs ${playerB}` : ""} traces SG-Total across seasons with cumulative wins on the depth axis.`}
      evidence={[
        { label: "Player A — total events", value: String(totalEventsA) },
        { label: "Player A — total wins", value: String(totalWinsA) },
        { label: "Player A — peak SG year", value: peakA.season ? `${peakA.season} (+${peakA.avgSgTotal?.toFixed(2)})` : "—" },
        { label: "Player A — # seasons", value: String(trendA.length) },
      ]}
      extra={
        <div style={{ marginBottom: 14 }}>
          <Label colors={colors}>Player A</Label>
          <PlayerDropdown value={playerA} onChange={setPlayerA} colors={colors} />
          <div style={{ marginTop: 8 }}>
            <Label colors={colors}>Compare with (optional)</Label>
            <PlayerDropdown value={playerB} onChange={setPlayerB} colors={colors} allowEmpty />
          </div>
        </div>
      }
      howToRead={<>Glowing line = career trajectory. Each sphere is one season; position is (X = season index, Y = avg SG-Total, Z = cumulative wins). Sphere size grows with events played that year. Front view = pure timeline; side view = SG profile; top-down = winning-rate path.</>}
      method="Per-season aggregates from the same 60-pro pool used in earlier scenes. Y-axis clamped to ±2.5 SG-Total. Z-axis caps at 25 cumulative wins."
    />
  );
}

function CourseTerrainInfo({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  void fontMono;
  const data = pgaCoursesDeep as CoursesDeepJson;
  const top25 = data.top25;
  const hardest = top25[0];
  const easiest = top25[top25.length - 1];
  const mostVolatile = [...top25].sort((a, b) => b.variance - a.variance)[0];
  return (
    <ThesisPanel
      colors={colors}
      thesis="Tour difficulty isn't uniform. Some courses chew up the field consistently; others let scoring runs happen. Tower height encodes how hard a course plays; color encodes how volatile the field's scoring is."
      evidence={[
        { label: "Hardest course", value: `${shortCourseName(hardest.course)} (${hardest.avgSgTotal.toFixed(2)})` },
        { label: "Easiest course (top 25)", value: `${shortCourseName(easiest.course)} (${easiest.avgSgTotal.toFixed(2)})` },
        { label: "Most volatile", value: `${shortCourseName(mostVolatile.course)} (σ=${mostVolatile.stdDev.toFixed(2)})` },
        { label: "Range of avg SG", value: `${easiest.avgSgTotal.toFixed(2)} → ${hardest.avgSgTotal.toFixed(2)}` },
      ]}
      howToRead={<>Each tower = one course; height = field difficulty (taller = harder, computed from −avg SG-Total). Tower color: <span style={{ color: GREEN }}>green</span> = consistent scoring spread, <span style={{ color: RED }}>red</span> = high variance / scores swing widely. Camera presets switch between bird's-eye and side views.</>}
      method="Top 25 venues by tournament-rounds count. Avg SG-Total computed across all rounds at the venue 2015–2022; variance from same pool."
    />
  );
}

function PlayerCourseInfo({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  void fontMono;
  const data = pgaPlayerCourse as PlayerCourseJson;
  const players = data.players.slice(0, 12);
  // Find the strongest player×course matchup
  let best: { player: string; course: string; avgSg: number } | null = null;
  let worst: { player: string; course: string; avgSg: number } | null = null;
  for (const p of players) {
    for (const c of p.cells.slice(0, 12)) {
      if (c.avgSg == null || c.n < 2) continue;
      if (!best || c.avgSg > best.avgSg) best = { player: p.player, course: c.course, avgSg: c.avgSg };
      if (!worst || c.avgSg < worst.avgSg) worst = { player: p.player, course: c.course, avgSg: c.avgSg };
    }
  }
  return (
    <ThesisPanel
      colors={colors}
      thesis="Players have favorite venues. The bars rising green show course-favorite combos; red bars show struggle venues. The vertical spread within a player's row tells you how venue-dependent their game is."
      evidence={[
        { label: "Best player×course", value: best ? `${shortName(best.player)} @ ${shortCourseName(best.course)} (+${best.avgSg.toFixed(2)})` : "—" },
        { label: "Worst player×course", value: worst ? `${shortName(worst.player)} @ ${shortCourseName(worst.course)} (${worst.avgSg.toFixed(2)})` : "—" },
        { label: "Players shown", value: `${players.length} (top by career SG)` },
        { label: "Courses shown", value: "12 (most-played venues)" },
      ]}
      howToRead={<>Each tower = one player×course cell. Height = magnitude of avg SG at that venue. Green = positive (course favorite). Red = negative (struggle). Gray = sample size below 2.</>}
      method="Top 12 players × top 12 most-played venues, 2015–2022. Cells with fewer than 2 visits are rendered gray to prevent noise from being interpreted as signal."
    />
  );
}

function PcaInfo({ colors }: { colors: Colors }) {
  const data = pcaData as PcaJson;
  const varEx = data.varExplained;
  const loadings = data.loadings;
  // Identify what each PC most loads on
  function dominantFeat(pc: "pc1" | "pc2") {
    const sorted = [...loadings].sort((a, b) => Math.abs(b[pc]) - Math.abs(a[pc]));
    return sorted[0].feature;
  }
  const pc1Top = dominantFeat("pc1");
  const pc2Top = dominantFeat("pc2");
  return (
    <ThesisPanel
      colors={colors}
      thesis={`The 4D player space collapses to two meaningful dimensions. PC1 (${(varEx[0] * 100).toFixed(0)}% of variance) is dominated by ${pc1Top.toUpperCase()}; PC2 (${(varEx[1] * 100).toFixed(0)}%) by ${pc2Top.toUpperCase()}.`}
      evidence={[
        { label: "PC1 variance explained", value: `${(varEx[0] * 100).toFixed(1)}%` },
        { label: "PC2 variance explained", value: `${(varEx[1] * 100).toFixed(1)}%` },
        { label: "PC3 variance explained", value: `${(varEx[2] * 100).toFixed(1)}%` },
        { label: "PC1+PC2 cumulative", value: `${((varEx[0] + varEx[1]) * 100).toFixed(1)}%` },
      ]}
      howToRead={<>Each sphere = one of the top 60 pros, projected from 4D SG signature into PC1×PC3×PC2 space. Loading arrows from origin show how each original feature (Putt, Arg, App, Ott) projects onto the principal components — viewers see the &ldquo;meaning&rdquo; of each axis.</>}
      method="PCA on z-scored 4D career SG signatures. Eigendecomposition via Jacobi rotation. Replaces the v2 P(play) Surface scene which was visually weak (LR's outlook-dominated)."
    />
  );
}

function ClusterTimelineInfo({ colors, fontMono }: { colors: Colors; fontMono: string }) {
  void fontMono;
  const data = clusterTimeline as ClusterTimelineJson;
  const seasons = data.seasons;
  return (
    <ThesisPanel
      colors={colors}
      thesis="Watch the elite cluster shift across 8 seasons. Press Play and the centroids drift, players migrate between archetypes, and new entrants pop into the pool. The motion shows what static slices can't."
      evidence={[
        { label: "Seasons covered", value: `${seasons[0]} → ${seasons[seasons.length - 1]}` },
        { label: "Snapshots", value: String(seasons.length) },
        { label: "Top 30 per season", value: "k-means k=4 each" },
        { label: "Centroids", value: "Re-clustered per season" },
      ]}
      extra={
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("cluster-tl-play"))}
            style={{ background: colors.brandSoft, border: "1px solid " + colors.brand, color: colors.text, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" }}
          >
            ▶ Play
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("cluster-tl-pause"))}
            style={{ background: colors.panelDeep, border: "1px solid " + colors.borderSoft, color: colors.textDim, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" }}
          >
            ⏸ Pause
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("cluster-tl-restart"))}
            style={{ background: colors.panelDeep, border: "1px solid " + colors.borderSoft, color: colors.textDim, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" }}
          >
            ⟳ Restart
          </button>
        </div>
      }
      howToRead={<>Same axes as the SG-Cube. Each sphere = a top-30 player from the active season; color = their cluster assignment that season. Octahedrons = season's k-means centroids. The big season label updates as time advances. Players fade in/out as they enter/leave the top 30.</>}
      method="K-means k=4 re-run on each season's top 30 (z-scored Putt/Arg/App/Ott), deterministic seed. Position interpolation between snapshots is linear; cluster assignment switches at the midpoint."
    />
  );
}

// =====================================================================
// Helpers
// =====================================================================

function PlayerDropdown({ value, onChange, colors, allowEmpty }: { value: string; onChange: (v: string) => void; colors: Colors; allowEmpty?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: colors.panelDeep,
        color: colors.text,
        border: "1px solid " + colors.borderSoft,
        padding: "5px 8px",
        fontSize: 12,
        fontFamily: "inherit",
      }}
    >
      {allowEmpty && <option value="">— none —</option>}
      {CAREER_PLAYER_LIST.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}

function Label({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 4 }}>
      {children}
    </div>
  );
}

function shortName(p: string): string {
  const parts = p.split(" ");
  if (parts.length <= 2) return p;
  return parts[0][0] + ". " + parts.slice(-1)[0];
}

function shortCourseName(c: string): string {
  return c.replace(/^(.*?) - .*/, "$1").slice(0, 26);
}

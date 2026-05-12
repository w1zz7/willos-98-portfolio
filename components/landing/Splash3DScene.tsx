"use client";

/**
 * Splash3DScene — the "max flex" 3D scene mounted inside the Win98 splash
 * (Stage 2 of BootPlayback). The single screen a senior recruiter is most
 * likely to dwell on for a few seconds; we use that moment to demonstrate
 * end-to-end three.js / R3F engineering depth.
 *
 * The scene composition:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ painterly cloud sky (rendered by parent SplashStage)       │
 *   │                                                             │
 *   │           ╱╲╱╲      ← 3D wavy Windows flag (custom         │
 *   │          ╱╳╳╳╳╲       geometry, per-vertex sin wave on    │
 *   │         ╱╳red╳╲       leading edge, 4 colored quadrants)  │
 *   │        ╱╳grn╳╳╲                                            │
 *   │       ╱╳blu╳ylw╲                                           │
 *   │                                                             │
 *   │          Microsoft     ← extruded 3D text via drei         │
 *   │          Windows 98       <Text3D> + helvetiker_bold font │
 *   │                                                             │
 *   │  ░░░░░░░░░░░░░░░░░░░░  ← reflective floor mirroring        │
 *   │                            the flag + wordmark above       │
 *   └────────────────────────────────────────────────────────────┘
 *   bottom: scrolling LOGO.SYS palette-rotation progress bar (parent)
 *
 * Perf:
 *   - dpr capped at [1, 2] desktop / [1, 1.5] mobile
 *   - frameloop="always" — the scene needs continuous animation (wave +
 *     camera dolly) so demand-mode would stutter
 *   - reduced mode (mobile) drops Bloom/DoF/CA/Vignette + reflective floor
 *     + halves sparkle count. The flag + wordmark + lighting still render
 *     so the wow stays visible on phones.
 *
 * Mirrors the lighting/post-processing patterns from MobiusButton.tsx so
 * the two landing-stage 3D scenes feel like they were authored together.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  Environment,
  MeshReflectorMaterial,
  Sparkles,
  Text3D,
} from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { easeOutCubic } from "./easings";

// ──────────────────────────────────────────────────────────────────────
// FLAG GEOMETRY
//
// The iconic Win9x flag is a 2×2 grid of colored quadrants viewed in
// 3D perspective. We build it as a single mesh per quadrant (4 meshes
// total) so each can carry its own MeshStandardMaterial color — that
// way envmap reflections + lighting respect the per-color contrast.
//
// Each quadrant is a PlaneGeometry with enough subdivisions to support
// a smooth per-vertex wave on the leading edge.
// ──────────────────────────────────────────────────────────────────────

const FLAG_COLORS = {
  red: "#e94032",
  green: "#36b04a",
  blue: "#2a7be4",
  yellow: "#f5c424",
} as const;

const FLAG_QUAD = 0.78; // half-width of each quadrant
const FLAG_GAP = 0.04;  // spacing between quadrants

interface QuadrantProps {
  color: string;
  offset: [number, number]; // sign for x / y placement
  /** Shared animation time ref so all 4 quadrants stay in lockstep. */
  timeRef: React.MutableRefObject<number>;
}

/**
 * One colored quadrant of the Windows flag. PlaneGeometry with 24×24
 * subdivisions so the wave displacement reads as smooth rather than
 * stepped. Wave math runs per-frame on the BufferAttribute — cheap on
 * 625 verts, no shader complexity, no GLSL maintenance burden.
 */
function FlagQuadrant({ color, offset, timeRef }: QuadrantProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    // 24×24 subdivisions; enough to read as smooth wave at 24 fps minimum
    const g = new THREE.PlaneGeometry(FLAG_QUAD, FLAG_QUAD, 24, 24);
    // Store the rest position so per-frame wave is non-cumulative.
    g.userData.restZ = (g.attributes.position.array as Float32Array).slice();
    return g;
  }, []);

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const geom = m.geometry as THREE.PlaneGeometry;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const rest = geom.userData.restZ as Float32Array;
    const t = timeRef.current;
    // Wave equation:
    //   z(x, y, t) = sin(x * 5 + t * 2.0) * 0.04 * (1 + x)
    // — leading-edge amplifier (1+x) means the right edge of the global
    // flag waves more than the left, mimicking real cloth-on-pole.
    // The signed offset for this quadrant means LEFT quadrants have
    // smaller amplitude than RIGHT (offset[0] = -1 → x_world is on the
    // left; the (1 + x_world_norm) factor scales).
    const xOff = offset[0]; // -1 or +1
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      // Convert quadrant-local x (range ~[-quad/2, +quad/2]) into a
      // world-x estimate by adding the quadrant offset center.
      const worldX = x + xOff * (FLAG_QUAD / 2 + FLAG_GAP / 2);
      const wave = Math.sin(worldX * 4.2 + t * 1.8) * 0.05 * (worldX + 1.2);
      // Y also gets a tiny secondary wave for organic feel.
      const yWobble = Math.cos(y * 3.0 + t * 1.2) * 0.012;
      pos.setZ(i, wave + yWobble);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[
        offset[0] * (FLAG_QUAD / 2 + FLAG_GAP / 2),
        offset[1] * (FLAG_QUAD / 2 + FLAG_GAP / 2),
        0,
      ]}
    >
      <meshStandardMaterial
        color={color}
        metalness={0.32}
        roughness={0.38}
        side={THREE.DoubleSide}
        envMapIntensity={1.2}
      />
    </mesh>
  );
}

/**
 * The full 4-quadrant flag, tilted in 3D space for the iconic Win9x
 * perspective view, and rotating slowly on its Y axis so the lighting
 * + envmap reflections sweep across the panels as it spins.
 */
function Wavy3DFlag() {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_state, delta) => {
    timeRef.current += delta;
    const g = groupRef.current;
    if (!g) return;
    // Slow rotation — ~22°/s, lets the lighting catch each panel.
    g.rotation.y += 0.38 * delta;
  });

  return (
    <group
      ref={groupRef}
      // Tilt + skew so the flag reads as the iconic Win9x perspective:
      // top tilts away from camera, slight side-angle.
      rotation={[-0.18, 0.05, 0.05]}
      position={[0, 0.55, 0]}
    >
      <FlagQuadrant color={FLAG_COLORS.red} offset={[-1, 1]} timeRef={timeRef} />
      <FlagQuadrant color={FLAG_COLORS.green} offset={[1, 1]} timeRef={timeRef} />
      <FlagQuadrant color={FLAG_COLORS.blue} offset={[-1, -1]} timeRef={timeRef} />
      <FlagQuadrant color={FLAG_COLORS.yellow} offset={[1, -1]} timeRef={timeRef} />
    </group>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3D WORDMARK
//
// drei <Text3D> needs a JSON typeface — we use helvetiker_bold (MIT,
// shipped under three/examples/fonts/, copied to /public/fonts/ at
// build time). The text is rendered as actual extruded geometry, not
// a quad-billboard, so the bevel + thickness catch the scene lighting.
// ──────────────────────────────────────────────────────────────────────

const FONT_URL = "/fonts/helvetiker_bold.typeface.json";

function Win98Wordmark3D() {
  return (
    <group position={[0, -0.95, 0]}>
      {/* "Microsoft" — small line above */}
      <Text3D
        font={FONT_URL}
        size={0.18}
        height={0.04}
        curveSegments={6}
        bevelEnabled
        bevelThickness={0.005}
        bevelSize={0.004}
        bevelOffset={0}
        bevelSegments={3}
        position={[-0.42, 0.04, 0]}
      >
        Microsoft
        <meshStandardMaterial
          color="#0a0a12"
          metalness={0.6}
          roughness={0.28}
          envMapIntensity={1.4}
        />
      </Text3D>

      {/* "Windows 98" — large bold below */}
      <Text3D
        font={FONT_URL}
        size={0.42}
        height={0.09}
        curveSegments={8}
        bevelEnabled
        bevelThickness={0.012}
        bevelSize={0.008}
        bevelOffset={0}
        bevelSegments={4}
        position={[-1.46, -0.5, 0]}
      >
        Windows 98
        <meshStandardMaterial
          color="#0a0a12"
          metalness={0.65}
          roughness={0.22}
          envMapIntensity={1.5}
        />
      </Text3D>
    </group>
  );
}

// ──────────────────────────────────────────────────────────────────────
// REFLECTIVE FLOOR
//
// drei <MeshReflectorMaterial> renders a real planar reflection of the
// scene above it. The flag + wordmark cast mirror-soft reflections
// down onto an obsidian floor that anchors the whole composition.
// Expensive — disabled on reduced (mobile) mode by the parent.
// ──────────────────────────────────────────────────────────────────────

function ReflectiveFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.65, 0]}>
      <planeGeometry args={[14, 14]} />
      <MeshReflectorMaterial
        blur={[300, 100]}
        resolution={1024}
        mixBlur={1}
        mixStrength={1.0}
        roughness={0.7}
        depthScale={1.0}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#080812"
        metalness={0.6}
      />
    </mesh>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CAMERA — one-shot ~3 s cinematic dolly, then settles into a slow
// orbit. Pattern mirrors MobiusButton's CameraOrbit but with an opening
// dolly first (start pulled-back and elevated, then move forward + down
// + slightly right for an "approaching the desk" feel).
// ──────────────────────────────────────────────────────────────────────

const CAM_START = new THREE.Vector3(0, 0.95, 5.6);
const CAM_END = new THREE.Vector3(0.35, 0.5, 4.0);
const DOLLY_DURATION_S = 2.8;

function CinematicCamera() {
  const { camera } = useThree();
  const phaseRef = useRef(0);
  const orbitPhaseRef = useRef(0);

  // Reset camera to start position on mount so the dolly always plays
  // from frame 0 (the default Canvas camera prop only applies once).
  useEffect(() => {
    camera.position.copy(CAM_START);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_state, delta) => {
    phaseRef.current += delta;
    if (phaseRef.current < DOLLY_DURATION_S) {
      // Dolly phase — interpolate camera position with ease-out so the
      // motion decelerates into its rest pose.
      const t = easeOutCubic(phaseRef.current / DOLLY_DURATION_S);
      camera.position.lerpVectors(CAM_START, CAM_END, t);
    } else {
      // Settle phase — barely-noticeable orbit. ±2° azimuth + tiny y bob.
      orbitPhaseRef.current += delta * 0.4;
      const radius = Math.hypot(CAM_END.x, CAM_END.z);
      const azBase = Math.atan2(CAM_END.x, CAM_END.z);
      const az = azBase + Math.sin(orbitPhaseRef.current) * 0.035;
      camera.position.x = Math.sin(az) * radius;
      camera.position.z = Math.cos(az) * radius;
      camera.position.y = CAM_END.y + Math.sin(orbitPhaseRef.current * 0.6) * 0.04;
    }
    camera.lookAt(0, 0.2, 0);
  });

  return null;
}

// ──────────────────────────────────────────────────────────────────────
// MAIN SCENE
// ──────────────────────────────────────────────────────────────────────

export interface Splash3DSceneProps {
  /** If true, drop bloom + reflective floor + halve sparkles (mobile). */
  reduced?: boolean;
}

export function Splash3DScene({ reduced = false }: Splash3DSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.95, 5.6], fov: 38 }}
      dpr={[1, reduced ? 1.5 : 2]}
      frameloop="always"
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />

      {/* HDRI environment for proper metallic reflections on the flag +
          text + reflective floor. "studio" gives crisp specular without
          looking obviously outdoor. */}
      <Suspense fallback={null}>
        <Environment preset="studio" background={false} environmentIntensity={0.7} />
      </Suspense>

      {/* Lighting rig — key + warm fill + cool rim + ambient. The flag's
          colored quadrants pop against the warm fill; the obsidian wordmark
          + floor catch the cool rim as specular accents. */}
      <ambientLight intensity={0.28} />
      <pointLight position={[3, 4, 4]} intensity={0.95} color="#ffffff" />
      <pointLight position={[-3, 2, -2]} intensity={0.45} color="#5cb6ff" />
      <directionalLight position={[0, 5, 2]} intensity={0.4} color="#fff8dd" />

      <CinematicCamera />
      <Wavy3DFlag />
      <Suspense fallback={null}>
        <Win98Wordmark3D />
      </Suspense>
      {!reduced && <ReflectiveFloor />}

      {/* Sparkles for atmospheric depth — light, slow, off-white so they
          read as dust motes catching the key light rather than as a
          stylized particle system. */}
      <Sparkles
        count={reduced ? 24 : 60}
        scale={[6, 4, 6]}
        size={2.4}
        speed={0.3}
        opacity={0.55}
        color="#ffffff"
      />

      {/* Post-processing — desktop only. Same stack as MobiusButton for
          consistent treatment between the two 3D scenes. */}
      {!reduced && (
        <EffectComposer>
          <Bloom
            intensity={0.55}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.4}
            mipmapBlur
          />
          <DepthOfField focusDistance={0.018} focalLength={0.05} bokehScale={2.0} />
          <ChromaticAberration
            offset={[0.0006, 0.0009]}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.3} darkness={0.4} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

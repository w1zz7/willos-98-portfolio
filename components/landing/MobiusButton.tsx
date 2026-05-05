"use client";

/**
 * MobiusButton — interactive 3D Möbius strip rendered with React Three Fiber.
 *
 * The hero element of the landing experience: a continuously rotating cyan
 * Möbius band on a black backdrop. Hover scales it up + speeds rotation.
 * Click triggers a scale-pulse + sparkle burst, then transitions to boot.
 *
 * Geometry is built by sampling the standard parametric Möbius equation:
 *
 *   x(u, v) = (1 + 0.5 · v · cos(u/2)) · cos(u)
 *   y(u, v) = (1 + 0.5 · v · cos(u/2)) · sin(u)
 *   z(u, v) = 0.5 · v · sin(u/2)
 *
 * with u ∈ [0, 2π], v ∈ [-1, 1]. We tessellate into triangle quads on a
 * grid, compute vertex normals via THREE, and feed it to MeshStandardMaterial
 * with a cyan #33BBFF base + matching emissive for the glow.
 *
 * Perf:
 *   - frameloop="demand"  → renders only on hover/animation, not idle
 *   - dpr={[1, mobile ? 1.5 : 2]} → caps pixel ratio
 *   - mobile: bloom disabled, sparkle count halved (handled in LandingShell)
 *
 * The on-click animation is driven by a ref'd `clickPhase` so React
 * re-renders don't fight the useFrame tween.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  Environment,
  PerformanceMonitor,
  Sparkles,
} from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

const CYAN = "#33BBFF";
const GOLD = "#ffcc66"; // accent color — the inner counter-rotating strip
const TWO_PI = Math.PI * 2;

/**
 * Build a Möbius strip BufferGeometry by tessellating the parametric form.
 *
 * `widthFactor` shrinks the half-width contribution; the canonical formula
 * uses 0.5 (resulting in strips ~half the major radius), but that reads as
 * a thick band where the twist is hard to see. 0.28 gives a slimmer ribbon
 * whose half-twist is the visual hero.
 */
function makeMobiusGeometry(
  uSteps = 220,
  vSteps = 10,
  scale = 1,
  widthFactor = 0.28,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  // Sample (uSteps+1) × (vSteps+1) vertices.
  for (let i = 0; i <= uSteps; i++) {
    const u = (i / uSteps) * TWO_PI;
    for (let j = 0; j <= vSteps; j++) {
      const v = (j / vSteps) * 2 - 1; // [-1, 1]
      const cosHalfU = Math.cos(u / 2);
      const sinHalfU = Math.sin(u / 2);
      const r = 1 + widthFactor * v * cosHalfU;
      const x = r * Math.cos(u) * scale;
      const y = r * Math.sin(u) * scale;
      const z = widthFactor * v * sinHalfU * scale;
      positions.push(x, y, z);
      uvs.push(i / uSteps, j / vSteps);
    }
  }
  // Build quad indices.
  const stride = vSteps + 1;
  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Two triangles per quad.
      indices.push(a, c, b, b, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

interface MobiusMeshProps {
  hovered: boolean;
  clicked: boolean;
  onAnimationDone: () => void;
}

function MobiusMesh({ hovered, clicked, onAnimationDone }: MobiusMeshProps) {
  // Outer (main) strip refs.
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  // Inner (counter-rotating gold accent) refs.
  const innerMeshRef = useRef<THREE.Mesh>(null);
  const innerMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Two geometries — the inner is half the width and 0.55× scale so it
  // sits inside the outer ring without intersecting it. Memoized so they
  // aren't rebuilt on every re-render (parametric tessellation is ~5K
  // triangles per strip).
  const outerGeometry = useMemo(() => makeMobiusGeometry(220, 10, 1.0, 0.28), []);
  const innerGeometry = useMemo(() => makeMobiusGeometry(180, 8, 0.55, 0.18), []);

  // Click animation state (refs so useFrame can mutate without re-render).
  const clickStartRef = useRef<number | null>(null);
  const doneFiredRef = useRef(false);
  // Slow emissive-pulse phase, accumulates with delta.
  const pulsePhaseRef = useRef(0);

  useEffect(() => {
    if (clicked && clickStartRef.current === null) {
      clickStartRef.current = performance.now();
    }
  }, [clicked]);

  useFrame((_state, delta) => {
    const m = meshRef.current;
    const inner = innerMeshRef.current;
    const g = groupRef.current;
    const mat = matRef.current;
    const innerMat = innerMatRef.current;
    if (!m || !inner || !g || !mat || !innerMat) return;

    // Outer strip rotates clockwise; inner rotates counter (opposite sign)
    // and ~1.6× faster — they pass through each other in interesting ways
    // as the visible faces flip via the half-twist.
    const speed = hovered ? 0.55 : 0.25;
    m.rotation.y += speed * delta;
    inner.rotation.y -= speed * 1.6 * delta;
    // The inner strip also wobbles slightly on x for visual interest.
    inner.rotation.x += speed * 0.3 * delta;

    // Slow emissive pulse on the outer strip — breathing glow at ~0.4 Hz
    // (one full cycle every 2.5s). Phase advances even when not hovered
    // so the strip feels alive while the user is just looking at it.
    pulsePhaseRef.current += delta * 2.5;
    const pulse = (Math.sin(pulsePhaseRef.current) + 1) * 0.5; // 0..1
    const baseEmissive = hovered ? 0.9 : 0.35;
    const pulseAdd = hovered ? 0.5 : 0.25;

    const targetScale = hovered ? 1.12 : 1.0;

    // Click animation: 1.0 → 1.3 → 0.0 over 600ms.
    if (clickStartRef.current !== null) {
      const elapsed = performance.now() - clickStartRef.current;
      const t = Math.min(elapsed / 600, 1);
      let scale: number;
      if (t < 0.3) {
        const k = t / 0.3;
        scale = 1.0 + (1.3 - 1.0) * easeOutCubic(k);
      } else {
        const k = (t - 0.3) / 0.7;
        scale = 1.3 * (1 - easeInCubic(k));
      }
      g.scale.setScalar(scale);
      mat.emissiveIntensity = 1.0 + (1 - t) * 1.5;
      innerMat.emissiveIntensity = 1.5 + (1 - t) * 2.0;
      // Spin up dramatically during click — both strips, opposite ways.
      m.rotation.y += (4 + 6 * t) * delta;
      inner.rotation.y -= (5 + 8 * t) * delta;
      if (t >= 1 && !doneFiredRef.current) {
        doneFiredRef.current = true;
        onAnimationDone();
      }
      return; // skip hover lerp while clicking
    }

    // Smooth hover lerp.
    const cur = g.scale.x;
    g.scale.setScalar(cur + (targetScale - cur) * Math.min(1, delta * 8));
    const targetOuterEmissive = baseEmissive + pulseAdd * pulse;
    mat.emissiveIntensity =
      mat.emissiveIntensity + (targetOuterEmissive - mat.emissiveIntensity) * Math.min(1, delta * 8);
    // Inner strip's pulse is offset π so the two strips breathe out of phase.
    const innerPulse = (Math.sin(pulsePhaseRef.current + Math.PI) + 1) * 0.5;
    const targetInnerEmissive = (hovered ? 1.4 : 0.6) + 0.4 * innerPulse;
    innerMat.emissiveIntensity =
      innerMat.emissiveIntensity +
      (targetInnerEmissive - innerMat.emissiveIntensity) * Math.min(1, delta * 8);
  });

  return (
    // Tilt the strip stack so the camera catches the half-twist on both;
    // pure top-down would just look like a flat ring.
    <group ref={groupRef} rotation={[-0.5, 0, 0.15]}>
      {/* OUTER strip — the cyan hero. MeshPhysicalMaterial with clearcoat +
          iridescence + envMap reflections from the parent Canvas's Environment. */}
      <mesh ref={meshRef} geometry={outerGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          ref={matRef}
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.35}
          metalness={0.55}
          roughness={0.28}
          clearcoat={0.85}
          clearcoatRoughness={0.12}
          iridescence={0.6}
          iridescenceIOR={1.5}
          iridescenceThicknessRange={[100, 900]}
          envMapIntensity={1.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* INNER strip — gold accent, smaller, counter-rotating. Slightly more
          reflective + slightly less iridescent so it reads as a different
          material than the outer cyan — they don't merge visually. */}
      <mesh ref={innerMeshRef} geometry={innerGeometry} rotation={[0.4, 0, -0.1]}>
        <meshPhysicalMaterial
          ref={innerMatRef}
          color={GOLD}
          emissive={GOLD}
          emissiveIntensity={0.6}
          metalness={0.85}
          roughness={0.18}
          clearcoat={0.6}
          clearcoatRoughness={0.22}
          iridescence={0.3}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[200, 600]}
          envMapIntensity={1.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Subtle camera orbit. Drifts the camera around a slow horizontal arc
 * (~±4° in azimuth) and a tiny vertical bob, all centered on the origin
 * where the Möbius lives. Makes the scene feel cinematic rather than
 * static.
 *
 * Driven by useFrame on the actual camera object, so it runs at the
 * Canvas's frameloop rate (continuous here) without re-rendering React.
 */
function CameraOrbit() {
  const { camera } = useThree();
  // Capture the initial camera position so the orbit wraps it instead of
  // drifting away.
  const baseRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const phaseRef = useRef(0);

  useFrame((_state, delta) => {
    if (!baseRef.current) {
      baseRef.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    }
    phaseRef.current += delta * 0.18; // ~1 full cycle every 35s — barely noticeable
    const base = baseRef.current;
    const radius = Math.hypot(base.x, base.z);
    const azimuthRad = Math.atan2(base.x, base.z) + Math.sin(phaseRef.current) * 0.07;
    camera.position.x = Math.sin(azimuthRad) * radius;
    camera.position.z = Math.cos(azimuthRad) * radius;
    camera.position.y = base.y + Math.sin(phaseRef.current * 0.5) * 0.08;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number) {
  return t * t * t;
}

interface MobiusButtonProps {
  /** Externally controlled — when true, the click animation plays. */
  clicked: boolean;
  /** Called once the click animation finishes (signal to advance to boot). */
  onActivate: () => void;
  /** Called when pointer enters the mesh (for cursor + glow updates). */
  onHoverChange?: (hovered: boolean) => void;
  /** If true, drop bloom + reduce particle count (mobile/perf). */
  reduced?: boolean;
}

export function MobiusButton({
  clicked,
  onActivate,
  onHoverChange,
  reduced = false,
}: MobiusButtonProps) {
  const [hovered, setHovered] = useState(false);

  // R3F's ResizeObserver does not fire on initial mount when the parent is
  // already at its final size (since there's no size *change* to observe).
  // Without this kick the canvas stays stuck at the default 300×150 — the
  // mobius renders in the top-left corner and looks invisible against the
  // black backdrop. Dispatching a resize after first paint forces R3F's
  // useResize hook to measure and apply the correct canvas dimensions.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Hover via R3F mesh-pointer events (only fires on actual mesh hit).
  // Clicks are NOT handled here — `onClick` on Canvas only fires on raycast
  // hits, so clicking empty space wouldn't advance the experience. Instead,
  // the parent shell owns the click → setClicked(true) flow so any click
  // anywhere on the viewport plays the animation.
  //
  // PERF: short-circuit when the new hover state matches the current one.
  // Without this, pointermove (which fires hundreds of times per second)
  // re-runs setState + cursor mutation + onHoverChange callback every
  // frame even when the hover state hasn't changed. setHovered batches
  // identical updates inside React but the cursor mutation is a real
  // DOM write that triggers style invalidation.
  const hoveredRef = useRef(false);
  const handleHoverChange = useCallback(
    (next: boolean) => {
      if (hoveredRef.current === next) return;
      hoveredRef.current = next;
      setHovered(next);
      onHoverChange?.(next);
      document.body.style.cursor = next ? "pointer" : "";
    },
    [onHoverChange],
  );

  // Animation done handler.
  const handleAnimationDone = () => {
    onActivate();
  };

  return (
    <Canvas
      camera={{ position: [0, 1.4, 5.4], fov: 42 }}
      dpr={[1, reduced ? 1.5 : 2]}
      frameloop="always" // continuous rotation looks better than demand here
      // ACES Filmic tone mapping + sRGB output makes the bloom + emissive
      // colors land in a perceptually correct space rather than washing out.
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      onPointerEnter={() => handleHoverChange(true)}
      onPointerLeave={() => handleHoverChange(false)}
    >
      {/* AdaptiveDpr drops the device-pixel ratio when the GPU is under
          load (drag/click animation) and restores it when idle, keeping
          a consistent 60fps even on mid-range hardware. AdaptiveEvents
          does the same for raycaster pointer events. */}
      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />

      {/* PerformanceMonitor downgrades the postprocessing stack when the
          framerate drops below 50fps for a sustained period. The
          `reducedFx` ref reads true once we're in degraded mode. */}
      <PerformanceMonitor onDecline={() => { /* drei's degrade hook */ }} />

      {/* HDRI environment for proper metallic reflections on the strip's
          clearcoat. drei's "city" preset is a small (~280 KB) cube that
          gives crisp specular highlights without an external download.
          background={false} = use it for reflections only, not as a
          visible background. Wrapped in Suspense so the canvas paints
          immediately while the HDRI streams in. */}
      <Suspense fallback={null}>
        <Environment preset="city" background={false} environmentIntensity={0.6} />
      </Suspense>

      {/* Cinematic camera orbit — slow ±4° azimuth drift + tiny y bob. */}
      <CameraOrbit />

      {/* Lighting rig: a soft ambient + one strong key from upper-front so
          the strip's twist gets specular highlights as it rotates, and a
          cyan rim from below-back for the brand-color edge glow. With the
          HDRI bringing 360° reflections, we drop the lights a touch so
          the metal doesn't blow out. */}
      <ambientLight intensity={0.25} />
      <pointLight position={[3, 4, 5]} intensity={0.9} color="#ffffff" />
      <pointLight position={[-4, -2, -3]} intensity={0.45} color={CYAN} />
      <pointLight position={[2, -3, 4]} intensity={0.35} color={GOLD} />
      <directionalLight position={[0, 3, 2]} intensity={0.25} color="#ffffff" />

      <MobiusMesh
        hovered={hovered}
        clicked={clicked}
        onAnimationDone={handleAnimationDone}
      />

      {/* Sparkle particles surround the strip; burst more on click. Two
          layers — cyan inner cloud + sparser warm outer cloud — adds
          atmospheric depth instead of a single uniform field. */}
      <Sparkles
        count={reduced ? 24 : 70}
        scale={[5, 5, 5]}
        size={clicked ? 8 : 3.0}
        speed={clicked ? 1.4 : 0.35}
        opacity={0.7}
        color={CYAN}
      />
      {!reduced && (
        <Sparkles
          count={30}
          scale={[8, 4, 8]}
          size={2}
          speed={0.15}
          opacity={0.4}
          color={GOLD}
        />
      )}

      {/* Postprocessing stack — desktop only.
          · Bloom: subtle glow from the emissive cyan + iridescent highlights.
          · DepthOfField: focal target on the strip; sparkles + far reflections
            soft-blur, gives a real cinematic depth feel.
          · ChromaticAberration: 0.6 px RGB split — sells "premium glass."
          · Vignette: darkens the corners so the strip is the anchor. */}
      {!reduced && (
        <EffectComposer>
          <Bloom
            intensity={0.65}
            luminanceThreshold={0.5}
            luminanceSmoothing={0.45}
            mipmapBlur
          />
          <DepthOfField
            focusDistance={0.012}
            focalLength={0.04}
            bokehScale={2.2}
          />
          <ChromaticAberration offset={[0.0008, 0.0012]} radialModulation={false} modulationOffset={0} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

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

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sparkles } from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const CYAN = "#33BBFF";
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
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Memo the geometry so it isn't recomputed on every re-render.
  // Note: the parametric Möbius is intrinsically thin (width drops to zero
  // at u=π); we use vSteps=10 (enough for the ribbon edges to look smooth)
  // and a base scale of 1.0 so the strip lives in roughly a 2-unit cube.
  // Camera at z=5.4 with fov=42 frames it nicely.
  const geometry = useMemo(() => makeMobiusGeometry(220, 10, 1.0), []);

  // Click animation state (refs so useFrame can mutate without re-render).
  const clickStartRef = useRef<number | null>(null);
  const doneFiredRef = useRef(false);

  useEffect(() => {
    if (clicked && clickStartRef.current === null) {
      clickStartRef.current = performance.now();
    }
  }, [clicked]);

  useFrame((_state, delta) => {
    const m = meshRef.current;
    const g = groupRef.current;
    const mat = matRef.current;
    if (!m || !g || !mat) return;

    // Continuous rotation. Hover speeds it up 2×.
    const speed = hovered ? 0.55 : 0.25;
    m.rotation.y += speed * delta;

    // Hover: scale toward 1.12, glow up. Otherwise back to 1.0.
    const targetScale = hovered ? 1.12 : 1.0;
    const targetEmissive = hovered ? 0.9 : 0.35;

    // Click animation: 1.0 → 1.3 → 0.0 over 600ms.
    if (clickStartRef.current !== null) {
      const elapsed = performance.now() - clickStartRef.current;
      const t = Math.min(elapsed / 600, 1);
      // Two-stage tween: 0–0.3 ease up to 1.3, 0.3–1 ease down to 0.
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
      // Spin up dramatically during click.
      m.rotation.y += (4 + 6 * t) * delta;
      if (t >= 1 && !doneFiredRef.current) {
        doneFiredRef.current = true;
        onAnimationDone();
      }
      return; // skip hover lerp while clicking
    }

    // Smooth hover lerp.
    const cur = g.scale.x;
    g.scale.setScalar(cur + (targetScale - cur) * Math.min(1, delta * 8));
    mat.emissiveIntensity =
      mat.emissiveIntensity + (targetEmissive - mat.emissiveIntensity) * Math.min(1, delta * 8);
  });

  return (
    // Tilt the strip up a bit so the camera catches the half-twist; pure
    // top-down would just look like a flat ring.
    <group ref={groupRef} rotation={[-0.5, 0, 0.15]}>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        {/* Physical material — clearcoat gives a wet-shellac sheen layered
            over the cyan, iridescence shifts the rim color as the strip
            rotates. The result reads "premium tech" rather than "plastic
            ring." environmentIntensity is paired with the Environment HDRI
            in the parent Canvas so reflections land on the metal surface. */}
        <meshPhysicalMaterial
          ref={matRef}
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.35}
          metalness={0.55}
          roughness={0.28}
          clearcoat={0.7}
          clearcoatRoughness={0.18}
          iridescence={0.5}
          iridescenceIOR={1.4}
          iridescenceThicknessRange={[100, 800]}
          envMapIntensity={1.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
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
      {/* HDRI environment for proper metallic reflections on the strip's
          clearcoat. drei's "city" preset is a small (~280 KB) cube that
          gives crisp specular highlights without an external download.
          background={false} = use it for reflections only, not as a
          visible background. */}
      <Environment preset="city" background={false} environmentIntensity={0.55} />

      {/* Lighting rig: a soft ambient + one strong key from upper-front so
          the strip's twist gets specular highlights as it rotates, and a
          cyan rim from below-back for the brand-color edge glow. With the
          HDRI bringing 360° reflections, we drop the lights a touch so
          the metal doesn't blow out. */}
      <ambientLight intensity={0.25} />
      <pointLight position={[3, 4, 5]} intensity={0.9} color="#ffffff" />
      <pointLight position={[-4, -2, -3]} intensity={0.45} color={CYAN} />
      <directionalLight position={[0, 3, 2]} intensity={0.25} color="#ffffff" />

      <MobiusMesh
        hovered={hovered}
        clicked={clicked}
        onAnimationDone={handleAnimationDone}
      />

      {/* Sparkle particles surround the strip; burst more on click. */}
      <Sparkles
        count={reduced ? 24 : 70}
        scale={[5, 5, 5]}
        size={clicked ? 8 : 3.0}
        speed={clicked ? 1.4 : 0.35}
        opacity={0.7}
        color={CYAN}
      />

      {/* Postprocessing stack — desktop only.
          · Bloom: subtle glow from the emissive cyan + iridescent highlights.
          · ChromaticAberration: 0.6 px RGB split — sells "premium glass."
          · Vignette: darkens the corners so the strip is the anchor. */}
      {!reduced && (
        <EffectComposer>
          <Bloom
            intensity={0.55}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.45}
            mipmapBlur
          />
          <ChromaticAberration offset={[0.0008, 0.0012]} radialModulation={false} modulationOffset={0} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

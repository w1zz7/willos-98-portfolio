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
import { Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const CYAN = "#33BBFF";
const TWO_PI = Math.PI * 2;

/** Build a Möbius strip BufferGeometry by tessellating the parametric form. */
function makeMobiusGeometry(uSteps = 180, vSteps = 16, scale = 1): THREE.BufferGeometry {
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
      const r = 1 + 0.5 * v * cosHalfU;
      const x = r * Math.cos(u) * scale;
      const y = r * Math.sin(u) * scale;
      const z = 0.5 * v * sinHalfU * scale;
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
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Memo the geometry so it isn't recomputed on every re-render.
  const geometry = useMemo(() => makeMobiusGeometry(180, 16, 1.05), []);

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
    const speed = hovered ? 0.45 : 0.2;
    m.rotation.y += speed * delta;
    m.rotation.x += 0.05 * delta; // slight wobble

    // Hover: scale toward 1.1, glow up. Otherwise back to 1.0.
    const targetScale = hovered ? 1.1 : 1.0;
    const targetEmissive = hovered ? 1.3 : 0.7;

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
      mat.emissiveIntensity = 1.5 + (1 - t) * 1.5;
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
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.7}
          metalness={0.55}
          roughness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* A second, slightly larger ghost mesh in low-opacity for depth halo. */}
      <mesh geometry={geometry} scale={1.02}>
        <meshBasicMaterial color={CYAN} transparent opacity={0.08} side={THREE.DoubleSide} />
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
  /** Called once the click animation finishes (signal to advance to boot). */
  onActivate: () => void;
  /** If true, drop bloom + reduce particle count (mobile/perf). */
  reduced?: boolean;
}

export function MobiusButton({ onActivate, reduced = false }: MobiusButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  // Pointer handlers on the underlying Canvas wrapper, not the mesh, so the
  // entire viewport responds (matches the "click anywhere" feel).
  const handlePointerOver = () => {
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const handlePointerOut = () => {
    setHovered(false);
    document.body.style.cursor = "";
  };

  // Animation done handler.
  const handleAnimationDone = () => {
    onActivate();
  };

  return (
    <Canvas
      camera={{ position: [0, 0.6, 4.6], fov: 45 }}
      dpr={[1, reduced ? 1.5 : 2]}
      frameloop="always" // continuous rotation looks better than demand here
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={() => {
        if (!clicked) setClicked(true);
      }}
    >
      {/* Lighting rig: key (front) + rim (back) for the glow halo. */}
      <ambientLight intensity={0.35} />
      <pointLight position={[3, 4, 5]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-4, -2, -3]} intensity={0.7} color={CYAN} />
      <directionalLight position={[0, 3, 2]} intensity={0.4} color={CYAN} />

      <MobiusMesh
        hovered={hovered}
        clicked={clicked}
        onAnimationDone={handleAnimationDone}
      />

      {/* Sparkle particles surround the strip; burst more on click. */}
      <Sparkles
        count={reduced ? 24 : 80}
        scale={[5, 5, 5]}
        size={clicked ? 8 : 3.5}
        speed={clicked ? 1.4 : 0.4}
        opacity={0.85}
        color={CYAN}
      />

      {/* Bloom postprocessing — desktop only. */}
      {!reduced && (
        <EffectComposer>
          <Bloom
            intensity={1.05}
            luminanceThreshold={0.08}
            luminanceSmoothing={0.4}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}

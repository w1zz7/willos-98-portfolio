/**
 * Tiny shared easing helpers for the landing-stage 3D scenes.
 *
 * Both `MobiusButton.tsx` (the standalone landing) and
 * `Splash3DScene.tsx` (the Win98 splash) drive useFrame-based
 * animations and need the same eased curves for click pulses, camera
 * dollies, and emissive lerps. Extracted to keep the two scenes
 * visually consistent without copy-pasted math.
 */

/** Decelerating curve — fast at start, slow at end. Use for "rise" motions. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Accelerating curve — slow at start, fast at end. Use for "fall" motions. */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/** Symmetric S-curve — slow at both ends, fast in the middle. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

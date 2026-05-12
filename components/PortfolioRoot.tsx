"use client";

import { Desktop } from "@/components/wm/Desktop";
import { MobilePortfolio } from "@/components/MobilePortfolio";
import { BootPlayback } from "@/components/landing/BootPlayback";
import { useWindowStore } from "@/lib/wm/store";
import { useBreakpoint } from "@/lib/wm/useMediaQuery";

/**
 * Renders the appropriate experience for the viewport, gated through the
 * `entryStage` state machine:
 *
 *   boot     → 2-stage Win98 boot playback (BIOS POST → 3D Mobius splash).
 *              The Mobius 3D scene mounts inside the splash so the visitor
 *              sees both period-correct Win98 chrome AND the hero 3D mesh
 *              in one frame. Skippable via ESC / click.
 *   desktop  → the actual experience for the viewport:
 *                - mobile (< 640px or too short): themed single-column scroll
 *                - tablet + desktop: Win98 windowed desktop
 *
 * The legacy "landing" stage (standalone Mobius button on black) was
 * retired; the 3D scene now lives inside the splash. The store still
 * carries the "landing" union member for back-compat but defaults to
 * "boot" so visitors never see the old landing.
 */
export function PortfolioRoot() {
  const stage = useWindowStore((s) => s.entryStage);
  const breakpoint = useBreakpoint();

  // Fallback: any leftover persisted "landing" value also drops to boot.
  if (stage === "boot" || stage === "landing") return <BootPlayback />;
  if (breakpoint === "mobile") return <MobilePortfolio />;
  return <Desktop />;
}

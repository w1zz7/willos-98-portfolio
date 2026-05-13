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
 *   boot     → Win98 boot playback (splash → bio → fade). The standalone
 *              Mobius landing AND the BIOS POST stage were both retired
 *              per user request — the recruiter drops straight into the
 *              3D Win98 splash. Skippable via ESC / click.
 *   desktop  → the actual experience for the viewport:
 *                - mobile (< 640px or too short): themed single-column scroll
 *                - tablet + desktop: Win98 windowed desktop
 *
 * "landing" remains in the EntryStage union for back-compat but routes
 * to BootPlayback alongside "boot" so any persisted "landing" value
 * from an older session still works.
 */
export function PortfolioRoot() {
  const stage = useWindowStore((s) => s.entryStage);
  const breakpoint = useBreakpoint();

  if (stage === "boot" || stage === "landing") return <BootPlayback />;
  if (breakpoint === "mobile") return <MobilePortfolio />;
  return <Desktop />;
}

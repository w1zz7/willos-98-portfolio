"use client";

import { Desktop } from "@/components/wm/Desktop";
import { MobilePortfolio } from "@/components/MobilePortfolio";
import { LandingShell } from "@/components/landing/LandingShell";
import { BootPlayback } from "@/components/landing/BootPlayback";
import { useWindowStore } from "@/lib/wm/store";
import { useBreakpoint } from "@/lib/wm/useMediaQuery";

/**
 * Renders the appropriate experience for the viewport, gated through the
 * `entryStage` state machine:
 *
 *   landing  → Mobius button on a black backdrop, awaiting first click.
 *              Plays on EVERY visit (no localStorage persistence).
 *   boot     → 4-stage Win98 boot playback (BIOS POST → splash → bio → fade).
 *              Skippable via ESC / click.
 *   desktop  → the actual experience for the viewport:
 *                - mobile (< 640px or too short): themed single-column scroll
 *                - tablet + desktop: Win98 windowed desktop
 *
 * The themed mobile view preserves the Excel / retro vocabulary without
 * forcing the window metaphor onto phones where it's unusable, but mobile
 * users still get the mobius landing + boot — they just land on the
 * MobilePortfolio shell after the boot fades.
 */
export function PortfolioRoot() {
  const stage = useWindowStore((s) => s.entryStage);
  const breakpoint = useBreakpoint();

  if (stage === "landing") return <LandingShell />;
  if (stage === "boot") return <BootPlayback />;
  if (breakpoint === "mobile") return <MobilePortfolio />;
  return <Desktop />;
}

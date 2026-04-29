"use client";

import { Desktop } from "@/components/wm/Desktop";
import { MobilePortfolio } from "@/components/MobilePortfolio";
import { useBreakpoint } from "@/lib/wm/useMediaQuery";

/**
 * Renders the appropriate experience for the viewport:
 *  - mobile (< 640px or too short): themed single-column scroll
 *  - tablet + desktop: Win98 windowed desktop
 *
 * The themed mobile view preserves the Excel / retro vocabulary without
 * forcing the window metaphor onto phones where it's unusable.
 */
export function PortfolioRoot() {
  const breakpoint = useBreakpoint();
  if (breakpoint === "mobile") return <MobilePortfolio />;
  return <Desktop />;
}

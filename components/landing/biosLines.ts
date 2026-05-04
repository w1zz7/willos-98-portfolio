/**
 * Static line data for the boot playback. Pure data, no React.
 *
 * Three buckets:
 *   BIOS_LINES        — Stage 1, green-on-black BIOS POST flavor
 *   BIO_LINES         — Stage 3, the "who is Will Zhang" intro
 *   SPLASH_DURATION_MS — Stage 2 ("Starting Windows 98") timing
 *
 * Each line carries an absolute `delayMs` from stage start. We stream them
 * in via setTimeout in `BootPlayback.tsx`. The willBB Markets Terminal
 * boot screen (`components/apps/willbb/BootScreen.tsx`) uses the same
 * shape — the cadence is proven to feel right.
 */

export interface BootLine {
  /** ms offset from the stage start. */
  delayMs: number;
  /** What to print after the timestamp + prompt prefix. */
  text: string;
  /** Status flavor — drives color: ok=green, info=cyan, warn=red, err=red. */
  status?: "ok" | "info" | "warn" | "err";
  /** If true, render a [ OK ] tick after the line. */
  ok?: boolean;
}

/* ------------------------------------------------------------------ */
/* Stage 1 — BIOS POST                                                */
/* Cadence: ~2400ms total                                             */
/* ------------------------------------------------------------------ */

export const BIOS_LINES: BootLine[] = [
  { delayMs: 0, text: "WillOS 98 BIOS v1.0  ·  (C) 2026 Will Zhang Industries", status: "info" },
  { delayMs: 180, text: "CPU: Drexel LeBow Quad-Core @ 4.0 GHz" },
  { delayMs: 320, text: "Memory test: 524,288 KB OK" },
  { delayMs: 480, text: "Detecting IDE devices ...", status: "info" },
  { delayMs: 640, text: "  Primary master:  BulletproofAI.exe  · 200k-resume ATS engine", ok: true },
  { delayMs: 780, text: "  Primary slave:   TheGoodIdeaFund.dat · $100k+ allocated", ok: true },
  { delayMs: 920, text: "Detecting USB devices ...", status: "info" },
  { delayMs: 1060, text: "  Found: Drexel Consulting Group → WOLF Financial (14.3M followers)", ok: true },
  { delayMs: 1200, text: "  Found: Google Developer Group · Primary Technical Lead", ok: true },
  { delayMs: 1340, text: "  Found: Drexel High Finance Program · Public Market cohort", ok: true },
  { delayMs: 1500, text: "Loading boot record from /dev/willos/main ...", status: "info" },
  { delayMs: 1700, text: "Verifying signature ... OK", ok: true },
  { delayMs: 1860, text: "Hand-off to Windows 98 boot manager ...", status: "info" },
];

/** Total Stage 1 duration: last delay + a brief final pause. */
export const BIOS_DURATION_MS = 2400;

/* ------------------------------------------------------------------ */
/* Stage 2 — "Starting Windows 98" splash                              */
/* ------------------------------------------------------------------ */

export const SPLASH_DURATION_MS = 2200;

/* ------------------------------------------------------------------ */
/* Stage 3 — Bio playback                                              */
/* Cadence: ~6000ms total, each line ~400ms apart                     */
/* ------------------------------------------------------------------ */

export const BIO_LINES: BootLine[] = [
  { delayMs: 0, text: "Hello — I'm Will Zhang", status: "info" },
  { delayMs: 400, text: "Drexel B.S. Business Administration · Analytics + Marketing" },
  { delayMs: 800, text: "GPA 4.0 · Dean's List · LeBow College of Business", ok: true },
  { delayMs: 1200, text: "Co-founder · Bulletproof AI · 75k+ tool runs / month", ok: true },
  { delayMs: 1600, text: "1st Place · Philly CodeFest 2026 · ~400 participants", ok: true },
  { delayMs: 2000, text: "Director of Relations · The Good Idea Fund" },
  { delayMs: 2400, text: "Primary Technical Lead · Google Developer Group" },
  { delayMs: 2800, text: "Sport Entertainment Consultant · Drexel Consulting Group" },
  { delayMs: 3200, text: "Public Market cohort · Drexel High Finance Program" },
  { delayMs: 3600, text: "Stock book: $315,020 processed · 64% G/L ratio", ok: true },
  { delayMs: 4000, text: "CNIPA Patent · Multi-Purpose Golf Bag · 2024", ok: true },
  { delayMs: 4400, text: "Former competitive junior golfer · US + China tours" },
  { delayMs: 4800, text: "All systems online — welcome to WillOS 98", status: "ok", ok: true },
];

/** Total Stage 3 duration: last delay + a final 400ms pause to let it sit. */
export const BIO_DURATION_MS = 5400;

/* ------------------------------------------------------------------ */
/* Stage 4 — fade to desktop                                           */
/* ------------------------------------------------------------------ */

export const FADE_DURATION_MS = 600;

/** Combined runtime if user lets the whole sequence play. */
export const TOTAL_BOOT_MS =
  BIOS_DURATION_MS + SPLASH_DURATION_MS + BIO_DURATION_MS + FADE_DURATION_MS;

/**
 * Static line data for the boot playback. Pure data, no React.
 *
 * Three buckets:
 *   BIOS_LINES        — Stage 1, green-on-black BIOS POST flavor
 *   BIO_LINES         — Stage 3, the "who am I" intro
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

/* Authentic Award/Phoenix BIOS POST cadence — header is rendered by the
 * stage component (BIOS string + Energy Star ally line + memory counter),
 * so these lines start AFTER the memory test settles. */
export const BIOS_LINES: BootLine[] = [
  { delayMs: 0, text: "Detecting Primary Master ...   BulletproofAI.exe", ok: true },
  { delayMs: 160, text: "Detecting Primary Slave  ...   TheGoodIdeaFund.dat", ok: true },
  { delayMs: 320, text: "Detecting Secondary Master ... GolfDataLab.dll", ok: true },
  { delayMs: 480, text: "Detecting Secondary Slave  ... WillBB-Markets.sys", ok: true },
  { delayMs: 640, text: "Floppy disk(s) check ............. None" },
  { delayMs: 800, text: "Plug & Play BIOS Extension v1.0A" },
  { delayMs: 960, text: "  PnP Init Completed" },
  { delayMs: 1120, text: "  Found: Drexel Consulting Group  -  WOLF Financial (14.3M followers)", ok: true },
  { delayMs: 1280, text: "  Found: Google Developer Group   -  Primary Technical Lead", ok: true },
  { delayMs: 1440, text: "  Found: Drexel High Finance Pgm  -  Public Market cohort", ok: true },
  { delayMs: 1620, text: "Verifying DMI Pool Data ............." },
  { delayMs: 1820, text: "Boot from CDROM : C:\\WIN98\\IO.SYS" },
];

/** Total Stage 1 duration: last delay + a brief final pause. */
export const BIOS_DURATION_MS = 2400;

/* ------------------------------------------------------------------ */
/* Stage 2 — "Starting Windows 98" splash                              */
/* ------------------------------------------------------------------ */

export const SPLASH_DURATION_MS = 2200;

/* ------------------------------------------------------------------ */
/* Stage 3 — Bio playback                                              */
/* Cadence: ~6000ms total                                             */
/*                                                                    */
/* Structure follows the user's template:                              */
/*   P1 — Identity + drive ("drawn to ...")                           */
/*   P2 — That thread runs through my work: 4 projects                */
/*   P3 — Previously: 3 orgs · Currently: ...                          */
/* ------------------------------------------------------------------ */

export const BIO_LINES: BootLine[] = [
  // — P1 — Identity + drive ————————————————————————
  {
    delayMs: 0,
    text: "Hello — I'm a sophomore at Drexel studying business administration (analytics + marketing)",
    status: "info",
  },
  { delayMs: 420, text: "GPA 4.0 · Dean's List · LeBow College of Business", ok: true },
  { delayMs: 840, text: "Drawn to messy, high-stakes domains —" },
  {
    delayMs: 1180,
    text: "building tools that turn noisy data into decisions someone can defend",
  },

  // — P2 — Work that demonstrates the thread ——————————
  { delayMs: 1700, text: "That thread runs through my work:", status: "info" },
  { delayMs: 2080, text: "an ATS engine that screens hiring at scale (Bulletproof AI)" },
  {
    delayMs: 2480,
    text: "a Bloomberg-style markets terminal with walk-forward backtesting (WillBB Markets Terminal)",
  },
  {
    delayMs: 2880,
    text: "a golf analytics lab modeling tour-level scoring under variance (Golf Data Lab)",
  },
  {
    delayMs: 3280,
    text: "and a personal stock book — $315,020 processed · 64% G/L ratio",
  },

  // — P3 — Previously + Currently ——————————————————
  {
    delayMs: 3780,
    text: "Previously: Drexel Consulting Group · Sport Entertainment Consultant",
  },
  { delayMs: 4180, text: "Google Developer Group · Primary Technical Lead" },
  {
    delayMs: 4580,
    text: "The Good Idea Fund · Director of Relations · $100k+ allocated",
  },
  {
    delayMs: 4980,
    text: "Currently · co-founder of Bulletproof AI · 1st Place Philly CodeFest 2026",
    status: "ok",
    ok: true,
  },
];

/** Total Stage 3 duration: last delay + a final 600ms pause to let it sit. */
export const BIO_DURATION_MS = 5600;

/* ------------------------------------------------------------------ */
/* Stage 4 — fade to desktop                                           */
/* ------------------------------------------------------------------ */

export const FADE_DURATION_MS = 600;

/** Combined runtime if user lets the whole sequence play. */
export const TOTAL_BOOT_MS =
  BIOS_DURATION_MS + SPLASH_DURATION_MS + BIO_DURATION_MS + FADE_DURATION_MS;

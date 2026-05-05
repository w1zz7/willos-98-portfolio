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
/*                                                                    */
/* Markdown-style **bold** markers wrap company / project names; the   */
/* renderer in BootPlayback.tsx parses these into <span> with weight   */
/* 700 so they jump out from the streaming log.                        */
/* ------------------------------------------------------------------ */

export const BIO_LINES: BootLine[] = [
  // — Identity + drive ————————————————————————————————————————
  {
    delayMs: 0,
    text: "Hello — I'm an undergrad at **Drexel University** majoring in Finance & MIS",
    status: "info",
  },
  {
    delayMs: 460,
    text: "Drawn to building tools that make life easier for people and businesses",
  },

  // — Projects ———————————————————————————————————————————————
  { delayMs: 1000, text: "That thread runs through my work:", status: "info" },
  {
    delayMs: 1380,
    text: "**Bulletproof AI** — career-prep platform with 11 AI tools",
  },
  {
    delayMs: 1760,
    text: "  ATS model trained on 200k resumes · 75k+ clicks in first month",
    ok: true,
  },
  {
    delayMs: 2200,
    text: "**PhilAIsion** — AI civic agent · 700+ city services via natural language",
  },
  {
    delayMs: 2580,
    text: "  1st Place · **Philly CodeFest 2026**",
    ok: true,
  },
  {
    delayMs: 3020,
    text: "Trading journal — $315,020 processed · 63.98% gain ratio",
    ok: true,
  },
  {
    delayMs: 3400,
    text: "Hardware Patent — co-invented a water-resistant golf bag",
    ok: true,
  },

  // — Work history ———————————————————————————————————————————
  { delayMs: 3880, text: "Work:", status: "info" },
  {
    delayMs: 4220,
    text: "**Super Lychee Golf Series** · operations · 10+ partners · improved retention",
  },
  {
    delayMs: 4560,
    text: "**Vovex Golf** · sales · $20k+ revenue",
  },
  {
    delayMs: 4900,
    text: "**Gen.G Esports** · operations analyst · 150+ tournaments",
  },
  {
    delayMs: 5240,
    text: "**The Good Idea Fund** · Director of Relations · $100k+ allocated",
  },
  {
    delayMs: 5580,
    text: "**WOLF Financial** / **Rallies.ai** · advising content for 14.3M followers",
  },
  {
    delayMs: 5920,
    text: "**Google Developer Group** · AI Technical Lead",
    status: "ok",
    ok: true,
  },
];

/** Total Stage 3 duration: last delay + a final 600ms pause to let it sit. */
export const BIO_DURATION_MS = 6600;

/* ------------------------------------------------------------------ */
/* Stage 4 — fade to desktop                                           */
/* ------------------------------------------------------------------ */

export const FADE_DURATION_MS = 600;

/** Combined runtime if user lets the whole sequence play. */
export const TOTAL_BOOT_MS =
  BIOS_DURATION_MS + SPLASH_DURATION_MS + BIO_DURATION_MS + FADE_DURATION_MS;

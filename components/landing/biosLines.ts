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

// Bumped from 2200 → 3500 ms when the splash gained a full 3D scene
// (Splash3DScene: wavy 3D flag + extruded 3D wordmark + reflective floor
// + cinematic camera dolly + bloom/DoF/CA/Vignette post-processing).
// The dolly itself takes ~2.8 s; we want the camera to land and the
// settled orbit to play for ~0.5 s before the bio takes over.
export const SPLASH_DURATION_MS = 3500;

/* ------------------------------------------------------------------ */
/* Stage 3 — WHO-IS-WILL.BAT (the "about me" terminal pane)            */
/*                                                                    */
/* This is the introductory paragraph — pure identity, not a resume.   */
/* Experience and project listings live elsewhere on the desktop      */
/* (Projects window, About Me window, Resume). This pane is just     */
/* "who is Will, in his own words" — full sentences, no bullets,    */
/* no headlines, no quantified credentials.                           */
/*                                                                    */
/* Markdown-style **bold** markers wrap key noun phrases the          */
/* BootPlayback renderer renders as <span style={fontWeight:700}>.    */
/* ------------------------------------------------------------------ */

export const BIO_LINES: BootLine[] = [
  {
    delayMs: 0,
    text: "Hello — my name is **Will Zhang**, and this is my portfolio.",
    status: "info",
  },
  {
    delayMs: 700,
    text: "I'm an undergraduate at **Drexel University** in Philadelphia, studying Finance and MIS.",
  },
  {
    delayMs: 1500,
    text: "I'm drawn to the intersection of markets, technology, and clear thinking.",
  },
  {
    delayMs: 2300,
    text: "I love building things that make a real difference for the people who use them.",
  },
  {
    delayMs: 3100,
    text: "I believe in working honestly, staying curious, and shipping work that actually matters.",
  },
  {
    delayMs: 3900,
    text: "Outside of school you'll usually find me trading, writing, or out on a golf course.",
  },
  {
    delayMs: 4700,
    text: "Thanks for stopping by — please take a look around.",
    status: "ok",
  },
];

/** Total Stage 3 duration: last delay + a final 700ms pause to let it sit. */
export const BIO_DURATION_MS = 5400;

/* ------------------------------------------------------------------ */
/* Stage 4 — fade to desktop                                           */
/* ------------------------------------------------------------------ */

export const FADE_DURATION_MS = 600;

/** Combined runtime if user lets the whole sequence play. */
export const TOTAL_BOOT_MS =
  BIOS_DURATION_MS + SPLASH_DURATION_MS + BIO_DURATION_MS + FADE_DURATION_MS;

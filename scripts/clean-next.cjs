#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * clean-next.cjs — wipe Next.js dev/build caches.
 *
 * Why this exists: `next dev` and `next build` both write to .next/, and if a
 * production build runs while a dev server is alive (or vice versa), the
 * webpack chunk graph gets corrupted. Symptom: the dev server starts emitting
 * "Cannot find module './331.js'" on every request and the page is just a
 * blank "Internal Server Error".
 *
 * Wired up as `predev` so every `npm run dev` starts on a clean slate. Also
 * exposed as `npm run clean` for manual recovery.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = [".next", ".turbo", "node_modules/.cache"];

let removed = 0;
for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true, force: true });
    removed += 1;
    console.log(`  removed ${rel}`);
  }
}
if (removed === 0) {
  // No-op on a fresh checkout; keep the script silent in that case so it
  // doesn't add noise to every dev start.
  process.exit(0);
}
console.log(`clean-next: removed ${removed} cache director${removed === 1 ? "y" : "ies"}`);

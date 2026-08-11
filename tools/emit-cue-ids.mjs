#!/usr/bin/env node
// tools/emit-cue-ids.mjs — scan assets/audio/*.mp3 and emit the CUE_IDS
// array literal for main.js.
//
// Root cause this addresses: when pool-driven composite cues (L2 make-ten
// intros, L3 step-by-step prompts, L4 step-by-step prompts, …) were added
// to the build pipeline, their IDs were never registered in
// `main.js::CUE_IDS`. Because `window.PandaAudio.audio` is built from
// CUE_IDS at boot (main.js:179-187), any cue not in the array is a silent
// no-op when `playSequence` / `playCue` is called — main.js:368-378 logs
// "[PandaAudio] cue '...' not loaded — chain continues silently". That's
// why L2 and L3 were completely silent in-game despite the mp3 files
// sitting in assets/audio/.
//
// This script is intentionally pool-agnostic: it scans the filesystem
// and emits whatever it finds, so a future pool-shape change (more
// rounds, different naming) can't silently leave a cue unregistered
// again. To pick up newly-built cues the user re-runs the script after
// `npm run audio:build`.
//
// Usage:
//   node tools/emit-cue-ids.mjs             # print to stdout
//   node tools/emit-cue-ids.mjs > out.txt  # capture for diff/merge
//
// Output format matches the existing CUE_IDS block in main.js:
//   - one quoted id per entry
//   - 6 ids per line (matches the existing line width)
//   - 2-space indent so it paste-aligns with the array literal
//
// The script does NOT modify main.js. That merge step is left to the
// user (or a follow-up tool) because the existing array also contains
// hand-maintained entries (enc-* / panda-* / game / n-*) that aren't
// derived from any manifest — those need to be preserved verbatim.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, "..", "assets", "audio");

if (!fs.existsSync(AUDIO_DIR)) {
  console.error(`audio dir missing: ${AUDIO_DIR}`);
  process.exit(2);
}

// Natural sort comparator — splits a string into alternating
// non-digit / digit runs and compares each pair numerically when both
// are digits. Without this the scan emits "n-16" before "n-2" because
// '1' < '2' lexicographically, which scrambles the merged diff.
function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const aParts = String(a).match(re) || [];
  const bParts = String(b).match(re) || [];
  const len = Math.min(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i], bp = bParts[i];
    const an = /^\d/.test(ap), bn = /^\d/.test(bp);
    if (an && bn) {
      const diff = Number(ap) - Number(bp);
      if (diff !== 0) return diff;
    } else {
      const diff = ap < bp ? -1 : ap > bp ? 1 : 0;
      if (diff !== 0) return diff;
    }
  }
  return aParts.length - bParts.length;
}

const ids = fs.readdirSync(AUDIO_DIR)
  .filter((f) => f.endsWith(".mp3"))
  .map((f) => f.slice(0, -".mp3".length))
  // Sort by the cue's semantic prefix (the part before the first digit
  // run) then by the embedded numbers ascending — keeps l1-intro-* before
  // l1-step2-* before l1-rwd-* and inside each group reads in math
  // order, which makes the merged diff readable.
  .sort((a, b) => {
    const stripDigits = (s) => s.replace(/-\d.*$/, "");
    const pa = stripDigits(a), pb = stripDigits(b);
    if (pa !== pb) return naturalCompare(pa, pb);
    return naturalCompare(a, b);
  });

console.log(`// scanned ${ids.length} mp3 files in ${path.relative(process.cwd(), AUDIO_DIR)}/`);
const PER_LINE = 6;
let out = "";
for (let i = 0; i < ids.length; i++) {
  if (i % PER_LINE === 0) {
    if (i > 0) out += ",\n";
    out += "  ";
  } else {
    out += ", ";
  }
  out += `"${ids[i]}"`;
}
console.log(out);
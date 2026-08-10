#!/usr/bin/env node
// tools/build-audio-tier-only.mjs — synthesize ONLY the 32 missing
// process-praise tier cues using edge-tts. The other ~1066 cues (numbers,
// greeting chunks, per-round composites, game intros) already have MP3s
// in assets/audio/.
//
// Why this exists: tools/build-audio-edge.mjs reads the full cues.cjs
// (96 entries) and regenerates everything, which would burn ~10 minutes
// of edge-tts API calls re-synthesizing cues that are already correct.
// This targeted script only synthesizes the cues whose MP3 is missing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const { default: CUES } = await import("./cues.cjs");

const VOICE = process.env.EDGE_VOICE || "zh-CN-XiaoxiaoNeural";
const RATE = process.env.EDGE_RATE || "+5%";
const OUT_DIR = path.join(ROOT, "assets", "audio");

// Tier cue id prefixes — these are the cues the 2026-08-10 praise rewrite
// added to cues.cjs but never had MP3s generated for. Without MP3s,
// playSequence starts the chain, play() silently fails, and `ended`
// never fires — leaving the advance gate stuck forever and the kid
// hearing nothing.
const TIER_PREFIXES = [
  "enc-first-",
  "enc-streak3-",
  "enc-streak5-",
  "enc-streak10-",
  "enc-level-",
  "enc-wrong-",
  "enc-near-",
  "enc-specific-",
  "panda-praise-",
  "panda-cheer-",
];

const missing = CUES.filter((c) => TIER_PREFIXES.some((p) => c.id.startsWith(p)));
console.log(`[edge-tts] tier-only  voice=${VOICE}  rate=${RATE}  cues=${missing.length}`);

let ok = 0;
let failed = 0;
for (const cue of missing) {
  const text = String(cue.text).replace(/[\r\n]+/g, " ").trim();
  const out = path.join(OUT_DIR, `${cue.id}.mp3`);
  // Don't overwrite if an MP3 already exists (caller may have
  // pre-generated one or wants to keep an older render).
  if (fs.existsSync(out)) {
    console.log(`  skip ${cue.id.padEnd(22)} (exists)`);
    continue;
  }
  try {
    execFileSync(
      "edge-tts",
      [
        "--voice", VOICE,
        "--rate", RATE,
        "--text", text,
        "--write-media", out,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const size = fs.statSync(out).size;
    if (size < 256) throw new Error(`only ${size} bytes — looks empty`);
    ok += 1;
    console.log(`  ok  ${cue.id.padEnd(22)} ${String(size).padStart(6)} B  ${text}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
}

console.log(`\n[edge-tts] ${ok}/${missing.length} tier cues generated (${failed} failed)`);
if (failed > 0) process.exit(1);
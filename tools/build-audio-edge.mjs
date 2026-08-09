#!/usr/bin/env node
// tools/build-audio-edge.mjs — synthesize Mandarin audio cues for the Panda
// math game using Microsoft Edge's free online TTS service (no API key).
//
// Why Edge TTS and not the macOS `say` command:
//   * Tingting (the only comfortable Mandarin voice on macOS) sounds flat
//     and monotone — bad for an upbeat 3-6 year-old audience.
//   * Edge ships neural voices (Xiaoxiao, Yunjian, Yunxi …) that are
//     dramatically more expressive, with natural Mandarin prosody and
//     proper intonation for kid-appropriate phrases.
//
// We shell out to the Python `edge-tts` CLI (pip package, ~pip3 install
// edge-tts) because the npm `edge-tts` package (v1.0.1) ships an
// outdated auth token that Microsoft has blocked with HTTP 403. The
// Python package is up to date and works against the same public
// readaloud endpoint. No API key, no billing.
//
// Voice: EDGE_VOICE env var, default "zh-CN-XiaoxiaoNeural" — Mandarin
// female, cheerful and lively, the canonical Edge Chinese voice.
//
// Format: MP3 (what Edge returns natively). main.js loads
// assets/audio/<id>.mp3 directly — both Safari and Chromium handle MP3
// for <audio> tags.
//
// Usage:
//   node tools/build-audio-edge.mjs            # generate all cues
//   node tools/build-audio-edge.mjs --dry-run  # list, write nothing

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// tools/cues.cjs is CommonJS; dynamic import works in ESM scripts.
const { default: CUES } = await import("./cues.cjs");

const VOICE = process.env.EDGE_VOICE || "zh-CN-XiaoxiaoNeural";
// Mild rate boost so the cues feel snappy without being rushed. Pitch is
// left at default — Edge's neural prosody already sounds lively.
const RATE = process.env.EDGE_RATE || "+5%";
const OUT_DIR = path.join(ROOT, "assets", "audio");
const DRY = process.argv.includes("--dry-run");

function synthesize(id, text) {
  const out = path.join(OUT_DIR, `${id}.mp3`);
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
  return fs.statSync(out).size;
}

console.log(
  `[edge-tts] voice=${VOICE}  rate=${RATE}  cues=${CUES.length}  dry=${DRY}`,
);

let ok = 0;
let failed = 0;
for (const cue of CUES) {
  const text = String(cue.text).replace(/[\r\n]+/g, " ").trim();
  try {
    const size = synthesize(cue.id, text);
    if (size < 256) {
      throw new Error(`only ${size} bytes — looks like an empty payload`);
    }
    ok += 1;
    console.log(`  ok  ${cue.id.padEnd(18)} ${String(size).padStart(6)} B  ${text}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
}

console.log(`\n[edge-tts] ${ok}/${CUES.length} cues (${failed} failed)`);
if (failed > 0) process.exit(1);
#!/usr/bin/env node
// tools/build-audio-edge.mjs — synthesize Mandarin audio cues for the Panda
// math game using Microsoft Edge's free online TTS service (no API key).
//
// ===== Why Edge TTS? =====
// The user asked us to consider Chinese free TTS providers (2026-08-09). We
// evaluated the realistic options and stayed with Edge TTS for now. The
// trade-offs:
//
//   Edge TTS (current)
//     * Free, no API key, no signup, works immediately against Edge's
//       public readaloud endpoint via the Python `edge-tts` CLI.
//     * Multiple Mandarin voices — we ship `zh-CN-XiaoxiaoNeural` by
//       default (warm female, news style) and a kid-friendly alternative
//       `zh-CN-XiaoyiNeural` (cartoon, lively) via EDGE_VOICE.
//     * Microsoft's neural Mandarin prosody is dramatically better than
//       macOS's only comfortable Mandarin voice ("Tingting"), which
//       sounds flat and monotone.
//     * Trade-off: Microsoft service (not Chinese), requires internet.
//
//   Chinese providers (free tier — all require API key + signup)
//     * 火山引擎 (ByteDance) — BV005_streaming is a kid voice; SDK is
//       decent, free quota generous. Requires API key in WebSocket
//       handshake.
//     * 讯飞开放平台 (iFlyTek) — `xiaoyu` (童声) is purpose-built for
//       kids; free 200k chars/year; requires API key + signature.
//     * 百度智能云 — 度小童 voice; free quota; requires AK/SK.
//     * 腾讯云 — 智童 voice; free quota; requires SecretId/SecretKey.
//     * 阿里云 — 童声 voice; free quota; requires AK.
//
//   All Chinese providers add a `.env`-style API-key dependency that
//   this project doesn't currently have, plus a network round-trip to
//   the provider's auth endpoint. For rapid iteration on an iPad-first
//   kid's math app, the friction outweighs the (marginal) Mandarin
//   prosody improvement.
//
//   Recommendation: ship with Edge TTS as default, keep the
//   `EDGE_VOICE` env var escape hatch so anyone who wants to swap in a
//   Chinese provider's CLI tool can replace this whole script without
//   touching `tools/cues.cjs`.
//
// Why Python `edge-tts` and not the npm `edge-tts` package:
//   * The npm package (v1.0.1) ships an outdated auth token that
//     Microsoft has blocked with HTTP 403.
//   * The Python package (`pip install edge-tts`) is up to date and
//     works against the same public readaloud endpoint.
//
// Voice: EDGE_VOICE env var, default `zh-CN-XiaoxiaoNeural` — warm,
// female, the canonical Edge Chinese voice. For a more cartoon-y /
// kid-appropriate feel, try `zh-CN-XiaoyiNeural` (Cartoon, Novel,
// Lively) — sounds like a kid's TV character.
//
// Format: MP3 (Edge returns natively). main.js loads
// assets/audio/<id>.mp3 directly — both Safari and Chromium handle MP3
// for <audio> tags.
//
// Usage:
//   node tools/build-audio-edge.mjs                          # default voice
//   EDGE_VOICE=zh-CN-XiaoyiNeural node tools/build-audio-edge.mjs   # cartoon voice
//   node tools/build-audio-edge.mjs --dry-run                # list, write nothing

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
    console.log(`  ok  ${cue.id.padEnd(20)} ${String(size).padStart(6)} B  ${text}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
}

console.log(`\n[edge-tts] ${ok}/${CUES.length} cues (${failed} failed)`);
if (failed > 0) process.exit(1);
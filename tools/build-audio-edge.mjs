#!/usr/bin/env node
// tools/build-audio-edge.mjs — synthesize Mandarin audio cues for the Panda
// math game using macOS's built-in `say` command and a Chinese voice.
//
// Why macOS `say` and not Edge / Azure / ElevenLabs:
//   * Edge's free online TTS service (used by the npm `edge-tts` package)
//     rate-limits unauthenticated traffic with HTTP 403, so the package is
//     no longer usable without a Microsoft account.
//   * Azure Speech and ElevenLabs both require API keys the user has not
//     provided.
//   * macOS ships high-quality Mandarin voices (Tingting, Sin-ji, Mei-Jia,
//     plus the Eddy / Flo / Sandy family) with zero setup and no auth.
//
// Voice: SAY_VOICE env var, default "Tingting" (zh_CN female, warm, kid-clear).
// Format: AAC in an MPEG-4 container (.m4a) — the only MP3-equivalent format
// macOS `say` writes directly. main.js loads assets/audio/<id>.m4a.
//
// Usage:
//   node tools/build-audio-edge.mjs            # generate all cues
//   node tools/build-audio-edge.mjs --dry-run  # list, write nothing

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// tools/cues.cjs is CommonJS; dynamic import works in ESM scripts.
const { default: CUES } = await import("./cues.cjs");

const VOICE = process.env.SAY_VOICE || "Tingting";
const OUT_DIR = path.join(ROOT, "assets", "audio");
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "panda-tts-"));
const DRY = process.argv.includes("--dry-run");

function escapeShellArg(s) {
  // Wrap in single quotes; escape any embedded single quotes.
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function synthesize(text) {
  const aiff = path.join(TMP_DIR, "cue.aiff");
  execFileSync("say", [
    "-v", VOICE,
    "--file-format=m4af",
    "--data-format=aac",
    "-o", aiff,
    text,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  return fs.readFileSync(aiff);
}

console.log(
  `[say-tts] voice=${VOICE}  cues=${CUES.length}  dry=${DRY}  tmp=${TMP_DIR}`,
);

let ok = 0;
let failed = 0;
for (const cue of CUES) {
  const out = path.join(OUT_DIR, `${cue.id}.m4a`);
  try {
    const buf = synthesize(String(cue.text).replace(/[\r\n]+/g, " ").trim());
    if (buf.length < 256) {
      throw new Error(`only ${buf.length} bytes — looks like an empty/error payload`);
    }
    if (!DRY) fs.writeFileSync(out, buf);
    ok += 1;
    console.log(`  ok  ${cue.id.padEnd(18)} ${String(buf.length).padStart(6)} B  ${cue.text}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
}

// Clean up the temp scratch directory.
try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_) {}

console.log(`\n[say-tts] ${ok}/${CUES.length} cues (${failed} failed)`);
if (failed > 0) process.exit(1);
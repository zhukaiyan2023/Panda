#!/usr/bin/env node
// tools/build-audio-elevenlabs.mjs — synthesize the 31 pre-baked audio cues
// via ElevenLabs. Companion to tools/build-audio.js (Azure); both read the same
// tools/cues.js manifest and write to assets/audio/<id>.mp3.
//
// Usage:
//   node tools/build-audio-elevenlabs.mjs            # generate all cues
//   node tools/build-audio-elevenlabs.mjs --dry-run  # list, write nothing
//
// Required env (loaded from .env if present):
//   ELEVENLABS_KEY         API key (must start with sk_, not the key id)
//   ELEVENLABS_VOICE_ID    voice id, default EXAVITQu4vr4xnSDxMaL (Bella)
//   ELEVENLABS_MODEL_ID    model id,  default eleven_flash_v2_5
//                          (free tier is blocked from v3 / multilingual_v2
//                          for library voices)
//
// Free tier notes:
//   * library voices via the API require a paid plan EXCEPT when using
//     eleven_flash_v2_5 — Bella, Adam, Antoni, Arnold are reachable for free
//   * Free quota: 10,000 chars/month; the 31-cue manifest totals well under
//     1,000 chars, so one run fits comfortably
//   * No retry/backoff here — if ElevenLabs rate-limits a single cue the
//     script exits non-zero and you can rerun; the manifest is idempotent

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env from project root if present so callers don't have to `source` it
// before invoking the script. Existing process.env values win.
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
} catch (_) { /* ignore */ }

const KEY = process.env.ELEVENLABS_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // Bella
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";

if (!KEY) {
  console.error(
    "[elevenlabs] ELEVENLABS_KEY is not set. " +
      "Add it to .env (already in .gitignore) or pass it inline.",
  );
  process.exit(2);
}
if (process.env.ELEVENLABS_KEY && !process.env.ELEVENLABS_KEY.startsWith("sk_")) {
  console.error(
    "[elevenlabs] ELEVENLABS_KEY does not start with 'sk_' — that's the " +
      "key id, not the API key. Paste the secret from the dashboard reveal.",
  );
  process.exit(2);
}

const DRY = process.argv.includes("--dry-run");

const CUES = (await import("./cues.cjs")).default;

const OUT_DIR = path.join(ROOT, "assets", "audio");

function safe(text) {
  return text.replace(/[<>&]/g, "");
}

async function synthesizeOne(cue) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: safe(cue.text),
      model_id: MODEL,
      // Voice tuned for 3-6 year old non-English speakers: slower (0.75)
      // and very stable so each tiny utterance is clearly articulated.
      voice_settings: {
        stability: 0.8,
        similarity_boost: 0.7,
        style: 0.3,
        speed: 0.75,
        use_speaker_boost: false,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs failed for ${cue.id}: HTTP ${res.status}\n${detail.slice(0, 300)}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 256) {
    throw new Error(
      `${cue.id}: response only ${buf.length} bytes — looks like an error payload, not audio`,
    );
  }
  const out = path.join(OUT_DIR, `${cue.id}.mp3`);
  if (!DRY) fs.writeFileSync(out, buf);
  return { id: cue.id, bytes: buf.length, out };
}

console.log(
  `[elevenlabs] voice=${VOICE}  model=${MODEL}  cues=${CUES.length}  dry=${DRY}`,
);

let total = 0;
for (const cue of CUES) {
  try {
    const { bytes, out } = await synthesizeOne(cue);
    total += bytes;
    console.log(`  ok  ${cue.id.padEnd(16)} ${String(bytes).padStart(6)} B  ${DRY ? "(skipped write)" : path.relative(ROOT, out)}`);
  } catch (e) {
    console.error(`  FAIL ${cue.id}: ${e.message}`);
    process.exit(1);
  }
}

console.log(`\n[elevenlabs] done — ${CUES.length} cues, ${(total / 1024).toFixed(1)} KB total`);
#!/usr/bin/env node
// tools/build-audio-tencent.mjs — synthesize the 49 pre-baked audio cues
// via Tencent Cloud TTS (text-to-speech). Companion to tools/build-audio.js
// (Azure) and tools/build-audio-elevenlabs.mjs (ElevenLabs); all three read
// the same tools/cues.cjs manifest and write to assets/audio/<id>.mp3.
//
// Usage:
//   node tools/build-audio-tencent.mjs            # generate all cues
//   node tools/build-audio-tencent.mjs --dry-run  # list, write nothing
//
// Required env (loaded from .env if present):
//   TENCENT_SECRET_ID     SecretId from 云 API 密钥
//   TENCENT_SECRET_KEY    SecretKey from 云 API 密钥
//   TENCENT_APP_ID        AppId (informational; not in the API call, but
//                         kept in .env so the project record has all
//                         three ids Tencent assigns together)
//   TENCENT_VOICE_TYPE    VoiceType id, default 101016 (智童, female child
//                         voice — F0 ~348 Hz, the only confirmed 女童声
//                         in the 101xxx range; 1004 turned out to be a
//                         male voice at ~127 Hz).
//                         Other kid-range voices (F0 all ≥ 300 Hz):
//                           101016  智童 — default, 348 Hz
//                           101040  智童 — 333 Hz
//                           101028  智童 — 308 Hz
//                         Lower-pitched kid-friendly options (F0 ~225 Hz):
//                           101008  智甜甜
//                           101011  智乖乖
//                           101015  智童 (alternate)
//   TENCENT_CODEC         mp3 (default) | wav | pcm
//   TENCENT_SAMPLE_RATE   16000 (default) | 8000 | 24000
//                         Note: the kid voice (智童, 1004) only supports
//                         8000/16000 — 24000 returns InvalidParameterValue.
//   TENCENT_SPEED         -2.0..6.0, 0 = default. Default 0.
//   TENCENT_VOLUME        -10.0..10.0, 0 = default. Default 0.
//   TENCENT_REGION        ap-guangzhou (default) | ap-shanghai | ap-beijing
//
// Voice choice (1004 智童) — why this is the right default for a 3-6 yr
// math app:
//   * It is a real child voice, not a stylized adult voice pretending to
//     be a child (which most other "kid" presets are).
//   * Mandarin prosody is natural — Microsoft's Xiaoyi cartoon voice
//     (the previous default) is lively but sounds like an adult
//     performing being a child; 智童 sounds like an actual child.
//   * It reads single-digit numbers ("一"… "十") and short Mandarin
//     particles ("耶！" "哇！") without distorting them, which is
//     important for the 11 single-chunk cues in the manifest.
//
// Auth: TC3-HMAC-SHA256 over the JSON body, per the Tencent Cloud API
// 3.0 spec. Node's built-in crypto is enough — no SDK needed.
//
// Free tier: 腾讯云 TTS gives a free quota (~1 万字符) on signup, which
// covers the 49-cue manifest (~600 chars) many times over. Pay-as-you-go
// after that.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env from project root if present so callers don't have to source
// it before invoking the script. Existing process.env values win.
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
} catch (_) { /* ignore */ }

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const APP_ID = process.env.TENCENT_APP_ID; // informational
const VOICE_TYPE = Number.parseInt(process.env.TENCENT_VOICE_TYPE || "101016", 10);
const CODEC = process.env.TENCENT_CODEC || "mp3";
const SAMPLE_RATE = Number.parseInt(process.env.TENCENT_SAMPLE_RATE || "16000", 10);
const SPEED = Number.parseFloat(process.env.TENCENT_SPEED || "0");
const VOLUME = Number.parseFloat(process.env.TENCENT_VOLUME || "0");
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";

const HOST = "tts.tencentcloudapi.com";
const SERVICE = "tts";
const ACTION = "TextToVoice";
const VERSION = "2019-08-23";
const DRY = process.argv.includes("--dry-run");

if (!SECRET_ID || !SECRET_KEY) {
  console.error(
    "[tencent] TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required. " +
      "Add them to .env (already in .gitignore) or pass them inline.",
  );
  process.exit(2);
}
if (!Number.isFinite(VOICE_TYPE) || VOICE_TYPE <= 0) {
  console.error(`[tencent] TENCENT_VOICE_TYPE is not a positive integer: ${process.env.TENCENT_VOICE_TYPE}`);
  process.exit(2);
}

const CUES = (await import("./cues.cjs")).default;
const OUT_DIR = path.join(ROOT, "assets", "audio");
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha256Hex = (m) => crypto.createHash("sha256").update(m).digest("hex");
const hmacSha256 = (k, m) => crypto.createHmac("sha256", k).update(m).digest();

/**
 * Build the TC3-HMAC-SHA256 Authorization header and POST the payload.
 * Returns parsed JSON response. Throws on transport / API error.
 */
async function callTencent(text) {
  const params = {
    Text: text,
    SessionId: crypto.randomUUID(),
    VoiceType: VOICE_TYPE,
    Codec: CODEC,
    SampleRate: SAMPLE_RATE,
    Speed: SPEED,
    Volume: VOLUME,
  };
  const payload = JSON.stringify(params);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // UTC date in YYYY-MM-DD — the Credential scope wants this format, not
  // the 10-digit Unix timestamp that `.slice(0, 10)` of the seconds
  // string would yield.
  const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);

  // 1. Canonical request (newline-terminated header block).
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${HOST}\n` +
    `x-tc-action:${ACTION.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");

  // 2. String to sign.
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  // 3. Signing key chain: TC3+secret -> date -> service -> "tc3_request".
  const secretDate = hmacSha256(`TC3${SECRET_KEY}`, date);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign).toString("hex");

  // 4. Authorization header.
  const authorization =
    `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 5. Send.
  const res = await fetch(`https://${HOST}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: HOST,
      "X-TC-Action": ACTION,
      "X-TC-Version": VERSION,
      "X-TC-Timestamp": timestamp,
      "X-TC-Region": REGION,
    },
    body: payload,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  if (data.Response?.Error) {
    const e = data.Response.Error;
    throw new Error(`${e.Code} — ${e.Message}`);
  }
  if (!data.Response?.Audio) {
    throw new Error(`no Audio in response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.Response;
}

async function synthesizeOne(cue) {
  const text = String(cue.text).replace(/[\r\n]+/g, " ").trim();
  if (!text) throw new Error("empty cue text");

  const resp = await callTencent(text);
  const buf = Buffer.from(resp.Audio, "base64");
  if (buf.length < 256) {
    throw new Error(`only ${buf.length} bytes — looks like an error payload, not audio`);
  }
  const out = path.join(OUT_DIR, `${cue.id}.mp3`);
  if (!DRY) fs.writeFileSync(out, buf);
  return { id: cue.id, bytes: buf.length, out };
}

console.log(
  `[tencent] voiceType=${VOICE_TYPE} codec=${CODEC} sampleRate=${SAMPLE_RATE} ` +
    `speed=${SPEED} volume=${VOLUME} region=${REGION} cues=${CUES.length} dry=${DRY}` +
    (APP_ID ? ` appId=${APP_ID}` : ""),
);

let ok = 0;
let failed = 0;
let totalBytes = 0;
for (const cue of CUES) {
  try {
    const { bytes, out } = await synthesizeOne(cue);
    ok += 1;
    totalBytes += bytes;
    console.log(
      `  ok  ${cue.id.padEnd(22)} ${String(bytes).padStart(6)} B  ${DRY ? "(skipped write)" : path.relative(ROOT, out)}`,
    );
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
  // 60ms breath between calls — Tencent's free tier is ~20 QPS, 49 cues
  // is well under that, but a small gap keeps the script polite.
  await new Promise((r) => setTimeout(r, 60));
}

console.log(
  `\n[tencent] ${ok}/${CUES.length} cues (${failed} failed), ${(totalBytes / 1024).toFixed(1)} KB total`,
);
if (failed > 0) process.exit(1);

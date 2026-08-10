#!/usr/bin/env node
// tools/build-audio-tier-tencent.mjs — synthesize ONLY the 32 process-praise
// tier cues via Tencent 智童 (101016, real female child voice, F0 ~348 Hz).
//
// Why this exists: build-audio-tier-only.mjs uses Edge TTS Xiaoxiao
// (female adult) for the encouragement cues, while the per-round composite
// cues (l1-rwd-*, l2-rwd-*, l3-s1-*) are already in 智童. Kids hearing
// the round audio in a kid voice then "enc-wrong-1" in an adult voice
// hear two different speakers and the encouragement feels out-of-place.
// Regenerating just the 32 tier cues via Tencent brings every kid-facing
// audio line onto one consistent voice without re-rendering the 1066
// other cues that already sound correct.
//
// Skips files that already exist (idempotent re-runs are free).
//
// Auth via .env: TENCENT_SECRET_ID, TENCENT_SECRET_KEY (TENCENT_APP_ID
// is informational). VoiceType defaults to 101016 (智童).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env from project root (same pattern as build-audio-tencent.mjs).
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
} catch (_) {}

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
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

if (!SECRET_ID || !SECRET_KEY) {
  console.error(
    "[tier-tencent] TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required " +
      "(load .env from project root or pass them inline).",
  );
  process.exit(2);
}

const { default: CUES } = await import("./cues.cjs");
const OUT_DIR = path.join(ROOT, "assets", "audio");

// Tier cue id prefixes — same set as build-audio-tier-only.mjs.
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
console.log(
  `[tier-tencent] voiceType=${VOICE_TYPE} region=${REGION} speed=${SPEED} cues=${missing.length}`,
);

const sha256Hex = (m) => crypto.createHash("sha256").update(m).digest("hex");
const hmacSha256 = (k, m) => crypto.createHmac("sha256", k).update(m).digest();

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
  const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);

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
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacSha256(`TC3${SECRET_KEY}`, date);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign).toString("hex");
  const authorization =
    `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

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

let ok = 0;
let skipped = 0;
let failed = 0;
let totalBytes = 0;
for (const cue of missing) {
  const text = String(cue.text).replace(/[\r\n]+/g, " ").trim();
  const out = path.join(OUT_DIR, `${cue.id}.mp3`);
  if (fs.existsSync(out)) {
    console.log(`  skip ${cue.id.padEnd(22)} (exists)`);
    skipped += 1;
    continue;
  }
  try {
    const resp = await callTencent(text);
    const buf = Buffer.from(resp.Audio, "base64");
    if (buf.length < 256) throw new Error(`only ${buf.length} bytes — looks empty`);
    fs.writeFileSync(out, buf);
    ok += 1;
    totalBytes += buf.length;
    console.log(`  ok  ${cue.id.padEnd(22)} ${String(buf.length).padStart(6)} B  ${text}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
  // 60ms between calls — Tencent's free tier is ~20 QPS, well under that
  // for 32 cues, but a small gap keeps the script polite.
  await new Promise((r) => setTimeout(r, 60));
}

console.log(
  `\n[tier-tencent] ${ok} generated, ${skipped} skipped, ${failed} failed ` +
    `(${(totalBytes / 1024).toFixed(1)} KB written)`,
);
if (failed > 0) process.exit(1);
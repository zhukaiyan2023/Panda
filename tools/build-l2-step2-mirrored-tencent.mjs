#!/usr/bin/env node
// tools/build-l2-step2-mirrored-tencent.mjs — synthesize the 9 missing
// "l1-step2-{third}-10" mp3 files via Tencent Cloud TTS.
//
// Why this script exists (2026-08-11): the L2 step-2 audio mirror added
// `l1-step2-{third}-10` ("{third}加十等于几") cues for the b+c=10 case,
// to match the mirrored sub-question ("{third} + 10 = ?"). Existing
// assets were generated via Tencent TTS (VoiceType 101016 智童, female
// child voice, F0 ~348 Hz); regenerating them with edge-tts (Xiaoxiao,
// adult female news-anchor voice) produces a noticeable mismatch —
// different prosody, different cadence. This script targets the SAME
// voice/format as the rest of the assets so the kid hears a single
// consistent narrator across the whole round.
//
// Generates only the 9 missing cues — running tools/build-composite-audio.mjs
// would regenerate ~700 mp3s and is unnecessary if only the mirrored
// step-2 cues are missing.
//
// Usage:
//   node tools/build-l2-step2-mirrored-tencent.mjs            # generate 9 cues
//   node tools/build-l2-step2-mirrored-tencent.mjs --dry-run  # list, write nothing
//
// Required env (loaded from .env if present):
//   TENCENT_SECRET_ID / TENCENT_SECRET_KEY — 云 API 密钥
//   TENCENT_VOICE_TYPE — defaults to 101016 (智童), matches the
//                        build-composite-audio.mjs default
//   TENCENT_SAMPLE_RATE — defaults to 16000, matches the default

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env (matches tools/build-composite-audio.mjs)
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
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";

const HOST = "tts.tencentcloudapi.com";
const SERVICE = "tts";
const ACTION = "TextToVoice";
const VERSION = "2019-08-23";
const DRY = process.argv.includes("--dry-run");

if (!DRY && (!SECRET_ID || !SECRET_KEY)) {
  console.error("[tencent] TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required (same env as tools/build-composite-audio.mjs).");
  process.exit(2);
}

// numZh — matches the helper in tools/build-composite-audio.mjs so the
// synthesized text matches what the existing assets say.
const NUM_ZH = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
function numZh(n) { return NUM_ZH[n]; }

const sha256Hex = (m) => crypto.createHash("sha256").update(m).digest("hex");
const hmacSha256 = (k, m) => crypto.createHmac("sha256", k).update(m).digest();

async function callTencent(text) {
  const params = {
    Text: text, SessionId: crypto.randomUUID(),
    VoiceType: VOICE_TYPE, Codec: CODEC,
    SampleRate: SAMPLE_RATE,
  };
  const payload = JSON.stringify(params);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\nx-tc-action:${ACTION.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256Hex(payload)].join("\n");
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", timestamp, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const secretDate = hmacSha256(`TC3${SECRET_KEY}`, date);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign).toString("hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${HOST}`, {
    method: "POST",
    headers: {
      Authorization: authorization, "Content-Type": contentType, Host: HOST,
      "X-TC-Action": ACTION, "X-TC-Version": VERSION,
      "X-TC-Timestamp": timestamp, "X-TC-Region": REGION,
    },
    body: payload,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}\n${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  if (data.Response?.Error) throw new Error(`${data.Response.Error.Code} — ${data.Response.Error.Message}`);
  if (!data.Response?.Audio) throw new Error(`no Audio in response: ${JSON.stringify(data).slice(0, 300)}`);
  return Buffer.from(data.Response.Audio, "base64");
}

const OUT_DIR = path.join(ROOT, "assets", "audio");

// The 9 mirrored step-2 cues for the b+c=10 case. Text matches the
// pattern build-composite-audio.mjs emits for `l1-step2-{third}-10`:
// "{third}加十等于几". Mirrored from the existing `l1-step2-10-{third}`
// ("十加{third}等于几") set.
const CUES = [];
for (let third = 1; third <= 9; third++) {
  CUES.push({
    id: `l1-step2-${third}-10`,
    text: `${numZh(third)}加十等于几`,
  });
}

console.log(`[tencent] voiceType=${VOICE_TYPE} codec=${CODEC} sampleRate=${SAMPLE_RATE} cues=${CUES.length} dry=${DRY}`);

let ok = 0, failed = 0;
for (const cue of CUES) {
  const out = path.join(OUT_DIR, `${cue.id}.mp3`);
  if (DRY) {
    console.log(`  would write ${cue.id.padEnd(20)} ${cue.text}`);
    continue;
  }
  try {
    const audio = await callTencent(cue.text);
    fs.writeFileSync(out, audio);
    if (audio.length < 256) throw new Error(`only ${audio.length} bytes — looks like an empty payload`);
    ok++;
    console.log(`  ok  ${cue.id.padEnd(20)} ${String(audio.length).padStart(6)} B  ${cue.text}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
}

console.log(`\n[tencent] ${ok}/${CUES.length} cues (${failed} failed)`);
if (failed > 0) process.exit(1);
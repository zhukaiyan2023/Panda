#!/usr/bin/env node
// tools/build-intro-cues-tencent.mjs — synthesize ONLY the L1+L2 phase-1
// intro cues via Tencent Cloud TTS, regenerating after a text-template
// change.
//
// Why this script exists (2026-08-12): the user dropped the leading
// "先看下" from the L1+L2 phase-1 audio templates (it was redundant with
// the equation that immediately follows). Re-running the full
// build-composite-audio.mjs would regenerate ~700+ mp3s unnecessarily;
// this script targets only the 120 L1 intro cues + 153 L2 make-ten
// intro cues = 273 mp3s that actually need re-recording.
//
// Uses the same VoiceType (101016 智童), Codec (mp3), SampleRate
// (16000) as the rest of the assets — matches existing audio.
//
// Usage:
//   node tools/build-intro-cues-tencent.mjs              # regenerate
//   node tools/build-intro-cues-tencent.mjs --dry-run   # list, write nothing

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { poolGens } from "../data/pools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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
  console.error("[tencent] TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required.");
  process.exit(2);
}

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

// New templates — match tools/build-composite-audio.mjs after the
// 2026-08-12 edit that dropped the leading "先看下".
const L1_TEMPLATE = (a, b, c) =>
  `${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先看看前两个数相加。`;

const L2_TEMPLATE = (a, b, c) =>
  `${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先找出相加为10的数。`;

const CUES = [];

// L1 — 三数相加<10. 120 ordered triples (sum ≤ 10), each gets one
// l1-intro-{a}-{b}-{c} cue.
for (const r of poolGens[1]()) {
  const [a, b, c] = r.nums;
  CUES.push({ id: `l1-intro-${a}-${b}-${c}`, text: L1_TEMPLATE(a, b, c) });
}

// L2 — 两个数凑十. 153 ordered triples (a+b=10 or b+c=10), each gets
// one l1-intro-mt-{a}-{b}-{c} cue.
for (const r of poolGens[2]()) {
  const [a, b, c] = r.nums;
  CUES.push({ id: `l1-intro-mt-${a}-${b}-${c}`, text: L2_TEMPLATE(a, b, c) });
}

const OUT_DIR = path.join(ROOT, "assets", "audio");

console.log(`[tencent] voiceType=${VOICE_TYPE} codec=${CODEC} sampleRate=${SAMPLE_RATE} cues=${CUES.length} dry=${DRY}`);

let ok = 0, failed = 0;
for (const cue of CUES) {
  const out = path.join(OUT_DIR, `${cue.id}.mp3`);
  if (DRY) {
    console.log(`  would rewrite ${cue.id.padEnd(22)} ${cue.text.slice(0, 40)}…`);
    continue;
  }
  try {
    const audio = await callTencent(cue.text);
    fs.writeFileSync(out, audio);
    if (audio.length < 256) throw new Error(`only ${audio.length} bytes — looks like an empty payload`);
    ok++;
    if (ok % 30 === 0 || ok === CUES.length) {
      console.log(`  ok  ${String(ok).padStart(3)}/${CUES.length}  (latest: ${cue.id})`);
    }
  } catch (e) {
    failed++;
    console.error(`  FAIL ${cue.id}: ${e.message}`);
  }
}

console.log(`\n[tencent] ${ok}/${CUES.length} cues (${failed} failed)`);
if (failed > 0) process.exit(1);
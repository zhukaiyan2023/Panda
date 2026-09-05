#!/usr/bin/env node
// tools/try-tencent-voices.mjs — synthesise the same short cue with each
// candidate "female child voice" VoiceType, saving the sample to
// assets/audio/.voice-samples/<id>.mp3 so we can pick the right one by ear.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";
const HOST = "tts.tencentcloudapi.com";
const SERVICE = "tts";
const ACTION = "TextToVoice";
const VERSION = "2019-08-23";
const SAMPLE_RATE = 16000;

const sha256Hex = (m) => crypto.createHash("sha256").update(m).digest("hex");
const hmacSha256 = (k, m) => crypto.createHmac("sha256", k).update(m).digest();

async function call(text, voiceType) {
  const payload = JSON.stringify({
    Text: text,
    SessionId: crypto.randomUUID(),
    VoiceType: voiceType,
    Codec: "mp3",
    SampleRate: SAMPLE_RATE,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders =
    `content-type:${contentType}\nhost:${HOST}\nx-tc-action:${ACTION.toLowerCase()}\n`;
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
  const data = await res.json();
  if (data.Response?.Error) return { error: `${data.Response.Error.Code}: ${data.Response.Error.Message}` };
  if (!data.Response?.Audio) return { error: "no Audio in response" };
  return { buf: Buffer.from(data.Response.Audio, "base64") };
}

// Try a long-ish line so we can hear the prosody, plus a short number to
// check that single digits still sound natural.
const TEXT = "小朋友好，我们来学习三数相加。";

// Candidates to audition. The user said VoiceType 1004 came out as a male
// voice, so we'll try the documented "cute girl / child" range and a few
// 107xxx children-series IDs.
const CANDIDATES = [
  101016, 101017, 101018, 101019, 101020,
  101021, 101022, 101023, 101024, 101025,
  101026, 101027, 101028, 101029, 101030,
  101031, 101032, 101033, 101034, 101035,
  101036, 101037, 101038, 101039, 101040,
  101041, 101042, 101043, 101044, 101045,
  101050, 101055, 101060, 101065, 101070,
  101080, 101090, 101100,
  502001, 502002, 502003,
  601001, 601002, 601003,
];

const OUT_DIR = path.join(ROOT, "assets", "audio", ".voice-samples");
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const id of CANDIDATES) {
  try {
    const r = await call(TEXT, id);
    if (r.error) {
      console.log(`  ${String(id).padStart(8)}  FAIL  ${r.error}`);
      continue;
    }
    const out = path.join(OUT_DIR, `vt-${id}.mp3`);
    fs.writeFileSync(out, r.buf);
    console.log(`  ${String(id).padStart(8)}  ok  ${String(r.buf.length).padStart(6)} B  ${path.relative(ROOT, out)}`);
  } catch (e) {
    console.log(`  ${String(id).padStart(8)}  ERR  ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 60));
}
console.log(`\nSaved samples to ${path.relative(ROOT, OUT_DIR)}/  Play them and pick the right VoiceType.`);

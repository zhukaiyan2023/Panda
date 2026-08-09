#!/usr/bin/env node
// tools/list-tencent-voices.mjs — one-shot discovery: print the actual
// VoiceType list Tencent returns, so we can pick the right 智童 voice.
// Uses the same TC3-HMAC-SHA256 signing as build-audio-tencent.mjs.

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
const ACTION = "DescribeVoiceTypes";
const VERSION = "2019-08-23";

const sha256Hex = (m) => crypto.createHash("sha256").update(m).digest("hex");
const hmacSha256 = (k, m) => crypto.createHmac("sha256", k).update(m).digest();

async function call() {
  const payload = JSON.stringify({ VoiceTypes: [], EngineTypes: [], Languages: [] });
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
  if (data.Response?.Error) {
    console.error("API error:", data.Response.Error);
    process.exit(1);
  }
  return data.Response;
}

const r = await call();
const voices = r.VoiceTypes || [];
console.log(`Total voices: ${voices.length}`);
const child = voices.filter(v => /童|萌|乖|甜|乐|孩子|child|kid/i.test(v.VoiceName || v.Name || ""));
console.log(`\nChild/cute/cartoon voices (${child.length}):`);
for (const v of child) {
  console.log(`  ${String(v.VoiceType).padStart(8)}  ${(v.VoiceName || v.Name).padEnd(20)}  ${v.SampleRateSet || "?"}  ${v.Gender || "?"}  ${v.SupportTimePeriod || ""}`);
}
console.log(`\nAll voices (first 30):`);
for (const v of voices.slice(0, 30)) {
  console.log(`  ${String(v.VoiceType).padStart(8)}  ${(v.VoiceName || v.Name).padEnd(20)}  ${v.Gender || "?"}`);
}

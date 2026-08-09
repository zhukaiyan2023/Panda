#!/usr/bin/env node
// tools/build-composite-audio.mjs — synthesize the per-round composite
// sentences (one mp3 per round, not chunked) via Tencent Cloud TTS.
//
// The scene code in scenes/level{1,2,3}.js currently builds each
// per-step sentence from many small universal cues (n-*, q-plus,
// equals, lvl-*-step-*-*) using playSequence(). Per user feedback
// ("不要拆开一个音频一个音频的读。直接生成 2+3+4等于几"), the user
// wants each whole sentence pre-baked as one mp3 so it sounds like
// a single phrase, not a choppy list. This script generates exactly
// those per-round composite files and leaves the universal cues
// alone (they're still used by the game-intro and reward audio that
// don't have round-specific numbers).
//
// Naming convention:
//   l1-intro-{a}-{b}-{c}      L1 step 1 phase 1 decompose sentence
//   l1-sub-{a}-{b}            L1 step 1 phase 2 sub-question
//   l1-step2-{pairSum}-{third}
//                             L1 step 2 simplified question ("pairSum加third等于几")
//   l1-rwd-{a}-{b}-{c}-{ans}  L1 step 2 reward ("X加Y加Z等于答")
//   l2-s1-{a}-{b}             L2 step 1 ("我们来计算 a 加 b ...")
//   l2-s2-{big}               L2 step 2 ("大数是 big, 好朋友是几")
//   l2-s3-{small}-{need}      L2 step 3 ("small 能分成 need 和几？")
//   l2-s4-{small}-{need}-{rest}-{big}
//                             L2 step 4 ("算一算 big 加 need 加 rest...")
//   l2-rwd-{a}-{b}-{ans}      L2 step 4 reward
//   l3-s1-{a}-{b}             L3 step 1 ("a+b等于几, 我们先把 a 拆分")
//   l3-s2-{ones}-{b}          L3 step 2 ("个位相加 ones 加 b...")
//   l3-s3-{sum}               L3 step 3 ("十 加 sum 等于几")
//   l3-rwd-{a}-{b}-{ans}      L3 step 3 reward
//
// Reuse: rounds with identical composites share one file (e.g. L2
// rounds 2 and 4 are both [7,6,need=3,rest=3,answer=13] so the
// reward mp3 is generated once and referenced from both). The
// `seen` Map below enforces this.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

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
const SPEED = Number.parseFloat(process.env.TENCENT_SPEED || "0");
const VOLUME = Number.parseFloat(process.env.TENCENT_VOLUME || "0");
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";
const SAMPLE_RATE = Number.parseInt(process.env.TENCENT_SAMPLE_RATE || "16000", 10);
const CODEC = "mp3";
const HOST = "tts.tencentcloudapi.com";
const SERVICE = "tts";
const ACTION = "TextToVoice";
const VERSION = "2019-08-23";

if (!SECRET_ID || !SECRET_KEY) {
  console.error("[composite] TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required.");
  process.exit(2);
}

const levels = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "levels.json"), "utf8")).levels;
const NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
function numZh(n) {
  if (n < 0 || n > 20) throw new Error(`numZh out of range: ${n}`);
  return NUM[n];
}

function choosePair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === 10) {
        const thirdIdx = nums.findIndex((n, k) => k !== i && k !== j);
        return { pair: [nums[i], nums[j]], third: nums[thirdIdx] };
      }
    }
  }
  return { pair: [nums[0], nums[1]], third: nums[2] };
}

const composites = [];

const l1 = levels.find((l) => l.id === 1);
for (const r of l1.rounds) {
  const [a, b, c] = r.nums;
  const { pair } = choosePair(r.nums);
  composites.push({
    id: `l1-intro-${a}-${b}-${c}`,
    text: `先看下${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先看看前两个数相加。`,
  });
  composites.push({
    id: `l1-sub-${pair[0]}-${pair[1]}`,
    text: `${numZh(pair[0])}加${numZh(pair[1])}等于几`,
  });
  composites.push({
    id: `l1-rwd-${a}-${b}-${c}-${r.answer}`,
    text: `${numZh(a)}加${numZh(b)}加${numZh(c)}等于${numZh(r.answer)}`,
  });
  // L1 step 2 simplified question: "pairSum 加 third 等于几".
  // The old code chained 4 cues (n-pairSum + q-plus + n-third +
  // q-equals) which read as 4 separate words. Pre-bake so it sounds
  // like one phrase.
  const pairSum = pair[0] + pair[1];
  const thirdIdx = r.nums.findIndex((n) => n !== pair[0] && n !== pair[1]);
  const third = r.nums[thirdIdx];
  composites.push({
    id: `l1-step2-${pairSum}-${third}`,
    text: `${numZh(pairSum)}加${numZh(third)}等于几`,
  });
}

const l2 = levels.find((l) => l.id === 2);
for (const r of l2.rounds) {
  const big = r.a >= r.b ? r.a : r.b;
  const small = r.a >= r.b ? r.b : r.a;
  composites.push({
    id: `l2-s1-${r.a}-${r.b}`,
    text: `我们来计算${numZh(r.a)}加${numZh(r.b)}等于几，先比一比，${numZh(r.a)}还是${numZh(r.b)}谁大`,
  });
  composites.push({
    id: `l2-s2-${big}`,
    text: `大数是${numZh(big)}，我们找找${numZh(big)}的好朋友，${numZh(big)}的好朋友是几`,
  });
  composites.push({
    id: `l2-s3-${small}-${r.need}`,
    text: `${numZh(small)}需要拆一拆，${numZh(small)}能分成${numZh(r.need)}和几？`,
  });
  composites.push({
    id: `l2-s4-${small}-${r.need}-${r.rest}-${big}`,
    text: `${numZh(small)}分成${numZh(r.need)}加${numZh(r.rest)}，算一算${numZh(big)}加${numZh(r.need)}加${numZh(r.rest)}等于几`,
  });
  composites.push({
    id: `l2-rwd-${r.a}-${r.b}-${r.answer}`,
    text: `${numZh(r.a)}加${numZh(r.b)}等于${numZh(r.answer)}`,
  });
}

const l3 = levels.find((l) => l.id === 3);
for (const r of l3.rounds) {
  const ones = r.a % 10;
  const sum = ones + r.b;
  composites.push({
    id: `l3-s1-${r.a}-${r.b}`,
    text: `${numZh(r.a)}加${numZh(r.b)}等于几，我们先把${numZh(r.a)}进行拆分，拆成十加几`,
  });
  composites.push({
    id: `l3-s2-${ones}-${r.b}`,
    text: `个位相加${numZh(ones)}加${numZh(r.b)}等于几`,
  });
  composites.push({
    id: `l3-s3-${sum}`,
    text: `十加${numZh(sum)}等于几`,
  });
  composites.push({
    id: `l3-rwd-${r.a}-${r.b}-${r.answer}`,
    text: `${numZh(r.a)}加${numZh(r.b)}等于${numZh(r.answer)}`,
  });
}

const seen = new Map();
const deduped = [];
for (const c of composites) {
  if (seen.has(c.id)) {
    if (seen.get(c.id) !== c.text) {
      throw new Error(`composite id collision: ${c.id} has two different texts`);
    }
    continue;
  }
  seen.set(c.id, c.text);
  deduped.push(c);
}

const OUT_DIR = path.join(ROOT, "assets", "audio");
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha256Hex = (m) => crypto.createHash("sha256").update(m).digest("hex");
const hmacSha256 = (k, m) => crypto.createHmac("sha256", k).update(m).digest();

async function callTencent(text) {
  const params = {
    Text: text, SessionId: crypto.randomUUID(),
    VoiceType: VOICE_TYPE, Codec: CODEC,
    SampleRate: SAMPLE_RATE, Speed: SPEED, Volume: VOLUME,
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

console.log(`[composite] ${composites.length} raw -> ${deduped.length} unique, voiceType=${VOICE_TYPE} speed=${SPEED}`);

let ok = 0, failed = 0, totalBytes = 0;
for (const c of deduped) {
  try {
    const buf = await callTencent(c.text);
    if (buf.length < 256) throw new Error(`only ${buf.length} bytes`);
    const out = path.join(OUT_DIR, `${c.id}.mp3`);
    fs.writeFileSync(out, buf);
    ok++;
    totalBytes += buf.length;
    console.log(`  ok  ${c.id.padEnd(30)} ${String(buf.length).padStart(6)} B  ${c.text.slice(0, 30)}…`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${c.id}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 60));
}
console.log(`\n[composite] ${ok}/${deduped.length} cues (${failed} failed), ${(totalBytes / 1024).toFixed(1)} KB total`);
if (failed > 0) process.exit(1);

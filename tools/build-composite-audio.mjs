#!/usr/bin/env node
// tools/build-composite-audio.mjs — synthesize per-round composite
// sentences (one mp3 per round, not chunked) via Tencent Cloud TTS.
//
// The scene code in scenes/level{1,2,3,4}.js builds each per-step
// sentence from many small universal cues (n-*, q-plus, equals,
// lvl-*-step-*-*) using playSequence(). Per user feedback ("不要拆开
// 一个音频一个音频的读。直接生成 2+3+4等于几"), the user wants each
// whole sentence pre-baked as one mp3 so it sounds like a single
// phrase, not a choppy list.
//
// Pool-driven approach: instead of hand-picked rounds, each level now
// generates its pool via data/pools.js. Four math levels (added
// 2026-08-11 when the original combined L1 was split into sum-≤-10 +
// two-sum-to-10):
//   L1 sum-≤-10        120 triples, every (a,b,c) with a+b+c ≤ 10
//   L2 two-sum-to-10   217 triples, every (a,b,c) with two summing to 10
//   L3 凑十法           36 ordered (a, b) pairs, sum > 10
//   L4 二十以内         36 ordered (a, b) pairs, a teen + digit
// This script inlines the pool generators and synthesizes one mp3
// per unique composite id reachable from the pool:
//   l1-intro-{a}-{b}-{c}     L1 step 1 phase 1 decompose sentence
//   l1-sub-{a}-{b}           L1 step 1 phase 2 sub-question
//   l1-step2-{pairSum}-{third}
//                            L1 step 2 simplified question
//   l1-rwd-{a}-{b}-{c}-{ans} L1 step 2 reward ("X加Y加Z等于答")
//   l2-s1-{a}-{b}            L2 step 1 ("我们来计算 a 加 b ...")
//   l2-s2-{big}              L2 step 2 ("大数是 big, 好朋友是几")
//   l2-s3-{small}-{need}     L2 step 3 ("small 能分成 need 和几？")
//   l2-s4-{small}-{need}-{rest}-{big}
//                            L2 step 4 ("算一算 big 加 need 加 rest...")
//   l2-simple-{a}-{b}        L2 non-make-ten single-step prompt
//                            ("我们来计算 a 加 b 等于几")
//   l2-rwd-{a}-{b}-{ans}     L2 reward (used by both make-ten and
//                            non-make-ten rounds)
//   l3-s1-{a}-{b}            L3 step 1 ("a+b等于几, 我们先把 a 拆分")
//   l3-s2-{ones}-{b}         L3 step 2 ("个位相加 ones 加 b...")
//   l3-s3-{sum}              L3 step 3 ("十 加 sum 等于几")
//   l3-rwd-{a}-{b}-{ans}     L3 step 3 reward
//
// Reuse: identical composites share one file via the `seen` Map.
// Several L2/L3 cues are deduped across rounds (e.g. l2-s2-7 covers
// every L2 round where big = 7).
//
// Hardening (security review):
//   - safeInt(n, min, max, where) validates every arithmetic field
//     from the pool generators. A non-integer or out-of-range value
//     throws with a precise error.
//   - safeCueId(id) allowlists every generated id against
//     /^[a-z0-9][a-z0-9-]*$/, refusing slashes / dots / uppercase / etc.
//   - Write loop resolves the destination and requires it to stay
//     under the resolved OUT_DIR (separator-aware containment),
//     refuses symlinks at the destination.

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

const NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "二十一", "二十二", "二十三", "二十四", "二十五", "二十六", "二十七", "二十八", "二十九"];
function numZh(n) {
  if (n < 0 || n > 29) throw new Error(`numZh out of range: ${n}`);
  return NUM[n];
}

// Reject anything that isn't a finite integer in the documented range.
function safeInt(n, min, max, where) {
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`pool: ${where} must be an integer in [${min}, ${max}], got ${JSON.stringify(n)}`);
  }
  return n;
}

// Allowlist for every generated cue id — lowercase alnum + dash only.
const CUE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
function safeCueId(id) {
  if (typeof id !== "string" || !CUE_ID_RE.test(id)) {
    throw new Error(`refusing to write cue id that fails allowlist: ${JSON.stringify(id)}`);
  }
  return id;
}

// Decide which two addends the kid should pair first, and which one is the
// "leftover" they add at the end. Returns the pair VALUES plus the third
// VALUE. Always index-driven so triples with duplicate values
// (e.g. [3, 2, 2]) work correctly — pair value {3, 2} should leave the
// third value as 2, not "undefined".
function choosePair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === 10) {
        const thirdIdx = nums.findIndex((_, k) => k !== i && k !== j);
        return { pair: [nums[i], nums[j]], third: nums[thirdIdx], isMakeTen: true };
      }
    }
  }
  // No pair sums to 10. Use the first two indices as the pair and the
  // last as the third — that's the unambiguous convention for triples
  // that don't fit the make-a-ten pattern (the L1 fallback path).
  return { pair: [nums[0], nums[1]], third: nums[2], isMakeTen: false };
}

// Replicate the pool generators from data/pools.js — duplicated here
// so this script has no module dependency on the project (it can run
// on a CI worker with just the .env creds). The bounds MUST match
// data/pools.js exactly; the safeInt checks below catch any drift.
//
// L1 三数相加<10 — triples with a+b+c ≤ 10, no 0s.
const l1Pool = [];
for (let a = 1; a <= 9; a++) {
  for (let b = 1; b <= 9; b++) {
    for (let c = 1; c <= 9; c++) {
      if (a + b + c > 10) continue;
      l1Pool.push({ kind: "three-sum", nums: [a, b, c], answer: a + b + c });
    }
  }
}

// L2 两个数凑十 — triples where at least one pair sums to 10.
const l2Pool = [];
for (let a = 1; a <= 9; a++) {
  for (let b = 1; b <= 9; b++) {
    for (let c = 1; c <= 9; c++) {
      const ten = a + b === 10 || a + c === 10 || b + c === 10;
      if (!ten) continue;
      l2Pool.push({ kind: "three-ten", nums: [a, b, c], answer: a + b + c });
    }
  }
}

// L3 凑十法 — strict make-a-ten: ordered (a, b) pairs, sum > 10, both digits.
const l3Pool = [];
for (let a = 1; a <= 9; a++) {
  for (let b = 1; b <= 9; b++) {
    const sum = a + b;
    if (sum <= 10) continue;
    const big = a >= b ? a : b;
    const small = a >= b ? b : a;
    const need = 10 - big;
    const rest = small - need;
    l3Pool.push({ kind: "make-ten", a, b, need, rest, answer: sum });
  }
}

// L4 二十以内 — a ∈ [11, 19], b ∈ [1, 9], ones + b < 10.
const l4Pool = [];
for (let a = 11; a <= 19; a++) {
  const ones = a % 10;
  const bMax = 9 - ones;
  for (let b = 1; b <= Math.min(9, bMax); b++) {
    l4Pool.push({ a, b, answer: a + b });
  }
}

console.log(`[composite] pool sizes — L1: ${l1Pool.length}, L2: ${l2Pool.length}, L3: ${l3Pool.length}, L4: ${l4Pool.length}`);

const composites = [];

// L1 — 三数相加<10 (Pattern A only — no make-a-ten branch in this level).
for (const r of l1Pool) {
  const [a, b, c] = r.nums.map((n) => safeInt(n, 1, 9, "l1.nums"));
  const answer = safeInt(r.answer, 3, 10, "l1.answer");
  // L1's pool only emits sum-≤-10 triples; the pair is always the
  // first two addends and the third is the leftover. No make-a-ten
  // variant.
  const pair = [r.nums[0], r.nums[1]];
  const thirdVal = r.nums[2];
  // Pattern A (sum ≤ 10, no pair to ten): "look at the first two".
  composites.push({
    id: `l1-intro-${a}-${b}-${c}`,
    text: `先看下${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先看看前两个数相加。`,
  });
  composites.push({
    id: `l1-sub-${pair[0]}-${pair[1]}`,
    text: `${numZh(pair[0])}加${numZh(pair[1])}等于几`,
  });
  composites.push({
    id: `l1-rwd-${a}-${b}-${c}-${answer}`,
    text: `${numZh(a)}加${numZh(b)}加${numZh(c)}等于${numZh(answer)}`,
  });
  const pairSum = safeInt(pair[0] + pair[1], 0, 10, "l1 pair sum");
  const third = safeInt(thirdVal, 1, 9, "l1 third addend");
  composites.push({
    id: `l1-step2-${pairSum}-${third}`,
    text: `${numZh(pairSum)}加${numZh(third)}等于几`,
  });
}

// L2 — 两个数凑十 (Pattern B only — every triple has a pair summing to 10).
for (const r of l2Pool) {
  const [a, b, c] = r.nums.map((n) => safeInt(n, 1, 9, "l2.nums"));
  const answer = safeInt(r.answer, 11, 19, "l2.answer");
  // Every L2 triple has at least one pair summing to 10; choosePair
  // always finds one. The pair becomes the "ten" and the leftover is
  // the third.
  const { pair, third: thirdVal } = choosePair(r.nums);
  composites.push({
    id: `l1-intro-mt-${a}-${b}-${c}`,
    text: `先看下${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先找出相加为10的数。`,
  });
  composites.push({
    id: `l1-rwd-${a}-${b}-${c}-${answer}`,
    text: `${numZh(a)}加${numZh(b)}加${numZh(c)}等于${numZh(answer)}`,
  });
  // pairSum is always 10 for L2 (the pool guarantees it), so the
  // step-2 cue is "十 加 third 等于几" — the literal 10, not pairSum.
  const third = safeInt(thirdVal, 1, 9, "l2 third addend");
  composites.push({
    id: `l1-step2-10-${third}`,
    text: `十加${numZh(third)}等于几`,
  });
}

// Generic phase-2 cue for the L2 make-a-ten pattern: "哪两个数相加等于10".
// Shared across all 217 L2 rounds so only one cue is needed.
composites.push({
  id: "l1-sub-find-ten",
  text: "哪两个数相加等于10",
});

// L3 — 凑十法 (the dedicated two-addend make-a-ten level).
// Strict make-ten (a, b ∈ [1, 10], sum ∈ [10, 19]) gets the full 4-step
// teaching: compare → find-friend → split → count. Other kinds get a
// single-step scene (just "a + b = ?") so the make-ten audio prompt
// (which teaches the "friend of big" strategy) never plays for a round
// where the strategy would lie. All 200 rounds share the l2-rwd reward.
for (const r of l2Pool) {
  // Bounds for the kind. a ∈ [0, 20], b ∈ [0, 10], answer ∈ [0, 29].
  const a = safeInt(r.a, 0, 20, "l2.a");
  const b = safeInt(r.b, 0, 10, "l2.b");
  const answer = safeInt(r.answer, 0, 29, "l2.answer");
  if (r.kind === "make-ten") {
    const big = safeInt(Math.max(a, b), 1, 10, "l2.big");
    const small = safeInt(Math.min(a, b), 1, 9, "l2.small");
    const need = safeInt(r.need, 0, 9, "l2.need");
    const rest = safeInt(r.rest, 0, 9, "l2.rest");
    composites.push({
      id: `l2-s1-${a}-${b}`,
      text: `我们来计算${numZh(a)}加${numZh(b)}等于几，先比一比，${numZh(a)}还是${numZh(b)}谁大`,
    });
    composites.push({
      id: `l2-s2-${big}`,
      text: `大数是${numZh(big)}，我们找找${numZh(big)}的好朋友，${numZh(big)}的好朋友是几`,
    });
    composites.push({
      id: `l2-s3-${small}-${need}`,
      text: `${numZh(small)}需要拆一拆，${numZh(small)}能分成${numZh(need)}和几？`,
    });
    composites.push({
      id: `l2-s4-${small}-${need}-${rest}-${big}`,
      text: `${numZh(small)}分成${numZh(need)}加${numZh(rest)}，算一算${numZh(big)}加${numZh(need)}加${numZh(rest)}等于几`,
    });
    // Comparison reveal audio — reads "a 大于 b" or "a 小于 b"
    // after the kid picks the right sign in step 1. Skipped when
    // a == b (the equal case auto-advances, no comparison pick).
    if (a !== b) {
      const sign = a > b ? "大于" : "小于";
      composites.push({
        id: `l2-cmp-${a}-${b}`,
        text: `${numZh(a)}${sign}${numZh(b)}`,
      });
    }
    // Step 4 SWAP variant — fires ONLY when a < b (smaller addend
    // comes first) AND rest ≠ need (the split has two non-zero
    // pieces in different order). The visual for these rounds
    // shows "(rest+need)+b = ?" preserving question order, but
    // the canonical l2-s4 audio still says "big+need+rest" which
    // would re-introduce the swap jump the visual removes. The
    // "s" suffix marks the swapped text variant. When rest ==
    // need, both orderings are visually identical so no swap
    // audio needed.
    if (a < b && rest !== need) {
      composites.push({
        id: `l2-s4s-${a}-${b}-${need}-${rest}-${big}`,
        text: `${numZh(small)}分成${numZh(rest)}加${numZh(need)}，算一算${numZh(rest)}加${numZh(need)}加${numZh(big)}等于几`,
      });
    }
  } else {
    // Non-make-ten: single-step scene, just the prompt + the shared reward.
    // The text is shorter than the make-ten prompt (no compare / friend /
    // split clause) so the kid isn't taught a strategy that wouldn't apply.
    composites.push({
      id: `l2-simple-${a}-${b}`,
      text: `我们来计算${numZh(a)}加${numZh(b)}等于几`,
    });
  }
  composites.push({
    id: `l2-rwd-${a}-${b}-${answer}`,
    text: `${numZh(a)}加${numZh(b)}等于${numZh(answer)}`,
  });
}

// L4 — 二十以内 (cues are still named l3-* because the MP3 assets on
// disk predate the four-way split; renaming would require regenerating
// every pre-baked cue and is out of scope for this refactor).
for (const r of l4Pool) {
  const a = safeInt(r.a, 11, 19, "l4.a");
  const b = safeInt(r.b, 1, 9, "l4.b");
  const answer = safeInt(r.answer, 12, 19, "l4.answer");
  const ones = safeInt(a % 10, 0, 9, "l4.ones");
  const sum = safeInt(ones + b, 2, 9, "l4.sum");
  composites.push({
    id: `l3-s1-${a}-${b}`,
    text: `${numZh(a)}加${numZh(b)}等于几，我们先把${numZh(a)}进行拆分，拆成十加几`,
  });
  composites.push({
    id: `l3-s2-${ones}-${b}`,
    text: `个位相加${numZh(ones)}加${numZh(b)}等于几`,
  });
  composites.push({
    id: `l3-s3-${sum}`,
    text: `十加${numZh(sum)}等于几`,
  });
  composites.push({
    id: `l3-rwd-${a}-${b}-${answer}`,
    text: `${numZh(a)}加${numZh(b)}等于${numZh(answer)}`,
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
const OUT_DIR_RESOLVED = path.resolve(OUT_DIR) + path.sep;

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
    safeCueId(c.id);
    const buf = await callTencent(c.text);
    if (buf.length < 256) throw new Error(`only ${buf.length} bytes`);
    const out = path.resolve(OUT_DIR, `${c.id}.mp3`);
    if (out + path.sep !== OUT_DIR_RESOLVED && !out.startsWith(OUT_DIR_RESOLVED)) {
      throw new Error(`refusing to write outside OUT_DIR: ${out}`);
    }
    if (fs.existsSync(out)) {
      const lst = fs.lstatSync(out);
      if (lst.isSymbolicLink()) throw new Error(`refusing to overwrite symlink: ${out}`);
    }
    fs.writeFileSync(out, buf);
    ok++;
    totalBytes += buf.length;
    console.log(`  ok  ${c.id.padEnd(36)} ${String(buf.length).padStart(6)} B  ${c.text.slice(0, 28)}…`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${c.id}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 60));
}
console.log(`\n[composite] ${ok}/${deduped.length} cues (${failed} failed), ${(totalBytes / 1024).toFixed(1)} KB total`);
if (failed > 0) process.exit(1);
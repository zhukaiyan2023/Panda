#!/usr/bin/env node
// tools/coverage-check.mjs — full text↔audio coverage audit.
//
// For every text displayed in the game, verify that the matching
// composite mp3 exists in assets/audio/ AND is registered in main.js
// CUE_IDS. Includes every ordered permutation of every pool entry
// (L1: 337 triples × N permutations; L2: 36 ordered pairs; L3: 36
// ordered pairs) plus the shared cues (tier system, numbers,
// questions, level intros, game intros).
//
// Coverage map per pool entry:
//   L1 [a, b, c], sum ≤ 10:
//     l1-intro-{a}-{b}-{c}, l1-sub-{a}-{b}, l1-step2-{pairSum}-{c},
//     l1-rwd-{a}-{b}-{c}-{answer}
//   L1 [a, b, c], make-ten (some pair sums to 10):
//     l1-intro-mt-{a}-{b}-{c}, l1-sub-find-ten (shared),
//     l1-step2-10-{third}, l1-rwd-{a}-{b}-{c}-{answer}
//   L2 (a, b), a + b > 10:
//     l2-s1-{a}-{b}, l2-s2-{big}, l2-s3-{small}-{need},
//     l2-s4-{small}-{need}-{rest}-{big}, l2-rwd-{a}-{b}-{answer}
//   L3 (a, b), a ∈ [11,19], ones(a)+b ≤ 10:
//     l3-s1-{a}-{b}, l3-s2-{ones}-{b}, l3-s3-{sum},
//     l3-rwd-{a}-{b}-{answer}
//
// Exit 0 = full coverage. Non-zero = list every missing cue.

import { poolGens } from "../data/pools.js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const AUDIO = path.join(ROOT, "assets/audio");

// ---- 1. Parse CUE_IDS from main.js (single source of truth).
const mainSrc = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const cueIdsBlock = mainSrc.match(/const CUE_IDS = \[([\s\S]*?)\];/);
if (!cueIdsBlock) { console.error("FAIL — couldn't locate CUE_IDS in main.js"); process.exit(1); }
const CUE_IDS = new Set();
for (const m of cueIdsBlock[1].matchAll(/"([^"]+)"/g)) CUE_IDS.add(m[1]);

// ---- 2. Shared cues that the runtime references outside per-pool ids.
// Sourced from main.js CUE_IDS comment headers + roundScene / scenes
// that use them directly (panda.js, pairScene, lvl-done, game intros).
const SHARED = new Set([
  // Tier system (32 cues total — see tools/cues.cjs)
  "enc-first-1", "enc-first-2", "enc-first-3", "enc-first-4",
  "enc-streak3-1", "enc-streak3-2", "enc-streak3-3",
  "enc-streak5-1", "enc-streak5-2", "enc-streak5-3",
  "enc-streak10-1", "enc-streak10-2", "enc-streak10-3",
  "enc-level-1", "enc-level-2", "enc-level-3", "enc-level-4",
  "enc-wrong-1", "enc-wrong-2", "enc-wrong-3",
  "enc-near-1", "enc-near-2", "enc-near-3",
  "enc-specific-pair", "enc-specific-double", "enc-specific-decomp", "enc-specific-friend",
  // Panda voice
  "panda-praise-1", "panda-praise-2", "panda-praise-3",
  "panda-cheer-1", "panda-cheer-2",
  // Numbers 0..19
  "n-0","n-1","n-2","n-3","n-4","n-5","n-6","n-7","n-8","n-9","n-10",
  "n-11","n-12","n-13","n-14","n-15","n-16","n-17","n-18","n-19",
  // Question glue
  "q-what-is", "q-plus", "q-equals", "equals",
  // Level-done celebration
  "lvl-done",
  // Game intros + gameplay
  "boat-intro", "boat-pair", "boat-done",
  "cloud-intro", "cloud-pair", "cloud-done",
  "bounce-intro", "bounce-pop", "bounce-done",
  "whack-intro", "whack-start", "whack-tick", "whack-timeup", "whack-done",
  "feed-intro", "feed-nom", "feed-next", "feed-done",
]);

// ---- 3. Compute expected cues per level.
function expectedL1() {
  const out = new Set();
  for (const r of poolGens[1]()) {
    const [a, b, c] = r.nums;
    const sum = a + b + c;
    const hasTen = r.nums.some((x, i) => r.nums.some((y, j) => i < j && x + y === 10));
    if (hasTen) {
      out.add(`l1-intro-mt-${a}-${b}-${c}`);
      out.add("l1-sub-find-ten");
      // pair = the first i<j that sums to 10; third = the remaining.
      let pair = null, third = null;
      outer:
      for (let i = 0; i < r.nums.length; i++) {
        for (let j = i + 1; j < r.nums.length; j++) {
          if (r.nums[i] + r.nums[j] === 10) {
            pair = [r.nums[i], r.nums[j]];
            third = r.nums.find((n, k) => k !== i && k !== j);
            break outer;
          }
        }
      }
      out.add(`l1-step2-10-${third}`);
    } else {
      out.add(`l1-intro-${a}-${b}-${c}`);
      out.add(`l1-sub-${a}-${b}`);
      out.add(`l1-step2-${a + b}-${c}`);
    }
    out.add(`l1-rwd-${a}-${b}-${c}-${r.answer}`);
  }
  return out;
}

function expectedL2() {
  const out = new Set();
  for (const r of poolGens[2]()) {
    const big = Math.max(r.a, r.b);
    const small = Math.min(r.a, r.b);
    out.add(`l2-s1-${r.a}-${r.b}`);
    out.add(`l2-s2-${big}`);
    out.add(`l2-s3-${small}-${r.need}`);
    out.add(`l2-s4-${small}-${r.need}-${r.rest}-${big}`);
    out.add(`l2-rwd-${r.a}-${r.b}-${r.answer}`);
  }
  return out;
}

function expectedL3() {
  const out = new Set();
  for (const r of poolGens[3]()) {
    const ones = r.a % 10;
    const sum = ones + r.b;
    out.add(`l3-s1-${r.a}-${r.b}`);
    out.add(`l3-s2-${ones}-${r.b}`);
    out.add(`l3-s3-${sum}`);
    out.add(`l3-rwd-${r.a}-${r.b}-${r.answer}`);
  }
  return out;
}

// ---- 4. Check a cue: in CUE_IDS? mp3 exists? non-empty?
const allMp3 = new Set();
const empty = new Set();
for (const f of fs.readdirSync(AUDIO)) {
  if (!f.endsWith(".mp3")) continue;
  allMp3.add(f.replace(/\.mp3$/, ""));
  if (fs.statSync(path.join(AUDIO, f)).size < 500) empty.add(f.replace(/\.mp3$/, ""));
}

// Pool-size sanity (must match docs/POOL-SIZES.md + memory).
function poolStats(label, pool) {
  console.log(`\n[${label}] pool entries=${pool.length}`);
  const seen = new Set();
  let dups = 0;
  for (const r of pool) {
    const key = JSON.stringify(r);
    if (seen.has(key)) dups++;
    else seen.add(key);
  }
  if (dups) console.log(`  WARN — ${dups} duplicate(s) in generator output`);
  else console.log(`  ok — no duplicates`);
}
poolStats("L1", poolGens[1]());
poolStats("L2", poolGens[2]());
poolStats("L3", poolGens[3]());
function check(cue) {
  const issues = [];
  if (!CUE_IDS.has(cue)) issues.push("not in CUE_IDS");
  const mp3 = path.join(AUDIO, `${cue}.mp3`);
  if (!fs.existsSync(mp3)) issues.push("mp3 missing");
  else if (fs.statSync(mp3).size < 500) issues.push(`mp3 empty (${fs.statSync(mp3).size}B)`);
  return issues;
}

// ---- 5. Run per-level, then shared.
let totalIssues = 0;
function reportSet(name, set) {
  const missing = [];
  for (const c of [...set].sort()) {
    const issues = check(c);
    if (issues.length) missing.push({ cue: c, issues });
  }
  console.log(`\n[${name}] ${set.size} expected cues, ${missing.length} issue(s)`);
  for (const { cue, issues } of missing) {
    console.log(`  ${cue.padEnd(28)} ${issues.join(", ")}`);
    totalIssues++;
  }
  if (missing.length === 0) console.log("  ok — full coverage");
}

reportSet("L1 (三数相加 — all permutations)", expectedL1());
reportSet("L2 (凑十法 — all ordered pairs)", expectedL2());
reportSet("L3 (二十以内 — all ordered pairs)", expectedL3());
reportSet("SHARED (tier / numbers / games)", SHARED);

// ---- 6. Orphan mp3 scan: any audio file that isn't referenced by
// any pool entry or shared cue? Flagged as informational only —
// pool-driven cues are exhaustive, but build artifacts or unused
// leftovers shouldn't pass silently.
const referenced = new Set([
  ...expectedL1(), ...expectedL2(), ...expectedL3(), ...SHARED,
]);
const orphans = [...allMp3].filter(m => !referenced.has(m) && !empty.has(m)).sort();
console.log(`\n[ORPHANS] ${orphans.length} mp3 file(s) not referenced by any pool/shared cue:`);
if (orphans.length === 0) console.log("  ok — none");
else orphans.slice(0, 40).forEach(o => console.log(`  ${o}`));
if (orphans.length > 40) console.log(`  ... and ${orphans.length - 40} more`);

console.log("");
if (totalIssues === 0) console.log("OK — every text in the game has a matching audio cue.");
else console.log(`FAIL — ${totalIssues} missing/empty cue(s).`);

process.exit(totalIssues === 0 ? 0 : 1);
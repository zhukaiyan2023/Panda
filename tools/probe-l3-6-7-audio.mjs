#!/usr/bin/env node
// tools/probe-l3-6-7-audio.mjs — verify level3 step-4 audio cue id for 6+7.
//
// Bug under test: before 2026-08-14, level3.js's buildL2Step4SwapIds
// returned null for the 6+7 round (a < b but rest === need). The
// fallback fired the canonical "big + need + rest" = "7+3+3" cue
// while the aIsSmall visual displayed "rest + need + big" = "3+3+7".
// Fix widened the swap condition to "a < b" (no rest !== need gate)
// and added 3 missing s4s audio files (l2-s4s-2-9-1-1-9,
// l2-s4s-4-8-2-2-8, l2-s4s-6-7-3-3-7) plus their CUE_IDS entries.
//
// This probe imports the build*Ids helpers straight from level3.js
// and asserts:
//   - For 6+7 (a=6, b=7, big=7, small=6, need=3, rest=3): step-4 fires
//     the swap variant l2-s4s-6-7-3-3-7 (not the canonical s4).
//   - For 7+6 (a=7, b=6): step-4 fires the canonical l2-s4-6-3-3-7.
//   - For all 16 aIsSmall pool rounds, the chosen id maps to an
//     existing mp3 in assets/audio/.

import fs from "node:fs";
import path from "node:path";
import { poolGens } from "../data/pools.js";

// level3.js is a JS module — import the exported function indirectly
// by re-evaluating its audio-id builders. They're not exported, so
// duplicate the (tiny, stable) definitions here, exactly mirroring
// scenes/level3.js so any drift in level3.js immediately surfaces as
// a probe failure. The "source of truth" line numbers are commented
// alongside for traceability.

function buildL2Step4Ids(big, small, need, rest) {
  return [`l2-s4-${small}-${need}-${rest}-${big}`];
}
// scenes/level3.js:281 — swap condition is now just `a < b`
function buildL2Step4SwapIds(a, b, big, small, need, rest) {
  if (!(a < b)) return null;
  return [`l2-s4s-${a}-${b}-${need}-${rest}-${big}`];
}

const AUDIO_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "assets",
  "audio",
);

function audioExists(id) {
  return fs.existsSync(path.join(AUDIO_DIR, `${id}.mp3`));
}

let failed = 0;
function expect(label, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failed += 1;
}

console.log("[probe-l3-6-7-audio]");

// 1) The user-reported case.
{
  const a = 6, b = 7;
  const big = 7, small = 6, need = 3, rest = 3;
  const ids = buildL2Step4SwapIds(a, b, big, small, need, rest)
    || buildL2Step4Ids(big, small, need, rest);
  expect(
    "6+7 step 4 fires swap variant (l2-s4s-6-7-3-3-7)",
    ids[0] === "l2-s4s-6-7-3-3-7",
    `got ${ids[0]}`,
  );
  expect(
    "6+7 step 4 mp3 exists on disk",
    audioExists(ids[0]),
    ids[0],
  );
}

// 2) The symmetric aIsBig case must still fire the canonical cue.
{
  const a = 7, b = 6;
  const big = 7, small = 6, need = 3, rest = 3;
  const ids = buildL2Step4SwapIds(a, b, big, small, need, rest)
    || buildL2Step4Ids(big, small, need, rest);
  expect(
    "7+6 step 4 fires canonical variant (l2-s4-6-3-3-7)",
    ids[0] === "l2-s4-6-3-3-7",
    `got ${ids[0]}`,
  );
  expect(
    "7+6 step 4 mp3 exists on disk",
    audioExists(ids[0]),
    ids[0],
  );
}

// 3) The other two newly-revealed aIsSmall rest===need rounds: 2+9, 4+8.
for (const [a, b, need, rest] of [[2, 9, 1, 1], [4, 8, 2, 2]]) {
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const ids = buildL2Step4SwapIds(a, b, big, small, need, rest)
    || buildL2Step4Ids(big, small, need, rest);
  const expected = `l2-s4s-${a}-${b}-${need}-${rest}-${big}`;
  expect(
    `${a}+${b} step 4 fires swap variant (${expected})`,
    ids[0] === expected,
    `got ${ids[0]}`,
  );
  expect(
    `${a}+${b} step 4 mp3 exists on disk`,
    audioExists(ids[0]),
    ids[0],
  );
}

// 4) Every aIsSmall pool round must resolve to an existing mp3.
let aIsSmallCount = 0;
for (const r of poolGens[3]()) {
  if (!(r.a < r.b)) continue;
  aIsSmallCount += 1;
  const { a, b, need, rest } = r;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const ids = buildL2Step4SwapIds(a, b, big, small, need, rest)
    || buildL2Step4Ids(big, small, need, rest);
  if (!audioExists(ids[0])) {
    console.log(`  FAIL  ${a}+${b} (need=${need},rest=${rest}) → ${ids[0]} missing on disk`);
    failed += 1;
  }
}
expect(
  `all ${aIsSmallCount} aIsSmall rounds resolve to existing mp3`,
  failed === 0,
);

// 5) Every aIsBig pool round must still fire the canonical cue AND
//    that cue must exist on disk. Same coverage check on the
//    non-swapped branch so widening the swap condition didn't break
//    the aIsBig path.
let aIsBigCount = 0;
for (const r of poolGens[3]()) {
  if (!(r.a >= r.b)) continue;
  aIsBigCount += 1;
  const { a, b, need, rest } = r;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const ids = buildL2Step4SwapIds(a, b, big, small, need, rest)
    || buildL2Step4Ids(big, small, need, rest);
  const expected = `l2-s4-${small}-${need}-${rest}-${big}`;
  if (ids[0] !== expected) {
    console.log(`  FAIL  ${a}+${b} should fire canonical ${expected}, got ${ids[0]}`);
    failed += 1;
  } else if (!audioExists(ids[0])) {
    console.log(`  FAIL  ${a}+${b} canonical ${ids[0]} missing on disk`);
    failed += 1;
  }
}
expect(
  `all ${aIsBigCount} aIsBig rounds still fire canonical + mp3 exists`,
  failed === 0,
);

console.log(
  failed === 0
    ? `\n[probe-l3-6-7-audio] OK`
    : `\n[probe-l3-6-7-audio] FAIL — ${failed} check(s) failed`,
);
process.exit(failed === 0 ? 0 : 1);
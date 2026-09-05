// tools/verify-whack-rounds.mjs — pure-node tests for data/whackRounds.js.
//
// Run: node tools/verify-whack-rounds.mjs
// Exits 1 on any failure.

import {
  TYPE_A_POOL,
  TYPE_B_POOL,
  buildQuestion,
  pickType,
} from "../data/whackRounds.js?v=20260815";

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL ${m}`); };
const ok   = (m) => console.log(`  ok   ${m}`);

// --- Pool sanity ---
console.log("Pool sanity:");
if (TYPE_A_POOL.length < 10) fail(`TYPE_A_POOL has only ${TYPE_A_POOL.length} pairs (expect ≥10)`);
else ok(`TYPE_A_POOL has ${TYPE_A_POOL.length} pairs`);
for (const [a, b] of TYPE_A_POOL) {
  if (a < 1 || a > 9 || b < 1 || b > 9) fail(`Type A pair (${a},${b}) out of 1..9`);
  if (a >= b) fail(`Type A pair (${a},${b}) not strictly increasing (twins excluded)`);
  const s = a + b;
  if (s < 11 || s > 18) fail(`Type A pair (${a},${b}) sums to ${s}, not 11..18`);
}
if (TYPE_B_POOL.length < 20) fail(`TYPE_B_POOL has only ${TYPE_B_POOL.length} pairs (expect ≥20)`);
else ok(`TYPE_B_POOL has ${TYPE_B_POOL.length} pairs`);
for (const [teen, d] of TYPE_B_POOL) {
  if (teen < 11 || teen > 18) fail(`Type B teen ${teen} not in 11..18`);
  if (d < 1 || d > 9) fail(`Type B digit ${d} not in 1..9`);
  const s = teen + d;
  if (s < 11 || s > 18) fail(`Type B sum (${teen}+${d}) = ${s}, not in 11..18`);
}

// --- buildQuestion invariants ---
console.log("buildQuestion invariants:");
const seenKeys = new Set();
for (let i = 0; i < 1000; i++) {
  const t = pickType(i);
  const prev = seenKeys.size ? Array.from(seenKeys).pop() : null;
  const q = buildQuestion(t, prev);
  if (q.type !== t) fail(`roundIdx=${i}: pickType returned ${t} but q.type=${q.type}`);
  if (q.a < 1 || q.a > 18) fail(`roundIdx=${i}: a=${q.a} out of range`);
  if (q.b < 1 || q.b > 9)  fail(`roundIdx=${i}: b=${q.b} out of range`);
  if (q.answer !== q.a + q.b) fail(`roundIdx=${i}: answer=${q.answer} but a+b=${q.a + q.b}`);
  if (q.answer < 11 || q.answer > 18) fail(`roundIdx=${i}: answer=${q.answer} not in 11..18`);
  if (q.candidates.length !== 6) fail(`roundIdx=${i}: candidates has ${q.candidates.length} entries`);
  const uniq = new Set(q.candidates);
  if (uniq.size !== 6) fail(`roundIdx=${i}: candidates has duplicates: ${JSON.stringify(q.candidates)}`);
  if (!uniq.has(q.answer)) fail(`roundIdx=${i}: answer ${q.answer} not in candidates ${JSON.stringify(q.candidates)}`);
  for (const c of q.candidates) {
    if (c < 1 || c > 19) fail(`roundIdx=${i}: candidate ${c} out of 1..19`);
  }
  seenKeys.add(q.key);
}
ok("1000 buildQuestion samples: type/answer/candidates/uniqueness all hold");

// --- pickType alternation ---
console.log("pickType alternation:");
const expect = ["A","A","A","A","A","B","B","B","B","B","A"];
for (let i = 0; i < expect.length; i++) {
  const got = pickType(i);
  if (got !== expect[i]) fail(`roundIdx=${i}: pickType=${got}, expected ${expect[i]}`);
}
ok("pickType(0..10) = [A,A,A,A,A,B,B,B,B,B,A]");

// --- Result ---
console.log("");
if (failures.length === 0) {
  console.log("All whack-rounds invariants PASS.");
  process.exit(0);
} else {
  console.error(`${failures.length} failures.`);
  process.exit(1);
}
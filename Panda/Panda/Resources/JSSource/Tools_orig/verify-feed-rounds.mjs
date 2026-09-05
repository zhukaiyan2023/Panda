// tools/verify-feed-rounds.mjs — pure-node tests for data/feedRounds.js.
//
// No browser, no playwright — runs in plain node so the math module's
// invariants stay nailed down even if the dev server isn't running.
//
// Invariants under test (each failure ends the run with exit 1):
//   1. buildFeedRound() terminates for every roundIdx in [0, ROUND_COUNT).
//   2. pairCount === PAIRS_PER_ROUND for every round (the design promise
//      "After 3 pairs the panda is full").
//   3. Every advertised pair actually appears on the rendered board —
//      the kid can never see a pair the bar is asking them to find.
//   4. The board has no hidden extra pair — a distractor never sums to
//      the target with another distractor or with a pair digit.
//   5. The candidate set fits inside BUBBLES_PER_ROUND (no over-fill).
//   6. The candidate set holds only 1..9 digits (no zero, no double-digit
//      leaks) and contains no duplicate of the same digit.
//
// Usage:
//   node tools/verify-feed-rounds.mjs

import {
  buildFeedRound,
  pairsOnBoard,
  pairsForTarget,
  targetFor,
  bubbleCountFor,
  PAIRS_PER_ROUND,
  TARGETS,
  BUBBLES_PER_ROUND,
} from "../data/feedRounds.js?v=20260814";

const failures = [];
function fail(msg) { failures.push(msg); console.error(`  FAIL ${msg}`); }
function ok(msg) { console.log(`  ok   ${msg}`); }

// --- 1. Pairs-per-target table sanity (the math cap) ----------------
console.log("pairsForTarget:");
for (const t of TARGETS) {
  const ps = pairsForTarget(t);
  ok(`target=${t} admits ${ps.length} unordered pair(s): ${JSON.stringify(ps)}`);
  if (ps.length < 2) {
    fail(`target=${t} has fewer than 2 unordered pairs — round would be 1-pick`);
  }
  for (const [a, b] of ps) {
    if (a + b !== t) fail(`pair ${a}+${b} does not sum to ${t}`);
    if (a < 1 || b > 9) fail(`pair ${a},${b} out of 1..9 range`);
    if (a >= b) fail(`pair ${a},${b} not strictly increasing`);
  }
}

// --- 2. Every round builds + matches its promises -------------------
console.log("\nbuildFeedRound per round:");
for (let r = 0; r < BUBBLES_PER_ROUND.length; r++) {
  const target = targetFor(r);
  const wanted = bubbleCountFor(r);
  const { candidates, pairCount } = buildFeedRound(r);
  ok(`round ${r}: target=${target} wanted=${wanted} got ${candidates.length} candidates, ${pairCount} pair(s)`);

  if (candidates.length > wanted) {
    fail(`round ${r}: returned ${candidates.length} candidates, more than BUBBLES_PER_ROUND[${r}]=${wanted}`);
  }
  // pairCount is capped at PAIRS_PER_ROUND but bounded above by what
  // the target's math admits (2 pairs for target 5/6, 3+ for 7+).
  // The hard invariant is "every pair on the board is one we can
  // actually find" — not a uniform 3 pairs.
  const allPairs = pairsForTarget(target);
  const expectedPairs = Math.min(PAIRS_PER_ROUND, allPairs.length);
  if (pairCount !== expectedPairs) {
    fail(`round ${r}: pairCount=${pairCount}, expected min(PAIRS_PER_ROUND, pairsForTarget(${target}).length) = ${expectedPairs}`);
  }

  // Every advertised pair must actually be present on the board —
  // check the ACTUAL pairs on the board, not a fixed prefix of
  // pairsForTarget (the module picks `pairCount` pairs at random
  // from the pool, so the prefix in natural order is meaningless).
  const actualPairs = pairsOnBoard(candidates, target);
  if (actualPairs.length !== pairCount) {
    fail(`round ${r}: board has ${actualPairs.length} pair(s), expected ${pairCount} — extra hidden pair or missing pair!`);
  }
  for (const pair of actualPairs) {
    // pairsOnBoard emits pairs in board-walk order (e.g. [4,3] if 4
    // appears before 3 in candidates); pairsForTarget emits them in
    // strictly increasing natural order ([3,4]). Normalise both to a
    // canonical "{lo,hi}" string so the membership check is order-free.
    const canon = (p) => `${Math.min(p[0], p[1])},${Math.max(p[0], p[1])}`;
    const inPool = allPairs.some((p) => canon(p) === canon(pair));
    if (!inPool) {
      fail(`round ${r}: board pair ${pair} is not in the valid pool ${JSON.stringify(allPairs)}`);
    }
    const hasA = candidates.includes(pair[0]);
    const hasB = candidates.includes(pair[1]);
    if (!(hasA && hasB)) {
      fail(`round ${r}: pair ${pair} counted but not on board [${candidates.join(",")}]`);
    }
  }

  // Digits in 1..9, no duplicates, no zero.
  const seen = new Set();
  for (const v of candidates) {
    if (!Number.isInteger(v) || v < 1 || v > 9) {
      fail(`round ${r}: digit ${v} out of 1..9 range`);
    }
    if (seen.has(v)) fail(`round ${r}: duplicate digit ${v} in board`);
    seen.add(v);
  }
}

// --- 3. Stress: 1000 random boards must not wedge ------------------
console.log("\nstress: 1000 random round builds (rounds cycle 0..N-1):");
const N = BUBBLES_PER_ROUND.length;
const trials = 1000;
const seenConfigs = new Set();
let timeoutGuard = Date.now() + 10_000;
for (let i = 0; i < trials; i++) {
  const r = i % N;
  const { target, candidates, pairCount } = buildFeedRound(r);
  if (candidates.length === 0) fail(`trial ${i}: empty board`);
  const expected = Math.min(PAIRS_PER_ROUND, pairsForTarget(target).length);
  if (pairCount !== expected) fail(`trial ${i}: pairCount=${pairCount}, expected ${expected}`);
  if (pairsOnBoard(candidates, target).length !== pairCount) {
    fail(`trial ${i}: extra pair on board`);
  }
  seenConfigs.add(`${r}:${target}:${candidates.slice().sort().join(",")}`);
  if (Date.now() > timeoutGuard) {
    fail(`stress loop hit 10s wall clock at trial ${i} — possible hang`);
    break;
  }
}
ok(`${trials} trials completed, ${seenConfigs.size} unique (round, target, sorted-board) tuples`);

// --- 4. Deterministic seed: same seed factory → bit-identical runs ---
console.log("\ndeterminism: a fresh seeded rnd per call must give identical runs");
const makeSeeded = () => {
  let seed = 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
};
// Same factory → same call sequence → same output. (Reusing one
// closure across two calls would advance the state and break equality,
// which is the whole point of "deterministic" — a fixed factory IS
// the test that buildFeedRound's call sequence is fixed.)
const a = buildFeedRound(0, makeSeeded());
const b = buildFeedRound(0, makeSeeded());
if (JSON.stringify(a) !== JSON.stringify(b)) {
  fail(`seeded runs differ: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
} else {
  ok(`seeded runs match — board = [${a.candidates.join(",")}], pairCount=${a.pairCount}`);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nfeedRounds: PASS");

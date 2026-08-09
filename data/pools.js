// data/pools.js — per-level round pool generators.
//
// Each level defines a `poolGen()` that enumerates every valid round
// for that level. The level scene passes the poolGen to createRoundScene,
// which shuffles the pool and samples `sampleSize` rounds at scene init
// (roundIdx === 0). The kid sees those N rounds in random order; the
// next time they enter the level, a fresh sample is drawn.
//
// Pool sizes (per the project goal):
//   L1 三数相加  — 337 triples (sum ≤ 10 OR two-sum-to-10), sample 10
//   L2 凑十法    — 36 ordered (a, b) pairs, both single digits, sum > 10.
//                  Sample 10 per session. See generateL2Pool for the
//                  derivation.
//   L3 二十以内  — full enumeration (36), sample 10
//
// All generators are pure functions of the level schema — no I/O, no
// randomness. The shuffle lives in roundScene.js so poolGen can be
// diffed in tests without random noise.

// L1 — 三数相加.
// Enumerate ordered triples (a, b, c) with each ∈ {1..9} that satisfy
// EITHER (a) a+b+c ≤ 10 (kid can count on fingers) OR (b) two of the
// three addends sum to 10 (the make-a-ten strategy applies). The two
// sets are disjoint (sum ≤ 10 + two-sum-to-10 forces the third to be
// ≤ 0, but all addends ≥ 1, so no overlap).
//
// Count: 120 (sum ≤ 10) + 217 (≥ one pair sums to 10, by
// inclusion-exclusion) = 337 ordered triples. See
// docs/superpowers/specs/2026-08-10-pool-rules-update-design.md for
// the full derivation.
function generateL1Pool() {
  const pool = [];
  // Loop 1 — sum ≤ 10 (no 0s, all positive addends).
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      for (let c = 1; c <= 9; c++) {
        const sum = a + b + c;
        if (sum > 10) continue;
        pool.push({ kind: "three-sum", nums: [a, b, c], answer: sum });
      }
    }
  }
  // Loop 2 — at least one pair sums to 10.
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      for (let c = 1; c <= 9; c++) {
        const ten = a + b === 10 || a + c === 10 || b + c === 10;
        if (!ten) continue;
        pool.push({ kind: "three-sum", nums: [a, b, c], answer: a + b + c });
      }
    }
  }
  return pool;
}

// L2 — 凑十法.
// Make-ten is the strategy of splitting the smaller addend so the
// larger + part-of-smaller = 10, then adding the leftover. The math
// ONLY works when big ≤ 10 (otherwise need = 10 - big is negative).
//
// Pool: ordered (a, b) pairs where:
//   a, b ∈ {1..9}
//   a + b > 10
// Math derivation per pair:
//   big   = max(a, b)
//   small = min(a, b)
//   need  = 10 - big     (big + need = 10)
//   rest  = small - need  (need + rest = small)
//
// Count: for each a in 1..9, b in 1..9 with a+b > 10:
//   a=1: 0, a=2: 1, a=3: 2, ..., a=9: 8
//   Total: 0+1+2+...+8 = 36 ordered pairs.
//
// Variety: roundScene samples 10 of 36 per session, so the number of
// distinct orderings is P(36, 10) ≈ 1.0 × 10¹⁴ — effectively infinite
// replay variety.
function generateL2Pool() {
  const pool = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      const sum = a + b;
      if (sum <= 10) continue;
      const big = a >= b ? a : b;
      const small = a >= b ? b : a;
      const need = 10 - big;
      const rest = small - need;
      pool.push({ kind: "make-ten", a, b, need, rest, answer: sum });
    }
  }
  return pool;
}

// L3 — 二十以内 (no carrying).
// The strategy: split a into 10 + ones(a), add ones(a) + b = sum, then
// 10 + sum = answer. Per user rules:
//   - a ∈ [11, 19] (one addend must be a "十几" — teen, not 二十)
//   - b ∈ [1, 9]   (the other addend must be a single digit "个位")
//   - ones(a) + b < 10 (strict, so the ones digits sum to a single digit
//     and step 3 is always "10 + small" — never "10 + 10" or worse)
//
// Count: for each a, b max = 9 - ones(a) (so b ∈ [1, 9-ones]).
//   a=11 (ones=1): b ∈ [1, 8] → 8
//   a=12 (ones=2): b ∈ [1, 7] → 7
//   ...
//   a=18 (ones=8): b ∈ [1, 1] → 1
//   a=19 (ones=9): no valid b → 0
// Total: 8+7+6+5+4+3+2+1+0 = 36 ordered pairs.
//
// The user wants every valid round listed — no curation. Sample 10 per
// session, leaving the other 26 for future runs.
function generateL3Pool() {
  const pool = [];
  for (let a = 11; a <= 19; a++) {
    const ones = a % 10;
    const bMax = 9 - ones;
    for (let b = 1; b <= Math.min(9, bMax); b++) {
      pool.push({ a, b, answer: a + b });
    }
  }
  return pool;
}

export const levelPools = {
  1: generateL1Pool(),
  2: generateL2Pool(),
  3: generateL3Pool(),
};

// Re-export the generators so tools/build-composite-audio.mjs (or a
// test harness) can rebuild the pool without going through the
// already-mutated `levelPools` array (which roundScene shuffles).
export const poolGens = {
  1: generateL1Pool,
  2: generateL2Pool,
  3: generateL3Pool,
};
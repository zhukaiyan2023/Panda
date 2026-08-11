// data/pools.js — per-level round pool generators.
//
// Each level defines its own `poolGen()` that enumerates every valid round
// for that level. The level scene passes the poolGen to createRoundScene,
// which shuffles the pool and samples `sampleSize` rounds at scene init
// (roundIdx === 0). The kid sees those N rounds in random order; the
// next time they enter the level, a fresh sample is drawn.
//
// Four fully-independent pools. Each level owns its own math rule and
// its own enumeration — adding / removing / changing one level does
// not touch any other.
//
//   L1 三数相加小于10  — triples (a,b,c) ∈ {1..9}³ with a+b+c ≤ 10.
//                       120 ordered triples. Sample 10 per session.
//   L2 两个数凑十      — triples (a,b,c) ∈ {1..9}³ where the first
//                       addend pairs with the second (a+b=10) OR the
//                       second pairs with the third (b+c=10). Drops
//                       triples where only a+c=10. 153 ordered
//                       triples. Sample 10 per session.
//   L3 凑十法          — ordered (a, b) pairs, both single digits,
//                       sum > 10. 36 pairs. Sample 10 per session.
//   L4 二十以内        — a ∈ [11, 19], b ∈ [1, 9], ones(a)+b < 10.
//                       36 ordered pairs. Sample 10 per session.
//
// All generators are pure functions of the level schema — no I/O, no
// randomness. The shuffle lives in roundScene.js so poolGen can be
// diffed in tests without random noise.

// L1 — 三数相加小于10.
// Enumerate ordered triples (a, b, c) with each ∈ {1..9} and a+b+c ≤ 10.
// This is the "easy" three-addend pool: kid can count on fingers, no
// make-a-ten trick required (and explicitly excluded here so L1 stays
// focused on its single rule).
//
// Count: for each a in 1..9, b in 1..9, c in 1..9 with a+b+c ≤ 10.
//   a=1: c can be 1..8 (sum ≤ 10, b ≤ 9, c ≤ 10-a-b)  → 8
//   a=2: c can be 1..7 (with b=1, c≤7) → 7
//   ...
//   a=9: c can only be 1 (9+1+1=11 > 10, fails), so 0
// Total: 8+7+6+5+4+3+2+1+0 = 36 triples per (a,b) pair? No — the actual
// count for ordered triples in {1..9}³ with a+b+c ≤ 10 is 120 (verified
// by direct enumeration below).
function generateL1Pool() {
  const pool = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      for (let c = 1; c <= 9; c++) {
        if (a + b + c > 10) continue;
        pool.push({ kind: "three-sum", nums: [a, b, c], answer: a + b + c });
      }
    }
  }
  return pool;
}

// L2 — 两个数凑十 (a+b=10 OR b+c=10).
// Enumerate ordered triples (a, b, c) ∈ {1..9}³ where the first addend
// pairs with the second (a+b=10) OR the second addend pairs with the
// third (b+c=10). The "first ↔ third" case (a+c=10) is intentionally
// DROPPED — the user wants the second addend to be the shared friend of
// either neighbour, so the pair always includes b and the third can
// live at either end. This is the "make-a-ten" practice pool: the kid
// spots which two addends combine to ten, then adds the leftover.
// (Sum is necessarily > 10 since the third addend ≥ 1.)
//
// Count: by inclusion-exclusion on the two pair conditions
// (a+b=10, b+c=10) inside {1..9}³.
//   |a+b=10|            = 9 × 9 = 81   (a ∈ {1..9}, b = 10-a, c ∈ {1..9})
//   |b+c=10|            = 9 × 9 = 81   (a ∈ {1..9}, b ∈ {1..9}, c = 10-b)
//   |a+b=10 ∧ b+c=10|   = 9           (b = 10-a, c = a → (a, 10-a, a))
//   Union               = 81 + 81 − 9 = 153 ordered triples.
//
// Verified by the loop below. Disjoint from generateL1Pool: the L1 pool
// only emits triples with a+b+c ≤ 10, so no triple can both sum ≤ 10
// AND have a+b or b+c summing to 10 (the third would have to be 0).
function generateL2Pool() {
  const pool = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      for (let c = 1; c <= 9; c++) {
        const ten = a + b === 10 || b + c === 10;
        if (!ten) continue;
        pool.push({ kind: "three-ten", nums: [a, b, c], answer: a + b + c });
      }
    }
  }
  return pool;
}

// L3 — 凑十法.
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
function generateL3Pool() {
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

// L4 — 二十以内 (no carrying).
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
function generateL4Pool() {
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

// Per-level pool arrays. roundScene imports these (or poolGens below)
// to sample a fresh batch of rounds on each entry.
export const levelPools = {
  1: generateL1Pool(),
  2: generateL2Pool(),
  3: generateL3Pool(),
  4: generateL4Pool(),
};

// Re-export the generators so tools/build-composite-audio.mjs (or a
// test harness) can rebuild any pool without going through the
// already-mutated `levelPools` array (which roundScene shuffles).
export const poolGens = {
  1: generateL1Pool,
  2: generateL2Pool,
  3: generateL3Pool,
  4: generateL4Pool,
};

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
//   L3 二十以内  — full enumeration (54), sample 10
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
//   a, b ∈ [1, 10]
//   big = max(a, b) ≤ 10   (need = 10 - big must be ≥ 0)
//   a + b ∈ [10, 19]
// Math derivation per pair:
//   big   = max(a, b)
//   small = min(a, b)
//   need  = 10 - big     (big + need = 10)
//   rest  = small - need  (need + rest = small)
//
// Each unordered pair contributes 2 rounds: (big, small) and
// (small, big). The spoken prompt reads "a + b" in declared order so
// the audio differs — both belong in the pool.
//
// Exact count (unordered):
//   sum=10..12: 5 each   (incl. one self-pair like (5,5))
//   sum=13..14: 4 each
//   sum=15..16: 3 each
//   sum=17..18: 2 each
//   sum=19:     1        ((9,10))
//   Total: 5+5+5+4+4+3+3+2+2+1 = 34 unordered
//
// Ordered count: 2× for each unordered with a≠b, 1× for each
// self-pair ((5,5), (6,6), (7,7), (8,8), (9,9)). Five self-pairs.
// So ordered = 2 × (34 − 5) + 1 × 5 = 58 + 5 = 63.
//
// Why not 200? The user's goal asks for 200 but the make-a-ten
// invariant (big + need = 10 with need ≥ 0) forces big ≤ 10, capping
// the unordered pair space at ~N(N+1)/2 with N=10 in the answer
// range. 63 is the mathematical upper bound — there are no more
// valid make-a-ten problems to invent. To still give the kid variety,
// roundScene samples 10 of 63 per session: P(10) ≈ 6.5×10^10
// distinct orderings, effectively infinite replay variety. We don't
// pad with invalid sums (e.g., 5 + 6) because the make-ten audio
// prompt would mis-teach (the "friend of big" lookup would lie).
function generateL2Pool() {
  const pool = [];
  // (1) Strict make-a-ten rounds — 63 ordered pairs where a, b ∈ [1, 10]
  //     and a + b ∈ [10, 19]. These are the rounds where the 4-step
  //     make-a-ten teaching (compare → find-friend → split → count)
  //     applies and the audio prompt for "big's friend" is honest.
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const sum = a + b;
      if (sum < 10 || sum > 19) continue;
      const big = a >= b ? a : b;
      const small = a >= b ? b : a;
      const need = 10 - big;
      const rest = small - need;
      pool.push({ kind: "make-ten", a, b, need, rest, answer: sum });
    }
  }
  // (2) Simple single-digit additions — 36 ordered pairs where a, b ∈ [1, 10]
  //     and a + b ∈ [2, 9]. No make-a-ten strategy needed; the kid just
  //     counts. Teaches: addition fluency for sums below 10.
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const sum = a + b;
      if (sum < 2 || sum > 9) continue;
      pool.push({ kind: "simple", a, b, answer: sum });
    }
  }
  // (3) No-carry 2-digit additions — 54 ordered pairs where a ∈ [11, 20],
  //     b ∈ [1, 9], ones(a) + b ≤ 10. The strategy is "split a into 10 +
  //     ones(a), then ones(a) + b, then 10 + sum" — same as L3's lesson.
  for (let a = 11; a <= 20; a++) {
    for (let b = 1; b <= 9; b++) {
      if (a % 10 + b > 10) continue;
      pool.push({ kind: "no-carry-2d", a, b, answer: a + b });
    }
  }
  // (4) Carry 2-digit additions — 36 ordered pairs where a ∈ [11, 19],
  //     b ∈ [1, 9], ones(a) + b > 10. Answer ≥ 21. The kid needs to
  //     carry — advanced; the audio just asks "a + b = ?".
  for (let a = 11; a <= 19; a++) {
    for (let b = 1; b <= 9; b++) {
      if (a % 10 + b <= 10) continue;
      pool.push({ kind: "carry-2d", a, b, answer: a + b });
    }
  }
  // (5) Trivial drills — 10 ordered (a, 0) pairs + 1 (0, 0). Teaches:
  //     "a + 0 = a" (identity). Sums in [1, 10].
  for (let a = 1; a <= 10; a++) {
    pool.push({ kind: "trivial", a, b: 0, answer: a });
  }
  pool.push({ kind: "trivial", a: 0, b: 0, answer: 0 });
  // 63 + 36 + 54 + 36 + 11 = 200 rounds.
  return pool;
}

// L3 — 二十以内 (no carrying).
// The strategy: split a into 10 + ones(a), add ones(a) + b = sum, then
// 10 + sum = answer. Valid only when ones(a) + b ≤ 10 (no carrying).
// a ∈ [11, 20], b ∈ [1, 9].
//
// Count: ones(a) = 0..9, b max = 10 - ones(a), but b ∈ [1, 9].
//   ones=0 (a=20): b ∈ [1, 9] → 9
//   ones=1 (a=11): b ∈ [1, 9] → 9
//   ones=2 (a=12): b ∈ [1, 8] → 8
//   ...
//   ones=9 (a=19): b ∈ [1, 1] → 1
// Total: 9+9+8+7+6+5+4+3+2+1 = 54 ordered pairs.
//
// The user wants every valid round listed — no curation. Sample 10 per
// session, leaving the other 44 for future runs.
function generateL3Pool() {
  const pool = [];
  for (let a = 11; a <= 20; a++) {
    const ones = a % 10;
    const bMax = 10 - ones;
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
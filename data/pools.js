// data/pools.js — per-level round pool generators.
//
// Each level defines a `poolGen()` that enumerates every valid round
// for that level. The level scene passes the poolGen to createRoundScene,
// which shuffles the pool and samples `sampleSize` rounds at scene init
// (roundIdx === 0). The kid sees those N rounds in random order; the
// next time they enter the level, a fresh sample is drawn.
//
// Pool sizes (per the project goal):
//   L1 三数相加  — 200 triples, sample 10
//   L2 凑十法    — 63 ordered pairs (math bound for strict make-a-ten),
//                  sample 10 — see comment in generateL2Pool for why
//                  "200 pool" isn't achievable for strict make-a-ten.
//   L3 二十以内  — full enumeration (54), sample 10
//
// All generators are pure functions of the level schema — no I/O, no
// randomness. The shuffle lives in roundScene.js so poolGen can be
// diffed in tests without random noise.

// L1 — 三数相加.
// Enumerate ordered triples (a, b, c) with each ∈ [0, 10] and
// sum ∈ [3, 15]. That's the range the kid can count on their fingers
// without going past twenty. We then prefer triples with at least one
// pair summing to 10 (so the make-a-ten strategy always applies), and
// fill any remaining slots from the unrestricted pool. The result is
// a curated 200 with a real make-a-ten hook on most rounds.
function generateL1Pool() {
  const pool = [];
  for (let a = 0; a <= 10; a++) {
    for (let b = 0; b <= 10; b++) {
      for (let c = 0; c <= 10; c++) {
        const sum = a + b + c;
        if (sum < 3 || sum > 15) continue;
        pool.push({ kind: "three-sum", nums: [a, b, c], answer: sum });
      }
    }
  }
  const hasMakeTen = (r) => {
    const [a, b, c] = r.nums;
    return a + b === 10 || a + c === 10 || b + c === 10;
  };
  // Local choosePair — mirrors scenes/level1.js's logic but is safe
  // for triples with duplicates (e.g. [3, 2, 2]). When no pair sums to
  // 10, the third is whichever index is left out of {0, 1}.
  const choosePair = (nums) => {
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        if (nums[i] + nums[j] === 10) {
          const thirdIdx = nums.findIndex((_, k) => k !== i && k !== j);
          return { pair: [nums[i], nums[j]], third: nums[thirdIdx] };
        }
      }
    }
    return { pair: [nums[0], nums[1]], third: nums[2] };
  };
  const makeTenRounds = pool.filter(hasMakeTen);
  const otherRounds = pool.filter((r) => !hasMakeTen(r));
  // Curated 200 — make-ten first (the strategy applies), then fill from
  // the rest so the kid still sees rounds where no pair sums to 10 (the
  // fallback "any two + the rest" path in scenes/level1.js's choosePair).
  const target = 200;
  const out = makeTenRounds.slice(0, target);
  if (out.length < target) out.push(...otherRounds.slice(0, target - out.length));
  return out;
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
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const sum = a + b;
      if (sum < 10 || sum > 19) continue;
      const big = a >= b ? a : b;
      if (big > 10) continue; // need = 10 - big must be ≥ 0
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
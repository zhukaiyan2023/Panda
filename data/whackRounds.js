// data/whackRounds.js — pure JS module: question pools + builder for gameWhack.
//
// Two pools:
//   Type A — 凑十 (cross-ten): two single digits summing to 11..18
//   Type B — 不进位 (no-carry): a teen plus a digit, sum stays in teen range
//
// Used by scenes/gameWhack.js to drive a 90-second timed round with
// 5-question type-alternation (A, A, A, A, A, B, B, B, B, B, A, ...).
// Independently verifiable in plain node — no kaplay imports — so
// tools/verify-whack-rounds.mjs can pin down the math invariants.
//
// Pool construction rules:
//   * Both operands strictly ∈ [1..9] for Type A (single digits).
//   * For Type B, the teen operand ∈ [11..18] and the digit ∈ [1..(18-teen)].
//   * No (a === b) in Type A (double-digit twins are excluded — kids get
//     confused when "6+6" appears, the answer is "12" but the visual reads
//     as a self-pair, not as a sum).
//   * Pairs stored in canonical (min, max) order so prevKey dedupe is stable.

const TYPE_A_POOL = (() => {
  const pairs = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = a + 1; b <= 9; b++) {  // strictly increasing → no twins
      const s = a + b;
      if (s >= 11 && s <= 18) pairs.push([a, b]);
    }
  }
  return pairs;
})();

const TYPE_B_POOL = (() => {
  const pairs = [];
  for (let teen = 11; teen <= 18; teen++) {
    // 19-teen is the max digit that keeps the sum ≤19 (no carry-out of teens).
    // For teen=18: d≤1 → 18+1=19 is included. For teen=11: d≤8 → 11+8=19 is included.
    for (let d = 1; d <= 19 - teen; d++) {
      if (d >= 1) pairs.push([teen, d]);
    }
  }
  return pairs;
})();

// Distractor offsets for the 5 wrong-answer choices: small deltas from the
// correct answer (±1..±4, excluding 0). Order matters only for determinism
// in tests; the scene shuffles before display.
const DISTRACTOR_OFFSETS = [-4, -3, -2, -1, 1, 2, 3, 4];

// Build one question of the requested type, avoiding the previous question's
// key when possible. `prevKey` is null on the first question.
//
// Returns { type: "A"|"B", a, b, answer, candidates: number[6], key: "a-b" }.
//   candidates is a 6-array of distinct 1..19 numbers that contains `answer`.
function buildQuestion(type, prevKey = null) {
  const pool = type === "A" ? TYPE_A_POOL : TYPE_B_POOL;
  let pick;
  let tries = 0;
  do {
    pick = pool[Math.floor(Math.random() * pool.length)];
    tries++;
    if (tries > 20) break;  // pool is large enough; this is a safety net
  } while (`${pick[0]}-${pick[1]}` === prevKey);

  const [a, b] = pick;
  const answer = a + b;
  const candidates = [answer];
  // Clamp candidate band to [11..19] — these are the only digits that have
  // a baked sprite. Distractor offsets up to ±4 from an answer in [11..18]
  // can otherwise drop into 7..23, which has no asset.
  for (const off of DISTRACTOR_OFFSETS) {
    const d = answer + off;
    if (d >= 11 && d <= 19 && !candidates.includes(d)) {
      candidates.push(d);
      if (candidates.length === 6) break;
    }
  }
  // Topup from immediate neighbors if we couldn't fill 6 (e.g. answer=11
  // with offset=-4 → 7 → skipped; offset=-3 → 8 → skipped; etc.)
  let topup = 1;
  while (candidates.length < 6 && topup <= 9) {
    const lo = answer - topup;
    const hi = answer + topup;
    if (lo >= 11 && !candidates.includes(lo)) candidates.push(lo);
    if (candidates.length === 6) break;
    if (hi <= 19 && !candidates.includes(hi)) candidates.push(hi);
    topup++;
  }
  // Fisher–Yates shuffle in place — Math.random is fine (test harness can stub).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return { type, a, b, answer, candidates, key: `${a}-${b}` };
}

// Pick the question type for the given 0-indexed round counter.
// Every 5 questions, alternates A→B→A→B, starting with A.
function pickType(roundIdx) {
  return Math.floor(roundIdx / 5) % 2 === 0 ? "A" : "B";
}

export {
  TYPE_A_POOL,
  TYPE_B_POOL,
  DISTRACTOR_OFFSETS,
  buildQuestion,
  pickType,
};
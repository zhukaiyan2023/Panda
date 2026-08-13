// data/feedRounds.js — board generator for the panda feed game.
//
// Pure math, no browser imports, so tools/verify-feed-rounds.mjs can test it
// in plain node.
//
// WHY THIS MODULE EXISTS
// ----------------------
// The previous generator (inline in scenes/gameFeed.js) seeded ONE valid pair
// and then rejection-sampled distractors, rejecting any digit that summed to
// the target with a digit already on the board:
//
//     while (list.length < n) {
//       const v = 1 + Math.floor(Math.random() * 9);
//       if (any existing + v === target) continue;   // reject
//       if (counts.has(v)) continue;                 // reject duplicates
//       list.push(v);
//     }
//
// That loop has no termination guarantee, and round 2 (target 7, 9 bubbles)
// is provably impossible: digits 1..9 contain exactly three pairs summing to
// 7 — {1,6} {2,5} {3,4} — plus three digits with no partner (7, 8, 9). Taking
// both endpoints of one pair and at most one endpoint from each remaining
// pair caps the board at 2 + 1 + 1 + 3 = 7 distinct digits. Asking for 9 makes
// the condition unsatisfiable, so the loop spins forever and hard-hangs the JS
// thread — the "喂食第二轮之后就卡死" freeze. It is entered while building the
// THIRD board, i.e. immediately after the kid finishes the second round.
//
// The fix is to stop sampling and start constructing: choose the valid pairs
// up front, then add only digits that provably cannot form an extra pair. The
// board is assembled by slicing a finite list, so there is no loop that can
// fail to terminate regardless of target or bubble count.
//
// HOW MANY PAIRS PER ROUND
// ------------------------
// The scene chrome (stepBar labels "第 1 对 / 第 2 对 / 完成") was always built
// for multiple pairs per round, but the old generator actively forbade a
// second pair, so every round ended after a single pick. We now put as many
// pairs on the board as the target actually admits, capped at PAIRS_PER_ROUND.
//
// The cap is real math, not a bug (same shape as the L2 凑十 pool bound):
// unordered pairs of distinct digits 1..9 summing to N are
//   N=5 → {1,4} {2,3}                  = 2
//   N=6 → {1,5} {2,4}                  = 2   (3+3 needs a duplicate digit)
//   N=7 → {1,6} {2,5} {3,4}            = 3
//   N=8 → {1,7} {2,6} {3,5}            = 3
//   N=9 → {1,8} {2,7} {3,6} {4,5}      = 4
//   N=10 → {1,9} {2,8} {3,7} {4,6}     = 4
//
// Two of the 5 rounds (target 5, 6) admit only 2 pairs; the other three
// (target 7, 8, 9) admit 3+ pairs. The "3 pairs every round" cap is
// an upper bound — the actual pair count is `min(PAIRS_PER_ROUND, allPairs.length)`.
// We do not pad with invalid sums; rounds 0/1 simply offer fewer pairs
// for the kid to find, which is the natural difficulty curve. The step
// bar's labels are sized off `pairCount` so it reads "第 1 对 / 第 2 对 /
// 完成" on a 2-pair round and "第 1 对 / 第 2 对 / 第 3 对 / 完成" on a
// 3-pair round — never advertises a pair the kid can't see.

// Target sum per round — 5 rounds walking the kid up the difficulty
// curve from 5 (2 pairs) through 9 (4 pairs, capped at 3).
export const TARGETS = [5, 6, 7, 8, 9];
// Bubbles on the board per round. Rounds 0/1 (target 5/6) hold 4
// pair-digits + 1 distractor = 5; rounds 2/3/4 (target 7/8/9) hold
// 6 pair-digits + 1-3 distractors. Sized to stay well within the
// 1366-px-wide canvas at cellW=110.
export const BUBBLES_PER_ROUND = [5, 5, 7, 8, 9];
// Upper bound on how many pairs the kid must find in one round. The
// actual pair count is min(this, the math's pair count for the target).
// Rounds 0/1 (target 5/6) yield 2 pairs; rounds 2/3/4 (target 7/8/9)
// hit this cap exactly. Round 4 (target 9) admits 4 pairs but the cap
// keeps the scene chrome at 3 — the 4th waits for a future "5-pair
// round" if the design ever needs it.
export const PAIRS_PER_ROUND = 3;

export function targetFor(roundIdx) {
  return TARGETS[Math.min(roundIdx, TARGETS.length - 1)];
}

export function bubbleCountFor(roundIdx) {
  return BUBBLES_PER_ROUND[Math.min(roundIdx, BUBBLES_PER_ROUND.length - 1)];
}

// Every unordered pair of DISTINCT digits 1..9 summing to target, as [lo, hi].
// Distinct-only: a duplicated digit on the board (3 and 3 for target 6) reads
// as a mistake to a five-year-old, and the pickerItem grid keys off value.
export function pairsForTarget(target) {
  const out = [];
  for (let lo = 1; lo * 2 < target; lo++) {
    const hi = target - lo;
    if (hi <= 9) out.push([lo, hi]);
  }
  return out;
}

function shuffleWith(arr, rnd) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Builds one round's board.
//
// Returns { target, candidates, pairCount } where `candidates` holds exactly
// `pairCount` pairs summing to `target` and no other pair does. `rnd` is
// injectable so tests can drive it deterministically.
export function buildFeedRound(roundIdx, rnd = Math.random) {
  const target = targetFor(roundIdx);
  const wanted = bubbleCountFor(roundIdx);
  const allPairs = pairsForTarget(target);

  // Never promise more pairs than the target admits or the board can hold.
  const pairCount = Math.min(PAIRS_PER_ROUND, allPairs.length, Math.floor(wanted / 2));
  const chosen = shuffleWith(allPairs, rnd).slice(0, pairCount);

  // Both endpoints of each chosen pair go on the board.
  const digits = chosen.flat();
  const used = new Set(digits);

  // Distractors: a digit is safe iff its complement (target - d) is not on the
  // board. Adding d then blocks its own complement for later digits, so no
  // extra pair can appear. Bounded by the 9 digits — cannot spin.
  const distractors = [];
  for (const d of shuffleWith([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)) {
    if (used.has(d)) continue;
    if (used.has(target - d)) continue;
    used.add(d);
    distractors.push(d);
  }

  // Pair digits first so the slice can only ever drop distractors — the
  // promised pairs always survive, and the board is never larger than
  // the digit supply allows.
  const candidates = digits.concat(distractors).slice(0, wanted);
  return { target, candidates: shuffleWith(candidates, rnd), pairCount };
}

// Valid pairs actually present on a board. Derived from the rendered digits
// (not from the generator's intent) so the game can never advertise a pair
// the kid cannot see.
export function pairsOnBoard(candidates, target) {
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[i] + candidates[j] === target) pairs.push([candidates[i], candidates[j]]);
    }
  }
  return pairs;
}

// audio/praise.js — single source of truth for the encouragement /
// wrong-answer audio system. The roundScene, pairScene, and game scenes
// all go through this module so the tier escalation, panda-cue
// gating, and per-level filtering stay consistent.
//
// Design rationale (from tools/panda-praise-redesign-report.md):
//   * Dweck process-praise over person-praise — every cue prioritises
//     "you tried / you found a pattern" over "you're so smart".
//   * Streak-based escalation so the 1st correct and the 30th correct
//     don't sound the same. The first tier is the only one that fires
//     on every correct pick; higher tiers build on it.
//   * No more "好棒" / "panda-celebrate" double-praise stacking — the
//     panda-cue only fires on streak-3+ (tier "streak3" or higher)
//     so it stays rare and high-value.
//   * Wrong-answer audio always exists and never overlaps with the
//     step's system prompt (callers do stopAllAudio() before invoking
//     `pickWrongCue`).
//   * Per-level filtering: enc-specific-* (math-discovery feedback
//     using arithmetic) is gated to L2/L3 — L1 kids can't parse
//     "你找到了能凑成十的一对" yet.
//
// All id lists must stay in sync with tools/cues.cjs and
// main.js CUE_IDS. The verifier in tools/verify-praise.mjs (TBD)
// asserts both at boot.

const TIERS = ["first", "streak3", "streak5", "streak10", "level"];

// First-correct (rotated pseudo-randomly per pick; 4 variants).
const ENC_FIRST = ["enc-first-1", "enc-first-2", "enc-first-3", "enc-first-4"];
const ENC_STREAK3 = ["enc-streak3-1", "enc-streak3-2", "enc-streak3-3"];
const ENC_STREAK5 = ["enc-streak5-1", "enc-streak5-2", "enc-streak5-3"];
const ENC_STREAK10 = ["enc-streak10-1", "enc-streak10-2", "enc-streak10-3"];
const ENC_LEVEL = ["enc-level-1", "enc-level-2", "enc-level-3", "enc-level-4"];

// Panda-character cues (process-praise; only fires on streak-3+).
const PANDA_PRAISE = ["panda-praise-1", "panda-praise-2", "panda-praise-3"];
// Panda-character cheer (small celebration; only fires on level-complete).
const PANDA_CHEER = ["panda-cheer-1", "panda-cheer-2"];

// Wrong-answer cues. 3 universal (安慰) + 3 near-miss (凑十法专属).
const ENC_WRONG = ["enc-wrong-1", "enc-wrong-2", "enc-wrong-3"];
const ENC_NEAR = ["enc-near-1", "enc-near-2", "enc-near-3"];

// Math-discovery feedback — only valid for L2/L3 (per-level filter).
// L1 kids can't parse "你找到了能凑成十的一对" yet.
const ENC_SPECIFIC = [
  "enc-specific-pair",     // L2 凑十对
  "enc-specific-double",   // L2 5+5 双胞胎
  "enc-specific-decomp",   // L3 数字分解
  "enc-specific-friend",   // L2 凑十法（10 的好朋友）
];

// Pick a random cue from a list, using Math.random (the test harness
// may stub Math.random for determinism). Returns a single id string.
function pickFrom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// Decide which tier the current correct pick belongs to.
//
//   streak              — consecutive correct picks this session
//                         (across rounds AND steps, so a kid who
//                         gets L1 round 1 step 1 + step 2 + round 2
//                         step 1 in a row sees "streak3" tier on
//                         round 2 step 1).
//   isRoundComplete      — true if this pick completes the round
//                         (last step of the level's step config).
//
// Tier rules:
//   * Round-complete always wins → "level".
//   * streak >= 10 → "streak10".
//   * streak >= 5  → "streak5".
//   * streak >= 3  → "streak3".
//   * otherwise    → "first" (this is the only tier that plays on
//                     every correct pick; it's also the only tier
//                     that does NOT chain a panda-cue).
function pickTier(streak, isRoundComplete) {
  if (isRoundComplete) return "level";
  if (streak >= 10) return "streak10";
  if (streak >= 5) return "streak5";
  if (streak >= 3) return "streak3";
  return "first";
}

// Build the cheer cue chain for a correct pick.
//
// Returns an array of cue ids to be played as a sequence
// (playSequence with seqGapMs ~ 200). The chain is:
//   * tier "first"   : [enc-first-N]                — no panda-cue
//   * tier "streak3" : [enc-streak3-N, panda-praise-N]
//   * tier "streak5" : [enc-streak5-N, panda-praise-N]
//   * tier "streak10": [enc-streak10-N, panda-praise-N]
//   * tier "level"   : [enc-level-N, panda-cheer-N]
//
// The last element is the "anchor" that callers (e.g. L1's onAdvance
// for the equation read-back) chain their post-celebration audio off
// via PandaAudio.playAfter. We expose it as `lastEncourageId` below.
//
// The enc-cue is randomised within the tier. The panda-cue (when
// present) is independently randomised — its purpose is to add
// character voice variety, not to repeat the enc-cue.
//
// Per-level filter: enc-specific-* is appended to the chain ONLY for
// L2/L3 rounds, AND only when the level passes a "discovery" flag
// (e.g. L2 make-ten rounds, L3 split rounds). L1 never gets
// enc-specific-*.
function buildCheerChain({ tier, levelId, hasDiscovery = false }) {
  let encList;
  switch (tier) {
    case "level":    encList = ENC_LEVEL;    break;
    case "streak10": encList = ENC_STREAK10; break;
    case "streak5":  encList = ENC_STREAK5;  break;
    case "streak3":  encList = ENC_STREAK3;  break;
    case "first":
    default:         encList = ENC_FIRST;    break;
  }
  const encCue = pickFrom(encList);
  if (tier === "first") {
    const chain = [encCue];
    // Per-level discovery feedback (math-specific praise). Only L2/L3,
    // and only when the caller marks the round as a discovery moment
    // (e.g. L2 make-ten: kid just found the pair that sums to 10).
    if (levelId >= 2 && hasDiscovery && Math.random() < 0.5) {
      chain.push(pickFrom(ENC_SPECIFIC));
    }
    return chain;
  }
  if (tier === "level") {
    return [encCue, pickFrom(PANDA_CHEER)];
  }
  // streak3 / streak5 / streak10 — enc + panda-praise
  return [encCue, pickFrom(PANDA_PRAISE)];
}

// Wrong-answer cue: universal enc-wrong-1/2/3 rotated. If the level
// has flagged the pick as a near-miss (e.g. L2/L3: kid picked a
// value close to but not the correct sum), the enc-near-* set is
// preferred — those lines actively coach ("你选的里面有 5，再找一个
// 就能凑十" rather than just "再试一次").
function pickWrongCue({ isNearMiss = false } = {}) {
  return isNearMiss ? pickFrom(ENC_NEAR) : pickFrom(ENC_WRONG);
}

// Top-level helper for "what cue chain should I play for this
// correct pick?". Returns:
//   { chain: string[], lastEncourageId: string, tier: string }
//
// Callers play the chain via PandaAudio.playSequence(chain, 200, 0)
// and use `lastEncourageId` to chain their post-celebration audio.
// `streak` is updated by the caller BEFORE calling this (it should
// already include the current pick).
function pickCheerCue({ streak, isRoundComplete, levelId, hasDiscovery = false }) {
  const tier = pickTier(streak, isRoundComplete);
  const chain = buildCheerChain({ tier, levelId, hasDiscovery });
  return {
    chain,
    lastEncourageId: chain[chain.length - 1],
    tier,
  };
}

// Backwards-compat alias for the old "pick a random enc-*" callers
// (game scenes that don't track streak). Returns a single cue from
// the "first" tier — equivalent to the old
// ENCOURAGE[ri % ENCOURAGE.length] rotation but with the new cue ids.
function pickFirstCorrectCue() {
  return pickFrom(ENC_FIRST);
}

// Backwards-compat for the old "enc-try" call site (panda.js's
// MOOD_CUE.think default and any game scene that needs a static
// "wrong" cue). Returns one of the new enc-wrong-N. The new design
// expects callers to use pickWrongCue() instead, but this is the
// drop-in replacement.
function pickStaticWrongCue() {
  return pickFrom(ENC_WRONG);
}

export {
  TIERS,
  ENC_FIRST, ENC_STREAK3, ENC_STREAK5, ENC_STREAK10, ENC_LEVEL,
  PANDA_PRAISE, PANDA_CHEER,
  ENC_WRONG, ENC_NEAR, ENC_SPECIFIC,
  pickFrom, pickTier, buildCheerChain, pickWrongCue,
  pickCheerCue, pickFirstCorrectCue, pickStaticWrongCue,
};

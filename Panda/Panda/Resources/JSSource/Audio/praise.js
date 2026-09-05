// audio/praise.js — single source of truth for encouragement / wrong-answer audio.

const TIERS = ["first", "streak3", "streak5", "streak10", "level"];

const ENC_FIRST = ["enc-first-1", "enc-first-2", "enc-first-3", "enc-first-4"];
const ENC_STREAK3 = ["enc-streak3-1", "enc-streak3-2", "enc-streak3-3"];
const ENC_STREAK5 = ["enc-streak5-2", "enc-streak5-3"];
const ENC_STREAK5_WITH_MISSES = ["enc-streak5-1", "enc-streak5-2", "enc-streak5-3"];
const ENC_STREAK10 = ["enc-streak10-1", "enc-streak10-2", "enc-streak10-3"];
const ENC_LEVEL = ["enc-level-1", "enc-level-2", "enc-level-3", "enc-level-4"];

const PANDA_PRAISE = ["panda-praise-1", "panda-praise-2", "panda-praise-3"];
const PANDA_CHEER = ["panda-cheer-1", "panda-cheer-2"];
const ENC_WRONG = ["enc-wrong-1", "enc-wrong-2", "enc-wrong-3"];
const ENC_NEAR = ["enc-near-1", "enc-near-2", "enc-near-3"];
const ENC_SPECIFIC = [
  "enc-specific-pair",
  "enc-specific-double",
  "enc-specific-decomp",
  "enc-specific-friend",
];

function pickFrom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// Per-correct-attempt recovery state. This is deliberately NOT a sticky
// session flag. A wrong answer arms the recovery praise; the next correct
// answer consumes it and clears it. A later correct answer is then clean.
let failedAttempts = 0;

export function resetFailureCount() {
  failedAttempts = 0;
}

export function getFailureCount() {
  return failedAttempts;
}

function pickTier(streak, isRoundComplete) {
  if (isRoundComplete) return "level";
  if (streak >= 10) return "streak10";
  if (streak >= 5) return "streak5";
  if (streak >= 3) return "streak3";
  return "first";
}

function buildCheerChain({ tier, levelId, hasDiscovery = false, hadWrongs = false }) {
  let encList;
  switch (tier) {
    case "level":
      encList = ENC_LEVEL;
      break;
    case "streak10":
      encList = ENC_STREAK10;
      break;
    case "streak5":
      encList = hadWrongs ? ENC_STREAK5_WITH_MISSES : ENC_STREAK5;
      break;
    case "streak3":
      encList = ENC_STREAK3;
      break;
    case "first":
    default:
      encList = ENC_FIRST;
      break;
  }

  const encCue = pickFrom(encList);
  if (tier === "first") {
    const chain = [encCue];
    if (levelId >= 2 && hasDiscovery && Math.random() < 0.5) {
      chain.push(pickFrom(ENC_SPECIFIC));
    }
    return chain;
  }
  if (tier === "level") return [encCue, pickFrom(PANDA_CHEER)];
  return [encCue, pickFrom(PANDA_PRAISE)];
}

function pickWrongCue({ isNearMiss = false } = {}) {
  // Wrong answers arm exactly one recovery event. Multiple wrong taps before
  // the eventual correct answer still produce one recovery praise, and that
  // state is cleared by pickCheerCue when the correct answer is accepted.
  failedAttempts += 1;
  return isNearMiss ? pickFrom(ENC_NEAR) : pickFrom(ENC_WRONG);
}

function pickCheerCue({ streak, isRoundComplete, levelId, hasDiscovery = false, hadWrongs = false }) {
  // `hadWrongs` is kept in the signature for compatibility with existing
  // roundScene callers, but it is intentionally ignored. The old implementation
  // made it sticky for the whole session, which caused "你试了好几次才对" to
  // play on unrelated later correct answers. The real failure state lives here.
  const hadFailure = failedAttempts > 0;
  const tier = pickTier(streak, isRoundComplete);

  // Recovery praise MUST happen only after at least one actual wrong answer.
  // Consume the failure state on the successful correct answer so the next
  // correct answer starts with zero failures.
  if (hadFailure) {
    failedAttempts = 0;
    return {
      chain: ["enc-streak5-1"],
      lastEncourageId: "enc-streak5-1",
      tier: "recovery",
    };
  }

  const chain = buildCheerChain({
    tier,
    levelId,
    hasDiscovery,
    hadWrongs: false,
  });
  return {
    chain,
    lastEncourageId: chain[chain.length - 1],
    tier,
  };
}

function pickFirstCorrectCue() {
  return pickFrom(ENC_FIRST);
}

function pickStaticWrongCue() {
  failedAttempts += 1;
  return pickFrom(ENC_WRONG);
}

export {
  TIERS,
  ENC_FIRST,
  ENC_STREAK3,
  ENC_STREAK5,
  ENC_LEVEL,
  ENC_STREAK10,
  PANDA_PRAISE,
  PANDA_CHEER,
  ENC_WRONG,
  ENC_NEAR,
  ENC_SPECIFIC,
  pickFrom,
  pickTier,
  buildCheerChain,
  pickWrongCue,
  pickCheerCue,
  pickFirstCorrectCue,
  pickStaticWrongCue,
};

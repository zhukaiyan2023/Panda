// scenes/level3.js — 二十以内 (Up to 20). Teaches the
// "split the 2-digit into 10 + ones, add the ones, add 10 and the
// sum" strategy in 3 explicit steps. No ten-frame, no cells — per
// the user ("不需要格子"), just two equations on screen.
//
// Round data shape: { a, b, answer } where a is a 2-digit number
// with tens digit = 1 (i.e. a ∈ [11, 19]) and b is a 1-digit number.
// Invariant: ones(a) + b ≤ 10 so the second step's add doesn't carry.
// Derived per round: ones = a % 10, sum = ones + b, answer = a + b.
//
// The persistent anchor ("a + b = ?") sits at the TOP of the screen
// in the largest font — it's the goal the child is working toward and
// never disappears between teaching beats. Each step shows a smaller
// sub-question below it:
//
//   Step 1 — Split:   sub "a = 10 + ?" → child picks ones.
//   Step 2 — Add:     sub "ones + b = ?" → child picks sum.
//   Step 3 — Total:   sub "10 + sum = ?" → child picks answer.
//                      After step 3, the persistent anchor reveals too.
//
// Step 1 prompt: "先把 [a] 拆成十加几"
// Step 2 prompt: "[ones] 加 [b] 等于几"
// Step 3 prompt: "十 加 [sum] 等于几"

import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import {
  INK, FONT, YELLOW, BLUE, PINK, ORANGE,
} from "../components/theme.js";

const TEN = 10;
const COL_BIG   = BLUE;    // the 2-digit addend (a)
const COL_SMALL = PINK;    // the 1-digit addend (b)
const COL_TEN   = YELLOW;  // the literal "10" in sub-questions
const COL_NEED  = ORANGE;  // the unknown / just-computed slot

// Persistent anchor ("a + b = ?") rendered at the top, large.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
  };
}

// Per-step L3 audio chains. Each chain is a contextual prompt built
// from universal number cues + the number-agnostic lvl-3-step-1-* chunks.
// Same set works for every L3 round — see tools/cues.cjs for the cue
// inventory.
//
// Step 1 — Split: "先把 [a] 拆成十加几". For a ∈ [11, 19] we have to
// chain "十" + "n-{a-10}" (e.g. "十一" for a=11) because n-11..n-19
// don't exist — the n-* cues are 0..10 only.
function buildL3Step1Ids(a) {
  if (a >= 11 && a <= 19) {
    return ["lvl-3-step-1-pre", "n-10", `n-${a - 10}`, "lvl-3-step-1-q"];
  }
  return ["lvl-3-step-1-pre", `n-${a}`, "lvl-3-step-1-q"];
}

// Step 2 — Add the two ones: "[ones] 加 [b] 等于几"
function buildL3Step2Ids(ones, b) {
  return [`n-${ones}`, "q-plus", `n-${b}`, "q-equals"];
}

// Step 3 — Add 10 and the sum: "十 加 [sum] 等于几"
function buildL3Step3Ids(sum) {
  return ["n-10", "q-plus", `n-${sum}`, "q-equals"];
}

// Fires a per-step L3 audio chain. Three cases (same pattern as L2 —
// see scenes/level2.js for the full rationale):
//
//   1. Step 1 on round 0: chain off the one-time entry greeting
//      (lvl-3-intro). The greeting plays on scene start, this step
//      waits for its `ended` event + 800ms so the greeting lands
//      first.
//
//   2. Any step after a correct pick (round 0 step 2+, round 1+ all
//      steps): chain off ctx.lastEncourageId — the praise cue
//      ("耶！" etc.) that roundScene just played. The new prompt
//      starts AFTER the praise lands, with 400ms breath between.
//      Without this, the praise and the new prompt overlap and feel
//      crammed together.
//
//   3. Fallback (no prior audio to chain off): play immediately with
//      a small render-settle delay.
function fireL3StepAudio(ctx, ids, stepNumber) {
  if (ctx.ri === 0 && stepNumber === 1) {
    window.PandaAudio.playAfter("lvl-3-intro", ids, {
      gapMs: 800,
      seqGapMs: 200,
    });
    return;
  }
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400,
      seqGapMs: 200,
    });
    return;
  }
  window.PandaAudio.playSequence(ids, 200, 100);
}

export default createRoundScene({
  levelId: 3,
  sceneName: "level3",
  introCue: "lvl-3-intro",
  // Three teaching beats. Labels are the visible step-bar text — short,
  // verb-shaped Chinese that names the strategy of each beat.
  stepLabels: ["拆十位", "加个位", "加起来"],

  steps: [
    // Step 1 — Split: a = 10 + ones.
    (ctx, round) => {
      const ones = round.a % TEN;
      // Persistent anchor at top, big.
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      // Sub-question: a = 10 + ? (the "?" slot in ORANGE for the unknown).
      ctx.setEquation({
        slots: [round.a, "=", "10", "+", "?"],
        colors: [COL_BIG, undefined, COL_TEN, undefined, COL_NEED],
      }, { y: 440, size: 82 });
      // Per-step audio: "先把 [a] 拆成十加几".
      fireL3StepAudio(ctx, buildL3Step1Ids(round.a), 1);
      return {
        question: {
          correct: ones,
          values: options(ones, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // Reveal the ones digit in place; keep ORANGE so it reads as
          // the slot the child just filled (consistent with L2's
          // COL_NEED for just-computed values).
          ctx.setEquation({
            slots: [round.a, "=", "10", "+", ones],
            colors: [COL_BIG, undefined, COL_TEN, undefined, COL_NEED],
          }, { y: 440, size: 82 });
        },
      };
    },
    // Step 2 — Add: ones + b = sum.
    (ctx, round) => {
      const ones = round.a % TEN;
      const sum = ones + round.b;
      // Persistent anchor still "?" (waiting for the final reveal).
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      // Sub-question: ones + b = ? — ones stays ORANGE so it visually
      // connects to the value just filled in step 1.
      ctx.setEquation({
        slots: [ones, "+", round.b, "=", "?"],
        colors: [COL_NEED, undefined, COL_SMALL, undefined, COL_NEED],
      }, { y: 440, size: 82 });
      // Per-step audio: "[ones] 加 [b] 等于几".
      fireL3StepAudio(ctx, buildL3Step2Ids(ones, round.b), 2);
      return {
        question: {
          correct: sum,
          values: options(sum, { min: 1, max: 10 }),
        },
        onAdvance: () => {
          // Reveal the sum in place; ORANGE again for the just-computed slot.
          ctx.setEquation({
            slots: [ones, "+", round.b, "=", sum],
            colors: [COL_NEED, undefined, COL_SMALL, undefined, COL_NEED],
          }, { y: 440, size: 82 });
        },
      };
    },
    // Step 3 — Total: 10 + sum = answer.
    (ctx, round) => {
      const ones = round.a % TEN;
      const sum = ones + round.b;
      // Persistent anchor still "?" — only revealed at the very end.
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      // Sub-question: 10 + sum = ? — sum carries the ORANGE color so
      // the child can see it's the result of step 2.
      ctx.setEquation({
        slots: ["10", "+", sum, "=", "?"],
        colors: [COL_TEN, undefined, COL_NEED, undefined, COL_NEED],
      }, { y: 440, size: 82 });
      // Per-step audio: "十 加 [sum] 等于几".
      fireL3StepAudio(ctx, buildL3Step3Ids(sum), 3);
      return {
        question: {
          correct: round.answer,
          // Answer range: a (11-19) + b (1-9), with ones+b ≤ 10, so
          // answer is in [12, 20]. Show options in [11, 20] for
          // breathing room either side.
          values: options(round.answer, { min: 11, max: 20 }),
        },
        onAdvance: () => {
          // Reveal the persistent anchor with the final answer.
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 220 });
          // Reveal the sub-question too — sum in ORANGE, answer in INK
          // (the final settled answer; orange has done its job).
          ctx.setEquation({
            slots: ["10", "+", sum, "=", round.answer],
            colors: [COL_TEN, undefined, COL_NEED, undefined, INK],
          }, { y: 440, size: 82 });
        },
      };
    },
  ],
});
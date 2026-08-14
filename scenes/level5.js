// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// Teaches the "split both teens into 10 + ones, add the ones parts,
// add 10 + 10 = 20, then 20 + sum = answer" strategy in 5 explicit steps.
// Each step asks ONE focused question. Per user feedback (2026-08-15):
// "越细越好" — kid gets 5 small wins instead of 3 bigger ones.
//
// Round data shape: { a, b, onesA, onesB, sum, answer } where
//   a, b ∈ [11, 19]              (both are teens)
//   onesA + onesB ≤ 9            (strict no-carry)
//   sum = onesA + onesB          (∈ [2, 9])
//   answer = a + b               (∈ [22, 29])
//
// The persistent anchor ("a + b = ?") sits at the TOP of the screen in
// the largest font — the goal the child is working toward, never
// disappears between teaching beats. Each step shows one focused sub-
// equation below it (no cross-step decomposition lines, unlike L4's
// anchor → split relationship):
//
//   Step 1 — 拆 a:   sub "a = 10 + ?". Child picks onesA.
//   Step 2 — 拆 b:   sub "b = 10 + ?". Child picks onesB.
//   Step 3 — 加个位: sub "onesA + onesB = ?". Child picks sum.
//   Step 4 — 加十位: sub "10 + 10 = ?". Child picks 20.
//   Step 5 — 加起来: sub "20 + sum = ?". Child picks answer.
//
// After step 5 correct, the anchor reveals to "a + b = answer" and a
// reward audio reads "a+b=answer" (the full equation as a celebration
// sentence).
//
// Audio cue naming: l5-* prefix.
//   l5-s1-{a}-{b}        36 cues  "11 加 14 等于几，我们先把 11 拆成 10 加几"
//   l5-s2-{a}-{b}        36 cues  "我们再拆 14，14 能拆成 10 加几"
//   l5-s3-{oA}-{oB}      36 cues  "个位相加 1 加 4 等于几"
//   l5-s4                1 cue   "十加十等于 20"
//   l5-s5-{sum}          8 cues   "20 加 5 等于几"
//   l5-rwd-{a}-{b}-{answer}  36  "11 加 14 等于 25"
//   Total: 153 unique MP3s.

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260815";
import { poolGens } from "../data/pools.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import {
  INK, FONT, YELLOW, BLUE, PINK, ORANGE, SUCCESS,
} from "../components/theme.js?v=20260815";

const COL_BIG   = BLUE;     // the 2-digit addend (a)
const COL_SMALL = PINK;     // the 2-digit addend (b)
const COL_TEN   = YELLOW;   // the literal "10" in sub-questions
const COL_NEED  = ORANGE;   // the unknown / just-computed slot
const COL_SUM   = SUCCESS;  // the final answer in step 5

// Persistent anchor ("a + b = ?") rendered at the top.
// `reserve` pins slot 4 to round.answer (2 digits) so the row doesn't
// reflow when "?" reveals to "25" in step 5. Without this, the slot
// widens from 0.9 × size to 1.24 × size and the whole row shifts left —
// the line markers / arrows drawn from slotCenters would drift.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// Step 1 sub reserve — slot 4 reveals "?" → onesA (1 digit).
// Reserving to onesA keeps the slot bucket at 0.62 × size (digit width)
// so the reveal doesn't reflow the row.
function step1Sub(round) {
  return {
    slots: [round.a, "=", 10, "+", "?"],
    colors: [COL_BIG, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [round.a, "=", 10, "+", round.onesA],
  };
}

// Step 2 sub — same shape as step 1 but for b.
function step2Sub(round) {
  return {
    slots: [round.b, "=", 10, "+", "?"],
    colors: [COL_SMALL, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [round.b, "=", 10, "+", round.onesB],
  };
}

// Step 3 sub — sum is always 1 digit (sum ∈ [2, 9]).
function step3Sub(round) {
  return {
    slots: [round.onesA, "+", round.onesB, "=", "?"],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, COL_NEED],
    reserve: [round.onesA, "+", round.onesB, "=", round.sum],
  };
}

// Step 4 sub — static, "10 + 10 = ?". Reserve to 20 so the reveal
// doesn't shift the row.
function step4Sub() {
  return {
    slots: [10, "+", 10, "=", "?"],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [10, "+", 10, "=", 20],
  };
}

// Step 5 sub — "20 + sum = ?". Reserve to round.answer (2 digits).
// Slot 4 step 5 widens from 0.9 × size (box) to 1.24 × size (2 digits)
// without the reserve — reflows the whole row.
function step5Sub(round) {
  return {
    slots: [20, "+", round.sum, "=", "?"],
    colors: [COL_TEN, undefined, COL_NEED, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Cue builders — composite pre-baked MP3s parameterized by round.
function buildL5Step1Ids(a, b) { return [`l5-s1-${a}-${b}`]; }
function buildL5Step2Ids(a, b) { return [`l5-s2-${a}-${b}`]; }
function buildL5Step3Ids(onesA, onesB) { return [`l5-s3-${onesA}-${onesB}`]; }
function buildL5Step4Ids() { return [`l5-s4`]; }
function buildL5Step5Ids(sum) { return [`l5-s5-${sum}`]; }
function buildL5RewardIds(a, b, answer) { return [`l5-rwd-${a}-${b}-${answer}`]; }

// Fires a per-step L5 audio chain. Same pattern as L4's
// fireL3StepAudio — chain off ctx.lastEncourageId (the last cue of
// the tier-based cheer chain), fallback to playSequence with a small
// render-settle delay. Without this branch, the cheer and the new
// prompt overlap and feel crammed together.
function fireL5StepAudio(ctx, ids, _stepNumber, onComplete) {
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400,
      seqGapMs: 40,
    }, onComplete);
    return;
  }
  window.PandaAudio.playSequence(ids, 40, 100, onComplete);
}

export default createRoundScene({
  levelId: 5,
  sceneName: "level5",
  // 36 ordered (a, b) pairs from data/pools.js. roundScene samples 10
  // on first entry; each play sees a different mix.
  poolGen: () => poolGens[5](),
  sampleSize: 10,
  // No intro cue — per-round step 1 audio IS the entry prompt. Same
  // pattern as L4 (per feedback 2026-08-10: the old topic-intro ate
  // ~3s before the prompt and gave no instruction for what to DO).
  stepLabels: ["拆 a", "拆 b", "加个位", "加十位", "加起来"],

  steps: [
    // Step 1 — 拆 a: child picks onesA from the decomposition
    // a = 10 + onesA.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        equation: step1Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
      };
    },

    // Step 2 — 拆 b: child picks onesB from b = 10 + onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        equation: step2Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
      };
    },

    // Step 3 — 加个位: child picks sum = onesA + onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step3Ids(round.onesA, round.onesB), 3);
      return {
        equation: step3Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
      };
    },

    // Step 4 — 加十位: child picks 20 from "10 + 10 = ?". Static;
    // every round plays the same l5-s4 cue.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step4Ids(), 4);
      return {
        equation: step4Sub(),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
      };
    },

    // Step 5 — 加起来: child picks answer = 20 + sum.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        equation: step5Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          // Reveal the anchor with the answer. The sub-equation stays
          // for visual continuity until the round finishes.
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 220 });
          // Reward audio: "11 加 14 等于 25". Chained off
          // ctx.lastEncourageId so it starts AFTER the celebration
          // tail and never overlaps. roundScene awaits the Promise
          // so the kid hears the full equation before the next
          // round's greeting fires.
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              buildL5RewardIds(round.a, round.b, round.answer),
              { gapMs: 200, seqGapMs: 40 },
              resolve,
            );
          });
        },
      };
    },
  ],
});

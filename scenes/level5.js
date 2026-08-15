// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// v4 redesign (2026-08-15): cascading decomposition tree matching
// the user-provided sketch — split row grows through 4 stages as
// steps 1-2 reveal each piece, while tens/ones/final rows form a
// funnel below.
//
// Layout (canvas 1366×1024):
//   y=84   stepBar (5 steps)
//   y=200  Anchor: a + b = ?               size 88, persistent
//   y=320  Split row (cascading):          size 56, grows over 2 steps
//          step 1:    □ + □ + 13    = □        (a → ?+?, b intact)
//          step 1r:   10 + 1 + 13   = □        (a → 10+1)
//          step 2:    10 + 1 + □ + □ = □      (b → ?+?)
//          step 2r:   10 + 1 + 10 + 1 = □      (fully decomposed)
//   y=460  Tens sum row:                   size 64
//          10 + 10 = ?
//   y=540  Ones sum row:                   size 64
//          □ + □ = ?
//   y=620  Final row:                      size 70
//          □ + □ = ?
//   y=838  Buttons
//
// 5 teaching beats — each step fills ONE slot:
//   Step 1 — 拆 a:   child picks onesA   (split row □_a → onesA)
//   Step 2 — 拆 b:   child picks onesB   (split row □_b → onesB)
//   Step 3 — 加十位: child picks 20       (tens sum "?" → 20)
//   Step 4 — 加个位: child picks sum      (ones sum "?" → sum)
//   Step 5 — 加起来: child picks answer  (final "?" → answer)
//
// Round data shape: { a, b, onesA, onesB, sum, answer } where
//   a, b ∈ [11, 19]; onesA + onesB ≤ 9; sum = onesA+onesB; answer = a+b.

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260815";
import { poolGens } from "../data/pools.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import drawLink from "../components/drawLink.js?v=20260815";
import {
  YELLOW, BLUE, PINK, ORANGE, SUCCESS,
} from "../components/theme.js?v=20260815";

const COL_BIG   = BLUE;
const COL_SMALL = PINK;
const COL_TEN   = YELLOW;
const COL_NEED  = ORANGE;
const COL_SUM   = SUCCESS;

const SPLIT_SIZE = 56;
const SUB_SIZE   = 64;
const FINAL_SIZE = 70;
const Y_ANCHOR   = 200;
const Y_SPLIT    = 320;
const Y_TENS     = 460;
const Y_ONES     = 540;
const Y_FINAL    = 620;

// ---------- equation slot layouts for each of the 4 split stages -----

// Stage 0 (step 1 BEFORE pick): a → ?+?, b intact.
//   slots: ["?", "+", "?", "+", b, "=", "?"]
//         idx:   0     1     2     3    4   5   6
function splitStage0(round) {
  return {
    slots: ["?", "+", "?", "+", round.b, "=", "?"],
    colors: [
      COL_NEED, undefined, COL_NEED, undefined,
      COL_SMALL, undefined, COL_NEED,
    ],
    reserve: ["10", "+", "10", "+", round.b, "=", round.answer],
  };
}

// Stage 1 (step 1 AFTER pick): a → 10+onesA, b intact.
//   slots: [10, "+", onesA, "+", b, "=", "?"]
//         idx:  0    1       2     3   4   5   6
function splitStage1(round) {
  return {
    slots: [10, "+", round.onesA, "+", round.b, "=", "?"],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_SMALL, undefined, COL_NEED,
    ],
    reserve: [10, "+", "10", "+", round.b, "=", round.answer],
  };
}

// Stage 2 (step 2 BEFORE pick): a → 10+onesA, b → ?+?.
//   slots: [10, "+", onesA, "+", "?", "+", "?", "=", "?"]
//         idx:  0    1       2     3     4     5   6   7
function splitStage2(round) {
  return {
    slots: [10, "+", round.onesA, "+", "?", "+", "?", "=", "?"],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_NEED, undefined, COL_NEED, undefined,
      COL_NEED,
    ],
    reserve: [10, "+", "10", "+", "10", "+", "10", "=", round.answer],
  };
}

// Stage 3 (step 2 AFTER pick): both fully decomposed.
//   slots: [10, "+", onesA, "+", 10, "+", onesB, "=", "?"]
//         idx:  0    1       2     3   4    5       6   7
function splitStage3(round) {
  return {
    slots: [10, "+", round.onesA, "+", 10, "+", round.onesB, "=", "?"],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_TEN, undefined, COL_NEED, undefined,
      COL_NEED,
    ],
    reserve: [10, "+", "10", "+", 10, "+", "10", "=", round.answer],
  };
}

// Tens sum row: 10 + 10 = ?
function tensSumRow(round, val = "?") {
  return {
    slots: [10, "+", 10, "=", val],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [10, "+", 10, "=", 20],
  };
}

// Ones sum row: □ + □ = ?
function onesSumRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, COL_NEED],
    reserve: [round.onesA, "+", round.onesB, "=", round.sum],
  };
}

// Final row: □ + □ = ?
function finalRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_TEN, undefined, COL_SUM, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Persistent anchor ("a + b = ?") rendered at the top.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// ---------- 10 drawLink lines -------------------------------------------
// Returns [] if a required node hasn't been rendered yet.
function linkPoints(anchor, split, tens, ones, final) {
  const pts = [];
  if (!anchor?.slotCenters || !split?.slotCenters) return pts;

  // L1: anchor a (slot 0) → split row's first □ (slot 0). Always
  // present (split row always has at least 5 slots).
  if (anchor.slotCenters[0] != null && split.slotCenters[0] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: split.slotCenters[0], y: split.slotY - split.slotSizes[0] / 2 },
      color: COL_NEED,
    });
  }
  // L2: anchor a (slot 0) → split row's second □ (slot 2). Only after
  // step 1 reveals onesA (i.e., when split is at stage 1 or later).
  if (
    anchor.slotCenters[0] != null &&
    split.slotCenters[2] != null &&
    // Stage 1+ has a numeric at slot 2 (onesA revealed). Stage 0
    // still has "?" there.
    !String(split.slots?.[2] ?? "").match(/^[?□]$/)
  ) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: split.slotCenters[2], y: split.slotY - split.slotSizes[2] / 2 },
      color: COL_NEED,
    });
  }
  // L3: anchor b (slot 2) → split row's b box. In stage 0/1 this
  // is slot 4 (b as 2-digit number). In stage 2/3, b is split into
  // ?+? at slots 4/6.
  if (anchor.slotCenters[2] != null && split.slotCenters[4] != null) {
    const slot4 = String(split.slots?.[4] ?? "");
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: split.slotCenters[4], y: split.slotY - split.slotSizes[4] / 2 },
      color: slot4 === "?" || slot4 === "□" ? COL_NEED : COL_SMALL,
    });
  }
  // L4: anchor b (slot 2) → split row's second-half b box. Only in
  // stage 2/3 (after b is split).
  if (
    anchor.slotCenters[2] != null &&
    split.slotCenters[6] != null
  ) {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: split.slotCenters[6], y: split.slotY - split.slotSizes[6] / 2 },
      color: COL_NEED,
    });
  }

  // L5: split row's "10_a" (slot 0 of stage 1+) → tens sum "10_left" (slot 0).
  //     Stage 0 still has "?" at slot 0, so the line is suppressed.
  if (
    split.slotCenters[0] != null &&
    tens?.slotCenters?.[0] != null &&
    !String(split.slots?.[0] ?? "").match(/^[?□]$/)
  ) {
    pts.push({
      from: { x: split.slotCenters[0], y: split.slotY + split.slotSizes[0] / 2 },
      to:   { x: tens.slotCenters[0], y: tens.slotY - tens.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L6: split row's "10_b" (slot 4 of stage 1/2/3) → tens sum "10_right"
  //     (slot 2). Stage 0/1 has b as 2-digit at slot 4 (no line).
  //     Stage 2/3 has "?" / "10" at slot 4.
  if (
    split.slotCenters[4] != null &&
    tens?.slotCenters?.[2] != null &&
    !String(split.slots?.[4] ?? "").match(/^[?□]$/) &&
    split.slots.length >= 7  // stage 2 or 3
  ) {
    pts.push({
      from: { x: split.slotCenters[4], y: split.slotY + split.slotSizes[4] / 2 },
      to:   { x: tens.slotCenters[2], y: tens.slotY - tens.slotSizes[2] / 2 },
      color: COL_TEN,
    });
  }
  // L7: split row's "onesA" (slot 2 of stage 1+) → ones sum "□_left"
  //     (slot 0). Only after step 1 reveal (stage 1+).
  if (
    split.slotCenters[2] != null &&
    ones?.slotCenters?.[0] != null &&
    !String(split.slots?.[2] ?? "").match(/^[?□]$/)
  ) {
    pts.push({
      from: { x: split.slotCenters[2], y: split.slotY + split.slotSizes[2] / 2 },
      to:   { x: ones.slotCenters[0], y: ones.slotY - ones.slotSizes[0] / 2 },
      color: COL_BIG,
    });
  }
  // L8: split row's "onesB" (slot 6 of stage 2/3) → ones sum "□_right"
  //     (slot 2). Only after step 2 reveal (stage 3).
  if (
    split.slotCenters[6] != null &&
    ones?.slotCenters?.[2] != null &&
    !String(split.slots?.[6] ?? "").match(/^[?□]$/)
  ) {
    pts.push({
      from: { x: split.slotCenters[6], y: split.slotY + split.slotSizes[6] / 2 },
      to:   { x: ones.slotCenters[2], y: ones.slotY - ones.slotSizes[2] / 2 },
      color: COL_SMALL,
    });
  }
  // L9: tens sum "20" (slot 4) → final "□_left" (slot 0).
  //     Only after step 3 reveals 20.
  if (
    tens?.slotCenters?.[4] != null &&
    final?.slotCenters?.[0] != null &&
    tens.slots?.[4] === 20
  ) {
    pts.push({
      from: { x: tens.slotCenters[4], y: tens.slotY + tens.slotSizes[4] / 2 },
      to:   { x: final.slotCenters[0], y: final.slotY - final.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L10: ones sum "sum" (slot 4) → final "□_right" (slot 2).
  //      Only after step 4 reveals sum.
  if (
    ones?.slotCenters?.[4] != null &&
    final?.slotCenters?.[2] != null &&
    ones.slots?.[4] !== "?"
  ) {
    pts.push({
      from: { x: ones.slotCenters[4], y: ones.slotY + ones.slotSizes[4] / 2 },
      to:   { x: final.slotCenters[2], y: final.slotY - final.slotSizes[2] / 2 },
      color: COL_SUM,
    });
  }
  return pts;
}

function redrawLinks(ctx) {
  ctx.arrowNodes?.forEach((n) => n.destroy());
  ctx.arrowNodes = [];
  if (!ctx.anchorEqNode || !ctx.l5SplitNode) return;
  const pts = linkPoints(
    ctx.anchorEqNode,
    ctx.l5SplitNode,
    ctx.l5TensNode,
    ctx.l5OnesNode,
    ctx.l5FinalNode,
  );
  for (const p of pts) {
    ctx.arrowNodes.push(drawLink(ctx.k, ctx.arrowsRoot, p.from, p.to, p.color, 7, 0.4));
  }
}

// Cue builders — composite pre-baked MP3s parameterized by round.
function buildL5Step1Ids(a, b) { return [`l5-s1-${a}-${b}`]; }
function buildL5Step2Ids(a, b) { return [`l5-s2-${a}-${b}`]; }
function buildL5Step3Ids() { return [`l5-s4`]; }                          // "十加十等于二十"
function buildL5Step4Ids(onesA, onesB) { return [`l5-s3-${onesA}-${onesB}`]; } // "个位相加…"
function buildL5Step5Ids(sum) { return [`l5-s5-${sum}`]; }
function buildL5RewardIds(a, b, answer) { return [`l5-rwd-${a}-${b}-${answer}`]; }

function fireL5StepAudio(ctx, ids, _stepNumber, onComplete) {
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400, seqGapMs: 40,
    }, onComplete);
    return;
  }
  window.PandaAudio.playSequence(ids, 40, 100, onComplete);
}

// Render a single expression node, destroying any previous version on ctx.
function renderSlot(ctx, key, slots, opts) {
  if (ctx[key]) ctx[key].destroy();
  ctx[key] = expression(ctx.k, {
    ...slots,
    x: LAYOUT.barX, y: opts.y, size: opts.size,
  });
  // Stash slots so linkPoints can decide which lines to draw.
  ctx[key].slots = slots.slots;
}

export default createRoundScene({
  levelId: 5,
  sceneName: "level5",
  poolGen: () => poolGens[5](),
  sampleSize: 10,
  stepLabels: ["拆 a", "拆 b", "加十位", "加个位", "加起来"],

  steps: [
    // Step 1 — 拆 a: child picks onesA. Split row shows stage 0
    // (a as ?+?, b intact). After reveal, switch to stage 1.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: 88 });
      renderSlot(ctx, "l5SplitNode", splitStage0(round), { y: Y_SPLIT, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round), { y: Y_TENS, size: SUB_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round), { y: Y_ONES, size: SUB_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // Reveal split "?" → onesA. Stage 0 → stage 1.
          renderSlot(ctx, "l5SplitNode", splitStage1(round), { y: Y_SPLIT, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 2 — 拆 b: child picks onesB. Split row shows stage 1
    // (a = 10+onesA, b still intact as 13). Wait — at the start
    // of step 2 we want stage 2 (a = 10+onesA, b → ?+?). Build
    // stage 2 here, kid picks, reveal to stage 3.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: 88 });
      renderSlot(ctx, "l5SplitNode", splitStage2(round), { y: Y_SPLIT, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round), { y: Y_TENS, size: SUB_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round), { y: Y_ONES, size: SUB_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5SplitNode", splitStage3(round), { y: Y_SPLIT, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 3 — 加十位: child picks 20.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: 88 });
      renderSlot(ctx, "l5SplitNode", splitStage3(round), { y: Y_SPLIT, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round), { y: Y_TENS, size: SUB_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB), { y: Y_ONES, size: SUB_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step3Ids(), 3);
      return {
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5TensNode", tensSumRow(round, 20), { y: Y_TENS, size: SUB_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 4 — 加个位: child picks sum.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: 88 });
      renderSlot(ctx, "l5SplitNode", splitStage3(round), { y: Y_SPLIT, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round, 20), { y: Y_TENS, size: SUB_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB), { y: Y_ONES, size: SUB_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round, 20), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step4Ids(round.onesA, round.onesB), 4);
      return {
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB, round.sum), { y: Y_ONES, size: SUB_SIZE });
          renderSlot(ctx, "l5FinalNode", finalRow(round, 20, round.sum), { y: Y_FINAL, size: FINAL_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 5 — 加起来: child picks answer.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: 88 });
      renderSlot(ctx, "l5SplitNode", splitStage3(round), { y: Y_SPLIT, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round, 20), { y: Y_TENS, size: SUB_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB, round.sum), { y: Y_ONES, size: SUB_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round, 20, round.sum), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: Y_ANCHOR, size: 88 });
          renderSlot(ctx, "l5FinalNode", finalRow(round, 20, round.sum, round.answer), { y: Y_FINAL, size: FINAL_SIZE });
          redrawLinks(ctx);
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
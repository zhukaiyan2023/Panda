// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// v6 redesign (2026-08-15): strictly per user sketch — each step
// INTRODUCES ONE NEW ROW. Earlier rows stay visible (persistent).
//
// Per-step visible rows (rows = persistent equations, only the active
// row's content is the question):
//
//   Step 1 — 拆 a (audio: l5-s1-{a}-{b}, "先把 {a} 拆成 10 加几"):
//     anchor: a + b = ?
//     split-1: ? + ? + b = ?    (a as 2 boxes, b intact)
//     → click onesA → split-1: 10 + 1 + b = ?
//
//   Step 2 — 拆 b (audio: l5-s2-{a}-{b}, "再把 {b} 拆成 10 加几"):
//     anchor: a + b = ?
//     split-1: 10 + 1 + b = ?
//     split-2: 10 + 1 + ? + ? = ?    (b as 2 boxes)
//     → click onesB → split-2: 10 + 1 + 10 + 1 = ?
//
//   Step 3 — 加十位 (audio: l5-s4, "十加十等于二十"):
//     anchor: a + b = ?
//     split-1: 10 + 1 + b = ?
//     split-2: 10 + 1 + 10 + 1 = ?
//     combine-tens: 10 + 10 + ? = ?    (kid picks the tens sum = 20)
//     → click 20 → combine-tens: 10 + 10 + ? = 20
//
//   Step 4 — 加个位 (audio: l5-s3-{oA}-{oB}, "个位相加 oA 加 oB 等于几"):
//     anchor: a + b = ?
//     split-1: 10 + 1 + b = ?
//     split-2: 10 + 1 + 10 + 1 = ?
//     combine-tens: 10 + 10 + ? = 20
//     combine-ones+final: ? + ? = ?    (kid picks ones sum)
//     → click sum → combine-tens: 10 + 10 + sum = 20
//                      combine-ones+final: ? + sum = ?
//
//   Step 5 — 加起来 (audio: l5-s5-{sum}, "20 + sum = ?"):
//     anchor: a + b = ?
//     split-1: 10 + 1 + b = ?
//     split-2: 10 + 1 + 10 + 1 = ?
//     combine-tens: 10 + 10 + sum = 20
//     combine-ones+final: ? + sum = ?
//     → click answer → combine-ones+final: 20 + sum = answer
//        + anchor: a + b = answer
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

const Y_ANCHOR = 200;
const Y_SPLIT_1 = 320;
const Y_SPLIT_2 = 400;
const Y_TENS    = 540;
const Y_ONES    = 640;
const Y_FINAL   = 720;

const ANCHOR_SIZE  = 80;
const SPLIT_SIZE   = 56;
const COMBINE_SIZE = 60;
const FINAL_SIZE   = 70;

// ---------- slot layouts for each row ----------------------------------

function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// split-1: "[left] + onesA + b = ?"
//   pre-click (step 1):  left="?", onesA="?"
//   post-click (step 1): left="10", onesA=onesA
function split1Row(round, left = "?", onesA = "?") {
  return {
    slots: [left, "+", onesA, "+", round.b, "=", "?"],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_SMALL, undefined, COL_NEED,
    ],
    reserve: ["10", "+", "10", "+", round.b, "=", round.answer],
  };
}

// split-2: "10 + onesA + b_left + b_right = ?"
//   pre-click (step 2):  b_left="?", b_right="?"
//   post-click (step 2): b_left="10", b_right=onesB
function split2Row(round, b_left = "?", b_right = "?") {
  return {
    slots: [10, "+", round.onesA, "+", b_left, "+", b_right, "=", "?"],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_TEN, undefined, COL_NEED, undefined,
      COL_NEED,
    ],
    reserve: [10, "+", "10", "+", "10", "+", "10", "=", round.answer],
  };
}

// combine-tens: "10 + 10 + ones_sum + tens_sum = ?" (or partial)
//   step 3 pre-click:  "10 + 10 + ? = ?"     (kid picks tens_sum=20)
//   step 3 post:       "10 + 10 + ? = 20"
//   step 4 pre-click:  "10 + 10 + ? = 20"   (held)
//   step 4 post:       "10 + 10 + sum = 20"
function combineTensRow(round, ones_sum = "?", tens_sum = "?") {
  return {
    slots: [10, "+", 10, "+", ones_sum, "=", tens_sum],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED, undefined, COL_NEED],
    reserve: [10, "+", 10, "+", "10", "=", 20],
  };
}

// combine-ones+final: "tens_sum + ones_sum = answer"
//   step 4 pre-click:  "? + ? = ?"   (all boxes)
//   step 4 post:       "? + sum = ?"  (right filled with sum)
//   step 5 pre-click:  "? + sum = ?"  (held)
//   step 5 post:       "20 + sum = answer"
function combineOnesFinalRow(round, tens_sum = "?", ones_sum = "?", ans = "?") {
  return {
    slots: [tens_sum, "+", ones_sum, "=", ans],
    colors: [COL_TEN, undefined, COL_SUM, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Render helper.
function renderSlot(ctx, key, slots, opts) {
  if (ctx[key]) ctx[key].destroy();
  ctx[key] = expression(ctx.k, {
    ...slots,
    x: LAYOUT.barX, y: opts.y, size: opts.size,
  });
  ctx[key].slots = slots.slots;
}

// ---------- 11 drawLink lines ------------------------------------------
// Each line is drawn only when both endpoints exist AND the target
// slot contains a number (not a "?" box).
function linkPoints(anchor, s1, s2, tens, onesFinal) {
  const pts = [];
  if (!anchor?.slotCenters) return pts;

  // L1: anchor a (slot 0) → split-1 left (slot 0, becomes "10" after
  //     step 1 reveal).
  if (s1?.slotCenters?.[0] != null && anchor.slotCenters[0] != null
      && typeof s1.slots?.[0] === "number") {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: s1.slotCenters[0], y: s1.slotY - s1.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L2: anchor b (slot 2) → split-1 b slot (slot 4, always = round.b).
  if (s1?.slotCenters?.[4] != null && anchor.slotCenters[2] != null) {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: s1.slotCenters[4], y: s1.slotY - s1.slotSizes[4] / 2 },
      color: COL_SMALL,
    });
  }
  // L3: anchor a (slot 0) → split-2 left (slot 0, becomes "10" after
  //     step 2 reveal).
  if (s2?.slotCenters?.[0] != null && anchor.slotCenters[0] != null
      && typeof s2.slots?.[0] === "number") {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: s2.slotCenters[0], y: s2.slotY - s2.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L4: anchor b (slot 2) → split-2 b-left (slot 4, becomes "10" after
  //     step 2 reveal).
  if (s2?.slotCenters?.[4] != null && anchor.slotCenters[2] != null
      && typeof s2.slots?.[4] === "number") {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: s2.slotCenters[4], y: s2.slotY - s2.slotSizes[4] / 2 },
      color: COL_TEN,
    });
  }
  // L5: split-2 10_a (slot 0) → combine-tens 10_left (slot 0).
  if (s2?.slotCenters?.[0] != null && tens?.slotCenters?.[0] != null
      && typeof s2.slots?.[0] === "number") {
    pts.push({
      from: { x: s2.slotCenters[0], y: s2.slotY + s2.slotSizes[0] / 2 },
      to:   { x: tens.slotCenters[0], y: tens.slotY - tens.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L6: split-2 onesA (slot 2) → combine-tens ones_sum (slot 4).
  if (s2?.slotCenters?.[2] != null && tens?.slotCenters?.[4] != null
      && typeof s2.slots?.[2] === "number") {
    pts.push({
      from: { x: s2.slotCenters[2], y: s2.slotY + s2.slotSizes[2] / 2 },
      to:   { x: tens.slotCenters[4], y: tens.slotY - tens.slotSizes[4] / 2 },
      color: COL_BIG,
    });
  }
  // L7: split-2 10_b (slot 4) → combine-tens 10_right (slot 2).
  if (s2?.slotCenters?.[4] != null && tens?.slotCenters?.[2] != null
      && typeof s2.slots?.[4] === "number") {
    pts.push({
      from: { x: s2.slotCenters[4], y: s2.slotY + s2.slotSizes[4] / 2 },
      to:   { x: tens.slotCenters[2], y: tens.slotY - tens.slotSizes[2] / 2 },
      color: COL_TEN,
    });
  }
  // L8: split-2 onesB (slot 6) → combine-tens ones_sum (slot 4).
  if (s2?.slotCenters?.[6] != null && tens?.slotCenters?.[4] != null
      && typeof s2.slots?.[6] === "number") {
    pts.push({
      from: { x: s2.slotCenters[6], y: s2.slotY + s2.slotSizes[6] / 2 },
      to:   { x: tens.slotCenters[4], y: tens.slotY - tens.slotSizes[4] / 2 },
      color: COL_SMALL,
    });
  }
  // L9: combine-tens 10_left (slot 0) → combine-ones+final tens_sum (slot 0).
  if (tens?.slotCenters?.[0] != null && onesFinal?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: tens.slotCenters[0], y: tens.slotY + tens.slotSizes[0] / 2 },
      to:   { x: onesFinal.slotCenters[0], y: onesFinal.slotY - onesFinal.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L10: combine-tens 10_right (slot 2) → combine-ones+final tens_sum
  //      (slot 0). The two 10s both feed into tens_sum (= 20).
  if (tens?.slotCenters?.[2] != null && onesFinal?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: tens.slotCenters[2], y: tens.slotY + tens.slotSizes[2] / 2 },
      to:   { x: onesFinal.slotCenters[0], y: onesFinal.slotY - onesFinal.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L11: combine-tens ones_sum (slot 4) → combine-ones+final ones_sum
  //      (slot 2). Only after step 4 reveal (when slot 4 = sum).
  if (tens?.slotCenters?.[4] != null && onesFinal?.slotCenters?.[2] != null
      && typeof tens.slots?.[4] === "number") {
    pts.push({
      from: { x: tens.slotCenters[4], y: tens.slotY + tens.slotSizes[4] / 2 },
      to:   { x: onesFinal.slotCenters[2], y: onesFinal.slotY - onesFinal.slotSizes[2] / 2 },
      color: COL_SUM,
    });
  }
  return pts;
}

function redrawLinks(ctx) {
  ctx.arrowNodes?.forEach((n) => n.destroy());
  ctx.arrowNodes = [];
  if (!ctx.anchorEqNode) return;
  const pts = linkPoints(
    ctx.anchorEqNode,
    ctx.l5Split1Node,
    ctx.l5Split2Node,
    ctx.l5TensNode,
    ctx.l5OnesFinalNode,
  );
  for (const p of pts) {
    ctx.arrowNodes.push(drawLink(ctx.k, ctx.arrowsRoot, p.from, p.to, p.color, 7, 0.4));
  }
}

// Cue builders.
function buildL5Step1Ids(a, b) { return [`l5-s1-${a}-${b}`]; }
function buildL5Step2Ids(a, b) { return [`l5-s2-${a}-${b}`]; }
function buildL5Step3Ids() { return [`l5-s4`]; }
function buildL5Step4Ids(onesA, onesB) { return [`l5-s3-${onesA}-${onesB}`]; }
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

export default createRoundScene({
  levelId: 5,
  sceneName: "level5",
  poolGen: () => poolGens[5](),
  sampleSize: 10,
  stepLabels: ["拆 a", "拆 b", "加十位", "加个位", "加起来"],

  steps: [
    // Step 1 — 拆 a.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, "?", "?"), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 2 — 拆 b. split-2 row newly appears.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, "?", "?"), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 3 — 加十位. combine-tens row newly appears.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", combineTensRow(round), { y: Y_TENS, size: COMBINE_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step3Ids(), 3);
      return {
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
        onAdvance: () => {
          // combine-tens reveals the tens-sum answer slot as 20.
          renderSlot(ctx, "l5TensNode", combineTensRow(round, "?", 20), { y: Y_TENS, size: COMBINE_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 4 — 加个位. combine-ones+final row newly appears.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", combineTensRow(round, "?", 20), { y: Y_TENS, size: COMBINE_SIZE });
      renderSlot(ctx, "l5OnesFinalNode", combineOnesFinalRow(round), { y: Y_ONES, size: COMBINE_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step4Ids(round.onesA, round.onesB), 4);
      return {
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
        onAdvance: () => {
          // combine-tens reveals the ones-sum slot as sum.
          renderSlot(ctx, "l5TensNode", combineTensRow(round, round.sum, 20), { y: Y_TENS, size: COMBINE_SIZE });
          // combine-ones+final reveals the ones-sum slot (right) as sum.
          renderSlot(ctx, "l5OnesFinalNode", combineOnesFinalRow(round, "?", round.sum), { y: Y_ONES, size: COMBINE_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 5 — 加起来. No new rows; just reveal the final answer.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", combineTensRow(round, round.sum, 20), { y: Y_TENS, size: COMBINE_SIZE });
      renderSlot(ctx, "l5OnesFinalNode", combineOnesFinalRow(round, "?", round.sum), { y: Y_ONES, size: COMBINE_SIZE });
      // Hmm but the user's sketch has combine-ones+final at "20 + 5 = ?"
      // (no separate final row at y=720). Let me reconsider — the
      // combine-ones+final IS the final row.
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: Y_ANCHOR, size: ANCHOR_SIZE });
          // combine-ones+final reveals the tens-sum slot (left) as 20,
          // and the answer slot as answer.
          renderSlot(ctx, "l5OnesFinalNode", combineOnesFinalRow(round, 20, round.sum, round.answer), { y: Y_ONES, size: COMBINE_SIZE });
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
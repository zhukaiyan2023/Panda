// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// v5 redesign (2026-08-15): completely matches the user-provided
// sketch — anchor + 3 split rows (cascading reveal) + 3 combine/
// final rows. All 7 rows persistent across all 5 steps; only the
// SLOT CONTENT (□ → number) changes as the kid answers.
//
// Layout (canvas 1366×1024):
//   y=84   stepBar
//   y=200  Anchor:  a + b = □                  size 80, persistent
//   y=320  Split-1:  □ + □ + b = □            size 56, persistent
//          Step 1 pre-click: a split into ?+?
//          Step 1 reveal:    10 + 1 + b = □   (a → 10+1)
//   y=400  Split-2:  10 + 1 + □ + □ = □      size 56, persistent
//          Step 1 reveal:    a revealed, b split
//          Step 2 reveal:    10 + 1 + 10 + 1 = □
//   y=480  Split-3:  10 + 1 + 10 + 1 = □     size 56, persistent
//          Step 2 reveal:    fully decomposed (held through 3-5)
//   y=600  Combine-tens: 10 + 10 = ?         size 64, persistent
//          Step 3 reveal:    → 10 + 10 = 20
//   y=680  Combine-ones: □ + □ = ?           size 64, persistent
//          Step 4 reveal:    → onesA + onesB = sum
//   y=760  Final:    □ + □ = ?                size 70, persistent
//          Step 5 reveal:    → 20 + sum = answer
//   y=838  Buttons
//
// Lines (drawLink, opacity 0.4, thickness 7):
//   L1: anchor a → split-1 slot 0 (the leftmost □)
//   L2: anchor a → split-2 slot 0 (the 10_a after step 1 reveal)
//   L3: anchor b → split-1 slot 2 (the rightmost □_b, only at step 1 pre-click)
//   L4: anchor b → split-2 slot 2 (the □_b at step 2 pre-click)
//   L5: split-3's 10_a (slot 0) → combine-tens slot 0
//   L6: split-3's 10_b (slot 4) → combine-tens slot 2
//   L7: split-3's onesA (slot 2) → combine-ones slot 0
//   L8: split-3's onesB (slot 6) → combine-ones slot 2
//   L9: combine-tens "20" (slot 4) → final slot 0  (after step 3 reveal)
//   L10: combine-ones "sum" (slot 4) → final slot 2 (after step 4 reveal)
//
// 5 teaching beats:
//   Step 1 — 拆 a:   child picks onesA   (reveals split-1 slot 0)
//   Step 2 — 拆 b:   child picks onesB   (reveals split-2 slot 2)
//   Step 3 — 加十位: child picks 20       (reveals combine-tens "?")
//   Step 4 — 加个位: child picks sum      (reveals combine-ones "?")
//   Step 5 — 加起来: child picks answer  (reveals final "?")
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
const Y_SPLIT_3 = 480;
const Y_TENS    = 600;
const Y_ONES    = 680;
const Y_FINAL   = 760;

const ANCHOR_SIZE = 80;
const SPLIT_SIZE  = 56;
const COMBINE_SIZE = 64;
const FINAL_SIZE  = 70;

// ---------- slot layouts for each of the 7 persistent rows ------------

function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// split-1: "[left] + onesA + b = ?"   (a splits into left + onesA, b intact)
// slots:    0:left 1:"+" 2:onesA 3:"+" 4:b 5:"=" 6:"?"
//   pre-click (step 1):   left="?", onesA="?", b — all boxes
//   post-click (step 1):  left="10", onesA=onesA, b — a revealed
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
// slots:    0:"10" 1:"+" 2:onesA 3:"+" 4:b_left 5:"+" 6:b_right 7:"=" 8:"?"
//   pre-click (step 2):  a revealed, b → ?+?  (b_left="?", b_right="?")
//   post-click (step 2): b revealed (b_left=10, b_right=onesB)
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

// split-3: "10 + 1 + 10 + 1 = ?" (fully decomposed, persistent from step 2 reveal onwards)
// slots:    0:"10" 1:"+" 2:onesA 3:"+" 4:"10" 5:"+" 6:onesB 7:"=" 8:"?"
function split3Row(round) {
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

function tensSumRow(round, val = "?") {
  return {
    slots: [10, "+", 10, "=", val],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [10, "+", 10, "=", 20],
  };
}

function onesSumRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, COL_NEED],
    reserve: [round.onesA, "+", round.onesB, "=", round.sum],
  };
}

function finalRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_TEN, undefined, COL_SUM, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// ---------- 10 drawLink lines -------------------------------------------
function linkPoints(anchor, s1, s2, s3, tens, ones, final) {
  const pts = [];
  if (!anchor?.slotCenters) return pts;

  // L1: anchor a (slot 0) → split-1's first □ (slot 0)
  if (s1?.slotCenters?.[0] != null && anchor.slotCenters[0] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: s1.slotCenters[0], y: s1.slotY - s1.slotSizes[0] / 2 },
      color: COL_NEED,
    });
  }
  // L2: anchor a (slot 0) → split-2's "10_a" (slot 0) — only after step 1 reveal
  if (s2?.slotCenters?.[0] != null && anchor.slotCenters[0] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: s2.slotCenters[0], y: s2.slotY - s2.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L3: anchor b (slot 2) → split-1's third □ (slot 2) — only at step 1 pre-click
  //     when slot 2 is still "?". After reveal, it's a number.
  if (s1?.slotCenters?.[2] != null && anchor.slotCenters[2] != null
      && s1.slots?.[2] === "?") {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: s1.slotCenters[2], y: s1.slotY - s1.slotSizes[2] / 2 },
      color: COL_NEED,
    });
  }
  // L4: anchor b (slot 2) → split-2's "?" slot (slot 4)
  if (s2?.slotCenters?.[4] != null && anchor.slotCenters[2] != null) {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: s2.slotCenters[4], y: s2.slotY - s2.slotSizes[4] / 2 },
      color: COL_NEED,
    });
  }
  // L5: split-3's "10_a" (slot 0) → combine-tens "10" (slot 0)
  if (s3?.slotCenters?.[0] != null && tens?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: s3.slotCenters[0], y: s3.slotY + s3.slotSizes[0] / 2 },
      to:   { x: tens.slotCenters[0], y: tens.slotY - tens.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L6: split-3's "10_b" (slot 4) → combine-tens "10" (slot 2)
  if (s3?.slotCenters?.[4] != null && tens?.slotCenters?.[2] != null) {
    pts.push({
      from: { x: s3.slotCenters[4], y: s3.slotY + s3.slotSizes[4] / 2 },
      to:   { x: tens.slotCenters[2], y: tens.slotY - tens.slotSizes[2] / 2 },
      color: COL_TEN,
    });
  }
  // L7: split-3's "onesA" (slot 2) → combine-ones "□" (slot 0)
  if (s3?.slotCenters?.[2] != null && ones?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: s3.slotCenters[2], y: s3.slotY + s3.slotSizes[2] / 2 },
      to:   { x: ones.slotCenters[0], y: ones.slotY - ones.slotSizes[0] / 2 },
      color: COL_BIG,
    });
  }
  // L8: split-3's "onesB" (slot 6) → combine-ones "□" (slot 2)
  if (s3?.slotCenters?.[6] != null && ones?.slotCenters?.[2] != null) {
    pts.push({
      from: { x: s3.slotCenters[6], y: s3.slotY + s3.slotSizes[6] / 2 },
      to:   { x: ones.slotCenters[2], y: ones.slotY - ones.slotSizes[2] / 2 },
      color: COL_SMALL,
    });
  }
  // L9: combine-tens "20" (slot 4) → final "□" (slot 0)
  if (tens?.slotCenters?.[4] != null && final?.slotCenters?.[0] != null
      && tens.slots?.[4] === 20) {
    pts.push({
      from: { x: tens.slotCenters[4], y: tens.slotY + tens.slotSizes[4] / 2 },
      to:   { x: final.slotCenters[0], y: final.slotY - final.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L10: combine-ones "sum" (slot 4) → final "□" (slot 2)
  //     Triggered when ones row's slot 4 is a number (= sum).
  if (ones?.slotCenters?.[4] != null && final?.slotCenters?.[2] != null
      && typeof ones.slots?.[4] === "number") {
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
  if (!ctx.anchorEqNode) return;
  const pts = linkPoints(
    ctx.anchorEqNode,
    ctx.l5Split1Node,
    ctx.l5Split2Node,
    ctx.l5Split3Node,
    ctx.l5TensNode,
    ctx.l5OnesNode,
    ctx.l5FinalNode,
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

// Render a single expression node, destroying any previous version on
// ctx, and stash its slots for linkPoints.
function renderSlot(ctx, key, slots, opts) {
  if (ctx[key]) ctx[key].destroy();
  ctx[key] = expression(ctx.k, {
    ...slots,
    x: LAYOUT.barX, y: opts.y, size: opts.size,
  });
  ctx[key].slots = slots.slots;
}

export default createRoundScene({
  levelId: 5,
  sceneName: "level5",
  poolGen: () => poolGens[5](),
  sampleSize: 10,
  stepLabels: ["拆 a", "拆 b", "加十位", "加个位", "加起来"],

  steps: [
    // Step 1 — 拆 a: child picks onesA. Split-1 reveals □_a → onesA.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, "?"), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      // split-2 starts hidden — only show after step 1 reveal. But the
      // user wants persistent graphics, so show it now (with b as
      // ?+? boxes). Actually no — let me keep split-2 hidden until
      // step 1 reveal happens, since the cascade flows from row to
      // row.
      // For persistence, show split-2 too:
      renderSlot(ctx, "l5Split2Node", split2Row(round, "?"), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split3Node", split3Row(round), { y: Y_SPLIT_3, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round), { y: Y_TENS, size: COMBINE_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round), { y: Y_ONES, size: COMBINE_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // split-1 reveals □_a → onesA.
          renderSlot(ctx, "l5Split1Node", split1Row(round, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 2 — 拆 b: child picks onesB. Split-2 reveals □_b → onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, "?", "?"), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split3Node", split3Row(round), { y: Y_SPLIT_3, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round), { y: Y_TENS, size: COMBINE_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round), { y: Y_ONES, size: COMBINE_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // split-2 reveals both boxes for b: tens → 10, ones → onesB.
          renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 3 — 加十位: child picks 20. Combine-tens reveals "?" → 20.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split3Node", split3Row(round), { y: Y_SPLIT_3, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round), { y: Y_TENS, size: COMBINE_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round), { y: Y_ONES, size: COMBINE_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step3Ids(), 3);
      return {
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5TensNode", tensSumRow(round, 20), { y: Y_TENS, size: COMBINE_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 4 — 加个位: child picks sum. Combine-ones reveals "?" → sum.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split3Node", split3Row(round), { y: Y_SPLIT_3, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round, 20), { y: Y_TENS, size: COMBINE_SIZE });
      // Combine-ones pre-fills addends (revealed from steps 1-2).
      renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB), { y: Y_ONES, size: COMBINE_SIZE });
      // Final pre-fills 20 (revealed from step 3).
      renderSlot(ctx, "l5FinalNode", finalRow(round, 20), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step4Ids(round.onesA, round.onesB), 4);
      return {
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
        onAdvance: () => {
          renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB, round.sum), { y: Y_ONES, size: COMBINE_SIZE });
          // Final gets sum pre-filled too.
          renderSlot(ctx, "l5FinalNode", finalRow(round, 20, round.sum), { y: Y_FINAL, size: FINAL_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 5 — 加起来: child picks answer. Final reveals "?" → answer.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split3Node", split3Row(round), { y: Y_SPLIT_3, size: SPLIT_SIZE });
      renderSlot(ctx, "l5TensNode", tensSumRow(round, 20), { y: Y_TENS, size: COMBINE_SIZE });
      renderSlot(ctx, "l5OnesNode", onesSumRow(round, round.onesA, round.onesB, round.sum), { y: Y_ONES, size: COMBINE_SIZE });
      renderSlot(ctx, "l5FinalNode", finalRow(round, 20, round.sum), { y: Y_FINAL, size: FINAL_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: Y_ANCHOR, size: ANCHOR_SIZE });
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
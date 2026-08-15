// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// v3 redesign (2026-08-15): cascading decomposition tree matching
// user-provided sketch — anchor at top, both addends split into
// (10 + □), then tens sum (10 + 10 = ?), ones sum (□ + □ = ?), and
// final (□ + □ = ?). 10 drawLink lines connect them in a funnel.
//
// Layout (canvas 1366×1024):
//   y=84   stepBar (5 steps)
//   y=220  Anchor: a + b = ?              size 100, persistent
//   y=370  Split row:                     size 64, persistent
//          (10 + □_a) + (10 + □_b) = □
//   y=490  Tens sum row:                  size 64, persistent
//          10 + 10 = ?
//   y=590  Ones sum row:                  size 64, persistent
//          □ + □ = ?
//   y=690  Final row:                     size 64, persistent
//          □ + □ = ?
//   y=838  Buttons
//
// Lines (drawLink, opacity 0.4, thickness 7 — same as L4):
//   L1: anchor a → split "10_a"             COL_TEN
//   L2: anchor a → split "□_a"               COL_NEED
//   L3: anchor b → split "10_b"             COL_TEN
//   L4: anchor b → split "□_b"               COL_NEED
//   L5: split "10_a" → tens sum "10_left"  COL_TEN
//   L6: split "10_b" → tens sum "10_right" COL_TEN
//   L7: split "□_a"  → ones sum "□_left"    COL_BIG
//   L8: split "□_b"  → ones sum "□_right"   COL_SMALL
//   L9: tens sum "?"  → final "□_left"       COL_TEN   (after step 3)
//   L10: ones sum "?" → final "□_right"      COL_SUM   (after step 4)
//
// 5 teaching beats — each step fills ONE slot:
//   Step 1 — 拆 a:   child picks onesA   (fills split row "□_a")
//   Step 2 — 拆 b:   child picks onesB   (fills split row "□_b")
//   Step 3 — 加十位: child picks 20       (fills tens sum "?")
//   Step 4 — 加个位: child picks sum      (fills ones sum "?")
//   Step 5 — 加起来: child picks answer  (fills final "?")
//
// Round data shape: { a, b, onesA, onesB, sum, answer } where
//   a, b ∈ [11, 19]              (both are teens)
//   onesA + onesB ≤ 9            (strict no-carry)
//   sum = onesA + onesB          (∈ [2, 9])
//   answer = a + b               (∈ [22, 29])

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260815";
import { poolGens } from "../data/pools.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import drawLink from "../components/drawLink.js?v=20260815";
import {
  INK, FONT, YELLOW, BLUE, PINK, ORANGE, SUCCESS,
} from "../components/theme.js?v=20260815";

const COL_BIG   = BLUE;
const COL_SMALL = PINK;
const COL_TEN   = YELLOW;
const COL_NEED  = ORANGE;
const COL_SUM   = SUCCESS;

const SUB_SIZE = 64;
const SUB_Y_SPLIT = 370;
const SUB_Y_TENS  = 490;
const SUB_Y_ONES  = 590;
const SUB_Y_FINAL = 690;

// Persistent anchor ("a + b = ?") rendered at the top.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// Persistent split row: (10 + □_a) + (10 + □_b) = □
// Slot layout: ["(", 10, "+", a, ")", "+", "(", 10, "+", b, ")", "=", "?"]
//   0:"("   1:10   2:"+"   3:a   4:")"   5:"+"   6:"("   7:10   8:"+"   9:b   10:")"   11:"="   12:"?"
function splitRow(round, onesA = "?", onesB = "?") {
  return {
    slots: ["(", 10, "+", onesA, ")", "+", "(", 10, "+", onesB, ")", "=", "?"],
    colors: [
      undefined, COL_TEN, undefined, COL_NEED, undefined,
      undefined,
      undefined, COL_TEN, undefined, COL_NEED, undefined,
      undefined,
      COL_NEED,
    ],
    // Reserve □ slots to "10" so the box-to-digit reveal doesn't reflow
    // (a 1-digit "1" reveals to box-width 0.9 × size; reserving to
    // "10" ensures the slot keeps the wider 1.24 × size bucket).
    reserve: ["(", 10, "+", "10", ")", "+", "(", 10, "+", "10", ")", "=", "20"],
  };
}

// Persistent tens sum row: 10 + 10 = ?
// Slot: 0:10, 1:"+", 2:10, 3:"=", 4:"?"
function tensSumRow(round, val = "?") {
  return {
    slots: [10, "+", 10, "=", val],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [10, "+", 10, "=", 20],
  };
}

// Persistent ones sum row: □ + □ = ?
// Slot: 0:left, 1:"+", 2:right, 3:"=", 4:"?"
function onesSumRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, COL_NEED],
    reserve: [round.onesA, "+", round.onesB, "=", round.sum],
  };
}

// Persistent final row: □ + □ = ?
function finalRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_TEN, undefined, COL_SUM, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Compute line endpoints for the 10 decomposition lines. Returns []
// if a required node hasn't been rendered yet (avoids drawing into
// dead coordinates mid-rebuild).
function linkPoints(anchor, split, tens, ones, final) {
  const pts = [];
  if (!anchor?.slotCenters || !split?.slotCenters) return pts;

  // L1: anchor a (slot 0) → split "10_a" (slot 1)
  if (anchor.slotCenters[0] != null && split.slotCenters[1] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: split.slotCenters[1], y: split.slotY - split.slotSizes[1] / 2 },
      color: COL_TEN,
    });
  }
  // L2: anchor a (slot 0) → split "□_a" (slot 3)
  if (anchor.slotCenters[0] != null && split.slotCenters[3] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: split.slotCenters[3], y: split.slotY - split.slotSizes[3] / 2 },
      color: COL_NEED,
    });
  }
  // L3: anchor b (slot 2) → split "10_b" (slot 7)
  if (anchor.slotCenters[2] != null && split.slotCenters[7] != null) {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: split.slotCenters[7], y: split.slotY - split.slotSizes[7] / 2 },
      color: COL_TEN,
    });
  }
  // L4: anchor b (slot 2) → split "□_b" (slot 9)
  if (anchor.slotCenters[2] != null && split.slotCenters[9] != null) {
    pts.push({
      from: { x: anchor.slotCenters[2], y: anchor.slotY + anchor.slotSizes[2] / 2 },
      to:   { x: split.slotCenters[9], y: split.slotY - split.slotSizes[9] / 2 },
      color: COL_NEED,
    });
  }
  // L5: split "10_a" (slot 1) → tens sum "10_left" (slot 0)
  if (split.slotCenters[1] != null && tens?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: split.slotCenters[1], y: split.slotY + split.slotSizes[1] / 2 },
      to:   { x: tens.slotCenters[0], y: tens.slotY - tens.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L6: split "10_b" (slot 7) → tens sum "10_right" (slot 2)
  if (split.slotCenters[7] != null && tens?.slotCenters?.[2] != null) {
    pts.push({
      from: { x: split.slotCenters[7], y: split.slotY + split.slotSizes[7] / 2 },
      to:   { x: tens.slotCenters[2], y: tens.slotY - tens.slotSizes[2] / 2 },
      color: COL_TEN,
    });
  }
  // L7: split "□_a" (slot 3) → ones sum "□_left" (slot 0)
  if (split.slotCenters[3] != null && ones?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: split.slotCenters[3], y: split.slotY + split.slotSizes[3] / 2 },
      to:   { x: ones.slotCenters[0], y: ones.slotY - ones.slotSizes[0] / 2 },
      color: COL_BIG,
    });
  }
  // L8: split "□_b" (slot 9) → ones sum "□_right" (slot 2)
  if (split.slotCenters[9] != null && ones?.slotCenters?.[2] != null) {
    pts.push({
      from: { x: split.slotCenters[9], y: split.slotY + split.slotSizes[9] / 2 },
      to:   { x: ones.slotCenters[2], y: ones.slotY - ones.slotSizes[2] / 2 },
      color: COL_SMALL,
    });
  }
  // L9: tens sum "20" (slot 4) → final "□_left" (slot 0)
  //     Only after step 3 reveals the tens-sum answer.
  if (tens?.slotCenters?.[4] != null && final?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: tens.slotCenters[4], y: tens.slotY + tens.slotSizes[4] / 2 },
      to:   { x: final.slotCenters[0], y: final.slotY - final.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L10: ones sum "sum" (slot 4) → final "□_right" (slot 2)
  //     Only after step 4 reveals the ones-sum answer.
  if (ones?.slotCenters?.[4] != null && final?.slotCenters?.[2] != null) {
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
function buildL5Step3Ids() { return [`l5-s4`]; }                // "十加十等于二十"
function buildL5Step4Ids(onesA, onesB) { return [`l5-s3-${onesA}-${onesB}`]; } // "个位相加…"
function buildL5Step5Ids(sum) { return [`l5-s5-${sum}`]; }
function buildL5RewardIds(a, b, answer) { return [`l5-rwd-${a}-${b}-${answer}`]; }

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
  poolGen: () => poolGens[5](),
  sampleSize: 10,
  // No intro cue — step 1 audio IS the entry prompt.
  // Labels match the v3 step order (tens before ones before total).
  stepLabels: ["拆 a", "拆 b", "加十位", "加个位", "加起来"],

  steps: [
    // Step 1 — 拆 a: child picks onesA.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      // Render the persistent 4 sub rows (all in placeholder state).
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round),
        x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX, y: SUB_Y_TENS, size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round),
        x: LAYOUT.barX, y: SUB_Y_ONES, size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round),
        x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // Reveal split "□_a" → onesA.
          if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
          ctx.l5SplitNode = expression(ctx.k, {
            ...splitRow(round, round.onesA, "?"),
            x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 2 — 拆 b: child picks onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, "?"),
        x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX, y: SUB_Y_TENS, size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round),
        x: LAYOUT.barX, y: SUB_Y_ONES, size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round),
        x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // Reveal split "□_b" → onesB.
          if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
          ctx.l5SplitNode = expression(ctx.k, {
            ...splitRow(round, round.onesA, round.onesB),
            x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 3 — 加十位: child picks 20 from "10 + 10 = ?".
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX, y: SUB_Y_TENS, size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX, y: SUB_Y_ONES, size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round),
        x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step3Ids(), 3);
      return {
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
        onAdvance: () => {
          // Reveal tens sum "?" → 20.
          if (ctx.l5TensNode) ctx.l5TensNode.destroy();
          ctx.l5TensNode = expression(ctx.k, {
            ...tensSumRow(round, 20),
            x: LAYOUT.barX, y: SUB_Y_TENS, size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 4 — 加个位: child picks sum = onesA + onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round, 20),
        x: LAYOUT.barX, y: SUB_Y_TENS, size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX, y: SUB_Y_ONES, size: SUB_SIZE,
      });
      // Final row pre-fills 20 (already revealed from step 3) — the
      // kid sees "20 + □ = ?" as a target for the final answer.
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, 20),
        x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step4Ids(round.onesA, round.onesB), 4);
      return {
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
        onAdvance: () => {
          // Reveal ones sum "?" → sum.
          if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
          ctx.l5OnesNode = expression(ctx.k, {
            ...onesSumRow(round, round.onesA, round.onesB, round.sum),
            x: LAYOUT.barX, y: SUB_Y_ONES, size: SUB_SIZE,
          });
          // Final row gets sum pre-filled too.
          if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
          ctx.l5FinalNode = expression(ctx.k, {
            ...finalRow(round, 20, round.sum),
            x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 5 — 加起来: child picks answer.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX, y: SUB_Y_SPLIT, size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round, 20),
        x: LAYOUT.barX, y: SUB_Y_TENS, size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round, round.onesA, round.onesB, round.sum),
        x: LAYOUT.barX, y: SUB_Y_ONES, size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, 20, round.sum),
        x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 220 });
          // Reveal final "?" → answer.
          if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
          ctx.l5FinalNode = expression(ctx.k, {
            ...finalRow(round, 20, round.sum, round.answer),
            x: LAYOUT.barX, y: SUB_Y_FINAL, size: SUB_SIZE,
          });
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
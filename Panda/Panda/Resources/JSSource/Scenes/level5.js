// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// v8 redesign (2026-08-15): strictly per user sketch — 5 rows, each step
// INTRODUCES ONE NEW ROW. Earlier rows stay visible (persistent).
// Step order matches the audio cue ids on disk: 个位相加 (l5-s3-*) at
// step 3, 十加十等于二十 (l5-s4, generic) at step 4, 二十加 sum (l5-s5-*) at
// step 5. Previous v6/v7 put tens before ones — that was wrong.
//
// Per-step visible rows (all rows persistent once introduced):
//
//   Step 1 — 拆 a (audio: l5-s1-{a}-{b}, "先把 a 拆成 10 加几"):
//     anchor:    a + b = ?
//     split-1:   ? + ? + b = ?        (a as 2 boxes, b intact)
//     → pick onesA → split-1: 10 + 1 + b = ?
//
//   Step 2 — 拆 b (audio: l5-s2-{a}-{b}, "再把 b 拆成 10 加几"):
//     anchor:    a + b = ?
//     split-1:   10 + 1 + b = ?
//     split-2:   10 + 1 + ? + ? = ?   (b as 2 boxes)
//     → pick onesB → split-2: 10 + 1 + 10 + 1 = ?
//
//   Step 3 — 加个位 (audio: l5-s3-{onesA}-{onesB}, "个位相加"):
//     anchor:    a + b = ?
//     split-1:   10 + 1 + b = ?
//     split-2:   10 + 1 + 10 + 1 = ?
//     combine-ones: 10 + 10 + ? = ?   (kid picks the ones sum)
//     → pick sum → combine-ones: 10 + 10 + sum = ?
//
//   Step 4 — 加十位 (audio: l5-s4, "十加十等于二十"):
//     anchor:    a + b = ?
//     split-1:   10 + 1 + b = ?
//     split-2:   10 + 1 + 10 + 1 = ?
//     combine-ones: 10 + 10 + sum = ?
//     combine-tens: ? + sum = ?       (kid picks tens sum = 20)
//     → pick 20 → combine-tens: 20 + sum = ?
//
//   Step 5 — 加起来 (audio: l5-s5-{sum}, "二十加 sum 等于几"):
//     anchor:    a + b = ?
//     split-1:   10 + 1 + b = ?
//     split-2:   10 + 1 + 10 + 1 = ?
//     combine-ones: 10 + 10 + sum = ?
//     combine-tens: 20 + sum = ?      (kid picks answer)
//     → pick answer → combine-tens: 20 + sum = answer
//                     anchor: a + b = answer
//                     + reward audio l5-rwd-{a}-{b}-{answer}
//
// Round data shape: { a, b, onesA, onesB, sum, answer } where
//   a, b ∈ [11, 19]; onesA + onesB ≤ 9; sum = onesA+onesB; answer = a+b.

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260815";
import { poolGens } from "../data/pools.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import drawLink from "../components/drawLink.js?v=20260815";
import {
  INK, YELLOW, BLUE, PINK, ORANGE, SUCCESS,
} from "../components/theme.js?v=20260815";

const COL_BIG   = BLUE;
const COL_SMALL = PINK;
const COL_TEN   = YELLOW;
const COL_NEED  = ORANGE;
const COL_SUM   = SUCCESS;

// 5 rows fit between the step bar (y≈84, ends y≈120) and the buttons
// (overridden to y≈900 below — see the `buttonY: 900` in each step's
// question config). Step bar overlap with the anchor was a recurring
// issue at Y_ANCHOR=180 (the size-80 text reaches y≈140, only 20px
// below the bar's bottom edge). Per user feedback 2026-08-15: "把这个地方
// 要下移，把整个表达式和选项都要下移，这个地方有重叠."
//
//   anchor (top)    → split-1    → split-2    → combine-ones → combine-tens
//   y=240            y=350        y=450        y=580          y=700
//
// 110px row stride gives the decomposition lines enough vertical
// runway without crowding the digits (size 56-80 boxes are ~80-120px
// tall; 110px keeps a small gap).
const Y_ANCHOR       = 240;
const Y_SPLIT_1      = 350;
const Y_SPLIT_2      = 450;
const Y_COMBINE_ONES = 580;
const Y_COMBINE_TENS = 700;

const ANCHOR_SIZE  = 80;
const SPLIT_SIZE   = 56;
const COMBINE_SIZE = 60;

// ---------- option formatting for "拆 a" / "拆 b" steps ----------------
// Steps 1 and 2 are "split X into 10 + digit" — the buttons should
// display the full decomposition form ("10+2", "10+3", …) so the kid
// reads each option as a candidate composition of the anchor digit.
// Per user feedback 2026-08-15: "选项应该是10+2，10+4，10+5，10+3"
// (the options should be 10+N, not just single digits — the visual
// format makes the question "which decomposition matches this digit"
// instead of "pick the ones digit"). Steps 3/4/5 still use plain
// digits — step 3 is the ones sum (a single digit), step 4 is "20",
// step 5 is the full answer.
//
// Mirrors roundScene's `options()` shape: 4 distinct entries including
// the correct one, walking outward ±1, ±2, … in the [min, max] range.
// Returns STRINGS like ["10+3", "10+2", "10+4", "10+5"] so the choice
// button renders the full label.
function decompositionOptions(correctDigit, { min = 0, max = 9, count = 4 } = {}) {
  const inRange = (v) => Number.isFinite(v) && v >= min && v <= max;
  const picked = [];
  const add = (v) => {
    const formatted = `10+${v}`;
    if (inRange(v) && !picked.includes(formatted)) picked.push(formatted);
  };
  add(correctDigit);
  for (let d = 1; picked.length < count && d <= max - min; d++) {
    add(correctDigit + d);
    add(correctDigit - d);
  }
  return picked.slice(0, count);
}

// ---------- slot layouts for each row ----------------------------------

// anchor: "a + b = ?" — sum slot reserved to the 2-digit answer so the
// row doesn't recenter when step 5 reveals it.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// split-1: "[left] + onesA + b = [answer]"
//   pre-click (step 1):  left="?", onesA="?", answer="?"
//   post-click (step 1): left="10", onesA=onesA, answer="?"
//   step 5 reveal:       answer=round.answer (filled on correct pick)
function split1Row(round, left = "?", onesA = "?", answer = "?") {
  return {
    slots: [left, "+", onesA, "+", round.b, "=", answer],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_SMALL, undefined,
      // Answer slot: orange (COL_NEED) while pending, ink once revealed
      // — matches the convention used by L4's bottom row.
      answer === "?" ? COL_NEED : INK,
    ],
    reserve: ["10", "+", "10", "+", round.b, "=", round.answer],
  };
}

// split-2: "10 + onesA + b_left + b_right = [answer]"
//   pre-click (step 2):  b_left="?", b_right="?", answer="?"
//   post-click (step 2): b_left="10", b_right=onesB, answer="?"
//   step 5 reveal:       answer=round.answer (filled on correct pick)
function split2Row(round, b_left = "?", b_right = "?", answer = "?") {
  return {
    slots: [10, "+", round.onesA, "+", b_left, "+", b_right, "=", answer],
    colors: [
      COL_TEN, undefined, COL_NEED, undefined,
      COL_TEN, undefined, COL_NEED, undefined,
      answer === "?" ? COL_NEED : INK,
    ],
    reserve: [10, "+", "10", "+", "10", "+", "10", "=", round.answer],
  };
}

// combine-ones: "10 + 10 + ones_sum = answer"
//   step 3 pre-click:  "10 + 10 + ? = ?"   (kid picks ones_sum)
//   step 3 post:       "10 + 10 + sum = ?" (right stays "?" until step 5)
function combineOnesRow(round, ones_sum = "?", answer = "?") {
  return {
    slots: [10, "+", 10, "+", ones_sum, "=", answer],
    colors: [
      COL_TEN, undefined, COL_TEN, undefined,
      COL_NEED, undefined,
      // Answer slot: orange (COL_NEED) while pending, ink once revealed
      // — matches L4's bottomReserve reveal convention.
      answer === "?" ? COL_NEED : INK,
    ],
    reserve: [10, "+", 10, "+", "10", "=", round.answer],
  };
}

// combine-tens: "tens_sum + ones_sum = answer"
//   step 4 pre-click:  "? + sum = ?"     (kid picks tens_sum = 20)
//   step 4 post:       "20 + sum = ?"    (right stays "?" until step 5)
//   step 5 post:       "20 + sum = answer"
function combineTensRow(round, tens_sum = "?", ones_sum = "?", answer = "?") {
  return {
    slots: [tens_sum, "+", ones_sum, "=", answer],
    colors: [
      tens_sum === "?" ? COL_NEED : COL_TEN,
      undefined,
      COL_SUM,
      undefined,
      answer === "?" ? COL_NEED : INK,
    ],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Render helper — destroys the old node, creates a fresh expression
// at the given (y, size), stores the new node under ctx[key], and
// remembers the slot layout for the link-point math below.
function renderSlot(ctx, key, slots, opts) {
  if (ctx[key]) ctx[key].destroy();
  ctx[key] = expression(ctx.k, {
    ...slots,
    x: LAYOUT.barX, y: opts.y, size: opts.size,
  });
  ctx[key].slots = slots.slots;
}

// ---------- link lines -------------------------------------------------
//
// Per the user sketch (2026-08-15): each line appears AS SOON AS the
// destination row is introduced, not after the kid picks. The line
// tells the kid "this box represents the decomposition of that digit"
// — that's the whole point of showing the diagram. We only gate on
// "both endpoints have a slotCenter" — i.e. the source and destination
// rows both exist. The source endpoint may still be a box (`?` or `□`)
// at the moment the line first appears; that's fine, the line endpoint
// is the box's center.
//
// Decomposition FLOW (per user feedback 2026-08-15 round 4):
//
//   anchor a ──┬──→ split-1[0]  (10 half of a)
//              └──→ split-1[2]  (ones half of a)
//   (no line from anchor b to split-1 — b is visible in both rows)
//
//   split-1 b ─┬──→ split-2[4]  (10 half of b)
//              └──→ split-2[6]  (ones half of b)
//   (the b decomposition FLOW originates from the b in split-1, the
//    second equation, not from the b in the anchor — that's the
//    pedagogical "where the next decomposition starts" point)
//
//   split-2[2] ──→ combine-ones[4]  (onesA → ones_sum box)
//   split-2[6] ──→ combine-ones[4]  (onesB → ones_sum box)
//
//   combine-ones[0] ──→ combine-tens[0]  (10 → tens_sum box)
//   combine-ones[2] ──→ combine-tens[0]  (10 → tens_sum box)
//   combine-ones[4] ──→ combine-tens[2]  (ones_sum → ones_sum)
//
//   NO line from anchor a → split-2[0] (the literal 10 in split-2 is
//   visually identical to split-1's 10; an extra line just stacks on
//   L1's endpoint and clutters the picture).
//
// L1:   anchor a    → split-1[0]   (10 half of a)        (step 1 intro)
// L1a:  anchor a    → split-1[2]   (ones half of a)      (step 1 intro)
// L4:   split-1[4]  → split-2[4]   (10 half of b)        (step 2 intro)
// L4a:  split-1[4]  → split-2[6]   (ones half of b)      (step 2 intro)
// L5:   split-2[2]  → combine-ones[4]                    (step 3 intro)
// L6:   split-2[6]  → combine-ones[4]                    (step 3 intro)
// L7:   combine-ones[0] → combine-tens[0]                (step 4 intro)
// L8:   combine-ones[2] → combine-tens[0]                (step 4 intro)
// L9:   combine-ones[4] → combine-tens[2]                (step 4 intro)
function linkPoints(anchor, s1, s2, onesRow, tensRow) {
  const pts = [];
  if (!anchor?.slotCenters) return pts;

  // L1: anchor a → split-1 slot 0 (10 half). Always draw once split-1 exists.
  if (s1?.slotCenters?.[0] != null && anchor.slotCenters[0] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: s1.slotCenters[0], y: s1.slotY - s1.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L1a: anchor a → split-1 slot 2 (ones half). Mirror of L4's split-link
  // shape — the second leg of the decomposition. Draws once split-1
  // exists; color matches the box's COL_NEED color so the line visually
  // pairs with the slot.
  if (s1?.slotCenters?.[2] != null && anchor.slotCenters[0] != null) {
    pts.push({
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to:   { x: s1.slotCenters[2], y: s1.slotY - s1.slotSizes[2] / 2 },
      color: COL_NEED,
    });
  }
  // L4: split-1[4] (b in split-1) → split-2[4] (10 half of b). Source is
  // the b in split-1, not the b in the anchor — the decomposition
  // "flows" through split-1's b into split-2's two boxes. Draws once
  // split-2 exists.
  if (s1?.slotCenters?.[4] != null && s2?.slotCenters?.[4] != null) {
    pts.push({
      from: { x: s1.slotCenters[4], y: s1.slotY + s1.slotSizes[4] / 2 },
      to:   { x: s2.slotCenters[4], y: s2.slotY - s2.slotSizes[4] / 2 },
      color: COL_TEN,
    });
  }
  // L4a: split-1[4] (b) → split-2[6] (ones half of b). Same source as L4;
  // the b in split-1 decomposes into TWO boxes in split-2 (V-shape).
  if (s1?.slotCenters?.[4] != null && s2?.slotCenters?.[6] != null) {
    pts.push({
      from: { x: s1.slotCenters[4], y: s1.slotY + s1.slotSizes[4] / 2 },
      to:   { x: s2.slotCenters[6], y: s2.slotY - s2.slotSizes[6] / 2 },
      color: COL_NEED,
    });
  }
  // L5: split-2 onesA → combine-ones ones_sum. Draw once combine-ones exists.
  if (s2?.slotCenters?.[2] != null && onesRow?.slotCenters?.[4] != null) {
    pts.push({
      from: { x: s2.slotCenters[2], y: s2.slotY + s2.slotSizes[2] / 2 },
      to:   { x: onesRow.slotCenters[4], y: onesRow.slotY - onesRow.slotSizes[4] / 2 },
      color: COL_NEED,
    });
  }
  // L6: split-2 onesB → combine-ones ones_sum. Same gate.
  if (s2?.slotCenters?.[6] != null && onesRow?.slotCenters?.[4] != null) {
    pts.push({
      from: { x: s2.slotCenters[6], y: s2.slotY + s2.slotSizes[6] / 2 },
      to:   { x: onesRow.slotCenters[4], y: onesRow.slotY - onesRow.slotSizes[4] / 2 },
      color: COL_NEED,
    });
  }
  // L7: combine-ones 10_left → combine-tens tens_sum. Draw once combine-tens exists.
  if (onesRow?.slotCenters?.[0] != null && tensRow?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: onesRow.slotCenters[0], y: onesRow.slotY + onesRow.slotSizes[0] / 2 },
      to:   { x: tensRow.slotCenters[0], y: tensRow.slotY - tensRow.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L8: combine-ones 10_right → combine-tens tens_sum. Same gate.
  if (onesRow?.slotCenters?.[2] != null && tensRow?.slotCenters?.[0] != null) {
    pts.push({
      from: { x: onesRow.slotCenters[2], y: onesRow.slotY + onesRow.slotSizes[2] / 2 },
      to:   { x: tensRow.slotCenters[0], y: tensRow.slotY - tensRow.slotSizes[0] / 2 },
      color: COL_TEN,
    });
  }
  // L9: combine-ones ones_sum → combine-tens ones_sum. Naturally appears
  //     at step 4 intro: tensRow didn't exist before, and by step 4
  //     step 3 has already revealed onesRow[4] as a number.
  if (onesRow?.slotCenters?.[4] != null && tensRow?.slotCenters?.[2] != null) {
    pts.push({
      from: { x: onesRow.slotCenters[4], y: onesRow.slotY + onesRow.slotSizes[4] / 2 },
      to:   { x: tensRow.slotCenters[2], y: tensRow.slotY - tensRow.slotSizes[2] / 2 },
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
    ctx.l5CombineOnesNode,
    ctx.l5CombineTensNode,
  );
  for (const p of pts) {
    ctx.arrowNodes.push(drawLink(ctx.k, ctx.arrowsRoot, p.from, p.to, p.color, 7, 0.4));
  }
}

// ---------- audio cue builders -----------------------------------------

function buildL5Step1Ids(a, b) { return [`l5-s1-${a}-${b}`]; }
function buildL5Step2Ids(a, b) { return [`l5-s2-${a}-${b}`]; }
function buildL5Step3Ids(onesA, onesB) { return [`l5-s3-${onesA}-${onesB}`]; }
function buildL5Step4Ids() { return [`l5-s4`]; }
function buildL5Step5Ids(sum) { return [`l5-s5-${sum}`]; }
function buildL5RewardIds(a, b, answer) { return [`l5-rwd-${a}-${b}-${answer}`]; }

// Fires the per-step audio chain. Same pattern as L4 (see scenes/level4.js
// for the full rationale):
//   - After a correct pick (lastEncourageId set): chain off the cheer
//     chain's last cue with a 400ms breath gap.
//   - First-time entry / round 0 step 1: play immediately with a small
//     render-settle delay.
function fireL5StepAudio(ctx, ids, _stepNumber, onComplete) {
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400, seqGapMs: 40,
    }, onComplete);
    return;
  }
  window.PandaAudio.playSequence(ids, 40, 100, onComplete);
}

// ---------- the 5 steps ------------------------------------------------

export default createRoundScene({
  levelId: 6,
  sceneName: "level6",
  // 2026-08-16: per user "把十以内的减法放到level1，其它的依次移动一个
  // level", this 十几加十几 level moved from L5 to L6. levelId/poolGens/
  // sceneName updated to match. The cue ID prefix (`l5-*`) is unchanged
  // because the per-round MP3 files are baked under those names.
  // sampleSize MUST equal DAILY_CAPS[6] (8) so a single play-through
  // finishes today's quota in one go.
  poolGen: () => poolGens[6](),
  sampleSize: 8,
  stepLabels: ["拆 a", "拆 b", "加个位", "加十位", "加起来"],

  steps: [
    // Step 1 — 拆 a. Introduce split-1 row. Defer the equation render
    // until the audio lands so the kid hears the strategy first.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      const renderStep1 = () => {
        renderSlot(ctx, "l5Split1Node", split1Row(round, "?", "?"), { y: Y_SPLIT_1, size: SPLIT_SIZE });
        redrawLinks(ctx);
      };
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1, renderStep1);
      return {
        question: {
          correct: `10+${round.onesA}`,
          values: decompositionOptions(round.onesA, { min: 1, max: 8 }),
          // Shift the button row down so 5 stacked equations + buttons
          // fit cleanly (default buttonY=838 would collide with the
          // bottom combine-tens row at Y_COMBINE_TENS=700).
          buttonY: 920,
        },
        onAdvance: () => {
          renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 2 — 拆 b. Introduce split-2 row. Anchor + split-1 stay.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      const renderStep2 = () => {
        renderSlot(ctx, "l5Split2Node", split2Row(round, "?", "?"), { y: Y_SPLIT_2, size: SPLIT_SIZE });
        redrawLinks(ctx);
      };
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2, renderStep2);
      return {
        question: {
          correct: `10+${round.onesB}`,
          values: decompositionOptions(round.onesB, { min: 1, max: 8 }),
          // Shift the button row down so 5 stacked equations + buttons
          // fit cleanly (default buttonY=838 would collide with the
          // bottom combine-tens row at Y_COMBINE_TENS=700).
          buttonY: 920,
        },
        onAdvance: () => {
          renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 3 — 加个位. Introduce combine-ones row "10 + 10 + ? = ?".
    // User picks the ones sum; the right slot (eventual answer) stays "?".
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      const renderStep3 = () => {
        renderSlot(ctx, "l5CombineOnesNode", combineOnesRow(round), { y: Y_COMBINE_ONES, size: COMBINE_SIZE });
        redrawLinks(ctx);
      };
      fireL5StepAudio(
        ctx, buildL5Step3Ids(round.onesA, round.onesB), 3, renderStep3,
      );
      return {
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
          // Shift the button row down so 5 stacked equations + buttons
          // fit cleanly (default buttonY=838 would collide with the
          // bottom combine-tens row at Y_COMBINE_TENS=700).
          buttonY: 920,
        },
        onAdvance: () => {
          // combine-ones reveals the ones_sum slot; right stays "?".
          renderSlot(ctx, "l5CombineOnesNode", combineOnesRow(round, round.sum), { y: Y_COMBINE_ONES, size: COMBINE_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 4 — 加十位. Introduce combine-tens row "? + sum = ?".
    // User picks tens_sum (always 20); the right slot (eventual answer)
    // stays "?".
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5CombineOnesNode", combineOnesRow(round, round.sum), { y: Y_COMBINE_ONES, size: COMBINE_SIZE });
      const renderStep4 = () => {
        renderSlot(ctx, "l5CombineTensNode", combineTensRow(round, "?", round.sum), { y: Y_COMBINE_TENS, size: COMBINE_SIZE });
        redrawLinks(ctx);
      };
      fireL5StepAudio(ctx, buildL5Step4Ids(), 4, renderStep4);
      return {
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
          // Shift the button row down so 5 stacked equations + buttons
          // fit cleanly (default buttonY=838 would collide with the
          // bottom combine-tens row at Y_COMBINE_TENS=700).
          buttonY: 920,
        },
        onAdvance: () => {
          // combine-tens reveals tens_sum = 20; right (answer) stays "?".
          renderSlot(ctx, "l5CombineTensNode", combineTensRow(round, 20, round.sum), { y: Y_COMBINE_TENS, size: COMBINE_SIZE });
          redrawLinks(ctx);
        },
      };
    },

    // Step 5 — 加起来. No new row. Reveal the answer in combine-tens,
    // in the combine-ones' right slot, and in the anchor. Then play the
    // reward audio "a 加 b 等于 answer" and chain roundScene's advance off
    // it.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: Y_ANCHOR, size: ANCHOR_SIZE });
      renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA), { y: Y_SPLIT_1, size: SPLIT_SIZE });
      renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB), { y: Y_SPLIT_2, size: SPLIT_SIZE });
      renderSlot(ctx, "l5CombineOnesNode", combineOnesRow(round, round.sum), { y: Y_COMBINE_ONES, size: COMBINE_SIZE });
      renderSlot(ctx, "l5CombineTensNode", combineTensRow(round, 20, round.sum), { y: Y_COMBINE_TENS, size: COMBINE_SIZE });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
          // Shift the button row down so 5 stacked equations + buttons
          // fit cleanly (default buttonY=838 would collide with the
          // bottom combine-tens row at Y_COMBINE_TENS=700).
          buttonY: 920,
        },
        onAdvance: () => {
          // Reveal the answer everywhere it was a "?". Per user feedback
          // 2026-08-15 ("这个地方没有回填"): split-1 and split-2 ALSO have
          // an answer slot at the right edge that should fill in here —
          // otherwise the kid sees anchor=29, combine-ones=29,
          // combine-tens=29, but split-1/split-2 still end in "□",
          // which reads as "incomplete". Re-render all four rows so the
          // whole column is consistent.
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: Y_ANCHOR, size: ANCHOR_SIZE });
          renderSlot(ctx, "l5Split1Node", split1Row(round, 10, round.onesA, round.answer), { y: Y_SPLIT_1, size: SPLIT_SIZE });
          renderSlot(ctx, "l5Split2Node", split2Row(round, 10, round.onesB, round.answer), { y: Y_SPLIT_2, size: SPLIT_SIZE });
          renderSlot(ctx, "l5CombineOnesNode", combineOnesRow(round, round.sum, round.answer), { y: Y_COMBINE_ONES, size: COMBINE_SIZE });
          renderSlot(ctx, "l5CombineTensNode", combineTensRow(round, 20, round.sum, round.answer), { y: Y_COMBINE_TENS, size: COMBINE_SIZE });
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
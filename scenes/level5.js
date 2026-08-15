// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// v2 redesign (2026-08-15): 4 persistent sub-equations on screen at once
// with 7 drawLink lines connecting them, mirroring L4's anchor→split→
// bottom decomposition pattern. Previously each step destroyed its
// sub-equation, so the kid lost the visual thread — by step 5 they
// had forgotten what step 1 was about. Per user feedback: "5步，
// 小孩早就忘了前面是怎样的了."
//
// Layout (canvas 1366×1024):
//   y=84   stepBar (5 steps)
//   y=220  Anchor: a + b = ?          size 100, persistent
//   y=360  Split row:                  size 64, persistent
//          [a] = 10 + □_a     [b] = 10 + □_b
//   y=480  Ones sum row:               size 64, persistent
//          □_left + □_right = ?
//   y=580  Tens sum row:               size 64, persistent
//          10 + 10 = ?
//   y=680  Final row:                  size 64, persistent
//          20 + □ = ?
//   y=838  Buttons
//
// Lines (drawLink, opacity 0.4, thickness 7 — same as L4):
//   L1: anchor a (slot 0) → split row's "10_a" (slot 0)         COL_TEN
//   L2: anchor a (slot 0) → split row's "□_a"  (slot 2)          COL_NEED
//   L3: anchor b (slot 2) → split row's "10_b" (slot 5)          COL_TEN
//   L4: anchor b (slot 2) → split row's "□_b"  (slot 7)          COL_NEED
//   L5: split row's "□_a" (after reveal) → ones sum "□_left"      COL_BIG
//   L6: split row's "□_b" (after reveal) → ones sum "□_right"     COL_SMALL
//   L7: tens sum's "20" (after reveal) → final row's "20"          COL_TEN
//
// Round data shape: { a, b, onesA, onesB, sum, answer } where
//   a, b ∈ [11, 19]              (both are teens)
//   onesA + onesB ≤ 9            (strict no-carry)
//   sum = onesA + onesB          (∈ [2, 9])
//   answer = a + b               (∈ [22, 29])
//
// 5 teaching beats — each step fills ONE slot:
//   Step 1 — 拆 a:   child picks onesA   (fills split row "□_a")
//   Step 2 — 拆 b:   child picks onesB   (fills split row "□_b")
//   Step 3 — 加个位: child picks sum      (fills ones sum "?")
//   Step 4 — 加十位: child picks 20       (fills tens sum "?")
//   Step 5 — 加起来: child picks answer  (fills final "?")
//
// After step 5, the anchor reveals to "a + b = answer" and a reward
// audio reads "a+b=answer" (the full equation as a celebration
// sentence).
//
// Audio cue naming: l5-* prefix.
//   l5-s1-{a}-{b}        36 cues
//   l5-s2-{a}-{b}        36 cues
//   l5-s3-{oA}-{oB}      36 cues
//   l5-s4                1 cue
//   l5-s5-{sum}          8 cues
//   l5-rwd-{a}-{b}-{answer}  36
//   Total: 153 unique MP3s (real Tencent TTS, not silent placeholders).

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260815";
import { poolGens } from "../data/pools.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import drawLink from "../components/drawLink.js?v=20260815";
import {
  INK, FONT, YELLOW, BLUE, PINK, ORANGE, SUCCESS,
} from "../components/theme.js?v=20260815";

const COL_BIG   = BLUE;     // the 2-digit addend (a) / onesA
const COL_SMALL = PINK;     // the 2-digit addend (b) / onesB
const COL_TEN   = YELLOW;   // the literal "10" / "20"
const COL_NEED  = ORANGE;   // the unknown / just-computed slot
const COL_SUM   = SUCCESS;  // the final answer

const SUB_SIZE = 64;
const SUB_Y_SPLIT = 360;
const SUB_Y_ONES  = 480;
const SUB_Y_TENS  = 580;
const SUB_Y_FINAL = 680;

// Persistent anchor ("a + b = ?") rendered at the top.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// Persistent split row: a = 10 + ?_a   b = 10 + ?_b
// Both unknowns fill in across steps 1 and 2.
function splitRow(round, onesA = "?", onesB = "?") {
  return {
    slots: [round.a, "=", 10, "+", onesA, " ", round.b, "=", 10, "+", onesB],
    colors: [
      COL_BIG, undefined, COL_TEN, undefined, COL_NEED,
      undefined,
      COL_SMALL, undefined, COL_TEN, undefined, COL_NEED,
    ],
    // Reserve each unknown slot to its 1-digit lifetime content.
    reserve: [round.a, "=", 10, "+", "10", " ", round.b, "=", 10, "+", "10"],
  };
}

// Persistent ones sum row: ?_left + ?_right = ?
// 4th arg is the answer slot — defaults to "?" until step 3 reveals it.
function onesSumRow(round, left = "?", right = "?", ans = "?") {
  return {
    slots: [left, "+", right, "=", ans],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, COL_NEED],
    reserve: [round.onesA, "+", round.onesB, "=", round.sum],
  };
}

// Persistent tens sum row: 10 + 10 = ?
function tensSumRow(round, val = "?") {
  return {
    slots: [10, "+", 10, "=", val],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [10, "+", 10, "=", 20],
  };
}

// Persistent final row: 20 + sum = ?
function finalRow(round, sum, ans = "?") {
  return {
    slots: [20, "+", sum, "=", ans],
    colors: [COL_TEN, undefined, COL_NEED, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Compute line endpoints (from → to) for the 7 decomposition lines.
// Returns [] if a required node hasn't been rendered yet (avoids
// drawing into dead coordinates mid-rebuild).
function linkPoints(anchor, split, ones, tens, final) {
  const pts = [];
  if (!anchor?.slotCenters || !split?.slotCenters) return pts;

  // L1: anchor a (slot 0) → split "10_a" (slot 2)
  if (anchor.slotCenters[0] != null && split.slotCenters[2] != null) {
    pts.push({
      from: {
        x: anchor.slotCenters[0],
        y: anchor.slotY + anchor.slotSizes[0] / 2,
      },
      to: {
        x: split.slotCenters[2],
        y: split.slotY - split.slotSizes[2] / 2,
      },
      color: COL_TEN,
    });
  }
  // L2: anchor a (slot 0) → split "□_a" (slot 4)
  if (anchor.slotCenters[0] != null && split.slotCenters[4] != null) {
    pts.push({
      from: {
        x: anchor.slotCenters[0],
        y: anchor.slotY + anchor.slotSizes[0] / 2,
      },
      to: {
        x: split.slotCenters[4],
        y: split.slotY - split.slotSizes[4] / 2,
      },
      color: COL_NEED,
    });
  }
  // L3: anchor b (slot 2) → split "10_b" (slot 8)
  if (anchor.slotCenters[2] != null && split.slotCenters[8] != null) {
    pts.push({
      from: {
        x: anchor.slotCenters[2],
        y: anchor.slotY + anchor.slotSizes[2] / 2,
      },
      to: {
        x: split.slotCenters[8],
        y: split.slotY - split.slotSizes[8] / 2,
      },
      color: COL_TEN,
    });
  }
  // L4: anchor b (slot 2) → split "□_b" (slot 10)
  if (anchor.slotCenters[2] != null && split.slotCenters[10] != null) {
    pts.push({
      from: {
        x: anchor.slotCenters[2],
        y: anchor.slotY + anchor.slotSizes[2] / 2,
      },
      to: {
        x: split.slotCenters[10],
        y: split.slotY - split.slotSizes[10] / 2,
      },
      color: COL_NEED,
    });
  }
  // L5: split "onesA" (slot 4) → ones sum "left" (slot 0) — only
  //     if both rendered and slot 4 has a numeric center (i.e.,
  //     step 1 has revealed it).
  if (
    split.slotCenters[4] != null && ones?.slotCenters?.[0] != null
  ) {
    pts.push({
      from: {
        x: split.slotCenters[4],
        y: split.slotY + split.slotSizes[4] / 2,
      },
      to: {
        x: ones.slotCenters[0],
        y: ones.slotY - ones.slotSizes[0] / 2,
      },
      color: COL_BIG,
    });
  }
  // L6: split "onesB" (slot 10) → ones sum "right" (slot 2)
  if (
    split.slotCenters[10] != null && ones?.slotCenters?.[2] != null
  ) {
    pts.push({
      from: {
        x: split.slotCenters[10],
        y: split.slotY + split.slotSizes[10] / 2,
      },
      to: {
        x: ones.slotCenters[2],
        y: ones.slotY - ones.slotSizes[2] / 2,
      },
      color: COL_SMALL,
    });
  }
  // L7: tens sum "20" (slot 4) → final "20" (slot 0) — only after
  //     step 4 reveals the tens-sum result.
  if (
    tens?.slotCenters?.[4] != null && final?.slotCenters?.[0] != null
  ) {
    pts.push({
      from: {
        x: tens.slotCenters[4],
        y: tens.slotY + tens.slotSizes[4] / 2,
      },
      to: {
        x: final.slotCenters[0],
        y: final.slotY - final.slotSizes[0] / 2,
      },
      color: COL_TEN,
    });
  }
  return pts;
}

// Destroy + redraw the 7 link lines on the arrows. call after
// any sub-row has been re-rendered (slot centers may have shifted).
function redrawLinks(ctx) {
  ctx.arrowNodes?.forEach((n) => n.destroy());
  ctx.arrowNodes = [];
  if (!ctx.anchorEqNode || !ctx.l5SplitNode) return;
  const pts = linkPoints(
    ctx.anchorEqNode,
    ctx.l5SplitNode,
    ctx.l5OnesNode,
    ctx.l5TensNode,
    ctx.l5FinalNode,
  );
  for (const p of pts) {
    ctx.arrowNodes.push(drawLink(ctx.k, ctx.arrowsRoot, p.from, p.to, p.color, 7, 0.4));
  }
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
    // a = 10 + onesA. Split row is drawn fresh on this step with
    // both unknowns (revealed ones shows up in subsequent renders).
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      // Render the persistent split row (both unknowns).
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_SPLIT,
        size: SUB_SIZE,
      });
      // Pre-render the lower rows as placeholders so the kid sees
      // the full decomposition tree, not just the active sub.
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_ONES,
        size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_TENS,
        size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_FINAL,
        size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        // No `equation` — the persistent 4 rows above are the equation.
        // roundScene's setEquation would create an *additional* node on
        // top of these, which we don't want. We supply a no-op equation
        // shape (empty) so roundScene's `if (built.equation)` branch
        // skips it.
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // Reveal the split row's "□_a" → onesA in place (no width
          // change, just text). The reserve is already pinned.
          if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
          ctx.l5SplitNode = expression(ctx.k, {
            ...splitRow(round, round.onesA, "?"),
            x: LAYOUT.barX,
            y: SUB_Y_SPLIT,
            size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 2 — 拆 b: child picks onesB from b = 10 + onesB.
    (ctx, round) => {
      // Anchor + split row + lower rows stay visible from step 1.
      // Just redraw with onesA already revealed (so the kid sees the
      // first decomposition as a stable reference).
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, "?"),
        x: LAYOUT.barX,
        y: SUB_Y_SPLIT,
        size: SUB_SIZE,
      });
      // Ones/tens/final rows still in placeholder form.
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_ONES,
        size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_TENS,
        size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_FINAL,
        size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          // Reveal the split row's "□_b" → onesB.
          if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
          ctx.l5SplitNode = expression(ctx.k, {
            ...splitRow(round, round.onesA, round.onesB),
            x: LAYOUT.barX,
            y: SUB_Y_SPLIT,
            size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 3 — 加个位: child picks sum = onesA + onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX,
        y: SUB_Y_SPLIT,
        size: SUB_SIZE,
      });
      // Ones sum row now has onesA + onesB as the addends (both
      // already revealed from steps 1 and 2), with "?" as the answer.
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX,
        y: SUB_Y_ONES,
        size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_TENS,
        size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_FINAL,
        size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step3Ids(round.onesA, round.onesB), 3);
      return {
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
        onAdvance: () => {
          // Reveal the ones sum row's "?" → sum.
          if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
          ctx.l5OnesNode = expression(ctx.k, {
            ...onesSumRow(round, round.onesA, round.onesB, round.sum),
            x: LAYOUT.barX,
            y: SUB_Y_ONES,
            size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 4 — 加十位: child picks 20 from "10 + 10 = ?".
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX,
        y: SUB_Y_SPLIT,
        size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round, round.onesA, round.onesB, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_ONES,
        size: SUB_SIZE,
      });
      // Tens sum row is the active sub. The lower rows stay.
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round),
        x: LAYOUT.barX,
        y: SUB_Y_TENS,
        size: SUB_SIZE,
      });
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_FINAL,
        size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step4Ids(), 4);
      return {
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
        onAdvance: () => {
          // Reveal tens sum row's "?" → 20.
          if (ctx.l5TensNode) ctx.l5TensNode.destroy();
          ctx.l5TensNode = expression(ctx.k, {
            ...tensSumRow(round, 20),
            x: LAYOUT.barX,
            y: SUB_Y_TENS,
            size: SUB_SIZE,
          });
          redrawLinks(ctx);
        },
      };
    },

    // Step 5 — 加起来: child picks answer = 20 + sum.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      if (ctx.l5SplitNode) ctx.l5SplitNode.destroy();
      ctx.l5SplitNode = expression(ctx.k, {
        ...splitRow(round, round.onesA, round.onesB),
        x: LAYOUT.barX,
        y: SUB_Y_SPLIT,
        size: SUB_SIZE,
      });
      if (ctx.l5OnesNode) ctx.l5OnesNode.destroy();
      ctx.l5OnesNode = expression(ctx.k, {
        ...onesSumRow(round, round.onesA, round.onesB, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_ONES,
        size: SUB_SIZE,
      });
      if (ctx.l5TensNode) ctx.l5TensNode.destroy();
      ctx.l5TensNode = expression(ctx.k, {
        ...tensSumRow(round, 20),
        x: LAYOUT.barX,
        y: SUB_Y_TENS,
        size: SUB_SIZE,
      });
      // Final row is the active sub.
      if (ctx.l5FinalNode) ctx.l5FinalNode.destroy();
      ctx.l5FinalNode = expression(ctx.k, {
        ...finalRow(round, round.sum),
        x: LAYOUT.barX,
        y: SUB_Y_FINAL,
        size: SUB_SIZE,
      });
      redrawLinks(ctx);
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          // Reveal the anchor with the answer. All 4 sub rows stay
          // visible (fully revealed now) as a complete decomposition
          // tree.
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 220 });
          // No need to re-render the sub rows — they're already
          // fully revealed. Just update the links so any anchor
          // slot-center change is reflected.
          redrawLinks(ctx);
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
// scenes/level2.js — make-a-ten strategy, taught in 4 explicit steps.
//
// The persistent anchor ("a + b = ?") sits at the TOP of the screen in the
// largest font — it's the goal the child is working toward and never
// disappears between teaching beats. Each step shows a smaller sub-question
// below it.
//
// Step 1 — Compare:    sub "big ? small"; child picks ">" or "<". Big in
//                      blue, small in pink. After correct, "?" becomes ">".
// Step 2 — To ten:     sub "big + ? = 10"; child picks the friend count.
//                      The ten-frame pair below lights up so the child SEES
//                      the pair making ten. NO reveal text like
//                      "8 + 2 = 10" — that just restates the equation.
// Step 3 — Split:      sub "? + ? = small"; child picks a split of the
//                      small number. Options like "1+4", "2+3", "3+2",
//                      "4+1" — one of them has the ten-completing part
//                      (need) as its first addend. After correct, the
//                      anchor doesn't change yet — only the sub-question's
//                      "?" slots are now filled.
// Step 4 — Count:      sub "a + need + rest = ?"; child picks the total.
//                      After correct, EVERY "?" on screen becomes the
//                      correct number — the persistent anchor and the
//                      sub-question both reveal at once.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import {
  INK, FONT, YELLOW, BLUE, PINK, PURPLE, ORANGE,
} from "../components/theme.js";

const TEN = 10;
const COL_BIG = BLUE;
const COL_SMALL = PINK;
const COL_NEED = ORANGE;
const COL_REST = PURPLE;
const COL_TEN  = YELLOW;

function bigger(a, b) { return a >= b ? a : b; }
function smaller(a, b) { return a >= b ? b : a; }

// Persistent anchor ("a + b = ?") rendered at the top, large.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
  };
}

// Two ten-frames side by side. The left frame shows the bigger addend; the
// right frame shows the friend count that completes ten. Shown from step 2
// onward — step 1 just compares, no ten-frames yet.
function tenFramePair(ctx, round) {
  const { k } = ctx;
  const big = bigger(round.a, round.b);

  if (ctx.frameA) ctx.frameA.destroy();
  if (ctx.frameB) ctx.frameB.destroy();

  ctx.frameA = tenFrame(k, big, {
    x: LAYOUT.barX - 220, y: 620,
    rows: 2, cell: 50, gap: 6, showLabel: false,
  });
  ctx.frameB = tenFrame(k, 0, {
    x: LAYOUT.barX + 220, y: 620,
    rows: 2, cell: 50, gap: 6, showLabel: false,
  });

  // Big-number labels above each frame.
  k.add([
    k.text(String(big), { size: 52, font: FONT }),
    k.color(...COL_BIG),
    k.pos(LAYOUT.barX - 220, 530),
    k.anchor("center"),
  ]);
  k.add([
    k.text(String(smaller(round.a, round.b)), { size: 52, font: FONT }),
    k.color(...COL_SMALL),
    k.pos(LAYOUT.barX + 220, 530),
    k.anchor("center"),
  ]);
}

// Build 4 split-of-small options as button-text strings ("a+b"). Always
// includes the canonical (need, rest) split as the correct one.
function buildSplitOptions(small, need, rest) {
  const seen = new Set();
  const opts = [];
  const correctStr = `${need}+${rest}`;
  // Walk from a=1 upward, generating (a, small-a) pairs.
  for (let a = 1; a < small; a++) {
    const b = small - a;
    const text = `${a}+${b}`;
    if (!seen.has(text)) {
      seen.add(text);
      opts.push(text);
    }
  }
  // If we don't have 4, shuffle and pad by cycling; otherwise take first 4.
  // The correct split is naturally included when need != rest and a=need
  // produces (need, rest). For small=4 (need=2, rest=2) the canonical
  // string is "2+2" which the loop produces.
  // Trim or cycle to exactly 4 entries.
  while (opts.length < 4) opts.push(opts[opts.length - 1]);
  if (opts.length > 4) {
    // Keep the correct split, plus 3 others.
    const others = opts.filter((s) => s !== correctStr).slice(0, 3);
    opts.length = 0;
    opts.push(correctStr, ...others);
  }
  return { options: opts, correct: correctStr };
}

export default createRoundScene({
  levelId: 2,
  sceneName: "level2",
  // No intro cue — the persistent anchor ("a + b = ?") IS the introduction.
  // A "make ten" voice on entry would just say the same thing twice.
  stepLabels: ["Compare", "To ten", "Split", "Count"],

  steps: [
    // Step 1 — Compare.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      // Persistent anchor at top, big.
      ctx.setAnchorEquation(anchorSlots(round, "?"));
      return {
        equation: {
          slots: [big, "?", small],
          colors: [COL_BIG, undefined, COL_SMALL],
        },
        // Sub-question sits below the persistent anchor.
        equationOpts: { y: 470, size: 88 },
        cue: "step-1",
        question: {
          correct: ">",
          values: [">", "<"],
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [big, ">", small],
            colors: [COL_BIG, COL_NEED, COL_SMALL],
          }, { y: 470, size: 88 });
        },
      };
    },
    // Step 2 — To ten.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      // Anchor stays as-is.
      tenFramePair(ctx, round);
      ctx.frameB.setValue(round.need);
      return {
        equation: {
          slots: [big, "+", "?", "=", TEN],
          colors: [COL_BIG, undefined, undefined, undefined, COL_TEN],
        },
        equationOpts: { y: 470, size: 88 },
        cue: "step-2",
        question: {
          correct: round.need,
          values: options(round.need, { min: 0, max: TEN, prefer: [round.rest] }),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [big, "+", round.need, "=", TEN],
            colors: [COL_BIG, undefined, COL_NEED, undefined, COL_TEN],
          }, { y: 470, size: 88 });
        },
      };
    },
    // Step 3 — Split: ? + ? = small.
    (ctx, round) => {
      const small = smaller(round.a, round.b);
      const { options: splitOpts, correct } = buildSplitOptions(
        small, round.need, round.rest,
      );
      return {
        equation: {
          slots: ["?", "+", "?", "=", small],
          colors: [undefined, undefined, undefined, undefined, COL_SMALL],
        },
        equationOpts: { y: 470, size: 88 },
        cue: "step-3",
        question: {
          correct,
          values: splitOpts,
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [round.need, "+", round.rest, "=", small],
            colors: [COL_NEED, undefined, COL_REST, undefined, COL_SMALL],
          }, { y: 470, size: 88 });
        },
      };
    },
    // Step 4 — Count: a + need + rest = ?
    (ctx, round) => {
      return {
        equation: {
          slots: [round.a, "+", round.need, "+", round.rest, "=", "?"],
          colors: [COL_BIG, undefined, COL_NEED, undefined, COL_REST, undefined, undefined],
        },
        equationOpts: { y: 470, size: 80 },
        cue: "step-4",
        question: {
          correct: round.answer,
          values: options(round.answer, { min: TEN, max: 20, count: 4 }),
        },
        onAdvance: () => {
          // Reveal the persistent anchor at the top.
          ctx.setAnchorEquation(anchorSlots(round, round.answer));
          // Reveal the sub-question too.
          ctx.setEquation({
            slots: [round.a, "+", round.need, "+", round.rest, "=", round.answer],
            colors: [COL_BIG, undefined, COL_NEED, undefined, COL_REST, undefined, INK],
          }, { y: 470, size: 80 });
        },
      };
    },
  ],
});
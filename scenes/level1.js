// scenes/level1.js — mixed three-addend addition, taught in 2 explicit steps.
//
// Each round picks a "first pair" to add:
//   * Pattern A (sum ≤ 10, no pair to ten): pair = [nums[0], nums[1]] —
//     add in order.
//   * Pattern B (two of three pair to ten): pair = the two that make ten
//     first, then add the leftover.
//
// Step 1 — Pair:    equation "pair[0] + pair[1] = ?". The merged cell row
//                   highlights the pair so the eye lands on it. Voice reads
//                   "what is X plus Y".
// Step 2 — Add the rest: equation "pairSum + third = ?" with pairSum in
//                   orange as the running total. Voice reads
//                   "what is pairSum plus third".
//
// On a correct pick the equation's "?" becomes the value. After step 2 the
// row pulses once so the answer feels landed.

import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK, ORANGE } from "../components/theme.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";

const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];
const TEN = 10;

// Pick the pair to add first: prefer a pair that sums to ten, otherwise
// use the first two addends sequentially. Returns the addends in the order
// they should appear in the equation (always a + b).
function choosePair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === TEN) {
        const thirdIdx = nums.findIndex((n, k) => k !== i && k !== j);
        return { pair: [nums[i], nums[j]], third: nums[thirdIdx], pairSum: TEN };
      }
    }
  }
  return { pair: [nums[0], nums[1]], third: nums[2], pairSum: nums[0] + nums[1] };
}

// Renders one merged cell row: total cells = sum of nums; each addend fills
// its own contiguous block of cells with that addend's color. When
// `highlight` is given (a pair to add first) the matching cells pulse so the
// child sees which two to add.
function mergedRow(ctx, nums, highlight = null) {
  const { k } = ctx;
  const total = nums.reduce((a, b) => a + b, 0);
  const cell = 72;
  const gap = 8;
  const totalW = total * cell + (total - 1) * gap;
  const startX = LAYOUT.barX - totalW / 2 + cell / 2;
  const y = LAYOUT.bodyY + 40;

  const root = k.add([k.pos(0, 0)]);
  const cellNodes = [];

  let cellIdx = 0;
  nums.forEach((n, colorIdx) => {
    const color = COLORS[colorIdx];
    const groupStart = cellIdx;
    for (let c = 0; c < n; c++) {
      const cx = startX + cellIdx * (cell + gap);
      const isHighlighted = highlight && highlight.includes(n);
      const box = root.add([
        k.rect(cell, cell, { radius: 14 }),
        k.color(255, 250, 240),
        k.outline(4, k.rgb(...INK)),
        k.pos(cx, y),
        k.anchor("center"),
      ]);
      // Cells in the highlighted pair get an orange ring so the eye lands on
      // them. The ring is the highlight, not a competing outline.
      if (isHighlighted) {
        root.add([
          k.rect(cell + 16, cell + 16, { radius: 22 }),
          k.color(...ORANGE),
          k.opacity(0.45),
          k.outline(4, k.rgb(...INK)),
          k.pos(cx, y),
          k.anchor("center"),
        ]);
      }
      root.add([
        k.circle(Math.round(cell * 0.5)),
        k.color(...color),
        k.pos(cx, y),
        k.anchor("center"),
      ]);
      cellNodes.push({ box, cx, isHighlighted });
      cellIdx++;
    }

    // Number label centered under this color's group.
    const groupEnd = cellIdx - 1;
    const groupCenterX = (startX + groupStart * (cell + gap) + startX + groupEnd * (cell + gap)) / 2;
    root.add([
      k.text(String(n), { size: 56, font: FONT }),
      k.color(...color),
      k.outline(3, k.rgb(...INK)),
      k.pos(groupCenterX, y + cell / 2 + 56),
      k.anchor("center"),
    ]);
  });

  // Pulse all cells once. Called when the child answers correctly.
  root.pulse = () => {
    cellNodes.forEach(({ box }) => {
      k.tween(box.opacity ?? 1, 0.4, 0.15, (v) => { box.opacity = v; });
      k.wait(0.15, () => {
        k.tween(box.opacity ?? 1, 1, 0.25, (v) => { box.opacity = v; });
      });
    });
  };

  return root;
}

// Build the active-step equation as a slot list. `addends` is the pair or
// the running-sum + third. The sumSlot is "?" while asking or the actual
// value after a correct pick.
function coloredPairEquation(addends, sumSlot, addendColors) {
  const slots = [addends[0], "+", addends[1], "=", sumSlot];
  const colors = [addendColors[0], undefined, addendColors[1], undefined, undefined];
  return { slots, colors };
}

// Spoken intro for a step: "what is X plus Y" chained from the number cues.
// Caller decides the order — step 1 says the pair, step 2 says the running
// sum plus the leftover.
function speakPair(k, a, b) {
  const spoken = ["q-what-is", `n-${a}`, "q-plus", `n-${b}`];
  k.wait(0.1, () => window.PandaAudio.playSequence(spoken));
}

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  // No introCue: the spoken equation intro already introduces the round.
  // Two teaching beats now: add the first pair, then add the rest.
  stepLabels: ["Pair", "Add the rest"],

  steps: [
    // Step 1 — Pair: which two to add first.
    (ctx, round) => {
      const { pair, pairSum } = choosePair(round.nums);
      // Find the original indices so each addend keeps its own color.
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const colors = [COLORS[aIdx], COLORS[bIdx]];

      const body = mergedRow(ctx, round.nums, pair);
      ctx.cellRow = body;
      speakPair(ctx.k, pair[0], pair[1]);

      return {
        equation: coloredPairEquation(pair, "?", colors),
        cue: "step-1",
        question: {
          correct: pairSum,
          values: options(pairSum, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          ctx.setEquation(coloredPairEquation(pair, pairSum, colors));
        },
      };
    },
    // Step 2 — Add the rest.
    (ctx, round) => {
      const { pair, third, pairSum } = choosePair(round.nums);
      const thirdIdx = round.nums.indexOf(third);
      const body = mergedRow(ctx, round.nums);
      ctx.cellRow = body;
      speakPair(ctx.k, pairSum, third);

      return {
        equation: {
          slots: [pairSum, "+", third, "=", "?"],
          colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, undefined],
        },
        cue: "step-2",
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [pairSum, "+", third, "=", round.answer],
            colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, INK],
          });
          ctx.cellRow?.pulse?.();
        },
      };
    },
  ],
});
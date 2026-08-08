// scenes/level1.js — mixed three-addend addition, taught visually.
//
// Each round is a single teaching beat: the equation "N1 + N2 + N3 = ?" sits
// at the top, and underneath sits one merged row of cells — total cells =
// sum of the three addends. Each cell holds a colored circle whose color
// matches the addend it represents (blue / yellow / pink), so the child
// counts "blue, blue, yellow, yellow, yellow, pink, pink, pink, pink" and
// sees the answer forming under their finger. Number labels under each
// group reinforce the count.
//
// On a correct pick the equation's "?" becomes the actual sum, and the row
// pulses once so the answer feels landed.
//
// Pattern A (sum ≤ 10) and Pattern B (two pair to 10) share the same body
// now: the visual self-teaches the friend pair without a dedicated step.

import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK } from "../components/theme.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";

const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];

// Renders one merged cell row: total cells = sum of nums; each addend fills
// its own contiguous block of cells with that addend's color. Number labels
// sit below each block. The returned object exposes pulse() for the answer-
// reveal beat.
function mergedRow(ctx, nums) {
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
      const box = root.add([
        k.rect(cell, cell, { radius: 14 }),
        k.color(255, 250, 240),
        k.outline(4, k.rgb(...INK)),
        k.pos(cx, y),
        k.anchor("center"),
      ]);
      root.add([
        k.circle(Math.round(cell * 0.62)),
        k.color(...color),
        k.outline(3, k.rgb(...INK)),
        k.pos(cx, y),
        k.anchor("center"),
      ]);
      cellNodes.push({ box, cx });
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

  // Pulse all cell outlines once. Called when the child answers correctly.
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

// Build the equation as [N1, "+", N2, "+", N3, "=", sumSlot]. sumSlot is
// either "?" while asking or the actual answer after a correct pick.
function coloredEquation(nums, sumSlot) {
  const slots = [];
  const colors = [];
  nums.forEach((n, i) => {
    if (i > 0) { slots.push("+"); colors.push(undefined); }
    slots.push(n);
    colors.push(COLORS[i]);
  });
  slots.push("=", sumSlot);
  colors.push(undefined, undefined);
  return { slots, colors };
}

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  introCue: "lvl-1-intro",
  // One teaching beat now: see the row, count the colors, pick the total.
  stepLabels: ["Count"],

  steps: [
    (ctx, round) => {
      const body = mergedRow(ctx, round.nums);
      ctx.cellRow = body;
      // Read the equation aloud as soon as the problem appears:
      // "what is two plus three plus four". Chained cues so we don't have
      // to ship one MP3 per (nums, answer) combination.
      const spoken = ["q-what-is"];
      round.nums.forEach((n) => {
        spoken.push(`n-${n}`);
        spoken.push("q-plus");
      });
      spoken.pop(); // drop the trailing "plus"
      ctx.k.wait(0.1, () => window.PandaAudio.playSequence(spoken));
      return {
        equation: coloredEquation(round.nums, "?"),
        cue: "lvl1-step-2",
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          // After a correct pick, swap the "?" for the real sum and pulse
          // the row once so the answer feels rewarded.
          ctx.setEquation(coloredEquation(round.nums, round.answer));
          ctx.cellRow?.pulse?.();
        },
      };
    },
  ],
});
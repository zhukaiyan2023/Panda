// scenes/level1.js — mixed addition with three colored addends.
//
// The problem is rendered as [N1] + [N2] + [N3] = ?  with each addend in its
// own color (blue, yellow, pink) and a one-row ten-frame underneath. Children
// see "three things being added together" rather than a string of digits.
//
// Pattern A (sum ≤ 10): step 1 shows the problem with an audible intro cue
// ("three numbers, count them"), then auto-advances to step 2 where the
// child picks the total.
//
// Pattern B (two of the three pair to 10): step 1 asks which pair adds to 10
// (correct = 10, the SUM of the friend pair); step 2 asks for the total.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK, MUTED } from "../components/theme.js";

const TEN = 10;
const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];

function friendPair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === TEN) return [nums[i], nums[j]];
    }
  }
  return null;
}

// Renders three big number tiles in a row, each in its own color with a
// small one-row ten-frame beneath. The equation above shows them as
// "N1 + N2 + N3 = ?" with each addend colored to match its tile.
function threeTileBody(ctx, highlight = null) {
  const { k, round } = ctx;
  const nums = round.nums;
  const tileW = 200;
  const gap = 60;
  const totalW = nums.length * tileW + (nums.length - 1) * gap;
  const startX = LAYOUT.barX - totalW / 2 + tileW / 2;
  const y = LAYOUT.bodyY + 60;

  nums.forEach((n, i) => {
    const x = startX + i * (tileW + gap);
    const color = COLORS[i];
    const isHi = highlight && highlight.includes(n);

    // Big colored tile.
    const tile = k.add([
      k.rect(tileW, 200, { radius: 28 }),
      k.color(...color),
      k.outline(4, k.rgb(...INK)),
      k.pos(x, y),
      k.anchor("center"),
    ]);
    // The number itself, in white over the color.
    tile.add([
      k.text(String(n), { size: 120, font: FONT }),
      k.color(255, 255, 255),
      k.anchor("center"),
      k.pos(0, 0),
    ]);
    if (isHi) {
      // Pulse ring around the friend pair so the eye lands on them.
      const ring = k.add([
        k.rect(tileW + 30, 230, { radius: 36 }),
        k.color(...color),
        k.opacity(0.35),
        k.outline(6, k.rgb(...INK)),
        k.pos(x, y),
        k.anchor("center"),
      ]);
      ctx.friendRings = ctx.friendRings || [];
      ctx.friendRings.push(ring);
    }

    // One-row ten-frame underneath, filled to n (capped at 10). The big tile
    // already carries the number, so the frame's own label is suppressed.
    const frame = tenFrame(k, Math.min(n, 10), {
      x, y: y + 170, rows: 1, cell: 28, gap: 4, showLabel: false,
    });
  });
}

// Builds the equation as a colored slot list: [N1, "+", N2, "+", N3, "=", "?"]
function coloredEquation(nums, sumKnown) {
  const slots = [];
  nums.forEach((n, i) => {
    if (i > 0) slots.push("+");
    slots.push(n);
  });
  slots.push("=", sumKnown != null ? sumKnown : "?");
  const colors = [];
  let slotIdx = 0;
  nums.forEach((_, i) => {
    if (i > 0) {
      colors.push(undefined);
      slotIdx++;
    }
    colors.push(COLORS[i]);
    slotIdx++;
  });
  colors.push(undefined, undefined);
  return { slots, colors };
}

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  introCue: "lvl-1-intro",
  stepLabels: ["See", "Count"],

  steps: [
    // Step 1 — See: introduce the three numbers with a friendly cue. For
    // pattern B, ask which two are friends of 10 (correct = 10).
    (ctx, round) => {
      const friend = friendPair(round.nums);
      threeTileBody(ctx, friend || null);
      const eq = coloredEquation(round.nums, null);
      ctx.context(`What is ${round.nums[0]} + ${round.nums[1]} + ${round.nums[2]} ?`);
      return {
        equation: eq,
        cue: friend ? "step-2" : "lvl1-step-1",
        question: friend
          ? {
              correct: 10,
              values: options(10, { min: 0, max: 10, count: 4 }),
            }
          : null, // pattern A: no question, just look and auto-advance
      };
    },
    // Step 2 — Count: always asks the final sum.
    (ctx, prev) => {
      const friend = friendPair(prev.nums);
      // Rebuild the body to show the friend-pair highlight clearly.
      threeTileBody(ctx, friend || null);
      return {
        equation: coloredEquation(prev.nums, prev.answer),
        cue: "lvl1-step-2",
        question: {
          correct: prev.answer,
          values: options(prev.answer, { min: 0, max: 16, count: 4 }),
        },
      };
    },
  ],
});
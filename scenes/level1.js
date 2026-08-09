// scenes/level1.js — three-addend addition, taught in 2 explicit steps with
// a persistent top anchor.
//
// Layout (matches L2 for visual consistency):
//   * Top:   persistent anchor "a + b + c = ?" — the goal the child is
//            working toward. Large and bold, never disappears between steps.
//   * Middle: cells with circles — the visual representation of the three
//             addends. The pair-to-add-first gets an orange ring on step 1.
//   * Bottom: sub-question that changes per step.
//
// Teaching flow:
//   * Pattern A (sum ≤ 10, no pair to ten): pair = first two sequentially.
//   * Pattern B (two of three pair to ten): pair = the two that make ten.
//
//   Step 1 — Pair:        sub "pair[0] + pair[1] = ?"
//                          child picks pairSum. The pair's cells light up
//                          with orange rings so the eye lands on them.
//   Step 2 — Add the rest: shows the parenthesized form "(pair[0] + pair[1])
//                          + third = pairSum" above the cells (a visual aid
//                          that ties the pair to the running sum), then the
//                          simplified "pairSum + third = ?" below the cells
//                          as the actual pick. Child picks the total, cells
//                          pulse on correct.
//
// On a correct pick on step 2 the anchor's "?" reveals to the answer
// (alongside the sub-question's "?"). Step 1's correct pick only fills
// the sub-question's "?" — the anchor still asks "?".

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

// Anchor slots for the persistent top equation "a + b + c = ?". Each addend
// keeps its own color so the visible cells and the anchor agree.
function anchorSlots(nums, sumSlot) {
  return {
    slots: [nums[0], "+", nums[1], "+", nums[2], "=", sumSlot],
    colors: [COLORS[0], undefined, COLORS[1], undefined, COLORS[2], undefined, undefined],
  };
}

// Custom parenthesized-form text node rendered above the cells. Lives
// independently of the round scaffold's "active equation" so the buildStep
// path doesn't overwrite it. The child never picks this — it's a visual aid
// showing how the pair becomes the running sum.
function parenthesizedForm(ctx, pair, third, pairSum, aIdx, bIdx, thirdIdx) {
  ctx.k.add([
    ctx.k.text(["(", pair[0], "+", pair[1], ")", "+", third, "=", pairSum].join(" "), {
      size: 56, font: FONT,
    }),
    ctx.k.color(...INK),
    ctx.k.opacity(0.7),
    ctx.k.pos(LAYOUT.barX, 380),
    ctx.k.anchor("center"),
  ]);
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
  const y = 480;

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

// Spoken intro for a step. Step 1 reads the sub-question "what is A plus B"
// so the child hears JUST the pair they're being asked to add first. Step 2
// reads the simplified form "what is pairSum plus third".
function speakSequence(k, ids) {
  k.wait(0.1, () => window.PandaAudio.playSequence(ids));
}

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  // No introCue: the spoken equation intro already introduces the round.
  // Two teaching beats: add the first pair, then add the rest.
  stepLabels: ["Pair", "Add the rest"],

  steps: [
    // Step 1 — Pair: "pair[0] + pair[1] = ?"
    (ctx, round) => {
      const { pair } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const pairSum = pair[0] + pair[1];

      // Body: cells row with the pair highlighted.
      const body = mergedRow(ctx, round.nums, pair);
      ctx.cellRow = body;

      // Persistent anchor at top.
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // Voice: "what is A plus B" — just the pair, not the whole anchor.
      // The anchor's "?" is still visible, so the child hears the piece
      // they're being asked to add first.
      speakSequence(ctx.k, ["q-what-is", `n-${pair[0]}`, "q-plus", `n-${pair[1]}`]);

      return {
        equation: {
          slots: [pair[0], "+", pair[1], "=", "?"],
          colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, undefined],
        },
        equationOpts: { y: 720, size: 82 },
        cue: "step-1",
        question: {
          correct: pairSum,
          values: options(pairSum, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [pair[0], "+", pair[1], "=", pairSum],
            colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, ORANGE],
          }, { y: 720, size: 82 });
        },
      };
    },
    // Step 2 — Add the rest. Shows the parenthesized form (a + b) + c = pairSum
    // above the cells, then the simplified form pairSum + c = ? below the
    // cells as the actual pick.
    (ctx, round) => {
      const { pair, third, pairSum } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const thirdIdx = round.nums.findIndex((n) => n === third);

      // Body: cells row (no pair highlight — the pair is now expressed in
      // the parenthesized form above the cells).
      const body = mergedRow(ctx, round.nums);
      ctx.cellRow = body;

      // Anchor stays put (still "?" until step 2 is answered).
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // Parenthesized form as a visual aid above the cells. Custom text
      // node (not setEquation) so the buildStep path doesn't overwrite it.
      parenthesizedForm(ctx, pair, third, pairSum, aIdx, bIdx, thirdIdx);

      speakSequence(ctx.k, ["q-what-is", `n-${pairSum}`, "q-plus", `n-${third}`]);

      return {
        equation: {
          slots: [pairSum, "+", third, "=", "?"],
          colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, undefined],
        },
        equationOpts: { y: 720, size: 82 },
        cue: "step-2",
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          // Reveal the persistent anchor at the top.
          ctx.setAnchorEquation(anchorSlots(round.nums, round.answer));
          // Reveal the simplified sub-question.
          ctx.setEquation({
            slots: [pairSum, "+", third, "=", round.answer],
            colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, INK],
          }, { y: 720, size: 82 });
          ctx.cellRow?.pulse?.();
        },
      };
    },
  ],
});

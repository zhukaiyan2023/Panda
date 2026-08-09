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
// showing the original equation in parentheses form, "(pair) + third = ?".
// The simplified sub-question below is the actual pick.
//
// When the child picks the correct answer, the caller passes `answer` so
// the "?" becomes the actual total — both the persistent anchor and the
// simplified sub-question reveal, and now this form reveals too. The node
// is tracked on ctx.parensForm so the caller can re-render cleanly.
function parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx, answer = null) {
  const lastSlot = answer != null ? String(answer) : "?";
  if (ctx.parensForm) ctx.parensForm.destroy();
  ctx.parensForm = ctx.k.add([
    ctx.k.text(["(", pair[0], "+", pair[1], ")", "+", third, "=", lastSlot].join(" "), {
      size: 56, font: FONT,
    }),
    ctx.k.color(...INK),
    ctx.k.opacity(0.7),
    ctx.k.pos(LAYOUT.barX, 340),
    ctx.k.anchor("center"),
  ]);
}

// Renders one merged cell row: total cells = sum of nums; each addend fills
// its own contiguous block of cells with that addend's color. When
// `highlight` is given (a pair to add first) the matching cells pulse so the
// child sees which two to add. When `boundary` (a group index) is given, an
// extra-wide gap is inserted on either side of that group so it reads as a
// visually separate "third" instead of one continuous row — used on step 2
// after the pair is taught, to mirror the "(pair) + third" grouping. When
// `flushBoundary` is also set, the boundary group is rendered with no gaps
// between its own cells so the third reads as a single connected block.
function mergedRow(ctx, nums, opts = {}) {
  const { k } = ctx;
  const { highlight = null, boundary = null, flushBoundary = false, y: rowY = 480 } = opts;
  const total = nums.reduce((a, b) => a + b, 0);
  const cell = 72;
  const gap = 8;
  const extraGap = 40;

  // Compute each cell's x offset from the first cell. `boundary` widens the
  // gap immediately before and after that group; `flushBoundary` zeroes
  // the gap between consecutive cells inside that group.
  const offsets = new Array(total);
  let cursor = 0;
  for (let g = 0, idx = 0; g < nums.length; g++) {
    for (let c = 0; c < nums[g]; c++) {
      offsets[idx++] = cursor;
      cursor += cell;
      if (idx < total) {
        const isLastInGroup = c === nums[g] - 1;
        const isFirstInGroup = c === 0;
        let gSize = gap;
        if (boundary != null) {
          // Extra gap only on the immediate left and right of the boundary
          // group (the "third"), so the pair stays contiguous and only the
          // third is visually separated.
          const isBoundaryLeft = isLastInGroup && g === boundary - 1;
          const isBoundaryRight = isFirstInGroup && g === boundary;
          if (isBoundaryLeft || isBoundaryRight) gSize = extraGap;
        }
        if (flushBoundary && g === boundary) gSize = 0;
        cursor += gSize;
      }
    }
  }
  const totalW = offsets[total - 1] - offsets[0] + cell;
  const startX = LAYOUT.barX - totalW / 2 + cell / 2;
  const y = rowY;

  const root = k.add([k.pos(0, 0)]);
  const cellNodes = [];

  let cellIdx = 0;
  nums.forEach((n, colorIdx) => {
    const color = COLORS[colorIdx];
    const groupFirstIdx = cellIdx;
    for (let c = 0; c < n; c++) {
      const cx = offsets[cellIdx] + startX;
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
    const groupLastIdx = cellIdx - 1;
    const groupCenterX = (offsets[groupFirstIdx] + offsets[groupLastIdx]) / 2 + startX;
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
  stepLabels: ["先加一对", "加上剩下的"],

  steps: [
    // Step 1 — Pair: "pair[0] + pair[1] = ?"
    (ctx, round) => {
      const { pair } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const pairSum = pair[0] + pair[1];

      // Body: cells row with the pair highlighted.
      const body = mergedRow(ctx, round.nums, { highlight: pair });
      ctx.cellRow = body;

      // Persistent anchor at top.
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // Voice: "what is A plus B" — just the pair, not the whole anchor.
      // The anchor's "?" is still visible, so the child hears the piece
      // they're being asked to add first.
      speakSequence(ctx.k, ["q-what-is", `n-${pair[0]}`, "q-plus", `n-${pair[1]}`]);

      return {
        body,
        equation: {
          slots: [pair[0], "+", pair[1], "=", "?"],
          colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, undefined],
        },
        // Step 1 sub-question sits directly below the anchor so the child
        // reads "2+3+4=?" then "2+3=?" as a single thought. The cells row
        // sits below as the visual aid.
        equationOpts: { y: 340, size: 82 },
        cue: "step-1",
        question: {
          correct: pairSum,
          values: options(pairSum, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [pair[0], "+", pair[1], "=", pairSum],
            colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, ORANGE],
          }, { y: 340, size: 82 });
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

      // Body: cells row with the third addend visually separated from the pair
      // by an extra-wide gap, AND the third's own cells are rendered flush
      // (no gaps between them) so it reads as one connected block. The pair
      // (2+3) keeps its normal gaps so 2 and 3 stay distinguishable. The
      // row sits BELOW the sub-question on step 2 so the visual order is
      // anchor → parenthesized form → sub-question → cells → buttons.
      const body = mergedRow(ctx, round.nums, {
        boundary: thirdIdx,
        flushBoundary: true,
        y: 600,
      });
      ctx.cellRow = body;

      // Anchor stays put (still "?" until step 2 is answered).
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // Parenthesized form as a visual aid above the cells. Custom text
      // node (not setEquation) so the buildStep path doesn't overwrite it.
      parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx);

      speakSequence(ctx.k, ["q-what-is", `n-${pairSum}`, "q-plus", `n-${third}`]);

      return {
        body,
        equation: {
          slots: [pairSum, "+", third, "=", "?"],
          colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, undefined],
        },
        // Step 2 sub-question sits BELOW the parenthesized form (the visual
        // aid that mirrors the original equation in parens form). The cells
        // row sits further down as the visual aid for the simplified form.
        equationOpts: { y: 440, size: 82 },
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
          }, { y: 440, size: 82 });
          // Reveal the parenthesized form's "?" with the actual total.
          parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx, round.answer);
          ctx.cellRow?.pulse?.();
        },
      };
    },
  ],
});

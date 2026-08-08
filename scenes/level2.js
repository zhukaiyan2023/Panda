// scenes/level2.js — make-a-ten strategy, taught in 4 explicit steps.
//
// The full problem stays on screen as `a + b = answer`. Two ten-frames below
// make the strategy visible: the LEFT frame fills with `a`, the RIGHT frame
// stays empty until step 2, then fills with `need` so the child SEES the
// pair making 10.
//
// Step 1 — Big:      which is bigger? a or b?
// Step 2 — Friend:   how many does the big number need to make 10?
// Step 3 — Small:    how much is the OTHER number?
// Step 4 — Count:    what is 10 + rest?
//
// Each step has its own voice cue so a pre-reader can still follow the
// teaching beat-by-beat.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import { INK, FONT, YELLOW, BLUE } from "../components/theme.js";

const TEN = 10;

function bigger(a, b) { return a >= b ? a : b; }
function smaller(a, b) { return a >= b ? b : a; }

// Two ten-frames side by side. The left frame shows the bigger addend; the
// right frame shows the friend count that completes ten. Frame fills are
// kept in sync with the current step via ctx.frameA / ctx.frameB refs.
function tenFramePair(ctx, round, stepIndex) {
  const { k } = ctx;
  const big = bigger(round.a, round.b);
  const small = smaller(round.a, round.b);

  // Destroy any prior frames so a step transition doesn't pile visuals.
  if (ctx.frameA) ctx.frameA.destroy();
  if (ctx.frameB) ctx.frameB.destroy();

  ctx.frameA = tenFrame(k, big, {
    x: LAYOUT.barX - 220, y: LAYOUT.bodyY + 100,
    rows: 2, cell: 56, gap: 8, showLabel: false,
  });
  ctx.frameB = tenFrame(k, 0, {
    x: LAYOUT.barX + 220, y: LAYOUT.bodyY + 100,
    rows: 2, cell: 56, gap: 8, showLabel: false,
  });

  // Big-number labels above each frame so the child sees "this many dots" at
  // a glance.
  k.add([
    k.text(String(big), { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(LAYOUT.barX - 220, LAYOUT.bodyY - 30),
    k.anchor("center"),
  ]);
  k.add([
    k.text(String(small), { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(LAYOUT.barX + 220, LAYOUT.bodyY - 30),
    k.anchor("center"),
  ]);

  // Step 2 onward: fill the right frame with the friend count.
  if (stepIndex >= 1) ctx.frameB.setValue(round.need);
}

export default createRoundScene({
  levelId: 2,
  sceneName: "level2",
  introCue: "lvl-2-intro",
  stepLabels: ["Find biggest", "Find friend", "Small left", "Count"],

  steps: [
    // Step 1 — Big.
    (ctx, round) => {
      tenFramePair(ctx, round, 0);
      return {
        equation: { left: round.a, right: round.b, sum: "?" },
        cue: "step-1",
        question: {
          correct: bigger(round.a, round.b),
          values: options(bigger(round.a, round.b), { min: 0, max: 10, count: 4 }),
        },
      };
    },
    // Step 2 — Friend.
    (ctx, round) => {
      tenFramePair(ctx, round, 1);
      return {
        equation: { left: round.a, right: "?", sum: TEN },
        cue: "step-2",
        question: {
          correct: round.need,
          values: options(round.need, { min: 0, max: TEN, prefer: [round.rest] }),
        },
        reveal: `${round.a} + ${round.need} = ${TEN}`,
      };
    },
    // Step 3 — Small.
    (ctx, round) => {
      const other = smaller(round.a, round.b);
      return {
        equation: { left: TEN, right: "?", sum: TEN + other },
        cue: "step-3",
        question: {
          correct: other,
          values: options(other, { min: 0, max: TEN, count: 4 }),
        },
        reveal: `${TEN} + ${other} = ${TEN + other}`,
      };
    },
    // Step 4 — Count.
    (ctx, round) => {
      const other = smaller(round.a, round.b);
      return {
        equation: { left: TEN, right: other, sum: round.answer },
        cue: "step-4",
        question: {
          correct: round.answer,
          values: options(round.answer, { min: TEN, max: 20, count: 4 }),
        },
        reveal: `${TEN} + ${other} = ${round.answer}`,
      };
    },
  ],
});
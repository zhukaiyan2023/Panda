// scenes/level2.js — the make-a-ten strategy, using { need, rest, answer }.
//
// The child is asked how many `a` needs to reach 10, so the equation on screen
// is "a + ? = 10" and the correct answer is `need`. The previous version showed
// "a + ? = a+b" while still scoring `need` as correct: for 8 + 5 it displayed
// "8 + ? = 13", whose answer is 5, and then marked 5 wrong and 2 right. A child
// who computed correctly was told they were wrong.
//
// The full problem stays on screen as a context line so the strategy is visibly
// a step toward it rather than a different question.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";

const TEN = 10;

export default createRoundScene({
  levelId: 2,
  sceneName: "level2",
  introCue: "lvl-2-intro",
  stepLabels: ["Find a friend", "Make 10", "Add the rest", "Celebrate"],

  // The working question, not the whole problem: how many does `a` need to
  // reach ten?
  equation: (round) => ({ left: round.a, right: "?", sum: TEN }),

  question: (round) => ({
    correct: round.need,
    // `rest` is the most instructive wrong answer here: it is the other half of
    // the decomposition, so picking it is the mistake worth surfacing.
    values: options(round.need, { min: 0, max: TEN, prefer: [round.rest] }),
  }),

  body: (ctx) => {
    const { a, b } = ctx.round;
    // Pinned under the equation: the problem the strategy is working toward
    // stays visible for the whole round.
    ctx.context(`We want ${a} + ${b}`);
    return tenFrame(ctx.k, a, {
      x: LAYOUT.barX, y: LAYOUT.bodyY, rows: 2, cell: 70, gap: 10,
    });
  },

  steps: [
    // Step 2 — Make 10.
    (ctx) => {
      ctx.reveal(`${ctx.round.a} + ${ctx.round.need} = ${TEN}`, { size: 52 });
      ctx.body.setValue(TEN);
    },
    // Step 3 — Add the rest.
    (ctx) => ctx.reveal(`${TEN} + ${ctx.round.rest} = ${ctx.round.answer}`, { size: 52 }),
    // Step 4 — Celebrate.
    (ctx) => {
      ctx.buddy.setMood("cheer");
      ctx.reveal(String(ctx.round.answer), { size: 96, replace: true });
    },
  ],

  replayCue: (round, step) =>
    ({ 1: "round-start", 2: "step-2", 3: `n-${round.rest}`, 4: "round-end" })[step] ||
    "round-start",
});

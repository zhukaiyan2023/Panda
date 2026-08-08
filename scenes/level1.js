// scenes/level1.js — numbers up to 5. Plain addition, top row of the ten-frame.
//
// The child fills the blank in "a + ? = answer". The reveal steps then restate
// the complete equation and grow the ten-frame to the total.
//
// The previous version ran Level 2's make-a-ten reveal steps: because
// data/levels.json has no `need` field for this level, it fell back to
// `10 - a` and taught "2 + 8 = 10" right after a round about 2 + 1 = 3.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  introCue: "lvl-1-intro",
  stepLabels: ["Count", "Add", "Check", "Cheer"],

  equation: (round) => ({ left: round.a, right: "?", sum: round.answer }),

  question: (round) => {
    const correct = round.missing ?? round.b;
    return { correct, values: options(correct, { min: 0, max: 5 }) };
  },

  body: (ctx) =>
    tenFrame(ctx.k, ctx.round.a, {
      x: LAYOUT.barX, y: LAYOUT.bodyY, rows: 1, cell: 80, gap: 10,
    }),

  steps: [
    // Step 2 — Add: restate the equation in full and grow the frame to the total.
    (ctx) => {
      const { a, b, answer } = ctx.round;
      ctx.reveal(`${a} + ${b} = ${answer}`, { size: 56 });
      ctx.body.setValue(answer);
    },
    // Step 3 — Check.
    (ctx) => ctx.reveal(`That makes ${ctx.round.answer}!`, { size: 44 }),
    // Step 4 — Cheer.
    (ctx) => {
      ctx.buddy.setMood("cheer");
      ctx.reveal(String(ctx.round.answer), { size: 96, replace: true });
    },
  ],

  replayCue: (round, step) =>
    ({ 1: "round-start", 2: "step-2", 3: "step-3", 4: "round-end" })[step] || "round-start",
});

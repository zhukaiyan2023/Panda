// scenes/level3.js — up to 20. Same shape as before but migrated to the new
// per-step API so it composes with the multi-question roundScene.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import { INK, YELLOW, FONT } from "../components/theme.js";

const TEN = 10;

export default createRoundScene({
  levelId: 3,
  sceneName: "level3",
  introCue: "lvl-3-intro",
  stepLabels: ["数一数", "加起来", "拆十法", "庆祝一下"],

  steps: [
    // Step 1 — show the equation, ask for the missing addend.
    (ctx, round) => {
      const ones = round.a % TEN;
      // Tens tile (when a >= 10) + ones frame.
      if (Math.floor(round.a / TEN) > 0) {
        const tens = Math.floor(round.a / TEN);
        ctx.tensTile = ctx.k.add([
          ctx.k.rect(96, 130, { radius: 16 }),
          ctx.k.color(...YELLOW),
          ctx.k.outline(3, ctx.k.rgb(...INK)),
          ctx.k.pos(LAYOUT.barX - 300, LAYOUT.bodyY),
          ctx.k.anchor("center"),
        ]);
        ctx.tensTile.add([
          ctx.k.text(`${tens * TEN}`, { size: 44, font: FONT }),
          ctx.k.color(...INK),
          ctx.k.anchor("center"),
          ctx.k.pos(0, 0),
        ]);
      }
      ctx.onesFrame = tenFrame(ctx.k, ones, {
        x: LAYOUT.barX + 60, y: LAYOUT.bodyY,
        rows: 2, cell: 56, gap: 8,
      });
      return {
        equation: { left: round.a, right: "?", sum: round.answer },
        cue: "step-1",
        question: {
          correct: round.missing ?? round.b,
          values: options(round.missing ?? round.b, { min: 0, max: 20 }),
        },
      };
    },
    // Step 2 — show the complete equation.
    (ctx, round) => {
      const { a, b, answer } = round;
      return {
        equation: { left: a, right: b, sum: answer },
        cue: "step-2",
        question: null,   // reveal-only step, auto-advance
        reveal: `${a} + ${b} = ${answer}`,
      };
    },
    // Step 3 — decompose the teen total into 10 + ones.
    (ctx, round) => {
      const { answer } = round;
      return {
        equation: { left: TEN, right: answer - TEN, sum: answer },
        cue: "step-3",
        question: null,
        reveal: `${TEN} + ${answer - TEN} = ${answer}`,
      };
    },
    // Step 4 — celebrate.
    (ctx, round) => {
      ctx.buddy.setMood("cheer");
      return {
        equation: { left: "", right: "", sum: round.answer },
        cue: "step-4",
        question: null,
        reveal: String(round.answer),
      };
    },
  ],
});
// scenes/level3.js — up to 20, no make-ten step.
//
// The child fills the blank in "a + ? = answer". The ten-frame shows the ones
// place of `a`, with a separate tile for the tens place when a >= 10.
//
// Step 3 used to advance the step bar and render nothing at all. It now shows
// the teen-number decomposition (10 + n = answer), which is the point of a
// level that crosses ten.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import { INK, YELLOW, FONT } from "../components/theme.js";

const TEN = 10;

export default createRoundScene({
  levelId: 3,
  sceneName: "level3",
  introCue: "lvl-3-intro",
  stepLabels: ["Count on", "Add", "Check", "Cheer"],

  equation: (round) => ({ left: round.a, right: "?", sum: round.answer }),

  question: (round) => {
    const correct = round.missing ?? round.b;
    return { correct, values: options(correct, { min: 0, max: 20 }) };
  },

  body: (ctx) => {
    const { k, round } = ctx;
    const tens = Math.floor(round.a / TEN);
    const ones = round.a % TEN;

    if (tens > 0) {
      // A full ten shown as one labelled tile, so the frame beside it clearly
      // represents only the ones place.
      const tile = k.add([
        k.rect(96, 130, { radius: 16 }),
        k.color(...YELLOW),
        k.outline(3, k.rgb(...INK)),
        k.pos(LAYOUT.barX - 300, LAYOUT.bodyY),
        k.anchor("center"),
      ]);
      tile.add([
        k.text(`${tens * TEN}`, { size: 44, font: FONT }),
        k.color(...INK),
        k.anchor("center"),
        k.pos(0, 0),
      ]);
    }

    return tenFrame(k, ones, {
      x: LAYOUT.barX + 60, y: LAYOUT.bodyY, rows: 2, cell: 56, gap: 8,
    });
  },

  steps: [
    // Step 2 — Add: the complete equation.
    (ctx) => {
      const { a, b, answer } = ctx.round;
      ctx.reveal(`${a} + ${b} = ${answer}`, { size: 56 });
    },
    // Step 3 — Check: decompose the teen result into a ten plus the ones.
    (ctx) => {
      const { answer } = ctx.round;
      ctx.reveal(`${TEN} + ${answer - TEN} = ${answer}`, { size: 48 });
    },
    // Step 4 — Cheer.
    (ctx) => {
      ctx.buddy.setMood("cheer");
      ctx.reveal(String(ctx.round.answer), { size: 96, replace: true });
    },
  ],

  replayCue: (round, step) =>
    ({ 1: "round-start", 2: "step-2", 3: "step-3", 4: "round-end" })[step] || "round-start",
});

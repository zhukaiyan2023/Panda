// scenes/dailyDone.js — transient "今天练够啦" message scene.
//
// Shown when a kid's just-finished round hits the per-level daily
// round cap. Same friendly cue as a daily-locked card tap. One
// "好" button returns to the picker. Replaced with the real
// implementation in Task 5.

import { INK, PAPER, FONT } from "../components/theme.js";

export default function dailyDoneScene(k) {
  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);
  k.add([
    k.text("(stub — replaced in Task 5)", { size: 36, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, k.height() / 2),
    k.anchor("center"),
  ]);
}

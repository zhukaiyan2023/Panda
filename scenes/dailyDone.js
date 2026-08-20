// scenes/dailyDone.js — transient "今天练够啦" message scene.
//
// Shown when a kid's just-finished round hits the per-level daily
// round cap. The scene is intentionally silent; the round's audio
// has already been handled by the shared audio scheduler.
// A single "好" button returns to the picker.

import panda from "../components/panda.js?v=20260812";
import { INK, FONT, ORANGE } from "../components/theme.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";

export default function dailyDoneScene(k) {
  sceneBg(k, "bg-bamboo-grove");

  const buddy = panda(k, { x: 150, y: 248, size: 172 });
  buddy.setMood("idle");

  const cardW = 720;
  const cardH = 460;
  const cx = k.width() / 2;
  const cy = k.height() / 2 - 40;

  k.add([
    k.rect(cardW, cardH, { radius: 32 }),
    k.color(...INK),
    k.opacity(0.15),
    k.pos(cx, cy + 10),
    k.anchor("center"),
  ]);

  k.add([
    k.rect(cardW, cardH, { radius: 32 }),
    k.color(255, 250, 240),
    k.outline(5, k.rgb(...INK)),
    k.pos(cx, cy),
    k.anchor("center"),
  ]);

  k.add([
    k.text("今天练够啦", { size: 96, font: FONT }),
    k.color(...INK),
    k.pos(cx, cy - 40),
    k.anchor("center"),
  ]);
  k.add([
    k.text("明天再来哦！", { size: 56, font: FONT }),
    k.color(...ORANGE),
    k.pos(cx, cy + 60),
    k.anchor("center"),
  ]);

  const btnW = 240;
  const btnH = 110;
  const btn = k.add([
    k.rect(btnW, btnH, { radius: 24 }),
    k.color(...ORANGE),
    k.outline(5, k.rgb(...INK)),
    k.pos(cx, cy + 180),
    k.anchor("center"),
    k.area(),
  ]);
  k.add([
    k.text("好", { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(cx, cy + 180),
    k.anchor("center"),
  ]);
  btn.onClick(() => k.go("levelPicker"));
}

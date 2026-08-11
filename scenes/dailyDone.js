// scenes/dailyDone.js — transient "今天练够啦" message scene.
//
// Shown when a kid's just-finished round hits the per-level daily
// round cap. The celebration audio from the round that triggered
// the cap has already finished by the time we get here (roundScene
// waits on its `onAdvance` Promise), so we play our own short
// friendly cue on entry. A single "好" button returns to the
// picker.
//
// Layout mirrors the level picker: PAPER background, panda buddy
// in the upper-left, centered card with the message, single button
// at the bottom.

import panda from "../components/panda.js";
import { INK, PAPER, FONT, ORANGE } from "../components/theme.js";

export default function dailyDoneScene(k) {
  // Background.
  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

  // Panda buddy at the same position as the picker (kept from
  // there so the visual is familiar — same panda, same room).
  const buddy = panda(k, { x: 150, y: 248, size: 172 });
  buddy.setMood("idle");

  // Centered card (same shape as a single level-picker card so the
  // kid sees a familiar element).
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

  // Friendly message — same Mandarin text as the audio cue.
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

  // "好" button — wide, centered, orange. Mirrors the round-scene
  // button style so it looks like a "next" affordance the kid is
  // used to.
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

  // Friendly audio — plays once on scene entry. The k.go() wrapper
  // in main.js calls stopAllAudio before navigating, so this cue
  // starts cleanly even if the round's celebration audio is still
  // tailing off (shouldn't be, but defensive).
  window.PandaAudio.playCue("daily-done");
}

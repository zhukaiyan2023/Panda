// components/sceneBg.js — full-bleed illustrated scene backdrop.
//
// Replaces the flat PAPER-color rect every scene painted at z = -10. Falls
// back to the flat color if the artwork hasn't loaded yet (a missing sprite
// must not blank the scene), and adds a soft cream overlay so the
// illustrated background doesn't compete with the foreground content.
//
// Usage:
//   sceneBg(k, "bg-meadow");

import { PAPER } from "./theme.js?v=20260812";

export default function sceneBg(k, name) {
  // Try the illustrated background first. k.getSprite throws before the
  // scene init that loads art completes, so the try/catch is the runtime
  // guarantee; the size fallback handles the post-load-but-missing case.
  let drewArt = false;
  try {
    const has = k.getSprite(name);
    if (has) {
      const bg = k.add([
        k.sprite(name),
        k.pos(k.width() / 2, k.height() / 2),
        k.anchor("center"),
        k.z(-10),
      ]);
      bg.width = k.width();
      bg.height = k.height();
      // Light veil tints the art toward the page cream so foreground
      // primitives and text stay legible.
      k.add([
        k.rect(k.width(), k.height()),
        k.color(...PAPER),
        k.opacity(0.45),
        k.z(-9),
      ]);
      drewArt = true;
    }
  } catch (_) { /* not loaded yet */ }

  if (!drewArt) {
    k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);
  }
}

// components/card.js — shared card/panel primitive.
//
// The level picker, games picker, daily-done modal, and several victory
// screens were each reimplementing the same drop-shadow + face + outline
// trio. The repetition meant every new card tweak (e.g. adding a glow or a
// tinted background) had to be hunted across files.
//
//   card(parent, k, { x, y, w, h, fill, radius, shadowOffset, outlineWidth })
//     -> GameObj with .add() and .area() set
//
// `fill` defaults to CARD; pass any [r, g, b] to tint. The face is wrapped in
// a Kaplay area so the caller's onClick fires on the visible rectangle rather
// than the whole parent (the shadow + face together form a much larger hit
// area that catches stray taps outside the card).

import { INK, CARD } from "./theme.js?v=20260812";

export function card(parent, k, opts) {
  const w = opts.w ?? 320;
  const h = opts.h ?? 380;
  const x = opts.x;
  const y = opts.y;
  const fill = opts.fill ?? CARD;
  const radius = opts.radius ?? 28;
  const shadowOffset = opts.shadowOffset ?? 10;
  const outlineWidth = opts.outlineWidth ?? 5;

  // Drop shadow: an offset rect of INK at low opacity, behind the face. The
  // flat 18%-opacity read makes the card feel raised off the page — important
  // for a small child to recognize as something they can press.
  parent.add([
    k.rect(w, h, { radius }),
    k.color(...INK),
    k.opacity(0.18),
    k.pos(x, y + shadowOffset),
    k.anchor("center"),
  ]);

  return parent.add([
    k.rect(w, h, { radius }),
    k.color(...fill),
    k.outline(outlineWidth, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
  ]);
}

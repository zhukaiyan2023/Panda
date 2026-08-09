// components/pickerItem.js — a single tappable item for the pair-scene games.
//
// Used by boat (boat sprite + number), cloud (cloud sprite + number), bounce
// (balloon sprite + number), and panda-feed (orange bubble + number). It
// returns a descriptor the pairScene factory expects:
//
//   { value, node, setDisabled(bool), shake(), highlight(), unhighlight() }
//
// The number text is drawn over the sprite. setDisabled dims the item, shake
// does a brief horizontal jitter, highlight adds a yellow ring, unhighlight
// removes it. A small child can tap one of these reliably even when several
// are on screen at once.

import { INK, CARD, ORANGE, FONT } from "./theme.js";

const SIZE = 180;        // hit-target and face size
const SPRITE_SCALE = 0.6; // shrinks the prop sprite inside the button

// area() needs an explicit shape, otherwise the root has no renderArea and
// Kaplay's per-frame hit test throws. (Same gotcha as choice.js.)
function hitShape(k, x, y, w, h) {
  return k.area({ shape: new k.Rect(k.vec2(x - w / 2, y - h / 2), w, h) });
}

// item(parent, opts) — opts: { value, sprite?, x, y, fillColor?, size? }
//
//   parent   Kaplay scene root (k)
//   value    the number this item carries (used by pairScene to compute sums)
//   sprite   optional sprite name (e.g. "boat", "cloud", "mole", "balloon", "bubble")
//            — when missing, the item renders as a plain numbered card
//   x, y     center position on the canvas
//   fillColor   [r,g,b] override for the card face, default CARD
//   size     override for the face hit-target (square)
//
// Returns { value, node, setDisabled, shake, highlight, unhighlight }.
export default function item(parent, opts) {
  const k = window.kaplay;
  const value = opts.value;
  const spriteName = opts.sprite;
  const x = opts.x;
  const y = opts.y;
  const w = opts.size ?? SIZE;
  const h = opts.size ?? SIZE;
  const fill = opts.fillColor || CARD;
  const hasSprite = spriteName && k.getSprite(spriteName);

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), hitShape(k, x, y, w, h)]);

  // Soft offset slab so the item reads as a raised key.
  root.add([
    k.rect(w, h, { radius: 28 }),
    k.color(...INK),
    k.opacity(0.18),
    k.pos(x, y + 8),
    k.anchor("center"),
  ]);

  // Orange selection ring drawn BEHIND the face. Only the 8 px of ring that
  // extends beyond the face shows, so the kid sees a bright border around the
  // item they've selected — the original ordering drew it on top, which
  // either covered the face or never appeared (opacity 0 was never cleared).
  const ring = root.add([
    k.rect(w + 16, h + 16, { radius: 32 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);
  ring.hidden = true;

  const face = root.add([
    k.rect(w, h, { radius: 28 }),
    k.color(...fill),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  // Optional sprite prop behind the number — boats, clouds, balloons.
  if (hasSprite) {
    root.add([
      k.sprite(spriteName),
      k.pos(x, y - 16),
      k.anchor("center"),
      k.scale(SPRITE_SCALE),
      k.z(1),
    ]);
  }

  // White circle behind the number so the digit reads clearly no matter what
  // colour the sprite is. Without this, a brown boat hull swallowed the
  // black digit and kids couldn't tell what number was on which boat.
  const labelY = y + (hasSprite ? 44 : 0);
  const labelBg = root.add([
    k.circle(40),
    k.color(255, 255, 255),
    k.outline(3, k.rgb(...INK)),
    k.pos(x, labelY),
    k.anchor("center"),
    k.z(1.5),
  ]);

  const label = root.add([
    k.text(String(value), { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(x, labelY),
    k.anchor("center"),
    k.z(2),
  ]);

  let disabled = false;

  const descriptor = {
    value,
    node: root,
    setDisabled(on) {
      disabled = !!on;
      face.opacity = on ? 0.35 : 1;
      label.opacity = on ? 0.35 : 1;
      labelBg.opacity = on ? 0.35 : 1;
      ring.hidden = on || !ring.userVisible;
    },
    shake() {
      // Quick horizontal jitter; 0.35s total. Doesn't lock the item so the
      // child can retry without re-pressing.
      const start = k.time();
      root.onUpdate(() => {
        const t = k.time() - start;
        if (t > 0.35) {
          root.pos.x = 0;
          root.onUpdate(() => {});
          return;
        }
        root.pos.x = Math.sin(t * 30) * 14;
      });
    },
    highlight() {
      ring.userVisible = true;
      ring.hidden = disabled;
    },
    unhighlight() {
      ring.userVisible = false;
      ring.hidden = true;
    },
  };

  return descriptor;
}
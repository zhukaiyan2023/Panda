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

import { INK, CARD, ORANGE, FONT } from "./theme.js?v=20260812";

const SIZE = 180;        // hit-target and face size
const SPRITE_SCALE = 0.6; // default: shrinks the prop sprite inside the button

// area() needs an explicit shape, otherwise the root has no renderArea and
// Kaplay's per-frame hit test throws. (Same gotcha as choice.js.)
//
// The hit rect extends ABOVE the face when the label floats above the sprite
// — otherwise tapping the digit (which lives at y-110) lands on empty space
// above the face and the click misses the item entirely.
function hitShape(k, x, y, w, h, labelAbove) {
  const extraTop = labelAbove ? 80 : 0;
  return k.area({
    shape: new k.Rect(k.vec2(x - w / 2, y - h / 2 - extraTop), w, h + extraTop),
  });
}

// item(parent, opts) — opts: { value, sprite?, x, y, fillColor?, size?, labelPosition?, labelYOffset?, spriteScale?, hideFace?, noLabelBg?, noLabelBgTextColor?, noLabelBgStrokeColor? }
//
//   parent   Kaplay scene root (k)
//   value    the number this item carries (used by pairScene to compute sums)
//   sprite   optional sprite name (e.g. "boat", "cloud", "balloon", "bubble")
//            — when missing, the item renders as a plain numbered card
//   selectedSprite optional second sprite name. When set, highlight() swaps
//            the visible sprite to `selectedSprite` and unhighlight() swaps
//            back. The pulsing orange ring is skipped — the sprite swap is
//            the selection indicator. Used by the boat scene (2026-08-12),
//            where the kid found the pulsing ring "ugly" and we now switch
//            between two whole boat sprites (white-sail / golden-sail).
//   selectedLift   optional pixels to lift the whole item (root.pos.y
//            decreases by this much) on highlight(), and tween back on
//            unhighlight(). The lift is a clear "this one is up, this one
//            is picked" beat that pairs with the sprite swap. Default 0
//            (no lift; only the sprite changes). Boat uses 20 (2026-08-12
//            follow-up: the sprite-swap alone wasn't obvious enough).
//   selectedScale  optional MULTIPLIER applied to the SPRITE NODE (not the
//            whole item — the hit target stays put so the kid can't
//            accidentally un-pick by tapping the grown sprite) on
//            highlight(), tweened back on unhighlight(). The actual
//            target scale is spriteScale × selectedScale, so 1.18 with a
//            base spriteScale of 0.16 grows the bubble to 0.1888 (≈18%
//            bigger), not 1.18 absolute. For sprites that don't have a
//            `selectedSprite` companion (gameFeed bubbles ship only one
//            bubble PNG, so the sprite-swap path doesn't apply), the
//            scale + lift + ring combo makes selection unmistakable.
//            Default 1.0 (no scale). Bubbles use 1.18 — the bubble
//            sprite is mostly inside the orange ring, so a scale-up
//            reads as the bubble "popping forward".
//   x, y     center position on the canvas
//   fillColor   [r,g,b] override for the card face, default CARD
//   size     override for the face hit-target (square)
//   labelPosition "below" (default) keeps the digit inside/below the sprite;
//               "above" floats it well above the sprite top (legacy boat
//               default — most callers now pass labelYOffset directly).
//               "on" means "render directly on the sprite body" — the digit
//               uses the labelYOffset the caller passed (no fallback default
//               for "on", since the right offset depends entirely on which
//               sprite is in use).
//   labelYOffset explicit Y offset of the digit relative to the item center.
//               Use this when the preset "above"/"below"/"on" positions
//               don't match what your sprite needs:
//                 boat     labelYOffset: -60   (just above the boat)
//                 balloon  labelYOffset: -33   (balloon body is in upper half)
//                 cloud    labelYOffset: -16   (cloud body is sprite-centered)
//               Overrides labelPosition when both are passed.
//   spriteScale multiplier for the prop sprite (default 0.6). Pass smaller
//               for tight grids (e.g. boat at 0.5) so adjacent sprites have
//               visible breathing room.
//   hideFace  true = skip drawing the rounded card behind the sprite. Boat
//               and bounce use this so the sprite sits cleanly on the
//               canvas, the way boat.html / bounce.html render them (no
//               card frame around the prop). Hit-target stays the same.
//   noLabelBg true = skip the white circle behind the digit. Combine with
//               labelPosition: "on" (or a custom labelYOffset) so the number
//               renders directly on the sprite. The text needs the right
//               contrast against the sprite, controlled by:
//   noLabelBgTextColor [r,g,b] color of the main digit (default white —
//               reads on saturated sprites like pink balloons).
//   noLabelBgStrokeColor [r,g,b] color of the drop-shadow outline (default
//               INK). For light sprites (clouds) override both: dark text +
//               white stroke so the number reads on the light-blue body.
//
// Returns { value, node, setDisabled, shake, highlight, unhighlight }.
export default function item(parent, opts) {
  const k = window.kaplay;
  const value = opts.value;
  const spriteName = opts.sprite;
  const selectedSpriteName = opts.selectedSprite;
  const selectedLift = opts.selectedLift ?? 0;
  const selectedScale = opts.selectedScale ?? 1.0;
  const x = opts.x;
  const y = opts.y;
  const w = opts.size ?? SIZE;
  // Default the hit-box height to `size` (square) so boat/cloud/bubble
  // callers stay unchanged. Balloon uses a taller hit box (see
  // gameBounce.js) because balloon.png is 443×899 — far taller than
  // wide — and a square 180×180 hit box misses the entire upper half of
  // the visible body. 2026-08-14 user feedback: kid's tap on the round
  // balloon body landed on empty space (above the hit box).
  const h = opts.hitHeight ?? opts.size ?? SIZE;
  const fill = opts.fillColor || CARD;
  const hasSprite = spriteName && k.getSprite(spriteName);
  const labelPosition = opts.labelPosition ?? "below";
  const spriteScale = opts.spriteScale ?? SPRITE_SCALE;
  const hideFace = !!opts.hideFace;
  const noLabelBg = !!opts.noLabelBg;
  // Offset of the digit label from the item center along Y. The explicit
  // opts.labelYOffset always wins — the preset positions below are
  // historical defaults from before each game passed its own offset.
  //   above  → -140 (way above the sprite top — too high for current
  //                  layouts; pass labelYOffset: -60 for a tighter boat)
  //   on     → 0 (sprite center; works only if sprite is body-centered)
  //   below  → 44 (just below the sprite center)
  let labelYOffset = 0;
  if (opts.labelYOffset !== undefined) {
    labelYOffset = opts.labelYOffset;
  } else if (hasSprite) {
    if (labelPosition === "above") labelYOffset = -140;
    else if (labelPosition === "on") labelYOffset = 0;
    else labelYOffset = 44;  // "below"
  }

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), hitShape(k, x, y, w, h, labelPosition === "above")]);

  // Soft offset slab so the item reads as a raised key.
  // Skipped when hideFace is set — the slab only makes sense behind a card.
  if (!hideFace) {
    root.add([
      k.rect(w, h, { radius: 28 }),
      k.color(...INK),
      k.opacity(0.18),
      k.pos(x, y + 8),
      k.anchor("center"),
    ]);
  }

  // Orange selection ring drawn BEHIND the face. Visible band is 16 px on
  // each side (face 180 px, ring 212 px). The ring pulses (scale 1.0 → 1.06 →
  // 1.0 on a sine) so a tap against a busy scene reads as a clear "yes, I
  // picked this" beat instead of a static border.
  const RING_PAD = 32;
  const ring = root.add([
    k.rect(w + RING_PAD, h + RING_PAD, { radius: 36 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);
  ring.hidden = true;
  let pulseStart = 0;
  let pulsing = false;
  ring.onUpdate(() => {
    if (!pulsing) return;
    const t = k.time() - pulseStart;
    const s = 1 + 0.06 * Math.sin(t * 10);
    ring.scale = k.vec2(s, s);
  });

  // Rounded card face behind the sprite. Skipped when hideFace is set —
  // boats and balloons sit on the canvas directly, with no card frame
  // around them (matches panda-park/boat.html + bounce.html).
  const face = hideFace ? null : root.add([
    k.rect(w, h, { radius: 28 }),
    k.color(...fill),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  // Optional sprite prop behind the number — boats, clouds, balloons.
  // When `selectedSprite` is provided, two sprite nodes are created at the
  // same position; the regular one is visible by default, the selected one
  // is shown by highlight() and hidden by unhighlight(). The pulsing orange
  // ring is skipped in that mode (useSpriteSwap is the new selection
  // indicator). Capturing the node refs is required so we can flip their
  // visibility in highlight()/unhighlight().
  let spriteNode = null;
  let selectedSpriteNode = null;
  const useSpriteSwap = !!(hasSprite && selectedSpriteName && k.getSprite(selectedSpriteName));
  if (useSpriteSwap) {
    // Two sprite nodes at the same spot. The selected one starts at
    // opacity 0 so it never paints on top of the regular sprite until
    // highlight() is called. We use opacity (not .hidden = true) because
    // 2026-08-12 the user reported seeing a half-mixed state at the
    // start of the round — top row looked like the selected sprite even
    // though no one had tapped anything. .hidden appears to be unreliable
    // when the two sprites share z and are added back-to-back to the
    // same parent; the renderer can paint the "hidden" one on top before
    // the property settles. Opacity is a guaranteed render-time skip.
    spriteNode = root.add([
      k.sprite(spriteName),
      k.pos(x, y - 16),
      k.anchor("center"),
      k.scale(spriteScale),
      k.opacity(1),
      k.z(1),
    ]);
    selectedSpriteNode = root.add([
      k.sprite(selectedSpriteName),
      k.pos(x, y - 16),
      k.anchor("center"),
      k.scale(spriteScale),
      k.opacity(0),
      k.z(1),
    ]);
  } else if (hasSprite) {
    spriteNode = root.add([
      k.sprite(spriteName),
      k.pos(x, y - 16),
      k.anchor("center"),
      k.scale(spriteScale),
      k.z(1),
    ]);
  }

  // White circle behind the number so the digit reads clearly no matter what
  // colour the sprite is. Without this, a brown boat hull swallowed the
  // black digit and kids couldn't tell what number was on which boat.
  // Skipped when noLabelBg is set — balloons draw the number directly on
  // the sprite with a dark stroke simulated by a slightly offset shadow.
  const labelY = y + labelYOffset;
  const labelBg = noLabelBg ? null : root.add([
    k.circle(40),
    k.color(255, 255, 255),
    k.outline(3, k.rgb(...INK)),
    k.pos(x, labelY),
    k.anchor("center"),
    k.z(1.5),
  ]);

  // When noLabelBg is set, the number renders directly on the sprite with
  // a colored "drop-shadow" stroke simulated by drawing the same text in
  // the stroke color at a slight downward offset. The cloud uses dark
  // text + white stroke (light-cloud body), the balloon uses white text
  // + dark stroke (saturated pink body). Callers override via
  // noLabelBgTextColor / noLabelBgStrokeColor.
  const noLabelBgText = opts.noLabelBgTextColor ?? [255, 255, 255];
  const noLabelBgStroke = opts.noLabelBgStrokeColor ?? INK;
  const label = root.add([
    k.text(String(value), { size: 64, font: FONT }),
    k.color(...(noLabelBg ? noLabelBgText : INK)),
    k.pos(x, labelY),
    k.anchor("center"),
    k.z(2),
  ]);
  // Drop-shadow stroke (only when noLabelBg is set; otherwise the white
  // circle already gives the digit plenty of contrast).
  const labelStroke = noLabelBg ? root.add([
    k.text(String(value), { size: 64, font: FONT }),
    k.color(...noLabelBgStroke),
    k.opacity(0.7),
    k.pos(x, labelY + 3),
    k.anchor("center"),
    k.z(1.9),
  ]) : null;

  let disabled = false;

  const descriptor = {
    value,
    node: root,
    // World position of the item center (not root.pos, which is always (0,0)).
    // Sparkle bursts and similar effects need to anchor to the boat, not the
    // origin, so we expose it on the descriptor.
    x,
    y,
    setDisabled(on) {
      disabled = !!on;
      if (face) face.opacity = on ? 0.35 : 1;
      label.opacity = on ? 0.35 : 1;
      if (labelBg) labelBg.opacity = on ? 0.35 : 1;
      if (labelStroke) labelStroke.opacity = on ? 0.2 : 0.55;
      if (useSpriteSwap) {
        // Disabled = "done, faded out". Force the regular (unselected)
        // sprite so every disabled boat looks the same — the kid doesn't
        // see a "golden selected but faded" inconsistency mid-round.
        // Snap the lift back to 0 too: a disabled boat should sit on the
        // row baseline, not hover. Opacity (not .hidden) — see the long
        // comment in the sprite-swap creation block above for the
        // 2026-08-12 why .hidden was unreliable.
        spriteNode.opacity = 1;
        selectedSpriteNode.opacity = 0;
        if (selectedLift > 0) root.pos.y = 0;
      } else {
        ring.hidden = on || !ring.userVisible;
        // Snap the sprite back to its base scale on disable — a
        // disabled bubble should sit on the row baseline at its
        // original size, not hover above it at the selected scale.
        if (spriteNode && selectedScale !== 1.0) {
          spriteNode.scale = k.vec2(spriteScale, spriteScale);
        }
        if (selectedLift > 0) root.pos.y = 0;
      }
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
      if (useSpriteSwap) {
        // Whole-sprite swap: hide the regular boat, show the golden-sail
        // "picked" boat. No ring, no pulse — the visual change is the
        // sprite itself, plus a small lift (see below) so the picked boat
        // physically rises above its neighbors. The kid sees "this one
        // is up, this one is picked" instead of just a colour swap.
        // Opacity (not .hidden) — see the long comment at the sprite
        // creation site for the 2026-08-12 reason.
        spriteNode.opacity = 0;
        selectedSpriteNode.opacity = 1;
        if (selectedLift > 0) {
          k.tween(root.pos.y, -selectedLift, 0.15, (v) => { root.pos.y = v; });
        }
        return;
      }
      ring.userVisible = true;
      ring.hidden = disabled;
      pulseStart = k.time();
      pulsing = true;
      // Sprite-only scale tween — the hit-target stays put so the kid
      // can't accidentally un-pick by tapping the grown sprite, and the
      // ring still fits around the (smaller) hit area. Combines with
      // the ring pulse and an optional lift to make selection
      // unmistakable on sprites where the orange ring is mostly hidden
      // by the sprite body (gameFeed bubbles).
      //
      // selectedScale is a MULTIPLIER on the base spriteScale, not an
      // absolute value — so selectedScale 1.18 means "bubble grows to
      // 1.18× its base 0.16 = 0.1888" (≈18% bigger), not "bubble grows
      // to absolute scale 1.18" (which would 7× the bubble and cover
      // the whole canvas).
      if (spriteNode && selectedScale !== 1.0) {
        const targetScale = spriteScale * selectedScale;
        k.tween(spriteNode.scale.x, targetScale, 0.15, (v) => {
          spriteNode.scale = k.vec2(v, v);
        });
      }
      if (selectedLift > 0) {
        k.tween(root.pos.y, -selectedLift, 0.15, (v) => { root.pos.y = v; });
      }
    },
    unhighlight() {
      if (useSpriteSwap) {
        // Swap back: regular visible, selected hidden, and tween the
        // lift back to 0 so the boat returns to its row baseline.
        spriteNode.opacity = 1;
        selectedSpriteNode.opacity = 0;
        if (selectedLift > 0) {
          k.tween(root.pos.y, 0, 0.15, (v) => { root.pos.y = v; });
        }
        return;
      }
      ring.userVisible = false;
      ring.hidden = true;
      pulsing = false;
      ring.scale = k.vec2(1, 1);
      // Tween the sprite back to its base scale so the picked bubble
      // visibly shrinks back into the row, not just fades its ring.
      if (spriteNode && selectedScale !== 1.0) {
        k.tween(spriteNode.scale.x, spriteScale, 0.15, (v) => {
          spriteNode.scale = k.vec2(v, v);
        });
      }
      if (selectedLift > 0) {
        k.tween(root.pos.y, 0, 0.15, (v) => { root.pos.y = v; });
      }
    },
  };

  return descriptor;
}
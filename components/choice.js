// components/choice.js — a single numeric answer button (plain digits, no emoji).
//
// Each button is sized for >=44pt touch targets on iPad and accepts a label,
// an enabled/disabled state, and a click handler. Disabled buttons render
// dimmed to indicate they have been locked out (e.g. wrong answer).

import { INK, CARD, DISABLED_BG, DISABLED_INK, ORANGE, FONT } from "./theme.js?v=20260812";

// area() falls back to the object's own renderArea(), which only shape
// components (rect/circle/sprite/text) provide. The shape here lives on a child,
// so the shape must be handed to area() explicitly — otherwise the root has no
// renderArea and Kaplay's per-frame hit test throws on every frame.
function hitShape(k, x, y, w, h) {
  return k.area({ shape: new k.Rect(k.vec2(x - w / 2, y - h / 2), w, h) });
}

export default function choice(parent, opts = {}) {
  const k = window.kaplay;
  const label = String(opts.label);
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 132;
  const h = opts.h ?? 112;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), hitShape(k, x, y, w, h)]);

  // A flat offset slab behind the face reads as a raised key, which is easier
  // for a small child to recognize as pressable than an outlined rectangle.
  const shadow = root.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...INK),
    k.opacity(0.18),
    k.pos(x, y + 8),
    k.anchor("center"),
  ]);

  const face = root.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...(opts.disabled ? DISABLED_BG : CARD)),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  const text = root.add([
    k.text(label, { size: 56, font: FONT }),
    k.color(...(opts.disabled ? DISABLED_INK : INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  if (opts.onClick && !opts.disabled) {
    // Kaplay is configured with touchToMouse, so onClick covers both mouse and
    // touch input without double-firing on iPad Safari.
    root.onClick(() => opts.onClick());
  }

  root.setDisabled = (disabled) => {
    opts.disabled = disabled;
    face.color = k.rgb(...(disabled ? DISABLED_BG : CARD));
    text.color = k.rgb(...(disabled ? DISABLED_INK : INK));
    shadow.opacity = disabled ? 0.08 : 0.18;
  };

  // Marks a button as the confirmed correct answer, distinct from the dimmed
  // "already tried this" state.
  root.setCorrect = () => {
    face.color = k.rgb(...ORANGE);
    text.color = k.rgb(255, 255, 255);
  };

  return root;
}

// iconButton — small square button used for scene chrome (back / replay / etc).
// Smaller than the numeric choice buttons and uses the accent palette.

export function iconButton(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 96;
  const h = opts.h ?? 72;
  const label = String(opts.label);

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 5), hitShape(k, x, y, w, h)]);

  root.add([
    k.rect(w, h, { radius: 20 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  root.add([
    k.text(label, { size: opts.fontSize ?? 36, font: FONT }),
    k.color(255, 255, 255),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  if (opts.onClick) {
    // Kaplay is configured with touchToMouse, so onClick covers both mouse and
    // touch input without double-firing on iPad Safari.
    root.onClick(() => opts.onClick());
  }

  return root;
}

// components/choice.js — a single numeric answer button (plain digits, no emoji).
//
// Each button is sized for ≥44pt touch targets on iPad and accepts a label,
// an enabled/disabled state, and a click handler. Disabled buttons render
// dimmed to indicate they have been locked out (e.g. wrong answer).

const INK = [61, 54, 82];
const PAPER = [255, 250, 240];
const ACTIVE_BG = [255, 255, 255];
const DISABLED_BG = [230, 225, 239];
const DISABLED_INK = [170, 163, 189];

export default function choice(parent, opts = {}) {
  const k = window.kaplay;
  const label = String(opts.label);
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 132;
  const h = opts.h ?? 112;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), k.area()]);

  const rect = root.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...(opts.disabled ? DISABLED_BG : ACTIVE_BG)),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  root.add([
    k.text(label, { size: 56 }),
    k.color(...(opts.disabled ? DISABLED_INK : INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  if (opts.onClick && !opts.disabled) {
    root.onClick(() => opts.onClick());
    root.onTouchStart(() => opts.onClick());
  }

  root.setDisabled = (disabled) => {
    opts.disabled = disabled;
    rect.color = k.rgb(...(disabled ? DISABLED_BG : ACTIVE_BG));
  };

  return root;
}

// iconButton — small square button used for scene chrome (back / replay / etc).
// Smaller than the numeric choice buttons and uses the accent palette.
const ACCENT = [255, 138, 61];
const ACCENT_INK = [255, 255, 255];

export function iconButton(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 96;
  const h = opts.h ?? 72;
  const label = String(opts.label);

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 5), k.area()]);

  root.add([
    k.rect(w, h, { radius: 20 }),
    k.color(...ACCENT),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  root.add([
    k.text(label, { size: opts.fontSize ?? 36 }),
    k.color(...ACCENT_INK),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  if (opts.onClick) {
    root.onClick(() => opts.onClick());
    root.onTouchStart(() => opts.onClick());
  }

  return root;
}
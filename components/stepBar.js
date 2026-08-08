// components/stepBar.js — 4-step progress bar shown above the game area.
//
// Steps: Find a friend / Make 10 / Add the rest / Celebrate. Highlights the
// current step (1..4) and animates a fill bar from 25% to 100%.

const INK = [61, 54, 82];
const STEP_BG = [240, 236, 250];
const STEP_ACTIVE = [255, 209, 102];
const BAR = [255, 143, 171];

function pill(parent, k, label, x, y, w, h, active) {
  const p = parent.add([
    k.rect(w, h, { radius: h / 2 }),
    k.color(...(active ? STEP_ACTIVE : STEP_BG)),
    k.pos(x, y),
    k.anchor("center"),
  ]);
  p.add([
    k.text(label, { size: Math.round(h * 0.55) }),
    k.color(...INK),
    k.anchor("center"),
    k.pos(0, 0),
  ]);
  return p;
}

export default function stepBar(parent, opts = {}) {
  const k = window.kaplay;
  const step = Math.max(1, Math.min(4, opts.step ?? 1));
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;
  const w = opts.w ?? 900;
  const h = opts.h ?? 36;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const barW = w;
  const barH = 14;
  root.add([
    k.rect(barW, barH, { radius: barH / 2 }),
    k.color(...STEP_BG),
    k.pos(x - barW / 2, y - barH / 2),
  ]);
  const fillW = (barW * step) / 4;
  root.add([
    k.rect(fillW, barH, { radius: barH / 2 }),
    k.color(...BAR),
    k.pos(x - barW / 2, y - barH / 2),
  ]);

  const labels = ["Find a friend", "Make 10", "Add the rest", "Celebrate"];
  const stepW = 180;
  const stepGap = (w - labels.length * stepW) / (labels.length - 1);
  labels.forEach((label, i) => {
    const px = x - w / 2 + stepW / 2 + i * (stepW + stepGap);
    const py = y + 32 + h / 2;
    pill(root, k, label, px, py, stepW, h, i + 1 === step);
  });

  return root;
}
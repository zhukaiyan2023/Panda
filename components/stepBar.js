// components/stepBar.js — 4-step progress bar shown above the game area.
//
// Step labels are supplied by the caller: they describe a teaching strategy, and
// each level teaches a different one. They used to be hardcoded to the
// make-a-ten wording ("Find a friend / Make 10 / ..."), which Level 1 also
// displayed even though it teaches plain addition under 5.
//
// The returned object exposes setStep(n). Callers must reuse a single bar and
// call setStep rather than constructing a new bar per step: the previous code
// re-invoked stepBar() on every advance, leaving four overlapping bars stacked
// on screen by the final step.
//
// Usage:
//   const bar = stepBar(parent, { labels: [...4 strings], x, y, w, h });
//   bar.setStep(2);

import { INK, YELLOW, PINK, FONT } from "./theme.js?v=20260812";

const TRACK = [240, 236, 250];
const STEP_COUNT = 4;

export default function stepBar(parent, opts = {}) {
  const k = window.kaplay;
  const labels = (opts.labels ?? []).slice(0, STEP_COUNT);
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;
  const w = opts.w ?? 900;
  const h = opts.h ?? 36;

  const clampStep = (n) => Math.max(1, Math.min(STEP_COUNT, n ?? 1));
  let step = clampStep(opts.step);

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const barH = 14;
  const barLeft = x - w / 2;
  root.add([
    k.rect(w, barH, { radius: barH / 2 }),
    k.color(...TRACK),
    k.pos(barLeft, y - barH / 2),
  ]);
  const fill = root.add([
    k.rect((w * step) / STEP_COUNT, barH, { radius: barH / 2 }),
    k.color(...PINK),
    k.pos(barLeft, y - barH / 2),
  ]);

  const pillW = 190;
  const pillGap = labels.length > 1
    ? (w - labels.length * pillW) / (labels.length - 1)
    : 0;
  const pills = labels.map((label, i) => {
    const pill = root.add([
      k.rect(pillW, h, { radius: h / 2 }),
      k.color(...(i + 1 === step ? YELLOW : TRACK)),
      k.pos(barLeft + pillW / 2 + i * (pillW + pillGap), y + 32 + h / 2),
      k.anchor("center"),
    ]);
    pill.add([
      k.text(label, { size: Math.round(h * 0.52), font: FONT }),
      k.color(...INK),
      k.anchor("center"),
      k.pos(0, 0),
    ]);
    return pill;
  });

  root.setStep = (n) => {
    step = clampStep(n);
    fill.width = (w * step) / STEP_COUNT;
    pills.forEach((pill, i) => {
      pill.color = k.rgb(...(i + 1 === step ? YELLOW : TRACK));
    });
  };

  return root;
}

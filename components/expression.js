// components/expression.js — renders a horizontal "left + right = sum" equation.
//
// The slots are named rather than positional. The previous signature took
// { a, b, missing } and rendered [a, +, missing, =, b], i.e. it treated `b` as
// the sum. Every caller passed the second *addend* as `b`, so the game drew
// false arithmetic ("2 + ? = 1" for 2 + 1 = 3). Naming the sum `sum` makes that
// class of mistake impossible to write.
//
// Any slot may be the string "?" to mark it as the unknown; unknown slots
// render muted. Exactly which slot is unknown is the caller's choice, so the
// same component serves "a + ? = sum" and "a + b = ?".
//
// Usage:
//   expression(parent, { left: 8, right: "?", sum: 13, x, y, size });

import { INK, MUTED, FONT } from "./theme.js";

const UNKNOWN = "?";

function token(parent, k, text, size, muted) {
  return parent.add([
    k.pos(0, 0),
    k.text(String(text), { size, font: FONT, align: "center" }),
    k.color(...(muted ? MUTED : INK)),
    k.anchor("center"),
  ]);
}

export default function expression(parent, opts = {}) {
  const k = window.kaplay;
  const { left, right, sum } = opts;
  const x = opts.x;
  const y = opts.y;
  const size = opts.size ?? 96;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const slots = [
    { value: left, operator: false },
    { value: "+", operator: true },
    { value: right, operator: false },
    { value: "=", operator: true },
    { value: sum, operator: false },
  ];

  const gap = size * 1.1;
  const startX = x - ((slots.length - 1) * gap) / 2;

  slots.forEach((slot, i) => {
    const muted = !slot.operator && String(slot.value) === UNKNOWN;
    const node = token(root, k, slot.value, size, muted);
    node.pos.x = startX + i * gap;
    node.pos.y = y;
  });

  return root;
}

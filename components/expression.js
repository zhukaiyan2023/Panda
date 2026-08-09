// components/expression.js — renders an arithmetic expression as a row of
// slots: [value, operator, value, operator, value, ...].
//
// A slot may be a number, a string ("?"), or the literal string from any
// token. Unknowns render muted. Operators render at a smaller size than
// values so the eye groups the math, not the symbols.
//
// Slots are positioned with a fixed gap so a row never reflows when only the
// unknown is being solved. Slots may be colored individually via the
// `colors` array (one entry per slot, undefined leaves default).
//
// Usage:
//   expression(parent, { slots: [8, "+", "?", "=", 13], x, y, size, colors });

import { INK, MUTED, ACCENT, FONT } from "./theme.js";

const OP_SCALE = 0.7;

function token(parent, k, text, size, muted, color) {
  return parent.add([
    k.pos(0, 0),
    k.text(String(text), { size, font: FONT, align: "center" }),
    k.color(...(color || (muted ? MUTED : INK))),
    k.anchor("center"),
  ]);
}

function isOperator(s) {
  return s === "+" || s === "-" || s === "=" || s === "×" || s === "÷"
    || s === "(" || s === ")";
}

export default function expression(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const size = opts.size ?? 96;
  const colors = opts.colors || [];

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const slots = opts.slots || [opts.left, "+", opts.right, "=", opts.sum];
  const gap = size * 1.0;
  const totalWidth = (slots.length - 1) * gap;
  const startX = x - totalWidth / 2;

  slots.forEach((slot, i) => {
    const op = isOperator(String(slot));
    const muted = !op && String(slot) === "?";
    const nodeSize = op ? Math.round(size * OP_SCALE) : size;
    const node = token(root, k, slot, nodeSize, muted, colors[i]);
    node.pos.x = startX + i * gap;
    node.pos.y = y + (op ? nodeSize * 0.05 : 0);
  });

  return root;
}
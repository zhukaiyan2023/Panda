// components/expression.js — renders an arithmetic expression as a row of
// slots: [value, operator, value, operator, value, ...].
//
// A slot may be a number, a string ("?"), or the literal string from any
// token. Unknowns render as outlined square boxes when `boxMode` is true
// (the default visual for L2 make-a-ten unknowns per user feedback
// 2026-08-11 — "用这个方格子表示未知，不要用问号了"); otherwise unknowns
// render as muted "?" text. Operators render at a smaller size than
// values so the eye groups the math, not the symbols.
//
// Slots are positioned with a fixed gap so a row never reflows when only the
// unknown is being solved. Slots may be colored individually via the
// `colors` array (one entry per slot, undefined leaves default).
//
// Usage:
//   expression(parent, { slots: [8, "+", "?", "=", 13], x, y, size, colors, boxMode });

import { INK, MUTED, ACCENT, FONT } from "./theme.js";

const OP_SCALE = 0.7;

// Estimate a slot's rendered text width in pixels.
//
// Operators are narrow (size × ~0.35). Digits are wider and scale with
// character count — a 2-digit text is roughly 2× the width of a 1-digit,
// a 3-digit is roughly 3×. We never actually MEASURE the rendered text
// (that would need a font loader and would add a render-frame race) —
// these constants are tuned against the FONT asset so 2-digit numbers
// like "10" never visually collide with adjacent operators. Generous on
// the wide side (multiplier 0.62 per digit) so the row is always safe;
// slightly conservative on the narrow side would cause the overlap the
// user reported in step 2's "big + need = 10" reveal.
//
// Boxes are sized as large squares (1.6 × nodeSize) — clearly bigger
// than the digits they replace so the empty slot reads as "fill me
// in", not as a passive text character. With boxMode on, "?" slots
// take this width so the row layout doesn't shift when a box gets
// revealed into a single-digit number. Two-digit numbers revealed
// from a box DO cause a small layout shift (the box was 1-digit
// wide, the number is 2-digit), but that's expected — the equation
// becomes wider after the kid knows the answer. Per user feedback
// history: 0.85 was too small ("太小了"), 1.15 still looked like a
// digit ("？格子太小。要调大些") — 1.6 makes the box noticeably
// stand out from neighboring digits while still fitting in a row.
function estimateWidth(text, nodeSize, isBox) {
  if (isBox) return nodeSize * 1.6;
  if (isOperator(String(text))) {
    return nodeSize * 0.4;
  }
  return nodeSize * (0.62 + (String(text).length - 1) * 0.62);
}

// A "?" slot is rendered as a box when boxMode is true, and as muted
// "?" text otherwise. The check is intentionally string-based so callers
// don't have to swap token types just to toggle the visual.
function isBoxSlot(text, boxMode) {
  return boxMode && String(text) === "?";
}

function token(parent, k, text, size, muted, color, isBox) {
  if (isBox) {
    // Outlined-only rectangle (no fill). Box edges are ~7% of nodeSize
    // thick — scales with the equation so a 90-px anchor box has a
    // ~6-px edge while a 60-px sub-equation box has a ~4-px edge.
    // Outline color follows the slot's color (friend box → orange
    // outline, rest box → purple outline), so the kid already sees the
    // answer's color while the slot is still empty. Box dimensions are
    // 1.6 × nodeSize (square) — clearly bigger than the digit's
    // bounding box so the slot reads as "fill me in", not as a
    // passive text character. Per user feedback history 2026-08-11:
    // first the boxes were too small ("太小了"), then still too
    // similar to digits ("？格子太小。要调大些") — 1.6 makes the
    // box noticeably stand out from neighboring digits while still
    // fitting in a row.
    const boxSize = size * 1.6;
    const outlineWidth = Math.max(3, Math.round(size * 0.07));
    const boxColor = color || INK;
    return parent.add([
      k.pos(0, 0),
      k.rect(boxSize, boxSize, { fill: false }),
      k.outline(outlineWidth, ...boxColor),
      k.anchor("center"),
    ]);
  }
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
  const boxMode = opts.boxMode ?? false;
  // Optional per-slot width reservation. Pass the WIDEST content each slot
  // will ever hold during a round (e.g. the revealed 2-digit answer for a
  // slot that starts as "?"), and every render of that row lays out at the
  // same width — so slot centers never move between teaching steps and the
  // link lines drawn against slotCenters stay put. Without it the row is
  // re-centered on its current content, so revealing "?" → "19" shifts the
  // whole row left. Only rows that pass `reserve` are affected; every other
  // caller keeps the original content-fit behavior.
  const reserve = opts.reserve || [];

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const slots = opts.slots || [opts.left, "+", opts.right, "=", opts.sum];
  // Per-slot width estimation, with a fixed minimum edge gap between
  // adjacent slots. Previous code used a fixed center-to-center gap
  // (size × 1.0) which only worked for 1-digit numbers — for any
  // expression with a 2-digit value (L2 step 2 reveal "big + need = 10",
  // L3 step 1 "11 + 1 = ?", L3 parens form "... = 12..20") the 2-digit
  // slot was wider than the gap and visually overlapped the operator
  // before it. Industry standard: measure-or-estimate per-slot width and
  // position based on cumulative edge-to-edge layout. MIN_EDGE_GAP keeps
  // the breathing room consistent across row widths.
  const slotWidth = (slot) => {
    if (isBoxSlot(slot, boxMode)) return estimateWidth(slot, size, true);
    const op = isOperator(String(slot));
    const nodeSize = op ? Math.round(size * OP_SCALE) : size;
    return estimateWidth(slot, nodeSize);
  };
  const widths = slots.map((slot, i) => {
    const own = slotWidth(slot);
    return reserve[i] == null ? own : Math.max(own, slotWidth(reserve[i]));
  });
  const MIN_EDGE_GAP = size * 0.22;
  const totalWidth = widths.reduce((a, b) => a + b, 0)
    + MIN_EDGE_GAP * Math.max(0, slots.length - 1);
  let cursor = x - totalWidth / 2;
  const centers = widths.map((w) => {
    const center = cursor + w / 2;
    cursor += w + MIN_EDGE_GAP;
    return center;
  });

  slots.forEach((slot, i) => {
    const isBox = isBoxSlot(slot, boxMode);
    const op = !isBox && isOperator(String(slot));
    const muted = !isBox && !op && String(slot) === "?";
    const nodeSize = isBox ? size : (op ? Math.round(size * OP_SCALE) : size);
    const node = token(root, k, slot, nodeSize, muted, colors[i], isBox);
    node.pos.x = centers[i];
    node.pos.y = y + (op ? nodeSize * 0.05 : 0);
  });

  // Expose per-slot layout so callers can draw visual links between
  // matching slots in two expressions (e.g. L2 step 2 arrows connecting
  // the anchor's addends to the split equation's two-piece slots below).
  // Each entry is the slot's rendered-node size in pixels; the rendering
  // node's `pos` has the center x. y is the equation's baseline-relative
  // offset (operator slots get a tiny lift so the visual center matches
  // the text center; box slots sit on the same y as digits).
  root.slotCenters = centers;
  root.slotSizes = slots.map((s) => {
    const isBox = isBoxSlot(s, boxMode);
    if (isBox) return size;
    const op = isOperator(String(s));
    return op ? Math.round(size * OP_SCALE) : size;
  });
  root.slotY = y;

  return root;
}
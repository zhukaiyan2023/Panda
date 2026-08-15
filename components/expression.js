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

import { INK, MUTED, ACCENT, FONT, CARD } from "./theme.js?v=20260812";

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
// Boxes are sized as sub-digit squares (0.9 × nodeSize) with a
// prominent 10% outline so the border itself reads as the defining
// edge. With boxMode on, "□" / "?" slots take this width so the row
// layout doesn't shift when a box gets revealed into a single-digit
// number. Two-digit numbers revealed from a box DO cause a layout
// shift (the box was 1-digit wide, the number is 2-digit), but
// that's expected — the equation becomes wider after the kid knows
// the answer. Per user feedback history (2026-08-12, compounded
// tuning):
//   0.85 → 1.15 → 1.6 → 1.85 (outline-only, "明显还是小了")
//   3.0  + fill — boxes so huge they swallowed neighbouring equations
//   1.85 + fill + 14% outline — "现在框太大"
//   1.5  + fill + 11% outline — "框和数字的视觉就不对"
//   1.1  + fill +  8% outline — "再小一点，□ 要有边框"
//   0.9  + fill + 10% outline — current (2026-08-12). Box is now
//           SMALLER than digit height (digit ≈ 90px tall, box ≈
//           81px body + 18px outline ≈ 99px visual footprint). The
//           thicker 10% outline (vs the prior 8%) compensates for
//           the smaller body — the border is the main visual
//           character, not the fill. Reads as "this is a slot"
//           without dominating the digits around it.
function estimateWidth(text, nodeSize, isBox) {
  if (isBox) return nodeSize * 0.9;
  if (isOperator(String(text))) {
    return nodeSize * 0.4;
  }
  return nodeSize * (0.62 + (String(text).length - 1) * 0.62);
}

// A "?" / "□" slot is rendered as a chunky box when boxMode is true,
// and as muted text otherwise. Both glyphs have always been valid
// "unknown" markers — L1 uses "□" (per user feedback 2026-08-11:
// "用这个方格子表示未知，不要用问号了") while L2 historically used
// "?"; treating them symmetrically means callers can pick whichever
// matches the scene's visual convention without coordinating token
// types. The check is intentionally string-based so callers don't
// have to swap token types just to toggle the visual.
function isBoxSlot(text, boxMode) {
  if (!boxMode) return false;
  const t = String(text);
  return t === "?" || t === "□";
}

// Sprites used in place of drawn primitives. The digits stay live text because
// they change every round; only the fixed glyphs and the empty answer slot are
// art. Each is used only when it actually loaded, so a missing file degrades to
// the previous rect/text rendering rather than blanking the equation.
const OP_SPRITE = { "+": "op-plus", "=": "op-equals" };

function spriteFor(k, name) {
  return name && k.getSprite(name) ? name : null;
}

function token(parent, k, text, size, muted, color, isBox) {
  if (isBox) {
    // Use the slot-answer.png sprite (hand-drawn rounded-rect outline
    // baked at 750×725 with a dark blue/grey stroke and transparent
    // fill so PAPER shows through). Per user feedback 2026-08-12:
    // "图片版 ，要有黑边框的。" — they want the IMAGE version of □,
    // not a drawn rect. The sprite's hand-drawn aesthetic gives the
    // box a softer, more illustrative feel than the programmatically
    // drawn k.rect/k.outline alternative; the slightly wobbly stroke
    // reads as "drawn by hand" rather than "geometric primitive".
    //
    // Sized at 0.9 × nodeSize (matches the previous drawn-rect sizing
    // so the equation layout doesn't shift when we switch backends).
    // `color` tints the whole sprite — used by callers like L2 make-a-ten
    // who pass ORANGE to switch the outline to the reveal color.
    const boxSize = size * 0.9;
    const slotSprite = spriteFor(k, "slot-answer");
    if (slotSprite) {
      return parent.add([
        k.pos(0, 0),
        k.sprite(slotSprite, { width: boxSize, height: boxSize }),
        k.color(...(color || INK)),
        k.anchor("center"),
      ]);
    }
    // Fallback if the sprite didn't load — drawn rect with CARD fill
    // and INK outline. Same look as before the sprite switch.
    const outlineWidth = Math.max(5, Math.round(size * 0.10));
    const cornerRadius = Math.round(boxSize * 0.16);
    return parent.add([
      k.pos(0, 0),
      k.rect(boxSize, boxSize, {
        radius: cornerRadius,
        fill: true,
      }),
      k.color(...CARD),
      k.outline(outlineWidth, ...(color || INK)),
      k.anchor("center"),
    ]);
  }

  const opSprite = spriteFor(k, OP_SPRITE[String(text)]);
  if (opSprite) {
    return parent.add([
      k.pos(0, 0),
      k.sprite(opSprite, { width: size, height: size }),
      k.color(...(color || INK)),
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
  // Comparison symbols are operators too — they render at OP_SCALE × size
  // and use the narrow operator width in slot layout. Without ">" and "<"
  // here, the step-1 compare reveal ("□" → ">" / "<") would treat the
  // symbol as a regular digit and the slot would resize from 0.9 × size
  // (box width) to 0.62 × size (digit width), shifting a/b centers.
  // Per user feedback 2026-08-13: "选中正确答案之后，9和3的位置移动
  // 了，应该是 ◻ 只占了一个位置，但是 > 或者 < 占位不一致。"
  return s === "+" || s === "-" || s === "=" || s === "×" || s === "÷"
    || s === "(" || s === ")" || s === ">" || s === "<";
}

export default function expression(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const size = opts.size ?? 96;
  const colors = opts.colors || [];
  const slots = opts.slots || [opts.left, "+", opts.right, "=", opts.sum];
  // Auto-enable boxMode if any slot is an unknown marker (□ or ?).
  // Callers don't have to remember to pass boxMode: true — the slot
  // content itself signals "this is an unknown box". Set boxMode
  // explicitly to false to opt out for a "?"-text rendering. The
  // check recognises both glyphs because L1 uses "□" (per user
  // feedback 2026-08-11: "用这个方格子表示未知，不要用问号了")
  // while L2 historically uses "?".
  const wantsBox = slots.some((s) => {
    const t = String(s);
    return t === "?" || t === "□";
  });
  const boxMode = opts.boxMode ?? wantsBox;
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
  const naturalWidth = widths.reduce((a, b) => a + b, 0)
    + MIN_EDGE_GAP * Math.max(0, slots.length - 1);
  // Optional uniform row width — pass `totalWidth` to force this row to a
  // specific pixel width, padding the inter-slot gap to absorb the extra.
  // Use case: a multi-row scene (L4's anchor + split + bottom) where each
  // row has a different slot count and would otherwise center independently
  // around the same barX, putting slot 0 of each row at a different x. With
  // totalWidth pinned to the widest row, all rows share the same total
  // width AND the same per-slot widths (caller must use the same `size`),
  // so slot 0 lines up across rows and the eye doesn't see a column-shift
  // when a new row appears in a later step. Falls back to naturalWidth
  // when not set or when the row is naturally wider than the requested
  // total (we never shrink below the MIN_EDGE_GAP to avoid overlapping
  // slots).
  const totalWidth = Math.max(naturalWidth, opts.totalWidth ?? naturalWidth);
  const slotGaps = Math.max(0, slots.length - 1);
  const desiredGap = slotGaps > 0 ? (totalWidth - widths.reduce((a, b) => a + b, 0)) / slotGaps : 0;
  const gap = Math.max(MIN_EDGE_GAP, desiredGap);
  let cursor = x - totalWidth / 2;
  const centers = widths.map((w) => {
    const center = cursor + w / 2;
    cursor += w + gap;
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
  // For box slots, slotSizes must reflect the actual rendered box size
  // (1.85 × size, NOT size). The merge-line drawing code in level1.js
  // uses `slotY - slotSizes[i]/2` to find the top edge of the merge
  // box — if we returned `size` here, the arrow would terminate far
  // above the now-bigger box, leaving a visible gap. 1.85 mirrors the
  // constant in estimateWidth above; keep the two in sync.
  root.slotSizes = slots.map((s) => {
    const isBox = isBoxSlot(s, boxMode);
    if (isBox) return size * 0.9;
    const op = isOperator(String(s));
    return op ? Math.round(size * OP_SCALE) : size;
  });
  root.slotY = y;

  return root;
}
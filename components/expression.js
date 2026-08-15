// components/expression.js — renders an arithmetic expression as a fixed slot row.
import { INK, MUTED, FONT, CARD } from "./theme.js?v=20260812";

const OP_SCALE = 0.7;
const DEFAULT_UNKNOWN_RESERVE = "10";

function isOperator(s) {
  return s === "+" || s === "-" || s === "=" || s === "×" || s === "÷"
    || s === "(" || s === ")" || s === ">" || s === "<";
}

function estimateWidth(text, nodeSize, isBox) {
  if (isBox) return nodeSize * 0.9;
  if (isOperator(String(text))) return nodeSize * 0.4;
  return nodeSize * (0.62 + (String(text).length - 1) * 0.62);
}

function isBoxSlot(text, boxMode) {
  if (!boxMode) return false;
  const t = String(text);
  return t === "?" || t === "□";
}

const OP_SPRITE = { "+": "op-plus", "=": "op-equals" };

function spriteFor(k, name) {
  return name && k.getSprite(name) ? name : null;
}

function token(parent, k, text, size, muted, color, isBox) {
  if (isBox) {
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
    const outlineWidth = Math.max(5, Math.round(size * 0.10));
    const cornerRadius = Math.round(boxSize * 0.16);
    return parent.add([
      k.pos(0, 0),
      k.rect(boxSize, boxSize, { radius: cornerRadius, fill: true }),
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

export default function expression(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const size = opts.size ?? 96;
  const colors = opts.colors || [];
  const slots = opts.slots || [opts.left, "+", opts.right, "=", opts.sum];

  const wantsBox = slots.some((s) => {
    const t = String(s);
    return t === "?" || t === "□";
  });
  const boxMode = opts.boxMode ?? wantsBox;
  const callerReserve = opts.reserve || [];

  const slotWidth = (slot) => {
    if (isBoxSlot(slot, boxMode)) return estimateWidth(slot, size, true);
    const op = isOperator(String(slot));
    const nodeSize = op ? Math.round(size * OP_SCALE) : size;
    return estimateWidth(slot, nodeSize, false);
  };

  // A row that contains an unknown is a teaching-state row: later steps
  // replace the unknown with a number or comparison operator. Keep that
  // slot at the widest normal child-facing width even when the caller did
  // not explicitly provide `reserve`, so an overlooked level cannot make
  // the whole equation jump when the box is revealed.
  const reserve = slots.map((slot, i) => {
    if (callerReserve[i] != null) return callerReserve[i];
    if (isBoxSlot(slot, boxMode)) return DEFAULT_UNKNOWN_RESERVE;
    return null;
  });

  const widths = slots.map((slot, i) => {
    const own = slotWidth(slot);
    if (reserve[i] == null) return own;
    return Math.max(own, slotWidth(reserve[i]));
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

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);
  const tokens = [];
  slots.forEach((slot, i) => {
    const isBox = isBoxSlot(slot, boxMode);
    const op = !isBox && isOperator(String(slot));
    const muted = !isBox && !op && String(slot) === "?";
    const nodeSize = isBox ? size : (op ? Math.round(size * OP_SCALE) : size);
    const node = token(root, k, slot, nodeSize, muted, colors[i], isBox);
    node.pos.x = centers[i];
    node.pos.y = y + (op ? nodeSize * 0.05 : 0);
    tokens.push(node);
  });

  root.slotCenters = centers;
  root.slotSizes = slots.map((s) => {
    const isBox = isBoxSlot(s, boxMode);
    if (isBox) return size * 0.9;
    const op = isOperator(String(s));
    return op ? Math.round(size * OP_SCALE) : size;
  });
  root.slotY = y;
  root.layoutReserve = widths.slice();
  root.layoutContract = {
    x,
    y,
    size,
    reserve: reserve.slice(),
    slotCount: slots.length,
  };
  root.layoutTokens = tokens;

  return root;
}

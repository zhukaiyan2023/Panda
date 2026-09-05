// components/drawLink.js — shared line-segment primitive.
//
// Kaplay has no k.line in this build, so an arrow / link is drawn as a
// rectangle rotated to align with its endpoints. Link creation is idempotent
// for a parent: asking for the same segment again reuses the existing node
// instead of stacking another identical line on top of it.

function roundCoord(value) {
  return Math.round(Number(value) * 10) / 10;
}

function linkKey(from, to, color, thickness, opacity) {
  return JSON.stringify({
    fx: roundCoord(from.x),
    fy: roundCoord(from.y),
    tx: roundCoord(to.x),
    ty: roundCoord(to.y),
    color,
    thickness,
    opacity,
  });
}

function nodeIsAlive(node) {
  if (!node) return false;
  if (typeof node.exists === "function") return node.exists();
  return true;
}

export default function drawLink(k, parent, from, to, color, thickness = 8, opacity = 0.6) {
  const key = linkKey(from, to, color, thickness, opacity);
  if (!parent.__pandaDrawLinkRegistry) parent.__pandaDrawLinkRegistry = new Map();

  const existing = parent.__pandaDrawLinkRegistry.get(key);
  if (nodeIsAlive(existing)) return existing;
  if (existing) parent.__pandaDrawLinkRegistry.delete(key);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const node = parent.add([
    k.pos(from.x, from.y),
    k.rotate(angleDeg),
    k.rect(len, thickness),
    k.color(...color),
    k.opacity(opacity),
    k.anchor("left"),
  ]);

  parent.__pandaDrawLinkRegistry.set(key, node);
  return node;
}
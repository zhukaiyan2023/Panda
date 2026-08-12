// components/drawLink.js — shared line-segment primitive.
//
// Kaplay has no k.line in this build, so an arrow / link is drawn as a
// rectangle rotated to align with its endpoints. L1 uses this for the merge-V
// from the anchor's first two addends down to the preview's merge box; L4
// uses it for the decomposition arrows that show the tens-and-ones split.
//
// The line is added to `parent` so it inherits its destroy() chain — roundScene
// clears `arrowsRoot` between rounds and the cleanup cascades through whatever
// owns these links.

export default function drawLink(k, parent, from, to, color, thickness = 8, opacity = 0.6) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  // atan2 returns radians; Kaplay's k.rotate takes degrees (CCW positive).
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  return parent.add([
    k.pos(from.x, from.y),
    k.rotate(angleDeg),
    k.rect(len, thickness),
    k.color(...color),
    k.opacity(opacity),
    k.anchor("left"),
  ]);
}

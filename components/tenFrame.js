// components/tenFrame.js — 2x5 ten-frame number representation.
//
// Renders a 2-row by 5-column grid of rounded squares. Filled squares represent
// the units count (cap at 10 for display; for numbers > 10 the caller passes
// `value % 10` to render the ones place, while the tens place can be drawn
// separately as a "1" tile).
//
// The returned object exposes setValue(n), so a scene that grows the count as
// the child works through a round reuses one frame. Calling tenFrame() again
// used to draw a second grid directly on top of the first.
//
// Usage:
//   const frame = tenFrame(parent, value, { x, y, rows = 2, cell = 64, gap = 8 });
//   frame.setValue(10);
//
//   parent: any Kaplay GameObj (typically the scene root) that supports add().
//   value:  number of filled cells (0..10). Values > 10 are clamped.
//   x, y:   center anchor of the grid in scene coordinates.
//   rows:   1 (top row only, for L1) or 2 (full frame, default).
//   cell:   size of each square in px. Defaults to 64.
//   gap:    spacing between cells. Defaults to 8.
//   dot:    counter sprite for filled cells — "blue" | "yellow" | "pink" |
//           "purple" | "orange". Defaults to "orange".
//
// Rendering: each cell is an illustrated hollow slot (the `cell-frame` sprite)
// with a glossy counter (`dot-*`) shown inside when filled. The frame stays a
// grid of independent cells rather than one baked image because the whole point
// is that cells fill one at a time as the child counts.
//
// If the art fails to load, the cells fall back to the original rounded-rect
// drawing so the arithmetic still works — art is decoration, not function.

import { INK, CELL_FILL, CELL_FILL_HI, CELL_EMPTY, FONT } from "./theme.js?v=20260812";

const DOT_SPRITE = {
  blue: "dot-blue",
  yellow: "dot-yellow",
  pink: "dot-pink",
  purple: "dot-purple",
  orange: "dot-orange",
};

export default function tenFrame(parent, value, opts = {}) {
  const k = window.kaplay;
  const rows = Math.max(1, Math.min(2, opts.rows ?? 2));
  const cell = opts.cell ?? 64;
  const gap = opts.gap ?? 8;
  const cols = 5;
  const showLabel = opts.showLabel ?? true;
  const dotSprite = DOT_SPRITE[opts.dot] ?? DOT_SPRITE.orange;

  const hasArt = Boolean(k.getSprite("cell-frame") && k.getSprite(dotSprite));

  const clamp = (n) => Math.max(0, Math.min(rows * cols, n | 0));
  let fillCount = clamp(value);

  const totalW = cols * cell + (cols - 1) * gap;
  const totalH = rows * cell + (rows - 1) * gap;
  const startX = opts.x - totalW / 2 + cell / 2;
  const startY = opts.y - totalH / 2 + cell / 2;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = startX + c * (cell + gap);
      const cy = startY + r * (cell + gap);

      if (hasArt) {
        root.add([
          k.sprite("cell-frame", { width: cell, height: cell }),
          k.pos(cx, cy),
          k.anchor("center"),
        ]);
        // The counter sits inside the slot and is simply hidden while empty,
        // so filling a cell is an opacity flip rather than a rebuild.
        const dot = root.add([
          k.sprite(dotSprite, { width: cell * 0.72, height: cell * 0.72 }),
          k.pos(cx, cy),
          k.anchor("center"),
          k.opacity(0),
          k.z((opts.z ?? 0) + 1),
        ]);
        cells.push({ dot });
        continue;
      }

      const box = root.add([
        k.rect(cell, cell, { radius: 12 }),
        k.color(...CELL_EMPTY),
        k.outline(3, k.rgb(...INK)),
        k.pos(cx, cy),
        k.anchor("center"),
      ]);
      // A soft highlight in the upper-left keeps filled cells from reading as
      // flat blocks of color. It is hidden while the cell is empty.
      const highlight = root.add([
        k.rect(cell * 0.38, cell * 0.22, { radius: cell * 0.11 }),
        k.color(...CELL_FILL_HI),
        k.pos(cx - cell * 0.16, cy - cell * 0.24),
        k.anchor("center"),
        k.opacity(0),
        k.z((opts.z ?? 0) + 1),
      ]);
      cells.push({ box, highlight });
    }
  }

  const label = root.add([
    k.text("", { size: Math.round(cell * 0.55), font: FONT }),
    k.color(...INK),
    k.pos(opts.x, opts.y + totalH / 2 + cell * 0.6),
    k.anchor("center"),
  ]);

  function render() {
    cells.forEach(({ box, highlight, dot }, i) => {
      const filled = i < fillCount;
      if (dot) {
        dot.opacity = filled ? 1 : 0;
        return;
      }
      box.color = k.rgb(...(filled ? CELL_FILL : CELL_EMPTY));
      highlight.opacity = filled ? 1 : 0;
    });
    label.text = showLabel && fillCount > 0 ? String(fillCount) : "";
  }

  render();

  root.setValue = (n) => {
    fillCount = clamp(n);
    render();
  };

  return root;
}

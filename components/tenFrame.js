// components/tenFrame.js — 2x5 ten-frame number representation.
//
// Renders a 2-row by 5-column grid of rounded squares. Filled squares represent
// the units count (cap at 10 for display; for numbers > 10 the caller passes
// `value % 10` to render the ones place, while the tens place can be drawn
// separately as a "1" tile).
//
// Usage:
//   tenFrame(parent, value, { x, y, rows = 2, cell = 64, gap = 8 });
//
//   parent: any Kaplay GameObj that supports add([...]).
//   value:  number of filled cells (0..10). Values > 10 are clamped.
//   x, y:   center anchor of the grid in scene coordinates.
//   rows:   1 (top row only, for L1) or 2 (full frame, default).
//   cell:   size of each square in px. Defaults to 64.
//   gap:    spacing between cells. Defaults to 8.

const FILL = [255, 138, 61];    // --c-orange
const EMPTY = [240, 237, 230];  // --c-frame-empty
const STROKE = [61, 54, 82];    // --c-ink

function makeCell(parent, value, opts) {
  const k = window.kaplay;
  const filled = value > 0;
  const rect = parent.add([
    k.rect(opts.cell, opts.cell, { radius: 12 }),
    k.color(...(filled ? FILL : EMPTY)),
    k.pos(0, 0),
    k.outline(3, k.rgb(...STROKE)),
    k.anchor("center"),
  ]);
  if (filled && opts.showLabel) {
    rect.add([
      k.text(String(value), { size: Math.round(opts.cell * 0.32), font: "monospace" }),
      k.color(...STROKE),
      k.anchor("center"),
    ]);
  }
  return rect;
}

export default function tenFrame(parent, value, opts = {}) {
  const k = window.kaplay;
  const rows = Math.max(1, Math.min(2, opts.rows ?? 2));
  const cell = opts.cell ?? 64;
  const gap = opts.gap ?? 8;
  const cols = 5;
  const fillCount = Math.max(0, Math.min(10, value | 0));
  const showLabel = opts.showLabel ?? true;

  const totalW = cols * cell + (cols - 1) * gap;
  const totalH = rows * cell + (rows - 1) * gap;

  const cx = opts.x - totalW / 2 + cell / 2;
  const cy = opts.y - totalH / 2 + cell / 2;

  const grid = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  let placed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isFilled = placed < fillCount;
      const cellObj = makeCell(grid, isFilled ? 1 : 0, { cell, showLabel: false });
      cellObj.pos.x = cx + c * (cell + gap) - (opts.x);
      cellObj.pos.y = cy + r * (cell + gap) - (opts.y);
      placed++;
    }
  }

  if (showLabel && value > 0) {
    grid.add([
      k.text(String(value), { size: Math.round(cell * 0.55) }),
      k.color(...STROKE),
      k.pos(0, totalH / 2 + cell * 0.7),
      k.anchor("center"),
    ]);
  }

  return grid;
}
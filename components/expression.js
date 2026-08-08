// components/expression.js — render "a + ? = b" (or "a + b = ?") math expression.
//
// Replaces the old English prompt "How many does 8 need to make 10?".
// Renders three text nodes around a "?" placeholder that lives between the
// operator and the equals sign. The placeholder color is muted; the static
// numerals use the ink color at large weight for iPad legibility.

const INK = [61, 54, 82];
const MUTED = [180, 170, 200];

function makeToken(parent, k, text, opts) {
  return parent.add([
    k.text(text, {
      size: opts.size,
      font: "monospace",
      align: "center",
    }),
    k.color(...(opts.muted ? MUTED : INK)),
    k.anchor("center"),
  ]);
}

export default function expression(parent, opts = {}) {
  const k = window.kaplay;
  const a = opts.a;
  const b = opts.b;
  const missing = opts.missing ?? "?"; // the unknown side
  const x = opts.x;
  const y = opts.y;
  const size = opts.size ?? 96;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0)]);

  const gap = size * 1.1;
  const tokens = [
    { text: String(a), muted: false },
    { text: "+",       muted: false },
    { text: String(missing), muted: true },
    { text: "=",       muted: false },
    { text: String(b), muted: false },
  ];
  const totalWidth = (tokens.length - 1) * gap;
  const startX = x - totalWidth / 2;

  tokens.forEach((tok, i) => {
    const node = makeToken(root, k, tok.text, { size, muted: tok.muted });
    node.pos.x = startX + i * gap;
    node.pos.y = y;
  });

  return root;
}
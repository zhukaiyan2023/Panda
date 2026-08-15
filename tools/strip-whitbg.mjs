#!/usr/bin/env node
// tools/strip-whitbg.mjs — convert minimax-image's white-background
// JPEG/PNG outputs into RGBA PNGs with white pixels set to alpha 0.
//
// White moodboard style art (round cheeks, beige wood, peach ring) is
// identical to the cream PAPER canvas tone — leaving the background
// as opaque white obscures the canvas. We post-process each regenerated
// sprite to make the JPEG's white plate transparent so the sprite
// composites cleanly onto the scene backdrop.

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const ART_DIR = new URL("../assets/art/", import.meta.url).pathname;

// Whitelist: which sprites to process. The non-image assets (svg) and
// the legacy mole-1..6 / bg-meadow PNGs (which already have alpha or
// were built by an earlier pipeline) are left alone.
const TARGETS = [
  "whack-mole-popup.png",
  "whack-hole-clean.png",
  "whack-plaque.png",
  "whack-stopwatch.png",
  "whack-starbar.png",
  "whack-hint-sign.png",
  "whack-hammer.png",
  "whack-bg-meadow.png",
];

// Pixels with all three channels above this threshold AND roughly
// balanced (max-min < 8) are considered white → set alpha 0.
const WHITE_THRESHOLD = 248;
const WHITE_BALANCE = 8;

function isWhite(r, g, b) {
  if (r < WHITE_THRESHOLD || g < WHITE_THRESHOLD || b < WHITE_THRESHOLD) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < WHITE_BALANCE;
}

function stripWhite(srcPath) {
  const buf = fs.readFileSync(srcPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  let cleared = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isWhite(r, g, b)) {
      data[i + 3] = 0;
      cleared += 1;
    }
  }
  const out = PNG.sync.write(png);
  fs.writeFileSync(srcPath, out);
  const pct = (cleared / (width * height) * 100).toFixed(1);
  console.log(`  ${path.basename(srcPath)}: ${width}x${height}, ${cleared}px cleared (${pct}%)`);
}

console.log(`stripping white backgrounds in ${ART_DIR}`);
for (const name of TARGETS) {
  const full = path.join(ART_DIR, name);
  if (!fs.existsSync(full)) {
    console.log(`  ${name}: missing, skip`);
    continue;
  }
  stripWhite(full);
}
console.log("done");

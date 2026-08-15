// tools/verify-mole-assets.mjs — verify all 54 baked mole+number PNGs exist
// and are non-trivial. Run: node tools/verify-mole-assets.mjs

import { readFile, stat } from "node:fs/promises";
import { ALL_SPRITE_NAMES } from "../data/whackPack.js";

const ASSET_DIR = "assets/art";
const MIN_BYTES = 5 * 1024; // 5 KB — anything smaller is a placeholder

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL ${m}`); };
const ok   = (m) => console.log(`  ok   ${m}`);

async function pngDimensions(buf) {
  // PNG signature: 8 bytes, then IHDR chunk (4 length + 4 type + 13 data)
  // Width is at offset 16, height at offset 20, both big-endian uint32.
  if (buf.length < 24) return null;
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

console.log("Asset existence:");
if (ALL_SPRITE_NAMES.length !== 54) fail(`ALL_SPRITE_NAMES length is ${ALL_SPRITE_NAMES.length}, expected 54`);
else ok(`ALL_SPRITE_NAMES has 54 entries`);

for (const name of ALL_SPRITE_NAMES) {
  const path = `${ASSET_DIR}/${name}.png`;
  let st;
  try {
    st = await stat(path);
  } catch (_) {
    fail(`missing: ${path}`);
    continue;
  }
  if (st.size < MIN_BYTES) fail(`too small: ${path} (${st.size} bytes)`);
}

console.log("\nAsset dimensions:");
for (const name of ALL_SPRITE_NAMES) {
  const path = `${ASSET_DIR}/${name}.png`;
  let buf;
  try {
    buf = await readFile(path);
  } catch (_) {
    continue; // already reported above
  }
  const dim = await pngDimensions(buf);
  if (!dim) { fail(`not a valid PNG: ${path}`); continue; }
  if (dim.w < 400 || dim.w > 1024 || dim.h < 400 || dim.h > 1024) {
    fail(`out of range: ${path} ${dim.w}×${dim.h}`);
  }
}

console.log("");
if (failures.length === 0) {
  console.log("All 54 mole+number assets PASS.");
  process.exit(0);
} else {
  console.error(`${failures.length} failures.`);
  process.exit(1);
}

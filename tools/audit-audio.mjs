#!/usr/bin/env node
// tools/audit-audio.mjs — find every CUE_IDS entry that's missing
// from assets/audio/. Run before regenerating audio so we only
// synthesize what's actually missing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const mainSrc = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const m = mainSrc.match(/const CUE_IDS = \[([\s\S]*?)\];/);
if (!m) {
  console.error("CUE_IDS block not found in main.js");
  process.exit(1);
}
const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const uniqueIds = [...new Set(ids)];

const audioDir = path.join(ROOT, "assets", "audio");
const files = new Set(
  fs.readdirSync(audioDir).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(/\.mp3$/, "")),
);

const missing = uniqueIds.filter((id) => !files.has(id));
const orphan = [...files].filter((f) => !uniqueIds.includes(f));

console.log(`[audit-audio] CUE_IDS unique: ${uniqueIds.length}`);
console.log(`[audit-audio] mp3 files on disk: ${files.size}`);
console.log(`[audit-audio] registered but MISSING from disk: ${missing.length}`);
if (missing.length) {
  for (const id of missing) console.log(`  MISSING  ${id}`);
}
console.log(`[audit-audio] on-disk but NOT in CUE_IDS (orphans): ${orphan.length}`);
if (orphan.length) {
  for (const f of orphan.slice(0, 20)) console.log(`  ORPHAN   ${f}.mp3`);
  if (orphan.length > 20) console.log(`  ... and ${orphan.length - 20} more`);
}
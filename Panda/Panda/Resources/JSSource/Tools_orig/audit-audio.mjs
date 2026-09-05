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

// ---- Voice-contamination scan ----------------------------------------------
//
// 2026-08-12 incident: 74 L2 cues (every (a,b,c) with a ∈ {5,6,7}) had been
// regenerated via MiniMax (`lovely_girl`) instead of Tencent 智童 101016. The
// user rejected 12 MiniMax voices; these files slipped through. They look
// structurally like mp3s but read in the wrong voice and at a slower pace
// (intro cues: 12.6s vs expected 7.6s; rwd cues: 4.2s vs expected 2.6s). The
// MiniMax producer signs every file with an ID3v2.4 TXXX/AIGC frame containing
// `"ContentProducer":"MiniMax"` — the cheapest reliable marker. Tencent output
// has no ID3 frame at all (starts directly with `fff3 48c4`), so any ID3v2
// header is suspicious.
//
// Scan the first 4 KB of every mp3 for that signature. If anything matches,
// the build script's voice pick drifted back to MiniMax and the drift needs
// to be reverted — `npm run audio:build -- --only=<ids>` after restoring the
// TENCENT_* env, or `node tools/build-audio-minimax.mjs` should NEVER be run
// against the audio/ dir (it's an experiment, not a release channel).
const contaminated = [];
for (const f of files) {
  const p = path.join(audioDir, `${f}.mp3`);
  const fd = fs.openSync(p, "r");
  const buf = Buffer.alloc(4096);
  fs.readSync(fd, buf, 0, 4096, 0);
  fs.closeSync(fd);
  // ID3v2.4 header: "ID3" + 0x04. (Earlier major versions would be 0x02/0x03.)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33 && buf[3] === 0x04) {
    if (buf.toString("utf8", 0, 4096).includes("MiniMax")) {
      contaminated.push(`${f}.mp3`);
    }
  }
}
console.log(`[audit-audio] MiniMax-contaminated: ${contaminated.length}`);
if (contaminated.length) {
  for (const f of contaminated.slice(0, 30)) console.log(`  MINIMAX  ${f}`);
  if (contaminated.length > 30) console.log(`  ... and ${contaminated.length - 30} more`);
  process.exitCode = 1;
}
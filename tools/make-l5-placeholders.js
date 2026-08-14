// tools/make-l5-placeholders.js
// Generates 1-second silent MP3 placeholders for all 153 l5-* audio cues.
// Mirrors tools/make-placeholders.js's silence pattern. Used when the
// full TTS generation (Tencent) can't run (no credentials, quota, etc.) —
// the game still boots and the cues load; kid hears silence for those
// steps but the math interaction is unaffected.
//
// Run: node tools/make-l5-placeholders.js
// Output: assets/audio/l5-*.mp3 (153 files)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { poolGens } from "../data/pools.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "assets", "audio");

mkdirSync(OUT, { recursive: true });

const ids = new Set();
for (const r of poolGens[5]()) {
  ids.add(`l5-s1-${r.a}-${r.b}`);
  ids.add(`l5-s2-${r.a}-${r.b}`);
  ids.add(`l5-s3-${r.onesA}-${r.onesB}`);
  ids.add(`l5-s4`);
  ids.add(`l5-s5-${r.sum}`);
  ids.add(`l5-rwd-${r.a}-${r.b}-${r.answer}`);
}

function makeSilentMp3(frameCount = 26) {
  const frameBody = Buffer.alloc(104, 0);
  const header = Buffer.from([0xff, 0xfb, 0x10, 0x64]);
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(header, frameBody);
  }
  const id3 = Buffer.from("TAGG" + "l5 silent placeholder".padEnd(30, " ") + "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
  return Buffer.concat([...frames, id3]);
}

let written = 0;
for (const id of ids) {
  const file = join(OUT, `${id}.mp3`);
  writeFileSync(file, makeSilentMp3());
  written++;
}

console.log(`Wrote ${written} l5-* placeholder MP3s to ${OUT}`);

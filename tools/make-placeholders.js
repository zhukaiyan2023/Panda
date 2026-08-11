// tools/make-placeholders.js
// Generates 1-second silent MP3 placeholders for all 31 audio cues.
// Uses a hand-crafted minimal MP3 frame (MPEG-1 Layer 3, 32 kbps, 44.1 kHz, mono,
// 26 frames per second of audio = ~26 frames for ~1s). Frames are padded to
// produce the requested duration when decoded by browsers.
//
// This file is invoked only during development / CI; production audio is
// produced by tools/build-audio.js using Azure Speech F0.

const fs = require("fs");
const path = require("path");

const CUE_IDS = [
  // 2026-08-10 process-praise tier rewrite: the old 5 enc-* + panda-celebrate
  // placeholders are replaced by 6 representative cues from the new 32-cue
  // system. The actual runtime list lives in main.js CUE_IDS (1098 entries
  // including per-round composites) — this file generates a small sampling
  // of silent placeholders for offline dev only.
  "enc-first-1", "enc-streak3-1", "enc-streak5-1", "enc-streak10-1", "enc-wrong-1", "panda-praise-1",
  "n-0", "n-1", "n-2", "n-3", "n-4", "n-5", "n-6", "n-7", "n-8", "n-9", "n-10",
  "q-what-is", "q-plus", "q-equals", "equals",
  // 2026-08-10: removed lvl-1-greeting (L1 entry) and lvl-3-intro
  // (L3 entry) — both were vague topic-statement intros with no
  // instruction for what the kid should do. Per-round step audio is
  // now the entry guidance.
  "lvl-1-decomp-pre", "lvl-1-decomp-eq",
  "l1-sub-find-ten",
  "lvl-2-step-1-pre", "lvl-2-step-1-eq", "lvl-2-step-1-or", "lvl-2-step-1-q",
  "lvl-2-step-2-big-pre", "lvl-2-step-2-find", "lvl-2-step-2-friend-pre", "lvl-2-step-2-q",
  "lvl-2-step-3-split-pre", "lvl-2-step-3-friend-pre", "lvl-2-step-3-then", "lvl-2-step-3-can-split", "lvl-2-step-3-q",
  "lvl-2-step-4-split", "lvl-2-step-4-calc",
  "lvl-3-step-1-pre", "lvl-3-step-1-q",
  "lvl-done",
  "daily-done",
  "boat-intro", "boat-pair", "boat-done",
  "cloud-intro", "cloud-pair", "cloud-done",
  "bounce-intro", "bounce-pop", "bounce-done",
  "whack-intro", "whack-start", "whack-tick", "whack-timeup", "whack-done",
  "feed-intro", "feed-nom", "feed-next", "feed-done",
];

const outDir = path.resolve(__dirname, "..", "assets", "audio");
fs.mkdirSync(outDir, { recursive: true });

// One MPEG-1 Layer 3 frame, 32 kbps, 44.1 kHz, mono = 104 bytes payload + 4-byte header.
// 26 frames ≈ 1.0 s of audio. All-zero frame body = digital silence.
function makeSilentMp3(frameCount = 26) {
  const frameBody = Buffer.alloc(104, 0);
  const header = Buffer.from([0xff, 0xfb, 0x10, 0x64]); // MPEG1 L3 32kbps 44.1kHz mono
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(header, frameBody);
  }
  // Append an ID3v1 tag so the file has a stable length and isn't truncated by tools.
  const id3 = Buffer.from("TAGG" + "silent placeholder".padEnd(30, " ") + "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
  return Buffer.concat([...frames, id3]);
}

for (const id of CUE_IDS) {
  const file = path.join(outDir, `${id}.mp3`);
  fs.writeFileSync(file, makeSilentMp3());
  process.stdout.write(`wrote ${path.relative(process.cwd(), file)}\n`);
}

console.log(`Generated ${CUE_IDS.length} silent MP3 placeholders in ${outDir}`);
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
  "enc-great", "enc-awesome", "enc-amazing", "enc-nice", "enc-try",
  "n-1", "n-2", "n-3", "n-4", "n-5", "n-6", "n-7", "n-8", "n-9", "n-10",
  "round-start", "round-end",
  "lvl-1-intro", "lvl-2-intro", "lvl-3-intro", "lvl-done",
  "panda-hi", "panda-celebrate",
  "tap-unlock",
  "level-locked",
  "next",
  "back",
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
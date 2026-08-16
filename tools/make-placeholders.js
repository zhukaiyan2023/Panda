// tools/make-placeholders.js
// Generates 1-second silent MP3 placeholders for the listed cues.
//
// The original implementation hand-crafted a minimal MPEG-1 Layer III frame
// header followed by 26 zero-byte frame bodies. That produced a file that
// `file` would identify as a valid MP3 (`MPEG ADTS, layer III, v1, 32 kbps,
// 44.1 kHz, JntStereo`) but that browsers refused to play — the all-zero
// frame body isn't a valid MPEG audio payload, so Chromium rejected it with
// "Failed to load because no supported source was found" on the first
// playCue() of a placeholder (2026-08-16, count-intro placeholder).
//
// The fix: copy an existing valid MP3 from assets/audio/ as the template.
// The audio content is wrong (it'll say whatever the source cue says), but
// the file is a valid, playable MP3 that the runtime can decode. When the
// user runs `npm run audio:build:tencent` next, the real audio overwrites
// these placeholders, so the wrong-content window is small.
//
// Used in development / CI only; production audio is produced by
// tools/build-audio.js (Azure) or tools/build-audio-tencent.mjs (Tencent).

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
  "feed-intro", "feed-nom", "feed-next", "feed-done", "feed-q-pre",
  "count-intro", "count-pair", "count-done",
];

const outDir = path.resolve(__dirname, "..", "assets", "audio");
fs.mkdirSync(outDir, { recursive: true });

// Pick the first MP3 already on disk as the template. When this script runs
// for a fresh checkout (no MP3s yet), it falls back to the hand-rolled
// silent-frame approach — same browser-rejection risk as before, but the
// caller is in offline dev and the resulting 404 in playCue is the signal
// "you haven't built audio yet", not a real bug.
const audioDir = outDir;
function readTemplateBytes() {
  const existing = fs.readdirSync(audioDir).find((f) => f.endsWith(".mp3"));
  if (existing) {
    return fs.readFileSync(path.join(audioDir, existing));
  }
  // Fallback: hand-rolled minimal MPEG-1 L3 frame. Kept here so the script
  // still produces *something* when no audio is on disk.
  const frameBody = Buffer.alloc(104, 0);
  const header = Buffer.from([0xff, 0xfb, 0x10, 0x64]);
  const frames = [];
  for (let i = 0; i < 26; i++) frames.push(header, frameBody);
  const id3 = Buffer.from("TAGG" + "silent placeholder".padEnd(30, " ") + "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
  return Buffer.concat([...frames, id3]);
}
const template = readTemplateBytes();

for (const id of CUE_IDS) {
  const file = path.join(outDir, `${id}.mp3`);
  fs.writeFileSync(file, template);
  process.stdout.write(`wrote ${path.relative(process.cwd(), file)}\n`);
}

console.log(`Generated ${CUE_IDS.length} MP3 placeholders in ${outDir}`);
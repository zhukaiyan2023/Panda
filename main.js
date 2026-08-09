// main.js — Panda H5 (Kaplay) boot + audio pool + iPad viewport plumbing.
// No build step. Loads scenes and components from ./scenes and ./components.
//
// levels data is inlined as a JS const (not fetched, not JSON-imported) so
// the game boots under the file:// protocol on iPad Safari, where fetch()
// is blocked and JSON module imports require the assert { type: "json" }
// attribute that older WebKit builds do not honor. data/levels.json stays
// in the repo as a single source of truth for offline editing.

import kaplay from "./assets/vendor/kaplay.mjs";
import "./save.js";

const levelsData = {
  "levels": [
    {
      "id": 1,
      "title": "Three Friends",
      "rounds": [
        { "kind": "three-sum", "nums": [2, 3, 4], "answer": 9 },
        { "kind": "three-sum", "nums": [1, 5, 3], "answer": 9 },
        { "kind": "three-ten",  "nums": [3, 7, 2], "answer": 12 },
        { "kind": "three-sum", "nums": [4, 2, 1], "answer": 7 },
        { "kind": "three-ten",  "nums": [6, 4, 5], "answer": 15 },
        { "kind": "three-sum", "nums": [2, 2, 3], "answer": 7 }
      ]
    },
    {
      "id": 2,
      "title": "Make a Ten",
      "intro": "lvl-2-intro",
      "rounds": [
        { "kind": "make-ten", "a": 8, "b": 5, "need": 2, "rest": 3, "answer": 13 },
        { "kind": "make-ten", "a": 7, "b": 6, "need": 3, "rest": 3, "answer": 13 },
        { "kind": "make-ten", "a": 9, "b": 4, "need": 1, "rest": 3, "answer": 13 },
        { "kind": "make-ten", "a": 7, "b": 6, "need": 3, "rest": 3, "answer": 13 },
        { "kind": "make-ten", "a": 8, "b": 6, "need": 2, "rest": 4, "answer": 14 },
        { "kind": "make-ten", "a": 9, "b": 7, "need": 1, "rest": 6, "answer": 16 }
      ]
    },
    {
      "id": 3,
      "title": "Up to 20",
      "intro": "lvl-3-intro",
      "rounds": [
        { "a": 9,  "b": 8, "answer": 17, "missing": 8 },
        { "a": 11, "b": 4, "answer": 15, "missing": 4 },
        { "a": 12, "b": 5, "answer": 17, "missing": 5 },
        { "a": 13, "b": 6, "answer": 19, "missing": 6 },
        { "a": 14, "b": 4, "answer": 18, "missing": 4 },
        { "a": 15, "b": 5, "answer": 20, "missing": 5 }
      ]
    }
  ]
};

const CUE_IDS = [
  "step-1", "step-2", "step-3", "step-4",
  "lvl1-step-1", "lvl1-step-2",
  "enc-great", "enc-awesome", "enc-amazing", "enc-nice", "enc-try",
  "n-0", "n-1", "n-2", "n-3", "n-4", "n-5", "n-6", "n-7", "n-8", "n-9", "n-10",
  // spoken equation intro — chained by PandaAudio.playSequence so the child
  // hears "几加三加五" instead of just "算一算". The Mandarin chain reads
  // naturally: "what is three plus five?" in three concatenated words.
  "q-what-is", "q-plus", "q-equals",
  "round-start", "round-end",
  // L1 entry — greeting plays once on entering the level, then the
  // per-round "decompose" sentence is built at runtime by chaining
  // these number-agnostic chunks with the universal n-* / q-* cues.
  "lvl-1-greeting",
  "lvl-1-decomp-pre", "lvl-1-decomp-eq", "lvl-1-decomp-after-b", "lvl-1-decomp-q-pre",
  "lvl-2-intro", "lvl-3-intro", "lvl-done",
  "panda-hi", "panda-celebrate",
  "tap-unlock", "level-locked", "next", "back",
  "boat-intro", "boat-pair", "boat-done",
  "cloud-intro", "cloud-pair", "cloud-done",
  "bounce-intro", "bounce-pop", "bounce-done",
  "whack-intro", "whack-start", "whack-tick", "whack-timeup", "whack-done",
  "feed-intro", "feed-nom", "feed-next", "feed-done",
];

const audio = {};
for (const id of CUE_IDS) {
  // MP3 from Edge TTS (see tools/build-audio-edge.mjs). Safari on iPad
  // and Chromium on desktop both handle MP3 in <audio> natively.
  const el = new Audio(`assets/audio/${id}.mp3`);
  el.preload = "auto";
  el.dataset.cue = id;
  audio[id] = el;
}

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  for (const el of Object.values(audio)) {
    const wasMuted = el.muted;
    el.muted = true;
    const p = el.play();
    const restore = () => {
      el.pause();
      el.currentTime = 0;
      el.muted = wasMuted;
    };
    if (p && typeof p.then === "function") {
      p.then(restore).catch(() => { el.muted = wasMuted; });
    } else {
      restore();
    }
  }
  audioUnlocked = true;
}

function playCue(id) {
  const el = audio[id];
  if (!el) return;
  try {
    el.muted = false;
    el.volume = 1;
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

// Every scheduled cue (from playSequence, playAfter, or anywhere that uses
// scheduleCue) is tracked here so a correct pick can cancel all of them
// at once. Without this, a child who answers mid-sentence would hear the
// remaining words of the L1 decompose overlap with the encouragement +
// the next step's audio prompt — a wall of sound.
const pendingCueTimers = new Set();
function scheduleCue(id, delayMs) {
  const tid = setTimeout(() => {
    pendingCueTimers.delete(tid);
    playCue(id);
  }, delayMs);
  pendingCueTimers.add(tid);
  return tid;
}

// Cancels all queued cues and pauses every currently-playing audio
// element. Used when a child answers correctly so the rest of the spoken
// sentence doesn't fight with the encouragement + the next-step prompt.
function stopAllAudio() {
  pendingCueTimers.forEach((tid) => clearTimeout(tid));
  pendingCueTimers.clear();
  for (const el of Object.values(audio)) {
    if (!el.paused) {
      try { el.pause(); } catch (_) {}
    }
  }
}

// Plays a series of cue ids back-to-back with a small gap so each word is
// distinct. Used for "what is two plus three plus four" — chained from the
// individual number cues and a couple of glue words ("what is", "plus").
// The verifier bypasses audio entirely so sequence length is fine in tests.
//
// Each cue is scheduled to start AFTER the previous cue's actual duration
// (audio.duration) plus a small gap. The earlier implementation used a
// fixed 140ms "tail" that assumed every cue was ~1 word; the L1
// decompose sentence includes a 5s chunk ("等于几，这个问题可以分解成
// 我们先看看前两个数相加") and the fixed tail caused the next number
// cue to fire mid-chunk — overlapping by 4+ seconds.
//
// startDelayMs (optional) lets the caller wait for a previous cue to
// finish before starting this sequence. Prefer playAfter() for that — it
// uses the audio's 'ended' event so the timing stays correct even when
// the reference cue's duration isn't known yet.
//
// seqGapMs (default 90) is the gap between consecutive cues in the
// sequence. Pass a larger value for more breathing room between words.
function playSequence(ids, seqGapMs = 90, startDelayMs = 0) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  let delay = startDelayMs;
  ids.forEach((id) => {
    scheduleCue(id, delay);
    // Schedule the next cue to start when this one ends. If the audio's
    // duration isn't known yet (still loading) fall back to a short tail
    // so the sequence still flows — the next audio.loadedmetadata event
    // will be too late to fix this iteration but subsequent sequences
    // will use real durations. The fallback is intentionally small
    // (0.4s) to bias toward overlap on a cold start, which is still
    // better than a 5s+ overlap from a wrong guess.
    const el = audio[id];
    const dur = (el && Number.isFinite(el.duration) && el.duration > 0)
      ? el.duration
      : 0.4;
    delay += (dur * 1000) + seqGapMs;
  });
}

// Plays a sequence of cues after another cue's audio finishes, with a
// configurable gap. Uses the audio element's 'ended' event so the timing
// tracks reality (no race with audio.duration) — the L1 entry relies on
// this for the "greeting → 1s pause → decompose" transition.
//
// If the reference cue has already ended (e.g. we re-entered a scene
// after the cue already played), the sequence fires immediately so the
// caller doesn't have to special-case the "already-played" branch.
function playAfter(referenceId, ids, { gapMs = 1000, seqGapMs = 90 } = {}) {
  const ref = audio[referenceId];
  if (!ref) {
    // Reference cue doesn't exist — just play the sequence after a
    // generous fixed delay so the user still hears something.
    playSequence(ids, seqGapMs, 4000);
    return;
  }
  // After the reference cue's 'ended' event fires, kick off the
  // sequence with `gapMs` ms before the first cue lands; the rest are
  // chained by playSequence using the now-known audio.duration.
  const kickoff = () => playSequence(ids, seqGapMs, gapMs);
  if (ref.ended) {
    kickoff();
    return;
  }
  ref.addEventListener("ended", function onEnded() {
    ref.removeEventListener("ended", onEnded);
    kickoff();
  });
}

const k = kaplay({
  width: 1366,
  height: 1024,
  letterbox: true,
  touchToMouse: true,
  canvas: document.getElementById("game"),
  background: [255, 241, 220],
  crisp: true,
  global: false,
});

window.kaplay = k;
window.PandaAudio = { audio, unlockAudio, playCue, playSequence, playAfter, stopAllAudio, isUnlocked: () => audioUnlocked };

// Art assets are hand-authored SVG under assets/art/. Unlike the level data
// above, these are fetched over HTTP, so the game must be served (see README) —
// double-clicking index.html will start but render without art. Each load is
// guarded individually: a missing or malformed file should cost the game its
// decoration, not its arithmetic. Components check k.getSprite() before drawing.
const SPRITES = [
  "panda-idle", "panda-cheer", "panda-think",
  "bamboo", "leaf",
  "star", "lock",
  "badge-1", "badge-2", "badge-3",
  // panda-park migrated game props
  "boat", "cloud", "mole", "balloon", "bubble",
];

function loadArt() {
  return Promise.all(
    SPRITES.map((name) =>
      Promise.resolve(k.loadSprite(name, `assets/art/${name}.svg`)).catch((err) => {
        console.warn(`[panda] sprite "${name}" failed to load:`, err?.message || err);
        return null;
      }),
    ),
  );
}

function tryLockLandscape() {
  if (!screen.orientation || typeof screen.orientation.lock !== "function") return;
  screen.orientation.lock("landscape").catch(() => {});
}

function watchOrientation() {
  const hint = document.getElementById("rotate-hint");
  if (!hint) return;
  const portrait = () => window.matchMedia("(orientation: portrait)").matches;
  const apply = () => {
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    hint.hidden = !(isCoarse && portrait());
  };
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}

document.addEventListener("pointerdown", () => {
  unlockAudio();
  tryLockLandscape();
}, { passive: true, once: false });

watchOrientation();

(async () => {
  window.PandaLevels = levelsData;

  const [
    { default: levelPicker },
    { default: gamesPicker },
    { default: level1 },
    { default: level2 },
    { default: level3 },
    { default: gameBoat },
    { default: gameBounce },
    { default: gameCloud },
    { default: gameFeed },
    { default: gameWhack },
  ] = await Promise.all([
    import("./scenes/levelPicker.js"),
    import("./scenes/gamesPicker.js"),
    import("./scenes/level1.js"),
    import("./scenes/level2.js"),
    import("./scenes/level3.js"),
    import("./scenes/gameBoat.js"),
    import("./scenes/gameBounce.js"),
    import("./scenes/gameCloud.js"),
    import("./scenes/gameFeed.js"),
    import("./scenes/gameWhack.js"),
  ]);

  // Sprites must be resolved before the first scene runs: scenes decide at build
  // time whether a sprite exists, so loading them afterwards would leave the
  // opening screen permanently art-less.
  await loadArt();

  k.scene("levelPicker", () => levelPicker(k));
  k.scene("gamesPicker", () => gamesPicker(k));
  k.scene("level1", () => level1(k));
  k.scene("level2", () => level2(k));
  k.scene("level3", () => level3(k));
  k.scene("gameBoat",   () => gameBoat(k));
  k.scene("gameBounce", () => gameBounce(k));
  k.scene("gameCloud",  () => gameCloud(k));
  k.scene("gameFeed",   () => gameFeed(k));
  k.scene("gameWhack",  () => gameWhack(k));

  k.go("levelPicker");
})();
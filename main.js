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
      "intro": "lvl-1-intro",
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
        { "kind": "make-ten", "a": 6, "b": 7, "need": 4, "rest": 3, "answer": 13 },
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
  "n-1", "n-2", "n-3", "n-4", "n-5", "n-6", "n-7", "n-8", "n-9", "n-10",
  "round-start", "round-end",
  "lvl-1-intro", "lvl-2-intro", "lvl-3-intro", "lvl-done",
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
window.PandaAudio = { audio, unlockAudio, playCue, isUnlocked: () => audioUnlocked };

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
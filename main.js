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
      "title": "Numbers up to 5",
      "intro": "lvl-1-intro",
      "rounds": [
        { "a": 2, "b": 1, "answer": 3, "missing": 1 },
        { "a": 4, "b": 1, "answer": 5, "missing": 1 },
        { "a": 1, "b": 3, "answer": 4, "missing": 3 },
        { "a": 3, "b": 2, "answer": 5, "missing": 2 },
        { "a": 2, "b": 2, "answer": 4, "missing": 2 },
        { "a": 1, "b": 4, "answer": 5, "missing": 4 }
      ]
    },
    {
      "id": 2,
      "title": "Make a Ten",
      "intro": "lvl-2-intro",
      "rounds": [
        { "a": 8, "b": 5,  "need": 2, "rest": 3, "answer": 13 },
        { "a": 7, "b": 6,  "need": 3, "rest": 3, "answer": 13 },
        { "a": 9, "b": 4,  "need": 1, "rest": 3, "answer": 13 },
        { "a": 6, "b": 7,  "need": 4, "rest": 3, "answer": 13 },
        { "a": 8, "b": 6,  "need": 2, "rest": 4, "answer": 14 },
        { "a": 9, "b": 7,  "need": 1, "rest": 6, "answer": 16 }
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
  "enc-great", "enc-awesome", "enc-amazing", "enc-nice", "enc-try",
  "n-1", "n-2", "n-3", "n-4", "n-5", "n-6", "n-7", "n-8", "n-9", "n-10",
  "round-start", "round-end",
  "lvl-1-intro", "lvl-2-intro", "lvl-3-intro", "lvl-done",
  "panda-hi", "panda-celebrate",
  "tap-unlock", "level-locked", "next", "back",
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
    el.volume = 0;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => el.pause()).catch(() => {});
    }
  }
  audioUnlocked = true;
}

function playCue(id) {
  const el = audio[id];
  if (!el) return;
  try {
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
    { default: level1 },
    { default: level2 },
    { default: level3 },
  ] = await Promise.all([
    import("./scenes/levelPicker.js"),
    import("./scenes/level1.js"),
    import("./scenes/level2.js"),
    import("./scenes/level3.js"),
  ]);

  k.scene("levelPicker", () => levelPicker(k));
  k.scene("level1", () => level1(k));
  k.scene("level2", () => level2(k));
  k.scene("level3", () => level3(k));

  k.go("levelPicker");
})();
// main.js — Panda H5 (Kaplay) boot + audio pool + iPad viewport plumbing.
// No build step. Loads scenes and components from ./scenes and ./components.

import kaplay from "./assets/vendor/kaplay.mjs";
import "./save.js";

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
  let levelsData = null;
  try {
    const res = await fetch("data/levels.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    levelsData = await res.json();
  } catch (err) {
    console.error("[panda] failed to load levels.json:", err);
    levelsData = { levels: [] };
  }
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
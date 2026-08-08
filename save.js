// save.js — localStorage.panda-save-v1 persistence.
//
// Shape:
//   { currentLevel: 1..3, unlockedLevel: 1..3, starsByLevel: { 1: n, 2: n, 3: n } }
//
// Bad JSON or disabled storage falls back to an in-memory default so the game
// still plays.

const KEY = "panda-save-v1";

const DEFAULT = {
  currentLevel: 1,
  unlockedLevel: 1,
  starsByLevel: {},
};

let memFallback = null;

function hasStorage() {
  try {
    const probe = "__panda_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch (_) {
    return false;
  }
}

function load() {
  if (!hasStorage()) {
    return cloneSave(memFallback || DEFAULT);
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, starsByLevel: { ...DEFAULT.starsByLevel } };
    const parsed = JSON.parse(raw);
    return sanitize(parsed);
  } catch (_) {
    return cloneSave(memFallback || DEFAULT);
  }
}

function save(next) {
  const clean = sanitize(next);
  if (!hasStorage()) {
    memFallback = clean;
    return true;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(clean));
    return true;
  } catch (_) {
    memFallback = clean;
    return false;
  }
}

function sanitize(value) {
  if (!value || typeof value !== "object") {
    return cloneSave(DEFAULT);
  }
  const unlocked = clampInt(value.unlockedLevel, 1, 3, 1);
  const current = clampInt(value.currentLevel, 1, unlocked, 1);
  const stars = {};
  if (value.starsByLevel && typeof value.starsByLevel === "object") {
    for (let i = 1; i <= 3; i++) {
      stars[i] = clampInt(value.starsByLevel[i], 0, 999, 0);
    }
  }
  return { currentLevel: current, unlockedLevel: unlocked, starsByLevel: stars };
}

function cloneSave(value) {
  return {
    ...value,
    starsByLevel: { ...(value.starsByLevel || {}) },
  };
}

function clampInt(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  if (i < lo) return lo;
  if (i > hi) return hi;
  return i;
}

const api = { load, save, KEY, DEFAULT };

if (typeof window !== "undefined") {
  window.PandaSave = api;
}

export default api;
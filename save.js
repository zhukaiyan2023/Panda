import "./audio/serialGuard.js?v=20260815";

// save.js — localStorage.panda-save-v1 persistence.
//
// Shape:
//   {
//     currentLevel: 1..8,
//     unlockedLevel: 1..8,
//     starsByLevel: { 1: n, ..., 8: n },
//     unlockedGame: 1..5,           // panda-park games, parallel track
//     starsByGame:  { 1: n, 2: n, 3: n, 4: n, 5: n },
//   }
//
// The math and game tracks are independent: finishing all 3 math levels does
// not auto-unlock panda-park games, and vice versa. Each track has its own
// first-unlocked default so a brand-new install can play either.
//
// Bad JSON or disabled storage falls back to an in-memory default so the game
// still plays.

const KEY = "panda-save-v1";

// Per-level daily round caps. L1 caps at 6 (sum-≤-10 triples are
// fast and easy — 6/day avoids burnout). L2-L8 cap at 10 (the
// default sampleSize for those levels).
const DAILY_CAPS = { 1: 6, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10 };
// 24h rolling window — starts at the first finished round of the level's window, ends 24h later (lazy rollover on next read).
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const DEFAULT = {
  currentLevel: 1,
  unlockedLevel: 1,
  starsByLevel: {},
  unlockedGame: 1,
  starsByGame: {},
  // Per-level daily-round state. Empty by default — entries are
  // created lazily on first finished round of each level. Shape:
  //   { [levelId]: { count: 0..N, windowStartedAt: <ms> | null } }
  daily: {},
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
  // Keep the progression ceiling aligned with the highest configured level.
  // Older saves migrate naturally: missing L6-L8 progress starts at zero.
  const unlocked = clampInt(value.unlockedLevel, 1, 8, 1);
  const current = clampInt(value.currentLevel, 1, unlocked, 1);
  const stars = {};
  if (value.starsByLevel && typeof value.starsByLevel === "object") {
    for (let i = 1; i <= 8; i++) {
      stars[i] = clampInt(value.starsByLevel[i], 0, 999, 0);
    }
  }
  const unlockedGame = clampInt(value.unlockedGame, 1, 5, 1);
  const gameStars = {};
  if (value.starsByGame && typeof value.starsByGame === "object") {
    for (let i = 1; i <= 5; i++) {
      gameStars[i] = clampInt(value.starsByGame[i], 0, 999, 0);
    }
  }
  // Daily-cap state. Default-migrate older saves that lack the field.
  // Each per-level entry clamps count to [0, 999] and windowStartedAt
  // to a non-negative integer or null. Unknown level ids are dropped.
  const daily = {};
  if (value.daily && typeof value.daily === "object") {
    for (let i = 1; i <= 8; i++) {
      const entry = value.daily[i];
      if (!entry || typeof entry !== "object") continue;
      daily[i] = {
        count: clampInt(entry.count, 0, 999, 0),
        windowStartedAt: (() => {
          // null stays null; non-finite or negative falls back to null;
          // otherwise round to an integer ms timestamp. Number(null)
          // is 0 (finite, non-negative), so the null check must come
          // FIRST — otherwise the timestamp silently becomes 0.
          if (entry.windowStartedAt == null) return null;
          const t = Number(entry.windowStartedAt);
          if (!Number.isFinite(t) || t < 0) return null;
          return Math.round(t);
        })(),
      };
    }
  }
  return {
    currentLevel: current,
    unlockedLevel: unlocked,
    starsByLevel: stars,
    unlockedGame,
    starsByGame: gameStars,
    daily,
  };
}

function cloneSave(value) {
  return {
    ...value,
    starsByLevel: { ...(value.starsByLevel || {}) },
    starsByGame: { ...(value.starsByGame || {}) },
    daily: { ...(value.daily || {}) },
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

// Lazy 24h rollover. If the level's windowStartedAt is older than
// DAILY_WINDOW_MS, reset count to 0 and windowStartedAt to null,
// persist, and return the now-fresh state for that level. No-op
// when the entry doesn't exist or the window is still active.
// Returns the (possibly-reset) entry so the caller can read it
// without a second lookup.
function rolloverLevel(save, levelId) {
  const entry = save.daily[levelId];
  if (!entry) return null;
  if (entry.windowStartedAt == null) return entry;
  if (Date.now() - entry.windowStartedAt < DAILY_WINDOW_MS) return entry;
  // Window expired — reset.
  save.daily[levelId] = { count: 0, windowStartedAt: null };
  return save.daily[levelId];
}

// Pure read. True if the kid has hit today's cap for this level.
// Verifier skip: when window.__skipDailyCap is true, always false.
function isLevelDailyLocked(levelId) {
  if (window.__skipDailyCap) return false;
  const state = load();
  const cap = DAILY_CAPS[levelId];
  if (cap == null) return false;
  rolloverLevel(state, levelId);
  // Persist any reset that happened in rolloverLevel.
  save(state);
  const entry = state.daily[levelId];
  if (!entry) return false;
  return entry.count >= cap;
}

// Read-only snapshot. Used by the picker (now and in future features
// that want to display "今日 6/6" on a card). Runs lazy rollover.
function getDailyState(levelId) {
  const state = load();
  const cap = DAILY_CAPS[levelId] ?? 0;
  rolloverLevel(state, levelId);
  save(state);
  const entry = state.daily[levelId] || { count: 0, windowStartedAt: null };
  return {
    count: entry.count,
    cap,
    locked: window.__skipDailyCap ? false : entry.count >= cap,
    windowStartedAt: entry.windowStartedAt,
  };
}

// Writer. Called by roundScene.finishRound AFTER the celebration
// audio chain resolves and BEFORE the picker/dailyDone navigation.
// Stamps windowStartedAt on the first finished round of the
// window; increments count; returns the new state. The `locked`
// flag is the SOURCE OF TRUTH — callers branch on it, not on
// `count >= cap` themselves.
function markRoundFinished(levelId) {
  const cap = DAILY_CAPS[levelId] ?? 0;
  if (cap === 0) return { count: 0, cap: 0, locked: false };
  const state = load();
  rolloverLevel(state, levelId);
  let entry = state.daily[levelId];
  if (!entry) {
    entry = { count: 0, windowStartedAt: null };
    state.daily[levelId] = entry;
  }
  if (entry.windowStartedAt == null) {
    entry.windowStartedAt = Date.now();
  }
  entry.count = (entry.count || 0) + 1;
  save(state);
  return {
    count: entry.count,
    cap,
    locked: window.__skipDailyCap ? false : entry.count >= cap,
  };
}

const api = {
  load, save, KEY, DEFAULT,
  DAILY_CAPS, DAILY_WINDOW_MS,
  isLevelDailyLocked, markRoundFinished, getDailyState,
};

if (typeof window !== "undefined") {
  window.PandaSave = api;
}

export default api;

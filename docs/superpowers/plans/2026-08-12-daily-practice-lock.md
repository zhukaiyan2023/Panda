# Daily Practice Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-level daily round cap (L1=6, L2-L4=10) with a 24h rolling window that starts at the first finished round of each level. Daily-locked levels show a greyed card on the picker and play a friendly audio cue when tapped.

**Architecture:** All daily-cap state lives in `save.js` next to existing progression fields. The picker reads via a new `isLevelDailyLocked(levelId)` predicate. `roundScene.finishRound` calls a new `markRoundFinished(levelId)` writer, which returns a `{ locked }` flag used to branch into a new `dailyDone` scene when the cap is hit. A single new audio cue (`daily-done`) plays both on daily-locked card taps and on entry to `dailyDone`. Verifier scripts set `window.__skipDailyCap = true` so they can still run every round of every level.

**Tech Stack:** Plain JavaScript (no framework), Kaplay for the new scene, Playwright for save-layer integration tests.

## Global Constraints

- Cap values: L1=6, L2=10, L3=10, L4=10 — defined once as `DAILY_CAPS` in `save.js`.
- Window length: 24h rolling, per level — defined as `DAILY_WINDOW_MS` in `save.js`.
- Count unit: ONE finished round = ONE 道题. `markRoundFinished` is called inside `finishRound`, AFTER the celebration audio chain resolves and BEFORE the navigation to picker / dailyDone. Partial sessions (kid taps ← before finishing all 10) only count rounds actually finished.
- Lock threshold: `count >= DAILY_CAPS[levelId]`. After 6 finished rounds on L1 the picker shows L1 as daily-locked; the 7th attempt is blocked.
- `sampleSize` MUST equal `DAILY_CAPS[levelId]` for each level. If `sampleSize > cap`, the kid hits the cap MID-SAMPLE, `saveProgress` never fires (it only fires on the last round of the sample), and the next level is permanently locked. L1 currently ships with `sampleSize: 10` — Task 0 below changes it to 6 to match its cap. L2-L4 already ship with `sampleSize: 10`, matching their cap of 10.
- Visual identity: daily-locked cards render with the SAME `LOCKED_BG` / `LOCKED_INK` colors as truly-locked cards. Only the bottom text differs ("今天练够啦" vs "还没解锁").
- Verifier skip flag: `window.__skipDailyCap = true` makes both `isLevelDailyLocked` and `markRoundFinished` (the latter's `locked` return) ignore the cap. Mirrors the existing `window.__skipTimers` pattern.
- Audio cue text (Mandarin, child voice, ≈1.5s): "今天已经练够啦，明天再来哦". Cue id: `daily-done`.
- localStorage key remains `panda-save-v1`. Saves from before this feature load cleanly because `sanitize()` defaults `daily` to `{}`.

---

## File Structure

| File | Change | Why |
| ---- | ------ | --- |
| `scenes/level1.js` | Modify — change `sampleSize: 10` to `sampleSize: 6` | L1's cap is 6; sample size must match cap so the kid can actually finish the sample and unlock L2 |
| `save.js` | Modify — add schema, sanitize migration, three API methods, two constants | Single source of truth for daily state |
| `scenes/levelPicker.js` | Modify — `drawCard` gains `dailyLocked` param, picker computes it, tap handler branches | Render locked-out cards + friendly tap feedback |
| `scenes/roundScene.js` | Modify — `finishRound` calls `markRoundFinished`, branches on cap-hit | Write the count on every completed round |
| `scenes/dailyDone.js` | Create — transient message scene with single back button + friendly cue | Show a clear "done for today" message at cap-hit |
| `main.js` | Modify — add `daily-done` to `CUE_IDS`, register `dailyDone` scene | Wire the new cue and scene into the app boot |
| `tools/cues.cjs` | Modify — add `daily-done` entry | Audio builder picks it up on next regen |
| `tools/verify-math.mjs` | Modify — set `window.__skipDailyCap = true` | Verifier runs every round of every level |
| `tools/verify-games.mjs` | Modify — set `window.__skipDailyCap = true` | Verifier still runs after cap |
| `tools/save-daily.test.mjs` | Create — Playwright integration test for save layer | Covers the `save.js` API behavior end-to-end |

---

### Task 0: Change L1's `sampleSize` to 6 (match cap)

**Files:**
- Modify: `scenes/level1.js:456-462` (the `createRoundScene` config block — find `sampleSize: 10` and change it)

**Interfaces:**
- Consumes: existing L1 scene config.
- Produces: L1 ships with `sampleSize: 6`. One play-through = 6 rounds, matching `DAILY_CAPS[1]`.

**Why this task comes first:** `saveProgress(config.levelId)` only fires inside `finishRound`, and `finishRound` is only called on the LAST round of the sample (the `ri + 1 < totalRounds` branch returns early for every other round). If `sampleSize > cap`, the kid hits the daily cap MID-SAMPLE, transitions to `dailyDone` mid-sample, and `saveProgress` never fires — the next level stays permanently locked. Matching `sampleSize` to `DAILY_CAPS` ensures completing the sample = finishing today's quota = unlocking the next level + locking today's practice in one event.

- [ ] **Step 1: Locate L1's sampleSize**

In `scenes/level1.js`, the config block is the default-export object passed to `createRoundScene(...)`. Find:

```javascript
export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  // Pull the 120-round pool from data/pools.js. roundScene samples 10
  // of them on first entry and walks through in random order.
  poolGen: () => poolGens[1](),
  sampleSize: 10,
```

- [ ] **Step 2: Change `sampleSize: 10` to `sampleSize: 6` and update the comment**

Replace:

```javascript
  // Pull the 120-round pool from data/pools.js. roundScene samples 10
  // of them on first entry and walks through in random order.
  poolGen: () => poolGens[1](),
  sampleSize: 10,
```

with:

```javascript
  // Pull the 120-round pool from data/pools.js. roundScene samples
  // 6 of them on first entry and walks through in random order.
  // sampleSize MUST equal DAILY_CAPS[1] (6) so a single play-through
  // finishes today's quota in one go — see
  // docs/superpowers/specs/2026-08-12-daily-practice-lock-design.md
  // for the saveProgress ↔ cap-hit coupling.
  poolGen: () => poolGens[1](),
  sampleSize: 6,
```

- [ ] **Step 3: Boot the smoke test to confirm nothing broke**

In one terminal:
```bash
python3 -m http.server 8126
```

In another:
```bash
npm run smoke
```

Expected: smoke loads the app with no console errors. Levels still load (4 levels visible).

- [ ] **Step 4: Manually verify L1 plays 6 rounds**

In a browser, navigate to `http://localhost:8126/`, reset `localStorage`, click L1, play through all 6 rounds. Confirm the picker returns at the end of round 6 (no `dailyDone` scene yet — that's wired in Task 7). The next time you enter L1, the sample is freshly shuffled (because `roundIdx === 0` resets when you re-enter the scene).

- [ ] **Step 5: Commit**

```bash
git add scenes/level1.js
git commit -m "feat(level1): sampleSize 10→6 to match DAILY_CAPS[1]"
```

---

### Task 1: Extend `save.js` schema + sanitize migration

**Files:**
- Modify: `save.js:21-27` (DEFAULT object) and `save.js:71-97` (sanitize function) and `save.js:116` (api export)

**Interfaces:**
- Consumes: existing DEFAULT shape, existing sanitize logic.
- Produces: 
  - `DEFAULT.daily = {}` (empty object — per-level entries created lazily)
  - `sanitize()` returns objects with `daily: { [levelId]: { count, windowStartedAt } | undefined }` for each level 1-4, with `count` clamped to `0..999` and `windowStartedAt` clamped to a non-negative integer or `null`.
  - `api` object exposes the new constants (next task).

- [ ] **Step 1: Add `DAILY_CAPS` and `DAILY_WINDOW_MS` module-level constants**

In `save.js`, after the existing `const KEY = "panda-save-v1";` declaration (around line 19), add:

```javascript
// Per-level daily round caps. L1 caps at 6 (sum-≤-10 triples are
// fast and easy — 6/day avoids burnout). L2-L4 cap at 10 (the
// default sampleSize for those levels).
const DAILY_CAPS = { 1: 6, 2: 10, 3: 10, 4: 10 };
// 24h rolling window — starts at the first finished round of the
// level's window, ends 24h later (lazy rollover on next read).
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
```

- [ ] **Step 2: Add `daily: {}` to DEFAULT**

In `save.js`, change the `DEFAULT` constant from:

```javascript
const DEFAULT = {
  currentLevel: 1,
  unlockedLevel: 1,
  starsByLevel: {},
  unlockedGame: 1,
  starsByGame: {},
};
```

to:

```javascript
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
```

- [ ] **Step 3: Extend `sanitize()` to migrate + clamp `daily`**

In `save.js`, inside the `sanitize` function, after the `gameStars` block (around line 89, before the `return`), add the daily sanitization:

```javascript
  // Daily-cap state. Default-migrate older saves that lack the field.
  // Each per-level entry clamps count to [0, 999] and windowStartedAt
  // to a non-negative integer or null. Unknown level ids are dropped.
  const daily = {};
  if (value.daily && typeof value.daily === "object") {
    for (let i = 1; i <= 4; i++) {
      const entry = value.daily[i];
      if (!entry || typeof entry !== "object") continue;
      daily[i] = {
        count: clampInt(entry.count, 0, 999, 0),
        windowStartedAt: (() => {
          const t = Number(entry.windowStartedAt);
          if (!Number.isFinite(t) || t < 0) return null;
          return Math.round(t);
        })(),
      };
    }
  }
```

Then change the existing `return` statement from:

```javascript
  return {
    currentLevel: current,
    unlockedLevel: unlocked,
    starsByLevel: stars,
    unlockedGame,
    starsByGame: gameStars,
  };
```

to:

```javascript
  return {
    currentLevel: current,
    unlockedLevel: unlocked,
    starsByLevel: stars,
    unlockedGame,
    starsByGame: gameStars,
    daily,
  };
```

- [ ] **Step 4: Update `cloneSave` to copy `daily`**

In `save.js`, change the `cloneSave` function from:

```javascript
function cloneSave(value) {
  return {
    ...value,
    starsByLevel: { ...(value.starsByLevel || {}) },
    starsByGame: { ...(value.starsByGame || {}) },
  };
}
```

to:

```javascript
function cloneSave(value) {
  return {
    ...value,
    starsByLevel: { ...(value.starsByLevel || {}) },
    starsByGame: { ...(value.starsByGame || {}) },
    daily: { ...(value.daily || {}) },
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add save.js
git commit -m "feat(save): add daily-cap schema + sanitize migration"
```

---

### Task 2: Add `isLevelDailyLocked`, `markRoundFinished`, `getDailyState` to `save.js`

**Files:**
- Modify: `save.js:116` (api object), `save.js:107-114` (existing clampInt helper)

**Interfaces:**
- Consumes: the constants + schema from Task 1; reads `window.__skipDailyCap` (defined by verifiers).
- Produces (exported on `window.PandaSave`):
  - `isLevelDailyLocked(levelId) -> boolean`
  - `markRoundFinished(levelId) -> { count: number, cap: number, locked: boolean }`
  - `getDailyState(levelId) -> { count: number, cap: number, locked: boolean, windowStartedAt: number | null }`
  - Plus `DAILY_CAPS` and `DAILY_WINDOW_MS` for external reference.

- [ ] **Step 1: Create the placeholder test file**

Create `tools/save-daily.test.mjs` with the failing tests. The test boots the app in Playwright, unlocks all levels, and exercises the save API directly:

```javascript
// tools/save-daily.test.mjs — verifies the daily-cap save layer.
//
// Boots the app in Playwright, clears any pre-existing save, and
// exercises isLevelDailyLocked / markRoundFinished / getDailyState
// directly via window.PandaSave. The picker / roundScene integration
// is covered by the existing tools/verify-math.mjs and the smoke
// tests; this file focuses on the save layer's contract.

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";

const failures = [];
function fail(msg) { failures.push(msg); console.error(`  FAIL ${msg}`); }
function ok(msg) { console.log(`  ok ${msg}`); }

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await (await browser.newContext()).newPage();

page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Start clean so we don't inherit state from a previous run.
await page.evaluate(() => localStorage.removeItem("panda-save-v1"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

async function callSave(method, ...args) {
  return page.evaluate(
    ({ method, args }) => window.PandaSave[method](...args),
    { method, args },
  );
}

async function getSave() {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("panda-save-v1") || "null"),
  );
}

// --- Test 1: initial state is unlocked for all levels ---
const l1Initial = await callSave("isLevelDailyLocked", 1);
if (l1Initial === false) ok("L1 not locked initially");
else fail(`L1 locked initially (got ${l1Initial})`);

const l4Initial = await callSave("isLevelDailyLocked", 4);
if (l4Initial === false) ok("L4 not locked initially");
else fail(`L4 locked initially (got ${l4Initial})`);

// --- Test 2: getDailyState returns sane shape ---
const l1State = await callSave("getDailyState", 1);
if (l1State && l1State.count === 0 && l1State.cap === 6 && l1State.locked === false) {
  ok("L1 getDailyState initial: count=0, cap=6, locked=false");
} else {
  fail(`L1 getDailyState wrong: ${JSON.stringify(l1State)}`);
}

const l3State = await callSave("getDailyState", 3);
if (l3State && l3State.cap === 10) ok("L3 getDailyState cap=10");
else fail(`L3 getDailyState cap wrong: ${JSON.stringify(l3State)}`);

// --- Test 3: markRoundFinished increments and persists ---
const r1 = await callSave("markRoundFinished", 1);
if (r1 && r1.count === 1 && r1.cap === 6 && r1.locked === false) {
  ok("markRoundFinished(L1) #1: count=1, locked=false");
} else {
  fail(`markRoundFinished(L1) #1 wrong: ${JSON.stringify(r1)}`);
}

const stored = await getSave();
if (stored && stored.daily && stored.daily[1] && stored.daily[1].count === 1) {
  ok("localStorage has daily[1].count=1");
} else {
  fail(`localStorage daily[1] wrong: ${JSON.stringify(stored && stored.daily)}`);
}

// --- Test 4: 6th finished round on L1 hits the cap (count >= cap → locked) ---
let lastResult = null;
for (let i = 2; i <= 6; i++) {
  lastResult = await callSave("markRoundFinished", 1);
}
if (lastResult && lastResult.count === 6 && lastResult.locked === true) {
  ok("L1 6th finished round: count=6, locked=true");
} else {
  fail(`L1 6th finished round wrong: ${JSON.stringify(lastResult)}`);
}

// --- Test 5: isLevelDailyLocked(1) now returns true ---
const l1LockedNow = await callSave("isLevelDailyLocked", 1);
if (l1LockedNow === true) ok("isLevelDailyLocked(1) returns true after 6 rounds");
else fail(`isLevelDailyLocked(1) wrong after 6 rounds: ${l1LockedNow}`);

// --- Test 6: L1 locked, L2 still unlocked (per-level isolation) ---
const l1Iso = await callSave("isLevelDailyLocked", 1);
const l2Iso = await callSave("isLevelDailyLocked", 2);
if (l1Iso === true && l2Iso === false) {
  ok("per-level isolation: L1 locked, L2 unlocked");
} else {
  fail(`per-level isolation broken: L1=${l1Iso}, L2=${l2Iso}`);
}

// --- Test 7: windowStartedAt is set on first finished round ---
if (stored && stored.daily && stored.daily[1] && typeof stored.daily[1].windowStartedAt === "number"
    && stored.daily[1].windowStartedAt > 0) {
  ok("windowStartedAt is a positive number");
} else {
  fail(`windowStartedAt wrong: ${JSON.stringify(stored && stored.daily && stored.daily[1])}`);
}

// --- Test 8: lazy rollover — manually expire the window, next call resets count ---
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("panda-save-v1"));
  s.daily[1].windowStartedAt = Date.now() - (25 * 60 * 60 * 1000); // 25h ago
  localStorage.setItem("panda-save-v1", JSON.stringify(s));
});
const l1AfterExpiry = await callSave("isLevelDailyLocked", 1);
if (l1AfterExpiry === false) ok("lazy rollover: L1 unlocked after 25h expiry");
else fail(`lazy rollover broken: L1 locked after 25h: ${l1AfterExpiry}`);

const storedAfterExpiry = await getSave();
if (storedAfterExpiry && storedAfterExpiry.daily && storedAfterExpiry.daily[1]
    && storedAfterExpiry.daily[1].count === 0
    && storedAfterExpiry.daily[1].windowStartedAt === null) {
  ok("lazy rollover persists: count=0, windowStartedAt=null");
} else {
  fail(`lazy rollover didn't persist: ${JSON.stringify(storedAfterExpiry && storedAfterExpiry.daily && storedAfterExpiry.daily[1])}`);
}

// --- Test 9: __skipDailyCap honored ---
await page.evaluate(() => { window.__skipDailyCap = true; });
let skipResult = null;
for (let i = 0; i < 10; i++) {
  skipResult = await callSave("markRoundFinished", 1);
}
if (skipResult && skipResult.locked === false) {
  ok("__skipDailyCap: locked=false after 16 finished rounds");
} else {
  fail(`__skipDailyCap ignored: ${JSON.stringify(skipResult)}`);
}

console.log(`\n${failures.length} failure(s)`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test — confirm it fails**

```bash
node tools/save-daily.test.mjs
```

Expected: most tests fail because the three API methods don't exist yet. The first failure will be `markRoundFinished is not a function` or similar.

- [ ] **Step 3: Implement the three API methods on `save.js`**

In `save.js`, just before the `const api = ...` line, add:

```javascript
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
  const save = load();
  const cap = DAILY_CAPS[levelId];
  if (cap == null) return false;
  rolloverLevel(save, levelId);
  // Persist any reset that happened in rolloverLevel.
  save(save);
  const entry = save.daily[levelId];
  if (!entry) return false;
  return entry.count >= cap;
}

// Read-only snapshot. Used by the picker (now and in future features
// that want to display "今日 6/6" on a card). Runs lazy rollover.
function getDailyState(levelId) {
  const save = load();
  const cap = DAILY_CAPS[levelId] ?? 0;
  rolloverLevel(save, levelId);
  save(save);
  const entry = save.daily[levelId] || { count: 0, windowStartedAt: null };
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
  const save = load();
  rolloverLevel(save, levelId);
  let entry = save.daily[levelId];
  if (!entry) {
    entry = { count: 0, windowStartedAt: null };
    save.daily[levelId] = entry;
  }
  if (entry.windowStartedAt == null) {
    entry.windowStartedAt = Date.now();
  }
  entry.count = (entry.count || 0) + 1;
  save(save);
  return {
    count: entry.count,
    cap,
    locked: window.__skipDailyCap ? false : entry.count >= cap,
  };
}
```

- [ ] **Step 4: Update the `api` object to expose the new methods + constants**

In `save.js`, change the `const api = ...` line from:

```javascript
const api = { load, save, KEY, DEFAULT };
```

to:

```javascript
const api = {
  load, save, KEY, DEFAULT,
  DAILY_CAPS, DAILY_WINDOW_MS,
  isLevelDailyLocked, markRoundFinished, getDailyState,
};
```

- [ ] **Step 5: Run the test — confirm it passes**

```bash
node tools/save-daily.test.mjs
```

Expected output ends with `0 failure(s)` and `process.exit(0)`.

- [ ] **Step 6: Commit**

```bash
git add save.js tools/save-daily.test.mjs
git commit -m "feat(save): daily-cap API — isLevelDailyLocked + markRoundFinished + getDailyState"
```

---

### Task 3: Add `daily-done` cue id + register `dailyDone` scene in `main.js`

**Files:**
- Modify: `main.js:35-301` (CUE_IDS array) and `main.js:723-769` (scene boot block)

**Interfaces:**
- Consumes: `assets/audio/daily-done.mp3` (silent placeholder until a real build runs — see Task 4 for the placeholder generator).
- Produces:
  - `CUE_IDS` contains the string `"daily-done"`.
  - `k.scene("dailyDone", () => dailyDone(k))` is registered.
  - `dailyDone` is dynamically imported alongside the other scenes.

- [ ] **Step 1: Add `daily-done` to `CUE_IDS`**

In `main.js`, inside the `CUE_IDS` array, find the line containing `"lvl-done"` (around line 81) and add `"daily-done"` immediately after it:

```javascript
  // Friendly cue played when a kid taps a daily-locked card OR
  // enters the dailyDone scene after hitting the daily cap.
  // Mandarin text: "今天已经练够啦，明天再来哦" (~1.5s). Audio is
  // a silent placeholder until tools/build-composite-audio.mjs
  // regenerates it from tools/cues.cjs.
  "daily-done",
```

- [ ] **Step 2: Create the placeholder `scenes/dailyDone.js` (stub for now)**

Create `scenes/dailyDone.js` with a minimal implementation that will be fleshed out in Task 5:

```javascript
// scenes/dailyDone.js — transient "今天练够啦" message scene.
//
// Shown when a kid's just-finished round hits the per-level daily
// round cap. Same friendly cue as a daily-locked card tap. One
// "好" button returns to the picker. Replaced with the real
// implementation in Task 5.

import { INK, PAPER, FONT, ORANGE } from "../components/theme.js";

export default function dailyDoneScene(k) {
  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);
  k.add([
    k.text("(stub — replaced in Task 5)", { size: 36, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, k.height() / 2),
    k.anchor("center"),
  ]);
}
```

- [ ] **Step 3: Import + register the scene in `main.js`**

In `main.js`, in the dynamic `import` block at the bottom (around line 738-750), add `dailyDone` to the destructured imports:

```javascript
  const [
    { default: levelPicker },
    { default: gamesPicker },
    { default: level1 },
    { default: level2 },
    { default: level3 },
    { default: level4 },
    { default: dailyDone },
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
    import("./scenes/level4.js"),
    import("./scenes/dailyDone.js"),
    import("./scenes/gameBoat.js"),
    import("./scenes/gameBounce.js"),
    import("./scenes/gameCloud.js"),
    import("./scenes/gameFeed.js"),
    import("./scenes/gameWhack.js"),
  ]);
```

And in the scene-registration block (around line 757-767), add:

```javascript
  k.scene("dailyDone", () => dailyDone(k));
```

- [ ] **Step 4: Boot the smoke test to confirm nothing broke**

Start the server in one terminal:
```bash
python3 -m http.server 8126
```

Then in another:
```bash
npm run smoke
```

Expected: smoke loads the app, no `consoleErrors`, audioCues count is `49 + 1 = 50` (or whatever the prior count was + 1). The "(stub — replaced in Task 5)" text won't appear yet because nothing navigates to `dailyDone`; this step just confirms the scene wires up cleanly.

- [ ] **Step 5: Commit**

```bash
git add main.js scenes/dailyDone.js
git commit -m "feat(scenes): register dailyDone scene + daily-done cue id"
```

---

### Task 4: Add `daily-done` to `tools/cues.cjs` and regenerate placeholder

**Files:**
- Modify: `tools/cues.cjs` (whatever its cue manifest array looks like — add one entry)
- Modify: `tools/make-placeholders.js` (no code change needed; just re-run it)

**Interfaces:**
- Consumes: existing manifest + placeholder generator.
- Produces: `assets/audio/daily-done.mp3` exists (silent 1.5s placeholder, same shape as the other 49 cues).

- [ ] **Step 1: Locate the cue manifest format**

Open `tools/cues.cjs` and find the existing entries. The pattern (based on `main.js`'s CUE_IDS) is one entry per cue. Add an entry for `daily-done` matching whatever shape the other entries use. For example, if other entries look like:

```javascript
  { id: "lvl-done", text: "..." },
```

Add:

```javascript
  { id: "daily-done", text: "今天已经练够啦，明天再来哦" },
```

(Use the exact same shape and indentation as the existing entries — copy/paste from `lvl-done` and edit.)

- [ ] **Step 2: Regenerate placeholders so the audio file exists**

From the project root:
```bash
npm run placeholders
```

This regenerates `assets/audio/daily-done.mp3` as a silent placeholder (1.5s). Verify:
```bash
ls -la assets/audio/daily-done.mp3
```

Expected: file exists, size > 0.

- [ ] **Step 3: Boot the smoke test and confirm the new cue loads**

In one terminal:
```bash
python3 -m http.server 8126
```

In another:
```bash
npm run smoke
```

Expected: `audioCues` count in the smoke output increases by 1 from the previous run (because `daily-done` is now preloaded as an `<audio>` element). No `consoleErrors`.

- [ ] **Step 4: Commit**

```bash
git add tools/cues.cjs assets/audio/daily-done.mp3
git commit -m "feat(audio): add daily-done cue manifest entry + placeholder"
```

---

### Task 5: Replace stub `scenes/dailyDone.js` with the real implementation

**Files:**
- Modify: `scenes/dailyDone.js` (full file)

**Interfaces:**
- Consumes: `window.PandaAudio.playCue`, kaplay `k`, theme colors.
- Produces: scene that renders a centered card with the friendly message + a "好" button, plays `daily-done` on entry, and navigates back to the picker on button tap.

- [ ] **Step 1: Write the full scene implementation**

Replace the entire content of `scenes/dailyDone.js` with:

```javascript
// scenes/dailyDone.js — transient "今天练够啦" message scene.
//
// Shown when a kid's just-finished round hits the per-level daily
// round cap. The celebration audio from the round that triggered
// the cap has already finished by the time we get here (roundScene
// waits on its `onAdvance` Promise), so we play our own short
// friendly cue on entry. A single "好" button returns to the
// picker.
//
// Layout mirrors the level picker: PAPER background, panda buddy
// in the upper-left, centered card with the message, single button
// at the bottom.

import panda from "../components/panda.js";
import { INK, PAPER, FONT, ORANGE } from "../components/theme.js";

export default function dailyDoneScene(k) {
  // Background.
  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

  // Panda buddy at the same position as the picker (kept from
  // there so the visual is familiar — same panda, same room).
  const buddy = panda(k, { x: 150, y: 248, size: 172 });
  buddy.setMood("idle");

  // Centered card (same shape as a single level-picker card so the
  // kid sees a familiar element).
  const cardW = 720;
  const cardH = 460;
  const cx = k.width() / 2;
  const cy = k.height() / 2 - 40;

  k.add([
    k.rect(cardW, cardH, { radius: 32 }),
    k.color(...INK),
    k.opacity(0.15),
    k.pos(cx, cy + 10),
    k.anchor("center"),
  ]);

  k.add([
    k.rect(cardW, cardH, { radius: 32 }),
    k.color(255, 250, 240),
    k.outline(5, k.rgb(...INK)),
    k.pos(cx, cy),
    k.anchor("center"),
  ]);

  // Friendly message — same Mandarin text as the audio cue.
  k.add([
    k.text("今天练够啦", { size: 96, font: FONT }),
    k.color(...INK),
    k.pos(cx, cy - 40),
    k.anchor("center"),
  ]);
  k.add([
    k.text("明天再来哦！", { size: 56, font: FONT }),
    k.color(...ORANGE),
    k.pos(cx, cy + 60),
    k.anchor("center"),
  ]);

  // "好" button — wide, centered, orange. Mirrors the round-scene
  // button style so it looks like a "next" affordance the kid is
  // used to.
  const btnW = 240;
  const btnH = 110;
  const btn = k.add([
    k.rect(btnW, btnH, { radius: 24 }),
    k.color(...ORANGE),
    k.outline(5, k.rgb(...INK)),
    k.pos(cx, cy + 180),
    k.anchor("center"),
    k.area(),
  ]);
  k.add([
    k.text("好", { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(cx, cy + 180),
    k.anchor("center"),
  ]);
  btn.onClick(() => k.go("levelPicker"));

  // Friendly audio — plays once on scene entry. The k.go() wrapper
  // in main.js calls stopAllAudio before navigating, so this cue
  // starts cleanly even if the round's celebration audio is still
  // tailing off (shouldn't be, but defensive).
  window.PandaAudio.playCue("daily-done");
}
```

- [ ] **Step 2: Boot the smoke test and verify the scene renders**

In one terminal:
```bash
python3 -m http.server 8126
```

In another, navigate to `http://localhost:8126/` in a real browser (or use Playwright). Manually trigger the scene by injecting into the dev console:

```javascript
window.kaplay.go("dailyDone");
```

Expected: a card with "今天练够啦" and "明天再来哦！" centered on the screen, panda in the upper-left, orange "好" button at the bottom. Clicking the button returns to the picker.

For automated confirmation, run:
```bash
npm run smoke
```

Expected: smoke loads cleanly with no console errors.

- [ ] **Step 3: Commit**

```bash
git add scenes/dailyDone.js
git commit -m "feat(scenes): dailyDone full implementation — message + 好 button + audio"
```

---

### Task 6: Update `levelPicker.js` to render daily-locked cards

**Files:**
- Modify: `scenes/levelPicker.js:46-125` (`drawCard` signature + body), `scenes/levelPicker.js:192-204` (per-level card invocation)

**Interfaces:**
- Consumes: `window.PandaSave.isLevelDailyLocked(levelId)`, theme constants, kaplay scene API.
- Produces: `drawCard(k, parent, level, unlocked, dailyLocked, cardW = 320)` — 6th param is new. Picker computes `dailyLocked` per card and passes it. Tap handler branches:
  - `unlocked && !dailyLocked` → `k.go(level${id})` (existing)
  - `unlocked && dailyLocked` → `window.PandaAudio.stopAllAudio(); window.PandaAudio.playCue("daily-done")`
  - `!unlocked` → no-op (existing)

- [ ] **Step 1: Update `drawCard` signature**

In `scenes/levelPicker.js`, change:

```javascript
function drawCard(k, parent, level, unlocked, cardW = 320) {
```

to:

```javascript
function drawCard(k, parent, level, unlocked, dailyLocked, cardW = 320) {
```

- [ ] **Step 2: Replace the bottom-text branch to handle daily-locked**

In `scenes/levelPicker.js`, in the `if (unlocked) { ... ▶ ... } else if (!sprite(...))` block (around lines 101-115), replace the whole `if (unlocked) { ... } else if (...) { ... }` with:

```javascript
  if (unlocked && !dailyLocked) {
    card.add([
      k.text("▶", { size: 56, font: FONT }),
      k.color(...accent),
      k.pos(0, h / 2 - 62),
      k.anchor("center"),
    ]);
  } else if (!sprite(card, k, "lock", { x: 0, y: h / 2 - 62, size: 72 })) {
    // Both truly-locked and daily-locked fall through here. They
    // share the same greyed visual so the kid just sees "not now".
    // The text differs ("还没解锁" vs "今天练够啦") so an adult
    // notices the distinction; a pre-reader doesn't need to.
    card.add([
      k.text(dailyLocked ? "今天练够啦" : "还没解锁", { size: 32, font: FONT }),
      k.color(...titleColor),
      k.pos(0, h / 2 - 62),
      k.anchor("center"),
    ]);
  }
```

- [ ] **Step 3: Update the `onPick` handler**

In `scenes/levelPicker.js`, change the `onPick` closure (around lines 117-124) from:

```javascript
  const onPick = () => {
    if (unlocked) {
      k.go(`level${level.id}`);
    }
  };
  // Kaplay is configured with touchToMouse, so onClick covers both mouse and
  // touch input without double-firing on iPad Safari.
  card.onClick(onPick);
```

to:

```javascript
  const onPick = () => {
    if (unlocked && dailyLocked) {
      // Friendly feedback — kid tapped a card they've used up for
      // today. stopAllAudio first so the previous cue doesn't
      // bleed through. Same cue the dailyDone scene plays.
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playCue("daily-done");
      return;
    }
    if (unlocked) {
      k.go(`level${level.id}`);
    }
  };
  // Kaplay is configured with touchToMouse, so onClick covers both mouse and
  // touch input without double-firing on iPad Safari.
  card.onClick(onPick);
```

- [ ] **Step 4: Update the per-level card invocation in the picker scene**

In `scenes/levelPicker.js`, in the `levels.forEach((lvl, i) => { ... })` block (around line 192), change the call from:

```javascript
  levels.forEach((lvl, i) => {
    drawCard(
      k,
      k,
      {
        ...lvl,
        cardX: k.width() / 2 - totalSpan / 2 + i * stride,
        cardY: baseY,
      },
      lvl.id <= save.unlockedLevel,
      cardW,
    );
  });
```

to:

```javascript
  levels.forEach((lvl, i) => {
    const unlocked = lvl.id <= save.unlockedLevel;
    // dailyLocked is only meaningful for unlocked levels — a truly
    // locked level is already gated by the unlocked check above.
    const dailyLocked = unlocked && window.PandaSave?.isLevelDailyLocked(lvl.id);
    drawCard(
      k,
      k,
      {
        ...lvl,
        cardX: k.width() / 2 - totalSpan / 2 + i * stride,
        cardY: baseY,
      },
      unlocked,
      dailyLocked,
      cardW,
    );
  });
```

- [ ] **Step 5: Manual visual check**

In one terminal:
```bash
python3 -m http.server 8126
```

Open the page in a browser. Trigger daily-lock by injecting in dev console:

```javascript
window.PandaSave.markRoundFinished(1);
window.PandaSave.markRoundFinished(1);
window.PandaSave.markRoundFinished(1);
window.PandaSave.markRoundFinished(1);
window.PandaSave.markRoundFinished(1);
window.PandaSave.markRoundFinished(1);
window.kaplay.go("levelPicker");
```

Expected: L1 card renders with greyed background and "今天练够啦" text instead of the ▶ icon. Clicking L1 plays the friendly cue. Clicking L2-L4 navigates normally.

- [ ] **Step 6: Commit**

```bash
git add scenes/levelPicker.js
git commit -m "feat(picker): render daily-locked cards + friendly tap feedback"
```

---

### Task 7: Update `roundScene.js` `finishRound` to write the daily count

**Files:**
- Modify: `scenes/roundScene.js:560-579` (`finishRound` function)

**Interfaces:**
- Consumes: `window.PandaSave.markRoundFinished(levelId)`, existing `saveProgress(levelId)`.
- Produces: on the last round of a session, after `saveProgress`:
  - Always call `markRoundFinished(config.levelId)` first.
  - If the returned `locked` is true → `k.go("dailyDone", config.levelId)` instead of `k.go("levelPicker")`.

- [ ] **Step 1: Update `finishRound`**

In `scenes/roundScene.js`, change `finishRound` from:

```javascript
    function finishRound() {
      // Cancel any pending auto-advance so it doesn't fire on the next round's
      // closure after we've moved on.
      if (autoAdvanceTimer) autoAdvanceTimer.cancel();
      autoAdvanceTimer = null;
      if (ri + 1 < totalRounds) {
        roundIdx = ri + 1;
        k.go(config.sceneName);
        return;
      }
      // Last round over — navigate to the level picker. The previous
      // "lvl-done" cue ("all done") was removed per user feedback;
      // the kid just gets back to the level map after the celebration
      // audio. panda-celebrate has already ended by the time we get
      // here (advance was gated on it), so navigating immediately is
      // a clean exit.
      saveProgress(config.levelId);
      roundIdx = 0;
      k.go("levelPicker");
    }
```

to:

```javascript
    function finishRound() {
      // Cancel any pending auto-advance so it doesn't fire on the next round's
      // closure after we've moved on.
      if (autoAdvanceTimer) autoAdvanceTimer.cancel();
      autoAdvanceTimer = null;
      if (ri + 1 < totalRounds) {
        roundIdx = ri + 1;
        k.go(config.sceneName);
        return;
      }
      // Last round over. Bump the per-level daily counter FIRST so
      // we know whether this round hit the cap. The saveProgress()
      // call below is unchanged (still bumps stars + unlocks next
      // level); daily-cap state is independent of progression.
      const daily = window.PandaSave?.markRoundFinished(config.levelId)
        || { count: 0, cap: 0, locked: false };
      saveProgress(config.levelId);
      roundIdx = 0;
      // If this finished round hit the daily cap, the kid gets a
      // clear "今天练够啦" message instead of silently bouncing to
      // a now-locked card. The celebration audio from onAdvance has
      // already resolved (the audio-gated advance waited for it),
      // so transitioning immediately is a clean exit.
      if (daily.locked) {
        k.go("dailyDone");
      } else {
        k.go("levelPicker");
      }
    }
```

- [ ] **Step 2: Manual integration check — verify cap-hit transition**

In one terminal:
```bash
python3 -m http.server 8126
```

Reset state and trigger L1 cap-hit in dev console:

```javascript
localStorage.removeItem("panda-save-v1");
location.reload();
```

After reload, navigate to L1 and play through 6 rounds. On the 6th round's completion, the scene should transition to `dailyDone` (not the picker). Tap "好" to return to the picker. The L1 card should now show "今天练够啦".

- [ ] **Step 3: Verify partial sessions don't over-count**

Reset state, navigate to L1, play only 2 rounds, then tap the ← back button before round 3 starts. Return to the picker and confirm:

```javascript
window.PandaSave.getDailyState(1);
```

Expected: `{ count: 2, cap: 6, locked: false, windowStartedAt: <recent ms> }`.

- [ ] **Step 4: Commit**

```bash
git add scenes/roundScene.js
git commit -m "feat(roundScene): write daily count on finishRound, branch on cap-hit"
```

---

### Task 8: Update verifiers to set `__skipDailyCap`

**Files:**
- Modify: `tools/verify-math.mjs:64` (the `__skipTimers` setter)
- Modify: `tools/verify-games.mjs` (same place the existing `__skipTimers` is set)

**Interfaces:**
- Consumes: existing verifier boot logic.
- Produces: both verifiers boot with `window.__skipDailyCap = true` alongside `window.__skipTimers`.

- [ ] **Step 1: Update `tools/verify-math.mjs`**

In `tools/verify-math.mjs`, find the existing block (around line 64):

```javascript
// In-game we wait STEP_DELAY (4s) for a child to look at the reveal before
// auto-advancing. The verifier needs to test the same code path in seconds,
// not minutes, so it flips a flag the round scaffold honours. Set BEFORE
// any scene loads.
await page.evaluate(() => { window.__skipTimers = true; });
```

Add the daily-cap skip right after:

```javascript
// Same idea for the per-level daily cap. The verifier walks every
// round of every level, which would hit the cap on L1 after 6 rounds
// and on L2-L4 after 10. Without this flag, the verifier would
// transition into dailyDone mid-level and fail to assert the math
// for the remaining rounds.
await page.evaluate(() => { window.__skipDailyCap = true; });
```

- [ ] **Step 2: Update `tools/verify-games.mjs`**

In `tools/verify-games.mjs`, find the existing `__skipTimers` setter (search for `window.__skipTimers`). Add the daily-cap skip right after it with the same one-liner pattern:

```javascript
await page.evaluate(() => { window.__skipDailyCap = true; });
```

- [ ] **Step 3: Run both verifiers**

In one terminal:
```bash
python3 -m http.server 8126
```

In another:
```bash
npm run verify:math
npm run verify:games
```

Expected: both verifiers complete without errors. Each verifier exercises every round of every level without transitioning to `dailyDone` mid-run.

- [ ] **Step 4: Commit**

```bash
git add tools/verify-math.mjs tools/verify-games.mjs
git commit -m "chore(verify): set __skipDailyCap so verifiers run past the daily cap"
```

---

### Task 9: Final integration smoke + manual regression

**Files:** none (verification only)

**Interfaces:** none — runs the existing test suite end-to-end.

- [ ] **Step 1: Run the save-daily test**

```bash
node tools/save-daily.test.mjs
```

Expected: `0 failure(s)`. Confirms the save layer is unchanged in behavior.

- [ ] **Step 2: Run the math verifier**

```bash
npm run verify:math
```

Expected: passes.

- [ ] **Step 3: Run the games verifier**

```bash
npm run verify:games
```

Expected: passes.

- [ ] **Step 4: Run the smoke test**

```bash
npm run smoke
```

Expected: `consoleErrors=0`, audioCues and levelsLoaded as expected.

- [ ] **Step 5: Manual end-to-end check**

In one terminal:
```bash
python3 -m http.server 8126
```

In a browser:
1. Reload the app (clean localStorage).
2. Play L1 — confirm rounds 1–6 navigate normally to the picker, round 6 transitions to `dailyDone`, and L1 now shows "今天练够啦" on the picker.
3. Tap L1 again — confirm the friendly audio cue plays and nothing else happens.
4. Play L2 — confirm the same behavior at round 10.
5. Wait (or manually expire `windowStartedAt` via dev console) and reload — confirm the cap resets.

- [ ] **Step 6: Final commit if anything was tweaked**

If all of Steps 1–5 pass without code changes, skip this. If a tweak was needed:

```bash
git add -A
git commit -m "fix: integration tweaks from end-to-end test"
```

---

## Out of scope (do NOT implement in this plan)

- Per-day timestamp at midnight (the 24h window is rolling).
- "Extend the window" or "ask parent for more time" affordance.
- Per-level cap analytics or admin override.
- panda-park game daily caps (games track is independent).
- Visible "今日 N/M" progress badge on open cards. The
  `getDailyState` API exists for follow-ups but no UI uses it yet.

# Daily practice lock — per-level cap, 24h rolling window

## Context

User wants each math level to lock after a fixed number of finished
rounds per day, with the count rolling over 24h after the first
finished round of that level:

- L1 三数相加: cap = 6 rounds/day
- L2 两数凑十: cap = 10 rounds/day
- L3 凑十法:    cap = 10 rounds/day
- L4 二十以内:  cap = 10 rounds/day

Today the only "lock" the picker renders is for levels above the kid's
`unlockedLevel` (a permanent "还没解锁" lock). This feature adds a
*transient* lock for levels the kid has already unlocked but has
exhausted today's quota for.

The lock is purely a UX guardrail — it does NOT change stars,
`unlockedLevel`, or any progression state. A level that becomes
daily-locked stays unlocked permanently; it just can't be entered
again until the 24h window rolls over.

The 24h window is per-level (so playing L1 doesn't consume L2's
quota) and starts at the first FINISHED round of the day (so a kid
who taps L4 by accident doesn't burn tomorrow's L4 quota without
finishing anything).

## Decisions, with rationale

- **One finished round = one 道题.** Each math level runs 2–3
  teaching sub-picks per round. Counting each pick would make L1's
  cap of 6 too tight (≈3 finished rounds). Counting on entry would
  let partial sessions over-count. Counting on completion matches
  what a kid means by "I did N problems".
- **24h rolling window starting at the first finished round.** More
  forgiving than local midnight (kid plays at 8pm Monday, can play
  again at 8pm Tuesday — not 12am). Simpler than "rolling window
  per session" — only one timestamp to track per level.
- **Save-driven.** All daily-cap state lives in `save.js` next to
  the existing `starsByLevel` etc. Picker reads; `roundScene` writes
  on round completion. One source of truth.
- **Lazy 24h rollover.** No timers. The next `isLevelDailyLocked`
  call (or `markRoundFinished` call) checks the timestamp and
  resets `count` to 0 if the window has expired. A stale save sitting
  in localStorage with an old timestamp is fine — it auto-clears on
  next play.
- **Daily-locked card looks identical to truly-locked card.** Same
  greyed background, same LOCKED_INK text color. Only the bottom
  text differs ("今天练够啦" vs "还没解锁"). A 3-year-old doesn't
  need to distinguish "you can't tap this for a few minutes" from
  "you can't tap this ever"; both just mean "not now". Tap still
  gives friendly feedback so the kid isn't left wondering.
- **Cap-hit transition shows the same message.** When the kid
  finishes the round that hits the cap, the picker is replaced by a
  transient "今天练够啦" scene that plays the friendly audio and
  waits for a tap before returning to the picker. Avoids the
  confusing "I got celebrated for being right, then bounced to a
  locked card with no explanation".

## Save schema

Extend `save.js`'s persisted shape with a `daily` field:

```js
{
  currentLevel: 1..4,
  unlockedLevel: 1..4,
  starsByLevel: { 1: n, 2: n, 3: n, 4: n },
  unlockedGame: 1..5,
  starsByGame:  { 1: n, 2: n, 3: n, 4: n, 5: n },
  // NEW — daily cap state, per level:
  daily: {
    1: { count: 0..6,  windowStartedAt: <ms> | null },
    2: { count: 0..10, windowStartedAt: <ms> | null },
    3: { count: 0..10, windowStartedAt: <ms> | null },
    4: { count: 0..10, windowStartedAt: <ms> | null },
  },
}
```

New module-level constants on `save.js`:

```js
const DAILY_CAPS = { 1: 6, 2: 10, 3: 10, 4: 10 };
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
```

`sanitize()` must default-migrate: if the loaded object has no
`daily` field, initialize it as `{}`. Existing saves load cleanly.

## New API on `window.PandaSave`

### `isLevelDailyLocked(levelId) -> boolean`

Pure read. Before answering, runs lazy rollover:

1. If `daily[levelId]` is undefined OR `windowStartedAt` is null,
   return false (kid hasn't played this level yet today).
2. If `Date.now() - windowStartedAt >= DAILY_WINDOW_MS`, reset
   `count` to 0 and `windowStartedAt` to null, persist, return
   false.
3. Return `count >= DAILY_CAPS[levelId]`. With cap=6, the 6th
   finished round pushes count to 6, the next `isLevelDailyLocked`
   call returns true, and the kid's 7th attempt is blocked. Matches
   "练6道题就锁住" — after 6 problems, lock.

If `window.__skipDailyCap === true` (set by verifiers), always
returns false. Mirrors `window.__skipTimers`.

### `markRoundFinished(levelId) -> { count, cap, locked }`

Called from `roundScene.finishRound` BEFORE the existing
`saveProgress(config.levelId)`.

Behavior:

1. Run the same lazy-rollover preamble as `isLevelDailyLocked`
   (so finishing a round exactly at the 24h mark works correctly).
2. If `windowStartedAt` is null (first finished round of this
   level's window), set it to `Date.now()`.
3. Increment `count` for this level. Do NOT clamp — if `count`
   exceeds `cap`, the excess is fine (handles the
   `__skipDailyCap` test case where a test runs > cap rounds
   without locking). The `locked` return value is the SOURCE OF
   TRUTH, not the cap comparison.
4. Persist via `save(...)`.
5. Return `{ count, cap: DAILY_CAPS[levelId], locked: count >= DAILY_CAPS[levelId] }`. With cap=6: after
   round 6 finishes, count=6, locked=true, and the roundScene
   branches into the `dailyDone` transition (instead of the picker).
   The 7th attempt is blocked at the picker.

If `window.__skipDailyCap === true`, increment and persist as
normal but return `locked: false`. This lets verifiers run every
round of every level without hitting the cap.

### `getDailyState(levelId) -> { count, cap, locked, windowStartedAt }`

Read-only snapshot for the picker (used to render a future
"今日 6/6" progress badge — not implemented in this feature, but
the API exists so a follow-up doesn't have to reshape `save.js`).

## Picker UI

In `scenes/levelPicker.js`, `drawCard(k, parent, level, unlocked,
cardW = 320)` gains a fourth boolean `dailyLocked`:

```js
function drawCard(k, parent, level, unlocked, dailyLocked, cardW = 320)
```

Render path:

| State          | Card background     | Bottom text       | onClick                                  |
| -------------- | ------------------- | ----------------- | ---------------------------------------- |
| Truly locked   | `LOCKED_BG`         | "还没解锁" or lock sprite | No-op (existing behavior)         |
| Daily-locked   | `LOCKED_BG`         | "今天练够啦"            | stopAllAudio + playCue("daily-done") |
| Open           | `CARD` + accent band | "▶" in accent color  | k.go(`level${level.id}`)             |

The two "locked" variants share `LOCKED_BG` / `LOCKED_INK` colors
intentionally — a pre-reader sees both as "this card isn't for
right now". The text is the only signal that an adult would notice
the difference.

In `levelPickerScene()`, the per-level loop computes:

```js
const unlocked = lvl.id <= save.unlockedLevel;
const dailyLocked = unlocked && save.isLevelDailyLocked(lvl.id);
drawCard(k, k, { ...lvl, cardX, cardY }, unlocked, dailyLocked, cardW);
```

For levels `lvl.id > save.unlockedLevel`, `dailyLocked` is always
false (the truly-locked branch wins).

## Round-scene write path

In `scenes/roundScene.js`, `finishRound()` (around line 560):

```js
function finishRound() {
  if (autoAdvanceTimer) autoAdvanceTimer.cancel();
  autoAdvanceTimer = null;
  if (ri + 1 < totalRounds) {
    roundIdx = ri + 1;
    k.go(config.sceneName);
    return;
  }
  // Last round finished — bump the daily counter FIRST so the
  // cap-hit transition can branch on the result.
  const daily = window.PandaSave?.markRoundFinished(config.levelId)
    || { count: 0, cap: 0, locked: false };
  saveProgress(config.levelId);
  roundIdx = 0;
  if (daily.locked) {
    k.go("dailyDone", config.levelId);
  } else {
    k.go("levelPicker");
  }
}
```

A partial session (kid plays 3 of 10 rounds, taps ←) does NOT call
`finishRound` for the skipped rounds, so the counter only reflects
rounds actually finished. Matches "one finished round = one 道题".

## New scene: `scenes/dailyDone.js`

Transient message scene — shown when a kid's finished round hits
their level's daily cap. Mirrors the level picker's layout but with
a single centered message card instead of four level cards.

Contents:

- Panda buddy at the same position as the picker.
- Centered card with the message "今天练够啦，明天再来哦！" in INK
  text at size 64.
- A single "好" button at the bottom; tap → `k.go("levelPicker")`.
- On scene entry: `window.PandaAudio.playCue("daily-done")` so the
  kid hears the same friendly cue they would hear if they tried to
  tap a daily-locked card.

Registered in `main.js` alongside the other scenes.

## Audio

One new cue id: `daily-done`.

Content (Mandarin, child voice): "今天已经练够啦，明天再来哦"
(≈1.5s).

Generated by the existing `tools/build-composite-audio.mjs`
pipeline. Added to the manifest at
`tools/cues.cjs` so the build picks it up.

Added to `CUE_IDS` in `main.js` next to the existing "lvl-done"
cue. The pre-baked MP3 lives at `assets/audio/daily-done.mp3`
(placeholder silence until the build runs — same as every other
cue).

The cue fires in two contexts:

1. Daily-locked card tap on the picker.
2. Scene entry on `dailyDone`.

Same cue, two callers — keeps the audio manifest minimal.

## Edge cases

1. **Already-locked card tap** — no-op except stopAllAudio +
   daily-done cue. No risk of double-increment since the kid
   can't enter the scene.
2. **Same-day, multiple sessions** — first finished round stamps
   the level's window. 24h later, the next read resets the count.
3. **iPad clock weirdness** — we trust `Date.now()` directly, no
   timezone math. Matches every other piece of the save layer
   (which also has no time math).
4. **localStorage disabled / corrupt save** — `save.js` already
   falls back to in-memory DEFAULT. DEFAULT grows a `daily: {}`
   field; `isLevelDailyLocked` returns false on empty state, kid
   plays normally.
5. **Old saves from before this feature** — `sanitize()` defaults
   `daily` to `{}` if missing; no migration needed.
6. **Verifier scripts** — `tools/verify-math.mjs` and
   `tools/verify-games.mjs` set `window.__skipDailyCap = true`
   before running, mirroring the existing `window.__skipTimers`
   pattern. Both verifiers already set `__skipTimers`; the daily
   skip is added in the same boot code.

## Files touched

- `save.js` — schema, sanitize migration, three new API methods,
  `DAILY_CAPS` + `DAILY_WINDOW_MS` constants.
- `scenes/levelPicker.js` — `drawCard` gains `dailyLocked` param,
  picker scene computes it, tap handler branches.
- `scenes/roundScene.js` — `finishRound` calls `markRoundFinished`,
  branches on cap-hit.
- `scenes/dailyDone.js` (NEW) — transient message scene.
- `main.js` — add `daily-done` to `CUE_IDS`, register `dailyDone`
  scene in the scene map.
- `tools/cues.cjs` — add `daily-done` entry so the audio build
  picks it up.
- `tools/verify-math.mjs` + `tools/verify-games.mjs` — set
  `window.__skipDailyCap = true` at boot.
- `docs/superpowers/specs/2026-08-12-daily-practice-lock-design.md`
  — this file.

## Out of scope (explicit)

- No per-day timestamp at midnight. The 24h window is rolling.
- No "extend the window" / "ask parent for more time" affordance.
- No analytics on cap-hit frequency. Add later if the user wants
  usage visibility.
- No panda-park game daily caps. Games track is independent and
  not affected.
- No visible "今日 6/6" progress badge on open cards. The
  `getDailyState` API exists so this can be added later without
  reshaping `save.js`.

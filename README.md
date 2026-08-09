# Panda Math Adventure 🐼

A playful early-math game for ages 3–6. Built for **iPad Safari** (landscape,
1366×1024 letterbox) using **Kaplay** and **pre-baked Azure Speech F0
audio**. No build step, no PWA, no Chinese narration — just open
`index.html` on an iPad.

> **Branch:** `feat/kaplay-h5-refactor` — Kaplay rewrite for Stage 2.5
> (DAS-13). Replaces the Stage 2 vanilla implementation.

---


## Quick start (iPad Safari)

1. Clone this branch or download a release tarball.
2. Serve the directory with any static HTTP server:
   ```bash
   python3 -m http.server 8126
   ```
3. On your iPad, open Safari and navigate to
   `http://<your-mac-or-pi-host>:8126/`.
4. Tap the screen once — that unlocks the audio pool (iOS Safari requires a
   user gesture before any `<audio>` can play).
5. Rotate to landscape. A friendly rotate-hint card appears if you start
   in portrait.
6. Pick a level and play. The game saves progress to
   `localStorage.panda-save-v1` automatically.

> Offline play works for the local-ten game after the first load because
> the Kaplay runtime is self-hosted under `assets/vendor/` and all audio
   cues ship with the repo.

---

## Levels

| Level | Title | Skill | Question asked |
| --- | --- | --- | --- |
| 1 | Numbers up to 5 | Plain addition with totals ≤ 5 | fill the blank in `a + ? = answer` |
| 2 | Make a Ten | Decompose b into `need + rest` so `a + need = 10` | fill the blank in `a + ? = 10` |
| 3 | Up to 20 | Two-digit addition without the make-ten scaffold | fill the blank in `a + ? = answer` |

Each level has 6 rounds. Completing a level unlocks the next; stars accumulate
per level.

The equation on screen is always the question actually being scored. Level 2 is
the subtle one: the child is asked how many `a` needs to reach ten, so the
equation reads `a + ? = 10` and the correct answer is `need`. The full problem
stays pinned below it as context (`We want 8 + 5`) so the strategy reads as a
step toward that problem rather than a different question.

Answering correctly plays out the remaining reveal steps automatically — they
are an explanation, not further questions.

### Shared round scaffold

`scenes/roundScene.js` owns the chrome, the step bar, the answer buttons, the
pick/advance state machine and save progression. A level file supplies only its
equation, its choices, its number representation and its reveal steps. Adding a
level means writing a config, not copying a scene.

### Panda-park games

A second tab — "Games" — opens five pair-finding activities ported from
[panda-park](https://example.com). Each is a thin wrapper around either
`scenes/pairScene.js` (Boat, Cloud, Feed) or a self-contained scene (Bounce,
Whack). The five games all teach the same "make 10" idea but with different
constraints, so a child who finds Level 2's 4-button question too easy can
move to a more physical / time-pressured version of the same content:

| Game | Mechanic | Round shape |
| --- | --- | --- |
| Boat | 6 boats, pick 2 that sum to 10; bridge fills | Single pair per round |
| Bounce | 4 balloons, pop the one that completes 10 | Single pick |
| Cloud | 6 clouds, find 2–3 pairs in a round | Multi-pair per round |
| Feed | 3/5/7 bubbles, panda eats any valid pair | Multi-pair, escalating size |
| Whack | 30-second timer, 6 holes, find 5 pairs | Time-attack |

All five games save progress under `unlockedGame` / `starsByGame` (separate
from the math track). The math and games tracks unlock independently so a
child can play either path first.

### The ten-frame

Every digit is shown as a **2 × 5 grid of rounded squares**. Filled squares
count up to the value; empty squares are visible so the relationship
"filled = digit" is obvious.

```
8:  ■ ■ ■ ■ ■    3:  ■ ■ ■ · ·    10: ■ ■ ■ ■ ■
    ■ ■ ■ · ·        · · · · ·        ■ ■ ■ ■ ■
```

Level 1 only draws the top row (to avoid visual clutter while the child is
still building the count-to-five concept). Levels 2 and 3 draw both rows;
for numbers ≥ 10, Level 3 shows the ones place in the frame and a separate
"1" tile above for the tens place.

---

## Art

`assets/art/` holds hand-authored SVG sprites (panda in three moods, bamboo,
leaf, star, lock, level badges), loaded with `k.loadSprite()`. SVG keeps the art
crisp at any iPad Retina scale, diffable as text, and free of a build step.

These are fetched over HTTP, so **the game must be served** — see Quick start.
Opening `index.html` directly still boots and plays, but without art: every
sprite is guarded by a `k.getSprite()` check so a missing file costs the game its
decoration, not its arithmetic.

Canvas text uses `Arial Rounded MT Bold`, which ships with iPadOS. Kaplay accepts
CSS font family names directly, so no font binary is bundled. `components/theme.js`
is the single source of truth for canvas colors and mirrors the CSS custom
properties in `styles.css` — change both together.

---

## Checks

```bash
python3 -m http.server 8126 &
npm run verify:math      # honours CHROME_PATH, same as npm run smoke
npm run verify:games     # boots every panda-park game and clicks one valid pair
```

`tools/verify-math.mjs` plays every round of every level and asserts that the
equation rendered on screen is true, that it has exactly four distinct answer
buttons, and that clicking the equation's own answer is accepted. Two shipped
defects were invisible without it: `expression()` rendered `2 + ? = 1` for the
round 2 + 1 = 3, and Level 2 displayed `8 + ? = 13` while scoring 2 as correct,
so a child who answered 5 was told they were wrong.

`tools/verify-games.mjs` boots every panda-park game, finds a valid pair (or
the single correct balloon), clicks it, and asserts that the round progressed
without console errors. Whack is the only timed game and is verified by timer
presence rather than a complete playthrough.

---

## Regenerating the audio (Azure Speech F0, ElevenLabs, or Tencent Cloud TTS)

The audio pool is pre-baked. The shipped MP3s are 1-second silent
placeholders so the game boots without errors. To get real voice
narration, choose **one** of two providers:

### Azure Speech F0 (project default)

1. Sign up at <https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/>.
2. Copy `.env.example` to `.env` and fill in:
   ```
   AZURE_SPEECH_KEY=<your key>
   AZURE_SPEECH_REGION=eastus
   AZURE_SPEECH_VOICE=en-US-JennyNeural
   AZURE_SPEECH_FORMAT=audio-24khz-48kbitrate-mono-mp3
   ```
3. Run:
   ```bash
   npm run audio:build          # or: node tools/build-audio.js
   ```
   Dry-run: `npm run audio:build -- --dry-run`.

### ElevenLabs (free tier compatible)

ElevenLabs's free tier covers ~10,000 characters/month — enough for the
49-cue manifest many times over. Library voices require `eleven_flash_v2_5`
for free accounts; "Bella" (the project's chosen voice) is reachable on the
free tier.

1. Create an API key at <https://elevenlabs.io/app/settings/api-keys> (it must
   start with `sk_`, not be the key *id*).
2. Add to `.env`:
   ```
   ELEVENLABS_KEY=sk_...
   ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL   # Bella, optional override
   ELEVENLABS_MODEL_ID=eleven_flash_v2_5      # optional, default
   ```
3. Run:
   ```bash
   npm run audio:build:elevenlabs   # or: node tools/build-audio-elevenlabs.mjs
   ```

### Tencent Cloud TTS (Tencent 腾讯云 — current default for kids)

Tencent Cloud TTS uses a real child voice (`智童`, VoiceType 1004) which
sounds more natural for 3-6 year olds than the cartoon-styled adult
voices of Edge / ElevenLabs. Free quota on signup covers the 49-cue
manifest many times over.

1. Sign up at <https://console.cloud.tencent.com/tts> and create a CAM
   API key (SecretId + SecretKey). The AppId is shown in the top-right
   of the console.
2. Add to `.env`:
   ```
   TENCENT_SECRET_ID=AKID...
   TENCENT_SECRET_KEY=...
   TENCENT_APP_ID=...
   TENCENT_VOICE_TYPE=101016   # 智童 (女童声) — child voice, the default
   TENCENT_CODEC=mp3
   TENCENT_SAMPLE_RATE=16000
   TENCENT_REGION=ap-guangzhou
   ```
3. Run:
   ```bash
   npm run audio:build:tencent   # or: node tools/build-audio-tencent.mjs
   ```
   Dry-run: `npm run audio:build:tencent -- --dry-run`.

Other kid-friendly voices to try by setting `TENCENT_VOICE_TYPE`:
- `101040` — 智童 (333 Hz, slightly lower than default)
- `101028` — 智童 (308 Hz, still clearly child)
- `101008` — 智甜甜 (229 Hz, sweet girl — pitched lower than 童声)

> All three builders read the same `tools/cues.cjs` manifest (49 entries as of the
> panda-park migration) and overwrite `assets/audio/<id>.mp3`. Runtime audio
> is served from those local files; no provider API is called during play.

---

## Architecture

```
index.html                iPad viewport meta + Kaplay + main.js
main.js                   kaboom() boot, audio pool, scene registry
save.js                   localStorage.panda-save-v1
data/levels.json          3 levels × 6 rounds
scenes/levelPicker.js     First screen — three level cards
scenes/level1.js          Numbers up to 5
scenes/level2.js          Make-a-ten strategy
scenes/level3.js          Up to 20
components/tenFrame.js    2×5 grid of rounded squares
components/expression.js  "a + ? = b" math rendering
components/stepBar.js     4-step progress bar
components/choice.js      Numeric answer button
assets/audio/             49 pre-baked MP3s
assets/vendor/kaplay.mjs  Self-hosted Kaplay (no CDN)
tools/cues.js             Audio cue manifest
tools/build-audio.js      Azure Speech F0 synthesizer
tools/build-audio-tencent.mjs  Tencent Cloud TTS synthesizer (kids voice)
tools/make-placeholders.js  Generates silent MP3 stubs
styles.css                DOM layer (root grid, rotate hint)
```

### Why no CDN?

Kaplay is bundled into the repo at `assets/vendor/kaplay.mjs` so the game:

- Loads on iPad Safari without a network connection.
- Has no SRI hash to keep in sync.
- Cannot be compromised by a CDN supply-chain attack.

### Why no PWA / service worker?

The user opens the game inline. There is no install prompt, no manifest, no
service worker. iPad Safari will still show "Add to Home Screen" if the user
chooses, but the game is designed to work as a regular webpage.

---

## Testing

### Smoke test

```bash
python3 -m http.server 8126
# open http://localhost:8126/ in any modern browser
```

### Visual regression (Playwright)

Playwright snapshots under `tests/snapshots/` cover:
- `step-1-active`
- `step-2-active`
- `step-3-active`
- `step-4-celebrate`

Run `npx playwright test --update-snapshots` to refresh after intentional UI
changes.

---

## License

MIT. The bundled Kaplay runtime is MIT-licensed by the Kaplay team.
Voice assets generated by Azure Speech are subject to Azure's usage terms;
do not redistribute the MP3s outside this project.
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
> cues ship with the repo.

---

## Levels

| Level | Title | Skill |
| --- | --- | --- |
| 1 | Numbers up to 5 | Plain addition with totals ≤ 5 |
| 2 | Make a Ten | Decompose b into `need + rest` so `a + need = 10` |
| 3 | Up to 20 | Two-digit addition without the make-ten scaffold |

Each level has 6 rounds. Completing a level unlocks the next; stars accumulate
per level.

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

## Regenerating the audio (Azure Speech F0)

The audio pool is pre-baked. The shipped MP3s are 1-second silent
placeholders so the game boots without errors. To get real
**en-US-JennyNeural** narration:

1. Sign up for an Azure Speech F0 free tier
   (<https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/>).
2. Copy `.env.example` to `.env` and fill in:
   ```
   AZURE_SPEECH_KEY=<your key>
   AZURE_SPEECH_REGION=eastus
   AZURE_SPEECH_VOICE=en-US-JennyNeural
   AZURE_SPEECH_FORMAT=audio-24khz-48kbitrate-mono-mp3
   ```
3. Run:
   ```bash
   node tools/build-audio.js
   ```
4. The script reads `tools/cues.js`, synthesizes each cue via the Azure
   REST endpoint, and overwrites `assets/audio/<id>.mp3`.

Dry-run preview: `node tools/build-audio.js --dry-run`.

> The 31 cues cover level intros, step transitions, four rotating
> encouragements (`enc-great` / `enc-awesome` / `enc-amazing` / `enc-nice`),
> a `enc-try` for wrong answers, the digits 1–10, and UI feedback.

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
assets/audio/             31 pre-baked MP3s
assets/vendor/kaplay.mjs  Self-hosted Kaplay (no CDN)
tools/cues.js             Audio cue manifest
tools/build-audio.js      Azure Speech F0 synthesizer
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
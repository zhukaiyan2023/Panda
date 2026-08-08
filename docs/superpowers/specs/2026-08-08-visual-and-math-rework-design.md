# Design: Math Correctness Fix + Visual Rework

Date: 2026-08-08
Scope: `components/`, `scenes/`, `styles.css`, new `assets/art/`

## Problem

Two independent classes of defect were found by running the game headless
against a static server and screenshotting every scene.

### 1. The game was unplayable (fixed during diagnosis)

`components/choice.js` built its button root with `k.area()` and no shape
component. Kaplay's `area()` falls back to the object's own `renderArea()`,
which is supplied only by shape components (`rect()`, `circle()`, `sprite()`,
`text()`). The `rect()` was on a *child*, so the root had no `renderArea`.
Kaplay's per-frame hit test walks every object tagged `area`, so this threw
`TypeError: this.renderArea is not a function` on every frame as soon as a
level built its answer buttons — replacing the scene with Kaplay's blue error
screen.

The level picker was unaffected because `scenes/levelPicker.js` puts `rect()`
and `area()` on the *same* object. That asymmetry is why the failure looked
like three separate bugs (blank screen / unresponsive taps / broken flow):
they were one crash observed at different moments.

Fix applied: pass the shape explicitly.

```js
k.area({ shape: new k.Rect(k.vec2(x - w / 2, y - h / 2), w, h) })
```

Verified: all three levels plus tap interaction produce zero console errors.
Only a benign `favicon.ico` 404 remains.

### 2. The rendered arithmetic is wrong

`components/expression.js` renders the token sequence `[a, +, missing, =, b]`,
i.e. `a + ? = b`, treating parameter `b` as the **sum**. All three scenes pass
`b: round.b`, which is the second **addend**. The result is arithmetic that is
simply false:

| Level | Round data | On screen | Correct |
| --- | --- | --- | --- |
| 1 | `{a:2, b:1, answer:3}` | `2 + ? = 1` | `2 + ? = 3` |
| 2 | `{a:8, b:5, answer:13}` | `8 + 8 = 5` | `8 + ? = 13` |
| 3 | `{a:9, b:8, answer:17}` | `9 + 8 = 8` | `9 + ? = 17` |

`scenes/level2.js:65` papers over this by drawing a *second*, correct equation
below the broken one, so a child sees a false equation and a true equation on
the same screen.

For a math-teaching app aimed at ages 3–6 this outranks any visual concern:
a plain interface teaches correctly, a false equation teaches wrongly.

### 3. Secondary defects

- `components/stepBar.js:51` hardcodes the make-a-ten step labels
  ("Find a friend / Make 10 / Add the rest / Celebrate") for every level.
  Level 1 is plain addition under 5 and has no make-a-ten step.
- The step label pill overlaps the back and replay icon buttons in the top-left
  corner.
- All canvas text renders in Kaplay's default monospace bitmap font;
  `expression.js:16` additionally pins `font: "monospace"` explicitly. The
  `Trebuchet MS` stack in `styles.css` only affects DOM text, not the canvas.
- `assets/` contains audio and the Kaplay runtime but **no art**. A game titled
  "Panda Math Adventure" shows no panda; the lock and star are emoji glyphs.
- `assets/audio/panda-hi.mp3` and `panda-celebrate.mp3` ship in the repo but no
  code plays them.

## Decisions

Confirmed with the user before design:

| Decision | Choice |
| --- | --- |
| Sequence | Fix math and rework visuals together |
| Art strategy | Introduce real art assets |
| Asset format | Hand-authored SVG under `assets/art/` |
| `file://` support | Not required — HTTP server only |
| Panda role | Persistent character with expression feedback |
| Language | English only, in all game text and code comments |

`file://` is explicitly out of scope for art loading. The inlined level data in
`main.js` stays as-is; that workaround is unrelated and still harmless. README's
documented flow (`python3 -m http.server 8126`) remains the supported path.

## Design

### Component: expression

Replace the positional, ambiguous `{a, b, missing}` signature with explicit
semantic names so the sum can no longer be confused with an addend:

```js
expression(k, { left: 8, right: "?", sum: 13, x, y, size })
// renders: left + right = sum
```

Each token records which slot it occupies, and the unknown slot is the one
whose value is `"?"` — the component no longer guesses. Callers:

- `level1.js` — `{ left: round.a, right: "?", sum: round.answer }`
- `level3.js` — `{ left: round.a, right: "?", sum: round.answer }`
- `level2.js` — `{ left: round.a, right: "?", sum: round.answer }`, and the
  duplicate patched equation at `level2.js:65` is deleted.

Remove the `font: "monospace"` override so the component inherits the global
game font.

### Component: stepBar

Accept a `labels` array instead of hardcoding one level's wording. Each scene
supplies its own four steps:

- Level 1 — `Count`, `Choose`, `Check`, `Cheer`
- Level 2 — `Find a friend`, `Make 10`, `Add the rest`, `Celebrate`
- Level 3 — `Count on`, `Choose`, `Check`, `Cheer`

### Typography

Kaplay accepts CSS font family names directly in `text({ font })`. This was
verified empirically by rendering the same string in six families and
comparing screenshots — they render distinctly, so no font file needs to be
bundled.

Global family: `Arial Rounded MT Bold`, a native iPadOS face with the rounded,
heavy character appropriate for young children. Fallback chain:
`Arial Rounded MT Bold` → `Trebuchet MS` → `system-ui`.

This avoids bundling a font binary, avoids a `fetch()` dependency, and avoids
font licensing questions entirely.

### Color

Keep the existing CSS custom properties in `styles.css` as the single source of
palette truth, mirrored into a JS constants module for canvas drawing so the two
cannot drift.

One substantive change: the ten-frame currently fills cells with saturated
`#ff8a3d` at full area, which dominates the screen. Filled cells move to a
softer coral with a white inner highlight, keeping the strong orange for
interactive accents only.

### Layout

Move the step bar down and give the back/replay icon buttons their own
top-left column so the step pill no longer collides with them.

### Art

Hand-authored SVG in `assets/art/`, loaded via `k.loadSprite()`. SVG is chosen
over PNG because it stays crisp at any iPad Retina scale, each file is a few KB
of diffable text, and it needs no build step — consistent with the project's
existing no-build constraint.

Planned sprites:

- `panda-idle.svg`, `panda-cheer.svg`, `panda-think.svg`
- `bamboo.svg`, `leaf.svg` — background decoration
- `star.svg`, `lock.svg` — replacing the emoji glyphs
- `badge-1.svg`, `badge-2.svg`, `badge-3.svg` — level card badges

### Panda character

A `components/panda.js` component owns the character and its state:

- `idle` — default, gentle breathing bob
- `cheer` — on a correct answer, paired with `panda-celebrate.mp3`
- `think` — on a wrong answer, paired with `enc-try.mp3`

It appears on the level picker (with `panda-hi.mp3` on entry), persists at the
side of the play area during rounds, and takes center stage on level
completion. This finally uses the two orphaned audio cues already in the repo.

## Testing

The arithmetic fix must be verified mechanically, not by eye. An
automated check drives the game headless and, for **all 18 rounds** across the
three levels, asserts that the three numerals rendered by `expression` satisfy
`left + right === sum`. Reviewing 18 rounds visually is not reliable.

Additional checks:

- Zero console errors across all scenes plus tap interaction (already passing).
- Every sprite referenced by `loadSprite` resolves — no 404s.
- No text node overlaps another in the top-left region.
- Screenshot capture of every scene for visual review.

## Out of scope

- Level data and pedagogy — `data/levels.json` content is unchanged.
- The `file://` boot path for art assets.
- PWA, offline caching, build tooling.
- The `favicon.ico` 404 (cosmetic; may be resolved incidentally by adding art).

# Whack-a-Mole: Mole + Number as One Baked Image

**Date:** 2026-08-15
**Status:** Design (approved in brainstorming, pending user review of written spec)
**Branch:** `feature-20260709-new`

## Goal

Make each whack-a-mole answer a single, visually-integrated image: a panda
mole with the answer number printed on its belly (T-shirt style), rather
than the current "mole + floating yellow badge" composition. The mole
and the number read as one image, not two stacked objects.

## Background

`scenes/gameWhack.js` + `components/whackHole.js` already implement a
working whack-a-mole. Currently each hole composes three kaplay elements:

1. `mole` sprite (one of `mole-1..6`)
2. `badge` (yellow circle)
3. `num` text element

The badge and number are positioned relative to the mole (recent commit
`d24132b` locked them to one visual unit), but visually they still read
as "mole + floating badge", not as one image.

The user wants the mole and number *literally* baked into one image
asset, replacing the runtime composition.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Visual style | Number on the mole's belly (T-shirt style) |
| Number range | 11 through 19 (was 11..18) |
| Variant count | 6 panda variants × 9 numbers = 54 baked PNGs |
| Mole art | Redrawn (current PNGs don't have a clean belly area) |
| Asset generation | 100% AI-generated, 54 unique PNGs |
| Math pool | Type B no-carry lifted from sum ≤ 18 to sum ≤ 19, no new Type C needed |

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  data/whackRounds.js   (答案池 11..19)                  │
│       ↓                                                │
│  scenes/gameWhack.js   (题型 → 6 候选 → 6 洞口)        │
│       ↓                                                │
│  components/whackHole.js   (popUp(value) 切 baked 图)  │
│       ↓                                                │
│  assets/art/mole-{v}-n{num}.png   (54 张 AI 图)        │
└────────────────────────────────────────────────────────┘
```

### Files

**Modified**
- `data/whackRounds.js` — `TYPE_B_POOL` upper bound `18-teen` → `19-teen`; `buildQuestion` constrains candidates to [11..19]
- `components/whackHole.js` — keep `badge`, `num`, `syncBadge` as a fallback path (gated by a `useBakedSprite` flag); on the happy path, `popUp(value)` swaps the mole sprite to `mole-{variant}-n{value}` and skips the badge/num elements
- `scenes/gameWhack.js` — load 54 sprites; preflight sprite-name check; if any are missing, fall back to the legacy badge path
- `main.js` — register 54 new sprites at boot

**New**
- `data/whackPack.js` — central list of 54 sprite names (`mole-1-n11` … `mole-6-n19`); used by the loader and the preflight check
- `tools/make-mole-sprites.mjs` — AI image-generation script. Generates 6 master panda templates (clean belly, no number) and 54 final PNGs (master + number on belly). Supports `--dry-run` for prompt preview only.
- `tools/verify-mole-assets.mjs` — asserts all 54 PNGs exist, are non-trivial in size (> 5 KB), and dimensions are within `[400, 800]`

### Sprite naming

| Category | Naming | Count |
|---|---|---|
| Hole (unchanged) | `mole-hole-{v}` v=1..3 | 3 |
| Mole + number | `mole-{v}-n{num}` v=1..6, num=11..19 | 54 |

Example: `mole-1-n13.png` = variant 1 with `13` on its belly.

### Loading

In `main.js` boot block:

```js
const NUMBERS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
for (let v = 1; v <= 6; v++) {
  for (const num of NUMBERS) {
    k.loadSprite(`mole-${v}-n${num}`, `assets/art/mole-${v}-n${num}.png`);
  }
}
```

54 sprites total. Bundle size est. 5–10 MB.

### Visual behavior migration

| Old behavior | New behavior |
|---|---|
| `badge.color = ORANGE` on selected | Mole gets a separate `k.outline(4, k.rgb(...DANGER))` overlay object (added/removed by `setSelected`) |
| Badge + num double elements | Skipped on the happy path via `useBakedSprite=false` flag; kept as fallback when sprites are missing |
| `flashCorrect` badge scale | Reused as full-mole scale pulse |
| `shake` x-axis | Unchanged |
| `retreat` (sink back) | Unchanged |
| `popUp` rise | Unchanged |

### Math pool extension

Before:
- Type A: `a + b`, `a, b ∈ [1..9]`, `sum ∈ [11..18]`, no twins → 26 pairs
- Type B: `teen + digit`, `teen ∈ [11..18]`, `digit ∈ [1..(18-teen)]`, `sum ∈ [12..18]` → 8 pairs

After:
- Type A: unchanged (26 pairs)
- Type B: `digit ∈ [1..(19-teen)]`, `sum ∈ [12..19]` → 18 pairs

The lift from `18-teen` to `19-teen` adds these sum=19 pairs (all
no-carry teen+singles):

```
11+8, 12+7, 13+6, 14+5, 15+4, 16+3, 17+2, 18+1
```

Existing Type A answers cover 11..18. With Type B extended, the full
answer range is 11..19. No Type C needed.

`buildQuestion` invariants:

- `answer ∈ [11..19]`
- `candidates.length === 6`, all distinct
- `candidates ⊂ [11..19]` (was [1..19] — now restricted since no sprite exists for 1..10 or 20+)

`DISTRACTOR_OFFSETS = [-4, -3, -2, -1, 1, 2, 3, 4]` is unchanged; the
post-application filter `[11..19]` handles the narrower band.

### Preflight sprite check

In `scenes/gameWhack.js` at scene enter, before building any holes:

```js
const NUMBERS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
function hasSprite(name) {
  try { return !!k.getSprite(name); } catch (_) { return false; }
}
const required = [];
for (let v = 1; v <= 6; v++) {
  for (const n of NUMBERS) required.push(`mole-${v}-n${n}`);
}
const missing = required.filter(n => !hasSprite(n));
const useBakedSprite = missing.length === 0;
if (!useBakedSprite) {
  console.warn("[whack] missing sprites, falling back to badge style:", missing);
}
```

If `useBakedSprite === true`, scene uses the new single-sprite path.
If false, whackHole keeps the badge + num composition so the game still
plays during partial asset delivery. The `useBakedSprite` flag is passed
through to `whackHole(k, { ..., useBakedSprite })`.

## Error handling

| Scenario | Response |
|---|---|
| Candidate candidate value out of [11..19] | Silently skip during offset fill; topup from pool neighbors |
| Asset PNG missing | Preflight catch above; fallback to badge style |
| popUp called with non-existent sprite name | WhackHole ignores `use()` failure silently; mole stays blank until next round |
| Hole variant out of [0..5] | Clamp via existing `((v % 6) + 6) % 6` |
| Continue sequence during timeout | Already locked via `state.finished`; popUp animations finish but no new round |
| Player backpress mid-round | `stopAllAudio` + `k.go("gamesPicker")` already in place |

## Testing

### `tools/verify-whack-rounds.mjs` (extend)

- `TYPE_A_POOL` every pair sums to [11..18], operands ∈ [1..9], no twins
- `TYPE_B_POOL` every pair sums to [12..19], one operand ∈ [11..18], other ∈ [1..(19-teen)]
- Run `buildQuestion` 1000 times; assert:
  - `answer ∈ [11..19]`
  - `candidates.length === 6`
  - every candidate ∈ [11..19]
  - candidates distinct
  - answer ∈ candidates

### `tools/verify-mole-assets.mjs` (new)

- All 54 PNGs exist under `assets/art/`
- Each file ≥ 5 KB (not a placeholder)
- Each image width and height ∈ [400, 800]

### `tools/verify-game-whack-render.mjs` (new, optional)

- Launch scene with puppeteer (or manual smoke)
- No console errors
- Canvas 1366×1024
- Snapshot 6 holes each showing a panda with a number

### Manual visual

- All 6 holes show mole + number on belly
- Number is legible
- Selected state: red outline on mole
- `flashCorrect` scales whole mole
- `shake` works on x-axis
- Pool swap on round change

## Out of scope

- Replacing the existing whack hole art (3 variants) — only the moles change
- Audio cue changes — the existing `pickCheerCue` / `pickWrongCue` chain stays
- Timer / streak / star scoring — unchanged
- Level picker / save.js — `unlockedGame` and `starsByGame` keys unchanged
- Other game genres (boat, bounce, cloud, feed) — unaffected

## Risks

- **Asset generation time / quality**: 54 AI-generated PNGs in one pass may
  produce inconsistent style. Mitigation: `make-mole-sprites.mjs` uses
  master panda prompts first, then `with the number N on its belly`
  variants. Review the 6 masters before generating the 54.
- **Bundle size**: 54 PNGs at ~150 KB each = ~8 MB. The game already
  ships Kaplay and audio in `assets/vendor/`; an extra 8 MB is acceptable
  but should be measured.
- **Math pool coverage**: lifting Type B to sum 19 introduces 8 new
  pairs; total pool is 26 + 18 = 44 pairs. Plenty of variety for the
  90-second window.

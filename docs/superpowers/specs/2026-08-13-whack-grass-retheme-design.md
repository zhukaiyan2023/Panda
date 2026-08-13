# Whack-a-Mole Grass Retheme — Design Spec

**Date:** 2026-08-13
**Status:** Approved (auto-completion directive)
**Scope:** Replace the brown-dirt aesthetic of `scenes/gameWhack.js` with a green-grass meadow aesthetic, matching a reference image supplied by the user.

## Motivation

The current whack-a-mole game (`scenes/gameWhack.js`) renders its six holes as two stacked rectangles — a brown dirt mound (240×120) and a darker brown hole (200×50) — giving the scene a flat 2D brown-dirt look. The user supplied a reference image showing a hand-drawn 3D elliptical hole embedded in green grass, with a darker interior, lighter grass-fluff rim, and soft cartoon shading. The user wants the whack scene to feel like a real meadow with the mole popping out of natural-looking holes, not dirt rectangles.

## Scope

This retheme is **whack-only**. The math levels (1/2/3) and the other panda-park games (Boat, Bounce, Cloud, Feed) keep their existing art and chrome.

The retheme covers:

1. **Hole rendering** — replace the two-rect hole drawing with a green 3D-elliptical hole sprite
2. **Ground plane** — add a soft grass ground tile under the 6-hole grid so the holes sit in real ground rather than floating over the meadow background
3. **Mole sprite** — regenerate so the brown dirt baked into the bottom of `mole.svg` is removed (it would clash with the green ground)

## Out of scope

- The bg-meadow scene background (`assets/art/bg-meadow.png`) is unchanged. The ground tile sits on top of it.
- The mole character's pose, expression, and identity stay the same — only the baked-in dirt is removed.
- Gameplay (2-tap mechanic, 75s timer, 5 pairs to win, audio cues, save progression) is unchanged.
- Other panda-park games are unchanged.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | Full grass retheme | User-specified |
| Art source | AI-generated via `minimax-image` skill | User-specified |
| Hole variants | 3 subtle variations, randomly assigned to 6 holes | Adds organic feel without forcing the kid to read distinct styles as different things |
| Ground plane | Separate grass tile under the hole grid | Holes stop looking detached from the background |
| Mole dirt | Regenerate mole sprite via AI without baked dirt | A brown dirt patch on the mole would clash with the green ground |

## Architecture

### New files

- `assets/art/grass-ground.png` — horizontal grass band, ~1200 × 280, with tufts and soft color variation. Palette matches `bg-meadow.png`.
- `assets/art/mole-hole-1.png` — hole variant 1, ~240 × 160, matches the user's reference (3D elliptical, dark interior, grass-fluff rim, soft cartoon shading)
- `assets/art/mole-hole-2.png` — hole variant 2, ~240 × 160, subtle variation of variant 1 (slightly different rim tufts, hole depth, or shading)
- `assets/art/mole-hole-3.png` — hole variant 3, ~240 × 160, another subtle variation
- `components/whackHole.js` — encapsulates per-hole rendering. Replaces the inlined hole-drawing loop currently in `gameWhack.js`.

### Modified files

- `assets/art/mole.png` and `assets/art/mole.svg` — regenerated without the brown dirt baked into the bottom. Same character (cute cartoon mole, pink nose, buck teeth, big eyes). Body sliver at the bottom edge so it disappears cleanly behind the hole sprite.
- `main.js` — register the four new sprites via `k.loadSprite()`.
- `scenes/gameWhack.js` — replace the inlined rect-based hole drawing with a loop that calls `whackHole(k, { x, y, variant })` for each of the 6 holes.

## Component: `components/whackHole.js`

### API

```js
whackHole(k, { x, y, variant }) → hole
```

Returns a `hole` entity:

```js
{
  x, y,                  // center of the hole in scene coordinates
  variant,               // 0..2 (which hole sprite is used)
  occupied: false,       // is a mole currently popped up?
  value: null,           // the number on the mole's badge (1..9), null if not occupied
  popUp(value): void,    // show the mole with the given number; auto-retreats after HOLE_DWELL
  retreat(): void,       // force-retreat the mole immediately (used on correct pair)
  setSelected(bool): void, // highlight or unhighlight the badge
}
```

### Z-order (bottom to top)

1. `bg-meadow` background (rendered by `sceneBg`, unchanged)
2. `grass-ground` tile (z=0): one sprite spanning the hole grid band, behind all holes
3. `mole` sprite (z=1): at hole center, opacity 0 when dormant. When popped, head pokes above the hole rim.
4. Hole sprite (z=2): one of the 3 variants. Covers the mole's body. Dark interior reads as "depth".
5. Badge (z=3): yellow circle drawn on the mole's forehead area.
6. Number (z=4): digit on the badge.

### Internal layout

Each hole owns four Kaplay entities: ground (per-hole sprite not used; the ground tile is one big sprite across all holes), mole sprite, hole sprite, badge circle, number text. The ground tile is added once by `gameWhack.js`, not per hole — it's a single band that the 6 holes sit on.

### Vertical positioning

The mole sprite is positioned so that:
- The mole's center sits ~30px above the hole center
- The mole's head pokes above the hole sprite's top edge
- The mole's body is hidden behind the hole sprite's dark interior

These offsets are calibrated once after the hole sprite is generated; if the sprite dimensions change, the offsets get re-tuned in the same change.

## Refactored `scenes/gameWhack.js`

After the refactor, `gameWhack.js` becomes:

```js
import sceneBg from "../components/sceneBg.js";
import whackHole from "../components/whackHole.js";
// ... other imports

export default function scene(k) {
  sceneBg(k, "bg-meadow");
  // header chrome (back button, step bar, timer, counter, prompt)
  // ...

  // One grass tile across the play area.
  k.add([k.sprite("grass-ground"), k.pos(...), k.z(0)]);

  // Six holes with seeded variant assignment.
  const variants = seededShuffle([0, 0, 1, 1, 2, 2]);
  const holes = [];
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    holes.push(whackHole(k, { x: ..., y: ..., variant: variants[i] }));
  }

  // Game state, spawner, tap handler, finish() — all unchanged.
  // ...
}
```

The spawner, tap handler, and finish logic move into the new scene shape with the only delta being `holes[idx].popUp(value)` instead of directly mutating mole/badge/num opacities.

## Hole variant assignment

Each of the 6 holes picks one of the 3 variants at scene start via a seeded shuffle. The seed is the scene-construction time. This means:

- A single play session shows a stable mix of the 3 variants
- Tests are reproducible (same seed → same assignment)
- The kid sees variety across the 6 holes without random churn during play

The shuffle allocates each variant to exactly 2 of the 6 holes (a `[0,0,1,1,2,2]` multiset), guaranteeing every variant appears at least twice per scene.

## Art generation prompts

### `grass-ground.png`

Prompt template:
> A soft green grass meadow band, ~1200px wide × 280px tall, slightly textured with subtle tufts and color variation, soft cartoon shading, kid-friendly art style, transparent above and below the band so it tiles cleanly against a sky background. Reference palette: warm greens like the existing bg-meadow.png.

### `mole-hole-{1,2,3}.png`

Prompt template:
> A 3D cartoon mole hole in green grass, viewed from slightly above, soft elliptical shape with depth. Dark green-to-black interior showing shadow and depth. Lighter green grass-fluff rim around the top edge, with a few stylized grass blades. Subtle variations between the three variants: variant 1 = balanced, variant 2 = slightly wider/deeper, variant 3 = slightly narrower with more tufts. Transparent background. Kid-friendly cartoon style, no hard edges. ~240×160.

### `mole.png` + `mole.svg` (regenerated)

Prompt template:
> A cute cartoon mole character, head and shoulders only, no ground/dirt/hole in the frame. Same character as before: round head, big black eyes with sparkles, big pink nose, two white buck teeth, tiny smile. Brown body color. Ears pink on the inside. Transparent background. ~256×256. The bottom edge of the body sliver should fade cleanly so it disappears behind whatever is below it.

## Testing

- `tools/verify-games.mjs` already boots `gameWhack` and verifies it loads without console errors. After this change, extend the assertion to check that all 6 hole sprites loaded (no "missing sprite" warnings).
- Add a Playwright snapshot of the new whack scene under `tests/snapshots/whack-grass-retheme.png` so visual regressions catch any breakage.
- Manual verification on iPad Safari (or Chrome desktop with the iPad viewport meta):
  - 6 holes render in the 3×2 grid
  - Ground tile covers the band seamlessly
  - 3 hole variants are visible (different from each other but consistent in style)
  - Mole pops through the hole (head visible, body hidden)
  - Badge + number render correctly on the mole
  - 2-tap mechanic still works (pick 1, pick 2 → score or shake)
  - Timer counts down, finish() fires when 5 pairs are found or time runs out

## Risk and rollback

- **Risk:** the AI-generated art may not match the user's reference image's exact look. **Mitigation:** review the AI output before wiring it into the scene. If it doesn't match, regenerate with a refined prompt or fall back to hand-authoring SVG.
- **Risk:** mole vertical offset needs re-tuning after the new hole sprite is generated. **Mitigation:** calibration is a one-line change in `whackHole.js`; rerun the smoke test to confirm.
- **Rollback:** `git revert` of the change brings back the brown-dirt rendering. No data migration needed.
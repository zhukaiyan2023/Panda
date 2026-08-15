# Whack-a-Mole: Mole + Number as One Baked Sprite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the runtime "mole + floating yellow badge" composition in the whack-a-mole game with 54 pre-baked AI-generated PNGs (6 panda variants × 9 numbers 11–19) where the number is printed on the mole's belly.

**Architecture:** A new `data/whackPack.js` enumerates 54 sprite names. `tools/make-mole-sprites.mjs` generates them via AI. `main.js` registers them at boot. `scenes/gameWhack.js` does a preflight check; if any sprite is missing, falls back to the legacy badge path. `components/whackHole.js` adds a `useBakedSprite` flag that swaps the mole sprite instead of composing badge + num. The math pool extends Type B from sum ≤ 18 to sum ≤ 19 to feed the new answer range.

**Tech Stack:** Kaplay (already in project), vanilla JS, Node ≥ 18 for tooling, AI image generation (provider TBD by user at script-run time).

**Spec:** `docs/superpowers/specs/2026-08-15-whack-mole-number-baked-sprite-design.md`

## Global Constraints

- Node ≥ 18 (existing project requirement)
- Kaplay scene conventions (existing)
- 54 sprite names: `mole-{v}-n{num}` where `v ∈ {1..6}` and `num ∈ {11..19}`
- Math pool answer range: 11..19 (was 11..18)
- Candidates must be distinct and ∈ [11..19]
- No new audio cues; existing `pickCheerCue` / `pickWrongCue` chains stay
- Bundle size: est. 5–10 MB added to `assets/art/`
- Sprite cache-buster: bump `ART_VERSION` in `main.js` when assets change
- All commits must end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` per project agent guidelines

---

## File Structure

**Created**
- `data/whackPack.js` — list of 54 sprite names + helper to expand by variant/num
- `tools/make-mole-sprites.mjs` — AI image-generation prompt orchestrator with `--dry-run`
- `tools/verify-mole-assets.mjs` — verifiers that all 54 PNGs exist and are non-trivial

**Modified**
- `data/whackRounds.js` — Type B upper bound `18-teen` → `19-teen`; candidates clamped to [11..19]
- `components/whackHole.js` — `useBakedSprite` flag; new sprite-swap path on `popUp`; outline overlay on selected
- `scenes/gameWhack.js` — preflight sprite-name check; pass `useBakedSprite` to whackHole; load 54 sprites
- `main.js` — register 54 new sprite names in `SPRITES` array
- `tools/verify-whack-rounds.mjs` — extend assertions to cover 11..19 answer range and candidate band

**Generated (committed as part of task 5)**
- `assets/art/mole-1-n11.png` … `assets/art/mole-6-n19.png` (54 files)

---

## Task 1: Extend the math pool to sum 19

**Files:**
- Modify: `data/whackRounds.js:33-41` (TYPE_B_POOL loop)
- Modify: `data/whackRounds.js:65-82` (buildQuestion candidate fill)
- Test: `tools/verify-whack-rounds.mjs`

**Interfaces:**
- Consumes: existing `TYPE_A_POOL`, `TYPE_B_POOL`, `buildQuestion`, `pickType`
- Produces: updated `TYPE_B_POOL` with sum up to 19; `buildQuestion` produces candidates ⊂ [11..19]

- [ ] **Step 1: Update the failing test expectations**

In `tools/verify-whack-rounds.mjs`, change the two assertions that pin the answer range from `[11..18]` to `[11..19]`:

```js
// Pool sanity for Type B
// Line 31: change `if (s < 11 || s > 18) fail(` to:
if (s < 11 || s > 19) fail(`Type B sum (${teen}+${d}) = ${s}, not in 11..19`);

// Line 32: change `if (TYPE_B_POOL.length < 20)` to:
// Keep as-is; expect ≥ 18 pairs (was 8, now 18 after extension)

// buildQuestion invariants
// Line 48: change `if (q.answer < 11 || q.answer > 18)` to:
if (q.answer < 11 || q.answer > 19) fail(`roundIdx=${i}: answer=${q.answer} not in 11..19`);

// Lines 56-58: change the candidate range check from 1..19 to 11..19:
for (const c of q.candidates) {
  if (c < 11 || c > 19) fail(`roundIdx=${i}: candidate ${c} out of 11..19`);
}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node tools/verify-whack-rounds.mjs`
Expected: FAIL with at least:
- `Type B sum (11+8) = 19, not in 11..19`
- `Type B sum (12+7) = 19, not in 11..19`
- ... (8 new sum=19 pairs)
- `roundIdx=N: candidate 7 out of 11..19` (or similar, several rounds)

- [ ] **Step 3: Lift the Type B upper bound**

In `data/whackRounds.js`, change the `TYPE_B_POOL` loop upper bound:

```js
const TYPE_B_POOL = (() => {
  const pairs = [];
  for (let teen = 11; teen <= 18; teen++) {
    // 19-teen is the max digit that keeps the sum ≤19 (no carry-out, plus the
    // 18+1=19 edge). For teen=11: d≤8 → 11+8=19 is included. For teen=18: d≤1
    // → 18+1=19 is included. For teen=10 not in range (we keep teens ≥11).
    for (let d = 1; d <= 19 - teen; d++) {
      if (d >= 1) pairs.push([teen, d]);
    }
  }
  return pairs;
})();
```

(The `if (d >= 1)` guard is now redundant since `d` starts at 1, but it's left in for symmetry with the existing structure and to keep the diff minimal.)

- [ ] **Step 4: Clamp candidates to [11..19] in `buildQuestion`**

In `data/whackRounds.js`, change the candidate-fill loop:

```js
function buildQuestion(type, prevKey = null) {
  const pool = type === "A" ? TYPE_A_POOL : TYPE_B_POOL;
  let pick;
  let tries = 0;
  do {
    pick = pool[Math.floor(Math.random() * pool.length)];
    tries++;
    if (tries > 20) break;
  } while (`${pick[0]}-${pick[1]}` === prevKey);

  const [a, b] = pick;
  const answer = a + b;
  const candidates = [answer];
  // Clamp candidate band to [11..19] — these are the only digits that have
  // a baked sprite. Distractor offsets up to ±4 from an answer in [11..18]
  // can otherwise drop into 7..23, which has no asset.
  for (const off of DISTRACTOR_OFFSETS) {
    const d = answer + off;
    if (d >= 11 && d <= 19 && !candidates.includes(d)) {
      candidates.push(d);
      if (candidates.length === 6) break;
    }
  }
  // Topup from immediate neighbors if we couldn't fill 6 (e.g. answer=11
  // with offset=-4 → 7 → skipped; offset=-3 → 8 → skipped; etc.)
  let topup = 1;
  while (candidates.length < 6 && topup <= 9) {
    const lo = answer - topup;
    const hi = answer + topup;
    if (lo >= 11 && !candidates.includes(lo)) candidates.push(lo);
    if (candidates.length === 6) break;
    if (hi <= 19 && !candidates.includes(hi)) candidates.push(hi);
    topup++;
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return { type, a, b, answer, candidates, key: `${a}-${b}` };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `node tools/verify-whack-rounds.mjs`
Expected: PASS, with `TYPE_B_POOL has 18 pairs` and `1000 buildQuestion samples: ... all hold`.

- [ ] **Step 6: Commit**

```bash
git add data/whackRounds.js tools/verify-whack-rounds.mjs
git commit -m "feat(whack): extend math pool to sum 19, clamp candidates to 11..19"
```

---

## Task 2: Add the sprite pack manifest

**Files:**
- Create: `data/whackPack.js`

**Interfaces:**
- Consumes: nothing
- Produces: `WHACK_NUMBERS` (number[]), `WHACK_VARIANTS` (number[]), `spriteName(v, num)` (string), `ALL_SPRITE_NAMES` (string[])

- [ ] **Step 1: Create `data/whackPack.js`**

```js
// data/whackPack.js — single source of truth for the 54 mole-with-number
// sprite names. Used by main.js (boot loader), scenes/gameWhack.js
// (preflight check), and tools/verify-mole-assets.mjs (assertion target).
//
// 6 panda variants × 9 numbers = 54 baked PNGs.
// Numbers 11..19 are the only ones with a sprite; the math pool is
// constrained to this range in data/whackRounds.js.

export const WHACK_NUMBERS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
export const WHACK_VARIANTS = [1, 2, 3, 4, 5, 6];

export function spriteName(variant, num) {
  return `mole-${variant}-n${num}`;
}

export const ALL_SPRITE_NAMES = (() => {
  const out = [];
  for (const v of WHACK_VARIANTS) {
    for (const n of WHACK_NUMBERS) {
      out.push(spriteName(v, n));
    }
  }
  return out;
})();
```

- [ ] **Step 2: Verify the file imports cleanly**

Run: `node -e "import('./data/whackPack.js').then(m => console.log(m.ALL_SPRITE_NAMES.length, m.spriteName(3, 15)))"`
Expected: `54 mole-3-n15`

- [ ] **Step 3: Commit**

```bash
git add data/whackPack.js
git commit -m "feat(whack): add sprite pack manifest for 54 baked mole+number PNGs"
```

---

## Task 3: Add the AI sprite generation script

**Files:**
- Create: `tools/make-mole-sprites.mjs`

**Interfaces:**
- Consumes: `WHACK_VARIANTS`, `WHACK_NUMBERS`, `spriteName` from `../data/whackPack.js`
- Produces: 54 PNG files at `assets/art/mole-{v}-n{num}.png` (or `--dry-run` only prints prompts)

- [ ] **Step 1: Create `tools/make-mole-sprites.mjs`**

```js
// tools/make-mole-sprites.mjs — generate 54 mole+number PNGs via AI.
//
// Run: node tools/make-mole-sprites.mjs --dry-run
//      node tools/make-mole-sprites.mjs --provider=openai --out=assets/art
//
// Phase 1: 6 master panda templates (clean belly, no number) → assets/art/mole-master-{v}.png
// Phase 2: 54 final PNGs (master + number on belly) → assets/art/mole-{v}-n{num}.png
//
// The image provider is intentionally pluggable. The default `--dry-run`
// mode prints the prompts without calling any external API so the prompts
// can be reviewed before any cost is incurred.

import { WHACK_VARIANTS, WHACK_NUMBERS, spriteName } from "../data/whackPack.js";

const args = parseArgs(process.argv.slice(2));
const dryRun = args.dryRun === true;
const provider = args.provider || "dry-run";
const outDir = args.out || "assets/art";

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--provider=")) out.provider = a.slice("--provider=".length);
    else if (a.startsWith("--out=")) out.out = a.slice("--out=".length);
  }
  return out;
}

const MASTER_PROMPT = (v) =>
  `A cute cartoon baby panda illustration, front-facing, looking straight at the viewer, ` +
  `with a clean light-cream belly area where a number can be printed, ` +
  `children's book style, soft pastel colors, no text, no number, no badge, ` +
  `panda variant #${v} (different ear tilt / eye shape / arm pose), ` +
  `white background, PNG, square aspect ratio`;

const FINAL_PROMPT = (v, n) =>
  `A cute cartoon baby panda illustration, front-facing, looking straight at the viewer, ` +
  `the number ${n} printed clearly on its belly like a T-shirt, large bold sans-serif digits, ` +
  `children's book style, soft pastel colors, panda variant #${v}, ` +
  `white background, PNG, square aspect ratio`;

async function generate(prompt, outPath) {
  if (dryRun) {
    console.log(`[dry-run] -> ${outPath}\n         ${prompt}\n`);
    return;
  }
  // Real provider wiring is intentionally left as a stub. At execution time
  // the engineer should fill in:
  //   - the provider SDK call (OpenAI images.generate, Replicate, etc.)
  //   - the path to write the returned binary to outPath
  // Example shape for OpenAI:
  //   const r = await openai.images.generate({ model: "dall-e-3", prompt, size: "1024x1024" });
  //   const buf = Buffer.from(await fetch(r.data[0].url).then(r => r.arrayBuffer()));
  //   await fs.writeFile(outPath, buf);
  throw new Error(`Real provider '${provider}' not yet wired; run --dry-run first to review prompts.`);
}

async function main() {
  console.log(`Whack mole sprite generation`);
  console.log(`Provider: ${provider}`);
  console.log(`Out dir:  ${outDir}`);
  console.log(`Dry run:  ${dryRun}`);
  console.log("");

  // Phase 1: 6 master pandas
  for (const v of WHACK_VARIANTS) {
    await generate(MASTER_PROMPT(v), `${outDir}/mole-master-${v}.png`);
  }

  // Phase 2: 54 final PNGs
  for (const v of WHACK_VARIANTS) {
    for (const n of WHACK_NUMBERS) {
      await generate(FINAL_PROMPT(v, n), `${outDir}/${spriteName(v, n)}.png`);
    }
  }

  console.log(`\nDone. ${dryRun ? "Prompts printed; no files written." : "Files written."}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run `--dry-run` to verify the prompts**

Run: `node tools/make-mole-sprites.mjs --dry-run`
Expected: 60 prompts printed (6 master + 54 final), each prefaced with `[dry-run] -> assets/art/...`. No files written.

- [ ] **Step 3: Spot-check 1 prompt and verify the file path is correct**

Run: `node tools/make-mole-sprites.mjs --dry-run 2>&1 | grep -E "mole-1-n13|mole-6-n19" | head -5`
Expected: 2 lines printing the prompts for `mole-1-n13.png` and `mole-6-n19.png`.

- [ ] **Step 4: Commit**

```bash
git add tools/make-mole-sprites.mjs
git commit -m "feat(whack): add AI sprite generation script with --dry-run"
```

---

## Task 4: Add the asset verification script

**Files:**
- Create: `tools/verify-mole-assets.mjs`

**Interfaces:**
- Consumes: `ALL_SPRITE_NAMES` from `../data/whackPack.js`
- Produces: process exit 0 if all 54 PNGs exist + look right, exit 1 otherwise

- [ ] **Step 1: Create `tools/verify-mole-assets.mjs`**

```js
// tools/verify-mole-assets.mjs — verify all 54 baked mole+number PNGs exist
// and are non-trivial. Run: node tools/verify-mole-assets.mjs

import { readFile, stat } from "node:fs/promises";
import { ALL_SPRITE_NAMES } from "../data/whackPack.js";

const ASSET_DIR = "assets/art";
const MIN_BYTES = 5 * 1024; // 5 KB — anything smaller is a placeholder

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL ${m}`); };
const ok   = (m) => console.log(`  ok   ${m}`);

async function pngDimensions(buf) {
  // PNG signature: 8 bytes, then IHDR chunk (4 length + 4 type + 13 data)
  // Width is at offset 16, height at offset 20, both big-endian uint32.
  if (buf.length < 24) return null;
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

console.log("Asset existence:");
if (ALL_SPRITE_NAMES.length !== 54) fail(`ALL_SPRITE_NAMES length is ${ALL_SPRITE_NAMES.length}, expected 54`);
else ok(`ALL_SPRITE_NAMES has 54 entries`);

for (const name of ALL_SPRITE_NAMES) {
  const path = `${ASSET_DIR}/${name}.png`;
  let st;
  try { st = await stat(path); }
  catch (_) { fail(`missing: ${path}`); continue; }
  if (st.size < MIN_BYTES) fail(`too small: ${path} (${st.size} bytes)`);
}

console.log("\nAsset dimensions:");
for (const name of ALL_SPRITE_NAMES) {
  const path = `${ASSET_DIR}/${name}.png`;
  let buf;
  try { buf = await readFile(path); }
  catch (_) continue; // already reported above
  const dim = await pngDimensions(buf);
  if (!dim) { fail(`not a valid PNG: ${path}`); continue; }
  if (dim.w < 400 || dim.w > 800 || dim.h < 400 || dim.h > 800) {
    fail(`out of range: ${path} ${dim.w}×${dim.h}`);
  }
}

console.log("");
if (failures.length === 0) {
  console.log("All 54 mole+number assets PASS.");
  process.exit(0);
} else {
  console.error(`${failures.length} failures.`);
  process.exit(1);
}
```

- [ ] **Step 2: Run the verifier (expect failures — no assets yet)**

Run: `node tools/verify-mole-assets.mjs`
Expected: 54 `FAIL missing: ...` lines (no PNGs exist yet). Exit code 1.

- [ ] **Step 3: Commit**

```bash
git add tools/verify-mole-assets.mjs
git commit -m "feat(whack): add asset verification script (54 PNGs)"
```

---

## Task 5: Generate the 54 PNGs (manual/AI step)

**Files:**
- Read: `tools/make-mole-sprites.mjs` (output paths)
- Generate: 54 PNGs at `assets/art/mole-{v}-n{num}.png` (plus 6 master PNGs as intermediates)

This task is interactive — the engineer runs the AI generation step.

- [ ] **Step 1: Wire the AI provider into `tools/make-mole-sprites.mjs`**

In the `generate` function, replace the `throw new Error(...)` stub with a real provider call. The exact wiring depends on the chosen provider (OpenAI, Replicate, Stability, etc). Required: write the returned binary to `outPath`.

Reference shape for OpenAI:
```js
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
const client = new OpenAI();
async function generate(prompt, outPath) {
  if (dryRun) { console.log(`[dry-run] -> ${outPath}\n         ${prompt}\n`); return; }
  const r = await client.images.generate({ model: "dall-e-3", prompt, size: "1024x1024", n: 1 });
  const res = await fetch(r.data[0].url);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}
```

Other providers follow the same pattern: call API → fetch or decode bytes → write to disk.

- [ ] **Step 2: Run the generation**

Run: `node tools/make-mole-sprites.mjs --provider=<chosen> --out=assets/art`
Expected: 60 prompts processed; 54 final PNGs written to `assets/art/mole-{v}-n{num}.png` plus 6 master PNGs.

If the provider errors partway through, re-run the script; it will regenerate missing files. (Add idempotency if needed: skip files that already exist and pass `--size` check.)

- [ ] **Step 3: Verify all 54 PNGs pass the asset check**

Run: `node tools/verify-mole-assets.mjs`
Expected: `All 54 mole+number assets PASS.`

- [ ] **Step 4: Spot-check 3 PNGs manually**

Open `assets/art/mole-1-n11.png`, `assets/art/mole-3-n15.png`, `assets/art/mole-6-n19.png` in a viewer and confirm:
- Number is legible on the belly
- Style is consistent across the 3
- Number does NOT appear on the head (it's on the belly, not floating above)

If numbers appear in the wrong place or look inconsistent, regenerate those specific files with refined prompts.

- [ ] **Step 5: Commit**

```bash
git add assets/art/mole-master-1.png assets/art/mole-master-2.png assets/art/mole-master-3.png \
  assets/art/mole-master-4.png assets/art/mole-master-5.png assets/art/mole-master-6.png \
  assets/art/mole-1-n11.png assets/art/mole-1-n12.png assets/art/mole-1-n13.png \
  # ... (all 54 mole-{v}-n{num}.png files)
  git commit -m "feat(whack): add 54 baked mole+number PNGs (6 variants × 11..19)"
```

(If asset files are large, consider `git add assets/art/` and a single commit.)

---

## Task 6: Update `whackHole` to support the baked-sprite path

**Files:**
- Modify: `components/whackHole.js`

**Interfaces:**
- Consumes: existing whackHole API; new `useBakedSprite` option in the constructor
- Produces: when `useBakedSprite=true`, the mole sprite is swapped on `popUp(value)` and no badge/num is created; when `false`, behavior is unchanged

- [ ] **Step 1: Add the `useBakedSprite` flag and gate the badge/num creation**

In `components/whackHole.js`, modify the constructor signature and the badge/num creation:

```js
export default function whackHole(k, { x, y, variant, useBakedSprite = false }) {
  const v = ((variant % 6) + 6) % 6;  // 0..5 for sprite mole-{v+1}-n{num}

  const hole = k.add([
    k.sprite(`mole-hole-${(v % 3) + 1}`),  // 3 hole variants
    k.pos(x, y),
    k.anchor("center"),
    k.scale(HOLE_SCALE),
    k.z(2),
  ]);

  const mole = k.add([
    k.sprite("mole-1"),  // placeholder; popUp() will use the real one
    k.pos(x, y + MOLE_Y_OFFSET + POP_TRAVEL),
    k.anchor("center"),
    k.scale(MOLE_SCALE),
    k.opacity(0),
    k.area(),
    k.z(1),
  ]);

  // Outline overlay for the selected state. Created in the baked-sprite
  // path because there is no badge to color-swap. In the legacy path,
  // selected state is communicated by the badge color.
  let outline = null;
  if (useBakedSprite) {
    outline = k.add([
      k.rect(180, 180, { radius: 30 }),
      k.outline(4, k.rgb(...DANGER)),
      k.color(255, 255, 255),  // transparent fill
      k.opacity(0),            // invisible until selected
      k.pos(x, y + MOLE_Y_OFFSET),
      k.anchor("center"),
      k.z(0),
    ]);
  }

  // Legacy badge + num (only when NOT using baked sprites).
  let badge = null;
  let num = null;
  if (!useBakedSprite) {
    badge = k.add([
      k.circle(BADGE_RADIUS),
      k.color(...YELLOW),
      k.outline(3, k.rgb(...INK)),
      k.pos(x, y + MOLE_Y_OFFSET + BADGE_OFFSET_Y),
      k.anchor("center"),
      k.opacity(0),
      k.z(3),
    ]);
    num = k.add([
      k.text("0", { size: 36, font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif" }),
      k.color(...INK),
      k.pos(x, y + MOLE_Y_OFFSET + BADGE_OFFSET_Y),
      k.anchor("center"),
      k.opacity(0),
      k.z(4),
    ]);
  }

  // ... (rest of the function: syncBadge, hideVisual, showVisual, popUp, etc.)
```

- [ ] **Step 2: Replace `popUp` to swap the mole sprite when in baked mode**

In the `popUp` function, after the variant-randomization block, add the baked-sprite swap:

```js
function popUp(v_) {
  cancelBobFn();
  cancelAnimationFn();

  occupied = true;
  value = v_;

  if (useBakedSprite) {
    // Switch the mole sprite to the baked variant + number image.
    // spriteName() lives in data/whackPack.js.
    const name = window.__whackSpriteName ? window.__whackSpriteName(v + 1, v_) : `mole-${v + 1}-n${v_}`;
    mole.use(k.sprite(name));
  } else {
    num.text = String(v_);
    const variantIdx = 1 + Math.floor(Math.random() * 6);
    mole.use(k.sprite(`mole-${variantIdx}`));
  }

  // ... (rest of the original popUp unchanged: startY, endY, mole.pos, animation, etc.)
}
```

(The `window.__whackSpriteName` indirection lets the sprite-name function be injected by the scene at construction time, avoiding a static import cycle.)

- [ ] **Step 3: Update `setSelected` to drive the outline overlay**

```js
function setSelected(on) {
  if (useBakedSprite) {
    if (outline) outline.opacity = on ? 1 : 0;
  } else if (badge) {
    badge.color = k.rgb(...(on ? ORANGE : YELLOW));
  }
}
```

- [ ] **Step 4: Update `syncBadge` to be a no-op when baked, and gate the legacy moves**

```js
function syncBadge() {
  if (useBakedSprite) {
    if (outline) {
      outline.pos.x = mole.pos.x;
      outline.pos.y = mole.pos.y;
    }
    return;
  }
  if (badge && num) {
    badge.pos.x = mole.pos.x + BADGE_OFFSET_X;
    badge.pos.y = mole.pos.y + BADGE_OFFSET_Y;
    num.pos.x = badge.pos.x;
    num.pos.y = badge.pos.y;
  }
}

function hideVisual() {
  mole.opacity = 0;
  if (outline) outline.opacity = 0;
  if (badge) badge.opacity = 0;
  if (num) num.opacity = 0;
}

function showVisual() {
  mole.opacity = 1;
  if (outline) outline.opacity = 0;  // outline stays hidden until selected
  if (badge) badge.opacity = 1;
  if (num) num.opacity = 1;
}
```

The retreat animation's `opacity = 1 - t` line also needs to gate the outline:

```js
// In retreat(), in the onUpdate callback:
const opacity = 1 - t;
mole.opacity = opacity;
if (outline) outline.opacity = (outline.opacity > 0) ? opacity : 0;
if (badge) badge.opacity = opacity;
if (num) num.opacity = opacity;
```

- [ ] **Step 5: Commit**

```bash
git add components/whackHole.js
git commit -m "feat(whack): add useBakedSprite path to whackHole (mole + number = one sprite)"
```

---

## Task 7: Update `scenes/gameWhack.js` to preflight check and pass the flag

**Files:**
- Modify: `scenes/gameWhack.js`

**Interfaces:**
- Consumes: `ALL_SPRITE_NAMES`, `spriteName` from `data/whackPack.js`
- Produces: at scene enter, sets `useBakedSprite` based on a sprite-name check; passes it to `whackHole`

- [ ] **Step 1: Add the import**

In `scenes/gameWhack.js`, add at the top of the imports:

```js
import { ALL_SPRITE_NAMES, spriteName } from "../data/whackPack.js?v=20260815";
```

- [ ] **Step 2: Add the preflight check inside the scene function**

After the constants and before `iconButton`, add:

```js
function hasSprite(k, name) {
  try { return !!k.getSprite(name); } catch (_) { return false; }
}

const missingSprites = ALL_SPRITE_NAMES.filter((n) => !hasSprite(k, n));
const useBakedSprite = missingSprites.length === 0;
if (!useBakedSprite) {
  console.warn(`[whack] missing ${missingSprites.length} sprites, falling back to badge style:`, missingSprites.slice(0, 5));
}
window.__whackSpriteName = spriteName;  // whackHole.popUp reads this
```

- [ ] **Step 3: Pass `useBakedSprite` to `whackHole`**

In the hole-creation loop, update the `whackHole` call:

```js
const h = whackHole(k, { x, y, variant: variants[i], useBakedSprite });
h._tapped = false;
holes.push(h);
```

- [ ] **Step 4: Boot the scene and check the console**

Run the dev server (per the README: `python3 -m http.server 8126`) and navigate to the whack game. Open the browser console. Expected:
- No errors
- `[whack]` warning only if assets are missing (which they shouldn't be after Task 5)
- 6 holes visible, each showing a panda with the answer number on its belly

- [ ] **Step 5: Commit**

```bash
git add scenes/gameWhack.js
git commit -m "feat(whack): preflight sprite check + useBakedSprite flag passthrough"
```

---

## Task 8: Register the 54 sprites in `main.js` boot

**Files:**
- Modify: `main.js:999-1000` (SPRITES array), `main.js:1011` (ART_VERSION)

**Interfaces:**
- Consumes: `ALL_SPRITE_NAMES` from `data/whackPack.js`
- Produces: 54 sprite names registered; `ART_VERSION` bumped

- [ ] **Step 1: Add the import**

In `main.js`, add at the top:

```js
import { ALL_SPRITE_NAMES } from "./data/whackPack.js?v=20260815";
```

- [ ] **Step 2: Extend the `SPRITES` array**

Replace the existing whack sprite lines:

```js
  // whack-a-mole (added 2026-08-15): 6 ink moles + 3 hole variants + grass strip
  "mole-1", "mole-2", "mole-3", "mole-4", "mole-5", "mole-6",
  "mole-hole-1", "mole-hole-2", "mole-hole-3",
  "grass-ground",
];
```

with:

```js
  // whack-a-mole (added 2026-08-15): 6 ink moles + 3 hole variants + grass strip
  "mole-1", "mole-2", "mole-3", "mole-4", "mole-5", "mole-6",
  "mole-hole-1", "mole-hole-2", "mole-hole-3",
  "grass-ground",
  // baked mole+number PNGs (6 variants × 9 numbers = 54) — added 2026-08-15
  ...ALL_SPRITE_NAMES,
];
```

- [ ] **Step 3: Bump the ART_VERSION**

Change `ART_VERSION = "20260815"` to `ART_VERSION = "20260815-mole"` (or `20260815b`). The cache-buster forces the browser to re-fetch the new sprite set.

- [ ] **Step 4: Boot the scene and verify all 54 sprites load**

Run the dev server and open the whack game. In the browser console, run:

```js
const missing = ALL_SPRITE_NAMES.filter(n => !k.getSprite(n));
console.log("missing:", missing);
```

Expected: `missing: []` (empty array). Then visually verify the 6 holes have pandas with numbers on their bellies.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat(whack): register 54 baked mole+number sprites in main.js boot"
```

---

## Task 9: Final verification — math, assets, and visual smoke

**Files:**
- Test: `tools/verify-whack-rounds.mjs`
- Test: `tools/verify-mole-assets.mjs`
- Manual: visual smoke

- [ ] **Step 1: Run the math pool verifier**

Run: `node tools/verify-whack-rounds.mjs`
Expected: `All whack-rounds invariants PASS.`

- [ ] **Step 2: Run the asset verifier**

Run: `node tools/verify-mole-assets.mjs`
Expected: `All 54 mole+number assets PASS.`

- [ ] **Step 3: Visual smoke test**

Run the dev server and play one full round of whack-a-mole:
- All 6 holes show a panda with a number on its belly
- The number is legible from iPad distance
- Tap correct answer → mole flashes, celebration plays, new round starts
- Tap wrong answer → mole shakes, wrong cue plays, new round starts
- Selected state shows a red outline around the mole
- 90-second timer counts down; timeout shows the summary screen

- [ ] **Step 4: Final commit (only if any fix-ups were needed)**

If any of the above surfaced an issue, fix it and commit. If everything passed, no commit is needed.

---

## Self-Review

### 1. Spec coverage

| Spec section | Task |
|---|---|
| Goal statement (baked sprite) | Tasks 5, 6, 7, 8 |
| Decisions (visual, range, generation) | All tasks |
| Architecture / files | Tasks 1, 2, 5, 6, 7, 8 |
| Sprite naming | Tasks 2, 3, 5, 8 |
| Loading | Task 8 |
| Visual behavior migration | Task 6 |
| Math pool extension (Type B to 19) | Task 1 |
| buildQuestion invariants | Task 1 |
| Candidates clamped to [11..19] | Task 1 |
| Preflight sprite check | Task 7 |
| Error handling | Tasks 6, 7 (fallback), 1 (clamp) |
| Test: verify-whack-rounds | Task 1 (extension) |
| Test: verify-mole-assets | Tasks 4, 5 |
| Test: visual smoke | Task 9 |
| Out of scope (audio, scoring, etc.) | Not addressed (correct — preserved) |
| Risks (asset generation, bundle size) | Task 5 (review step), Task 9 (bundle visible) |

All spec requirements are covered. No gaps.

### 2. Placeholder scan

Searched for "TBD", "TODO", "add appropriate", "fill in details", "similar to Task N". Found:
- Task 5 step 1 leaves the provider integration as an example stub for the engineer to fill in. This is intentional — the choice of AI provider is an execution-time decision, not a design one. The example shape is concrete enough to be informative without pretending to be a specific implementation.

### 3. Type consistency

- `spriteName(v, num)` returns `string` — used identically in Tasks 2, 3, 5, 7, 8.
- `ALL_SPRITE_NAMES` is `string[]` — used in Tasks 2, 4, 7, 8.
- `useBakedSprite` is `boolean` — used in Tasks 6, 7.
- `WHACK_NUMBERS` is `number[]` — used in Tasks 2, 3.
- `WHACK_VARIANTS` is `number[]` — used in Tasks 2, 3.

All consistent across tasks. No `clearLayers` vs `clearFullLayers` style mismatches.

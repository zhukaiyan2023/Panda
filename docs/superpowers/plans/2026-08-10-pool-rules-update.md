# Pool Rules Update + L2 Step-4 Visual Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update L1 三数相加 and L2 凑十法 pool generation rules per the new user spec, and fix the L2 step-4 visual so it shows `big + (split)` regardless of which addend is in front.

**Architecture:** Replace the `generateL1Pool()` and `generateL2Pool()` bodies with the new filtering rules. Drop the dead `isMakeTen` dispatch in `level2.js` now that every L2 round is make-ten. Fix the L2 step-4 equation by using `big` (computed) instead of `round.a` (raw) as the leading addend. Update the pool-sizes doc.

**Tech Stack:** Plain JavaScript (no framework for the pool generators), Kaplay for the scene, Playwright for `verify-math.mjs`.

## Global Constraints

- Pool generators are pure functions of the level schema — no I/O, no randomness. The shuffle lives in `roundScene.js`.
- L3 二十以内 is unchanged.
- All counts verified in the spec (L1 = 337, L2 = 36, L3 = 54).
- Round shape for L1: `{ kind: "three-sum", nums: [a, b, c], answer: sum }`.
- Round shape for L2: `{ kind: "make-ten", a, b, need, rest, answer: sum }`.

---

## File Structure

| File | Change | Why |
| ---- | ------ | --- |
| `data/pools.js` | Modify `generateL1Pool()` and `generateL2Pool()` | New filtering rules |
| `scenes/level2.js` | Modify step 4 equation; remove `isMakeTen` dispatch | Visual fix + dead-code cleanup |
| `docs/POOL-SIZES.md` | Update table + drop the old breakdown | Doc reflects new pool sizes |

---

### Task 1: Rewrite `generateL1Pool()`

**Files:**
- Modify: `data/pools.js:22-67` (the `generateL1Pool` function and its doc comment above it)

**Interfaces:**
- Consumes: nothing (pure function)
- Produces: `levelPools[1]` — array of 337 round objects

- [ ] **Step 1: Verify the current count is 200**

Run from the project root:
```bash
node -e "import('./data/pools.js').then(m => console.log('L1:', m.levelPools[1].length))"
```
Expected output: `L1: 200`

- [ ] **Step 2: Replace `generateL1Pool()` body**

In `data/pools.js`, replace the `generateL1Pool` function (including its doc comment) with:

```javascript
// L1 — 三数相加.
// Enumerate ordered triples (a, b, c) with each ∈ {1..9} that satisfy
// EITHER (a) a+b+c ≤ 10 (kid can count on fingers) OR (b) two of the
// three addends sum to 10 (the make-a-ten strategy applies). The two
// sets are disjoint (sum ≤ 10 + two-sum-to-10 forces the third to be
// ≤ 0, but all addends ≥ 1, so no overlap).
//
// Count: 120 (sum ≤ 10) + 217 (≥ one pair sums to 10, by
// inclusion-exclusion) = 337 ordered triples. See
// docs/superpowers/specs/2026-08-10-pool-rules-update-design.md for
// the full derivation.
function generateL1Pool() {
  const pool = [];
  // Loop 1 — sum ≤ 10 (no 0s, all positive addends).
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      for (let c = 1; c <= 9; c++) {
        const sum = a + b + c;
        if (sum > 10) continue;
        pool.push({ kind: "three-sum", nums: [a, b, c], answer: sum });
      }
    }
  }
  // Loop 2 — at least one pair sums to 10.
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      for (let c = 1; c <= 9; c++) {
        const ten = a + b === 10 || a + c === 10 || b + c === 10;
        if (!ten) continue;
        pool.push({ kind: "three-sum", nums: [a, b, c], answer: a + b + c });
      }
    }
  }
  return pool;
}
```

- [ ] **Step 3: Verify the new count is 337**

Run:
```bash
node -e "import('./data/pools.js').then(m => console.log('L1:', m.levelPools[1].length))"
```
Expected output: `L1: 337`

- [ ] **Step 4: Verify every round has the expected shape**

Run:
```bash
node -e "
import('./data/pools.js').then(m => {
  const pool = m.levelPools[1];
  const bad = pool.filter(r => r.kind !== 'three-sum' || !Array.isArray(r.nums) || r.nums.length !== 3 || r.answer !== r.nums[0] + r.nums[1] + r.nums[2]);
  console.log('L1 bad rounds:', bad.length);
  const hasZero = pool.filter(r => r.nums.includes(0));
  console.log('L1 rounds with 0:', hasZero.length);
  const overflow = pool.filter(r => r.nums.some(n => n > 9));
  console.log('L1 rounds with >9:', overflow.length);
});
"
```
Expected output:
```
L1 bad rounds: 0
L1 rounds with 0: 0
L1 rounds with >9: 0
```

- [ ] **Step 5: Commit**

```bash
git add data/pools.js
git commit -m "L1 pool: rewrite per new rules (337 triples, no 0s)"
```

---

### Task 2: Rewrite `generateL2Pool()`

**Files:**
- Modify: `data/pools.js:69-162` (the `generateL2Pool` function and its doc comment)
- Modify: `data/pools.js:8-16` (the file-header comment at the top describing pool sizes)

**Interfaces:**
- Consumes: nothing (pure function)
- Produces: `levelPools[2]` — array of 36 round objects, all `kind: "make-ten"`

- [ ] **Step 1: Verify the current count is 200**

Run:
```bash
node -e "import('./data/pools.js').then(m => console.log('L2:', m.levelPools[2].length))"
```
Expected output: `L2: 200`

- [ ] **Step 2: Update the file-header comment**

In `data/pools.js`, replace the file-header pool-size block (the comment block at the top of the file that lists pool sizes) with:

```javascript
// Pool sizes (per the project goal):
//   L1 三数相加  — 337 triples (sum ≤ 10 OR two-sum-to-10), sample 10
//   L2 凑十法    — 36 ordered (a, b) pairs, both single digits, sum > 10.
//                  Sample 10 per session. See generateL2Pool for the
//                  derivation.
//   L3 二十以内  — full enumeration (54), sample 10
```

- [ ] **Step 3: Replace `generateL2Pool()` body**

In `data/pools.js`, replace the entire `generateL2Pool` function (including its doc comment) with:

```javascript
// L2 — 凑十法.
// Make-ten is the strategy of splitting the smaller addend so the
// larger + part-of-smaller = 10, then adding the leftover. The math
// ONLY works when big ≤ 10 (otherwise need = 10 - big is negative).
//
// Pool: ordered (a, b) pairs where:
//   a, b ∈ {1..9}
//   a + b > 10
// Math derivation per pair:
//   big   = max(a, b)
//   small = min(a, b)
//   need  = 10 - big     (big + need = 10)
//   rest  = small - need  (need + rest = small)
//
// Count: for each a in 1..9, b in 1..9 with a+b > 10:
//   a=1: 0, a=2: 1, a=3: 2, ..., a=9: 8
//   Total: 0+1+2+...+8 = 36 ordered pairs.
//
// Variety: roundScene samples 10 of 36 per session, so the number of
// distinct orderings is P(36, 10) ≈ 1.0 × 10¹⁴ — effectively infinite
// replay variety.
function generateL2Pool() {
  const pool = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      const sum = a + b;
      if (sum <= 10) continue;
      const big = a >= b ? a : b;
      const small = a >= b ? b : a;
      const need = 10 - big;
      const rest = small - need;
      pool.push({ kind: "make-ten", a, b, need, rest, answer: sum });
    }
  }
  return pool;
}
```

- [ ] **Step 4: Verify the new count is 36**

Run:
```bash
node -e "import('./data/pools.js').then(m => console.log('L2:', m.levelPools[2].length))"
```
Expected output: `L2: 36`

- [ ] **Step 5: Verify every round is make-ten with the right shape**

Run:
```bash
node -e "
import('./data/pools.js').then(m => {
  const pool = m.levelPools[2];
  const bad = pool.filter(r => r.kind !== 'make-ten' || r.a + r.b !== r.answer || r.a < 1 || r.a > 9 || r.b < 1 || r.b > 9 || r.a + r.b <= 10);
  console.log('L2 bad rounds:', bad.length);
  const wrongMath = pool.filter(r => {
    const big = Math.max(r.a, r.b);
    const small = Math.min(r.a, r.b);
    const need = 10 - big;
    const rest = small - need;
    return r.need !== need || r.rest !== rest;
  });
  console.log('L2 wrong need/rest:', wrongMath.length);
});
"
```
Expected output:
```
L2 bad rounds: 0
L2 wrong need/rest: 0
```

- [ ] **Step 6: Verify L3 is unchanged**

Run:
```bash
node -e "import('./data/pools.js').then(m => console.log('L3:', m.levelPools[3].length))"
```
Expected output: `L3: 54`

- [ ] **Step 7: Commit**

```bash
git add data/pools.js
git commit -m "L2 pool: collapse to strict make-ten (36 ordered pairs)"
```

---

### Task 3: Fix L2 step-4 visual

**Files:**
- Modify: `scenes/level2.js:384-428` (the step-4 step function)

**Interfaces:**
- Consumes: round object with `a`, `b`, `need`, `rest`, `answer`
- Produces: equation slots where the leading addend is `big` (not `round.a`)

- [ ] **Step 1: Read the current step-4 code**

Read `scenes/level2.js` around lines 384-428. Confirm the equation slots use `round.a` as the leading addend.

- [ ] **Step 2: Replace `round.a` with `big` in step 4**

In the step-4 function (the one passed as the 4th element to the `createRoundScene` step array), find the `return {` block that has `equation: { slots: [round.a, "+", "(", round.need, ...` and replace `round.a` with `big` in BOTH spots (the equation slots and the onAdvance slots). The `big` and `small` variables are already computed at the top of the function.

Replace:
```javascript
        equation: {
          slots: [round.a, "+", "(", round.need, "+", round.rest, ")", "=", "?"],
          colors: [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, undefined],
        },
```

With:
```javascript
        equation: {
          slots: [big, "+", "(", round.need, "+", round.rest, ")", "=", "?"],
          colors: [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, undefined],
        },
```

And in the `onAdvance` handler, replace:
```javascript
          ctx.setEquation({
            slots: [round.a, "+", "(", round.need, "+", round.rest, ")", "=", round.answer],
            colors: [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, INK],
          }, { y: 660, size: 80 });
```

With:
```javascript
          ctx.setEquation({
            slots: [big, "+", "(", round.need, "+", round.rest, ")", "=", round.answer],
            colors: [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, INK],
          }, { y: 660, size: 80 });
```

- [ ] **Step 3: Verify no other reference to `round.a` in step 4**

Run:
```bash
grep -n "round.a" scenes/level2.js
```
Expected: only references OUTSIDE the step-4 function (other steps still use `round.a`/`round.b` for the spoken audio; do not change those).

- [ ] **Step 4: Commit**

```bash
git add scenes/level2.js
git commit -m "L2 step-4: show big + (split), not round.a + (split)"
```

---

### Task 4: Remove dead `isMakeTen` dispatch in `level2.js`

**Files:**
- Modify: `scenes/level2.js:44-52` (the `isMakeTen` helper)
- Modify: `scenes/level2.js` (the `if (!isMakeTen(round))` branches in all 4 steps)

**Interfaces:**
- Consumes: round object (now always `kind: "make-ten"`)
- Produces: scene code without the dispatch

- [ ] **Step 1: Find every `isMakeTen` reference**

Run:
```bash
grep -n "isMakeTen\|non-make-ten" scenes/level2.js
```
Expected: list of lines in steps 1, 2, 3, 4 plus the helper definition.

- [ ] **Step 2: Delete the `isMakeTen` helper function**

In `scenes/level2.js`, delete the `isMakeTen` function (lines 44-52) and its preceding comment block (lines 44-49). The comment block begins `// Pool round kinds: "make-ten" gets the full 4-step make-a-ten teaching` and the function begins `function isMakeTen(round) {`.

- [ ] **Step 3: Remove the dispatch branches in step 1**

In step 1 (the first step function), delete the entire `if (!isMakeTen(round)) { ... }` block — the lines that branch to the single-step scene for non-make-ten rounds. The block starts with `if (!isMakeTen(round)) {` and ends with the matching `}`. Keep the make-ten branch (the `const big = bigger(...)` line and everything after).

Note: the step-1 file comment also mentions "Non-make-ten rounds skip the make-a-ten scaffolding" — update that to "Every L2 round is make-ten; the 4-step scaffolding applies to all."

- [ ] **Step 4: Remove the dispatch returns in steps 2, 3, 4**

In each of steps 2, 3, 4, delete the line:
```javascript
if (!isMakeTen(round)) return { noQuestionDelay: 0.001 };
```
and remove the `// roundScene auto-advances to step 3` tail comment if present.

- [ ] **Step 5: Verify no remaining `isMakeTen` references**

Run:
```bash
grep -n "isMakeTen" scenes/level2.js
```
Expected: no output.

- [ ] **Step 6: Syntax-check the file**

Run:
```bash
node --check scenes/level2.js
```
Expected: no output (clean exit).

- [ ] **Step 7: Commit**

```bash
git add scenes/level2.js
git commit -m "L2 scene: drop dead isMakeTen dispatch (every round is make-ten)"
```

---

### Task 5: Update `docs/POOL-SIZES.md`

**Files:**
- Modify: `docs/POOL-SIZES.md` (replace the table and the L2 breakdown section)

- [ ] **Step 1: Read the current doc**

Read `docs/POOL-SIZES.md` and confirm the table currently shows L1=200, L2=200, L3=54.

- [ ] **Step 2: Replace the table under "Final pool sizes (verified)"**

Replace the §"Final pool sizes (verified)" table with:

```markdown
| Level | Title | Pool | Sample | Source |
| ----- | ----- | ---- | ------ | ------ |
| L1    | 三数相加 | **337** triples | 10 | `data/pools.js` → `generateL1Pool()` |
| L2    | 凑十法   | **36** ordered pairs | 10 | `data/pools.js` → `generateL2Pool()` |
| L3    | 二十以内 | **54** ordered pairs | 10 | `data/pools.js` → `generateL3Pool()` |
```

- [ ] **Step 3: Update the "Effective goal" section**

In the "Effective goal" block, replace the L1 and L2 bullets with:

```markdown
> - **三数相加 (L1)**: 总池子 337 个题目（120 sum ≤ 10 + 217 两个数相加等于 10），每次随机取 10 个题目。
> - **凑十法 (L2)**: 总池子 36 个题目（a, b ∈ {1..9}, a+b > 10），每次随机取 10 个题目。
```

- [ ] **Step 4: Replace the "L2 round kinds" section**

Delete the §"L2 round kinds (the 200 breakdown)" table and the §"Why L2 needed to expand beyond 63" section. Replace with a single short paragraph:

```markdown
## L2 = make-ten only

The user's new rules for L2 凑十法 are: a, b ∈ {1..9} (both single
digits) AND a + b > 10. This gives exactly 36 ordered pairs — every
round gets the 4-step make-a-ten teaching (compare → find-friend →
split → count). The simple / 2-digit / trivial sub-pools that used
to pad the pool to 200 are gone; the 4-step breakdown applies cleanly
to every round.
```

- [ ] **Step 5: Commit**

```bash
git add docs/POOL-SIZES.md
git commit -m "POOL-SIZES: update L1=337, L2=36, L3=54"
```

---

### Task 6: Run smoke + verify-math

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server in the background**

```bash
python3 -m http.server 8126 > /tmp/panda-server.log 2>&1 &
echo $! > /tmp/panda-server.pid
sleep 1
```

- [ ] **Step 2: Run the smoke test**

```bash
npm run smoke
```
Expected: exits 0. (Catches JS import errors and basic page load.)

- [ ] **Step 3: Run the math verifier**

```bash
npm run verify:math
```
Expected: all rounds verified, no arithmetic errors. The verifier iterates over every round in every level and clicks the correct button at each step. If the L2 step-4 visual changed but the audio / math still match, the verifier should pass.

- [ ] **Step 4: Stop the dev server**

```bash
kill "$(cat /tmp/panda-server.pid)" || true
rm -f /tmp/panda-server.pid
```

- [ ] **Step 5: Final commit (if any drift was caught)**

If any of the verifiers caught an issue, fix the code and commit.

---

## Self-Review

**1. Spec coverage:**
- L1 三数相加 → Task 1 (replace generator, verify count 337)
- L2 凑十法 → Task 2 (replace generator, verify count 36)
- L2 step-4 visual fix → Task 3 (replace `round.a` with `big`)
- `level2.js` cleanup → Task 4 (drop `isMakeTen` dispatch)
- `POOL-SIZES.md` → Task 5 (table + breakdown)
- ✅ All spec items covered.

**2. Placeholder scan:** No "TBD" / "TODO" / "similar to" placeholders. Each step has actual code or commands.

**3. Type consistency:** Pool round shapes are consistent across tasks (`kind`, `nums`, `answer` for L1; `kind`, `a`, `b`, `need`, `rest`, `answer` for L2). The L2 step-4 fix uses `big` (already computed in the same function scope).

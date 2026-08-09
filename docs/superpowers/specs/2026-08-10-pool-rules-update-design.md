# Pool rules update — L1 三数相加, L2 凑十法, L2 step-4 visual fix

## Context

User iterated on the pool filtering rules for L1 and L2. The new rules
are tighter than what the current generators produce, so the pools
shrink or grow differently. As a side benefit, every L2 round will be
make-ten, so the `isMakeTen(round)` dispatch in `level2.js` becomes
dead code.

User also flagged a visual bug in L2 step 4: when the smaller addend is
in front (e.g. round is `(5, 8)`), the equation shows
`5 + (2 + 3) = ?` ("small + split") but the audio and the math say
"big 加 need 加 rest". The visual should match — show `big + (split)`.

L3 二十以内 is unchanged.

## What changes

### `data/pools.js`

**L1 — `generateL1Pool()`** (currently 200 triples, curated to prefer
two-sum-to-10)

Replace the existing single-loop + curation with two explicit loops
concatenated:

- Loop 1 — sum ≤ 10: a, b, c ∈ {1..9}, a+b+c ≤ 10.
  Each round: `{ kind: "three-sum", nums: [a, b, c], answer: sum }`.
  Count: 120 ordered triples.
- Loop 2 — two-of-three sum to 10: a, b, c ∈ {1..9}, and at least one of
  (a+b)=10, (a+c)=10, (b+c)=10. Same round shape.
  Count: 217 ordered triples (inclusion-exclusion; see Derivation below).
- Loop 1 and Loop 2 never overlap: if two addends sum to 10 and the
  third is ≥ 1, the total is > 10.
- Total: **337 ordered triples**. No curation.

**L2 — `generateL2Pool()`** (currently 200 ordered pairs across 5
sub-pools)

Replace the 5 sub-pools with a single loop:

- a, b ∈ {1..9}, a+b > 10.
- Each round: `{ kind: "make-ten", a, b, need, rest, answer: sum }`
  where `big = max(a, b)`, `small = min(a, b)`, `need = 10 - big`,
  `rest = small - need`.
- Total: **36 ordered pairs**.
- Drop the 4 other sub-pools (simple, no-carry-2d, carry-2d, trivial).
- Update the file-header comment that mentions the 200 / 5-sub-pool
  breakdown.

**L3 — `generateL3Pool()`**: unchanged (54 pairs).

### `scenes/level2.js`

Every round is now make-ten. Remove the `isMakeTen(round)` helper and
the `if (!isMakeTen(round)) { … }` branches in steps 1–4 (now dead
code). Drop the "non-make-ten rounds…" comments.

**Step 4 visual fix** — the equation slots currently use `round.a` as
the leading addend. When `round.a < round.b` the equation reads
`small + (split) = ?`, but the audio and the math say "big 加 split".
Replace `round.a` with `big` in both the equation slots and the
onAdvance slots. The colors array already uses `COL_BIG` for the first
slot, so `big` is the consistent value.

- Before: `slots: [round.a, "+", "(", round.need, "+", round.rest, ")", "=", "?"]`
- After:  `slots: [big,      "+", "(", round.need, "+", round.rest, ")", "=", "?"]`

Audio IDs (`buildL2Step4Ids(big, small, …)` and `l2-rwd-${a}-${b}-…`)
already use `big` first / the original `(a, b)` order — no change.

### `docs/POOL-SIZES.md`

Update the table to reflect the new pool sizes:

| Level | Title | Pool | Sample |
| ----- | ----- | ---- | ------ |
| L1    | 三数相加 | **337** triples | 10 |
| L2    | 凑十法   | **36** ordered pairs | 10 |
| L3    | 二十以内 | **54** ordered pairs | 10 |

Drop the "L2 round kinds (the 200 breakdown)" table (only one kind
now). Update the "Why L2 needed to expand beyond 63" section to
explain the new rule set.

### `data/levels.json`

Unchanged.

## Derivation

### L1 derivation

**Loop 1 — sum ≤ 10, a/b/c ∈ {1..9}:**
For each total `n` from 3 to 10, the number of ordered triples of
positive integers summing to `n` is `C(n-1, 2)` (stars and bars, 3 parts
each ≥ 1). None of these triples can have a part ≥ 10, so all are
valid.

| n | C(n-1, 2) |
| - | --------- |
| 3 | 1 |
| 4 | 3 |
| 5 | 6 |
| 6 | 10 |
| 7 | 15 |
| 8 | 21 |
| 9 | 28 |
| 10 | 36 |
| **Total** | **120** |

**Loop 2 — two of three sum to 10:**
By inclusion-exclusion on the three events E_ab=(a+b=10), E_ac=(a+c=10),
E_bc=(b+c=10):

- |E_ab| = |E_ac| = |E_bc| = 81 (a, b, c each ∈ {1..9}, choose addend
  ranging over {1..9}, the other is determined by sum=10).
- |E_ab ∩ E_ac| = |E_ab ∩ E_bc| = |E_ac ∩ E_bc| = 9 (e.g. E_ab ∩ E_ac
  ⇒ b = 10-a = c, so for each a there is exactly one (b, c) pair).
- |E_ab ∩ E_ac ∩ E_bc| = 1 (the triple (5, 5, 5)).

Union: 3 × 81 − 3 × 9 + 1 = 243 − 27 + 1 = **217 ordered triples**.

**Overlap with Loop 1:** A triple in both loops requires a+b+c ≤ 10 AND
two of {a,b,c} sum to 10. Then the third addend is ≤ 0, but all addends
are ≥ 1. Zero overlap.

**Total L1: 120 + 217 = 337 ordered triples.**

### L2 derivation

**a, b ∈ {1..9}, a+b > 10:**

For each a from 1 to 9, count b ∈ {1..9} with b > 10-a:

| a | b > 10-a | count |
| - | -------- | ----- |
| 1 | b > 9 | 0 |
| 2 | b > 8 | 1 (b=9) |
| 3 | b > 7 | 2 (b=8,9) |
| 4 | b > 6 | 3 |
| 5 | b > 5 | 4 |
| 6 | b > 4 | 5 |
| 7 | b > 3 | 6 |
| 8 | b > 2 | 7 |
| 9 | b > 1 | 8 |
| **Total** | | **36** |

## Why the difference from the previous L2 (200 / 63)

The previous L2 used `a, b ∈ [1, 10]` and `a + b ∈ [10, 19]` to reach
63 ordered pairs, then padded with 137 simple / 2-digit / trivial
rounds to hit the 200 goal. The new rule drops the 10 from the addend
range and raises the sum bound to `> 10`, so only the strict make-ten
sub-pool survives — 36 ordered pairs. The 4-step make-a-ten teaching
applies to every round, with no scaffolding mismatch.

## Sample variety

- L1: P(337, 10) ≈ 5.9 × 10²¹ — effectively infinite per-session
  variety, even at 10 rounds per session.
- L2: P(36, 10) ≈ 1.0 × 10¹⁴ — also effectively infinite.

## Out of scope

- Audio changes: existing step audio already uses `big` first, so no
  rebuilds needed.
- L3: unchanged.
- `data/levels.json`: titles stay the same.

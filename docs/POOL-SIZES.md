# Panda Project Goal — Pool Sizes

This is the project-level documentation of the pool-size goal. The
`/goal` hook (which Claude reads on every session) is set per-session
via `/goal <text>` and is not stored as a file. The text below is
the **effective goal** the team agreed to in session c20809b0.

## Effective goal

> 所有的题目至少要生成100个题目。每次都需要从中随机挑选出来。
>
> - **三数相加 (L1)**: 总池子 200 个题目，每次随机取 10 个题目。
> - **凑十法 (L2)**: 总池子 200 个题目（63 strict make-ten + 137
>   adjacent kinds：simple / no-carry-2d / carry-2d / trivial），
>   每次随机取 10 个题目。
> - **二十以内 (L3)**: 把所有题目都列出来 (54 个)，每次随机选 10 道题。

## Final pool sizes (verified)

| Level | Title | Pool | Sample | Source |
| ----- | ----- | ---- | ------ | ------ |
| L1    | 三数相加 | **200** triples | 10 | `data/pools.js` → `generateL1Pool()` |
| L2    | 凑十法   | **200** ordered pairs (5 kinds) | 10 | `data/pools.js` → `generateL2Pool()` |
| L3    | 二十以内 | **54** ordered pairs | 10 | `data/pools.js` → `generateL3Pool()` |

## L2 round kinds (the 200 breakdown)

| Kind         | Count | What it teaches |
| ------------ | ----- | --------------- |
| make-ten     | 63    | a, b ∈ [1, 10], sum ∈ [10, 19] — full 4-step make-a-ten |
| simple       | 36    | a, b ∈ [1, 10], sum ∈ [2, 9] — single-step "a + b = ?" |
| no-carry-2d  | 54    | a ∈ [11, 20], b ∈ [1, 9], ones(a) + b ≤ 10 — single-step |
| carry-2d     | 36    | a ∈ [11, 19], b ∈ [1, 9], ones(a) + b > 10 — single-step |
| trivial      | 11    | (a, 0) for a ∈ [1, 10] + (0, 0) — teaches a + 0 = a |
| **Total**    | **200** | |

The 63 make-ten rounds keep the 4-step teaching (compare / find-friend
/ split / count). The other 137 rounds get a single-step scene that
just shows "a + b = ?" and asks for the answer — the kid counts or
applies the strategy mentally, no frames / no friend lookup. The scene
in `scenes/level2.js` dispatches on `round.kind` via `isMakeTen(round)`.

## Why L2 needed to expand beyond 63

The user's original `/goal` text asked for L2 pool = 200. Strict
凑十法 (the 4-step teaching where `big + need = 10` with `need ≥ 0`)
forces `big ≤ 10`, capping the unordered pair space at `(a, b) ∈
[1, 10]²` with `a + b ∈ [10, 19]`:

- Unordered: 5+5+5+4+4+3+3+2+2+1 = 34 pairs
- Ordered: 2 × (34 − 5 self-pairs) + 1 × 5 = 63 pairs

So strict make-a-ten caps at 63 — there are no more valid make-ten
problems to invent. To reach 200, L2 now also teaches adjacent
addition kinds (simple / 2-digit / trivial). The kid still gets the
63 make-ten rounds where the 4-step strategy applies, and gets 137
other rounds where simpler strategies (counting, splitting a into 10 +
ones) work.

Variety feels infinite: roundScene samples 10 of 200 per session, so
the number of distinct orderings is P(200, 10) ≈ 2.3 × 10²⁰ —
effectively no repetition for the kid.

See `data/pools.js` → `generateL2Pool()` comment for the full
derivation and `scenes/level2.js` for the kind dispatch.
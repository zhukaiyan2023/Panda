# Panda Project Goal — Pool Sizes

This is the project-level documentation of the pool-size goal. The
`/goal` hook (which Claude reads on every session) is set per-session
via `/goal <text>` and is not stored as a file. The text below is
the **effective goal** the team agreed to in session c20809b0.

## Effective goal

> 所有的题目至少要生成100个题目。每次都需要从中随机挑选出来。
>
> - **三数相加 (L1)**: 总池子 337 个题目（120 sum ≤ 10 + 217 两个数相加等于 10），每次随机取 10 个题目。
> - **凑十法 (L2)**: 总池子 36 个题目（a, b ∈ {1..9}, a+b > 10），每次随机取 10 个题目。
> - **二十以内 (L3)**: 把所有题目都列出来 (36 个)，每次随机选 10 道题。

## Final pool sizes (verified)

| Level | Title | Pool | Sample | Source |
| ----- | ----- | ---- | ------ | ------ |
| L1    | 三数相加 | **337** triples | 10 | `data/pools.js` → `generateL1Pool()` |
| L2    | 凑十法   | **36** ordered pairs | 10 | `data/pools.js` → `generateL2Pool()` |
| L3    | 二十以内 | **36** ordered pairs | 10 | `data/pools.js` → `generateL3Pool()` |

## L2 = make-ten only

The user's new rules for L2 凑十法 are: a, b ∈ {1..9} (both single
digits) AND a + b > 10. This gives exactly 36 ordered pairs — every
round gets the 4-step make-a-ten teaching (compare → find-friend →
split → count). The simple / 2-digit / trivial sub-pools that used
to pad the pool to 200 are gone; the 4-step breakdown applies cleanly
to every round.
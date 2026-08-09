# Panda Project Goal — Pool Sizes

This is the project-level documentation of the pool-size goal. The
`/goal` hook (which Claude reads on every session) is set per-session
via `/goal <text>` and is not stored as a file. The text below is
the **effective goal** the team agreed to in session c20809b0.

## Effective goal

> 所有的题目至少要生成100个题目。每次都需要从中随机挑选出来。
>
> - **三数相加 (L1)**: 总池子 200 个题目，每次随机取 10 个题目。
> - **凑十法 (L2)**: 总池子 63 个题目 (strict make-a-ten 数学上限)，
>   每次随机取 10 个题目。
> - **二十以内 (L3)**: 把所有题目都列出来 (54 个)，每次随机选 10 道题。

## Final pool sizes (verified)

| Level | Title | Pool | Sample | Source |
| ----- | ----- | ---- | ------ | ------ |
| L1    | 三数相加 | **200** triples | 10 | `data/pools.js` → `generateL1Pool()` |
| L2    | 凑十法   | **63** ordered pairs | 10 | `data/pools.js` → `generateL2Pool()` |
| L3    | 二十以内 | **54** ordered pairs | 10 | `data/pools.js` → `generateL3Pool()` |

## Why L2 is 63, not 200

The user originally asked for L2 pool = 200. That target is
mathematically unreachable for strict 凑十法. The invariant
`big + need = 10` with `need ≥ 0` forces `big ≤ 10`, which caps the
unordered pair space at `(a, b) ∈ [1, 10]²` with `a + b ∈ [10, 19]`:

- Unordered: 5+5+5+4+4+3+3+2+2+1 = 34 pairs
- Ordered: 2 × (34 − 5 self-pairs) + 1 × 5 = 63 pairs

The user agreed in c20809b0 to **accept 63 as the math bound** —
we do not pad with invalid sums (e.g. 5+6) because the make-a-ten
audio prompt would mis-teach.

Variety still feels infinite: roundScene samples 10 of 63 per
session, so the number of distinct orderings is P(63, 10) ≈
6.5 × 10¹⁰ — effectively no repetition for the kid.

See `data/pools.js` → `generateL2Pool()` comment for the full
derivation.
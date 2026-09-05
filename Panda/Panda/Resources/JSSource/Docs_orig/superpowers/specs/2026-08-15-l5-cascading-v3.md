# L5「十几加十几」v3 — cascading 分解

**日期：** 2026-08-15
**作者：** Claude Fable 5
**状态：** 设计 v3（v2 → v3）

## v2 反馈（用户 2026-08-15）

用户的 sketch 显示：cascading 分解 — 锚在顶部，a 和 b 各拆成 (10 + □)，然后两个 10 合成"10 + 10"，两个 □ 合成"□ + □"，最后"20 + 2 = 答案"。线条从 10s 和 □s 交叉向下汇聚。

v2 的 4 行布局（split / ones / tens / final）OK 但是顺序不匹配 sketch — sketch 是 tens sum 在 ones sum **上面**（tens 在前面 add，因为先拆出 10s，再加 10s；然后加个位；最后加和）。

## v3 设计

### 视觉：5 行 cascading 分解

```
y=84:   stepBar
y=220:  锚:  a + b = □             (size 100, persistent)
y=370:  SPLIT row:                 (size 64, persistent)
         (10 + □) + (10 + □) = □     (a 和 b 各拆成 10 + ?)
y=490:  TENS SUM row:              (size 64, persistent)
         10 + 10 = ?                  (tens sum)
y=590:  ONES SUM row:              (size 64, persistent)
         □ + □ = ?                    (ones sum)
y=690:  FINAL row:                 (size 64, persistent)
         □ + □ = ?                    (tens sum + ones sum = answer)
y=838:  buttons
```

### 5 步子问题（与 v2 相同顺序）

| Step | Sub to fill | Correct |
|---|---|---|
| 1 | split row "□_a" | onesA |
| 2 | split row "□_b" | onesB |
| 3 | tens sum row "?" | 20 |
| 4 | ones sum row "?" | sum |
| 5 | final row "?" | answer |

注：v3 step 顺序变了 — 先 tens (10+10=20)，再 ones (□+□=sum)，最后 combine。这匹配 sketch 中 tens 在上的视觉顺序，也匹配"先把 10 加 10 凑成 20，再加个位和"的口语策略。

### Step labels

`["拆 a", "拆 b", "加十位", "加个位", "加起来"]` — 顺序与 v3 step 一致。

### 分解线（10 条）

| # | from | to | color |
|---|---|---|---|
| L1 | 锚 a (slot 0) | split row's "10_a" (slot 1) | COL_TEN |
| L2 | 锚 a (slot 0) | split row's "□_a" (slot 3) | COL_NEED |
| L3 | 锚 b (slot 2) | split row's "10_b" (slot 6) | COL_TEN |
| L4 | 锚 b (slot 2) | split row's "□_b" (slot 8) | COL_NEED |
| L5 | split "10_a" | tens sum "10_left" (slot 0) | COL_TEN |
| L6 | split "10_b" | tens sum "10_right" (slot 2) | COL_TEN |
| L7 | split "□_a" (after reveal) | ones sum "□_left" (slot 0) | COL_BIG |
| L8 | split "□_b" (after reveal) | ones sum "□_right" (slot 2) | COL_SMALL |
| L9 | tens sum "?" (after reveal) | final "□_left" (slot 0) | COL_TEN |
| L10 | ones sum "?" (after reveal) | final "□_right" (slot 2) | COL_SUM |

### 文件变更

```
scenes/level5.js                 # 5 行 cascading 重写
tools/verify-l5-scene.mjs        # 更新 step 期望
```

### 验收

- [ ] 5 行 sub-equations 同时可见
- [ ] step labels 顺序 = `拆 a / 拆 b / 加十位 / 加个位 / 加起来`
- [ ] 10 条 drawLink 线渲染
- [ ] 5 步全过 verifier
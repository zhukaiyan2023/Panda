# L5「十几加十几」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 L5 关卡（十几+十几，个位相加 < 10），5 步教学（拆 a / 拆 b / 加个位 / 加十位 / 加起来），锚 + 单 sub 视觉，l5-* 音频前缀，153 个 pre-baked MP3。

**Architecture:** 沿用 L4 的 `createRoundScene` scaffold。`scenes/level5.js` 是 5 步教学场景（参照 L4 的模式，但 sub-equation 每步销毁重建，**无** anchor → split 跨步骤连线）。池枚举在 `data/pools.js` 加 `generateL5Pool`（36 个有序 (a,b) 对）。音频 cue 用 l5-* 前缀，由腾讯 TTS 单独生成 153 个 MP3，从 `_emit-cues.mjs` 同步到 `main.js` 的 `CUE_IDS`。

**Tech Stack:** 原生 JavaScript、Kaplay、腾讯 TTS（声音生成）、Node.js 工具链（verify / audit）。**No new dependencies**.

## Global Constraints

- L5 池必须满足：a ∈ [11, 19]、b ∈ [11, 19]、ones(a) + ones(b) ≤ 9（严格 < 10）
- 锚 reserve 必须锁住 slot 4 到 `answer`（2 位宽），避免 step 5 揭示时整行偏移
- 每步 sub-equation 独立 reserve（slot 4 是答案/部分答案）
- 5 步 stepBar 标签：`["拆 a", "拆 b", "加个位", "加十位", "加起来"]`
- 卡片配色：SUCCESS 绿色（theme.js 已导出）
- 卡片标题：`"十几加十几"`
- 音频 cue 前缀：`l5-*`（与 L4 的 `l3-*` 区分）
- 任何时候只保留 1 个活跃 audio（不偏离 `panda-audio-event-driven` memory）
- 答对 → 完整 cheer chain + safety ceiling ≥ 3500ms（沿用 L4 修过的 sum-full-chain 逻辑）
- 沿用现有 5-tier 鼓励音（enc-first / streak3 / streak5 / streak10 / level），不新增 enc-level-5
- 严格 `十几 + 十几`（不支持 10 + 十几）

---

### Task 1: 在 data/pools.js 加 generateL5Pool

**Files:**
- Modify: `data/pools.js:155-175`（在 `generateL4Pool` 后加 L5，再扩 `levelPools` 和 `poolGens`）
- Test: `tools/verify-l5-pool.mjs`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `generateL5Pool()` 返回 `[{ a, b, onesA, onesB, sum, answer }, ...]` 数组；36 项；`levelPools[5]` 和 `poolGens[5]` 暴露给 main.js 与场景

- [ ] **Step 1: 写生成函数的纯函数测试**

新建 `tools/verify-l5-pool.mjs`：

```js
#!/usr/bin/env node
// tools/verify-l5-pool.mjs — 验证 L5 池枚举的正确性。
//
// 约束（来自 spec §2）：
//   - a, b ∈ [11, 19]
//   - ones(a) + ones(b) ≤ 9  （严格 < 10）
//   - 池大小必须恰好是 36
//
// 用法：node tools/verify-l5-pool.mjs
// 退出码 0 = 通过；非 0 = 失败。

import { poolGens } from "../data/pools.js";

let failed = 0;
const pool = poolGens[5]();

function expect(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

console.log("L5 pool:");

expect(pool.length === 36, `pool size = 36 (got ${pool.length})`);

let minAnswer = Infinity, maxAnswer = -Infinity;
let minSum = Infinity, maxSum = -Infinity;
const seen = new Set();

for (const r of pool) {
  expect(r.a >= 11 && r.a <= 19, `a ∈ [11,19] (a=${r.a})`);
  expect(r.b >= 11 && r.b <= 19, `b ∈ [11,19] (b=${r.b})`);
  expect(r.onesA === r.a % 10, `onesA = a%10 (${r.onesA} === ${r.a % 10})`);
  expect(r.onesB === r.b % 10, `onesB = b%10 (${r.onesB} === ${r.b % 10})`);
  expect(r.onesA + r.onesB <= 9, `ones sum < 10 (${r.onesA}+${r.onesB}=${r.onesA+r.onesB})`);
  expect(r.sum === r.onesA + r.onesB, `sum = onesA+onesB`);
  expect(r.answer === r.a + r.b, `answer = a+b`);
  if (r.answer < minAnswer) minAnswer = r.answer;
  if (r.answer > maxAnswer) maxAnswer = r.answer;
  if (r.sum < minSum) minSum = r.sum;
  if (r.sum > maxSum) maxSum = r.sum;
  const key = `${r.a}-${r.b}`;
  expect(!seen.has(key), `unique (a,b) pair: ${key}`);
  seen.add(key);
}

expect(minAnswer === 22 && maxAnswer === 29, `answer ∈ [22,29] (got ${minAnswer}..${maxAnswer})`);
expect(minSum === 2 && maxSum === 9, `sum ∈ [2,9] (got ${minSum}..${maxSum})`);

if (failed === 0) {
  console.log("\nAll L5 pool checks passed.");
  process.exit(0);
} else {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
```

- [ ] **Step 2: 跑测试确认 FAIL（generateL5Pool 不存在）**

Run: `node tools/verify-l5-pool.mjs`
Expected: 报错 `poolGens[5] is not a function` 或类似；非 0 退出码。

- [ ] **Step 3: 在 data/pools.js 加 generateL5Pool + exports**

修改 `data/pools.js`：在 `generateL4Pool` 函数后（`levelPools` 声明之前）加 L5 生成器：

```js
// L5 — 十几加十几（无进位）。
// 约束：a, b ∈ [11, 19]（都是十几），ones(a) + ones(b) ≤ 9（严格 < 10）。
// 教学策略：5 步 — 拆 a → 拆 b → 加个位 → 加十位 → 加起来。
//   step 1 答 onesA
//   step 2 答 onesB
//   step 3 答 onesA + onesB
//   step 4 答 20
//   step 5 答 a + b
//
// 池计数：每个 a，b 的 ones 范围 [1, 9 - onesA]（inclusive）：
//   a=11 (ones=1): 8 b｜a=12 (ones=2): 7 b｜a=13 (ones=3): 6 b
//   a=14 (ones=4): 5 b｜a=15 (ones=5): 4 b｜a=16 (ones=6): 3 b
//   a=17 (ones=7): 2 b｜a=18 (ones=8): 1 b｜a=19 (ones=9): 0 b
// 合计 8+7+6+5+4+3+2+1+0 = 36 个有序 (a, b) 对。
function generateL5Pool() {
  const pool = [];
  for (let a = 11; a <= 19; a++) {
    const onesA = a % 10;
    const bMaxDigit = 9 - onesA;
    for (let b = 11; b <= 19; b++) {
      const onesB = b % 10;
      if (onesB > bMaxDigit) continue;
      pool.push({
        a,
        b,
        onesA,
        onesB,
        sum: onesA + onesB,
        answer: a + b,
      });
    }
  }
  return pool;
}
```

更新 `levelPools`（在 `generateL5Pool` 声明**之后**）：

```js
export const levelPools = {
  1: generateL1Pool(),
  2: generateL2Pool(),
  3: generateL3Pool(),
  4: generateL4Pool(),
  5: generateL5Pool(),
};
```

更新 `poolGens`：

```js
export const poolGens = {
  1: generateL1Pool,
  2: generateL2Pool,
  3: generateL3Pool,
  4: generateL4Pool,
  5: generateL5Pool,
};
```

更新头部注释块（在已有的 L1-L4 描述之后加 L5）：

```js
//   L5 十几加十几     — a, b ∈ [11, 19]，ones(a) + ones(b) ≤ 9（严格 < 10）。
//                       36 个有序 (a, b) 对。5 步教学（拆 a / 拆 b / 加个位 /
//                       加十位 / 加起来）。Sample 10 per session。
```

- [ ] **Step 4: 跑测试确认 PASS**

Run: `node tools/verify-l5-pool.mjs`
Expected: `All L5 pool checks passed.`；退出码 0。

- [ ] **Step 5: 提交**

```bash
git add data/pools.js tools/verify-l5-pool.mjs
git commit -m "feat: add L5 pool generator (36 teen+teen pairs, ones-sum < 10)"
```

---

### Task 2: 更新 data/levels.json 加 L5

**Files:**
- Modify: `data/levels.json:1-16`

**Interfaces:**
- Consumes: 无
- Produces: `data/levels.json` 包含 L5 元数据

- [ ] **Step 1: 加 L5 项到 levels.json**

完整文件内容：

```json
{
  "levels": [
    {
      "id": 1,
      "title": "三数相加"
    },
    {
      "id": 2,
      "title": "两数凑十"
    },
    {
      "id": 3,
      "title": "凑十法"
    },
    {
      "id": 4,
      "title": "二十以内"
    },
    {
      "id": 5,
      "title": "十几加十几"
    }
  ]
}
```

- [ ] **Step 2: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/levels.json', 'utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: 提交**

```bash
git add data/levels.json
git commit -m "docs: add L5 to data/levels.json"
```

---

### Task 3: 在 main.js 接线 levelsData + computePoolCueIds

**Files:**
- Modify: `main.js:27-34`（levelsData）, `main.js:538-574`（computePoolCueIds）, `main.js:1041-1085`（scene imports / registry）

**Interfaces:**
- Consumes: `poolGens[5]()` from Task 1
- Produces: 
  - `levelsData.levels[4]` = `{ id: 5, title: "十几加十几" }`
  - `computePoolCueIds(5)` 返回 Set，包含所有 l5-* id
  - `main.js` 的 import 数组加 `{ default: level5 }` 和 `k.scene("level5", ...)`

- [ ] **Step 1: 加 levelsData 第 5 项**

修改 `main.js`：

```js
const levelsData = {
  "levels": [
    { "id": 1, "title": "三数相加" },
    { "id": 2, "title": "两数凑十" },
    { "id": 3, "title": "凑十法" },
    { "id": 4, "title": "二十以内" },
    { "id": 5, "title": "十几加十几" },
  ],
};
```

- [ ] **Step 2: 加 computePoolCueIds 的 L5 分支**

修改 `main.js` 的 `computePoolCueIds`：

```js
function computePoolCueIds(levelId) {
  const ids = new Set();
  // ... 原 L1/L2/L3/L4 分支保持不变 ...
  } else if (levelId === 5) {
    // L5 十几加十几 — 5 步预生成 MP3 + 奖励。
    // cue 模板：
    //   l5-s1-{a}-{b}    拆 a
    //   l5-s2-{a}-{b}    拆 b
    //   l5-s3-{oA}-{oB}  加个位
    //   l5-s4            静态"十加十等于 20"
    //   l5-s5-{sum}      加起来
    //   l5-rwd-{a}-{b}-{answer}   完整算式读出
    for (const r of poolGens[5]()) {
      ids.add(`l5-s1-${r.a}-${r.b}`);
      ids.add(`l5-s2-${r.a}-${r.b}`);
      ids.add(`l5-s3-${r.onesA}-${r.onesB}`);
      ids.add(`l5-s4`);
      ids.add(`l5-s5-${r.sum}`);
      ids.add(`l5-rwd-${r.a}-${r.b}-${r.answer}`);
    }
  }
  return ids;
}
```

- [ ] **Step 3: 运行 syntax check**

Run: `node --check main.js`
Expected: 退出码 0。

- [ ] **Step 4: 提交**

```bash
git add main.js
git commit -m "feat: register L5 in main.js (levelsData + computePoolCueIds)"
```

注：scene 注册和 import 数组在 Task 5（level5.js 新建）完成后才能加；那一步会单独提交。

---

### Task 4: 加 L5 卡片支持（levelPicker.js + badge-5 sprite）

**Files:**
- Modify: `scenes/levelPicker.js:21-28`（SHORT_TITLES / CARD_ACCENT）, `main.js:938-953`（SPRITES 数组）
- Create: `assets/art/badge-5.png`（与 badge-1..4 同款尺寸、风格）

**Interfaces:**
- Consumes: `SUCCESS` 色 from theme.js；`SHORT_TITLES[id]` 模式
- Produces: 第 5 张卡片显示"十几加十几"标题 + 绿色徽章；SPRITES 列表含 `badge-5`，缺失时 fallback 文字

- [ ] **Step 1: 在 levelPicker.js 加 L5 标签和配色**

修改 `scenes/levelPicker.js`：

```js
const SHORT_TITLES = {
  1: "三数相加",
  2: "两数凑十",
  3: "凑十法",
  4: "二十以内",
  5: "十几加十几",
};

const CARD_ACCENT = { 1: BLUE, 2: ORANGE, 3: PURPLE, 4: YELLOW, 5: SUCCESS };
```

确认 `SUCCESS` 已在 `components/theme.js` 导出（已导出，加载即可）。

修改 theme.js 的 import 列表（如果 SHORT_TITLES 不需要 theme 的话保持原样 — existing import 已有 `BLUE, ORANGE, PURPLE, YELLOW`，需要加 `SUCCESS`）：

```js
import {
  INK, CARD, ORANGE, YELLOW, BLUE, PURPLE, FONT, SUCCESS,
} from "../components/theme.js?v=20260815";
```

- [ ] **Step 2: 在 main.js SPRITES 数组加 badge-5**

修改 `main.js` 的 `SPRITES` 常量：

```js
const SPRITES = [
  "panda-idle", "panda-cheer", "panda-think",
  "bamboo", "leaf",
  "star", "lock",
  "badge-1", "badge-2", "badge-3", "badge-4", "badge-5",
  // ... 其他 sprite 保持不变
];
```

- [ ] **Step 3: 创建 badge-5 美术资产**

最小化方案：直接复制 badge-4.png 改名（或用 MiniMax image 生成）。本次任务先复制，然后后续替换。

Run: `cp assets/art/badge-4.png assets/art/badge-5.png`

如果想生成新徽章：使用 `tools/build-art-minimax.mjs` 加 `badge-5` 条目（与现有 mini 风格一致），但这不是本次实现计划的硬性要求 — fallback 文字"第 5 关"在 sprite 缺失时也能正常显示（参见 levelPicker.js 的 `if (!badge)` 分支）。

- [ ] **Step 4: 验证 picker 渲染**

Run: `python3 -m http.server 8126 &` 然后浏览器打开 `http://localhost:8126/`（手动验证）。

Expected: 5 张卡片可见，L5 卡片显示"十几加十几"标题 + 绿色徽章；L4 卡片仍可点。

- [ ] **Step 5: 提交**

```bash
git add scenes/levelPicker.js main.js assets/art/badge-5.png
git commit -m "feat: register L5 card (title, accent, badge-5 sprite)"
```

---

### Task 5: 创建 scenes/level5.js 5 步教学场景

**Files:**
- Create: `scenes/level5.js`（~280 行）
- Modify: `main.js:1041-1085`（import + scene registry）

**Interfaces:**
- Consumes: `createRoundScene` from `scenes/roundScene.js`；`LAYOUT`、`options` from 同上；`poolGens` from `data/pools.js`；`expression` from `components/expression.js`；`INK, FONT, YELLOW, BLUE, PINK, ORANGE, SUCCESS` from `components/theme.js`
- Produces: `default export` 一个 Kaplay scene 函数；5 步 step 都答对 → 进下一 round → roundIdx 全部走完 → 进 levelPicker

**5 步 sub-equation 定义**：

```js
// 锚（顶部 y=220，size 100，持久）
const anchorSlots = (round, sumSlot) => ({
  slots: [round.a, "+", round.b, "=", sumSlot],
  reserve: [round.a, "+", round.b, "=", round.answer],  // 锁住 slot 4 到 2 位 answer
});

// Step 1 sub  (y=440, size 82)
const step1Sub = (round) => ({
  slots: [round.a, "=", 10, "+", "?"],
  reserve: [round.a, "=", 10, "+", round.onesA],
});

// Step 2 sub
const step2Sub = (round) => ({
  slots: [round.b, "=", 10, "+", "?"],
  reserve: [round.b, "=", 10, "+", round.onesB],
});

// Step 3 sub
const step3Sub = (round) => ({
  slots: [round.onesA, "+", round.onesB, "=", "?"],
  reserve: [round.onesA, "+", round.onesB, "=", round.sum],
});

// Step 4 sub
const step4Sub = () => ({
  slots: [10, "+", 10, "=", "?"],
  reserve: [10, "+", 10, "=", 20],
});

// Step 5 sub
const step5Sub = (round) => ({
  slots: [20, "+", round.sum, "=", "?"],
  reserve: [20, "+", round.sum, "=", round.answer],
});
```

**音频 cue builders**：

```js
const buildL5Step1Ids = (a, b) => [`l5-s1-${a}-${b}`];
const buildL5Step2Ids = (a, b) => [`l5-s2-${a}-${b}`];
const buildL5Step3Ids = (onesA, onesB) => [`l5-s3-${onesA}-${onesB}`];
const buildL5Step4Ids = () => [`l5-s4`];
const buildL5Step5Ids = (sum) => [`l5-s5-${sum}`];
const buildL5RewardIds = (a, b, answer) => [`l5-rwd-${a}-${b}-${answer}`];
```

**fireL5StepAudio**（沿用 L4 模式）：

```js
function fireL5StepAudio(ctx, ids, _stepNumber, onComplete) {
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400,
      seqGapMs: 40,
    }, onComplete);
    return;
  }
  window.PandaAudio.playSequence(ids, 40, 100, onComplete);
}
```

- [ ] **Step 1: 写 scenes/level5.js 完整内容**

完整文件：

```js
// scenes/level5.js — 十几加十几 (no carry), 5 explicit teaching steps.
//
// Teaches the "split both teens into 10 + ones, add the ones parts,
// add 10 + 10 = 20, then 20 + sum = answer" strategy in 5 explicit steps.
// Each step asks ONE focused question. Per user feedback (2026-08-15):
// "越细越好" — kid gets 5 small wins instead of 3 bigger ones.
//
// Round data shape: { a, b, onesA, onesB, sum, answer } where
//   a, b ∈ [11, 19]              (both are teens)
//   onesA + onesB ≤ 9            (strict no-carry)
//   sum = onesA + onesB          (∈ [2, 9])
//   answer = a + b               (∈ [22, 29])
//
// The persistent anchor ("a + b = ?") sits at the TOP of the screen in
// the largest font — the goal the child is working toward, never
// disappears between teaching beats. Each step shows one focused sub-
// equation below it (no cross-step decomposition lines, unlike L4's
// anchor → split relationship):
//
//   Step 1 — 拆 a:   sub "a = 10 + ?". Child picks onesA.
//   Step 2 — 拆 b:   sub "b = 10 + ?". Child picks onesB.
//   Step 3 — 加个位: sub "onesA + onesB = ?". Child picks sum.
//   Step 4 — 加十位: sub "10 + 10 = ?". Child picks 20.
//   Step 5 — 加起来: sub "20 + sum = ?". Child picks answer.
//
// After step 5 correct, the anchor reveals to "a + b = answer" and a
// reward audio reads "a+b=answer" (the full equation as a celebration
// sentence).
//
// Audio cue naming: l5-* prefix.
//   l5-s1-{a}-{b}        36 cues  "11 加 14 等于几，我们先把 11 拆成 10 加几"
//   l5-s2-{a}-{b}        36 cues  "我们再拆 14，14 能拆成 10 加几"
//   l5-s3-{oA}-{oB}      36 cues  "个位相加 1 加 4 等于几"
//   l5-s4                1 cue   "十加十等于 20"
//   l5-s5-{sum}          8 cues   "20 加 5 等于几"
//   l5-rwd-{a}-{b}-{answer}  36  "11 加 14 等于 25"
//   Total: 153 unique MP3s.

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260815";
import { poolGens } from "../data/pools.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import {
  INK, FONT, YELLOW, BLUE, PINK, ORANGE, SUCCESS,
} from "../components/theme.js?v=20260815";

const COL_BIG   = BLUE;     // the 2-digit addend (a or b)
const COL_SMALL = PINK;     // the 2-digit addend (b or a)
const COL_TEN   = YELLOW;   // the literal "10" in sub-questions
const COL_NEED  = ORANGE;   // the unknown / just-computed slot
const COL_SUM   = SUCCESS;  // the final answer in step 5

// Persistent anchor ("a + b = ?") rendered at the top.
// `reserve` pins slot 4 to round.answer (2 digits) so the row doesn't
// reflow when "?" reveals to "25" in step 5. Without this, the slot
// widens from 0.9 × size to 1.24 × size and the whole row shifts left —
// the line markers / arrows drawn from slotCenters would drift.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// Step 1 sub reserve — slot 4 reveals "?" → onesA (1 digit).
// Reserving to onesA keeps the slot bucket at 0.62 × size (digit width)
// so the reveal doesn't reflow the row.
function step1Sub(round) {
  return {
    slots: [round.a, "=", 10, "+", "?"],
    colors: [COL_BIG, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [round.a, "=", 10, "+", round.onesA],
  };
}

// Step 2 sub — same shape as step 1 but for b.
function step2Sub(round) {
  return {
    slots: [round.b, "=", 10, "+", "?"],
    colors: [COL_SMALL, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [round.b, "=", 10, "+", round.onesB],
  };
}

// Step 3 sub — sum is always 1 digit (sum ∈ [2, 9]).
function step3Sub(round) {
  return {
    slots: [round.onesA, "+", round.onesB, "=", "?"],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, COL_NEED],
    reserve: [round.onesA, "+", round.onesB, "=", round.sum],
  };
}

// Step 4 sub — static, "10 + 10 = ?". Reserve to 20 so the reveal
// doesn't shift the row.
function step4Sub() {
  return {
    slots: [10, "+", 10, "=", "?"],
    colors: [COL_TEN, undefined, COL_TEN, undefined, COL_NEED],
    reserve: [10, "+", 10, "=", 20],
  };
}

// Step 5 sub — "20 + sum = ?". Reserve to round.answer (2 digits).
// Slot 4 step 5 widens from 0.9 × size (box) to 1.24 × size (2 digits)
// without the reserve — reflows the whole row.
function step5Sub(round) {
  return {
    slots: [20, "+", round.sum, "=", "?"],
    colors: [COL_TEN, undefined, COL_NEED, undefined, COL_NEED],
    reserve: [20, "+", round.sum, "=", round.answer],
  };
}

// Cue builders — composite pre-baked MP3s parameterized by round.
function buildL5Step1Ids(a, b) { return [`l5-s1-${a}-${b}`]; }
function buildL5Step2Ids(a, b) { return [`l5-s2-${a}-${b}`]; }
function buildL5Step3Ids(onesA, onesB) { return [`l5-s3-${onesA}-${onesB}`]; }
function buildL5Step4Ids() { return [`l5-s4`]; }
function buildL5Step5Ids(sum) { return [`l5-s5-${sum}`]; }
function buildL5RewardIds(a, b, answer) { return [`l5-rwd-${a}-${b}-${answer}`]; }

// Fires a per-step L5 audio chain. Same pattern as L4's
// fireL3StepAudio — chain off ctx.lastEncourageId (the last cue of
// the tier-based cheer chain), fallback to playSequence with a small
// render-settle delay. Without this branch, the cheer and the new
// prompt overlap and feel crammed together.
function fireL5StepAudio(ctx, ids, _stepNumber, onComplete) {
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400,
      seqGapMs: 40,
    }, onComplete);
    return;
  }
  window.PandaAudio.playSequence(ids, 40, 100, onComplete);
}

export default createRoundScene({
  levelId: 5,
  sceneName: "level5",
  // 36 ordered (a, b) pairs from data/pools.js. roundScene samples 10
  // on first entry; each play sees a different mix.
  poolGen: () => poolGens[5](),
  sampleSize: 10,
  // No intro cue — per-round step 1 audio IS the entry prompt. Same
  // pattern as L4 (per feedback 2026-08-10: the old topic-intro ate
  // ~3s before the prompt and gave no instruction for what to DO).
  stepLabels: ["拆 a", "拆 b", "加个位", "加十位", "加起来"],

  steps: [
    // Step 1 — 拆 a: child picks onesA from the decomposition
    // a = 10 + onesA.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step1Ids(round.a, round.b), 1);
      return {
        equation: step1Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.onesA,
          values: options(round.onesA, { min: 0, max: 9 }),
        },
      };
    },

    // Step 2 — 拆 b: child picks onesB from b = 10 + onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step2Ids(round.a, round.b), 2);
      return {
        equation: step2Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.onesB,
          values: options(round.onesB, { min: 0, max: 9 }),
        },
      };
    },

    // Step 3 — 加个位: child picks sum = onesA + onesB.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step3Ids(round.onesA, round.onesB), 3);
      return {
        equation: step3Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.sum,
          values: options(round.sum, { min: 1, max: 9 }),
        },
      };
    },

    // Step 4 — 加十位: child picks 20 from "10 + 10 = ?". Static;
    // every round plays the same l5-s4 cue.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step4Ids(), 4);
      return {
        equation: step4Sub(),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: 20,
          values: options(20, { min: 18, max: 20 }),
        },
      };
    },

    // Step 5 — 加起来: child picks answer = 20 + sum.
    (ctx, round) => {
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      fireL5StepAudio(ctx, buildL5Step5Ids(round.sum), 5);
      return {
        equation: step5Sub(round),
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 20, max: 29 }),
        },
        onAdvance: () => {
          // Reveal the anchor with the answer. The sub-equation stays
          // for visual continuity until the round finishes.
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 220 });
          // Reward audio: "11 加 14 等于 25". Chained off
          // ctx.lastEncourageId so it starts AFTER the celebration
          // tail and never overlaps. roundScene awaits the Promise
          // so the kid hears the full equation before the next
          // round's greeting fires.
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              buildL5RewardIds(round.a, round.b, round.answer),
              { gapMs: 200, seqGapMs: 40 },
              resolve,
            );
          });
        },
      };
    },
  ],
});
```

- [ ] **Step 2: 语法检查**

Run: `node --check scenes/level5.js`
Expected: 退出码 0。

- [ ] **Step 3: 在 main.js 加 level5 import 和 scene 注册**

修改 `main.js` 的 dynamic import 数组（加在 `{ default: level4 }` 之后）：

```js
const [
  // ... 原有 imports ...
  { default: level4 },
  { default: level5 },
  // ... 后续
] = await Promise.all([
  // ... 原有 imports ...
  import("./scenes/level4.js?v=20260815"),
  import("./scenes/level5.js?v=20260815"),
  // ... 后续
]);
```

修改 `main.js` 的 `k.scene()` 注册（加在 `k.scene("level4", ...)` 之后）：

```js
k.scene("level5", () => level5(k));
```

- [ ] **Step 4: 语法检查 main.js**

Run: `node --check main.js`
Expected: 退出码 0。

- [ ] **Step 5: 提交**

```bash
git add scenes/level5.js main.js
git commit -m "feat: implement L5 scene (5-step: 拆 a / 拆 b / 加个位 / 加十位 / 加起来)"
```

---

### Task 6: 生成 153 个 l5-* MP3（Tencent TTS）

**Files:**
- Create: `assets/audio/l5-*.mp3`（153 个新文件）
- Modify: `tools/cues.cjs`（可选 — 如果新增 chunk 模板）

**Interfaces:**
- Consumes: 153 个 l5-* cue id 列表（来自 `_emit-cues.mjs` 加 L5 分支）
- Produces: `assets/audio/l5-*.mp3` 153 个文件

- [ ] **Step 1: 在 tools/_emit-cues.mjs 加 L5 分支**

修改 `tools/_emit-cues.mjs`（在 L4 循环之后）：

```js
const l5 = poolGens[5]();
for (const r of l5) {
  const push = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  push(`l5-s1-${r.a}-${r.b}`);
  push(`l5-s2-${r.a}-${r.b}`);
  push(`l5-s3-${r.onesA}-${r.onesB}`);
  push(`l5-s4`);
  push(`l5-s5-${r.sum}`);
  push(`l5-rwd-${r.a}-${r.b}-${r.answer}`);
}
```

- [ ] **Step 2: 运行 _emit-cues.mjs 确认 L5 id 集合**

Run: `node tools/_emit-cues.mjs | grep -c "^l5-"`
Expected: `153`

- [ ] **Step 3: 创建 l5-* 模板条目（如果走 cjs 路径）**

如果决定让 l5-* 经过 `tools/cues.cjs` 走默认 TTS pipeline（单读 chunk），在 `tools/cues.cjs` 文件末尾加：

```js
// ===== L5 十几加十几 =====
{ id: "l5-s1", text: "加几等于几，我们先把" },
{ id: "l5-s1-split", text: "拆成 10 加几" },
{ id: "l5-s2", text: "我们再拆" },
{ id: "l5-s2-can-split", text: "能拆成 10 加几" },
{ id: "l5-s3", text: "个位相加" },
{ id: "l5-s3-q", text: "加几等于几" },
{ id: "l5-s4", text: "十加十等于 20" },
{ id: "l5-s5", text: "20 加几等于几" },
{ id: "l5-rwd", text: "加" },
{ id: "l5-rwd-answer", text: "等于" },
```

**简化方案**：直接用 Tencent TTS 批量生成 153 个独立 MP3（每条直接是完整句子），不走 cjs pipeline。这样最简。

```bash
# Dry-run 验证 id 列表
node tools/build-audio-tencent.mjs --only=l5-s1-11-14,l5-s4 --dry-run
```

确认输出包含 l5-* id：

```bash
# 实际生成（需要配置 TENCENT_SECRET_ID 等环境变量）
node tools/build-audio-tencent.mjs --only=l5-s1-11-14,l5-s4
```

如果想批量生成所有 153 个 l5-*：

```bash
# 从 _emit-cues.mjs 拿到所有 l5-* id
IDS=$(node tools/_emit-cues.mjs | grep "^l5-" | tr '\n' ',' | sed 's/,$//')
node tools/build-audio-tencent.mjs --only="$IDS"
```

- [ ] **Step 4: 验证音频文件存在**

Run: `ls assets/audio/l5-*.mp3 | wc -l`
Expected: `153`

- [ ] **Step 5: 提交**

```bash
git add assets/audio/l5-*.mp3 tools/_emit-cues.mjs tools/cues.cjs
git commit -m "feat: generate 153 l5-* MP3 cues (Tencent TTS)"
```

注：如果 TTS 配额不足，可分批生成；运行时 CUE_IDS 缺项会触发 audio Proxy warn 但 kid 仍能玩（参见 L4 2026-08-12 报告）。

---

### Task 7: 同步 CUE_IDS 与 audit-audio / coverage-check

**Files:**
- Modify: `main.js:36-371`（CUE_IDS 数组）

**Interfaces:**
- Consumes: `node tools/_emit-cues.mjs` 输出
- Produces: `main.js` 的 `CUE_IDS` 包含所有 l5-* id

- [ ] **Step 1: 运行 emit-cue-ids.mjs**

Run: `node tools/emit-cue-ids.mjs`
Expected: 输出 stdout 是 JS 数组字面量格式的 id 列表。

- [ ] **Step 2: 检查输出含 153 个 l5-* id**

Run: `node tools/emit-cue-ids.mjs | grep -c '"l5-'`
Expected: 至少 153。

- [ ] **Step 3: 复制 l5-* 部分到 main.js 的 CUE_IDS**

把 stdout 输出中所有以 `"l5-` 开头的行，复制粘贴到 `main.js` 的 `CUE_IDS` 数组中（按字母顺序插入对应位置）。

- [ ] **Step 4: 语法检查**

Run: `node --check main.js`
Expected: 退出码 0。

- [ ] **Step 5: 运行 audit-audio**

Run: `node tools/audit-audio.mjs`
Expected: 全部 l5-* id 都在 `assets/audio/`；无 missing 报告。

- [ ] **Step 6: 运行 coverage-check**

Run: `node tools/coverage-check.mjs`
Expected: `OK — every text in the game has a matching audio cue.`

- [ ] **Step 7: 提交**

```bash
git add main.js
git commit -m "chore: sync CUE_IDS with new l5-* cues (153 entries)"
```

---

### Task 8: 更新 README Levels 表格

**Files:**
- Modify: `README.md:36-42`

**Interfaces:**
- Consumes: 无
- Produces: README Levels 表格含 L5 行

- [ ] **Step 1: 在 README Levels 表格加 L5 行**

修改 `README.md`（保留 L1-L4 行）：

```markdown
| Level | Title | Skill | Question asked |
| --- | --- | --- | --- |
| 1 | Numbers up to 5 | Plain addition with totals ≤ 5 | fill the blank in `a + ? = answer` |
| 2 | Make a Ten | Decompose b into `need + rest` so `a + need = 10` | fill the blank in `a + ? = 10` |
| 3 | Up to 20 | Two-digit addition without the make-ten scaffold | fill the blank in `a + ? = answer` |
| 4 | 二十以内 | Teen + digit, no carry via 10+ones strategy | fill the blank in `a + ? = answer` |
| 5 | 十几加十几 | Two teens + two teens, no carry, 5-step decomposition | fill the blank in `a + ? = answer` |
```

注：README 现有的 Levels 表格与代码有出入（README 写 L1-L3，代码 L1-L4）。本次同步代码到 README，把 L4 也加进去。

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: update README Levels table (add L5, sync L4)"
```

---

### Task 9: 最终验证

**Files:**
- 无（只跑验证）

**Interfaces:**
- Consumes: 全部前述 task 产出
- Produces: 6 项验证全部通过

- [ ] **Step 1: 池验证**

Run: `node tools/verify-l5-pool.mjs`
Expected: `All L5 pool checks passed.`

- [ ] **Step 2: 语法检查所有改动文件**

Run:
```bash
node --check scenes/level5.js
node --check main.js
node --check data/pools.js
node --check scenes/levelPicker.js
```
Expected: 全部退出码 0。

- [ ] **Step 3: 数学验证（verify-math）**

Run: `node tools/verify-math.mjs`
Expected: 全部通过（L1-L5）。

- [ ] **Step 4: 音频 audit**

Run: `node tools/audit-audio.mjs`
Expected: 全部 l5-* 都有 mp3。

- [ ] **Step 5: 覆盖率 check**

Run: `node tools/coverage-check.mjs`
Expected: `OK — every text in the game has a matching audio cue.`

- [ ] **Step 6: 手动 smoke test**

1. `python3 -m http.server 8126 &`
2. 浏览器打开 `http://localhost:8126/`
3. 验证：
   - [ ] 5 张卡片可见
   - [ ] L5 卡片显示"十几加十几"标题 + 绿色徽章
   - [ ] L5 解锁后 L4 卡片仍然可点
   - [ ] 进入 L5：锚显示 "11 + 14 = ?"
   - [ ] Step 1 → 5 步流程完整，每步只问一个问题
   - [ ] Step 5 揭示后锚变 "11 + 14 = 25"
   - [ ] 答错 streak 不增
   - [ ] 答对 → 完整 cheer 链 → step 推进（无 audio freeze）

- [ ] **Step 7: 提交最终总结**

```bash
git log --oneline -20  # 审查提交历史
```

确认 9 个 task 全部有对应 commit。如果有遗漏的 commit，补上。

---

## Self-review checklist

**Spec coverage**：

- [x] §1 架构与文件 — Task 1, 2, 3, 4, 5
- [x] §2 数据与池 — Task 1
- [x] §3 5 步教学布局 — Task 5
- [x] §4 音频系统 — Task 6, 7
- [x] §5 picker / main.js 接线 — Task 3, 4
- [x] §6 入口与无 intro 策略 — Task 5 (no introCue 字段)
- [x] §7 测试策略 — Task 1 测试, Task 9 验证
- [x] §8 范围与假设 — 全部 task 覆盖
- [x] §9 风险与对策 — Task 6 (MP3 缺失 fallback), Task 5 (静态 cue 重复)
- [x] §10 验收标准 — Task 9

**Placeholder scan**：

- ✅ 无 "TBD" / "TODO"
- ✅ 无 "Add appropriate error handling"
- ✅ 每个 step 有实际代码
- ✅ 类型一致：`buildL5Step1Ids`、`ctx.lastEncourageId`、`round.answer` 等在所有 task 中一致

**Type consistency**：

- `generateL5Pool()` 返回 `{ a, b, onesA, onesB, sum, answer }` — Task 1、3、5 一致
- `anchorSlots(round, sumSlot)` 签名 — Task 5
- `step1Sub/2Sub/3Sub/4Sub/5Sub(round)` 签名 — Task 5
- `buildL5StepNIds(...)` 签名 — Task 5
- `fireL5StepAudio(ctx, ids, _stepNumber, onComplete)` — Task 5

**Plan status:** ready for execution after review.

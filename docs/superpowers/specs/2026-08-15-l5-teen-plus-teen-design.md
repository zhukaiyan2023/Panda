# L5「十几加十几」设计

**日期：** 2026-08-15
**作者：** Claude Fable 5
**状态：** 设计待用户批准

## 背景与动机

Panda 项目当前 L4「二十以内」教「十几 + 个位」（如 11+8 = 19）的拆分进位策略。用户希望在 L4 之后新增 L5「十几加十几」：
- **题型**：十几 + 十几（如 11+14、13+15）
- **约束**：个位相加 < 10（无进位），例如 11+14=25、11+19 不合法（1+9=10）
- **目的**：扩展 L4 的「拆十位」思维到「两个十几相加」，先拆两个、再算个位、再算十位、最后合起来

L4 当前的 3 步教学（拆十位 → 加个位 → 加起来）对于一个十几+个题足够，但对 L5 的两个十几显得粗。新设计把教学拆得更细（5 步），每步只问一个问题，符合用户「越细越好」的偏好。

## 用户确认的关键决策（2026-08-15 brainstorm）

| 决策点 | 选择 |
|---|---|
| 教学步骤数 | 5 步（拆 a / 拆 b / 加个位 / 加十位 / 加起来） |
| 视觉布局 | 锚（顶部）+ 单 sub-equation（每步销毁上一步 sub） |
| 音频 cue 命名 | l5-* 前缀（独立于 L4 的 l3-*） |
| stepBar 标签 | ["拆 a", "拆 b", "加个位", "加十位", "加起来"] |
| Picker 标题 | "十几加十几" |
| 卡片配色 | SUCCESS（绿色）— L1=BLUE / L2=ORANGE / L3=PURPLE / L4=YELLOW |

---

## 1. 架构与文件清单

### 新建文件

```
scenes/level5.js                              # 主场景（沿用 L4 模板，~250 行）
assets/art/badge-5.png                        # 卡片徽章（与 badge-1..4 同款）
```

### 修改文件

```
data/pools.js                                 # 加 generateL5Pool + levelPools[5] + poolGens[5]
data/levels.json                              # 加 { id: 5, title: "十几加十几" }
main.js                                       # 加 levelsData 第 5 项；computePoolCueIds 加 L5 分支；
                                              # 增 level5 导入 + k.scene("level5", ...)
scenes/levelPicker.js                         # 加 SHORT_TITLES[5] 和 CARD_ACCENT[5]；SPRITES 加 badge-5
tools/cues.cjs                                # 暂不修改（l5-* 是 pre-baked composite mp3，由 Tencent TTS
                                              # 单独生成；不经过 cjs manifest 的 chunk pipelines）
tools/_emit-cues.mjs                          # 加 L5 分支生成 l5-* id 列表
tools/emit-cue-ids.mjs                        # 跑一次同步 CUE_IDS
README.md                                     # Levels 表格加 L5
```

### 复用（不改）

```
scenes/roundScene.js                          # createRoundScene scaffold（含 options、playCue、streak）
scenes/level4.js                              # 模板参考源（不复制，仅参照结构）
components/expression.js                      # 锚 + sub 渲染
components/stepBar.js                         # 5 步进度条
components/panda.js                           # cheer/think 表情
components/choice.js                          # 数字按钮
components/theme.js                           # 颜色（SUCCESS 已经在内）
audio/praise.js                               # pickCheerCue / pickWrongCue
audio/panda-audio (main.js)                   # playCue / playSequence / playAfter / stopAllAudio
```

---

## 2. 数据与池

### 池枚举规则

```js
function generateL5Pool() {
  const pool = [];
  for (let a = 11; a <= 19; a++) {
    const onesA = a % 10;
    const bMaxDigit = 9 - onesA;  // 严格个位相加 < 10
    for (let b = 11; b <= 19; b++) {
      const onesB = b % 10;
      if (onesB > bMaxDigit) continue;
      pool.push({
        a, b,
        onesA, onesB,
        sum: onesA + onesB,        // step 3 的答案
        answer: a + b,             // step 5 的答案，∈ [22, 29]
      });
    }
  }
  return pool;
}
```

### 池计数验证

| a | onesA | bMaxDigit | 合法 b 数 |
|---|---|---|---|
| 11 | 1 | 8 | 8 |
| 12 | 2 | 7 | 7 |
| 13 | 3 | 6 | 6 |
| 14 | 4 | 5 | 5 |
| 15 | 5 | 4 | 4 |
| 16 | 6 | 3 | 3 |
| 17 | 7 | 2 | 2 |
| 18 | 8 | 1 | 1 |
| 19 | 9 | 0 | 0 |

**合计 36 个有序 (a, b) 对**。每会话 sample 10，排列组合 P(36,10) ≈ 3.6×10¹⁴，replay 空间充裕。

### answer 范围

- 最小：11 + 11 = 22（onesA=1, onesB=1, sum=2）
- 最大：14 + 15 = 29（合法组合：4+5=9 < 10）；18+11=29 也是
- 范围 [22, 29]，8 个可能值

### sum 范围

- sum = onesA + onesB，onesA ∈ [1, 8]，onesB ∈ [1, 9-onesA]
- 最小 2（11+11），最大 9（11+18、12+17、13+16、14+15）
- 范围 [2, 9]，8 个可能值

---

## 3. 5 步教学布局

### 屏幕布局（沿用 L4 坐标）

```
y=84:   stepBar（5 步）
y=220:  锚：a + b = ?              (size 100, 持久)
y=440:  sub-equation (size 82, 每步销毁)
y=838:  数字按钮
```

### 每步 sub 与按钮

| Step | sub 文本 | 答对值 | `options(correct, ...)` 参数 |
|---|---|---|---|
| 1 | `a = 10 + ?` | onesA (1..8) | `{ min: 0, max: 9 }` |
| 2 | `b = 10 + ?` | onesB (1..9-onesA) | `{ min: 0, max: 9 }` |
| 3 | `onesA + onesB = ?` | sum (2..9) | `{ min: 1, max: 9 }` |
| 4 | `10 + 10 = ?` | 20 | `{ min: 18, max: 20 }` |
| 5 | `20 + sum = ?` | answer (22..29) | `{ min: 20, max: 29 }` |

### 锚 reserve

锚 `[a, "+", b, "=", "?"]` 的 `reserve` 必须锁住 slot 4 到 `answer`（2 位宽），避免 step 5 揭示时整行左偏（与 L4 同款 pattern）：

```js
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}
```

### sub reserve

每个 sub 的 `?` / `□` 槽需要在揭示时保持位置稳定：

- Step 1: `slots: [a, "=", 10, "+", "?"]` — slot 4 是答案，reserve 到 `onesA`（1 位）
- Step 2: `slots: [b, "=", 10, "+", "?"]` — 同上
- Step 3: `slots: [onesA, "+", onesB, "=", "?"]` — slot 4 是 sum，reserve 到 `sum`
- Step 4: `slots: [10, "+", 10, "=", "?"]` — slot 4 是 20，reserve 到 `20`
- Step 5: `slots: [20, "+", sum, "=", "?"]` — slot 4 是 answer，reserve 到 `answer`

boxMode 由 slots 里的 `?` 自动判断（expression.js 的 wantsBox 路径）。

---

## 4. 音频系统

### Cue 命名约定（l5-*）

| Cue id 模板 | 数量 | 模板例 | 语音内容 |
|---|---|---|---|
| `l5-s1-{a}-{b}` | 36 | l5-s1-11-14 | "11 加 14 等于几，我们先把 11 拆成 10 加几" |
| `l5-s2-{a}-{b}` | 36 | l5-s2-11-14 | "我们再拆 14，14 能拆成 10 加几" |
| `l5-s3-{onesA}-{onesB}` | 36 | l5-s3-1-4 | "个位相加 1 加 4 等于几" |
| `l5-s4` | 1 | (静态) | "十加十等于 20" |
| `l5-s5-{sum}` | 8 | l5-s5-5 | "20 加 5 等于几" |
| `l5-rwd-{a}-{b}-{answer}` | 36 | l5-rwd-11-14-25 | "11 加 14 等于 25" |
| **合计** | **153** | | |

`l5-s1-{a}-{b}` / `l5-s2-{a}-{b}` 沿用 L4 的 `l3-s1-{a}-{b}` 模式（参数化两个数字，与 L4 的 `buildL3Step1Ids` 对齐）。读出会话中需要按当前轮的 (a, b) 选 mp3。

### 复用 L4 的 fireL3StepAudio 模式

复制 L4 的 `fireL3StepAudio` 改名为 `fireL5StepAudio`，逻辑不变（chain off `ctx.lastEncourageId`，fallback 调 playSequence）。不重用 L4 的 `buildL3Step1Ids` 等函数，因为 L5 的模板 ID 不一样。

### Step 4 静态 cue

`l5-s4` 只有 1 个（"十加十等于 20"），永远不变。`buildL5Step4Ids()` 永远返回 `["l5-s4"]`。

### Reward cue 链

step 5 onAdvance 链 `l5-rwd-{a}-{b}-{answer}`（沿用 L4 step 3 的 end-of-round 模式）：

```js
return new Promise((resolve) => {
  window.PandaAudio.playAfter(
    ctx.lastEncourageId,
    [`l5-rwd-${round.a}-${round.b}-${round.answer}`],
    { gapMs: 200, seqGapMs: 40 },
    resolve,
  );
});
```

### safety ceiling

完全沿用 L4 的 `fullSafetyMs = cheerMs + SAFETY_BUFFER_MS` 路径（已修过的 sum-full-chain 逻辑，参见 panda-audio-safety-ceiling-full-chain memory）。L5 不需要定制。

### main.js computePoolCueIds 加 L5 分支

```js
} else if (levelId === 5) {
  for (const r of poolGens[5]()) {
    ids.add(`l5-s1-${r.a}-${r.b}`);
    ids.add(`l5-s2-${r.a}-${r.b}`);
    ids.add(`l5-s3-${r.onesA}-${r.onesB}`);
    ids.add(`l5-s4`);                          // 静态
    ids.add(`l5-s5-${r.sum}`);
    ids.add(`l5-rwd-${r.a}-${r.b}-${r.answer}`);
  }
}
```

### level-complete 鼓励音

`pickCheerCue` 共享 `enc-level-1..4` + `panda-cheer-1..2` 池。L5 不需要新增 `enc-level-5`（本次范围外；如果以后想给 L5 单独分级，再加 `enc-level-5` 等条目）。

---

## 5. picker / main.js 接线

### levelsData（第 5 项）

```js
"levels": [
  { "id": 1, "title": "三数相加" },
  { "id": 2, "title": "两数凑十" },
  { "id": 3, "title": "凑十法" },
  { "id": 4, "title": "二十以内" },
  { "id": 5, "title": "十几加十几" },
],
```

### SHORT_TITLES / CARD_ACCENT

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

### 徽章 sprite

新增 `assets/art/badge-5.png`（与 badge-1..4 同款尺寸、风格）。缺少时 pickCard 会回退到文字「第 5 关」（见 levelPicker.js 现有 fallback）。

### scene 注册

```js
const { default: level5 } = await import("./scenes/level5.js?v=20260815");
k.scene("level5", () => level5(k));
```

### levels.json

```json
{
  "levels": [
    { "id": 1, "title": "三数相加" },
    { "id": 2, "title": "两数凑十" },
    { "id": 3, "title": "凑十法" },
    { "id": 4, "title": "二十以内" },
    { "id": 5, "title": "十几加十几" }
  ]
}
```

---

## 6. 入口与无 intro 策略

L4 沿用 L3 的「无 intro」策略（per-round step 1 音频自含引导）。L5 同款：

- **不**播 `lvl-5-intro`（topic statement）— 与 L4 一致
- **step 1 音频** `l5-s1-{a}` 自含：命名算式（"11 + 14 等于几"）+ 提示策略（"先把 11 拆成 10 加几"）

---

## 7. 测试策略

### 池生成验证

加 `tools/verify-l5-pool.mjs`（如未包含在 verify-math.mjs 内则单独写），断言：
- 池大小 = 36
- 每个 (a, b) 满足 onesA + onesB ≤ 9
- 没有 (a, b) 反向（order-sensitive）

### 渲染验证

走 `tools/verify-math.mjs`（已存在）— 跑 L5 每条 round，断言：
- 屏幕上的等式为真
- 有 4 个不同的答案按钮
- 点击正确按钮被接受

如果 `verify-math.mjs` 只跑 L1-L4，加 5 行 L5 调度。

### 音频验证

- `tools/audit-audio.mjs`（已存在）— 跑时拉 `poolGens[5]().flatMap(r => [...])` 的所有 id 集合，断言每个 id 都有 `assets/audio/{id}.mp3` 文件
- `coverage-check.mjs`（已存在）— 拉 `CUE_IDS` 与 `assets/audio/*.mp3` 的双向覆盖

### 视觉稳定

- reserve 锁住锚 slot 4 → answer（2 位宽），避免 step 5 揭示时整行偏移
- 每 step sub-equation 独立 reserve（同上原则）
- 不引入跨步骤连线（不像 L4 有 anchor → split 关系），所以没有 drift 风险

---

## 8. 范围与假设

### 范围（本次 L5 必做）

- 新建 `scenes/level5.js`（5 步教学）
- 改 `data/pools.js`（generateL5Pool + exports）
- 改 `data/levels.json`（加 L5）
- 改 `main.js`（levelsData、imports、scene、computePoolCueIds）
- 改 `scenes/levelPicker.js`（SHORT_TITLES、CARD_ACCENT、SPRITES badge-5）
- 新增 `assets/art/badge-5.png/.svg`
- 跑 `tools/emit-cue-ids.mjs` 同步 CUE_IDS
- 新增 153 个音频（l5-* 前缀）— 由 Tencent TTS 预生成
- README 更新 Levels 表格

### 设计细化的取舍

- **不**复用 L4 的 `buildL3Step*Ids` 等函数（命名不同），但 `fireL3StepAudio` 的逻辑复制改名
- **不**做跨步骤的连线（不像 L4 的 anchor → split 拆分线），因为 L5 的 5 步 sub 各自独立
- **不**做"拆一行 + 底一行"双 sub（与 L4 的拆 + 底不同），L5 坚持每步只显示一个 sub
- **不**为 L5 单独分级鼓励音（enc-level-5），L5 复用现有 enc-level-1..4

### 非范围（不做）

- 不删 L4
- 不改 L4 的音频、布局、cue 命名
- 不改 `roundScene.js`（L5 复用现有 scaffold）
- 不改 `expression.js`（reserve 机制已支持 L5 的 1/2 位锁定）
- 不改 `praise.js`（沿用现有 5-tier 鼓励音）
- 不增加 L5 的 daily cap / 难度变化
- 不支持 a ∈ [10, 19]（10+十几）— 严格十几+十几

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 153 个 MP3 生成失败 / 漏生成 | audit-audio 验证 + emit-cue-ids 同步；CUE_IDS 缺 → 启动时无法注册 pool cue；如果 cue 缺失，运行时 audio Proxy 返回 undefined，console.warn 但 kid 仍能玩 |
| 静态 `l5-s4` 在多 round 重复播放显得乏味 | step 4 只在 36 round 中的每 1 round 都出现一次，且永远只有 1 个 cue，无可避免；接受 |
| step 5 的按钮范围 min:20 max:29 包含 20/21（与 4 的答案临近）| 4 个按钮中 1 个是 answer，外圈 23/24/26/27 等扰动项；与 L4 step 3 的 min:11 max:20 同款 |
| 5 步比 L4 长（用户耐心）| 5 步 × 10 round = 50 步；每步平均 4s 完成约 3.5 分钟；可接受 |
| User 选 l5-* 前缀而非 l3-* 复用 | 优点：L4 改不动 L5 也倒过来；缺点：153 个 MP3 vs L4 的 ~64 个。但用户已选 |
| rotate-hint / portrait | 沿用 L4，不需要新处理 |

---

## 10. 验收标准

- [ ] `tools/verify-math.mjs` 通过（包含 L5）
- [ ] `tools/audit-audio.mjs` 通过（每个 l5-* 都有 mp3）
- [ ] `tools/coverage-check.mjs` 通过
- [ ] `node --check` 每个新文件
- [ ] 5 步 stepBar 文本正确（拆 a / 拆 b / 加个位 / 加十位 / 加起来）
- [ ] L5 卡片显示「十几加十几」标题 + 绿色徽章
- [ ] L5 解锁后 L4 卡片的「▶」仍可点（L4 没被破坏）
- [ ] 36 个 round 全部不进位（个位相加 < 10 严格保持）
- [ ] 锚揭示 reserve 不偏移（reveal 「19」后整行不左偏）
- [ ] 每步 sub 揭示后下一按钮范围匹配
- [ ] 答错 streak 不增（与 L4 一致）
- [ ] 答对 pick 完整 cheer 链后 step 推进（safety ceiling ≥ 完整 chain 时长）

# Whack-a-Mole 重建设计

**日期：** 2026-08-15
**作者：** Claude Fable 5
**状态：** 设计待用户批准

## 背景与动机

Panda 项目原有的打地鼠游戏 `scenes/gameWhack.js`（基于 `components/whackHole.js`）在 2026-08-13 被全部删除（commit `70643b9`），原因：「做的太差了」。本次需求是按照以下新规则**重建**：

- **题型一**：十几 + 个位数（不进位）— 例如 11+3, 13+4, 15+2
- **题型二**：两个个位数相加结果 = 十几（凑十法）— 例如 7+9, 8+6

并要求：

1. 参考热门打地鼠游戏的视觉风格
2. 有相应的动画和声音
3. 形象生动
4. **地鼠出现和隐藏要慢**
5. 适合 3-6 岁小孩

## 用户确认的关键决策（2026-08-14 brainstorm）

| 决策点 | 选择 |
|---|---|
| 答题机制 | 单选答案：顶部显示算式（"a + b = ?"），地鼠带候选答案，点中正确答案 |
| 地鼠风格 | 中国水墨/工笔画风 |
| 洞口背景 | 绿色草地 + 多个圆洞 |
| 游戏节奏 | 限时 90 秒倒计时，看能做对几题 |
| 答错反馈 | 仅动画反馈，不扣分 |
| 题型分布 | 随机目标、动态变换（每5 题切换类型） |
| 洞数 | 6 洞 + 顶部提示 |
| 架构方案 | 全新独立 scene（不复用 pairScene/roundScene） |

---

## 1. 架构与文件清单

### 新建文件

```
scenes/gameWhack.js                       # 主场景（~280 行）
components/whackHole.js                  # 单只洞 + 地鼠封装（~180 行）
data/whackRounds.js                       # 题目生成与校验（~100 行）
tools/verify-whack-rounds.mjs             # 题目生成校验脚本（~80 行）

# 美术资源（MiniMax AI 生成 — 水墨风）
assets/art/mole-1.png/.svg                # 圆眼望天 + 微笑
assets/art/mole-2.png/.svg                # 闭眼笑 + 招手
assets/art/mole-3.png/.svg                # 眨眼 + 歪头
assets/art/mole-4.png/.svg                # 大眼惊讶
assets/art/mole-5.png/.svg                # 害羞捂眼
assets/art/mole-6.png/.svg                # 得意竖耳

assets/art/mole-hole-1.png/.svg           # 圆洞 + 三丛水墨草
assets/art/mole-hole-2.png/.svg           # 椭圆洞 + 落叶
assets/art/mole-hole-3.png/.svg           # 圆洞 + 大叶子

assets/art/grass-ground.png               # 草地横幅背景（1400×260）

# 音频资源（Tencent TTS）
assets/audio/whack-intro.mp3              # "我们来打地鼠吧"
assets/audio/whack-q-pre.mp3              # "算一算"
assets/audio/whack-start.mp3              # "开始"
assets/audio/whack-pop.mp3                # 地鼠钻出音效
assets/audio/whack-down.mp3               # 地鼠钻回音效
assets/audio/whack-tap.mp3                # 点击反馈音
assets/audio/whack-correct.mp3            # "答对啦"
assets/audio/whack-near.mp3               # "差一点点"
assets/audio/whack-done.mp3               # "做完了，真棒"
assets/audio/whack-timeup.mp3             # "时间到啦"
assets/audio/whack-next.mp3               # "再来一道"（可选）
```

### 修改文件

```
main.js                                    # CUE_IDS 增 11 项；新增 k.scene("gameWhack",...)
scenes/gamesPicker.js                      # GAMES 数组加第 5 项 {id:5, scene:"gameWhack"}
tools/cues.cjs                             # 新增 11 个 cue 条目
tools/build-art-minimax.mjs                # 加入 mole/mole-hole 美术条目
tools/emit-cue-ids.mjs                     # 跑一次以同步 CUE_IDS
README.md                                  # 更新 panda-park games 段为 5 个游戏
```

### 复用（不改）

```
audio/praise.js                            # pickCheerCue / pickWrongCue（按 streak 升级鼓励音）
components/celebration.js                  # celebrate(k, {tier})（按 tier 升级视觉粒子）
components/panda.js                        # setMood("cheer"|"think")
components/sceneBg.js                      # bg-meadow 背景
components/stepBar.js                      # 进度条（按答对数 step 推进）
components/expression.js                   # 顶部算式渲染
components/theme.js                        # 颜色常量
```

### 关键 API 设计（whackHole）

```js
const hole = whackHole(k, { x, y, variant });
hole.popUp(value)        // 慢速钻出（0.6s ease-out）+ 显示头顶数字
hole.retreat()           // 慢速钻回（0.4s ease-in）
hole.setSelected(on)     // 选中态（黄圈 → 橙圈）
hole.flashCorrect()      // 答对：闪光 + 缩小 + retreat
hole.shake()             // 答错：横向抖动
hole.isOccupied()        // 当前是否被占（防止重复点击）
hole.getValue()          // 当前头顶数字
```

---

## 2. 游戏状态机与流程

### 主状态

```
INIT → SPAWNING → ANSWERING → (CORRECT | WRONG) → SCORING → NEXT → SPAWNING
                                                              ↓
                                                    (timer=0) → GAME_OVER
```

### 关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 每题同时几只地鼠？ | **6 只全出** | 降低认知压力，孩子不用等；与3-6 岁节奏匹配 |
| 题型混合策略 | **每5 题切换类型（从 Type A 凑十开始）** | 两种题型都练到，不让孩子觉得单调 |
| 题目数量 | **不限题数**，由 90s 决定 | 时间到就结束 |
| 地鼠停留时间 | **永久停留直到点中** | 慢节奏、给孩子充分时间识别数字；不会出现「还没看清就缩回去了」 |
| 答错后是否换题？ | **换题**（避免孩子卡在同一题反复试） | 否则可能心理受挫 |
| 同时活跃地鼠数 | **始终 6 只**（点中一只立刻补一只） | 保持画面满员，不会有"空"的瞬间 |
| 题目重复 | **同一题型内不连续重复** | 类似 gameBounce 的 prevRoundKey 机制 |

### 倒计时

- 顶部右上角：圆角胶囊背景显示「还剩 90 秒」，每秒减 1
- <10s 时数字变红色 + 微微脉冲（缩放 1.0→1.1→1.0）
- 时间到：冻结所有地鼠 + 弹「时间到啦！」+ 0.8s 后切到总结画面

### 总结画面

- 大字「做对 N 道！」
- 1-3 颗星按 N 比例显示（≥10=3星, ≥6=2星, ≥2=1星）
- 2s 后自动返回 gamesPicker

---

## 3. 题目生成与数学范围

### 两种题型

**Type A：凑十（digit + digit = teen）**
- 范围：`a, b ∈ [1..9]`, `a + b ∈ [11..18]`
- 有效对数：13 对
- 排除 `a == b` 的"双胞胎"对（让答案更直观）

**Type B：不进位（teen + digit, sum 仍在 teen）**
- 范围：`a ∈ [11..18]`, `b ∈ [1..(19-a-1)]`
- 有效对数：~30 对
- 避免边界值（和=10/20）

### 题目生成算法（data/whackRounds.js）

```js
const TYPE_A_POOL = [...];  // 启动时一次性生成
const TYPE_B_POOL = [...];

function buildQuestion(type, pool, prevKey) {
  let [a, b], pickTries = 0;
  do {
    [a, b] = sample(pool);
    pickTries++;
    if (pickTries > 20) break;
  } while (`${a}-${b}` === prevKey);

  const answer = a + b;
  const distractors = [];
  const range = [-3, -2, -1, 1, 2, 3, 4];
  while (distractors.length < 5) {
    const d = answer + sample(range);
    if (d !== answer && d >= 1 && d <= 19 && !distractors.includes(d)) {
      distractors.push(d);
    }
  }
  return {
    type, a, b, answer,
    candidates: shuffle([answer, ...distractors]),  // 6 个数字
    key: `${a}-${b}`,
  };
}
```

### 题目类型切换

```
questionIdx: 0 1  2  3  4 | 5  6  7  8  9 | 10 ...
type:        A  A  A  A  A   B  B  B  B  B   A  ...
```

每 5 题切换一次类型，从 Type A（凑十）开始。

### 干扰项设计关键

- 必须是和答案**接近**的数（±1 到 ±4）— 这样孩子要真的算，不能瞎猜
- 不能是另一个真实题目的答案
- 6 个候选数字必须各不相同

### 前置校验（tools/verify-whack-rounds.mjs）

```js
// 在 node 端跑：
// 1. 抽 1000 次题，检查 type 比例正确（5:5）
// 2. 检查所有答案 ∈ [11..18]
// 3. 检查所有 6 个候选数字各不相同
// 4. 检查答案数字确实在候选里
// 5. 检查连续两题不重复
```

### 算式渲染

```js
expression(k, {
  slots: [a, "+", b, "=", "□"],  // "□" 用 boxMode 自动渲染
  x: 748, y: 240, size: 100,
  boxMode: true,
});
```

---

## 4. 视觉设计与动画时序

### 水墨地鼠视觉规范

| 变体 | 姿态/表情 | 用途 |
|---|---|---|
| mole-1 | 圆眼望天 + 微笑 | 通用 / 静态 |
| mole-2 | 闭眼笑 + 招手 | 钻出瞬间 |
| mole-3 | 眨眼 + 歪头 | 钻出后 idle bob |
| mole-4 | 大眼惊讶 | 备选 |
| mole-5 | 害羞捂眼 + 红脸 | 备选 |
| mole-6 | 得意竖耳 | 答对动画 |

- 笔触：水墨渲染、淡赭石底色 + 焦墨轮廓、毛笔飞白笔触
- 尺寸：1024×1024 源图，scale 0.16 → 屏幕 ~164×164px
- 不带阴影（保持水墨扁平感）

### 洞口视觉规范

| 变体 | 描述 |
|---|---|
| mole-hole-1 | 圆洞 + 周围三丛水墨草 |
| mole-hole-2 | 椭圆洞 + 几片落叶 |
| mole-hole-3 | 圆洞 + 一片大叶子盖住半边 |

- 1248×832 源图，scale 0.20 → ~250×166px
- 6 个洞分配：每个变体 2 个（Mulberry32 seed 保证稳定）

### 草地背景

- 全景横幅 1400×260，覆盖整个洞区下方
- 横向水墨笔触渐变 + 几丛蒲公英/三叶草点缀
- 与 bg-meadow 上半部分（天空/远山）融为一体

### 6 洞布局（3×2 网格）

```
colW = 320, rowH = 220
gridX = 748 - 320 = 428 (左)
gridY row0 = 540
gridY row 1 = 760
```

### 动画时序（核心 — 慢节奏）

```
地鼠钻出（popUp）：
  0.00s ───── y 偏移 +60（藏在洞下）
  0.30s ───── y 偏移 +30（半出）
  0.60s ───── y 偏移 0  （完全露出，弹性 ease-out）
  0.70s ───── idle bob 开始（±4px, 周期 1.6s）
  同步：opacity 0→1（淡入）

地鼠钻回（retreat）：
  0.00s ───── y 偏移 0
  0.40s ───── y 偏移 +60（缩进）
  0.40s ───── opacity 1→0
  同步：idle bob 取消

答对反馈（flashCorrect + retreat）：
  0.00s ───── scale 1.0
  0.15s ───── scale 1.4（弹大）+ 黄色光环扩散
  0.35s ───── scale 1.0（恢复）
  0.50s ───── retreat() 启动
  音效：whack-correct

答错反馈（shake）：
  0.10s ───── x 偏移 +12
  0.20s ───── x 偏移 -12
  0.30s ───── x 偏移 +8
  0.40s ───── x 偏移 -8
  0.50s ───── x 偏移 0
  音效：whack-near
```

### 慢节奏硬指标

- 钻出动画 ≥ 0.6s
- 钻回动画 ≥ 0.4s
- 答对闪光 → 完全钻回 总时长 ≥ 1.0s
- 题与题之间间隔 ≥ 0.6s

### 视觉细节

- 头顶数字徽章：圆形黄底（YELLOW），28px 半径，数字字号 36
- 选中态：徽章变橙色（ORANGE），缩放 1.15
- 钻出时墨点效果：洞口散落 3-5 个水墨小点（淡灰，向上飘 0.5s 后消失）

---

## 5. 音频设计

### 新 cue 清单（加入 tools/cues.cjs）

| cue id | 文字 | 用途 |
|---|---|---|
| whack-intro | "我们来打地鼠吧" | 场景进入 |
| whack-q-pre | "算一算" | 题目读出前缀 |
| whack-start | "开始" | intro 后衔接 |
| whack-pop | 短促音效 | 地鼠钻出 |
| whack-down | 短促音效 | 地鼠钻回 |
| whack-tap | 短促音效 | 点击反馈 |
| whack-correct | "答对啦" | 答对专属 |
| whack-near | "差一点点" | 答错但接近 |
| whack-done | "做完了，真棒" | 时间到前自然结束 |
| whack-timeup | "时间到啦" | 倒计时归零 |
| whack-next | "再来一道" | 题间衔接（可选） |

### 音频序列

**场景进入：**
```
playSequence([whack-intro, whack-start], 200, 0)
```

**题目读出链：**
```
playSequence([whack-q-pre, n-A, q-plus, n-B], 200, 0)
```

**点中正确答案：**
```
t=0        : whack-tap（点击音）
t=80ms     : stopAllAudio() + playCue(whack-correct)
            flashCorrect + retreat + celebrate(tier)
t=correct+ : pickCheerCue(streak) → playSequence(chain, 200, 0)
t=chain+   : spawn 新题 + playSequence([whack-q-pre, n-A, q-plus, n-B], 200, 0)
```

**点错：**
```
t=0        : whack-tap
t=80ms     : stopAllAudio() + playCue(whack-near)
t=near+    : 自动 spawn 新题（不要等孩子再试）
```

**时间到：**
```
t=0        : stopAllAudio() + playCue(whack-timeup)
t=timeup+  : playSequence([enc-level-1, panda-cheer-1])
t=chain+   : k.wait(2.0) → k.go("gamesPicker")
```

### 关键不变量

| 不变量 | 实现 |
|---|---|
| 任何时刻 0 或 1 个活跃 audio | 每次播音前调 `PandaAudio.stopAllAudio()` |
| 兜底 timeout 必须 sum 整条 chain | 不再用 `lastEncourageId.duration` 作 fallback；改用 `chain.map(c => PandaAudio.audio[c].duration).reduce((a,b) => a+b+gapMs)` |
| 倒计时归零不能 cut 鼓励音 | 90s 倒计时在 t=88.5s 时主动停止所有 tap/near/spawn，进入 whack-timeup 流程 |
| 题间无重叠 | 题与题之间 k.wait(0.6) 强制间隔 |

### 与已有系统的协调

- **pickCheerCue 复用：** 答对 streak 升级（enc-first-1 → enc-streak3-1 → ... → panda-cheer-1）由 `audio/praise.js` 处理
- **celebrate 复用：** flashCorrect 期间 `celebrate(k, tier)` 渲染粒子
- **whack-correct 是额外反馈**，不替换 enc-* cue

---

## 6. 集成（入口、星级、保存、视觉一致）

### gamesPicker 第 5 张卡片

修改 `scenes/gamesPicker.js`：

```js
const GAMES = [
  { id: 1, title: "小船",  sub: "凑十过河",    scene: "gameBoat",   sprite: "boat",    accent: BLUE },
  { id: 2, title: "气球",  sub: "扎破凑十",    scene: "gameBounce", sprite: "balloon", accent: PINK },
  { id: 3, title: "云朵",  sub: "看算式找答案", scene: "gameCloud",  sprite: "cloud",   accent: PURPLE },
  { id: 4, title: "喂食",  sub: "帮熊猫吃饱",   scene: "gameFeed",   sprite: "bubble",  accent: ORANGE },
  { id: 5, title: "打地鼠", sub: "水墨出题",     scene: "gameWhack",  sprite: "mole",    accent: GREEN },
];
```

5 张卡片 stride=240 在 1366px 上无需重新计算视觉重心。

### main.js 场景注册

```js
import gameWhack from "./scenes/gameWhack.js?v=20260815";
// ...
k.scene("gameWhack", () => gameWhack(k));
```

### CUE_IDS 自动同步

修改 `tools/cues.cjs` 加入 11 个新条目后：

```bash
node tools/emit-cue-ids.mjs   # 重新生成 main.js 的 CUE_IDS 数组
```

### 星级策略

按 90s 内的答对题数：

```
N ≥ 10  → 3 星
N ≥ 6   → 2 星
N ≥ 2   → 1 星
N < 2   → 0 星（不保存进度）
```

### 解锁链

第 5 张卡片初始为锁定态：
- 完成 feed（levelId=4）后自动解锁 whack
- 显示锁图标 + 灰色背景 + LOCKED_BG / LOCKED_INK

### 视觉一致性核对清单

| 项 | 与现有游戏一致？ |
|---|---|
| 顶部 tab 栏 | ✅ 复用 |
| 返回按钮（左上 ←） | ✅ iconButton 复用 |
| 标题栏 | ✅ 复用 |
| stepBar 进度条 | ✅ 复用 |
| 背景 bg-meadow | ✅ 复用 |
| 熊猫 buddy | ✅ 复用 |
| 字号/字体 (FONT) | ✅ 复用 |
| 颜色常量 | ✅ 复用 |

### 不动的东西

- ❌ 不修改 `audio/praise.js`
- ❌ 不修改 `components/celebration.js`
- ❌ 不修改 `components/panda.js`
- ❌ 不修改 `components/sceneBg.js`
- ❌ 不修改 `components/expression.js`
- ❌ 不修改 `components/stepBar.js`
- ❌ 不修改 `components/theme.js`
- ❌ 不修改 `roundScene.js` / `pairScene.js`
- ❌ 不修改 `scenes/level*.js`

---

## 实施顺序（high-level）

1. **Phase 1 — 数据层**：写 `data/whackRounds.js` + `tools/verify-whack-rounds.mjs`，跑通校验
2. **Phase 2 — 美术**：用 MiniMax 生成 6 个水墨地鼠 + 3 个洞口 + 草地背景，写 `tools/build-art-minimax.mjs`
3. **Phase 3 — 音频**：tools/cues.cjs 加入 11 个新 cue，跑 `npm run audio:build` 生成 mp3
4. **Phase 4 — 组件**：写 `components/whackHole.js`（地鼠钻出/钻回动画封装）
5. **Phase 5 — 主场景**：写 `scenes/gameWhack.js`（状态机 + 计时器 + spawn 循环 + tap 判定 + 音频序列）
6. **Phase 6 — 集成**：main.js + gamesPicker.js + README.md 更新
7. **Phase 7 — 校验**：screenshot + 人工 smoke test + verify-whack-rounds.mjs

---

## 已知风险

1. **MiniMax 水墨风生成可能不稳定** — 需多 prompt 反复调，提供多参考图
2. **TTS 「差一点点」语气需调** — 温柔而非打击
3. **90s 内 6 只地鼠同时出现可能造成视觉拥挤** — 已在 colW=320 布局上验证足够，但需 screenshot 复核
4. **.raw/mole.jpg 已删除**，需从头生成参考图喂给 MiniMax
5. **音频兜底 timeout 计算** — 必须 sum 整条 chain（panda memory 警告），需写单元测试

---

## 不在范围内

- ❌ 多语言切换
- ❌ 关卡难度递增（90s 内难度固定，由题型切换提供变化）
- ❌ 多人对战模式
- ❌ 自定义题型
- ❌ 把打地鼠集成到数学关关里（仍是独立 gamesPicker 入口）
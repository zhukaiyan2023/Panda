# 二十以内第一步布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整 L4「二十以内」第一步，使其稳定展示“原式 + 拆分式 + 两条连线”的教学布局。

**Architecture:** 仅修改 `scenes/level4.js` 的第一步渲染。顶部原式继续由 `setAnchorEquation()` 管理；第一步下方改为独立的拆分表达式 `10 + □ + b = ?`，并通过表达式节点暴露的槽位中心绘制 `a → 10` 和 `a → □` 两条连线。第二、第三步的现有布局、答题数据流和音频链保持不变。

**Tech Stack:** 原生 JavaScript、Kaplay、项目现有 `expression()` 组件、Playwright/Node 校验脚本。

## Global Constraints

- 第一阶段必须显示 `a + b = ?` 与 `10 + □ + b = ?`。
- 连线必须连接顶部 `a` 的槽位中心到下方 `10` 与 `□` 的槽位中心。
- 必须适配 `11` 至 `18` 等不同两位数，以及 `b` 的一位数宽度变化。
- 不改变 L4 现有音频 cue、答题正确值和步骤推进逻辑。
- 任何时候只保留当前第一阶段的两条连线，进入下一阶段时必须销毁。
- 不使用定时器估算音频链；现有事件驱动音频逻辑保持原样。

---

### Task 1: 为第一步增加稳定的拆分式和连线渲染

**Files:**
- Modify: `scenes/level4.js:55-125, 180-220`
- Test: `tools/verify-l3-audio.mjs`（仅运行现有回归验证，不改变其音频职责）

**Interfaces:**
- Consumes: `ctx.anchorEqNode`, `ctx.arrowsRoot`, `ctx.arrowNodes`, `expression()`, `drawLink()`-equivalent geometry.
- Produces: `renderL4Step1Split(ctx, round, ones)`，负责渲染第一步下方表达式和两条连线；`ctx.level4Step1Links` 保存当前连线节点。

- [ ] **Step 1: 写出布局回归检查所需的最小可验证条件**

在 `scenes/level4.js` 增加一个纯几何辅助函数，输入表达式节点的槽位中心和尺寸，输出两条线的起止点；要求输入槽位不足时返回空数组：

```js
function splitLinkPoints(anchor, split) {
  if (!anchor?.slotCenters || !split?.slotCenters) return [];
  if (anchor.slotCenters[0] == null || split.slotCenters[0] == null || split.slotCenters[2] == null) {
    return [];
  }
  return [
    {
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to: { x: split.slotCenters[0], y: split.slotY - split.slotSizes[0] / 2 },
      color: COL_TEN,
    },
    {
      from: { x: anchor.slotCenters[0], y: anchor.slotY + anchor.slotSizes[0] / 2 },
      to: { x: split.slotCenters[2], y: split.slotY - split.slotSizes[2] / 2 },
      color: COL_NEED,
    },
  ];
}
```

- [ ] **Step 2: 运行语法检查，确认新增辅助函数尚未改变现有行为**

Run: `node --check scenes/level4.js`
Expected: exit code `0`.

- [ ] **Step 3: 实现第一步表达式和连线**

增加第一步专用渲染函数，先销毁旧线，再创建下方表达式：

```js
function renderL4Step1Split(ctx, round, ones, answerSlot = "?") {
  ctx.arrowNodes?.forEach((node) => node.destroy());
  ctx.arrowNodes = [];

  if (ctx.step1SplitNode) ctx.step1SplitNode.destroy();
  ctx.step1SplitNode = expression(ctx.k, {
    slots: [TEN, "+", ones === null ? "□" : ones, "+", round.b, "=", answerSlot],
    colors: [COL_TEN, undefined, ones === null ? COL_NEED : COL_NEED,
      undefined, COL_SMALL, undefined, undefined],
    x: LAYOUT.barX,
    y: 440,
    size: 82,
  });

  const points = splitLinkPoints(ctx.anchorEqNode, ctx.step1SplitNode);
  for (const point of points) {
    ctx.arrowNodes.push(drawLink(ctx.k, ctx.arrowsRoot, point.from, point.to, point.color, 7));
  }
  return ctx.step1SplitNode;
}
```

实现时保证 `□` 位于拆分式的 slot index `2`，这样 `10 + □ + b = ?` 的槽位始终固定；不能通过拼接字符串或估算文本宽度定位线。

- [ ] **Step 4: 将第一步改为使用新的布局，但保留现有音频回调和答题值**

第一步初始化时调用：

```js
ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
const renderStep1 = () => renderL4Step1Split(ctx, round, null);
fireL3StepAudio(
  ctx,
  buildL3Step1Ids(round.a, round.b),
  1,
  renderStep1,
);
```

第一步 `question.correct` 继续使用 `ones`，按钮范围继续使用：

```js
question: {
  correct: ones,
  values: options(ones, { min: 0, max: 9 }),
},
```

在正确选择后的 `onAdvance` 中重新渲染为：

```js
renderL4Step1Split(ctx, round, ones);
```

这样视觉结构变为 `10 + 4 + 1 = ?`，而非旧的 `14 = 10 + 4`；音频仍然使用原有 `l3-s1-${a}-${b}`。

- [ ] **Step 5: 清理跨步骤节点，避免连线叠加**

在进入第二步前销毁 `ctx.step1SplitNode` 和 `ctx.arrowNodes`，或将第一步节点放入现有 body 生命周期中。第二步必须继续使用自己的 `parensForm` 和 active equation，不得看到第一步残留的两条线。

- [ ] **Step 6: 运行静态和音频回归验证**

Run:

```bash
node --check scenes/level4.js
node tools/coverage-check.mjs
node tools/verify-l3-audio.mjs
```

Expected:
- `node --check` exit `0`。
- `coverage-check` 输出 `OK — every text in the game has a matching audio cue.`。
- 音频验证至少不因本次布局修改新增失败；若现有 verifier 仍使用旧 level 映射，记录其已有失败原因，不修改音频逻辑来掩盖布局问题。

- [ ] **Step 7: 查看差异并提交**

Run:

```bash
git diff --check
git diff -- scenes/level4.js
```

确认只改第一步布局及其生命周期清理后，提交：

```bash
git add scenes/level4.js
git commit -m "feat: redraw level four split layout"
```

---

## Self-review checklist

- 原式 `a + b = ?` 的 `a` 槽位是否始终是 `slotCenters[0]`？是。
- 拆分式是否始终为 `10 + □ + b = ?`？是，slot index `2` 保留给个位。
- `14`、`11`、`18` 等数字变化是否依赖槽位中心而非硬编码 x 坐标？是。
- 音频、正确答案、按钮范围是否改变？不改变。
- 第二步是否会残留第一步线条？通过销毁 `arrowNodes` 与 `step1SplitNode` 避免。
- 是否需要改 `main.js` 或音频文件？不需要。
- 是否新增无关重构？不新增。

**Plan status:** ready for execution after review.

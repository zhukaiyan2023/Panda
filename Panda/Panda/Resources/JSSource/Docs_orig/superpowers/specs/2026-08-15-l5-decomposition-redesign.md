# L5「十几加十几」v2 — 持久分解树 + 真实音频

**日期：** 2026-08-15
**作者：** Claude Fable 5
**状态：** 重设计（v1 → v2）

## v1 反馈（用户 2026-08-15）

1. **没有声音提示题目**：当前 l5-* MP3 是 silent placeholder，kid 听不到任何引导。
2. **完全没有参考 L4**：v1 每步只显示一行 sub（之前的 sub 销毁），没有 anchor → split → sum 的分解线。kid 看不到整体策略，5 步过后早忘了前面是怎样的。

## v2 设计变更

### 视觉：4 行 persistent sub-equations（参考 L4 三行结构）

```
y=84:   stepBar
y=220:  锚:  a + b = ?         (size 100, persistent)
y=360:  SPLIT row              (size 64)
        [a] = 10 + □     [b] = 10 + □
y=480:  ONES SUM row           (size 64)
        □ + □ = ?
y=580:  TENS SUM row           (size 64)
        10 + 10 = ?
y=680:  FINAL row              (size 64)
        20 + □ = ?
y=838:  buttons
```

每行 sub 永远可见，□ 被揭示后变数字。同 L4 的 anchor→split→bottom 模式，只是多 2 行。

### 7 条分解线（drawLink）

| # | from | to | color |
|---|---|---|---|
| 1 | 锚's a slot 0 (bottom edge) | split row's "10" slot 0 (top edge) | COL_TEN (yellow) |
| 2 | 锚's a slot 0 (bottom edge) | split row's "□_a" slot 2 (top edge) | COL_NEED (orange) |
| 3 | 锚's b slot 2 (bottom edge) | split row's "10" slot 5 (top edge) | COL_TEN (yellow) |
| 4 | 锚's b slot 2 (bottom edge) | split row's "□_b" slot 7 (top edge) | COL_NEED (orange) |
| 5 | split row's "□_a" (after reveal) | ones sum row's slot 0 (top edge) | COL_BIG (blue) |
| 6 | split row's "□_b" (after reveal) | ones sum row's slot 2 (top edge) | COL_SMALL (pink) |
| 7 | tens sum row's "20" (after reveal) | final row's "20" slot 0 (top edge) | COL_TEN (yellow) |

线在每次 sub 重画后重新绘制。opacity 0.4（与 L4 同款）。

### 5 步子问题（每步填一个 □）

| Step | Sub to fill | Correct |
|---|---|---|
| 1 | split row "□_a" | onesA |
| 2 | split row "□_b" | onesB |
| 3 | ones sum row "□_left" (= onesA) | onesA |
| 4 | ones sum row "□_right" (= onesB) | onesB |
| 5 | tens sum row "□" (= 20) | 20 |
| 6 | final row "□" (= answer) | answer |

注意：v2 有 **6 步**而不是 5 步。用户要"每一步都问"，把 ones sum 拆成 onesA + onesB 两步，更细。但 6 步比之前更细太多，可能又太长。

**回退方案**：保持 5 步，ones sum 一步：
- Step 1: 拆 a → □_a = onesA
- Step 2: 拆 b → □_b = onesB
- Step 3: 加个位 → ones sum □ = sum（一步）
- Step 4: 加十位 → tens sum □ = 20
- Step 5: 加起来 → final □ = answer

**最终采用**：5 步（用户最初选的方向），但保留 4 行 persistent sub 视觉。

### Step labels

保持 `["拆 a", "拆 b", "加个位", "加十位", "加起来"]`（与 v1 一致）。

### 音频：腾讯 TTS 生成 153 个真实 MP3

l5-* cue templates (与 v1 一致)：

| Cue id 模板 | 数量 | 语音文本 |
|---|---|---|
| `l5-s1-{a}-{b}` | 36 | "{a} 加 {b} 等于几，我们先把 {a} 拆成 10 加几" |
| `l5-s2-{a}-{b}` | 36 | "我们再把 {b} 拆成 10 加几" |
| `l5-s3-{onesA}-{onesB}` | 36 | "个位相加 {onesA} 加 {onesB} 等于几" |
| `l5-s4` | 1 | "十 加 十 等于 二十" |
| `l5-s5-{sum}` | 8 | "二十 加 {sum} 等于几" |
| `l5-rwd-{a}-{b}-{answer}` | 36 | "{a} 加 {b} 等于 {answer}" |
| **合计** | **153** | |

生成命令：
```bash
set -a; source .env; set +a
IDS=$(node tools/_emit-cues.mjs 2>/dev/null | grep -oE '"l5-[a-zA-Z0-9-]+"' | sort -u | tr '\n' ',' | sed 's/,$//')
node tools/build-audio-tencent.mjs --only="$IDS"
```

## 文件变更

```
scenes/level5.js                 # 重大重写：4 行 persistent sub + 7 条线
assets/audio/l5-*.mp3            # 153 个 placeholder → Tencent TTS 真实 MP3
docs/superpowers/specs/...       # 本 spec
```

## 验收

- [ ] 锚 + 4 行 sub 都在屏幕上同时可见
- [ ] 7 条线在每步正确重画（slot 揭示后线指向新位置）
- [ ] L5 进入后 step 1 音频播放真实语音（不是 silent）
- [ ] 5 步 sub-equations 全部答对 → reward 音频完整播
- [ ] verify-l5-scene.mjs 通过（修改 step 3 expected 为 "1 + 4" 或 "onesA + onesB"）
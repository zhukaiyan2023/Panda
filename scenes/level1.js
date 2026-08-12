// scenes/level1.js — 三数相加 (three-addend addition, sum ≤ 10).
// Taught in 2 explicit steps with a persistent anchor and merge-line
// visual aid. Per user feedback 2026-08-11, the screen now shows:
//
//   cells:         [a][b][c]          — boxes-with-circles visual aid at the
//                                       TOP of the screen; per-group number
//                                       labels removed (the colored group
//                                       already reads as "how many")
//   anchor:        "a + b + c = □"   — the question, below cells
//   preview:       "□ + c = □"        — what step 2 will look like, below anchor
//   pair-sum eq:   "a + b = □"        — the actual question kid picks
//   buttons:       4 options for the answer
//
// Merge lines connect the anchor's first two addends (a and b) DOWN to
// the preview's merge box (the first □), converging at the box. The
// shape is an upward-opening V (╲╱) — the wide arms at the top point
// at the anchor's numbers, and the V's point sits AT the merge box.
// Per user feedback 2026-08-11: "6+1+2=□ �╱ □ +2=□ 应该是这个形式。"
// Arrowhead color follows each addend's color (blue for "1", yellow
// for "7") so the eye traces each number back to its arm.
//
// The V opens upward (the "向上的开口") and the arms originate at the
// numbers in the anchor — establishing the relationship with the
// numbers, not the box (per user feedback: "和数字建立关系，不是和
// 方格子建立关系"). `□` (Unicode WHITE SQUARE) is the unknown marker,
// matching 凑十法's visual convention (per user feedback 2026-08-11:
// "用这个方格子表示未知，不要用问号了").
//
// Teaching flow (sum ≤ 10, no pair-to-ten trick):
//   * Pair = the first two addends. Third is the leftover.
//   * Step 1 — Pair:        kid picks the pair sum from "a + b = □". The
//                            merge lines point DOWN at each number with V
//                            arrowheads, showing the relationship between
//                            the merge result and its two components; on
//                            the correct pick, the preview's first □
//                            reveals to the pair sum (orange) and the
//                            pair-sum eq reveals to "a + b = pairSum".
//   * Step 2 — Add the rest: preview now reads "<pairSum> + c = □" (merge
//                            already revealed), pair-sum eq is locked in
//                            as "a + b = pairSum". Kid picks the total.
//                            On the correct pick, the preview's last □,
//                            the step-2 sub-question, AND the anchor all
//                            reveal to the total; cells pulse.
//
// This level's pool is the SUM-≤-10 branch only — make-a-ten triples
// (where two of three sum to 10) live in level2.js, NOT here. So
// `choosePair` never has to look for a pair-to-ten; it always uses
// the first two indices. That's why this file is much shorter than
// the original "combined" L1.
//
// On a correct pick on step 2 the anchor's "□" reveals to the answer
// (alongside the preview's last □ and the step-2 sub-question). Step 1's
// correct pick only fills the preview's first □ and the pair-sum
// equation — the anchor still asks "□".

import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK, ORANGE } from "../components/theme.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import drawLink from "../components/drawLink.js?v=20260812";
import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260812";
import { poolGens } from "../data/pools.js?v=20260812";

const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];

// Pick the pair to add first. L1's pool only contains sum-≤-10 triples,
// so there is never a pair-to-ten shortcut — always use the first two
// addends as the pair and the last as the third. The function shape
// mirrors level2.js's choosePair for visual consistency, but here
// `isMakeTen` is always false.
function choosePair(nums) {
  return {
    pair: [nums[0], nums[1]],
    third: nums[2],
    pairSum: nums[0] + nums[1],
    isMakeTen: false,
  };
}

// Anchor slots for the persistent top equation "a + b + c = ?". Each addend
// keeps its own color so the visible cells and the anchor agree.
function anchorSlots(nums, sumSlot) {
  return {
    slots: [nums[0], "+", nums[1], "+", nums[2], "=", sumSlot],
    colors: [COLORS[0], undefined, COLORS[1], undefined, COLORS[2], undefined, undefined],
  };
}

// Custom `□ + third = □` text node rendered above the cells. This is the
// visual aid showing what step 2 will look like — the merge result plus
// the third addend, equals the running total. Lives independently of the
// round scaffold's "active equation" so the buildStep path doesn't
// overwrite it. The child never picks anything here — step 2's pairSum
// reveal animates the left `□` to the pair sum; step 2's onAdvance
// animates the right `□` to the total.
//
// Two reveal parameters (both default null = unrevealed):
//   mergeSlot  — when set, the first `□` becomes that number (colored
//                orange — the pair-sum color used throughout L1).
//   totalSlot  — when set, the last `□` becomes that number (colored
//                INK — the standard reveal color).
//
// Tracked on ctx.simplifiedPreview so the caller can re-render cleanly
// across the round. Renders through the shared `expression` component
// with `boxMode: true` and `□` text — same pattern 凑十法 uses for its
// unknowns (per user feedback 2026-08-11: "用这个方格子表示未知，
// 不要用问号了"). The third addend keeps its own color so the visual
// link "merge result + blue/yellow third = total" matches the anchor.
function simplifiedPreview(ctx, third, thirdIdx, mergeSlot = null, totalSlot = null, y = 520) {
  if (ctx.simplifiedPreview) ctx.simplifiedPreview.destroy();
  const firstSlot = mergeSlot != null ? String(mergeSlot) : "□";
  const lastSlot = totalSlot != null ? String(totalSlot) : "□";
  const slots = [firstSlot, "+", third, "=", lastSlot];
  const colors = [
    mergeSlot != null ? ORANGE : undefined,  // merge: orange when revealed
    undefined,                                // "+"
    COLORS[thirdIdx],                         // third (always its own color)
    undefined,                                // "="
    totalSlot != null ? INK : undefined,      // total: INK when revealed
  ];
  ctx.simplifiedPreview = expression(ctx.k, {
    slots,
    colors,
    x: LAYOUT.barX,
    y,  // step 1: y=520 (below anchor). Caller may override.
    size: 82,
    boxMode: true,
  });
}

// Renders one merged cell row: total cells = sum of nums; each addend fills
// its own contiguous block of cells with that addend's color. When
// `highlight` is given (a pair to add first) the matching cells pulse so the
// child sees which two to add. When `boundary` (a group index) is given, an
// extra-wide gap is inserted on either side of that group so it reads as a
// visually separate "third" instead of one continuous row — used on step 2
// after the pair is taught, to mirror the "(pair) + third" grouping. When
// `flushBoundary` is also set, the boundary group is rendered with no gaps
// between its own cells so the third reads as a single connected block.
function mergedRow(ctx, nums, opts = {}) {
  const { k } = ctx;
  const { highlight = null, boundary = null, flushBoundary = false, y: rowY = 480 } = opts;
  const total = nums.reduce((a, b) => a + b, 0);
  // Cells shrunk from 72 → 52, gap 8 → 6, extraGap 40 → 28 (2026-08-10).
  // The previous 72-px squares made the largest make-a-ten row (e.g.
  // 6+4+5 = 15 cells with boundary) span 1256 px — wider than the
  // 1366-px canvas — so the body row ended up exactly under the panda
  // at the left edge. 52-px cells give the 15-cell case an 894-px
  // row, leaving ~35 px clearance from the (new) 180-px panda and
  // ~30 px from the canvas edge.
  const cell = 52;
  const gap = 6;
  const extraGap = 28;

  // Compute each cell's x offset from the first cell. `boundary` widens the
  // gap immediately before and after that group; `flushBoundary` zeroes
  // the gap between consecutive cells inside that group.
  const offsets = new Array(total);
  let cursor = 0;
  for (let g = 0, idx = 0; g < nums.length; g++) {
    for (let c = 0; c < nums[g]; c++) {
      offsets[idx++] = cursor;
      cursor += cell;
      if (idx < total) {
        const isLastInGroup = c === nums[g] - 1;
        const isFirstInGroup = c === 0;
        let gSize = gap;
        if (boundary != null) {
          // Extra gap only on the immediate left and right of the boundary
          // group (the "third"), so the pair stays contiguous and only the
          // third is visually separated.
          const isBoundaryLeft = isLastInGroup && g === boundary - 1;
          const isBoundaryRight = isFirstInGroup && g === boundary;
          if (isBoundaryLeft || isBoundaryRight) gSize = extraGap;
        }
        if (flushBoundary && g === boundary) gSize = 0;
        cursor += gSize;
      }
    }
  }
  const totalW = offsets[total - 1] - offsets[0] + cell;
  const startX = LAYOUT.barX - totalW / 2 + cell / 2;
  const y = rowY;

  const root = k.add([k.pos(0, 0)]);
  const cellNodes = [];
  // Per-addend block info, exposed on the returned root so the merge-line
  // helper (drawMergeLines) can target each pair cell group's center. One
  // entry per addend: { x, y, colorIdx }. y is the visual row's center (so
  // arrows leave from the top edge by subtracting cellSize/2 at draw time).
  const groupBlocks = [];

  let cellIdx = 0;
  nums.forEach((n, colorIdx) => {
    const color = COLORS[colorIdx];
    const groupFirstIdx = cellIdx;
    for (let c = 0; c < n; c++) {
      const cx = offsets[cellIdx] + startX;
      const isHighlighted = highlight && highlight.includes(n);
      const box = root.add([
        k.rect(cell, cell, { radius: 14 }),
        k.color(255, 250, 240),
        k.outline(4, k.rgb(...INK)),
        k.pos(cx, y),
        k.anchor("center"),
      ]);
      // Cells in the highlighted pair get an orange ring so the eye lands on
      // them. The ring is the highlight, not a competing outline.
      if (isHighlighted) {
        root.add([
          k.rect(cell + 16, cell + 16, { radius: 22 }),
          k.color(...ORANGE),
          k.opacity(0.45),
          k.outline(4, k.rgb(...INK)),
          k.pos(cx, y),
          k.anchor("center"),
        ]);
      }
      root.add([
        k.circle(Math.round(cell * 0.5)),
        k.color(...color),
        k.pos(cx, y),
        k.anchor("center"),
      ]);
      cellNodes.push({ box, cx, isHighlighted });
      cellIdx++;
    }

    // Per-group block info (center x, y, colorIdx) — exposed via
    // root.groupBlocks below for any future visual that needs to target
    // an addend's cell group. Not used by drawMergeLines anymore (the V
    // originates at the anchor's addends, not the cells) but kept so
    // the pulse animation can still find group anchors if needed.
    const groupLastIdx = cellIdx - 1;
    const groupCenterX = (offsets[groupFirstIdx] + offsets[groupLastIdx]) / 2 + startX;
    groupBlocks.push({ x: groupCenterX, y, colorIdx });
    // Per-group number label intentionally removed (per user feedback
    // 2026-08-11: "方格下面的数字去掉"). The cells themselves show the
    // count visually (each box-with-circle = one unit), and the
    // colored circle's group already reads as "how many" — the
    // redundant `n` text label below each color group is gone.
  });

  // Pulse all cells once. Called when the child answers correctly.
  root.pulse = () => {
    cellNodes.forEach(({ box }) => {
      k.tween(box.opacity ?? 1, 0.4, 0.15, (v) => { box.opacity = v; });
      k.wait(0.15, () => {
        k.tween(box.opacity ?? 1, 1, 0.25, (v) => { box.opacity = v; });
      });
    });
  };

  // Expose per-group block centers + cell size for the merge-line helper.
  // drawMergeLines reads these to point arrows at each pair cell group.
  root.groupBlocks = groupBlocks;
  root.cellSize = cell;

  return root;
}

// Draws a thin colored line from `from` to `to`. Kaplay has no built-in
// line primitive; a rotated rect anchored at its left edge is equivalent.
// Same helper level3.js uses for its decomposition arrows (drawn as part
// of the merge-line visualization in step 2 below). Lines added to
// `parent` so they inherit its destroy() chain — roundScene's
// clearBody() teardown cascades through ctx.arrowsRoot for the cleanup.

// Draws L1's merge lines: two arrows from the anchor's first two
// addends (slot 0 = a, slot 2 = b) DOWN to the preview's merge box
// (slot 0), with a V-shaped arrowhead AT the merge box. The visual
// reads:
//
//      [a] + [b] + [c] = □     ← anchor (top)
//        ╲      ╱
//          ╲  ╱                  ← V converges at merge box
//      [□] + [c] = □           ← preview
//
// Per user feedback 2026-08-11: "6+1+2=□ ╲╱ □ +2=□ 应该是这个形式。
// 应该是向上的开口，和数字建立关系，不是和方格子建立关系。" The V
// arms originate at the anchor's numbers (the relationship is with
// the numbers, not the box) and open upward (the "向上的开口") so the
// wide end of the V points back at the anchor — the V's point sits AT
// the merge box, terminating the line where the two addends meet.
//
// Arrows attach to ctx.arrowsRoot so they persist across step 1 → step
// 2 (same UX rule 凑十法 uses for its decomposition arrows per
// level3.js — the kid always sees the merge-line visualization through
// the entire round). The third addend (slot 4 in the anchor) does NOT
// get a line — it's added in step 2's equation, not merged into the
// pair result.
//
// Slot positions are stable across step 1 → step 2 transitions:
//   - Anchor slots 0/2 hold the addends, which never change; the line
//     source stays anchored at the same pixel.
//   - Preview slot 0 renders as either `□` (step 1) or a single-digit
//     pairSum (step 2). Both have the same per-char width (1.6 × size
//     vs 0.62 × size per digit, but expression() uses slotSizes[0]=size
//     for both since the box renders as `size` tall), so the merge
//     box's top edge y stays put — existing arrows still terminate
//     correctly without a redraw. The postRender hook re-runs anyway
//     for safety.
function drawMergeLines(ctx) {
  ctx.arrowNodes.forEach((n) => n.destroy());
  ctx.arrowNodes = [];

  const preview = ctx.simplifiedPreview;
  const anchor = ctx.anchorEqNode;
  if (!preview || !preview.slotCenters || preview.slotCenters[0] == null) return;
  if (!anchor || !anchor.slotCenters) return;

  // Target: top edge of the merge box (slot 0 of simplified preview).
  // The V converges HERE — the point of the V sits on the box.
  const targetX = preview.slotCenters[0];
  const targetY = preview.slotY - preview.slotSizes[0] / 2;

  // Sources: anchor's first two addends. The anchor slots are
  // [a, "+", b, "+", c, "=", sum], so the pair addends live at slot 0
  // (color COLORS[0]) and slot 2 (color COLORS[1]).
  const sourceSlots = [0, 2];
  const headHalfWidth = 16;   // V arms extend horizontally from center
  const headHeight = 18;      // V arms extend vertically up from point
  const headThickness = 5;

  sourceSlots.forEach((slotIdx, i) => {
    const sourceX = anchor.slotCenters[slotIdx];
    const sourceY = anchor.slotY + anchor.slotSizes[slotIdx] / 2;

    // Main line: from anchor addend (bottom edge) DOWN to merge box
    // (top edge). The two lines converge at the merge box, forming
    // the "╲ ╱" shape that opens upward.
    const line = drawLink(
      ctx.k, ctx.arrowsRoot,
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      COLORS[i],
    );
    ctx.arrowNodes.push(line);

    // V-shaped arrowhead at the merge box. Point at the box (the V's
    // narrow end), arms going UP and OUT — opening upward toward the
    // anchor (the "向上的开口"). Color matches the line so the
    // arrowhead reads as one visual unit with the line that precedes it.
    const leftEnd = { x: targetX - headHalfWidth, y: targetY - headHeight };
    const rightEnd = { x: targetX + headHalfWidth, y: targetY - headHeight };
    ctx.arrowNodes.push(
      drawLink(ctx.k, ctx.arrowsRoot,
        leftEnd, { x: targetX, y: targetY },
        COLORS[i], headThickness),
    );
    ctx.arrowNodes.push(
      drawLink(ctx.k, ctx.arrowsRoot,
        rightEnd, { x: targetX, y: targetY },
        COLORS[i], headThickness),
    );
  });
}

// Subtle opacity blink — the "只做隐显，不要做移动" reminder per user
// feedback 2026-08-11. The flash fades the equation's opacity between
// full and a soft dim, no scale change. "隐显" = hide/reveal — the
// equation dims slightly and returns, drawing attention without
// anything moving on screen. Loop pattern: two quick blinks close
// together at start ("look here" beat), then a longer quiet gap
// before the next reminder — the equation isn't constantly flashing.
//
// Tweens the root node's opacity so all slots dim together. Fire-
// and-forget — when the kid picks an answer the equation node gets
// destroyed on the next round and any in-flight tween just gets
// garbage-collected with it, no cancel handle needed.
function gentlePulse(k, eqNode) {
  if (!eqNode) return;
  const dim = 0.45;        // opacity at the bottom of the fade
  const upDur = 0.16;      // fade-out duration
  const downDur = 0.22;    // fade-in duration
  const breath = 0.50;     // gap between consecutive blinks
  const longBreath = 1.4;  // gap after the third blink before the loop restarts
  const blink = (i) => {
    const cur = eqNode.opacity ?? 1;
    k.tween(cur, dim, upDur, (v) => { eqNode.opacity = v; });
    k.wait(upDur, () => {
      k.tween(dim, 1, downDur, (v) => { eqNode.opacity = v; });
      const gap = i < 2 ? breath : longBreath;
      k.wait(downDur + gap, () => blink((i + 1) % 3));
    });
  };
  blink(0);
}

// Spoken intro for a step. Step 2 reads the simplified form
// "what is pairSum plus third". Step 1 doesn't need its own prompt — the
// per-round decompose sentence (built in the step 1 factory below) already
// ends with the step-1 sub-question, so adding another spoken prompt would
// just repeat it.
//
// When called after a correct pick, chains off ctx.lastEncourageId — the
// actual last cue of the cheer audio set by onPick (enc-first-N on the
// first pick, panda-praise-N on streak-3+, panda-cheer-N on level-
// complete). The old reference was hardcoded to "panda-celebrate",
// which is gone from CUE_IDS. Chaining off the actual last cue means
// the next step's prompt starts immediately when the celebration ends,
// with no fixed setTimeout and no overlap with the celebration tail.
function speakSequence(k, ids, ctx) {
  if (ctx && ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
      gapMs: 400,
      seqGapMs: 40,    // closer to "fluent speech" than the prior 200ms
    });
    return;
  }
  k.wait(0.1, () => window.PandaAudio.playSequence(ids, 40));
}

// Builds the per-round L1 "decompose" sentence as one pre-baked composite
// mp3 per (a, b, c). The full sentence reads:
//
//   a 加 b 加 c 等于几，这个问题可以分解成我们先看看前两个数相加。
//   a 加 b 等于几
//
// The split lets the step-1 sub-question ("a + b = ?") appear at the
// natural break between explanation and question. Phase 1 ends with
// the first "等于几" (the explanation of the whole problem); the kid
// hears "2+3+4等于几, 这个问题可以分解成..." and THEN sees the
// "2+3=?" they're meant to answer, paired with the phase-2 question
// "2 加 3 等于几". Showing the sub-question immediately (the old
// behavior) made the screen busy before the kid knew the strategy.
// (2026-08-12: dropped the leading "先看下" — the user found it
// redundant; the sentence already opens with the equation.)
function buildL1Phase1Ids(a, b, c) {
  // Single composite mp3 — "先看下 a 加 b 加 c 等于几，这个问题可以分解成..."
  return [`l1-intro-${a}-${b}-${c}`];
}

function buildL1Phase2Ids(a, b) {
  // Single composite mp3 — "a 加 b 等于几" (the actual question for step 1).
  return [`l1-sub-${a}-${b}`];
}

// Builds the "X 加 Y 加 Z 等于 答" reward sentence played after the
// child picks the correct answer on L1 step 2. One composite mp3
// per (a, b, c, answer).
function buildL1AnswerIds(a, b, c, answer) {
  return [`l1-rwd-${a}-${b}-${c}-${answer}`];
}

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  // Pull the 120-round pool from data/pools.js. roundScene samples
  // 6 of them on first entry and walks through in random order.
  // sampleSize MUST equal DAILY_CAPS[1] (6) so a single play-through
  // finishes today's quota in one go — see
  // docs/superpowers/specs/2026-08-12-daily-practice-lock-design.md
  // for the saveProgress ↔ cap-hit coupling.
  poolGen: () => poolGens[1](),
  sampleSize: 6,
  // No topic-intro greeting on entry — per user feedback 2026-08-10.
  // The old "小朋友好，我们来学习三数相加" greeting was a vague topic
  // statement that ate ~4s before any guidance appeared; kids heard
  // "we're learning X" but no instruction on what to DO. Now the
  // step 1 phase-1 audio IS the entry guidance:
  //   "先看下 a+b+c 等于几，这个问题可以分解成我们先看看前两个数相加"
  // — it tells the kid the strategy ("decompose") and the question
  // ("what does this equal?") in one fluent sentence. (2026-08-12:
  // dropped the leading "先看下" — it was redundant with the equation
  // that immediately follows.)
  //
  // (Subsequent rounds also play the same phase-1 audio — same
  // strategy prompt, just for the new round's numbers.)
  // introCue intentionally omitted.
  // Two teaching beats: add the first pair, then add the rest.
  stepLabels: ["两数相加", "计算结果"],

  steps: [
    // Step 1 — Decompose the pair, find the pair sum.
    //
    // New visual flow (top to bottom), per user feedback 2026-08-11:
    //   cells:         [1][7][2]          — visual aid at the TOP, no
    //                                       per-group number labels
    //   anchor:        "1 + 7 + 2 = □"   — the question, below cells
    //   preview:       "□ + 2 = □"        — what step 2 will look like
    //   pair sum eq:   "1 + 7 = □"        — the actual pick, size 60
    //   buttons:       4 options for pair sum
    //
    // The merge lines start at the anchor's first two addends (slot 0
    // and slot 2 — "1" and "7") and run DOWN to the preview's merge
    // box, where they converge into a V-shaped arrowhead (point at box,
    // arms opening upward). Per user feedback: "6+1+2=□ ╲╱ □ +2=□
    // 应该是这个形式。" and "应该是向上的开口，和数字建立关系，不是和
    // 方格子建立关系。" — the arms originate at the numbers in the
    // anchor, the V opens upward, and the point terminates at the box.
    // Arrowhead color follows each addend's color (blue for "1",
    // yellow for "7") so the eye traces each number back to its arm.
    //
    // Lines persist across step 1 → 2 (same UX rule 凑十法 uses for its
    // decomposition arrows per level3.js: "拆分的线不要消失。算一算的
    // 时候也要保留。").
    //
    // Audio: phase 1 ("先看下 a+b+c 等于几...") plays immediately on entry;
    // the pair-sum equation appears AFTER phase 1 ends so the kid sees the
    // question paired with phase 2's "a 加 b 等于几" audio (deferEquation
    // gates this — same pattern as the previous version).
    //
    // Merge lines are drawn in postRender so they render on top of the
    // cells/preview (Kaplay draws later-added objects on top; postRender
    // runs last in buildStep's pipeline — same pattern as L3's
    // drawL2Arrows).
    (ctx, round) => {
      const { pair } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const pairSum = pair[0] + pair[1];

      // Cells at the TOP (y=200) — per user feedback 2026-08-11:
      // "把里面的方格放到最上面，方格下面的数字去掉。方格下面是题目。"
      // The cells are the visual aid (boxes with circles for each unit);
      // the per-group number labels are gone — the colored group already
      // reads as "how many". The merge lines provide the visual cue
      // that 1 + 7 are the pair to add first.
      const body = mergedRow(ctx, round.nums, { y: 200 });
      ctx.cellRow = body;

      // Anchor (the question) directly below the cells — "1 + 7 + 2 = □".
      // `□` text matches the 凑十法 pattern (per user feedback 2026-08-11:
      // "用这个方格子表示未知，不要用问号了"). The anchor stays as `□`
      // until step 2 is answered correctly.
      ctx.setAnchorEquation(anchorSlots(round.nums, "□"), { y: 360, size: 90 });

      // Simplified preview below the anchor — "□ + 2 = □". Shows the kid
      // what step 2 will look like (merge result + third addend = total)
      // so the pick on step 1 ("what does 1+7 equal?") has a visible
      // destination.
      simplifiedPreview(ctx, round.nums[2], 2, null, null, 520);

      // Phase 1 audio + deferred pair-sum equation. Phase 1 explains the
      // strategy ("先看下 a+b+c 等于几...") and chains into phase 2's
      // "a 加 b 等于几" via playSequence's onComplete — event-driven,
      // no setTimeout estimate.
      const [a, b, c] = round.nums;
      const phase1Ids = buildL1Phase1Ids(a, b, c);
      const phase2Ids = buildL1Phase2Ids(pair[0], pair[1]);

      // Pair-sum equation slots — the actual pick. Appears after
      // phase 1 audio finishes (via firePhase2 → setEquation).
      const pairSumSlots = [pair[0], "+", pair[1], "=", "□"];
      const pairSumColors = [
        COLORS[aIdx], undefined, COLORS[bIdx], undefined, undefined,
      ];

      // Pair-sum equation at y=680, size 82 (2026-08-12 — was 60, but the
      // user flagged the "6" / numbers as "看不清" and the row as
      // "不协调" against the size-82 simplified preview above it). At
      // 60 the digits rendered at ~37 px tall — readable but cramped,
      // and visually out-of-scale with the 82 px preview directly
      // above. 82 matches the preview's size so the two rows read as
      // one consistent rhythm; the pair-sum eq is still 8 px smaller
      // than the size-90 anchor above so the eye still lands on the
      // anchor first.
      const firePhase2 = () => {
        ctx.setEquation(
          { slots: pairSumSlots, colors: pairSumColors },
          { y: 680, size: 82 },
        );
        // Play the question right after the equation appears.
        window.PandaAudio.playSequence(phase2Ids, 40, 100);
      };

      // 100ms settle delay so the first render lands before audio starts.
      window.PandaAudio.playSequence(phase1Ids, 40, 100, firePhase2);

      return {
        body,
        deferEquation: true,
        equation: { slots: pairSumSlots, colors: pairSumColors },
        equationOpts: { y: 680, size: 82 },
        postRender: (ctx) => {
          // Draw merge lines AFTER all equations/cells are in place so
          // they render on top. Idempotent — destroys any prior arrows
          // on ctx.arrowsRoot before drawing the new set. Same pattern
          // as L3's drawL2Arrows.
          drawMergeLines(ctx);
        },
        question: {
          correct: pairSum,
          values: options(pairSum, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          // Reveal pair sum: "1+7=□" → "1+7=<pairSum>" (answer in orange,
          // matching the merge box's reveal color below).
          ctx.setEquation({
            slots: [pair[0], "+", pair[1], "=", pairSum],
            colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, ORANGE],
          }, { y: 680, size: 82 });
          // Reveal merge box in preview: "□+2=□" → "<pairSum>+2=□".
          // Merge lines (and their V arrowheads at the merge box)
          // stay anchored — they don't move. The line's TARGET sits
          // at the merge box's top edge; that edge's y is unchanged
          // when `□` reveals to a single-digit number (same per-char
          // width), so the existing arrows still terminate on the
          // right pixel. The arms originate at the anchor's addends
          // (also unchanged), so the V's source ends stay valid too.
          simplifiedPreview(ctx, round.nums[2], 2, pairSum);
        },
      };
    },
    // Step 2 — Add the rest.
    //
    // Layout is identical to step 1 for cells (y=200), anchor (y=360),
    // and preview (y=520), but the pair-sum equation that was revealed
    // at y=680 during step 1's onAdvance is now DESTROYED on entry to
    // step 2 — per user feedback 2026-08-11, the kid has internalized
    // the running total and doesn't need the reminder anymore. The
    // only equation visible in step 2 is the simplified preview
    // "<pairSum>+<third>=□" at y=520, which gets a very subtle flash
    // to draw attention to "this is your new question".
    //
    // Merge lines still start at the anchor's "1" and "7" (slot 0 and
    // slot 2) and converge at the merge box (now showing the pair sum
    // in orange) — the visual link "[1] [7] → <pairSum>" reinforces
    // "the answer is composed of these numbers". Slot positions don't
    // shift when the merge box reveals (same per-char width for `□`
    // and a single digit), so the existing arrow positions stay valid.
    (ctx, round) => {
      const { pair, third, pairSum } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const thirdIdx = round.nums.findIndex((n) => n === third);
      const [a, b, c] = round.nums;

      // Cells at y=200 (top of screen, same position as step 1 — the
      // visual link between the cells and the merge box stays put across
      // steps). The per-group number labels are gone (per user feedback
      // 2026-08-11).
      const body = mergedRow(ctx, round.nums, { y: 200 });
      ctx.cellRow = body;

      // Anchor stays put at y=360 (still "□" until step 2 is answered
      // correctly).
      ctx.setAnchorEquation(anchorSlots(round.nums, "□"), { y: 360, size: 90 });

      // Simplified preview at y=520 with merge revealed as pairSum
      // (orange). The merge slot's text changes from `□` to the actual
      // pair sum; since both render at the same per-char width (0.62 ×
      // size), the slot's x position is unchanged and the merge lines
      // drawn in postRender still terminate on the correct pixel.
      simplifiedPreview(ctx, third, thirdIdx, pairSum);

      // Step 2 audio prompt: "<pairSum> 加 <third> 等于几". Single
      // pre-baked composite mp3 (e.g. "五加四等于几") — chained off the
      // celebration cue from step 1's correct pick so it starts AFTER
      // the cheer tail and never overlaps it (event-driven, no fixed
      // setTimeout estimate).
      speakSequence(ctx.k, [`l1-step2-${pairSum}-${third}`], ctx);

      // Per user feedback 2026-08-11 (refined): the pair-sum equation
      // should NOT persist into step 2 — once the kid has internalized
      // "<a>+<b>=<pairSum>", the only thing left is "<pairSum>+<third>
      // =?". Destroy the pair-sum equation node now and pulse the
      // simplified preview instead, very subtly, so the eye lands on
      // the equation the kid has to actually answer.
      ctx.equationNode?.destroy?.();
      ctx.equationNode = null;
      gentlePulse(ctx.k, ctx.simplifiedPreview);

      return {
        body,
        // No `equation` / `equationOpts` — the pair-sum equation was
        // destroyed at the top of this factory; buildStep won't replace
        // it (no equation config). The simplified preview at y=520
        // ("<pairSum>+<third>=□") is the sole equation visible in step
        // 2, and the gentle pulse draws attention to it.
        postRender: (ctx) => {
          // Redraw merge lines — destroys the step-1 arrow set and
          // draws a fresh set against the new simplifiedPreview's slot
          // layout. Same coords in practice (slot 0 width unchanged)
          // but kept idempotent so a future change to the preview
          // (e.g. different merge-slot text width) can't leave stale
          // arrows pointing at the wrong pixel.
          drawMergeLines(ctx);
        },
        question: {
          correct: round.answer,
          // L1 sum-≤-10 answer range: max sum is 10, so answers are in
          // [3, 10]. min: 0, max: 20 covers the worst case with one
          // slot of headroom.
          values: options(round.answer, { min: 0, max: 20, count: 4 }),
        },
        // Step 2 is the last step AND the one that reads back the
        // full equation on a correct pick. The advance is gated on
        // the reward audio finishing (see onAdvance below) instead
        // of a hardcoded pause — the chain's actual length varies
        // with the round's numbers. advancePauseMs stays as a safety
        // ceiling in case the audio chain gets stuck (iPad Safari
        // sometimes misses the `ended` event — roundScene's
        // audio-gated advance has a duration-based safety net on
        // top of the per-step ceiling).
        advancePauseMs: 12000,
        onAdvance: () => {
          // Reveal anchor: "1+7+2=□" → "1+7+2=<answer>" (INK — the
          // standard reveal color, not orange, since this is the
          // equation's final total, not a pair-sum piece).
          ctx.setAnchorEquation(
            anchorSlots(round.nums, round.answer),
            { y: 360, size: 90 },
          );
          // Reveal simplified preview total box: "<pairSum>+2=□" →
          // "<pairSum>+2=<answer>". Merge slot already revealed
          // (from step 1's onAdvance / step 2's render). The merge
          // box's slot width stays put across reveals (same per-char
          // width for `□` and a single digit), so the V arrowhead at
          // the merge box stays anchored on the right pixel — the
          // anchor's addends (line sources) are unchanged too.
          simplifiedPreview(ctx, third, thirdIdx, pairSum, round.answer);
          // No sub-question to reveal at y=680 — it was removed per
          // user feedback 2026-08-11. The pair-sum equation "<a>+<b>=
          // <pairSum>" stays as revealed (it was the step-1 answer).
          ctx.cellRow?.pulse?.();
          // Read the full equation back as the reward: "X 加 Y 加 Z
          // 等于 答". Return a Promise that resolves when the audio
          // chain finishes — roundScene awaits it before advancing
          // to the next round. playAfter hooks the celebration's
          // actual last cue (ctx.lastEncourageId, set by onPick to
          // the LAST cue of the new tier-based cheer chain —
          // enc-first-N / panda-praise-N / panda-cheer-N) so the
          // reward starts AFTER the celebration tail and never
          // overlaps it. The old hardcoded "panda-celebrate" cue
          // is gone from CUE_IDS.
          const answerIds = buildL1AnswerIds(a, b, c, round.answer);
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              answerIds,
              { gapMs: 200, seqGapMs: 200 },
              resolve,
            );
          });
        },
      };
    },
  ],
});

// scenes/level1.js — three-addend addition, taught in 2 explicit steps with
// a persistent top anchor.
//
// Layout (matches L2 for visual consistency):
//   * Top:   persistent anchor "a + b + c = ?" — the goal the child is
//            working toward. Large and bold, never disappears between steps.
//   * Middle: cells with circles — the visual representation of the three
//             addends. The pair-to-add-first gets an orange ring on step 1.
//   * Bottom: sub-question that changes per step.
//
// Teaching flow:
//   * Pattern A (sum ≤ 10, no pair to ten): pair = first two sequentially.
//   * Pattern B (two of three pair to ten): pair = the two that make ten.
//
//   Step 1 — Pair:        sub "pair[0] + pair[1] = ?"
//                          child picks pairSum. The pair's cells light up
//                          with orange rings so the eye lands on them.
//   Step 2 — Add the rest: shows the parenthesized form "(pair[0] + pair[1])
//                          + third = pairSum" above the cells (a visual aid
//                          that ties the pair to the running sum), then the
//                          simplified "pairSum + third = ?" below the cells
//                          as the actual pick. Child picks the total, cells
//                          pulse on correct.
//
// On a correct pick on step 2 the anchor's "?" reveals to the answer
// (alongside the sub-question's "?"). Step 1's correct pick only fills
// the sub-question's "?" — the anchor still asks "?".

import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK, ORANGE } from "../components/theme.js";
import expression from "../components/expression.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";

const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];
const TEN = 10;

// Pick the pair to add first: prefer a pair that sums to ten, otherwise
// use the first two addends sequentially. Returns the addends in the order
// they should appear in the equation (always a + b).
function choosePair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === TEN) {
        const thirdIdx = nums.findIndex((n, k) => k !== i && k !== j);
        return { pair: [nums[i], nums[j]], third: nums[thirdIdx], pairSum: TEN };
      }
    }
  }
  return { pair: [nums[0], nums[1]], third: nums[2], pairSum: nums[0] + nums[1] };
}

// Anchor slots for the persistent top equation "a + b + c = ?". Each addend
// keeps its own color so the visible cells and the anchor agree.
function anchorSlots(nums, sumSlot) {
  return {
    slots: [nums[0], "+", nums[1], "+", nums[2], "=", sumSlot],
    colors: [COLORS[0], undefined, COLORS[1], undefined, COLORS[2], undefined, undefined],
  };
}

// Custom parenthesized-form text node rendered above the cells. Lives
// independently of the round scaffold's "active equation" so the buildStep
// path doesn't overwrite it. The child never picks this — it's a visual aid
// showing the original equation in parentheses form, "(pair) + third = ?".
// The simplified sub-question below is the actual pick.
//
// When the child picks the correct answer, the caller passes `answer` so
// the "?" becomes the actual total — both the persistent anchor and the
// simplified sub-question reveal, and now this form reveals too. The node
// is tracked on ctx.parensForm so the caller can re-render cleanly.
//
// Renders through the shared `expression` component so each addend keeps
// the same color it has on the cells and on the anchor; without per-slot
// colors the row read as flat INK and looked dim/off-brand next to the
// colored "5+4=?" below it. Operators ("(", ")", "+", "=") render at
// OP_SCALE and use the default ink color, matching the sub-equation.
function parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx, answer = null) {
  if (ctx.parensForm) ctx.parensForm.destroy();
  const lastSlot = answer != null ? String(answer) : "?";
  const slots = ["(", pair[0], "+", pair[1], ")", "+", third, "=", lastSlot];
  const colors = [
    undefined,             // "("
    COLORS[aIdx],         // pair[0]
    undefined,             // "+"
    COLORS[bIdx],         // pair[1]
    undefined,             // ")"
    undefined,             // "+"
    COLORS[thirdIdx],     // third
    undefined,             // "="
    answer != null ? INK : undefined, // "?" (muted) or revealed total
  ];
  ctx.parensForm = expression(ctx.k, {
    slots,
    colors,
    x: LAYOUT.barX,
    y: 340,
    size: 82,
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
  const cell = 72;
  const gap = 8;
  const extraGap = 40;

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

    // Number label centered under this color's group.
    const groupLastIdx = cellIdx - 1;
    const groupCenterX = (offsets[groupFirstIdx] + offsets[groupLastIdx]) / 2 + startX;
    root.add([
      k.text(String(n), { size: 56, font: FONT }),
      k.color(...color),
      k.outline(3, k.rgb(...INK)),
      k.pos(groupCenterX, y + cell / 2 + 56),
      k.anchor("center"),
    ]);
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

  return root;
}

// Spoken intro for a step. Step 2 reads the simplified form
// "what is pairSum plus third". Step 1 doesn't need its own prompt — the
// per-round decompose sentence (built in the step 1 factory below) already
// ends with the step-1 sub-question, so adding another spoken prompt would
// just repeat it.
//
// When called after a correct pick, chains off "panda-celebrate" — the
// actual last cue of the cheer audio — so the next step's prompt
// starts immediately when the celebration ends, with no fixed
// setTimeout and no overlap with the celebration tail. The previous
// reference (ctx.lastEncourageId, the "enc-great" cue) was already
// `ended` by the time buildStep ran, so playAfter would kick off
// immediately and overlap with panda-celebrate.
function speakSequence(k, ids, ctx) {
  if (ctx && ctx.lastEncourageId) {
    window.PandaAudio.playAfter("panda-celebrate", ids, {
      gapMs: 400,
      seqGapMs: 40,    // closer to "fluent speech" than the prior 200ms
    });
    return;
  }
  k.wait(0.1, () => window.PandaAudio.playSequence(ids, 40));
}

// Builds the per-round L1 "decompose" sentence as two phases of
// pre-baked composite audio cues. Each round's full sentence is one
// mp3 (e.g. "先看下二加三加四等于几...") instead of a chain of
// single-syllable cues stitched together at play time. The TTS
// pipeline (tools/build-composite-audio.mjs) synthesizes one mp3 per
// (a, b, c) combination from data/levels.json.
//
// For nums [a, b, c] the sentence reads:
//
//   先看下 a 加 b 加 c 等于几，这个问题可以分解成我们先看看前两个数相加。
//   a 加 b 等于几
//
// The split lets the step-1 sub-question ("a + b = ?") appear at the
// natural break between explanation and question. Phase 1 ends with
// the first "等于几" (the explanation of the whole problem); the kid
// hears "2+3+4等于几, 这个问题可以分解成..." and THEN sees the
// "2+3=?" they're meant to answer, paired with the phase-2 question
// "2 加 3 等于几". Showing the sub-question immediately (the old
// behavior) made the screen busy before the kid knew the strategy.
function buildL1Phase1Ids(a, b, c) {
  // Single composite mp3 — "先看下 a 加 b 加 c 等于几，这个问题可以分解成..."
  return [`l1-intro-${a}-${b}-${c}`];
}

function buildL1Phase2Ids(a, b) {
  // Single composite mp3 — "a 加 b 等于几" (the actual question for step 1).
  return [`l1-sub-${a}-${b}`];
}

// Maps a non-negative integer to the cue id(s) that read it aloud in
// Mandarin. 0..10 are single-syllable. 11..19 are 十+X. 20 is 二十
// (十+十). L1 answers go up to 15; L3 answers go up to 20.
function numToCueIds(n) {
  if (n < 0 || !Number.isFinite(n) || !Number.isInteger(n)) return [];
  if (n <= 10) return [`n-${n}`];
  if (n < 20) return ["n-10", `n-${n - 10}`];
  if (n === 20) return ["n-10", "n-10"];
  // 21+ is out of L1's range; fall back to the bare digit so the audio
  // still produces something rather than going silent.
  return [`n-${n}`];
}

// Builds the "X 加 Y 加 Z 等于 答" reward sentence played after the
// child picks the correct answer on L1 step 2. One composite mp3
// per (a, b, c, answer) — see tools/build-composite-audio.mjs.
function buildL1AnswerIds(a, b, c, answer) {
  return [`l1-rwd-${a}-${b}-${c}-${answer}`];
}

export default createRoundScene({
  levelId: 1,
  sceneName: "level1",
  // Greeting plays once when the user first opens L1. The per-round
  // decompose sentence (fired inside step 1) waits for it to finish
  // plus a 1s pause on round 0, then chains on subsequent rounds.
  introCue: "lvl-1-greeting",
  // Two teaching beats: add the first pair, then add the rest.
  stepLabels: ["两数相加", "计算结果"],

  steps: [
    // Step 1 — Pair: "pair[0] + pair[1] = ?"
    (ctx, round) => {
      const { pair } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const pairSum = pair[0] + pair[1];

      // Body: cells row with the pair highlighted.
      const body = mergedRow(ctx, round.nums, { highlight: pair });
      ctx.cellRow = body;

      // Persistent anchor at top.
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // The sub-question "pair[0] + pair[1] = ?" is deferred until
      // phase 1 of the per-round audio finishes — the kid hears
      // "2+3+4等于几, 这个问题可以分解成我们先看看前两个数相加"
      // FIRST, and THEN sees "2+3=?" paired with the phase-2 question
      // "2 加 3 等于几". Showing it immediately (the old behavior) made
      // the screen busy before the kid had heard the strategy.
      //
      // phase 1 chain runs the full greeting-then-decompose timing on
      // round 0 (chained off lvl-1-greeting's `ended` event), or just
      // the decompose on later rounds. playAfter / playSequence forward
      // firePhase2 to onComplete, which fires after the LAST cue's
      // `ended` event — i.e. after the audio has actually finished.
      const [a, b, c] = round.nums;
      const phase1Ids = buildL1Phase1Ids(a, b, c);
      const phase2Ids = buildL1Phase2Ids(pair[0], pair[1]);

      const firePhase2 = () => {
        // Show the step-1 sub-question NOW — the kid has heard the
        // setup and is being asked the actual question.
        ctx.setEquation({
          slots: [pair[0], "+", pair[1], "=", "?"],
          colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, undefined],
        }, { y: 340, size: 82 });
        // Play the question right after the equation appears.
        window.PandaAudio.playSequence(phase2Ids, 40, 100);
      };

      if (ctx.ri === 0) {
        window.PandaAudio.playAfter(
          "lvl-1-greeting", phase1Ids,
          {
            gapMs: 1000,    // "停顿1s" between greeting and phase 1
            seqGapMs: 40,   // tighter rhythm — 260ms made the per-round
                            // sentence feel like a word list, not a
                            // sentence (per user feedback 2026-08-09)
          },
          firePhase2,
        );
      } else {
        // Subsequent rounds: no greeting, just play phase 1 and chain
        // phase 2. 100 ms delay so the first render lands before the
        // audio starts.
        window.PandaAudio.playSequence(phase1Ids, 40, 100, firePhase2);
      }

      return {
        body,
        deferEquation: true,
        equation: {
          slots: [pair[0], "+", pair[1], "=", "?"],
          colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, undefined],
        },
        // Step 1 sub-question sits directly below the anchor so the
        // child reads "2+3+4=?" then "2+3=?" as a single thought. The
        // cells row sits below as the visual aid.
        equationOpts: { y: 340, size: 82 },
        // No `cue` here — the L1 step-1 audio is the per-round
        // decompose sentence fired above (via playAfter). The old
        // `cue: "step-1"` was the L2 phrase "比一比" and leaked into
        // L1, which is why the user heard it on every L1 round.
        question: {
          correct: pairSum,
          values: options(pairSum, { min: 0, max: 16, count: 4 }),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [pair[0], "+", pair[1], "=", pairSum],
            colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, ORANGE],
          }, { y: 340, size: 82 });
        },
      };
    },
    // Step 2 — Add the rest. Shows the parenthesized form (a + b) + c = pairSum
    // above the cells, then the simplified form pairSum + c = ? below the
    // cells as the actual pick.
    (ctx, round) => {
      const { pair, third, pairSum } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const thirdIdx = round.nums.findIndex((n) => n === third);
      const [a, b, c] = round.nums;

      // Body: cells row with the third addend visually separated from the pair
      // by an extra-wide gap, AND the third's own cells are rendered flush
      // (no gaps between them) so it reads as one connected block. The pair
      // (2+3) keeps its normal gaps so 2 and 3 stay distinguishable. The
      // row sits BELOW the sub-question on step 2 so the visual order is
      // anchor → parenthesized form → sub-question → cells → buttons.
      const body = mergedRow(ctx, round.nums, {
        boundary: thirdIdx,
        flushBoundary: true,
        y: 600,
      });
      ctx.cellRow = body;

      // Anchor stays put (still "?" until step 2 is answered).
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // Parenthesized form as a visual aid above the cells. Custom text
      // node (not setEquation) so the buildStep path doesn't overwrite it.
      parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx);

      // Step 2 reads the simplified result question: "X 加 Y 等于几"
      // (n-pairSum + q-plus + n-third + q-equals). The old "几加 X 加 Y"
      // phrasing made it sound like a chained operation question
      // instead of a result question — the child has already added the
      // pair in step 1, so step 2 should ask "what does this equal?".
      speakSequence(ctx.k, [`n-${pairSum}`, "q-plus", `n-${third}`, "q-equals"], ctx);

      return {
        body,
        equation: {
          slots: [pairSum, "+", third, "=", "?"],
          colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, undefined],
        },
        // Step 2 sub-question sits BELOW the parenthesized form (the visual
        // aid that mirrors the original equation in parens form). The cells
        // row sits further down as the visual aid for the simplified form.
        equationOpts: { y: 440, size: 82 },
        // No `cue` — the L1 step-2 audio is the speakSequence fired
        // above ("几加 X 加 Y"), chained event-by-event.
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 0, max: 16, count: 4 }),
        },
        // Step 2 is the last step AND the one that reads back the
        // full equation on a correct pick. The advance is gated on
        // the equation audio finishing (see onAdvance below) instead
        // of a hardcoded pause — the equation chain's actual length
        // varies with the round's numbers (single-digit answers need
        // 7 cues; two-digit answers need 8). advancePauseMs stays as
        // a safety ceiling in case the audio chain gets stuck.
        advancePauseMs: 12000,
        onAdvance: () => {
          // Reveal the persistent anchor at the top.
          ctx.setAnchorEquation(anchorSlots(round.nums, round.answer));
          // Reveal the simplified sub-question.
          ctx.setEquation({
            slots: [pairSum, "+", third, "=", round.answer],
            colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, INK],
          }, { y: 440, size: 82 });
          // Reveal the parenthesized form's "?" with the actual total.
          parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx, round.answer);
          ctx.cellRow?.pulse?.();
          // Read the full equation back as the reward: "X 加 Y 加 Z
          // 等于 答". Return a Promise that resolves when the audio
          // chain finishes — roundScene awaits it before advancing
          // to the next round. playAfter hooks "panda-celebrate"'s
          // `ended` event so the reward starts AFTER the celebration
          // (not after `enc-great`, which had already ended and would
          // have caused the reward to fire on top of panda-celebrate).
          const answerIds = buildL1AnswerIds(a, b, c, round.answer);
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              "panda-celebrate",
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

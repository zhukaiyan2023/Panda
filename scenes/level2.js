// scenes/level2.js — 两个数凑十 (two-of-three sum to 10).
// Taught in 2 explicit steps with a persistent top anchor.
//
// Layout (matches L1 / L3 / L4 for visual consistency):
//   * Top:   persistent anchor "a + b + c = ?" — the goal the child is
//            working toward. Large and bold, never disappears between steps.
//   * Middle: cells with circles — the visual representation of the three
//             addends. The pair-to-add-first gets an orange ring on step 1.
//   * Bottom: sub-question that changes per step.
//
// Teaching flow (two-of-three sum to 10):
//   * Pair = the two addends that sum to 10. Third is the leftover.
//   * Step 1 — Find the pair:  sub "? + ? = 10" (kid picks the pair label
//                                like "4+6" that matches two of the three
//                                addends). The pair's cells light up with
//                                orange rings so the eye lands on them.
//   * Step 2 — Add the rest:   shows the parenthesized form
//                                "(pair[0] + pair[1]) + third = 10" above
//                                the cells, then the simplified
//                                "10 + third = ?" below the cells as the
//                                actual pick. Child picks the total,
//                                cells pulse on correct.
//
// This level is the "make-a-ten practice" branch that USED TO live inside
// level1.js. It was extracted into its own scene so each level owns one
// math rule and one pool — L1 stays focused on sum ≤ 10, this stays
// focused on finding the ten-pair.
//
// On a correct pick on step 2 the anchor's "?" reveals to the answer
// (alongside the sub-question's "?"). Step 1's correct pick only fills
// the sub-question's "?" — the anchor still asks "?".

import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK, ORANGE } from "../components/theme.js";
import expression from "../components/expression.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import { poolGens } from "../data/pools.js";

const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];
const TEN = 10;

// Pick the pair to add first. L2's pool only contains triples where
// TWO of the three addends sum to 10, so choosePair always finds a
// ten-pair (and `isMakeTen` is always true). The function shape
// mirrors level1.js's choosePair for visual consistency.
function choosePair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === TEN) {
        const thirdIdx = nums.findIndex((n, k) => k !== i && k !== j);
        return {
          pair: [nums[i], nums[j]],
          third: nums[thirdIdx],
          pairSum: TEN,
          isMakeTen: true,
        };
      }
    }
  }
  // Unreachable: L2's pool guarantees at least one pair sums to 10.
  // The fallback keeps the function total so a corrupted pool record
  // doesn't crash the scene.
  return { pair: [nums[0], nums[1]], third: nums[2], pairSum: nums[0] + nums[1], isMakeTen: false };
}

// All ordered pairs that sum to 10. The step-1 button options for a
// make-a-ten round are 4 of these 5 (the correct pair + 3 distractors).
// The correct pair is the one whose addends are both in the triple; the
// kid picks it by recognising which two addends make ten.
const ALL_TEN_PAIRS = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]];

function makeTenPairOptions(correctPair) {
  // Normalize pair order so [6, 4] matches [4, 6] in ALL_TEN_PAIRS.
  // choosePair returns the pair in the order it walks the indices, so
  // the same unordered pair can come back as [4, 6] or [6, 4] depending
  // on the triple's order. Without this, the filter below misses the
  // match and the correct pair ends up dropped from the options.
  const [a, b] = correctPair;
  const norm = a <= b ? [a, b] : [b, a];
  const distractors = ALL_TEN_PAIRS.filter(
    ([x, y]) => !(x === norm[0] && y === norm[1]),
  );
  // Deterministic: pick the first 3 distractors in sorted order. Stable
  // across re-renders so the scene's diff is meaningful.
  const label = (p) => `${p[0]}+${p[1]}`;
  const correct = label(norm);
  const opts = [correct];
  for (let i = 0; i < 3; i++) opts.push(label(distractors[i]));
  return opts;
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
// "what is ten plus third". Step 1 doesn't need its own prompt — the
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

// Per-round phase-1 sentence for L2. The full sentence reads:
//
//   先看下 a 加 b 加 c 等于几，这个问题可以分解成我们先找出相加为10的数。
//   哪两个数相加等于10
//
// Single composite mp3 — see tools/build-composite-audio.mjs. The
// matching phase-2 cue is generic (shared across all L2 rounds) since
// the actual pair depends on which two addends sum to 10.
function buildL2Phase1MakeTenIds(a, b, c) {
  return [`l1-intro-mt-${a}-${b}-${c}`];
}

function buildL2Phase2MakeTenIds() {
  return ["l1-sub-find-ten"];
}

// Builds the "X 加 Y 加 Z 等于 答" reward sentence played after the
// child picks the correct answer on L2 step 2. One composite mp3
// per (a, b, c, answer).
function buildL2AnswerIds(a, b, c, answer) {
  return [`l1-rwd-${a}-${b}-${c}-${answer}`];
}

export default createRoundScene({
  levelId: 2,
  sceneName: "level2",
  // Pull the 217-round pool from data/pools.js. roundScene samples 10
  // of them on first entry and walks through in random order.
  poolGen: () => poolGens[2](),
  sampleSize: 10,
  // No topic-intro greeting on entry — per user feedback 2026-08-10.
  // The old "小朋友好，我们来学习三数相加" greeting was a vague topic
  // statement that ate ~4s before any guidance appeared; kids heard
  // "we're learning X" but no instruction on what to DO. Now the
  // step 1 phase-1 audio IS the entry guidance:
  //   "先看下 a+b+c 等于几，这个问题可以分解成我们先找出相加为10的数"
  // — it tells the kid the strategy ("find the ten-pair") and the
  // question ("which two addends sum to ten?") in one fluent sentence.
  //
  // (Subsequent rounds also play the same phase-1 audio — same
  // strategy prompt, just for the new round's numbers.)
  // introCue intentionally omitted.
  // Two teaching beats: find the ten-pair, then add the rest.
  stepLabels: ["凑成十", "计算结果"],

  steps: [
    // Step 1 — Find the ten-pair. Sub-question is "? + ? = 10" — the kid
    // hunts for the pair label (e.g. "4+6") whose addends are in the
    // triple. This is the practice that builds the make-a-ten habit
    // before L3 (凑十法) teaches the full split-into-friend+rest.
    (ctx, round) => {
      const { pair } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);

      // Body: cells row with the pair highlighted.
      const body = mergedRow(ctx, round.nums, { highlight: pair });
      ctx.cellRow = body;

      // Persistent anchor at top.
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // The sub-question is deferred until phase 1 of the per-round
      // audio finishes — the kid hears the setup FIRST, and THEN sees
      // the sub-question paired with the phase-2 question. Showing it
      // immediately (the old behavior) made the screen busy before the
      // kid had heard the strategy.
      const [a, b, c] = round.nums;
      const phase1Ids = buildL2Phase1MakeTenIds(a, b, c);
      const phase2Ids = buildL2Phase2MakeTenIds();

      // Sub-question slots + colors. Always "? + ? = 10" — the kid
      // hunts for the pair.
      const subSlots = ["?", "+", "?", "=", TEN];
      const subColors = [undefined, undefined, undefined, undefined, undefined];

      const firePhase2 = () => {
        // Show the step-1 sub-question NOW — the kid has heard the
        // setup and is being asked the actual question.
        ctx.setEquation({ slots: subSlots, colors: subColors }, { y: 340, size: 82 });
        // Play the question right after the equation appears.
        window.PandaAudio.playSequence(phase2Ids, 40, 100);
      };

      // No more round-0 special case — the per-round phase-1 audio IS
      // the entry guidance now. 100ms settle delay so the first
      // render lands before the audio starts; phase 2 chains via
      // playSequence's onComplete (fires after phase 1's `ended`
      // event, not a setTimeout estimate).
      window.PandaAudio.playSequence(phase1Ids, 40, 100, firePhase2);

      return {
        body,
        deferEquation: true,
        equation: { slots: subSlots, colors: subColors },
        equationOpts: { y: 340, size: 82 },
        question: {
          // Kid picks the pair like "4+6" whose addends are in the
          // triple. 4 ordered-string options summing to 10. The
          // correct label is normalized (smaller first) so it
          // matches an option in makeTenPairOptions regardless of
          // which order choosePair walked the indices in.
          correct: pair[0] <= pair[1]
            ? `${pair[0]}+${pair[1]}`
            : `${pair[1]}+${pair[0]}`,
          values: makeTenPairOptions(pair),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [pair[0], "+", pair[1], "=", TEN],
            colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, ORANGE],
          }, { y: 340, size: 82 });
        },
      };
    },
    // Step 2 — Add the rest. The kid already picked the ten-pair in
    // step 1, so pairSum is always 10. Shows the parenthesized form
    // (a + b) + c = 10 above the cells, then the simplified form
    // 10 + c = ? below the cells as the actual pick.
    (ctx, round) => {
      const { pair, third } = choosePair(round.nums);
      const aIdx = round.nums.indexOf(pair[0]);
      const bIdx = round.nums.indexOf(pair[1], aIdx + 1);
      const thirdIdx = round.nums.findIndex((n) => n === third);
      const [a, b, c] = round.nums;

      // Body: cells row with the third addend visually separated from the pair
      // by an extra-wide gap, AND the third's own cells are rendered flush
      // (no gaps between them) so it reads as one connected block. The pair
      // (e.g. 4+6) keeps its normal gaps so 4 and 6 stay distinguishable.
      const rowY = 600;
      const body = mergedRow(ctx, round.nums, {
        boundary: thirdIdx,
        flushBoundary: true,
        y: rowY,
      });
      ctx.cellRow = body;

      // Anchor stays put (still "?" until step 2 is answered).
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"));

      // Parenthesized form as a visual aid above the cells. Custom text
      // node (not setEquation) so the buildStep path doesn't overwrite it.
      parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx);

      // Step 2 reads the simplified result question as one pre-baked
      // composite mp3 (e.g. "十加四等于几"). The pairSum is always 10
      // for L2 rounds, so the cue id uses the literal TEN.
      speakSequence(ctx.k, [`l1-step2-10-${third}`], ctx);

      return {
        body,
        equation: {
          slots: [TEN, "+", third, "=", "?"],
          colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, undefined],
        },
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: round.answer,
          // L2 answer range: ten + third ∈ [11, 19]. max: 20 covers
          // the worst case with one slot of headroom.
          values: options(round.answer, { min: 0, max: 20, count: 4 }),
        },
        advancePauseMs: 12000,
        onAdvance: () => {
          // Reveal the persistent anchor at the top.
          ctx.setAnchorEquation(anchorSlots(round.nums, round.answer));
          // Reveal the simplified sub-question.
          ctx.setEquation({
            slots: [TEN, "+", third, "=", round.answer],
            colors: [ORANGE, undefined, COLORS[thirdIdx], undefined, INK],
          }, { y: 440, size: 82 });
          // Reveal the parenthesized form's "?" with the actual total.
          parenthesizedForm(ctx, pair, third, aIdx, bIdx, thirdIdx, round.answer);
          ctx.cellRow?.pulse?.();
          // Read the full equation back as the reward: "X 加 Y 加 Z
          // 等于 答". Return a Promise that resolves when the audio
          // chain finishes — roundScene awaits it before advancing
          // to the next round. playAfter hooks the celebration's
          // actual last cue (ctx.lastEncourageId, set by onPick to
          // the LAST cue of the new tier-based cheer chain —
          // enc-first-N / panda-praise-N / panda-cheer-N) so the
          // reward starts AFTER the celebration tail and never
          // overlaps it.
          const answerIds = buildL2AnswerIds(a, b, c, round.answer);
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

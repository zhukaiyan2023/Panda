// scenes/level2.js — 两个数凑十 (two-of-three sum to 10).
// Taught in 2 explicit steps with a persistent goal equation.
//
// Layout (2026-08-11 — cells up top, anchor directly below, merge arrows
// show the combine relationship in step 2):
//   * Top:    cells with circles — the visual representation of the three
//             addends. The pair-to-add-first gets an orange ring on step 1.
//   * Middle: persistent anchor "a + b + c = ?" — the goal the child is
//             working toward. Sits in the same spot (y=320) across both
//             steps so the kid can find it without searching. Numbers
//             under each color group removed (the anchor right below
//             already names each addend, so a second label was redundant).
//   * Step 2: merge-arrows "╲ ╱" at y=430 in orange — marks the collapse
//             of the highlighted ten-pair into "10". Replaces the old
//             parenthesized form (which named the pair in text) with a
//             visual that shows the combine relationship directly.
//   * Bottom: step-specific content — sub-question at y=440 in step 1,
//             simplified sub at y=540 in step 2 (the actual pick).
//
// Teaching flow (two-of-three sum to 10):
//   * Pair = the two addends that sum to 10. Third is the leftover.
//   * Step 1 — Find the pair:  sub "? + ? = 10" at y=440 (kid picks the
//                                pair label like "4+6" that matches two
//                                of the three addends). The pair's cells
//                                light up with orange rings so the eye
//                                lands on them.
//   * Step 2 — Add the rest:   merge-arrows "╲ ╱" at y=430 (orange) show
//                                the pair collapsing into "10", then the
//                                simplified "10 + third = ?" at y=540 as
//                                the actual pick. Child picks the total,
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

import { INK, FONT, NUM_BLUE, NUM_YELLOW, NUM_PINK, ORANGE } from "../components/theme.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260812";
import { poolGens } from "../data/pools.js?v=20260812";

const COLORS = [NUM_BLUE, NUM_YELLOW, NUM_PINK];
const TEN = 10;

// Pick the pair to add first. L2's pool only contains triples where
// a+b=10 OR b+c=10 (data/pools.js — a+c=10 cases are filtered out), so
// the ten-pair sits at indices (0,1) or (1,2). We intentionally do NOT
// check (0,2): for triples of form (a, a, 10-a) like (1, 1, 9), a+c=10
// also holds, but those are b+c=10 cases by the pool rule — picking
// (0,2) there would mismatch the tenOnLeft/tenOnRight mirroring (the
// pair would land at the start of nums, the leftover at the middle,
// and the simplified form should be "third + 10" not "10 + third").
//
// `pairIndices` carries the (i, j) the pair was found at so step 2
// can derive tenOnLeft from the actual pair position rather than
// inferring it from `round.nums.indexOf(pair[0])` — that lookup is
// ambiguous when two addends share a value (the (a, a, 10-a) cases
// above: pair[0]=1, indexOf(1)=0, but the pair is at (1, 2)).
//
// The function shape mirrors level1.js's choosePair for visual
// consistency.
function choosePair(nums) {
  if (nums[0] + nums[1] === TEN) {
    return {
      pair: [nums[0], nums[1]],
      third: nums[2],
      thirdIdx: 2,
      pairIndices: [0, 1],
      pairSum: TEN,
      isMakeTen: true,
    };
  }
  if (nums[1] + nums[2] === TEN) {
    return {
      pair: [nums[1], nums[2]],
      third: nums[0],
      thirdIdx: 0,
      pairIndices: [1, 2],
      pairSum: TEN,
      isMakeTen: true,
    };
  }
  // Unreachable: L2's pool guarantees at least one pair sums to 10.
  // The fallback keeps the function total so a corrupted pool record
  // doesn't crash the scene.
  return {
    pair: [nums[0], nums[1]],
    third: nums[2],
    thirdIdx: 2,
    pairIndices: [0, 1],
    pairSum: nums[0] + nums[1],
    isMakeTen: false,
  };
}

// All ordered pairs that sum to 10. The step-1 button options for a
// make-a-ten round are 4 of these 5 (the correct pair + 3 distractors).
// The correct pair is the one whose addends are both in the triple; the
// kid picks it by recognising which two addends make ten.
//
// Listed in smaller-first order so a "what's the unordered pair?" lookup
// is unambiguous — the makeTenPairOptions filter below excludes both
// orderings of the correct pair anyway, so this canonical form is just a
// display convention.
const ALL_TEN_PAIRS = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]];

function makeTenPairOptions(correctPair) {
  // Exclude BOTH orderings of the correct pair from the distractor pool.
  // ALL_TEN_PAIRS lists each unordered pair in smaller-first order, so
  // for a pair returned as [6, 4] the canonical form is [4, 6] — we must
  // still drop that mirror from distractors, otherwise the kid sees
  // "6+4" as correct AND "4+6" as a distractor: same pair, just
  // reversed, which is meaningless noise (the reverse order never
  // appeared in the problem — for "7+6+4" the problem reads "6+4", not
  // "4+6"). The reverse [6, 4] isn't in ALL_TEN_PAIRS so the first check
  // is a no-op for that case; we include it for symmetry / safety
  // against future pool re-orderings.
  const [a, b] = correctPair;
  const distractors = ALL_TEN_PAIRS.filter(
    ([x, y]) => !((x === a && y === b) || (x === b && y === a)),
  );
  // Correct = the pair in PROBLEM ORDER (NOT normalized to smaller
  // first). choosePair returns the pair in the order it appears at
  // pairIndices in round.nums, so for "7+6+4" pair=[6,4] and the
  // correct label is "6+4" — matching the order the kid sees in the
  // problem. Normalizing would force the kid to mentally reverse the
  // pair, adding a step unrelated to the math.
  const label = (p) => `${p[0]}+${p[1]}`;
  const correct = label(correctPair);
  // Deterministic: pick the first 3 distractors in sorted order. Stable
  // across re-renders so the scene's diff is meaningful.
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

// Merge-arrows visual ("╲ ╱") rendered between the persistent anchor
// (a+b+c=?) and the simplified sub-question. The arrows mark the
// merge of the highlighted ten-pair into "10", making the combine
// relationship explicit:
//
//   a + b + c = ?        ← anchor
//       ╲ ╱              ← merge arrows (orange)
//      10 + c = ?        ← simplified sub-question (a+b=10 case)
//   or
//      c + 10 = ?        ← (b+c=10 case — 10 mirrors to the right)
//
// Replaces the old "(a+b)+c=?" parenthesized form — the parenthesized
// form named the pair in text, but the merge-arrows show the
// relationship visually so the kid sees "2 and 8 collapse into 10"
// rather than reading "(2+8)+9=?". Tracked on ctx.mergeArrows so the
// scene can tear down cleanly between rounds.
//
// The arrows align with whichever slot holds "10" in the simplified
// sub-question. The caller (step 2's postRender hook) sets `x` after
// the sub-question is rendered so the V's apex sits on top of "10" —
// otherwise the arrows would float between the equations with no
// visual link to where "10" actually lands. Defaults to
// LAYOUT.barX so callers can render the arrows before the sub-question
// exists yet.
function mergeArrows(ctx, x = LAYOUT.barX, y = 430) {
  if (ctx.mergeArrows) ctx.mergeArrows.destroy();
  ctx.mergeArrows = ctx.k.add([
    ctx.k.text("╲ ╱", { size: 56, font: FONT }),
    ctx.k.color(...ORANGE),
    ctx.k.outline(2, ctx.k.rgb(...INK)),
    ctx.k.pos(x, y),
    ctx.k.anchor("center"),
  ]);
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

    // (Number label under each color group removed 2026-08-11 — the
    // anchor equation directly below the cells already names each
    // addend, so a second label below the visual is redundant.)
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
//   a 加 b 加 c 等于几，这个问题可以分解成我们先找出相加为10的数。
//   哪两个数相加等于10
//
// Single composite mp3 — see tools/build-composite-audio.mjs. The
// matching phase-2 cue is generic (shared across all L2 rounds) since
// the actual pair depends on which two addends sum to 10.
// (2026-08-12: dropped the leading "先看下" — the user found it
// redundant; the sentence already opens with the equation.)
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
  // Pull the 153-round pool from data/pools.js — triples (a,b,c) ∈ {1..9}³
  // where a+b=10 OR b+c=10 (the a+c=10 case is dropped). roundScene
  // samples 10 of them on first entry and walks through in random order.
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
  // (2026-08-12: dropped the leading "先看下" — it was redundant with
  // the equation that immediately follows.)
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

      // Body: cells row at the top of the scene. The persistent goal
      // equation "a + b + c = ?" sits directly below the cells so the
      // kid reads the visual first, then the goal, then the sub-question.
      const body = mergedRow(ctx, round.nums, { highlight: pair, y: 220 });
      ctx.cellRow = body;

      // Persistent anchor directly under the cells. y=320 leaves a 24-px
      // gap below the cell row (cells end at y=246 with size=52) and a
      // 29-px gap above the sub-question at y=440.
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"), { y: 320 });

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
        ctx.setEquation({ slots: subSlots, colors: subColors }, { y: 440, size: 82 });
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
        equationOpts: { y: 440, size: 82 },
        question: {
          // Kid picks the pair whose addends are in the triple. 4
          // ordered-string options summing to 10. The correct label
          // is the pair in PROBLEM ORDER (the order it appears at
          // pairIndices in round.nums), NOT normalized to smaller-
          // first — for "7+6+4" the pair is "6+4" (matching the
          // order the kid sees in the problem), and "4+6" must NOT
          // appear in the distractor set (the reverse never
          // appeared in the problem). makeTenPairOptions enforces
          // both rules.
          correct: `${pair[0]}+${pair[1]}`,
          values: makeTenPairOptions(pair),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [pair[0], "+", pair[1], "=", TEN],
            colors: [COLORS[aIdx], undefined, COLORS[bIdx], undefined, ORANGE],
          }, { y: 440, size: 82 });
        },
      };
    },
    // Step 2 — Add the rest. The kid already picked the ten-pair in
    // step 1, so pairSum is always 10. The merge-arrows "╲ ╱" sit
    // between the anchor and the simplified sub-question to show
    // the pair collapsing into "10". The simplified form is the
    // actual pick — its order mirrors the pair's position:
    //   a+b=10 case → "10 + third = ?"  (10 on the left, third on right)
    //   b+c=10 case → "third + 10 = ?"  (third on left, 10 on right)
    (ctx, round) => {
      const { third, thirdIdx, pairIndices } = choosePair(round.nums);
      const [a, b, c] = round.nums;
      // tenOnLeft: the ten-pair sits at the start of nums (a+b=10,
      // pairIndices [0, 1]), so the simplified form puts "10" on the
      // left and "third" on the right. When the pair is at the end
      // (b+c=10, pairIndices [1, 2]), we mirror so "third" sits on
      // the left and "10" on the right — the "10" stays directly
      // under the pair either way, so the merge arrows can align
      // with it instead of floating between the two equations.
      //
      // We use pairIndices directly (NOT `round.nums.indexOf(pair[0])`
      // — that lookup is ambiguous when two addends share a value,
      // e.g. the (a, a, 10-a) triples like (1, 1, 9): pair[0]=1 but
      // indexOf returns 0, masking the fact that the pair came from
      // indices (1, 2). choosePair already encodes the case via
      // pairIndices — trust that.
      const tenOnLeft = pairIndices[0] === 0;

      // Body: cells row at the top of the scene. The pair group keeps
      // its normal gaps so each addend stays distinct; the "third"
      // addend is visually separated by an extra-wide gap AND its own
      // cells are rendered flush (no gaps between them) so it reads
      // as one connected block.
      const body = mergedRow(ctx, round.nums, {
        boundary: thirdIdx,
        flushBoundary: true,
        y: 220,
      });
      ctx.cellRow = body;

      // Anchor directly under the cells (still "?" until step 2 is
      // answered). Same y=320 as step 1 so the goal sits in a
      // consistent spot across both steps.
      ctx.setAnchorEquation(anchorSlots(round.nums, "?"), { y: 320 });

      // Sub-question slots + colors — order mirrors the case.
      // tenOnLeft → "10 + third = ?"  ;  tenOnRight → "third + 10 = ?".
      const subSlots = tenOnLeft
        ? [TEN, "+", third, "=", "?"]
        : [third, "+", TEN, "=", "?"];
      const subColors = tenOnLeft
        ? [ORANGE, undefined, COLORS[thirdIdx], undefined, undefined]
        : [COLORS[thirdIdx], undefined, ORANGE, undefined, undefined];
      // Slot index of "10" inside the sub-question (used in postRender
      // to align the merge arrows with the "10" position).
      const tenSlotIdx = tenOnLeft ? 0 : 2;

      // Merge arrows (╲ ╱) as a visual aid between the anchor above and
      // the simplified sub-question below. Rendered with a placeholder
      // x here; postRender below moves them onto the "10" slot after
      // setEquation has populated slotCenters.
      mergeArrows(ctx);

      // Step 2 reads the simplified result question as one pre-baked
      // composite mp3. The pairSum is always 10 for L2 rounds (the pool
      // guarantees a ten-pair), so the cue id always has 10 — but its
      // POSITION mirrors the pair's:
      //   a+b=10 (tenOnLeft) → "l1-step2-10-{third}" = "十加{third}等于几"
      //   b+c=10 (tenOnRight) → "l1-step2-{third}-10" = "{third}加十等于几"
      // e.g. for (4, 5, 5) which is b+c=10, the simplified form is
      // "4 + 10 = ?" and the audio must say "四加十等于几", NOT the old
      // "十加四等于几" (which would mismatch what the kid sees).
      let step2CueId = tenOnLeft
        ? `l1-step2-10-${third}`
        : `l1-step2-${third}-10`;
      // Defensive fallback: PandaAudio.playSequence silently no-ops when
      // a cue id isn't preloaded (main.js:492-497 — fires onComplete
      // and returns). If the mirrored cue hasn't been built yet (or a
      // build drift deleted one variant), fall back to the other
      // variant so the kid still hears the question. Both variants
      // name the same sum just with 10 and third swapped, so either
      // teaches the math — better than silence. The warn makes the
      // drift visible during dev so it gets fixed before release.
      const fallbackCueId = tenOnLeft
        ? `l1-step2-${third}-10`
        : `l1-step2-10-${third}`;
      if (!window.PandaAudio?.audio?.[step2CueId]
          && window.PandaAudio?.audio?.[fallbackCueId]) {
        console.warn(`[audio] missing cue "${step2CueId}", falling back to "${fallbackCueId}". Re-run \`npm run audio:build\` to fix.`);
        step2CueId = fallbackCueId;
      }
      speakSequence(ctx.k, [step2CueId], ctx);

      return {
        body,
        equation: {
          slots: subSlots,
          colors: subColors,
        },
        equationOpts: { y: 540, size: 82 },
        question: {
          correct: round.answer,
          // L2 answer range: ten + third ∈ [11, 19]. max: 20 covers
          // the worst case with one slot of headroom.
          values: options(round.answer, { min: 0, max: 20, count: 4 }),
        },
        advancePauseMs: 12000,
        // postRender fires AFTER setEquation has rendered the
        // sub-question and exposed slotCenters. Snap the merge arrows
        // onto the "10" slot so the V's apex sits on top of "10".
        postRender: (ctx) => {
          const eqNode = ctx.equationNode;
          if (ctx.mergeArrows && eqNode && eqNode.slotCenters) {
            ctx.mergeArrows.pos.x = eqNode.slotCenters[tenSlotIdx];
          }
        },
        onAdvance: () => {
          // Reveal the persistent anchor directly under the cells.
          ctx.setAnchorEquation(anchorSlots(round.nums, round.answer), { y: 320 });
          // Reveal the simplified sub-question (same mirrored order as
          // before reveal — only the "?" changes to the answer).
          ctx.setEquation({
            slots: tenOnLeft
              ? [TEN, "+", third, "=", round.answer]
              : [third, "+", TEN, "=", round.answer],
            colors: tenOnLeft
              ? [ORANGE, undefined, COLORS[thirdIdx], undefined, INK]
              : [COLORS[thirdIdx], undefined, ORANGE, undefined, INK],
          }, { y: 540, size: 82 });
          // Resnap the merge arrows to the new "10" x — the
          // sub-question node was just rebuilt, so slotCenters may
          // have shifted by a pixel or two even though the order is
          // identical.
          const eqNode = ctx.equationNode;
          if (ctx.mergeArrows && eqNode && eqNode.slotCenters) {
            ctx.mergeArrows.pos.x = eqNode.slotCenters[tenSlotIdx];
          }
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

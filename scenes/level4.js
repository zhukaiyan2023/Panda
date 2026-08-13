// scenes/level4.js — 二十以内 (Up to 20), the final math level.
// Was level3.js before the four-way split; renumbered when 三数相加
// was separated into L1 (sum ≤ 10) and L2 (two-of-three sum to 10),
// 凑十法 became L3, and 二十以内 moved from L3 to L4. The pool
// (data/pools.js generateL4Pool) and the 3-step teaching logic below
// are unchanged.
//
// Audio cue naming: the per-round composite cues are still named
// `l3-s1-*`, `l3-s2-*`, `l3-s3-*`, `l3-rwd-*` — those are the cue ids
// on disk under assets/audio/ and in main.js's CUE_IDS array, and
// renaming would require regenerating every pre-baked MP3. The
// internal builder functions (buildL3Step1Ids, fireL3StepAudio, ...)
// keep their L3 prefix to match the cue ids they emit.
//
// Teaches the "split the 2-digit into 10 + ones, add the ones to b,
// then add 10 to the sum" strategy in 3 explicit steps. No ten-frame,
// no cells — per the user ("不需要格子"), just equations on screen.
//
// Round data shape: { a, b, answer } where a is a 2-digit number
// with tens digit = 1 (i.e. a ∈ [11, 19]) and b is a 1-digit number.
// Invariant: ones(a) + b ≤ 10 so the third step's add doesn't carry.
// Derived per round: ones = a % 10, sum = ones + b, answer = a + b.
//
// The persistent anchor ("a + b = ?") sits at the TOP of the screen
// in the largest font — it's the goal the child is working toward
// and never disappears between teaching beats. Each step shows
// smaller sub-equations below it:
//
//   Step 1 — Split:   sub "a = 10 + ?" → child picks ones.
//                     Audio: "11+8等于几，我们先把 11 进行拆分，
//                            拆成十加几"
//                     Deferred equation: the sub-question renders
//                     AFTER the audio finishes, so the kid hears
//                     the strategy before seeing the question.
//   Step 2 — Add:     visual aid on top "(10 + ones) + b = ?"
//                     sub on the bottom "ones + b = ?" → child picks sum.
//                     Audio: "个位相加 [ones] 加 [b] 等于几"
//   Step 3 — Total:   sub "10 + sum = ?" → child picks answer.
//                     Audio: "十 加 [sum] 等于几"
//                     After step 3 correct, the anchor reveals too
//                     and a reward audio reads "a+b=answer" (the
//                     full equation as a celebration sentence).

import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260812";
import { poolGens } from "../data/pools.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import drawLink from "../components/drawLink.js?v=20260812";
import {
  INK, FONT, YELLOW, BLUE, PINK, ORANGE,
} from "../components/theme.js?v=20260812";

const TEN = 10;
const COL_BIG   = BLUE;    // the 2-digit addend (a)
const COL_SMALL = PINK;    // the 1-digit addend (b)
const COL_TEN   = YELLOW;  // the literal "10" in sub-questions
const COL_NEED  = ORANGE;  // the unknown / just-computed slot

// Persistent anchor ("a + b = ?") rendered at the top.
//
// `reserve` pins each slot's width to its widest lifetime content: the sum
// slot starts as "?" (1 char) and is revealed as a 2-digit answer in step 3.
// Without the reservation the row re-centers on reveal and every slot —
// plus the anchor → split link lines anchored to slotCenters — jumps left.
// Per user report 2026-08-12: "相同位置的元素，在每一步的位置好像不一样".
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
    reserve: [round.a, "+", round.b, "=", round.answer],
  };
}

// Widest lifetime content of the split row (y=440). Slot 2 reveals
// "□" → ones digit (round.a % TEN). The "□" box is 0.9 × size wide
// but the ones digit is only 0.62 × size — reserving to the ones
// digit alone (e.g. `round.a % TEN`) does NOT lock the slot center
// (max(0.9, 0.62) = 0.9 for box, max(0.62, 0.62) = 0.62 for digit
// — widths diverge). Reserving to "□" (or any content ≥ 0.9 wide)
// pins the slot to a stable bucket across the reveal. Slot 6's
// reserve pins the answer slot to its 2-digit width.
function splitReserve(round) {
  return [TEN, "+", "□", "+", round.b, "=", round.answer];
}

// Widest lifetime content of the bottom row (y=600): slot 2 reveals
// "□" → the ones-sum (always 1 digit, since L4's pool enforces
// ones(a) + b < 10 — max sum is 9). The ones-sum is 1 digit wide,
// the box is 0.9 × size wide — same "□" reserve pattern as the
// split row to lock slot 2. Slot 4 reveals "?" → the 2-digit
// answer; reserving to the answer locks it.
function bottomReserve(round) {
  return [TEN, "+", "□", "=", round.answer];
}

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

function renderL4Step1Split(ctx, round, ones, answerSlot = "?") {
  ctx.arrowNodes?.forEach((node) => node.destroy());
  ctx.arrowNodes = [];

  if (ctx.step1SplitNode) ctx.step1SplitNode.destroy();
  ctx.step1SplitNode = expression(ctx.k, {
    slots: [TEN, "+", ones == null ? "□" : ones, "+", round.b, "=", answerSlot],
    colors: [COL_TEN, undefined, COL_NEED, undefined, COL_SMALL, undefined, undefined],
    reserve: splitReserve(round),
    x: LAYOUT.barX,
    y: 440,
    size: 82,
  });

  for (const point of splitLinkPoints(ctx.anchorEqNode, ctx.step1SplitNode)) {
    // L4 uses 0.4 opacity (shared default is 0.6) — keeps 4 simultaneous
    // lines on the three-line diagram visually separable.
    ctx.arrowNodes.push(drawLink(ctx.k, ctx.arrowsRoot, point.from, point.to, point.color, 7, 0.4));
  }
  return ctx.step1SplitNode;
}

// Redraws the two anchor → split lines using the current anchorEqNode
// and step1SplitNode. Use when either has been recreated (slot centers
// have shifted) — e.g. step 3's onAdvance reveals the answer in the
// anchor, which widens slot 4 and shifts the whole layout left.
//
// Doesn't touch the split → bottom lines (step1NextLinks); those are
// managed by renderL4BottomRow.
function renderL4Step1SplitLinks(ctx) {
  ctx.step1Links?.forEach((node) => node.destroy());
  ctx.step1Links = [];
  for (const point of splitLinkPoints(ctx.anchorEqNode, ctx.step1SplitNode)) {
    ctx.step1Links.push(drawLink(ctx.k, ctx.arrowsRoot, point.from, point.to, point.color, 7, 0.4));
  }
}

// Renders the bottom row `10 + slot2 = answer` at y=600 and redraws the
// two split → bottom lines using the current step1SplitNode. Use when
// slot 2 (the `□` placeholder, or the picked ones-sum) or the answer
// slot has changed — or any time the split row above has been recreated.
//
// The split → bottom lines stay visible across steps 2 and 3 by design
// (per user feedback 2026-08-12: "个位相加，替换方格，为什么把合并的
// 关联线去掉了，不要去掉") — they're re-aimed at the new slot 2 here
// instead of being torn down.
function renderL4BottomRow(ctx, round, slot2, answer = "?") {
  if (ctx.step1NextNode) ctx.step1NextNode.destroy();
  ctx.step1NextNode = expression(ctx.k, {
    slots: [TEN, "+", slot2, "=", answer],
    colors: [COL_TEN, undefined, COL_NEED, undefined, answer === "?" ? COL_NEED : INK],
    reserve: bottomReserve(round),
    x: LAYOUT.barX,
    y: 600,
    size: 82,
  });
  ctx.step1NextLinks?.forEach((node) => node.destroy());
  ctx.step1NextLinks = [];
  const target = ctx.step1NextNode.slotCenters?.[2];
  if (target != null && ctx.step1SplitNode?.slotCenters) {
    for (const sourceIndex of [2, 4]) {
      const source = ctx.step1SplitNode.slotCenters?.[sourceIndex];
      if (source == null) continue;
      ctx.step1NextLinks.push(drawLink(
        ctx.k,
        ctx.arrowsRoot,
        {
          x: source,
          y: ctx.step1SplitNode.slotY + ctx.step1SplitNode.slotSizes[sourceIndex] / 2,
        },
        {
          x: target,
          y: ctx.step1NextNode.slotY - ctx.step1NextNode.slotSizes[2] / 2,
        },
        COL_NEED,
        7,
        0.4,
      ));
    }
  }
  return ctx.step1NextNode;
}

// Renders (or rebuilds) the split row at y=440 with `ones` in slot 2
// and `answer` in slot 6. Use for both the initial "□"→ones transition
// (step 1 onAdvance) and the final "?"→answer transition (step 3
// onAdvance). The reserve is wide enough that slot 0/2/4 centers stay
// pinned across both transitions, so the lines drawn against them don't
// drift. Slot 6 (the answer) is the only thing the caller can change
// here — it's the "?" the kid is working toward in the split equation.
//
// Per user feedback 2026-08-12: the split row's `?` must also reveal
// to the real answer in step 3, alongside the anchor and the bottom
// row. Otherwise the screen reads as "anchor says 19, bottom says 19,
// split still says ?" — the eye lands on the unrevealed `?` and the
// layout looks broken. Re-rendering the row keeps all three consistent.
function renderL4SplitRow(ctx, round, ones, answer = "?") {
  if (ctx.step1SplitNode) ctx.step1SplitNode.destroy();
  ctx.step1SplitNode = expression(ctx.k, {
    slots: [TEN, "+", ones, "+", round.b, "=", answer],
    colors: [COL_TEN, undefined, COL_NEED, undefined, COL_SMALL, undefined, undefined],
    reserve: splitReserve(round),
    x: LAYOUT.barX,
    y: 440,
    size: 82,
  });
  return ctx.step1SplitNode;
}

function renderL4Step1Completed(ctx, round, ones) {
  renderL4SplitRow(ctx, round, ones, "?");
  renderL4Step1SplitLinks(ctx);
  return renderL4BottomRow(ctx, round, "□");
}

// generated by tools/build-composite-audio.mjs — one mp3 per
// (a, b) / (ones, b) / (sum) combination from data/levels.json.
// Returns a single-element array so the existing playSequence /
// playAfter / onComplete machinery still works (one cue = same
// event-driven chain).
//
// Step 1 — Split: "11+8等于几，我们先把 11 进行拆分，拆成十加几"
function buildL3Step1Ids(a, b) {
  return [`l3-s1-${a}-${b}`];
}

// Step 2 — Add the two ones: "个位相加 [ones] 加 [b] 等于几"
function buildL3Step2Ids(ones, b) {
  return [`l3-s2-${ones}-${b}`];
}

// Step 3 — Add 10 and the sum: "十 加 [sum] 等于几"
function buildL3Step3Ids(sum) {
  return [`l3-s3-${sum}`];
}

// After step 3 correct, read the full equation as a reward:
// "11+8=19". One composite mp3 per (a, b, answer).
function buildL3RewardIds(a, b, answer) {
  return [`l3-rwd-${a}-${b}-${answer}`];
}

// Fires a per-step L3 audio chain. Two cases (same pattern as L2 —
// see scenes/level2.js for the full rationale):
//
//   1. Any step after a correct pick (round 0 step 2/3, round 1+ all
//      steps): chain off ctx.lastEncourageId — the last cue of the
//      tier-based cheer chain (enc-first-N on the first pick,
//      panda-praise-N on streak-3+, panda-cheer-N on round-complete).
//      The new prompt starts AFTER the cheer lands, with 400ms breath
//      between. Without this, the cheer and the new prompt overlap and
//      feel crammed together.
//
//   2. Fallback (no prior audio to chain off — entry / round 0 step 1):
//      play immediately with a small render-settle delay.
//
// Per user feedback 2026-08-10: the old round-0 entry greeting
// (lvl-3-intro, "现在我们一起学习二十以内的计算") was just a topic
// statement ("big numbers" voice) — it gave no instruction for what
// the kid should DO. Now the per-round step 1 audio IS the entry
// guidance:
//   "11+8等于几，我们先把 11 进行拆分，拆成十加几"
// — it names the equation and the strategy in one fluent sentence.
// No separate intro needed.
function fireL3StepAudio(ctx, ids, _stepNumber, onComplete) {
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
  levelId: 4,
  sceneName: "level4",
  // Full enumeration (~36 valid no-carry combos). roundScene samples 10
  // each session so the kid sees a different subset on every replay.
  poolGen: () => poolGens[4](),
  sampleSize: 10,
  // No topic-intro cue on entry — per user feedback 2026-08-10. The old
  // "现在我们一起学习二十以内的计算" intro (the "big numbers" voice) was
  // just a topic statement; it ate ~3s before any prompt appeared and
  // gave no instruction for what to DO. Now the step 1 audio IS the
  // entry prompt:
  //   "11+8等于几，我们先把 11 进行拆分，拆成十加几"
  // — names the equation and the strategy in one fluent sentence.
  // introCue intentionally omitted.
  // Three teaching beats. Labels are the visible step-bar text — short,
  // verb-shaped Chinese that names the strategy of each beat.
  stepLabels: ["拆十位", "加个位", "加起来"],

  steps: [
    // Step 1 — Split: 10 + ones + b = ?. The top equation remains visible;
    // the lower equation shows the two-digit addend decomposed into 10 and
    // its ones digit, with links from the top addend to those two slots.
    (ctx, round) => {
      const ones = round.a % TEN;
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      const renderStep1 = () => renderL4Step1Split(ctx, round, null);
      fireL3StepAudio(
        ctx, buildL3Step1Ids(round.a, round.b), 1,
        renderStep1,
      );
      return {
        deferEquation: true,
        equation: {
          slots: [TEN, "+", "□", "+", round.b, "=", "?"],
          colors: [COL_TEN, undefined, COL_NEED, undefined, COL_SMALL, undefined, undefined],
          reserve: splitReserve(round),
        },
        equationOpts: { y: 440, size: 82 },
        question: {
          correct: ones,
          values: options(ones, { min: 0, max: 9 }),
        },
        onAdvance: () => {
          renderL4Step1Completed(ctx, round, ones);
        },
      };
    },
    // Step 2 — Add the ones: preserve the completed split and ask for
    // `ones + b` in the lower `10 + □ = ?` row. We re-render the bottom
    // row (rather than calling setEquation) so we explicitly own the
    // `step1NextNode` reference and keep the split → bottom lines
    // re-aimed at the new slot 2 every time the bottom row is rebuilt.
    (ctx, round) => {
      const ones = round.a % TEN;
      const sum = ones + round.b;
      // Keep the three-line teaching diagram from step 1. Only the lower
      // calculation row is active for this step.
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      renderL4BottomRow(ctx, round, "□");
      fireL3StepAudio(ctx, buildL3Step2Ids(ones, round.b), 2);
      return {
        question: {
          correct: sum,
          values: options(sum, { min: 1, max: 10 }),
        },
        onAdvance: () => {
          // Replace the `□` with the picked ones-sum. The split → bottom
          // lines stay visible — they're re-aimed at the new slot 2
          // (sum) inside renderL4BottomRow.
          renderL4BottomRow(ctx, round, sum);
        },
      };
    },
    // Step 3 — Add 10 to the ones-sum in the same lower row.
    (ctx, round) => {
      const ones = round.a % TEN;
      const sum = ones + round.b;
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 220 });
      renderL4BottomRow(ctx, round, sum);
      fireL3StepAudio(ctx, buildL3Step3Ids(sum), 3);
      return {
        question: {
          correct: round.answer,
          values: options(round.answer, { min: 11, max: 20 }),
        },
        onAdvance: () => {
          // Reveal the answer in all three rows. The persistent visuals —
          // anchor → split lines, split → bottom lines — stay visible;
          // only the answer slot of each row is rewritten. Per user
          // feedback 2026-08-12: "最后结果选中时，你把所有都清了，
          // 更不对了" (don't tear everything down on the final pick).
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 220 });
          // Split row reveals its `?` to the real answer. Without this
          // the kid would see "anchor 12+7=19, bottom 10+9=19, split
          // still 10+2+7=?" — the unrevealed `?` reads as a layout bug.
          // Reserve is in place for slot 0/2/4 so the line endpoints
          // don't drift; the answer slot (slot 6) has no line attached.
          renderL4SplitRow(ctx, round, ones, round.answer);
          // Anchor → split lines: re-aimed at the new (still-reserved)
          // a/b centers.
          renderL4Step1SplitLinks(ctx);
          // Bottom row updates with the revealed answer. The split →
          // bottom lines stay visible — re-aimed at the (unchanged)
          // ones-sum slot 2 inside renderL4BottomRow.
          renderL4BottomRow(ctx, round, sum, round.answer);
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              buildL3RewardIds(round.a, round.b, round.answer),
              { gapMs: 200, seqGapMs: 40 },
              resolve,
            );
          });
        },
      };
    },
  ],
});

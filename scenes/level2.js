// scenes/level2.js — make-a-ten strategy, taught in 4 explicit steps.
//
// The persistent anchor ("a + b = ?") sits at the TOP of the screen in the
// largest font — it's the goal the child is working toward and never
// disappears between teaching beats. Each step shows a smaller sub-question
// below it.
//
// Step 1 — Compare:    sub "big ? small"; child picks ">" or "<". Big in
//                      blue, small in pink. After correct, "?" becomes ">".
// Step 2 — To ten:     sub "big + ? = 10"; child picks the friend count.
//                      The ten-frame pair below lights up so the child SEES
//                      the pair making ten. NO reveal text like
//                      "8 + 2 = 10" — that just restates the equation.
// Step 3 — Split:      sub "? + ? = small"; child picks a split of the
//                      small number. Options like "1+4", "2+3", "3+2",
//                      "4+1" — one of them has the ten-completing part
//                      (need) as its first addend. After correct, the
//                      anchor doesn't change yet — only the sub-question's
//                      "?" slots are now filled.
// Step 4 — Count:      sub "a + (need + rest) = ?"; child picks the total.
//                      The parentheses group the split visually so the
//                      child reads it as "eight plus the split of five".
//                      After correct, EVERY "?" on screen becomes the
//                      correct number — the persistent anchor and the
//                      sub-question both reveal at once.

import tenFrame from "../components/tenFrame.js";
import createRoundScene, { LAYOUT, options } from "./roundScene.js";
import { poolGens } from "../data/pools.js";
import {
  INK, FONT, YELLOW, BLUE, PINK, PURPLE, ORANGE,
} from "../components/theme.js";

const TEN = 10;
const COL_BIG = BLUE;
const COL_SMALL = PINK;
const COL_NEED = ORANGE;
const COL_REST = PURPLE;
const COL_TEN  = YELLOW;

function bigger(a, b) { return a >= b ? a : b; }
function smaller(a, b) { return a >= b ? b : a; }

// Persistent anchor ("a + b = ?") rendered at the top, large.
function anchorSlots(round, sumSlot) {
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: [COL_BIG, undefined, COL_SMALL, undefined, undefined],
  };
}

// Two ten-frames side by side. The left frame shows the bigger addend; the
// right frame shows the smaller addend. Both frames mirror the colored
// labels above them so the eye links label → frame count instantly. The
// friend count is taught via the equation ("big + ? = 10"), not via the
// frames — the frames are visual anchors for the two addends, not a
// counting tool for the friend.
//
// Shown on every step (including step 1, so the child can SEE that 8 > 5
// before being asked to compare). Frames and labels are recreated per call;
// ctx.frameA/ctx.frameB and ctx.frameLabels track the previous render so it
// can be destroyed cleanly.
//
// Layout notes (canvas is 1366x1024):
//   anchor sits at y=260
//   frame labels sit at y=400, size 50 (top ~y=375, bottom ~y=425)
//   frames sit at y=500 with cell=58, gap=6 — height 2*58+6=122, so they
//   span y=439..y=561
//   sub-question sits at y=660, size 82 (top ~y=619, bottom ~y=701)
function tenFramePair(ctx, round) {
  const { k } = ctx;
  const big = bigger(round.a, round.b);
  const small = smaller(round.a, round.b);

  if (ctx.frameA) ctx.frameA.destroy();
  if (ctx.frameB) ctx.frameB.destroy();
  if (ctx.frameLabels) ctx.frameLabels.forEach((n) => n.destroy());

  ctx.frameA = tenFrame(k, big, {
    x: LAYOUT.barX - 220, y: 500,
    rows: 2, cell: 58, gap: 6, showLabel: false,
  });
  ctx.frameB = tenFrame(k, small, {
    x: LAYOUT.barX + 220, y: 500,
    rows: 2, cell: 58, gap: 6, showLabel: false,
  });

  // Big-number labels above each frame.
  ctx.frameLabels = [];
  ctx.frameLabels.push(k.add([
    k.text(String(big), { size: 50, font: FONT }),
    k.color(...COL_BIG),
    k.pos(LAYOUT.barX - 220, 400),
    k.anchor("center"),
  ]));
  ctx.frameLabels.push(k.add([
    k.text(String(small), { size: 50, font: FONT }),
    k.color(...COL_SMALL),
    k.pos(LAYOUT.barX + 220, 400),
    k.anchor("center"),
  ]));
}

// Build split-of-small options as button-text strings ("a+b"). Always
// includes the canonical (need, rest) split as the correct one.
// Returns however many UNIQUE splits exist — for small ∈ {2, 3, 4} the
// kid sees fewer than 4 buttons. Padding with duplicates ("1+1" four
// times) used to fill the row, but per user feedback the duplicates are
// worse than fewer options.
function buildSplitOptions(small, need, rest) {
  const seen = new Set();
  const opts = [];
  const correctStr = `${need}+${rest}`;
  // Walk from a=1 upward, generating (a, small-a) pairs.
  for (let a = 1; a < small; a++) {
    const b = small - a;
    const text = `${a}+${b}`;
    if (!seen.has(text)) {
      seen.add(text);
      opts.push(text);
    }
  }
  if (opts.length > 4) {
    // Keep the correct split, plus 3 others.
    const others = opts.filter((s) => s !== correctStr).slice(0, 3);
    opts.length = 0;
    opts.push(correctStr, ...others);
  }
  return { options: opts, correct: correctStr };
}

// Per-step audio for L2 (凑十法). Each step is one pre-baked
// composite mp3 (e.g. "我们来计算八加五等于几，先比一比，八还是五谁大")
// generated by tools/build-composite-audio.mjs — one mp3 per
// (a, b) / (big) / (small, need) / (small, need, rest, big)
// combination from data/levels.json. Returns a single-element
// array so the existing playSequence / playAfter / onComplete
// machinery still works (one cue = same event-driven chain).
//
// Step 1 — Compare: "我们来计算 a 加 b 等于几，先比一比，a 还是 b 谁大"
function buildL2Step1Ids(a, b) {
  return [`l2-s1-${a}-${b}`];
}

// Non-make-ten step 1 — just the prompt "我们来计算 a 加 b 等于几". The
// 4-step make-a-ten teaching would lie for simple / 2-digit / trivial
// rounds (no big's-friend lookup applies), so the kid gets a single
// prompt and answers directly. The reward cue (l2-rwd) is reused from
// the make-ten pipeline so the audio assets stay shared.
function buildL2SimpleIds(a, b) {
  return [`l2-simple-${a}-${b}`];
}

// Step 2 — Find friend: "大数是 big，我们找找 big 的好朋友，
//   big 的好朋友是几"
function buildL2Step2Ids(big) {
  return [`l2-s2-${big}`];
}

// Step 3 — Split: "small 需要拆一拆， small 能分成 need 和几？"
// Step 2 already told the child who the friend is, so this beat
// just restates the split.
function buildL2Step3Ids(small, need) {
  return [`l2-s3-${small}-${need}`];
}

// Step 4 — Calculate: "small 分成 need 加 rest，算一算
//   big 加 need 加 rest 等于几"
function buildL2Step4Ids(big, small, need, rest) {
  return [`l2-s4-${small}-${need}-${rest}-${big}`];
}

// Fires a per-step L2 audio chain. Three cases:
//
// Fires a per-step L2 audio chain. Two cases:
//
//   1. Any step after a correct pick (round 0 step 2+, round 1+
//      all steps): chain off the celebration cue that roundScene just
//      played. The new prompt starts AFTER the praise lands, with
//      400ms breath between. Without this, the praise and the new
//      prompt overlap and feel crammed together.
//
//   2. Fallback (no prior audio to chain off): play immediately
//      with a small render-settle delay.
//
// The previous level-intro ("lvl-2-intro" — "现在我们一起学习凑十法")
// was removed per user feedback: clicking the 凑十法 tile drops the
// kid straight into round 0 step 1 without the spoken greeting,
// since the per-step audio already names the strategy on the first
// round.
function fireL2StepAudio(ctx, ids, _stepNumber) {
  // After a correct pick, the celebration chain ends with
  // "panda-celebrate" — chain the step audio off its `ended` event
  // so the next step starts immediately when the cheer finishes,
  // with no setTimeout and no overlap with the cheer tail.
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter("panda-celebrate", ids, {
      gapMs: 400,
      seqGapMs: 40,
    });
    return;
  }
  window.PandaAudio.playSequence(ids, 40, 100);
}

export default createRoundScene({
  levelId: 2,
  sceneName: "level2",
  // 200 ordered (a, b) pairs from data/pools.js. roundScene samples 10
  // on first entry; each play sees a different mix.
  poolGen: () => poolGens[2](),
  sampleSize: 10,
  // No intro cue — the persistent anchor ("a + b = ?") IS the introduction.
  // A "make ten" voice on entry would just say the same thing twice.
  stepLabels: ["比一比", "凑成十", "拆一拆", "算一算"],

  steps: [
    // Step 1 — Compare. Every L2 round is make-ten, so this step shows
    // "big ? small" and asks the kid to pick > / <. The 4-step
    // scaffolding (compare → find-friend → split → count) applies
    // to every round.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const isEqual = round.a === round.b;
      // Frames are visible from step 1 — the child needs to SEE the two
      // counts before picking > / <, not just read the numbers.
      tenFramePair(ctx, round);
      // Persistent anchor at top, big.
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 260 });
      // Equal case: there's no correct comparison (> and < are both
      // wrong). Skip the per-step "compare which is bigger" audio
      // (which is awkward for "6 还是 6 谁大"), show "a = b" on the
      // sub-question row, and auto-advance after a beat so the kid
      // sees the equal sign and moves on. Per user feedback: "等于时，
      // 随便取一个" — don't make the kid tap a button when the
      // numbers are the same.
      if (isEqual) {
        return {
          equation: {
            slots: [round.a, "=", round.b],
            colors: [COL_BIG, COL_NEED, COL_SMALL],
          },
          equationOpts: { y: 660, size: 82 },
          noQuestionDelay: 1.0,
        };
      }
      // Per-step audio prompt. "我们来计算 a 加 b 等于几，先比一比，
      // a 还是 b 谁大" — uses round.a / round.b in their original
      // order so the prompt matches the visible equation above.
      fireL2StepAudio(ctx, buildL2Step1Ids(round.a, round.b), 1);
      return {
        equation: {
          slots: [big, "?", small],
          colors: [COL_BIG, undefined, COL_SMALL],
        },
        // Sub-question sits BELOW the ten frames so the visual flow is
        // anchor → frames → comparison question → buttons.
        equationOpts: { y: 660, size: 82 },
        // No `cue:` — the L2 step-1 audio is the contextual sentence
        // fired via fireL2StepAudio above.
        question: {
          correct: ">",
          values: [">", "<"],
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [big, ">", small],
            colors: [COL_BIG, COL_NEED, COL_SMALL],
          }, { y: 660, size: 82 });
        },
      };
    },
    // Step 2 — To ten.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      // Anchor stays as-is. The right frame already shows the small number
      // (see tenFramePair); the friend count is taught via the equation.
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 260 });
      // Per-step audio prompt. "大数是 big，我们找找 big 的好朋友，
      // 小朋友 big 的好朋友是几" — uses bigger(a, b) so it works
      // regardless of which addend is bigger in the round data.
      fireL2StepAudio(ctx, buildL2Step2Ids(big), 2);
      return {
        equation: {
          slots: [big, "+", "?", "=", TEN],
          colors: [COL_BIG, undefined, undefined, undefined, COL_TEN],
        },
        equationOpts: { y: 660, size: 82 },
        question: {
          correct: round.need,
          values: options(round.need, { min: 0, max: TEN, prefer: [round.rest] }),
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [big, "+", round.need, "=", TEN],
            colors: [COL_BIG, undefined, COL_NEED, undefined, COL_TEN],
          }, { y: 660, size: 82 });
        },
      };
    },
    // Step 3 — Split: ? + ? = small.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const { options: splitOpts, correct } = buildSplitOptions(
        small, round.need, round.rest,
      );
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 260 });
      // Per-step audio prompt. "small 需要拆一拆， small 能分成 need
      // 和几？" — short, just enough to anchor what the child is
      // picking. Step 2 already covered who the friend is.
      fireL2StepAudio(ctx, buildL2Step3Ids(small, round.need), 3);
      return {
        equation: {
          slots: ["?", "+", "?", "=", small],
          colors: [undefined, undefined, undefined, undefined, COL_SMALL],
        },
        equationOpts: { y: 660, size: 82 },
        question: {
          correct,
          values: splitOpts,
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [round.need, "+", round.rest, "=", small],
            colors: [COL_NEED, undefined, COL_REST, undefined, COL_SMALL],
          }, { y: 660, size: 82 });
        },
      };
    },
    // Step 4 — Count: a + (need + rest) = ?
    // The parentheses group the split visually so the child sees the pair
    // that makes ten as a single chunk: "8 + (2 + 3) = ?" reads as
    // "eight plus the split of five" — ten stays implicit. Every L2
    // round is make-ten so the round finishes on the kid's pick.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 260 });
      // Per-step audio prompt. "small 分成 need 加 rest，算一算 big 加
      // need 加 rest 等于几" — restates the split result and prompts
      // the final calculation. q-equals ("等于几") is the question
      // form for the child's pick.
      fireL2StepAudio(ctx, buildL2Step4Ids(big, small, round.need, round.rest), 4);
      return {
        equation: {
          slots: [big, "+", "(", round.need, "+", round.rest, ")", "=", "?"],
          colors: [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, undefined],
        },
        equationOpts: { y: 660, size: 80 },
        question: {
          correct: round.answer,
          values: options(round.answer, { min: TEN, max: 20, count: 4 }),
        },
        // After the child picks the total, reveal the anchor and the
        // sub-question with the answer filled in, then play the reward
        // audio "[a] 加 [b] 等于 [answer]" — the full equation as a
        // sentence, not a question. Chained off panda-celebrate (the
        // cheer chain's last cue) so it doesn't overlap with the
        // celebration. roundScene awaits the returned Promise so the
        // kid hears "8+5=13" before the next round's greeting fires.
        onAdvance: () => {
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 260 });
          ctx.setEquation({
            slots: [big, "+", "(", round.need, "+", round.rest, ")", "=", round.answer],
            colors: [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, INK],
          }, { y: 660, size: 80 });
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              "panda-celebrate",
              [`l2-rwd-${round.a}-${round.b}-${round.answer}`],
              { gapMs: 200, seqGapMs: 40 },
              resolve,
            );
          });
        },
      };
    },
  ],
});
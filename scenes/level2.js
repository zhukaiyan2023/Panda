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
//
// COL_BIG (blue) lands on whichever addend is the larger one — NOT
// always round.a. Otherwise for 6+7 the anchor reads "6 (blue) +
// 7 (pink)" and contradicts the step-1 sub-question "6 (pink) ?
// 7 (blue)", where COL_BIG is on the actually-larger side. The
// contradiction is especially confusing for the kid right after the
// comparison step, where they just proved to themselves which is
// bigger. Mirrors the same left-is-big / right-is-big color rule used
// by step 1 below.
function anchorSlots(round, sumSlot) {
  const aIsBig = round.a > round.b;
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: aIsBig
      ? [COL_BIG, undefined, COL_SMALL, undefined, undefined]
      : [COL_SMALL, undefined, COL_BIG, undefined, undefined],
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
// includes the canonical (need, rest) split as the correct one, and
// per user feedback ("两个数只是交换顺序也不要出现在选项里面"), never
// includes both a pair and its swap side-by-side — so we generate
// only canonical splits (a ≤ b) and, when the correct split's order
// isn't canonical (need > rest), drop the canonical swap to make room
// for the correct one. Returns however many UNIQUE splits exist — for
// small ∈ {2, 3, 4} the kid sees fewer than 4 buttons.
function buildSplitOptions(small, need, rest) {
  const seen = new Set();
  const opts = [];
  const correctStr = `${need}+${rest}`;
  const swapCorrectStr = `${rest}+${need}`;
  // Walk a from 1 upward, but only emit (a, small-a) where a ≤ small-a.
  // This skips the swapped pairs (3+2 vs 2+3, 4+1 vs 1+4) per user
  // feedback — a pair and its swap shouldn't both appear as options.
  for (let a = 1; a <= Math.floor(small / 2); a++) {
    const b = small - a;
    const text = `${a}+${b}`;
    if (!seen.has(text)) {
      seen.add(text);
      opts.push(text);
    }
  }
  // Always include the correct split. When need > rest the correct
  // ordering (need first, then rest) is NOT canonical, so we have to
  // add it and drop the canonical swap from the list so the pair and
  // its swap never sit in the same options row.
  if (!seen.has(correctStr)) {
    seen.add(correctStr);
    opts.push(correctStr);
    if (swapCorrectStr !== correctStr) {
      const idx = opts.indexOf(swapCorrectStr);
      if (idx !== -1) {
        opts.splice(idx, 1);
        seen.delete(swapCorrectStr);
      }
    }
  }
  // Cap at 4 options to keep the button row width stable across rounds.
  // For small ≥ 6 the canonical set already fits in 4 (small=6 → 3,
  // small=7 → 3, small=8 → 4, small=9 → 4); the cap only fires when
  // a non-canonical correct is added on top.
  if (opts.length > 4) {
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

// Comparison reveal — reads "a 大于 b" or "a 小于 b" after the kid
// picks the correct sign in step 1. Same audio plays whether the
// kid is hearing the round for the first time or revisiting it —
// the spoken comparison follows the kid's actual answer direction.
// Skipped for a == b (the equal case auto-advances with no
// comparison pick, so there's no sign to read aloud).
function buildL2CmpIds(a, b) {
  if (a === b) return [];
  return [`l2-cmp-${a}-${b}`];
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

// Step 4 SWAP variant — fires only when the smaller addend comes
// first (round.a < round.b, e.g. 6+9) AND rest ≠ need (the split
// has two non-zero pieces in different order). The visual for these
// rounds shows "(rest+need)+b = ?" preserving question order, but
// the canonical l2-s4 audio says "big+need+rest" — re-introducing
// the swap jump the visual removes. The "s" suffix marks the
// swapped text variant. When rest == need both orderings are
// visually identical so no swap audio needed.
function buildL2Step4SwapIds(a, b, big, small, need, rest) {
  if (!(a < b && rest !== need)) return null;
  return [`l2-s4s-${a}-${b}-${need}-${rest}-${big}`];
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
  // After a correct pick, the celebration chain ends with the cue
  // roundScene set on ctx.lastEncourageId (the actual LAST cue of the
  // new tier-based cheer chain — enc-first-N on the first pick,
  // panda-praise-N on streak-3+, panda-cheer-N on round-complete).
  // Chain the step audio off that cue's `ended` event so the next step
  // starts immediately when the cheer finishes, with no setTimeout and
  // no overlap with the cheer tail. The old reference was hardcoded
  // to "panda-celebrate", which is gone from CUE_IDS.
  if (ctx.lastEncourageId) {
    window.PandaAudio.playAfter(ctx.lastEncourageId, ids, {
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
    // Step 1 — Compare. Every L2 round is make-ten, so this step asks
    // the kid to pick > / < between the two addends. The 4-step
    // scaffolding (compare → find-friend → split → count) applies to
    // every round.
    //
    // Per user feedback (2026-08-10): when the smaller addend comes
    // first in the round (e.g. 6+7), the sub-question used to read
    // "7 ? 6" (big-first), forcing the child to mentally re-order the
    // numbers before answering. Now we keep round.a on the LEFT and
    // round.b on the RIGHT — same order as the persistent anchor
    // above — and let COL_BIG (blue) land on whichever slot is the
    // larger addend. The correct sign is derived from the same
    // "which side is bigger" check.
    //
    // The compare options use SMALL SQUARE buttons (110×110) styled
    // like little input boxes, not the wide numeric answer buttons
    // used elsewhere — visually distinct from a 4-button number row
    // and big enough for the kid's fingers (≥44pt touch target on
    // iPad). Per user feedback: "比较大小这地方，能不能用成小的正方形
    // 输入框那种".
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const isEqual = round.a === round.b;
      const leftIsBig = round.a > round.b;
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
      // Keep round.a on the LEFT, round.b on the RIGHT. COL_BIG lives
      // on whichever slot holds the bigger addend — so for 6+7 the
      // sub-question reads "6 [?] 7" with 6 pink and 7 blue, and the
      // correct pick is "<" (leftIsBig is false here).
      const slots = [round.a, "?", round.b];
      const colors = leftIsBig
        ? [COL_BIG, undefined, COL_SMALL]
        : [COL_SMALL, undefined, COL_BIG];
      // After correct pick, the "?" slot fills with the picked sign
      // and turns COL_NEED (orange) so the eye sees the symbol as a
      // freshly-revealed piece of info, not part of the original
      // equation. Outer slots keep their COL_BIG/COL_SMALL.
      const revealColors = leftIsBig
        ? [COL_BIG, COL_NEED, COL_SMALL]
        : [COL_SMALL, COL_NEED, COL_BIG];
      const compareCorrect = leftIsBig ? ">" : "<";
      return {
        equation: { slots, colors },
        // Sub-question sits BELOW the ten frames so the visual flow is
        // anchor → frames → comparison question → buttons.
        equationOpts: { y: 660, size: 82 },
        // No `cue:` — the L2 step-1 audio is the contextual sentence
        // fired via fireL2StepAudio above. Small SQUARE compare
        // buttons (110×110) — renderButtons picks these up via opts
        // forwarded from built.question. Distinct from the wide 4-row
        // number buttons used in steps 2/3/4.
        question: {
          correct: compareCorrect,
          values: [">", "<"],
          buttonW: 110,
          buttonH: 110,
          gap: 40,
        },
        onAdvance: () => {
          ctx.setEquation({
            slots: [round.a, compareCorrect, round.b],
            colors: revealColors,
          }, { y: 660, size: 82 });
          // Read the revealed comparison aloud so the kid hears
          // "X 大于 Y" / "X 小于 Y" matching the visual they just
          // unlocked. Chained off ctx.lastEncourageId (the actual
          // last cue of the tier-based cheer chain) so the reveal
          // starts AFTER the celebration tail and never overlaps
          // it. roundScene awaits the returned Promise so the kid
          // hears the comparison before the next step's prompt
          // fires. The previous version revealed silently — kid
          // saw the >/< but never heard what they just learned.
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              buildL2CmpIds(round.a, round.b),
              { gapMs: 200, seqGapMs: 40 },
              resolve,
            );
          });
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
    // Step 4 — Count: a + (need + rest) = ?  (or (rest+need)+b=? when a<b)
    // The parentheses group the split visually so the child sees the pair
    // that makes ten as a single chunk: "8 + (2 + 3) = ?" reads as
    // "eight plus the split of five" — ten stays implicit. Every L2
    // round is make-ten so the round finishes on the kid's pick.
    //
    // Per user feedback (2026-08-10): when the first addend is the
    // smaller one (round.a < round.b, e.g. 6+9), the kid has to mentally
    // "swap" to apply the make-a-ten strategy (treat as 9+6, then split
    // 6). Showing the decomposition in place — "(rest + need) + b = ?"
    // instead of "big + (need + rest) = ?" — removes that implicit jump.
    // The decomposition inside the parens also flips to rest-first to
    // match how the kid reads "6 → 5+1" mentally (subtract need to leave
    // rest). When a >= b, keep the canonical big-first form — no jump
    // to remove there.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "?"), { y: 260 });
      // Per-step audio prompt. "small 分成 need 加 rest，算一算 big 加
      // need 加 rest 等于几" for the canonical (a ≥ b or rest == need)
      // case. For the a<b && rest != need case (e.g. 6+9), the audio
      // swaps to "small 分成 rest 加 need，算一算 rest 加 need 加 big 等
      // 于几" so the spoken sentence matches the visual "(rest+need)
      // +b" decomposition. The previous "audio says big+need+rest
      // but visual shows (rest+need)+b" mismatch is fixed by this
      // conditional pick. buildL2Step4SwapIds returns null when no
      // swap is needed, falling back to the canonical buildL2Step4Ids.
      fireL2StepAudio(
        ctx,
        buildL2Step4SwapIds(round.a, round.b, big, small, round.need, round.rest)
          || buildL2Step4Ids(big, small, round.need, round.rest),
        4,
      );
      const aIsSmall = round.a < round.b;
      // Pre-answer equation + reveal-equation slot/color pairs. The two
      // cases only differ by which slot the unknown lives in and the
      // color of round.b/round.a (COL_BIG always lands on the BIG
      // addend, regardless of which original slot it came from).
      const eqSlots = aIsSmall
        ? ["(", round.rest, "+", round.need, ")", "+", round.b, "=", "?"]
        : [round.a, "+", "(", round.need, "+", round.rest, ")", "=", "?"];
      const eqColors = aIsSmall
        ? [undefined, COL_REST, undefined, COL_NEED, undefined, undefined, COL_BIG, undefined, undefined]
        : [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, undefined];
      const revealSlots = aIsSmall
        ? ["(", round.rest, "+", round.need, ")", "+", round.b, "=", round.answer]
        : [round.a, "+", "(", round.need, "+", round.rest, ")", "=", round.answer];
      const revealColors = aIsSmall
        ? [undefined, COL_REST, undefined, COL_NEED, undefined, undefined, COL_BIG, undefined, INK]
        : [COL_BIG, undefined, undefined, COL_NEED, undefined, COL_REST, undefined, undefined, INK];
      return {
        equation: {
          slots: eqSlots,
          colors: eqColors,
        },
        equationOpts: { y: 660, size: 80 },
        question: {
          correct: round.answer,
          values: options(round.answer, { min: TEN, max: 20, count: 4 }),
        },
        // After the child picks the total, reveal the anchor and the
        // sub-question with the answer filled in, then play the reward
        // audio "[a] 加 [b] 等于 [answer]" — the full equation as a
        // sentence, not a question. Chained off ctx.lastEncourageId
        // (the actual last cue of the tier-based cheer chain) so the
        // reward starts AFTER the celebration tail and never overlaps
        // it. roundScene awaits the returned Promise so the kid hears
        // "8+5=13" before the next round's greeting fires. The old
        // hardcoded "panda-celebrate" cue is gone from CUE_IDS.
        onAdvance: () => {
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 260 });
          ctx.setEquation({
            slots: revealSlots,
            colors: revealColors,
          }, { y: 660, size: 80 });
          return new Promise((resolve) => {
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
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
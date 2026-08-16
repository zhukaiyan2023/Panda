// scenes/level3.js — 凑十法 (make-a-ten), taught in 4 explicit steps.
// Was level2.js before the four-way split; renumbered when 三数相加
// was separated into L1 (sum ≤ 10) and L2 (two-of-three sum to 10),
// and 凑十法 moved from L2 to L3. The make-a-ten pool (data/pools.js
// generateL3Pool) and the 4-step teaching logic below are unchanged.
//
// Audio cue naming: the per-round composite cues are still named
// `l2-s1-*`, `l2-s2-*`, `l2-s3-*`, `l2-s4-*`, `l2-cmp-*`, `l2-rwd-*`,
// etc. — those are the cue ids on disk under assets/audio/ and in
// main.js's CUE_IDS array, and renaming would require regenerating
// every pre-baked MP3. The internal builder functions
// (buildL2Step1Ids, fireL2StepAudio, drawL2Arrows, ...) keep their
// L2 prefix to match the cue ids they emit.
//
// The persistent anchor ("a + b = □") sits at the TOP of the screen in the
// largest font — it's the goal the child is working toward and never
// disappears between teaching beats. Unknowns render as outlined square
// boxes (per user feedback 2026-08-11: "用这个方格子表示未知，不要用
// 问号了"). Each step shows one or two smaller sub-equations below the
// anchor.
//
// Step 1 — Compare:    sub "a □ b"; child picks ">" or "<". Big in
//                      blue, small in pink. After correct, the □
//                      becomes the picked sign.
// Step 2 — Split + Friend:
//                      sub1 "big + □ + □ = □" (the split equation —
//                      the small addend will be split into the friend's
//                      part + the rest).
//                      sub2 "big + □ = 10" (the friend equation —
//                      teaches which piece of the small makes big ten).
//                      Three arrows connect anchor → sub1: a vertical
//                      line from anchor's "big" → sub1's "big" (the
//                      big stays), and two diagonal lines from anchor's
//                      "small" splitting into sub1's two □ slots
//                      (showing the small is decomposed). Child picks
//                      the friend. After correct: sub1 → "big + friend
//                      + □ = □" and sub2 → "big + friend = 10".
// Step 3 — Confirm split:
//                      sub1 "big + friend + □ = □" (carried over).
//                      sub2 "friend + □ = small" (the sub-split
//                      equation — the small is friend + rest).
//                      Child picks the rest. After correct:
//                      sub1 → "big + friend + rest = □" and
//                      sub2 → "friend + rest = small".
// Step 4 — Count:      sub1 "big + friend + rest = □" (the calc
//                      equation). sub2 disappears — the kid has
//                      confirmed the split and is ready to count up.
//                      Child picks the total. After correct, the anchor
//                      and sub1 both reveal at once: "a + b = answer"
//                      and "big + friend + rest = answer".

import tenFrame from "../components/tenFrame.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import createRoundScene, { LAYOUT, options } from "./roundScene.js?v=20260812";
import { poolGens } from "../data/pools.js?v=20260812";
import {
  INK, FONT, YELLOW, BLUE, PINK, PURPLE, ORANGE,
} from "../components/theme.js?v=20260812";

const TEN = 10;
const COL_BIG = BLUE;
const COL_SMALL = PINK;
const COL_NEED = ORANGE;
const COL_REST = PURPLE;
const COL_TEN  = YELLOW;

function bigger(a, b) { return a >= b ? a : b; }
function smaller(a, b) { return a >= b ? b : a; }

// Persistent anchor ("a + b = □") rendered at the top, large.
//
// COL_BIG (blue) lands on whichever addend is the larger one — NOT
// always round.a. Otherwise for 6+7 the anchor reads "6 (blue) +
// 7 (pink)" and contradicts the step-1 sub-question "6 (pink) □
// 7 (blue)", where COL_BIG is on the actually-larger side. The
// contradiction is especially confusing for the kid right after the
// comparison step, where they just proved to themselves which is
// bigger. Mirrors the same left-is-big / right-is-big color rule used
// by step 1 below.
//
// `reserve` pins slot 4 (the sum) to round.answer — always 2 digits
// in L3 (a + b > 10, max 9 + 9 = 18). Without the reservation the
// row re-centers on the step-4 reveal and every slot — plus the
// decomposition arrows drawn from slotCenters — jumps left. Per user
// feedback 2026-08-12: "相同位置的元素,在每一步的位置好像不一样" —
// locked once at the widest lifetime content. Same pattern as
// level4.js's anchorSlots and the L1/L2 audit. round.answer is always
// 2 digits for L3's pool, so reserving to it covers both "□" (0.9 ×
// size) and the revealed 2-digit answer (1.24 × size) — max() at
// layout time keeps the row's total width and slot centers stable
// across every render of the anchor.
function anchorSlots(round, sumSlot) {
  const aIsBig = round.a > round.b;
  return {
    slots: [round.a, "+", round.b, "=", sumSlot],
    colors: aIsBig
      ? [COL_BIG, undefined, COL_SMALL, undefined, undefined]
      : [COL_SMALL, undefined, COL_BIG, undefined, undefined],
    reserve: [null, null, null, null, round.answer],
  };
}

// Draws a thin colored line from `from` to `to`, used by L2 step 2 to
// draw the decomposition arrows from the anchor to the split equation
// below. Implemented as a thin rectangle anchored at its left edge and
// rotated to span the line — Kaplay has no built-in line primitive but
// a rotated rect is equivalent. Lines are added to `parent` so they
// inherit its destroy() chain (step 2 puts them inside the body wrapper
// alongside the friend sub-equation).
function drawLink(k, parent, from, to, color, thickness = 8) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  // atan2 returns radians; Kaplay's k.rotate takes degrees (CCW positive).
  // The angle here is the direction from `from` to `to`; rect anchored
  // at its left edge with positive len extends to the right, which after
  // rotation by `angleDeg` points along the line.
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  return parent.add([
    k.pos(from.x, from.y),
    k.rotate(angleDeg),
    k.rect(len, thickness),
    k.color(...color),
    k.opacity(0.6),
    k.anchor("left"),
  ]);
}

// Draws L2's decomposition arrows onto ctx.arrowsRoot (persistent across
// steps 2 → 3 → 4). Callers pass the sub1 slot indices for "need", "rest",
// and "big" — different step layouts have these in different positions:
//   aIsBig  step 2/3/4: sub1 = "big + □ + □ = □" → big=0, need=2, rest=4
//   aIsSmall step 2/3:  sub1 = "□ + □ + small = □" → need=0, rest=2 (no big in sub1)
//   aIsSmall step 4:    sub1 = "rest + need + b = □" → rest=0, need=2, big=4
// Set bigIdx to null when sub1 doesn't have a literal big slot (the
// aIsSmall step 2/3 case). Arrows are recreated each call — the previous
// set is destroyed first. Per user feedback 2026-08-11 the lines must
// persist through steps 3 and 4 ("拆一拆这一步时，拆分的线不要消失。
// 算一算的时候也要保留").
function drawL2Arrows(ctx, aIsBig, needIdx, restIdx, bigIdx) {
  ctx.arrowNodes.forEach((n) => n.destroy());
  ctx.arrowNodes = [];

  const anchorRoot = ctx.anchorEqNode;
  const sub1Root = ctx.equationNode;
  if (!anchorRoot || !anchorRoot.slotCenters) return;
  if (!sub1Root || !sub1Root.slotCenters) return;

  const bigAnchorIdx = aIsBig ? 0 : 2;
  const smallAnchorIdx = aIsBig ? 2 : 0;
  const anchorSizes = anchorRoot.slotSizes;
  const sub1Sizes = sub1Root.slotSizes;

  const draw = (fromIdx, toIdx, color) => {
    if (toIdx == null) return;
    if (anchorRoot.slotCenters[fromIdx] == null) return;
    if (sub1Root.slotCenters[toIdx] == null) return;
    const node = drawLink(ctx.k, ctx.arrowsRoot,
      { x: anchorRoot.slotCenters[fromIdx],
        y: anchorRoot.slotY + anchorSizes[fromIdx] / 2 },
      { x: sub1Root.slotCenters[toIdx],
        y: sub1Root.slotY - sub1Sizes[toIdx] / 2 },
      color);
    ctx.arrowNodes.push(node);
  };

  // Two arrows from anchor's small → sub1's need/rest slots (always).
  draw(smallAnchorIdx, needIdx, COL_NEED);
  draw(smallAnchorIdx, restIdx, COL_REST);
  // Third arrow from anchor's big → sub1's big slot, only when sub1
  // actually carries the big as a literal (aIsBig step 2/3/4, aIsSmall
  // step 4 with the swap variant).
  if (bigIdx != null) draw(bigAnchorIdx, bigIdx, COL_BIG);
}

// Two ten-frames side by side, ordered to match the persistent anchor
// above: round.a's frame on the LEFT, round.b's frame on the RIGHT.
// The cell count is what the kid counts — the equations below (anchor
// + sub1) already carry the actual numbers in colored text, so per
// user feedback 2026-08-11 ("方格子上数字不要展示了，多余") we skip
// the redundant text labels above the frames.
//
// Per user feedback 2026-08-11: for aIsSmall rounds like 6+9, the
// frames used to show 9-on-left / 6-on-right (always big-on-left
// regardless of anchor order). That broke the visual link between the
// frame and the colored digit above it — the kid sees "6 (pink) + 9
// (blue) = □" up top but two frames whose cell counts don't line up
// left-to-right with the addends. Now frames always preserve round
// order, matching the anchor.
//
// Shown on every step (including step 1, so the child can SEE that 8
// > 5 before being asked to compare). Frames are recreated per call;
// ctx.frameA/ctx.frameB track the previous render so it can be
// destroyed cleanly.
//
// Layout notes (canvas is 1366x1024):
//   ← back button sits at y=92
//   step bar at y=84, h=36 → spans y=84..y=120
//   (frame labels removed per 2026-08-11 — the cells + colored numbers
//    in the equations below carry the same info without redundancy)
//   frames sit at y=275 with cell=42, gap=4 — height 2*42+4=88, so they
//   span y=231..y=319
//   anchor sits at y=420 size 90 (below frames per 2026-08-10 user feedback)
//   sub1 (split/calc equation) sits at y=560 size 82
//   sub2 (friend / sub-split equation) sits at y=720 size 60 — only present
//   in steps 2 and 3; removed in step 4 once the kid has confirmed the split
//   buttons sit at y=838
function tenFramePair(ctx, round) {
  const { k } = ctx;

  if (ctx.frameA) ctx.frameA.destroy();
  if (ctx.frameB) ctx.frameB.destroy();
  // No frame labels — the equations below show the numbers in color,
  // and the frames themselves encode the count via filled cells. Per
  // user feedback 2026-08-11 ("方格子上数字不要展示了，多余").

  // Left frame shows round.a, right frame shows round.b — matching the
  // anchor's "round.a + round.b = □" order above. For aIsBig rounds
  // (round.a is the bigger addend) the left frame is the bigger one;
  // for aIsSmall rounds (round.a is the smaller addend) the left frame
  // is the smaller one. This preserves the visual left-to-right link
  // between the colored digit and its frame.
  ctx.frameA = tenFrame(k, round.a, {
    x: LAYOUT.barX - 180, y: 275,
    rows: 2, cell: 42, gap: 4, showLabel: false,
  });
  ctx.frameB = tenFrame(k, round.b, {
    x: LAYOUT.barX + 180, y: 275,
    rows: 2, cell: 42, gap: 4, showLabel: false,
  });
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

// Step 4 SWAP variant — fires whenever the smaller addend comes first
// (round.a < round.b, e.g. 6+7, 6+9). The aIsSmall visual layout shows
// "rest + need + b" preserving the question's original order so the
// step-4 calc reads the same way as the step-2/3 decomposition the kid
// just confirmed. The canonical l2-s4 audio says "big + need + rest"
// — that's the right ordering for aIsBig rounds but it's a different
// visual order from what the aIsSmall kid sees. The "s" suffix marks
// the swapped text variant ("rest + need + big"). Used for ALL
// aIsSmall rounds (rest === need too — e.g. 6+7 splits 6→3+3 and the
// visual reads "3+3+7", not "7+3+3"). Previous logic excluded
// rest === need ("both orderings are visually identical") but that's
// wrong: "7+3+3" and "3+3+7" sit in different slot positions even
// when the digits are commutative. That gap left 6+7, 4+8, 2+9
// playing the canonical "7+3+3" audio over a "3+3+7" visual.
function buildL2Step4SwapIds(a, b, big, small, need, rest) {
  if (!(a < b)) return null;
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

// Helper — build the persistent step-1 comparison equation ("a □ b").
// Kept around for the reveal branch in step 1's onAdvance.
function compareSlots(leftIsBig) {
  const slots = ["a", "□", "b"];
  return {
    slots,
    colors: leftIsBig
      ? [COL_BIG, undefined, COL_SMALL]
      : [COL_SMALL, undefined, COL_BIG],
  };
}

export default createRoundScene({
  levelId: 4,
  sceneName: "level4",
  // 36 ordered (a, b) pairs from data/pools.js. roundScene samples 6
  // on first entry; each play sees a different mix. sampleSize MUST
  // equal DAILY_CAPS[4] (6) so a single play-through finishes today's
  // quota in one go.
  // 2026-08-16: per user "把十以内的减法放到level1，其它的依次移动一个
  // level", this 凑十法 level moved from L3 to L4. levelId/poolGens/
  // sceneName updated to match. The cue ID prefix (`l2-*`) is historical
  // — when this was L2 before the four-way split — and stays unchanged
  // because the per-round MP3 files are baked under those names.
  poolGen: () => poolGens[4](),
  sampleSize: 6,
  // No intro cue — the persistent anchor ("a + b = □") IS the introduction.
  // A "make ten" voice on entry would just say the same thing twice.
  stepLabels: ["比一比", "凑成十", "拆一拆", "算一算"],

  steps: [
    // Step 1 — Compare. Every L2 round is make-ten, so this step asks
    // the kid to pick > / < between the two addends. The 4-step
    // scaffolding (compare → split-intro → split-confirm → count)
    // applies to every round.
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
    //
    // Per user feedback (2026-08-11): unknowns now render as outlined
    // square boxes (□) instead of "?" text. The compare □ between the
    // two numbers is the unknown sign; the kid picks > or < and the box
    // reveals the chosen symbol.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const isEqual = round.a === round.b;
      const leftIsBig = round.a > round.b;
      // Frames are visible from step 1 — the child needs to SEE the two
      // counts before picking > / <, not just read the numbers.
      tenFramePair(ctx, round);
      // Persistent anchor at top, big.
      ctx.setAnchorEquation(anchorSlots(round, "□"), { y: 420, boxMode: true });
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
          equationOpts: { y: 560, size: 82 },
          noQuestionDelay: 1.0,
        };
      }
      // Per-step audio prompt. "我们来计算 a 加 b 等于几，先比一比，
      // a 还是 b 谁大" — uses round.a / round.b in their original
      // order so the prompt matches the visible equation above.
      fireL2StepAudio(ctx, buildL2Step1Ids(round.a, round.b), 1);
      // Keep round.a on the LEFT, round.b on the RIGHT. COL_BIG lives
      // on whichever slot holds the bigger addend — so for 6+7 the
      // sub-question reads "6 [□] 7" with 6 pink and 7 blue, and the
      // correct pick is "<" (leftIsBig is false here).
      const slots = [round.a, "□", round.b];
      const colors = leftIsBig
        ? [COL_BIG, undefined, COL_SMALL]
        : [COL_SMALL, undefined, COL_BIG];
      // `compareReserve` pins slot 1 (the □ / sign slot) so the row
      // doesn't reflow when "□" reveals to ">" / "<". Box is 0.9 ×
      // size; the operator renders at OP_SCALE × size = 0.7 × 82 ≈
      // 57, so width = 57 × 0.4 = 22.8 px. Without the reserve, the
      // reveal shrinks slot 1 from ~74 px to ~23 px, shifting a and
      // b's centers inward (the row recenters too — total width
      // drops). Reserving slot 1 to "□" (= 0.9 × size) keeps the
      // reveal at the same slot width as the box: the operator text
      // sits centered in the same slot, and a/b centers don't move.
      const compareReserve = [null, "□", null];
      // After correct pick, the "□" slot fills with the picked sign
      // and turns COL_NEED (orange) so the eye sees the symbol as a
      // freshly-revealed piece of info, not part of the original
      // equation. Outer slots keep their COL_BIG/COL_SMALL.
      const revealColors = leftIsBig
        ? [COL_BIG, COL_NEED, COL_SMALL]
        : [COL_SMALL, COL_NEED, COL_BIG];
      const compareCorrect = leftIsBig ? ">" : "<";
      return {
        equation: { slots, colors, reserve: compareReserve },
        equationOpts: { y: 560, size: 82, boxMode: true },
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
          // After reveal the □ is replaced by the symbol — boxMode is
          // off so the slot renders as text, not a box. `reserve` mirrors
          // the step-1 setup's — slot 1 was laid out at the 0.9 × size
          // bucket ("□" reserved), so the operator text (smaller) sits
          // centered in the same slot without reflowing a/b.
          ctx.setEquation({
            slots: [round.a, compareCorrect, round.b],
            colors: revealColors,
            reserve: compareReserve,
            // `boxMode: true` is required to keep the slot-1 width
            // pinned at the box's 0.9 × size bucket after the reveal.
            // Without it, the reserve to "□" is evaluated with
            // boxMode=false (text width 0.62 × size) instead of
            // boxMode=true (box width 0.9 × size), so widths[1] shrinks
            // and the row recenters — shifting round.a and round.b's
            // centers by ~11 px. Per user feedback 2026-08-13:
            // "9和3都移动了，应该是 ◻ 只占了一个位置，但是 > 或者 <
            // 占位不一致".
          }, { y: 560, size: 82, boxMode: true });
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
    // Step 2 — Split + Friend.
    // The pedagogical core of make-a-ten: "the small addend can be split
    // into the part that makes the big ten (the friend) plus the rest".
    // The screen shows:
    //   anchor:  a + b = □
    //   sub1:    big + □ + □ = □          ← the split equation
    //   sub2:    big + □ = 10             ← the friend equation
    //   arrows:  anchor's big → sub1's big (vertical)
    //            anchor's small → sub1's two □ (split into 2 diagonals)
    // The kid picks the friend (need). After correct:
    //   sub1 → big + need + □ = □
    //   sub2 → big + need = 10
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const aIsBig = round.a >= round.b;
      const aIsSmall = !aIsBig;
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "□"), { y: 420, boxMode: true });
      // Per-step audio prompt. "大数是 big，我们找找 big 的好朋友，
      // 小朋友 big 的好朋友是几" — uses bigger(a, b) so it works
      // regardless of which addend is bigger in the round data.
      fireL2StepAudio(ctx, buildL2Step2Ids(big), 2);

      // sub1 — the split equation. Two layouts:
      //   aIsBig   "big + □ + □ = □"  — big first, then two boxes
      //                                    (need at index 2, rest at 4)
      //   aIsSmall "□ + □ + big = □"  — boxes first, then big. The
      //                                    friend (need) fills the
      //                                    middle (index 2), the rest
      //                                    box goes at index 0. Per
      //                                    user feedback 2026-08-11:
      //                                    "凑成十这一步有问题，当第一个
      //                                    数时小数时，如：4+7=？ 下面拆
      //                                    分成了？+？+4=？，应该是？+？+
      //                                    7=？。选中好朋友时，应该填充
      //                                    在中间。" The big literal at
      //                                    index 4 mirrors image 1's
      //                                    "big + friend + rest" pattern
      //                                    so the kid can read the math
      //                                    left-to-right once filled in.
      //
      // `sub1Reserve` pins the □-reveal slots (need/rest/answer) to
      // their widest lifetime content so the row never reflows as the
      // boxes reveal across steps 2 → 3 → 4. Same pattern as the L1
      // audit: the widest possible content for each slot is laid out
      // from the first render, every subsequent reveal sits centered
      // in the same slot. Without this, the step-2 onAdvance reveal
      // of slot 2 shrinks it from 0.9 × size to 0.62 × size — the
      // row recenters, slot centers shift, and the decomposition
      // arrows drawn from slotCenters (drawL2Arrows) drift a few
      // pixels left. The answer slot (slot 6) is reserved to
      // round.answer which is always 2 digits in L3's pool, so
      // max() at layout time covers both "□" and the revealed
      // 2-digit number — same pattern as L1's anchorSlots.
      const sub1Reserve = aIsSmall
        ? ["10", null, "10", null, null, null, round.answer]
        : [null, null, "10", null, "10", null, round.answer];
      let sub1Slots, sub1Colors, sub1RevealSlots, sub1RevealColors;
      let needIdx, restIdx, bigIdx;
      if (aIsSmall) {
        sub1Slots = ["□", "+", "□", "+", big, "=", "□"];
        sub1Colors = [
          COL_REST, undefined,
          COL_NEED, undefined,
          COL_BIG, undefined,
          undefined,
        ];
        sub1RevealSlots = ["□", "+", round.need, "+", big, "=", "□"];
        sub1RevealColors = [
          COL_REST, undefined,
          COL_NEED, undefined,
          COL_BIG, undefined,
          undefined,
        ];
        needIdx = 2;
        restIdx = 0;
        bigIdx = 4;
      } else {
        sub1Slots = [big, "+", "□", "+", "□", "=", "□"];
        sub1Colors = [
          COL_BIG, undefined,
          COL_NEED, undefined, COL_REST, undefined,
          undefined,
        ];
        sub1RevealSlots = [big, "+", round.need, "+", "□", "=", "□"];
        sub1RevealColors = [
          COL_BIG, undefined,
          COL_NEED, undefined, COL_REST, undefined,
          undefined,
        ];
        needIdx = 2;
        restIdx = 4;
        bigIdx = 0;
      }

      // sub2 — the friend equation. "big + □ = 10". Sits at y=720,
      // smaller (size 60) than sub1 so the eye reads sub1 as the main
      // decomposition and sub2 as a side-question that reinforces it.
      // `let` (not const) because step 2's onAdvance destroys and
      // rebuilds sub2 in-place to reveal the friend number after the
      // kid picks correctly — the body wrapper and the line markers
      // drawn in postRender stay anchored, so the decomposition
      // visualization persists through the reveal.
      //
      // `reserve: [null, null, "10", null, null]` pins slot 2 ("□") to
      // the 1.24 × size bucket so the box→friend reveal doesn't
      // reflow the row. Without it, slot 2 shrinks from 0.9 × size to
      // 0.62 × size on reveal and slot centers shift. Mirrored in
      // step 2 onAdvance's rebuilt sub2 below.
      const body = ctx.k.add([ctx.k.pos(0, 0)]);
      let sub2Root = expression(body, {
        x: LAYOUT.barX,
        y: 720,
        size: 60,
        boxMode: true,
        slots: [big, "+", "□", "=", TEN],
        colors: [COL_BIG, undefined, undefined, undefined, COL_TEN],
        reserve: [null, null, "10", null, null],
      });

      return {
        equation: { slots: sub1Slots, colors: sub1Colors, reserve: sub1Reserve },
        equationOpts: { y: 560, size: 82, boxMode: true },
        body: body,
        question: {
          correct: round.need,
          values: options(round.need, { min: 0, max: TEN, prefer: [round.rest] }),
        },
        // postRender runs AFTER setEquation has rendered sub1 — at
        // that point ctx.equationNode.slotCenters is sub1's layout
        // and ctx.anchorEqNode.slotCenters is the anchor's. Draw the
        // decomposition arrows (orange: anchor's small → sub1's need,
        // purple: anchor's small → sub1's rest, blue: anchor's big →
        // sub1's big when sub1 has a big literal). The arrows are
        // attached to ctx.arrowsRoot (persistent across steps 2→3→4)
        // so they survive the body wrapper teardown at step transition.
        // Per user feedback 2026-08-11: "拆一拆这一步时，拆分的线不
        // 要消失。算一算的时候也要保留。" — they stay visible through
        // step 4.
        postRender: (ctx) => {
          drawL2Arrows(ctx, aIsBig, needIdx, restIdx, bigIdx);
        },
        // After correct pick, the friend's box (sub1's needIdx) becomes
        // the friend number, and sub2's box becomes the friend number
        // too — both equations now show the friend's slot in the split
        // and the friend equation proper. The rest box in sub1 stays
        // unknown; that becomes the answer to step 3.
        //
        // The body wrapper is NOT recreated — only sub2 is. The arrow
        // line markers (drawn in postRender) live in ctx.arrowsRoot so
        // they persist through this reveal even though sub1's slot 2
        // changed from □ to friend. roundScene's clearBody() handles
        // full teardown when the step transitions to step 3.
        onAdvance: () => {
          ctx.setEquation({
            slots: sub1RevealSlots,
            colors: sub1RevealColors,
            // `reserve` mirrors the step-2 setup's — slot 2 was laid
            // out at the 1.24 × size bucket ("□" reserved to "10"),
            // so revealing to round.need (1 digit) sits centered in
            // the same slot. Without this the reveal shrinks the slot
            // and shifts every other center.
            reserve: sub1Reserve,
          }, { y: 560, size: 82, boxMode: true });
          sub2Root.destroy();
          sub2Root = expression(body, {
            x: LAYOUT.barX,
            y: 720,
            size: 60,
            slots: [big, "+", round.need, "=", TEN],
            colors: [COL_BIG, undefined, COL_NEED, undefined, COL_TEN],
            // sub2's slot 2 reveals from "□" → round.need (1 digit).
            // Reserve to "10" so the row doesn't reflow when the box
            // becomes the friend number.
            reserve: [null, null, "10", null, null],
          });
        },
      };
    },
    // Step 3 — Confirm the split.
    // The kid has identified the friend. Now they need to find the
    // rest — the part of the small that wasn't the friend. sub1
    // carries over from step 2 with the friend already revealed
    // (first □ became the friend number); sub2 changes from
    // "big + □ = 10" (which the kid just confirmed) to
    // "friend + □ = small" (the new sub-split equation). The visual
    // reminds them that the small = friend + rest, and the audio
    // asks them to pick the rest.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const aIsBig = round.a >= round.b;
      // `aIsSmall` is referenced below for the sub1Reserve shape and
      // the slot-order branches — without this declaration, step 3
      // throws `ReferenceError: aIsSmall is not defined` when the row
      // is first rendered, the entire step render is aborted, and
      // the split-option buttons never appear. Per user feedback
      // 2026-08-13: "在拆一拆的时候，播报完 6能分成1和几之后，没有
      // 出现选项." Step 2 declares aIsSmall explicitly; step 3 had
      // only aIsBig (looks like a copy-paste from step 4, where
      // aIsSmall is the primary).
      const aIsSmall = !aIsBig;
      const { options: splitOpts, correct } = buildSplitOptions(
        small, round.need, round.rest,
      );
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "□"), { y: 420, boxMode: true });
      // Per-step audio prompt. "small 需要拆一拆， small 能分成 need
      // 和几？" — short, just enough to anchor what the child is
      // picking. Step 2 already covered who the friend is.
      fireL2StepAudio(ctx, buildL2Step3Ids(small, round.need), 3);

      // sub1 — the split equation, carried over from step 2 with
      // the friend (round.need) already revealed. The rest box and
      // the answer box stay as □ for now. Same aIsSmall swap as step 2:
      //   aIsBig:   "big + need + □ = □"     (need at 2, rest at 4, big at 0)
      //   aIsSmall: "□ + need + big = □"     (need at 2, rest at 0, big at 4)
      //
      // `sub1Reserve` is the same shape as step 2's — slot 4 (aIsBig)
      // or slot 0 (aIsSmall) reveals "□" → round.rest (1 digit), and
      // slot 6 still reveals to round.answer (2 digits) in step 4.
      // Without reserving, the step-3 onAdvance reveal of the rest
      // box shrinks its slot from 0.9 × size to 0.62 × size and
      // shifts every other center (including the already-revealed
      // need slot, whose arrow endpoint is what the decomposition
      // visualization points at). The shape is identical to step 2's
      // sub1Reserve — only the slot content at index 2 changes (need
      // is already revealed here), but reserve is per-slot-index so
      // we can reuse the same shape.
      const sub1Reserve = aIsSmall
        ? ["10", null, "10", null, null, null, round.answer]
        : [null, null, "10", null, "10", null, round.answer];
      let sub1Slots, sub1Colors, sub1RevealSlots, sub1RevealColors;
      let needIdx, restIdx, bigIdx;
      if (aIsBig) {
        sub1Slots = [big, "+", round.need, "+", "□", "=", "□"];
        sub1Colors = [
          COL_BIG, undefined,
          COL_NEED, undefined, COL_REST, undefined,
          undefined,
        ];
        sub1RevealSlots = [big, "+", round.need, "+", round.rest, "=", "□"];
        sub1RevealColors = [
          COL_BIG, undefined,
          COL_NEED, undefined, COL_REST, undefined,
          undefined,
        ];
        needIdx = 2;
        restIdx = 4;
        bigIdx = 0;
      } else {
        sub1Slots = ["□", "+", round.need, "+", big, "=", "□"];
        sub1Colors = [
          COL_REST, undefined,
          COL_NEED, undefined,
          COL_BIG, undefined,
          undefined,
        ];
        sub1RevealSlots = [round.rest, "+", round.need, "+", big, "=", "□"];
        sub1RevealColors = [
          COL_REST, undefined,
          COL_NEED, undefined,
          COL_BIG, undefined,
          undefined,
        ];
        needIdx = 2;
        restIdx = 0;
        bigIdx = 4;
      }

      // sub2 — the new sub-split equation "friend + □ = small". The
      // kid picks the rest (round.rest); the box reveals to that.
      // `let` for the same in-place update reason as step 2.
      //
      // `reserve: [null, null, "10", null, null]` pins slot 2 ("□")
      // so the box→round.rest reveal doesn't reflow the row. Same
      // shape as the step-2 sub2.
      const body = ctx.k.add([ctx.k.pos(0, 0)]);
      let sub2Root = expression(body, {
        x: LAYOUT.barX,
        y: 720,
        size: 60,
        boxMode: true,
        slots: [round.need, "+", "□", "=", small],
        colors: [COL_NEED, undefined, undefined, undefined, COL_SMALL],
        reserve: [null, null, "10", null, null],
      });

      return {
        equation: { slots: sub1Slots, colors: sub1Colors, reserve: sub1Reserve },
        equationOpts: { y: 560, size: 82, boxMode: true },
        body: body,
        question: {
          correct,
          values: splitOpts,
        },
        // Re-draw the decomposition arrows in this step's postRender
        // so they persist from step 2 through step 3. The previous
        // arrow set is destroyed inside drawL2Arrows; the new set
        // points at the now-revealed sub1 slots (need is filled in,
        // rest is still a box). Per user feedback 2026-08-11: "拆一
        // 拆这一步时，拆分的线不要消失。"
        postRender: (ctx) => {
          drawL2Arrows(ctx, aIsBig, needIdx, restIdx, bigIdx);
        },
        // After correct pick: sub1's rest box → round.rest, sub2's box
        // → round.rest (so both show the same decomposition:
      // "big + friend + rest" and "friend + rest = small"). The
      // answer box in sub1 stays unknown; that becomes step 4.
        // Same in-place sub2 update as step 2: destroy the old sub2
        // (cascading through the same body wrapper), create the
        // revealed sub2 in the same body. The body itself stays.
        onAdvance: () => {
          ctx.setEquation({
            slots: sub1RevealSlots,
            colors: sub1RevealColors,
            // `reserve` mirrors the step-3 setup's — slot 4 (aIsBig)
            // or slot 0 (aIsSmall) was laid out at the 1.24 × size
            // bucket ("□" reserved to "10"), so revealing to round.rest
            // (1 digit) sits centered in the same slot. Without it,
            // the rest slot shrinks and shifts every other center
            // including the need slot's arrow endpoint.
            reserve: sub1Reserve,
          }, { y: 560, size: 82, boxMode: true });
          sub2Root.destroy();
          sub2Root = expression(body, {
            x: LAYOUT.barX,
            y: 720,
            size: 60,
            slots: [round.need, "+", round.rest, "=", small],
            colors: [COL_NEED, undefined, COL_REST, undefined, COL_SMALL],
            // Step-3 sub2: "friend + □ = small". Slot 2 reveals from
            // "□" → round.rest (1 digit). Same reserve shape as the
            // step-2 sub2 — locks slot 2 at the 1.24 × size bucket.
            reserve: [null, null, "10", null, null],
          });
        },
      };
    },
    // Step 4 — Count: big + need + rest = □
    // The split is fully revealed: sub1 now reads "big + need + rest
    // = □". sub2 disappears — the kid has finished the pedagogical
    // scaffolding (compare → split → confirm → count) and only needs
    // to count up. The kid picks the total. After correct, the
    // anchor and sub1 both reveal at once: "a + b = answer" and
    // "big + need + rest = answer".
    //
    // No arrows in step 4 — the decomposition was already shown in
    // step 2 (anchor → split), and step 3's sub-split was the last
    // pedagogical step. Now the kid just counts.
    (ctx, round) => {
      const big = bigger(round.a, round.b);
      const small = smaller(round.a, round.b);
      const aIsSmall = round.a < round.b;
      const aIsBig = !aIsSmall;
      tenFramePair(ctx, round);
      ctx.setAnchorEquation(anchorSlots(round, "□"), { y: 420, boxMode: true });
      // Per-step audio prompt. The two layouts have two matching audio
      // cues:
      //   aIsBig:   "small 分成 need 加 rest，算一算 big 加 need 加 rest
      //             等于几" — matches the canonical "big + need + rest"
      //             visual
      //   aIsSmall: "small 分成 rest 加 need，算一算 rest 加 need 加 big
      //             等于几" — matches the swap-variant "rest + need +
      //             big" visual so the spoken sentence lines up with
      //             what the kid sees
      // buildL2Step4SwapIds returns null when no swap is needed
      // (aIsBig, or rest == need), falling back to the canonical
      // buildL2Step4Ids.
      fireL2StepAudio(
        ctx,
        buildL2Step4SwapIds(round.a, round.b, big, small, round.need, round.rest)
          || buildL2Step4Ids(big, small, round.need, round.rest),
        4,
      );
      // Pre-answer equation + reveal-equation slot/color pairs. The
      // two cases differ by slot order — aIsSmall uses rest-first
      // ("rest + need + big") to preserve the decomposition order the
      // kid just confirmed in step 3; aIsBig keeps big-first because
      // there's no swap to compensate for. Per user feedback
      // 2026-08-11: "当第一个数时小数时，为什么到算一算这一步时，要换
      // 数字的顺序" — the calc equation should read the same way as
      // the step-2/3 decomposition so the kid can see it's the same
      // math, just written out fully.
      // Arrow indices for the postRender pass:
      //   aIsBig:   sub1 = "big + need + rest"    — bigIdx=0, needIdx=2, restIdx=4
      //   aIsSmall: sub1 = "rest + need + big"    — restIdx=0, needIdx=2, bigIdx=4
      //
      // `sub1Reserve` is the same shape as step 2/3's — slot 6
      // reveals "□" → round.answer (2 digits, always in L3's pool).
      // The reserve is what makes the step-4 reveal NOT reflow the
      // row: without it, slot 6 widens from 0.9 × size ("□") to 1.24
      // × size (2 digits), shifting the whole calc row leftward and
      // breaking the visual continuity with the step-2/3 split
      // equations. Same `round.answer` value is reused across all
      // three steps' reserves so the layout is pixel-identical.
      const sub1Reserve = aIsSmall
        ? ["10", null, "10", null, null, null, round.answer]
        : [null, null, "10", null, "10", null, round.answer];
      let eqSlots, eqColors, revealSlots, revealColors;
      let needIdx, restIdx, bigIdx;
      if (aIsSmall) {
        eqSlots = [round.rest, "+", round.need, "+", round.b, "=", "□"];
        eqColors = [COL_REST, undefined, COL_NEED, undefined, COL_BIG, undefined, undefined];
        revealSlots = [round.rest, "+", round.need, "+", round.b, "=", round.answer];
        revealColors = [COL_REST, undefined, COL_NEED, undefined, COL_BIG, undefined, INK];
        needIdx = 2;
        restIdx = 0;
        bigIdx = 4;
      } else {
        eqSlots = [round.a, "+", round.need, "+", round.rest, "=", "□"];
        eqColors = [COL_BIG, undefined, COL_NEED, undefined, COL_REST, undefined, undefined];
        revealSlots = [round.a, "+", round.need, "+", round.rest, "=", round.answer];
        revealColors = [COL_BIG, undefined, COL_NEED, undefined, COL_REST, undefined, INK];
        needIdx = 2;
        restIdx = 4;
        bigIdx = 0;
      }

      return {
        equation: {
          slots: eqSlots,
          colors: eqColors,
          reserve: sub1Reserve,
        },
        equationOpts: { y: 560, size: 82, boxMode: true },
        // No body in step 4 — sub2 disappears. The kid only sees the
        // calc equation below the anchor. roundScene's clearBody()
        // tears down step 3's sub-split wrapper when this step starts.
        question: {
          correct: round.answer,
          values: options(round.answer, { min: TEN, max: 20, count: 4 }),
        },
        // Re-draw the decomposition arrows so they persist into
        // step 4. The previous set (from step 3) is destroyed; the
        // new set points at the calc equation's decomposition slots.
        // Per user feedback 2026-08-11: "算一算的时候也要保留。"
        postRender: (ctx) => {
          drawL2Arrows(ctx, aIsBig, needIdx, restIdx, bigIdx);
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
          ctx.setAnchorEquation(anchorSlots(round, round.answer), { y: 420 });
          ctx.setEquation({
            slots: revealSlots,
            colors: revealColors,
            // `reserve` mirrors the step-4 setup's — slot 6 was laid
            // out at the 1.24 × size bucket ("□" reserved to
            // round.answer's 2-digit width), so revealing to
            // round.answer sits in the same slot. Without it, the
            // row would widen and recenter on the final reveal.
            reserve: sub1Reserve,
          }, { y: 560, size: 82 });
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
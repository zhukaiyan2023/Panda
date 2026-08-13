// scenes/gameCloud.js — 3-number addition (cloud game from panda-park).
//
// Five rounds, alternating between two types:
//   1. 凑十 (make10):     three addends where two sum to 10. Total in
//                          [11, 19]. Equation: "a + b + c = ?" then on
//                          correct, "10 + c = total" — emphasizes the
//                          make-10 strategy.
//   2. 凑小 (makeSmall):  three addends summing to < 10. Equation:
//                          "a + b + c = ?" then "a + b + c = total".
//
// Each round displays the equation at the top and FOUR cloud answer
// choices — one correct, three plausible wrongs (within ±3 of the right
// answer). The kid reads the equation, mentally computes the sum, and
// taps the cloud with the correct answer.
//
// Example (user-provided):
//   题目: 2 + 3 + 3 = ?
//   答案: 8 (correct), 9, 10, 11
//
// Wrong taps shake + grey out (kid can keep trying). Correct taps
// celebrate the cloud, resolve the equation, and end the round.

import item from "../components/pickerItem.js?v=20260813";
import panda from "../components/panda.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";
import { iconButton } from "../components/choice.js?v=20260812";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260812";
import { celebrate } from "../components/celebration.js?v=20260812";
import {
  INK, FONT, ORANGE, ORANGE_DEEP, PINK, BLUE, SUCCESS, YELLOW,
} from "../components/theme.js?v=20260812";

const ROUND_COUNT = 5;
const ROUND_TYPES = ["make10", "makeSmall", "make10", "makeSmall", "make10"];
// Single-digit pairs whose sum is exactly 10 — 凑十法's "friends of 10".
// Used by the make10 round type so the kid can apply the make-ten strategy:
// the pair → 10, then 10 + decoy = total. Pairs are listed in both orders so
// addends[0,1] come up small-then-big ~half the time and big-then-small the
// rest, giving the equation visual variety without affecting the math.
const PAIRS_EQ10 = [
  [1, 9], [2, 8], [3, 7], [4, 6], [5, 5],
  [9, 1], [8, 2], [7, 3], [6, 4],
];

let roundIdx = 0;
// Streak of consecutive correct picks across this game's session —
// drives the process-praise tier in tryAnswer. Resets on wrong pick
// or when the kid taps ←.
let streak = 0;
// Sticky flag flipped on the first wrong pick this session. Used by
// pickCheerCue to gate enc-streak5-1 ("你试了好几次才对，这叫有耐心")
// — its text only makes sense if the kid actually missed at least once.
// Never resets.
let hadWrongs = false;

function shuffle(arr) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

function saveProgress(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, levelId + 1);
  save.starsByGame = save.starsByGame || {};
  save.starsByGame[levelId] = (save.starsByGame[levelId] || 0) + 1;
  window.PandaSave?.save(save);
}

// Pick `count` unique wrong answers within [lo, hi] — `correct` is excluded.
// Tries random offsets first (so wrong values look like common miscalculations
// — off by 1, off by 2, etc.), then falls back to a deterministic sweep
// through ±1, ±2, ±3 if random picks keep colliding.
function pickWrongs(correct, count, lo, hi, offsets) {
  const wrongs = [];
  let attempts = 0;
  while (wrongs.length < count && attempts < 120) {
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    const w = correct + offset;
    if (w >= lo && w <= hi && w !== correct && !wrongs.includes(w)) {
      wrongs.push(w);
    }
    attempts++;
  }
  // Deterministic fallback: walk ±1, ±2, ±3, ... until we hit `count`.
  if (wrongs.length < count) {
    for (let d = 1; d <= 5 && wrongs.length < count; d++) {
      for (const sign of [-1, 1]) {
        const w = correct + sign * d;
        if (w >= lo && w <= hi && w !== correct && !wrongs.includes(w)) {
          wrongs.push(w);
          if (wrongs.length >= count) break;
        }
      }
    }
  }
  return wrongs.slice(0, count);
}

// Case 2 (凑十法): two addends sum to exactly 10 (a friend-of-10 pair),
// plus a 1-9 decoy. Total = 10 + decoy, in [11, 19]. Wrong answers in
// [9, 21] (avoid 0 and 22+). The correct = 10 + decoy form is the make-ten
// strategy itself — the resolved equation shows "10 + decoy = total" so
// the kid sees how the strategy works.
function buildMake10Round() {
  const pair = PAIRS_EQ10[Math.floor(Math.random() * PAIRS_EQ10.length)];
  const decoy = 1 + Math.floor(Math.random() * 9);
  // pair always sums to 10 by construction; written as 10 + decoy to make
  // the 凑十法 strategy visible at the call site.
  const correct = 10 + decoy;
  const addends = [pair[0], pair[1], decoy];
  const wrongs = pickWrongs(correct, 3, 9, 21, [-2, -1, 1, 2, 3]);
  return {
    type: "make10",
    pair: [pair[0], pair[1]],
    decoy,
    addends,
    answerChoices: shuffle([correct, ...wrongs]),
    correct,
  };
}

// Case 1 (凑小): three addends in [1, 5] summing to ≤ 10, no pair sums to
// 10. (With no zeros, the only way a pair could sum to 10 inside a ≤ 10
// total is if the third addend is 0 — so the "no pair sums to 10" check
// is implied by the sum ≤ 10 rule, but we keep it for clarity.)
// Wrong answers in [1, 11].
function buildMakeSmallRound() {
  let a, b, c;
  let attempts = 0;
  do {
    a = 1 + Math.floor(Math.random() * 5);
    b = 1 + Math.floor(Math.random() * 5);
    c = 1 + Math.floor(Math.random() * 5);
    attempts++;
    if (attempts > 60) break;
  } while (a + b + c > 10 || a + b === 10 || a + c === 10 || b + c === 10);
  const correct = a + b + c;
  const addends = [a, b, c];
  const wrongs = pickWrongs(correct, 3, 1, 11, [-2, -1, 1, 2]);
  return {
    type: "makeSmall",
    addends,
    answerChoices: shuffle([correct, ...wrongs]),
    correct,
  };
}

function buildRound(roundIdx) {
  const type = ROUND_TYPES[roundIdx % ROUND_TYPES.length];
  return type === "make10" ? buildMake10Round() : buildMakeSmallRound();
}

// === Celebration ========================================================
// On a correct tap: burst sparkles around the picked cloud. The cloud
// itself stays still — no scale pulse, no lift — so the kid's eye
// lands on the chosen answer without the picked object itself moving
// (2026-08-14 feedback: "选中时，云朵不要动了"). The bobbing float on
// every cloud is also gated off here via _hugged = true (set by the
// caller right before celebrateCorrect runs).
function celebrateCorrect(k, it) {
  for (let s = 0; s < 6; s++) {
    const sparkle = k.add([
      k.text("✨", { size: 36 }),
      k.color(...ORANGE),
      k.pos(
        it.x + (Math.random() - 0.5) * 140,
        it.y + (Math.random() - 0.5) * 140,
      ),
      k.anchor("center"),
      k.opacity(0),
      k.z(5),
    ]);
    const delay = 0.2 + Math.random() * 0.4;
    k.wait(delay, () => {
      k.tween(0, 1, 0.2, (v) => { sparkle.opacity = v; });
      k.wait(0.5, () => {
        k.tween(1, 0, 0.3, (v) => { sparkle.opacity = v; });
      });
    });
  }
}

export default function scene(k) {
  if (roundIdx === 0) window.PandaAudio.playCue("cloud-intro");

  const round = buildRound(roundIdx);

  // === Background ===
  sceneBg(k, "bg-meadow");

  // === HUD (back + round pill) ==========================================
  iconButton(k, {
    label: "←", x: 84, y: 110, w: 96, h: 72, fontSize: 44,
    onClick: () => {
      roundIdx = 0;
      streak = 0;
      k.go("gamesPicker");
    },
  });
  const pillW = 240;
  const pillH = 64;
  const pillX = k.width() - 84 - pillW / 2;
  const pillY = 110;
  k.add([
    k.rect(pillW, pillH, { radius: 18 }),
    k.color(255, 255, 255),
    k.outline(4, k.rgb(...ORANGE)),
    k.pos(pillX, pillY),
    k.anchor("center"),
    k.z(2),
  ]);
  k.add([
    k.text(`第 ${roundIdx + 1} 轮 / 共 ${ROUND_COUNT} 轮`, { size: 26, font: FONT }),
    k.color(...ORANGE),
    k.pos(pillX, pillY),
    k.anchor("center"),
    k.z(2),
  ]);

  // === Title (the equation IS the title — the problem the kid reads) ==
  // Rendered big at the top of the screen, no surrounding strip. The hint
  // sits beneath it as a smaller subtitle. Per user feedback 2026-08-09:
  // the equation needs to read as a "标题" — a clear problem statement
  // — not as a tiny element inside a goal strip.
  const titleY = 200;

  // Equation: "a + b + c = ?" — addends in shuffled order.
  let currentEq = expression(k, {
    slots: [
      round.addends[0], "+", round.addends[1], "+", round.addends[2], "=", "?",
    ],
    x: 748, y: titleY, size: 96,
    colors: [BLUE, undefined, SUCCESS, undefined, ORANGE_DEEP, undefined, PINK],
  });

  // Initial hint — per round type, sits below the title.
  const initialHint = round.type === "make10"
    ? "凑十再加 — 哪个云朵是对的？"
    : "把它们加起来 — 哪个云朵是对的？";
  const hint = k.add([
    k.text(initialHint, { size: 32, font: FONT }),
    k.color(...PINK),
    k.opacity(0.85),
    k.pos(748, 360),
    k.anchor("center"),
    k.z(2),
  ]);

  function setEquation(slots, colors) {
    if (currentEq) currentEq.destroy();
    currentEq = expression(k, {
      slots,
      x: 748, y: titleY, size: 96,
      colors,
    });
  }

  function setHint(text) {
    hint.text = text;
  }

  // === Cloud row (1 × 4) showing 4 answer choices =====================
  // Per user feedback 2026-08-09: 4 choices (correct + 3 plausible wrongs),
  // shuffled so the correct answer isn't always at the start. cellW 300
  // places the leftmost cloud at x=298 and rightmost at x=1198, leaving
  // ~170 px of canvas margin on each side.
  const COLS = 4;
  const cellW = 300;
  const gridX = 748 - ((COLS - 1) * cellW) / 2;
  const gridY = 640;
  const items = [];
  round.answerChoices.forEach((v, i) => {
    const x = gridX + i * cellW;
    const y = gridY;
    const it = item(k, {
      value: v,
      sprite: "cloud",
      x,
      y,
      size: 180,
      // cloud.png is 806×610 — the default 0.6 scale gave a 484-px bounding
      // box that overlapped heavily at cellW 300 (2026-08-12 feedback). 0.4
      // dropped to 322 px but the user said the cloud was still slightly big
      // for the row (2026-08-12 follow-up). 0.32 → 258 px bounding box,
      // leaving ~42 px between adjacent clouds so the four choices read as
      // four separate choices, not a wall of white.
      spriteScale: 0.32,
      // Cloud body is sprite-centered; anchored at (x, y-16) the body lands
      // at scene y-16. Pass that as the label offset so the digit sits in
      // the middle of the cloud.
      labelYOffset: -16,
      hideFace: true,
      noLabelBg: true,
      noLabelBgTextColor: INK,
      noLabelBgStrokeColor: [255, 255, 255],
    });
    it._baseY = it.node.pos.y;
    it._phase = Math.random() * Math.PI * 2;
    it._hugged = false;
    it.node.onUpdate(() => {
      if (it._hugged) return;
      it.node.pos.y = it._baseY + Math.sin((k.time() + it._phase) * 1.6) * 8;
    });
    items.push(it);
  });

  // === Click wiring ====================================================
  const state = { done: false };

  function tryAnswer(idx) {
    if (state.done) return;
    const it = items[idx];

    if (it.value === round.correct) {
      // Correct — celebrate, dim the others, resolve the equation.
      state.done = true;
      items.forEach((other, i) => {
        other._hugged = true;
        if (i !== idx) other.setDisabled(true);
      });
      celebrateCorrect(k, it);

      k.wait(0.5, () => {
        if (round.type === "make10") {
          // Resolved equation: collapse the pair into "10", keep the decoy,
          // show the total. This is the 凑十法 strategy rendered as math —
          // pair → 10, 10 + decoy = total. The kid sees their own
          // strategy written out. Colors map "10" → SUCCESS (the pair's
          // resolved value), decoy → ORANGE_DEEP (its original color),
          // total → PINK.
          setEquation(
            [10, "+", round.decoy, "=", round.correct],
            [SUCCESS, undefined, ORANGE_DEEP, undefined, PINK],
          );
        } else {
          // makeSmall: just the resolved sum.
          setEquation(
            [round.addends[0], "+", round.addends[1], "+", round.addends[2], "=", round.correct],
            [BLUE, undefined, SUCCESS, undefined, ORANGE_DEEP, undefined, PINK],
          );
        }
        setHint("对啦！");
      });

      buddy.setMood("cheer", { silent: true });
      // game-specific "对啦" fires immediately on the picked cloud.
      window.PandaAudio.playCue("cloud-pair");
      // Tier-based cheer chain (audio/praise.js) follows after the
      // game-specific cue lands. The chain is the new "好棒" replacement:
      //   first    → [enc-first-N]
      //   streak3+ → [enc-streak3-N, panda-praise-N]  (etc.)
      //   level    → [enc-level-N, panda-cheer-N]
      // The old pattern chained only ["panda-celebrate"] — the new chain
      // already includes the panda voice on streak-3+ or level-complete,
      // so no extra playAfter → panda-cue is needed.
      streak += 1;
      const { chain, lastEncourageId, tier } = pickCheerCue({
        streak,
        isRoundComplete: true,  // cloud: 1 pick per round = always round-end
        levelId: 3,
        hasDiscovery: false,
        // Gate enc-streak5-1 on the kid having actually missed before
        // — see the `let hadWrongs` declaration above.
        hadWrongs,
      });
      window.PandaAudio.playAfter("cloud-pair", chain, {
        gapMs: 200,
        seqGapMs: 200,
      });
      // Visual celebration anchored at the picked cloud. cloud has its
      // own panda, so the level-complete hop animates THIS scene's
      // panda, not the roundScene one.
      celebrate(k, {
        tier,
        anchor: { x: it.node.pos.x, y: it.node.pos.y },
        pandaBody: buddy?.body,
        pandaBaseSize: 160,
      });

      window.PandaAudio.playAfter(
        lastEncourageId,
        ["cloud-done"],
        { gapMs: 0, seqGapMs: 0 },
        () => {
          // No victory modal (2026-08-14 feedback: 弹框太丑 / 去掉) —
          // just advance to the next round once the "cloud-done" cue
          // finishes. The kid's "yes!" feedback already came from the
          // sparkles + audio + panda hop fired above.
          if (roundIdx + 1 < ROUND_COUNT) {
            roundIdx += 1;
            k.go("gameCloud");
          } else {
            saveProgress(3);  // gameCloud is levelId 3; unlocks feed (id 4)
            roundIdx = 0;
            k.go("gamesPicker");
          }
        },
      );
    } else {
      // Wrong — shake + grey out + hint + wrong-answer voice. Kid can
      // keep trying on the remaining clouds.
      streak = 0;
      // Sticky flag: any future streak-5 cue can now include
      // enc-streak5-1's "你试了好几次才对，这叫有耐心" line.
      hadWrongs = true;
      it._hugged = true;
      it.shake();
      it.setDisabled(true);
      // Play an enc-wrong-N from the new tier system. setMood("think")
      // runs silent so the panda pose changes without doubling the
      // audio (the old "enc-try" cue that used to fire from
      // setMood("think") is gone).
      buddy.setMood("think", { silent: true });
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playCue(pickWrongCue());
      setHint("再想想！");
    }
  }

  items.forEach((it, idx) => {
    it.node.onClick(() => {
      if (state.done || it._hugged) return;
      tryAnswer(idx);
    });
  });

  // Panda at the bottom-left — same position as the panda-park reference.
  // (No click handler here — wrong picks don't reset, since the kid just
  // picks another cloud. The panda is a passive cheerleader.)
  const buddy = panda(k, { x: 130, y: 940, size: 160 });
}
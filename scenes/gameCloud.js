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

import item from "../components/pickerItem.js";
import panda from "../components/panda.js";
import expression from "../components/expression.js";
import { iconButton } from "../components/choice.js";
import {
  INK, PAPER, FONT, ORANGE, ORANGE_DEEP, PINK, BLUE, SUCCESS, YELLOW,
} from "../components/theme.js";

const ROUND_COUNT = 5;
const ROUND_TYPES = ["make10", "makeSmall", "make10", "makeSmall", "make10"];
// All single-digit pairs whose sum is > 10. Used by case 2 of the 3-number
// addition (凑十法). The user ruled out pairs whose sum is ≤ 10 and any
// pair with a non-single-digit addend.
const PAIRS_GT10 = [
  [2, 9], [3, 8], [3, 9], [4, 7], [4, 8], [4, 9],
  [5, 6], [5, 7], [5, 8], [5, 9], [6, 7], [6, 8], [6, 9],
  [7, 8], [7, 9], [8, 9],
];

let roundIdx = 0;

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

// Case 2 (凑十法): one of the three addends is a single-digit pair that
// sums to > 10, plus a 1-9 decoy. (User ruled out pairs ≤ 10 and any
// non-single-digit addend.) Total in [12, 27]. Wrong answers in [9, 30]
// (avoid 0 and 28+).
function buildMake10Round() {
  const pair = PAIRS_GT10[Math.floor(Math.random() * PAIRS_GT10.length)];
  const decoy = 1 + Math.floor(Math.random() * 9);
  const correct = pair[0] + pair[1] + decoy;
  const addends = [pair[0], pair[1], decoy];
  const wrongs = pickWrongs(correct, 3, 9, 30, [-2, -1, 1, 2, 3]);
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
// On a correct tap: scale-pulse the cloud and burst sparkles around it.
// Mirrors the boat game's reward beat so the kid feels a strong "yes!"
// without changing the round's chrome.
function celebrateCorrect(k, it) {
  const root = it.node;
  root.scale = k.vec2(1, 1);
  k.tween(1, 1.3, 0.15, (v) => { root.scale = k.vec2(v, v); });
  k.wait(0.15, () => {
    k.tween(1.3, 1, 0.18, (v) => { root.scale = k.vec2(v, v); });
  });
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

// === Victory modal ======================================================
function showVictory(k, total, isLastRound, onNext) {
  k.add([
    k.rect(k.width(), k.height()),
    k.color(0, 0, 0),
    k.opacity(0.4),
    k.pos(0, 0),
    k.z(40),
  ]);
  const cardW = 760;
  const cardH = 440;
  const cx = k.width() / 2;
  const cy = k.height() / 2;
  k.add([
    k.rect(cardW, cardH, { radius: 32 }),
    k.color(...YELLOW),
    k.outline(8, k.rgb(255, 255, 255)),
    k.pos(cx, cy),
    k.anchor("center"),
    k.z(41),
  ]);
  k.add([
    k.text("🌈", { size: 140 }),
    k.pos(cx, cy - 130),
    k.anchor("center"),
    k.z(42),
  ]);
  k.add([
    k.text(isLastRound ? "全部答对啦！" : "答对啦！", { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(cx, cy + 0),
    k.anchor("center"),
    k.z(42),
  ]);
  k.add([
    k.text(`答案是 ${total}！`, { size: 36, font: FONT }),
    k.color(...SUCCESS),
    k.pos(cx, cy + 70),
    k.anchor("center"),
    k.z(42),
  ]);
  iconButton(k, {
    label: isLastRound ? "完成 🏠" : "下一轮 ▶",
    x: cx, y: cy + 150, w: 360, h: 90, fontSize: 36,
    z: 43,
    onClick: onNext,
  });
}

export default function scene(k) {
  if (roundIdx === 0) window.PandaAudio.playCue("cloud-intro");

  const round = buildRound(roundIdx);

  // === Background ===
  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

  // === HUD (back + round pill) ==========================================
  iconButton(k, {
    label: "←", x: 84, y: 110, w: 96, h: 72, fontSize: 44,
    onClick: () => {
      roundIdx = 0;
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
      // Cloud body is sprite-centered at y=128 (256×256 sprite); anchored
      // at (x, y-16) scaled 0.6 the body lands at scene y-16. Pass that
      // as the label offset so the digit sits in the middle of the cloud.
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
          // Resolved equation: show the simple sum. (The original "10 +
          // decoy = total" trick is gone now that case-2 pairs sum to > 10,
          // not exactly 10.)
          setEquation(
            [round.addends[0], "+", round.addends[1], "+", round.addends[2], "=", round.correct],
            [BLUE, undefined, SUCCESS, undefined, ORANGE_DEEP, undefined, PINK],
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
      window.PandaAudio.playCue("cloud-pair");
      window.PandaAudio.playAfter("cloud-pair", ["panda-celebrate"], { gapMs: 200 });

      window.PandaAudio.playAfter(
        "panda-celebrate",
        ["cloud-done"],
        { gapMs: 0, seqGapMs: 0 },
        () => {
          showVictory(k, round.correct, roundIdx + 1 >= ROUND_COUNT, () => {
            if (roundIdx + 1 < ROUND_COUNT) {
              roundIdx += 1;
              k.go("gameCloud");
            } else {
              saveProgress(3);  // gameCloud is levelId 3; unlocks feed (id 4)
              roundIdx = 0;
              k.go("gamesPicker");
            }
          });
        },
      );
    } else {
      // Wrong — shake + grey out + hint. Kid can keep trying on the
      // remaining clouds.
      it._hugged = true;
      it.shake();
      it.setDisabled(true);
      buddy.setMood("think");
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
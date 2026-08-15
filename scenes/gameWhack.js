// scenes/gameWhack.js
//
// Fresh implementation of the whack-a-mole game based on the new visual
// direction: a bright meadow, a large equation card, a 3x2 field of oversized
// moles, numbers printed directly on each mole, and a predictable wave rhythm.
//
// Interaction contract:
//   1. Moles emerge from their holes on a visible beat.
//   2. Each mole stays up briefly, then retreats by itself.
//   3. The number belongs to the mole unit and never moves independently.
//   4. A correct tap locks the board until the whole reward + equation voice
//      finishes. The next question is never created while that chain is active.
//   5. A wrong tap only shakes the selected mole and plays one correction cue.

import panda from "../components/panda.js?v=20260816";
import { iconButton } from "../components/choice.js?v=20260816";
import sceneBg from "../components/sceneBg.js?v=20260816";
import expression from "../components/expression.js?v=20260816";
import whackHole from "../components/whackHole.js?v=20260816";
import { celebrate } from "../components/celebration.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";
import { buildQuestion, pickType } from "../data/whackRounds.js?v=20260816";
import { INK, PAPER, FONT, ORANGE, YELLOW, DANGER } from "../components/theme.js?v=20260816";

const BOARD_X = 748;
const TOP_Y = 575;
const BOTTOM_Y = 805;
const COL_GAP = 300;
const MOLE_POSITIONS = [
  [BOARD_X - COL_GAP, TOP_Y],
  [BOARD_X, TOP_Y],
  [BOARD_X + COL_GAP, TOP_Y],
  [BOARD_X - COL_GAP, BOTTOM_Y],
  [BOARD_X, BOTTOM_Y],
  [BOARD_X + COL_GAP, BOTTOM_Y],
];

const GAME_SECONDS = 30;
const MOLE_BEAT = [0.00, 0.34, 0.68, 1.02, 1.36, 1.70];
const CYCLE_SECONDS = 3.40;

let roundNumber = 0;
let streak = 0;
let correctCount = 0;
let previousQuestionKey = null;

function addPanel(k, x, y, w, h, fill, outline = INK) {
  return k.add([
    k.rect(w, h, { radius: 34 }),
    k.color(...fill),
    k.outline(5, k.rgb(...outline)),
    k.pos(x, y),
    k.anchor("center"),
  ]);
}

function addStar(k, x, y, active) {
  return k.add([
    k.sprite("star"),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(0.17),
    k.opacity(active ? 1 : 0.25),
    k.color(...(active ? ORANGE : INK)),
    k.z(30),
  ]);
}

function playRewardAndAnswer({ audio, currentQ, rewardChain, onComplete }) {
  const answerChain = [
    `n-${currentQ.a}`,
    "q-plus",
    `n-${currentQ.b}`,
    "equals",
    `n-${currentQ.answer}`,
  ];

  audio.stopAllAudio();
  audio.playSequence(
    ["whack-tap", ...rewardChain, ...answerChain],
    130,
    0,
    onComplete,
  );
}

function saveGameScore() {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, 6);
  save.starsByGame = save.starsByGame || {};
  const stars = correctCount >= 10 ? 3 : correctCount >= 6 ? 2 : correctCount >= 3 ? 1 : 0;
  save.starsByGame[5] = Math.max(save.starsByGame[5] || 0, stars);
  window.PandaSave?.save(save);
}

export default function gameWhack(k) {
  sceneBg(k, "bg-meadow");

  const state = {
    alive: true,
    locked: true,
    finished: false,
    waveGeneration: 0,
  };

  // Back button.
  iconButton(k, {
    label: "←",
    x: 82,
    y: 88,
    w: 92,
    h: 68,
    fontSize: 42,
    onClick: () => {
      state.alive = false;
      state.finished = true;
      state.locked = true;
      state.waveGeneration += 1;
      window.PandaAudio?.stopAllAudio?.();
      roundNumber = 0;
      streak = 0;
      correctCount = 0;
      previousQuestionKey = null;
      k.go("gamesPicker");
    },
  });

  // Left HUD: timer + score.
  addPanel(k, 155, 96, 260, 88, [255, 244, 225]);
  k.add([
    k.text("TIME", { size: 24, font: FONT }),
    k.color(...INK),
    k.pos(85, 70),
    k.anchor("center"),
  ]);
  const timerText = k.add([
    k.text(String(GAME_SECONDS), { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(175, 100),
    k.anchor("center"),
  ]);
  k.add([
    k.text("SEC", { size: 24, font: FONT }),
    k.color(...INK),
    k.pos(240, 112),
    k.anchor("center"),
  ]);

  // Top center equation card from the generated visual.
  addPanel(k, BOARD_X, 160, 650, 160, [255, 248, 228], [110, 71, 45]);
  let equation = expression(k, {
    slots: ["□", "+", "□", "=", "?"],
    x: BOARD_X,
    y: 155,
    size: 96,
    boxMode: false,
    reserve: ["17", "+", "9", "=", "19"],
  });

  // Right HUD: stars + instruction bubble.
  addPanel(k, 1188, 96, 270, 88, [255, 248, 228]);
  addStar(k, 1115, 96, false);
  addStar(k, 1190, 96, false);
  addStar(k, 1265, 96, false);

  addPanel(k, 1120, 245, 330, 112, [255, 238, 198], [130, 84, 43]);
  k.add([
    k.text("Whack the\nright number!", {
      size: 34,
      font: FONT,
      align: "center",
      width: 290,
    }),
    k.color(...INK),
    k.pos(1120, 245),
    k.anchor("center"),
    k.z(20),
  ]);

  // Bottom-left score board.
  addPanel(k, 160, 900, 270, 104, [239, 188, 103], [117, 72, 43]);
  k.add([
    k.text("SCORE", { size: 24, font: FONT }),
    k.color(...INK),
    k.pos(105, 875),
    k.anchor("center"),
  ]);
  const scoreText = k.add([
    k.text("0", { size: 52, font: FONT }),
    k.color(...INK),
    k.pos(205, 905),
    k.anchor("center"),
  ]);

  const buddy = panda(k, { x: 130, y: 690, size: 170 });

  // Six large targets. All interactive movement is encapsulated in the unit.
  const variants = [0, 1, 2, 0, 1, 2];
  const holes = MOLE_POSITIONS.map(([x, y], i) =>
    whackHole(k, {
      x,
      y,
      variant: variants[i],
      slotIndex: i,
    }),
  );

  // One transparent hit area per target; it never overlaps neighboring cells.
  for (const h of holes) {
    const hit = k.add([
      k.rect(210, 210, { radius: 90 }),
      k.pos(h.x, h.y),
      k.anchor("center"),
      k.opacity(0),
      k.area(),
      k.z(20),
    ]);

    hit.onClick(() => {
      if (!state.alive || state.finished || state.locked || !h.isVisible()) return;
      const value = h.getValue();
      if (value == null) return;

      state.locked = true;
      h.setSelected(true);

      if (value === currentQuestion.answer) {
        streak += 1;
        correctCount += 1;
        scoreText.text = String(correctCount * 10);

        const stars = correctCount >= 10 ? 3 : correctCount >= 6 ? 2 : correctCount >= 3 ? 1 : 0;
        [0, 1, 2].forEach((i) => {
          addStar(k, 1115 + i * 75, 96, i < stars);
        });

        h.flashCorrect();
        buddy.setMood("cheer", { silent: true });
        celebrate(k, {
          tier: streak >= 10 ? "streak10" : streak >= 5 ? "streak5" : streak >= 3 ? "streak3" : "first",
          anchor: { x: h.x, y: h.y - 55 },
          pandaBody: buddy?.body,
          pandaBaseSize: 170,
        });

        const { chain } = pickCheerCue({
          streak,
          isRoundComplete: false,
          levelId: 5,
          hasDiscovery: false,
        });

        // One audio transaction: reward first, then the math sentence, then
        // and only then does the next wave begin. Nothing can cut into it.
        playRewardAndAnswer({
          audio: window.PandaAudio,
          currentQ: currentQuestion,
          rewardChain: chain,
          onComplete: () => {
            if (!state.alive || state.finished) return;
            beginQuestion();
          },
        });
      } else {
        streak = 0;
        h.shake();
        buddy.setMood("think", { silent: true });
        window.PandaAudio.stopAllAudio();
        const wrongCue = pickWrongCue();
        window.PandaAudio.playSequence(["whack-tap", wrongCue], 100, 0, () => {
          if (!state.alive || state.finished) return;
          state.locked = false;
          h.setSelected(false);
        });
      }
    });
  }

  let currentQuestion = null;

  function resetBoardForQuestion() {
    state.waveGeneration += 1;
    const wave = state.waveGeneration;
    for (const h of holes) h.reset();

    // The visible beat is a wave, not six random timers. The first target
    // appears immediately and the others follow in a fixed cadence.
    holes.forEach((h, index) => {
      const delay = MOLE_BEAT[index];
      k.wait(delay, () => {
        if (!state.alive || state.finished || wave !== state.waveGeneration) return;
        h.setValue(currentQuestion.candidates[index]);
        h.show(currentQuestion.candidates[index]);
      });
    });

    // After the first complete cadence the same question keeps cycling. This
    // creates the feeling of a living field: moles keep appearing and hiding
    // until the child picks one, rather than presenting six static buttons.
    k.wait(CYCLE_SECONDS, () => {
      if (!state.alive || state.finished || wave !== state.waveGeneration || state.locked) return;
      resetBoardForQuestion();
    });
  }

  function beginQuestion() {
    if (!state.alive || state.finished) return;

    state.locked = true;
    const type = pickType(roundNumber);
    currentQuestion = buildQuestion(type, previousQuestionKey);
    previousQuestionKey = currentQuestion.key;
    roundNumber += 1;

    if (equation) equation.destroy();
    equation = expression(k, {
      slots: [String(currentQuestion.a), "+", String(currentQuestion.b), "=", "?"],
      x: BOARD_X,
      y: 155,
      size: 96,
      boxMode: false,
      reserve: ["17", "+", "9", "=", "19"],
    });

    window.PandaAudio.stopAllAudio();
    window.PandaAudio.playSequence([
      "whack-q-pre",
      `n-${currentQuestion.a}`,
      "q-plus",
      `n-${currentQuestion.b}`,
    ], 120, 0, () => {
      if (!state.alive || state.finished || currentQuestion == null) return;
      state.locked = false;
      resetBoardForQuestion();
    });

    // If the prompt itself fails on a device, the game still begins rather
    // than becoming unresponsive. The audio layer's own fallback handles
    // missing cues; this timer only unlocks input, never starts another audio.
    k.wait(3.2, () => {
      if (!state.alive || state.finished || !state.locked) return;
      state.locked = false;
      resetBoardForQuestion();
    });
  }

  let startTime = k.time();
  let lastSecond = GAME_SECONDS;
  const clock = k.onUpdate(() => {
    if (!state.alive || state.finished) {
      safeCancel(clock);
      return;
    }

    const remaining = Math.max(0, Math.ceil(GAME_SECONDS - (k.time() - startTime)));
    if (remaining !== lastSecond) {
      lastSecond = remaining;
      timerText.text = String(remaining);
    }

    if (remaining <= 10) {
      timerText.color = k.rgb(...DANGER);
    }

    if (remaining <= 0) {
      safeCancel(clock);
      state.finished = true;
      state.locked = true;
      state.waveGeneration += 1;
      holes.forEach((h) => h.hide({ animate: false }));
      window.PandaAudio.stopAllAudio();
      saveGameScore();
      window.PandaAudio.playSequence(["whack-timeup"], 0, 0, () => {
        if (!state.alive) return;
        k.add([
          k.rect(760, 340, { radius: 42 }),
          k.color(...PAPER),
          k.outline(6, k.rgb(...INK)),
          k.pos(BOARD_X, 520),
          k.anchor("center"),
          k.z(40),
        ]);
        k.add([
          k.text(`Great job!\n${correctCount} correct`, {
            size: 62,
            font: FONT,
            align: "center",
            width: 680,
          }),
          k.color(...INK),
          k.pos(BOARD_X, 505),
          k.anchor("center"),
          k.z(41),
        ]);
        k.wait(2.5, () => {
          if (!state.alive) return;
          roundNumber = 0;
          streak = 0;
          correctCount = 0;
          previousQuestionKey = null;
          k.go("gamesPicker");
        });
      });
    }
  });

  function safeCancel(handle) {
    if (!handle) return;
    try { handle.cancel(); } catch (_) { /* already cancelled */ }
  }

  // Begin with the first question. The first tap that enters the game has
  // already satisfied the browser's user-gesture requirement for audio.
  window.PandaAudio.playSequence(["whack-intro", "whack-start"], 140, 0, () => {
    beginQuestion();
  });
}

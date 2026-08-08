// scenes/level2.js — make-a-ten strategy. Renders full 2x5 ten-frame.
//
// Uses the { need, rest, answer } fields from data/levels.json.

import tenFrame from "../components/tenFrame.js";
import expression from "../components/expression.js";
import stepBar from "../components/stepBar.js";
import choice, { iconButton } from "../components/choice.js";

const INK = [61, 54, 82];
const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];

let roundIdx = 0;

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawRound(k, round, ri, totalRounds, state) {
  k.add([k.rect(k.width(), k.height()), k.color(255, 241, 220)]);

  iconButton(k, {
    label: "←",
    x: 96, y: 100, w: 96, h: 72,
    fontSize: 44,
    onClick: () => {
      window.PandaAudio.playCue("back");
      roundIdx = 0;
      k.go("levelPicker");
    },
  });
  iconButton(k, {
    label: "🔊",
    x: 220, y: 100, w: 96, h: 72,
    fontSize: 36,
    onClick: () => {
      const stepCues = {
        1: "round-start",
        2: `step-2`,
        3: `n-${round.rest}`,
        4: "round-end",
      };
      window.PandaAudio.playCue(stepCues[state.step] || "round-start");
    },
  });

  stepBar(k, { step: 1, x: k.width() / 2, y: 100, w: 1000, h: 36 });

  k.add([
    k.text(`Round ${ri + 1} / ${totalRounds}`, { size: 28 }),
    k.color(...INK),
    k.pos(k.width() / 2, 180),
    k.anchor("center"),
  ]);

  const need = round.need;
  const rest = round.rest;
  expression(k, { a: round.a, b: round.b, missing: round.a, x: k.width() / 2, y: 290, size: 110 });
  k.add([
    k.text(`${round.a} + ? = ${round.a + round.b}`, { size: 56 }),
    k.color(...INK),
    k.pos(k.width() / 2, 380),
    k.anchor("center"),
  ]);

  tenFrame(k, round.a, { x: k.width() / 2, y: 540, rows: 2, cell: 70, gap: 10 });

  const allChoices = [need, rest, need + 1, rest + 1]
    .filter((v, idx, arr) => v >= 0 && v <= 10 && arr.indexOf(v) === idx)
    .slice(0, 4);
  if (!allChoices.includes(need)) allChoices[0] = need;

  const buttonY = 770;
  const buttonW = 180;
  const buttonH = 132;
  const gap = 24;
  const totalW = allChoices.length * buttonW + (allChoices.length - 1) * gap;
  const startX = k.width() / 2 - totalW / 2 + buttonW / 2;

  const buttons = [];
  shuffle(allChoices).forEach((v, i) => {
    const x = startX + i * (buttonW + gap);
    const btn = choice(k, {
      label: String(v),
      x, y: buttonY,
      w: buttonW, h: buttonH,
      onClick: () => onPick(v, need, buttons, i),
    });
    buttons.push({ btn, value: v });
  });

  state.locked = new Set();
  state.step = 1;

  function advance() {
    if (state.step === 1) {
      state.step = 2;
      stepBar(k, { step: 2, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      k.add([
        k.text(`${round.a} + ${need} = 10`, { size: 48 }),
        k.color(...INK),
        k.pos(k.width() / 2, 460),
        k.anchor("center"),
      ]);
      tenFrame(k, 10, { x: k.width() / 2, y: 600, rows: 2, cell: 70, gap: 10 });
    } else if (state.step === 2) {
      state.step = 3;
      stepBar(k, { step: 3, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      k.add([
        k.text(`10 + ${rest} = ${round.answer}`, { size: 48 }),
        k.color(...INK),
        k.pos(k.width() / 2, 460),
        k.anchor("center"),
      ]);
    } else if (state.step === 3) {
      state.step = 4;
      stepBar(k, { step: 4, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      k.add([
        k.text(`🎉 ${round.answer}`, { size: 110 }),
        k.color(...INK),
        k.pos(k.width() / 2, 560),
        k.anchor("center"),
      ]);
      k.wait(1.2, () => {
        window.PandaAudio.playCue("round-end");
        if (ri + 1 < totalRounds) {
          roundIdx = ri + 1;
          k.go("level2");
        } else {
          finishLevel(k, 2);
        }
      });
    }
  }

  function onPick(value, correctAnswer, btns, idx) {
    if (state.step >= 4) return;
    if (state.locked.has(idx)) return;
    if (value === correctAnswer) {
      const cue = ENCOURAGE[ri % ENCOURAGE.length];
      window.PandaAudio.playCue(cue);
      btns[idx].btn.setDisabled(true);
      state.locked.add(idx);
      k.wait(0.4, advance);
    } else {
      window.PandaAudio.playCue("enc-try");
      btns[idx].btn.setDisabled(true);
      state.locked.add(idx);
    }
  }
}

function finishLevel(k, levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedLevel = Math.max(save.unlockedLevel, levelId + 1);
  save.starsByLevel = save.starsByLevel || {};
  save.starsByLevel[levelId] = (save.starsByLevel[levelId] || 0) + 1;
  save.currentLevel = levelId;
  window.PandaSave?.save(save);
  window.PandaAudio.playCue("lvl-done");
  roundIdx = 0;
  k.go("levelPicker");
}

export default function level2Scene(k) {
  const data = (window.PandaLevels?.levels || []).find((l) => l.id === 2);
  if (!data) {
    k.add([k.text("Level 2 data missing", { size: 48 }), k.color(...INK), k.pos(k.width() / 2, k.height() / 2), k.anchor("center")]);
    return;
  }
  if (roundIdx === 0) {
    window.PandaAudio.playCue(data.intro || "lvl-2-intro");
  } else {
    window.PandaAudio.playCue("round-start");
  }
  const state = {};
  drawRound(k, data.rounds[roundIdx] || data.rounds[0], roundIdx, data.rounds.length, state);
}
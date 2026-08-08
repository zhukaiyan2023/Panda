// scenes/level3.js — up to 20 (no make-ten step).
//
// Renders full 2x5 ten-frame for the ones place (a % 10) and a small "1"
// indicator above it for the tens place when a >= 10.

import tenFrame from "../components/tenFrame.js";
import expression from "../components/expression.js";
import stepBar from "../components/stepBar.js";
import choice from "../components/choice.js";

const INK = [61, 54, 82];
const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawRound(k, round, roundIdx, totalRounds, scene) {
  k.add([k.rect(k.width(), k.height()), k.color(255, 241, 220)]);
  stepBar(k, { step: 1, x: k.width() / 2, y: 100, w: 1000, h: 36 });

  k.add([
    k.text(`Round ${roundIdx + 1} / ${totalRounds}`, { size: 28 }),
    k.color(...INK),
    k.pos(k.width() / 2, 180),
    k.anchor("center"),
  ]);

  expression(k, { a: round.a, b: round.b, missing: round.b, x: k.width() / 2, y: 290, size: 110 });

  const ones = round.a % 10;
  const tens = Math.floor(round.a / 10);
  if (tens > 0) {
    k.add([
      k.text(String(tens), { size: 64 }),
      k.color(...INK),
      k.pos(k.width() / 2 - 200, 460),
      k.anchor("center"),
    ]);
  }
  tenFrame(k, ones, { x: k.width() / 2 + 60, y: 460, rows: 2, cell: 50, gap: 8 });

  const allChoices = [round.b, round.b + 1, Math.max(0, round.b - 1), round.b + 2]
    .filter((v, idx, arr) => v >= 0 && v <= 20 && arr.indexOf(v) === idx)
    .slice(0, 4);
  if (!allChoices.includes(round.b)) allChoices[0] = round.b;

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
      onClick: () => onPick(v, round.b, buttons, i),
    });
    buttons.push({ btn, value: v });
  });

  scene.locked = new Set();
  scene.step = 1;

  function advance() {
    if (scene.step === 1) {
      scene.step = 2;
      stepBar(k, { step: 2, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      k.add([
        k.text(`${round.a} + ${round.b} = ${round.answer}`, { size: 64 }),
        k.color(...INK),
        k.pos(k.width() / 2, 560),
        k.anchor("center"),
      ]);
    } else if (scene.step === 2) {
      scene.step = 3;
      stepBar(k, { step: 3, x: k.width() / 2, y: 100, w: 1000, h: 36 });
    } else if (scene.step === 3) {
      scene.step = 4;
      stepBar(k, { step: 4, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      k.add([
        k.text(`🎉 ${round.answer}`, { size: 110 }),
        k.color(...INK),
        k.pos(k.width() / 2, 600),
        k.anchor("center"),
      ]);
      k.wait(1.2, () => {
        window.PandaAudio.playCue("round-end");
        if (roundIdx + 1 < totalRounds) {
          window.kaplay.go("level3", { roundIdx: roundIdx + 1 });
        } else {
          finishLevel(3);
        }
      });
    }
  }

  function onPick(value, correctAnswer, btns, idx) {
    if (scene.step >= 4) return;
    if (scene.locked.has(idx)) return;
    if (value === correctAnswer) {
      const cue = ENCOURAGE[(roundIdx + 2) % ENCOURAGE.length];
      window.PandaAudio.playCue(cue);
      btns[idx].btn.setDisabled(true);
      scene.locked.add(idx);
      k.wait(0.4, advance);
    } else {
      window.PandaAudio.playCue("enc-try");
      btns[idx].btn.setDisabled(true);
      scene.locked.add(idx);
    }
  }
}

function finishLevel(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedLevel = Math.max(save.unlockedLevel, levelId + 1);
  save.starsByLevel = save.starsByLevel || {};
  save.starsByLevel[levelId] = (save.starsByLevel[levelId] || 0) + 1;
  save.currentLevel = levelId;
  window.PandaSave?.save(save);
  window.PandaAudio.playCue("lvl-done");
  window.kaplay.go("levelPicker");
}

export default function level3() {
  const k = window.kaplay;
  const data = (window.PandaLevels?.levels || []).find((l) => l.id === 3);
  if (!data) {
    k.add([k.text("Level 3 data missing", { size: 48 }), k.color(...INK), k.pos(k.width() / 2, k.height() / 2), k.anchor("center")]);
    return;
  }
  const params = (window.__panda_lastArgs && window.__panda_lastArgs[0]) || { roundIdx: 0 };
  const scene = {};
  window.PandaAudio.playCue(data.intro || "lvl-3-intro");
  drawRound(k, data.rounds[params.roundIdx || 0], params.roundIdx || 0, data.rounds.length, scene);
}

export function startRound(args) {
  window.__panda_lastArgs = [args];
  window.kaplay.go("level3");
}
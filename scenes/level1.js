// scenes/level1.js — numbers up to 5. Renders top row of ten-frame only.
//
// State machine per round:
//   intro -> question
//   pick correct -> step 2 -> step 3 -> step 4 (celebrate) -> next round
//   pick wrong   -> enc-try + lock button + allow retry
//
// After the last round, sets unlockedLevel >= 2 and returns to the picker.

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

function makeQuestion(round) {
  const correct = round.missing ?? round.need ?? (round.b - 1);
  const allChoices = [correct, correct + 1, Math.max(0, correct - 1), correct + 2]
    .filter((v, idx, arr) => v >= 0 && v <= 10 && arr.indexOf(v) === idx)
    .slice(0, 4);
  return { correct, choices: shuffle(allChoices.length ? allChoices : [correct, 1, 2, 3]) };
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

  expression(k, { a: round.a, b: round.b, missing: "?", x: k.width() / 2, y: 290, size: 110 });

  tenFrame(k, round.a, { x: k.width() / 2, y: 470, rows: 1, cell: 80, gap: 10 });

  const { correct, choices } = makeQuestion(round);

  const buttonY = 720;
  const buttonW = 180;
  const buttonH = 132;
  const gap = 24;
  const totalW = choices.length * buttonW + (choices.length - 1) * gap;
  const startX = k.width() / 2 - totalW / 2 + buttonW / 2;

  const buttons = [];
  choices.forEach((v, i) => {
    const x = startX + i * (buttonW + gap);
    const btn = choice(k, {
      label: String(v),
      x, y: buttonY,
      w: buttonW, h: buttonH,
      onClick: () => onPick(v, correct, buttons, i, round, roundIdx, totalRounds),
    });
    buttons.push({ btn, value: v });
  });

  scene.correctCount = 0;
  scene.locked = new Set();
  scene.step = 1;

  function advance() {
    if (scene.step === 1) {
      scene.step = 2;
      stepBar(k, { step: 2, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      const need = round.need ?? (10 - round.a);
      k.add([
        k.text(`${round.a} + ${need} = 10`, { size: 48 }),
        k.color(...INK),
        k.pos(k.width() / 2, 540),
        k.anchor("center"),
      ]);
    } else if (scene.step === 2) {
      scene.step = 3;
      stepBar(k, { step: 3, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      tenFrame(k, 10, { x: k.width() / 2, y: 470, rows: 2, cell: 80, gap: 10 });
    } else if (scene.step === 3) {
      scene.step = 4;
      stepBar(k, { step: 4, x: k.width() / 2, y: 100, w: 1000, h: 36 });
      const total = round.a + round.b;
      k.add([
        k.text(`= ${total}`, { size: 110 }),
        k.color(...INK),
        k.pos(k.width() / 2, 540),
        k.anchor("center"),
      ]);
      k.wait(1.2, () => {
        window.PandaAudio.playCue("round-end");
        if (roundIdx + 1 < totalRounds) {
          k.go(`level1`, { roundIdx: roundIdx + 1 });
        } else {
          finishLevel(1);
        }
      });
    }
  }

  function onPick(value, correctAnswer, btns, idx, roundData, ri, total) {
    if (scene.step >= 4) return;
    if (scene.locked.has(idx)) return;
    if (value === correctAnswer) {
      const cue = ENCOURAGE[(scene.correctCount + ri) % ENCOURAGE.length];
      window.PandaAudio.playCue(cue);
      btns[idx].btn.setDisabled(true);
      scene.locked.add(idx);
      scene.correctCount++;
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

export default function level1() {
  const k = window.kaplay;
  const allLevels = window.PandaLevels?.levels || [];
  const data = allLevels.find((l) => l.id === 1);
  if (!data) {
    k.add([k.text("Level 1 data missing", { size: 48 }), k.color(...INK), k.pos(k.width() / 2, k.height() / 2), k.anchor("center")]);
    return;
  }
  const scene = { roundIdx: 0 };
  const args = k.getSceneName ? null : null;
  const params = (window.__panda_lastArgs && window.__panda_lastArgs[0]) || { roundIdx: 0 };

  window.PandaAudio.playCue(data.intro || "lvl-1-intro");

  drawRound(k, data.rounds[params.roundIdx || 0], params.roundIdx || 0, data.rounds.length, scene);
}

export function startRound(args) {
  window.__panda_lastArgs = [args];
  window.kaplay.go("level1");
}
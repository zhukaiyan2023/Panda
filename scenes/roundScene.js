// scenes/roundScene.js — the shared round scaffold every level is built on.
//
// level1/2/3 previously carried near-identical copies of the chrome, the button
// layout, shuffle(), finishLevel() and the pick/advance state machine — roughly
// 70% of each file was duplicated. That is why a single bad area() call broke
// all three levels at once, and why Level 1 still ran Level 2's make-a-ten
// reveal steps. The flow lives here once; a level supplies only what makes it
// that level.
//
// A level config provides:
//   levelId     number      — save slot and unlock progression
//   sceneName   string      — the Kaplay scene to re-enter for the next round
//   introCue    string      — audio cue on entering round 0
//   stepLabels  string[4]   — the teaching steps this level walks through
//   equation    (round) => ({ left, right, sum })
//   question    (round) => ({ correct, values })
//   body        (ctx)  => any   — draws the number representation, return value
//                                 is exposed to steps as ctx.body
//   steps       [(ctx) => void] — reveals for steps 2..4, index 0 is step 2
//   replayCue   (round, step) => string

import expression from "../components/expression.js";
import stepBar from "../components/stepBar.js";
import panda from "../components/panda.js";
import choice, { iconButton } from "../components/choice.js";
import { INK, PAPER, FONT } from "../components/theme.js";

const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];
const LAST_STEP = 4;
// Pause between reveal lines: long enough for an adult to read one aloud.
const STEP_DELAY = 1.6;

// Layout constants for the 1366x1024 letterbox. The icon buttons get their own
// left column: they used to sit in the step bar's row, where the first step
// label overlapped them.
export const LAYOUT = {
  iconX: 84,
  backY: 92,
  replayY: 184,
  barX: 748,
  barY: 84,
  barW: 1060,
  counterY: 196,
  equationY: 310,
  contextY: 392,
  bodyY: 500,
  revealY: 690,
  revealStride: 74,
  buttonY: 838,
  pandaX: 170,
  pandaY: 640,
  pandaSize: 230,
};

// The band between the number representation and the answer buttons only fits
// two lines. Older lines are retired rather than allowed to grow into the
// buttons.
const MAX_REVEAL_LINES = 2;

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Builds exactly `count` distinct answer options including the correct one.
//
// Levels used to assemble candidates then dedupe, which left a variable number
// of buttons: in Level 2 round 2 (7 + 6) `need` and `rest` are both 3, so the
// row collapsed to three buttons. A choice count that changes between rounds is
// needless friction for a 3-6 year old, so options are topped up by walking
// outward from the answer until the row is full.
export function options(correct, { min = 0, max = 10, prefer = [], count = 4 } = {}) {
  const inRange = (v) => Number.isFinite(v) && v >= min && v <= max;
  const picked = [];
  const add = (v) => {
    if (inRange(v) && !picked.includes(v)) picked.push(v);
  };

  add(correct);
  prefer.forEach(add);
  for (let d = 1; picked.length < count && d <= max - min; d++) {
    add(correct + d);
    add(correct - d);
  }
  return picked.slice(0, count);
}

function saveProgress(levelId) {  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedLevel = Math.max(save.unlockedLevel, levelId + 1);
  save.starsByLevel = save.starsByLevel || {};
  save.starsByLevel[levelId] = (save.starsByLevel[levelId] || 0) + 1;
  save.currentLevel = levelId;
  window.PandaSave?.save(save);
}

export default function createRoundScene(config) {
  // Round position is per level and survives the k.go() between rounds, which is
  // why it lives in the factory closure rather than in the scene function.
  let roundIdx = 0;

  function drawRound(k, round, ri, totalRounds) {
    const state = { step: 1, locked: new Set() };

    k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

    iconButton(k, {
      label: "←",
      x: LAYOUT.iconX, y: LAYOUT.backY, w: 96, h: 72,
      fontSize: 44,
      onClick: () => {
        window.PandaAudio.playCue("back");
        roundIdx = 0;
        k.go("levelPicker");
      },
    });
    iconButton(k, {
      label: "♪",
      x: LAYOUT.iconX, y: LAYOUT.replayY, w: 96, h: 72,
      fontSize: 44,
      onClick: () => {
        window.PandaAudio.playCue(config.replayCue(round, state.step));
      },
    });

    const bar = stepBar(k, {
      labels: config.stepLabels,
      step: 1,
      x: LAYOUT.barX, y: LAYOUT.barY, w: LAYOUT.barW, h: 36,
    });

    k.add([
      k.text(`Round ${ri + 1} / ${totalRounds}`, { size: 28, font: FONT }),
      k.color(...INK),
      k.pos(LAYOUT.barX, LAYOUT.counterY),
      k.anchor("center"),
    ]);

    const buddy = panda(k, {
      x: LAYOUT.pandaX, y: LAYOUT.pandaY, size: LAYOUT.pandaSize,
    });

    const eq = config.equation(round);
    expression(k, { ...eq, x: LAYOUT.barX, y: LAYOUT.equationY, size: 104 });

    // Reveal lines occupy a fixed band between the number representation and the
    // answer buttons. Declared before body() runs so a level may add its context
    // line while building its number representation.
    let revealLines = [];
    function reveal(text, opts = {}) {
      // The celebrate step supersedes the working-out rather than piling on
      // top of it.
      if (opts.replace) {
        revealLines.forEach((n) => n.destroy());
        revealLines = [];
      }
      const node = k.add([
        k.text(text, { size: opts.size ?? 52, font: FONT }),
        k.color(...INK),
        k.pos(LAYOUT.barX, LAYOUT.revealY),
        k.anchor("center"),
      ]);
      revealLines.push(node);
      while (revealLines.length > MAX_REVEAL_LINES) revealLines.shift().destroy();
      revealLines.forEach((n, i) => {
        n.pos.y = LAYOUT.revealY + i * LAYOUT.revealStride;
      });
      return node;
    }

    // A standing line of context, pinned under the equation. Level 2 uses it to
    // keep the whole problem visible while the child works one sub-step of it,
    // so it must not be retired along with the reveal lines.
    function context(text, opts = {}) {
      return k.add([
        k.text(text, { size: opts.size ?? 40, font: FONT }),
        k.color(...INK),
        k.opacity(0.75),
        k.pos(LAYOUT.barX, LAYOUT.contextY),
        k.anchor("center"),
      ]);
    }

    const ctx = { k, round, ri, totalRounds, bar, buddy, reveal, context, state };
    ctx.body = config.body(ctx);

    const { correct, values } = config.question(round);
    const buttonW = 180;
    const buttonH = 132;
    const gap = 24;
    const ordered = shuffle(values);
    const totalW = ordered.length * buttonW + (ordered.length - 1) * gap;
    const startX = LAYOUT.barX - totalW / 2 + buttonW / 2;

    const buttons = [];
    ordered.forEach((v, i) => {
      const btn = choice(k, {
        label: String(v),
        x: startX + i * (buttonW + gap),
        y: LAYOUT.buttonY,
        w: buttonW, h: buttonH,
        onClick: () => onPick(v, i),
      });
      buttons.push({ btn, value: v });
    });

    function advance() {
      if (state.step >= LAST_STEP) return;
      state.step += 1;
      bar.setStep(state.step);

      const revealStep = config.steps[state.step - 2];
      if (revealStep) revealStep(ctx);

      if (state.step < LAST_STEP) {
        // The reveal steps are an explanation, not more questions. They used to
        // be driven by further correct picks, but the only correct button was
        // already locked by the pick that got here, so every round stalled on
        // step 2 — the celebrate step and round-end cue were unreachable and no
        // round ever completed. They now play out on their own.
        k.wait(STEP_DELAY, advance);
      } else {
        k.wait(1.2, () => {
          window.PandaAudio.playCue("round-end");
          if (ri + 1 < totalRounds) {
            roundIdx = ri + 1;
            k.go(config.sceneName);
          } else {
            saveProgress(config.levelId);
            window.PandaAudio.playCue("lvl-done");
            roundIdx = 0;
            k.go("levelPicker");
          }
        });
      }
    }

    function onPick(value, idx) {
      if (state.step >= LAST_STEP) return;
      if (state.locked.has(idx)) return;
      state.locked.add(idx);

      if (value === correct) {
        window.PandaAudio.playCue(ENCOURAGE[(ri + config.levelId) % ENCOURAGE.length]);
        buttons[idx].btn.setCorrect();
        buddy.setMood("cheer", { silent: true });
        k.wait(0.4, advance);
      } else {
        buttons[idx].btn.setDisabled(true);
        // setMood plays enc-try itself, so the cue is not fired separately.
        buddy.setMood("think");
      }
    }
  }

  return function scene(k) {
    const data = (window.PandaLevels?.levels || []).find((l) => l.id === config.levelId);
    if (!data) {
      k.add([
        k.text(`Level ${config.levelId} data missing`, { size: 48, font: FONT }),
        k.color(...INK),
        k.pos(k.width() / 2, k.height() / 2),
        k.anchor("center"),
      ]);
      return;
    }

    window.PandaAudio.playCue(roundIdx === 0 ? (data.intro || config.introCue) : "round-start");
    drawRound(k, data.rounds[roundIdx] || data.rounds[0], roundIdx, data.rounds.length);
  };
}

export { shuffle };

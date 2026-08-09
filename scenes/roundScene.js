// scenes/roundScene.js — the shared round scaffold every level is built on.
//
// A level config provides:
//   levelId     number      — save slot and unlock progression
//   sceneName   string      — the Kaplay scene to re-enter for the next round
//   introCue    string      — audio cue on entering round 0
//   stepLabels  string[N]   — one teaching step per round beat
//   steps       [(ctx) => stepConfig]   — one per step; index 0 is step 1
//     stepConfig = {
//       equation(round, prev)  { left, right, sum }   — what to show
//       question(round, prev)  { correct, values }    — what buttons to render
//       body?(ctx)             any                   — visual under equation
//       cue                    string                — short audio prompt
//       reveal?(ctx)           void                  — extra on-screen text
//       onAdvance?(ctx)        void                  — after correct pick
//     }
//     OR a bare (ctx) => stepConfig returning falsey to skip rendering the
//     button row that round (the existing reveal-only style).
//
// Why each step can carry its own equation + question: levels now teach in
// beats. L1 shows the same equation across 2 steps ("see" then "count").
// L2 shows a chain (a+?=10, then need+rest=answer). Buttons stay visible at
// every step — a child shouldn't have to wait for buttons to re-appear.

import expression from "../components/expression.js";
import stepBar from "../components/stepBar.js";
import panda from "../components/panda.js";
import choice, { iconButton } from "../components/choice.js";
import { INK, PAPER, FONT } from "../components/theme.js";

const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];
// Long enough for a slow voice to land a one-word prompt and the child to
// look at the buttons before the timer expires. The verifier flips a global
// flag to skip these pauses; in-game timing is unchanged.
const STEP_DELAY = 4.0;
const TEST_DELAY = 0.05;

export const LAYOUT = {
  iconX: 84,
  backY: 92,
  barX: 748,
  barY: 84,
  barW: 1060,
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
// Same outward-walk as before so the row stays the same width across rounds.
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

function saveProgress(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedLevel = Math.max(save.unlockedLevel, levelId + 1);
  save.starsByLevel = save.starsByLevel || {};
  save.starsByLevel[levelId] = (save.starsByLevel[levelId] || 0) + 1;
  save.currentLevel = levelId;
  window.PandaSave?.save(save);
}

export default function createRoundScene(config) {
  let roundIdx = 0;

  function drawRound(k, round, ri, totalRounds) {
    const state = { step: 1, locked: new Set(), buttons: [], body: null };

    k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

    iconButton(k, {
      label: "←",
      x: LAYOUT.iconX, y: LAYOUT.backY, w: 96, h: 72,
      fontSize: 44,
      onClick: () => {
        roundIdx = 0;
        k.go("levelPicker");
      },
    });

    const bar = stepBar(k, {
      labels: config.stepLabels,
      step: 1,
      x: LAYOUT.barX, y: LAYOUT.barY, w: LAYOUT.barW, h: 36,
    });

    const buddy = panda(k, {
      x: LAYOUT.pandaX, y: LAYOUT.pandaY, size: LAYOUT.pandaSize,
    });

    let revealLines = [];
    function reveal(text, opts = {}) {
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

    function context(text, opts = {}) {
      return k.add([
        k.text(text, { size: opts.size ?? 40, font: FONT }),
        k.color(...INK),
        k.opacity(0.75),
        k.pos(LAYOUT.barX, LAYOUT.contextY),
        k.anchor("center"),
      ]);
    }

    let eqNode = null;
    let anchorEqNode = null;
    // The "active" equation sits in the body area at moderate size. Levels
    // swap it each teaching beat (L1's pair, L2's compare/to-ten/split/count).
    function setEquation(eq, opts = {}) {
      if (eqNode) eqNode.destroy();
      // Accept either the legacy { left, right, sum } shape or the newer
      // { slots: [...], colors?: [...] } shape. The newer shape is the one
      // levels use for any expression that isn't a single two-addend question.
      const props = {
        x: opts.x ?? LAYOUT.barX,
        y: opts.y ?? LAYOUT.equationY,
        size: opts.size ?? 96,
      };
      if (eq.slots) {
        props.slots = eq.slots;
        if (eq.colors) props.colors = eq.colors;
      } else {
        props.left = eq.left;
        props.right = eq.right;
        props.sum = eq.sum;
      }
      eqNode = expression(k, props);
    }
    // The persistent "anchor" equation — the original problem ("a + b = ?")
    // that the child is working toward. Renders at the top, large and bold,
    // and never disappears between teaching beats.
    function setAnchorEquation(eq, opts = {}) {
      if (anchorEqNode) anchorEqNode.destroy();
      const props = {
        x: opts.x ?? LAYOUT.barX,
        y: opts.y ?? 220,
        size: opts.size ?? 100,
      };
      if (eq.slots) {
        props.slots = eq.slots;
        if (eq.colors) props.colors = eq.colors;
      } else {
        props.left = eq.left;
        props.right = eq.right;
        props.sum = eq.sum;
      }
      anchorEqNode = expression(k, props);
    }

    function clearBody() {
      if (state.body) state.body.destroy();
      state.body = null;
    }

    function clearButtons() {
      state.buttons.forEach(({ btn }) => btn.destroy());
      state.buttons = [];
      state.locked.clear();
    }

    function renderButtons(values, correct, onPick) {
      const buttonW = 180;
      const buttonH = 132;
      const gap = 24;
      const ordered = shuffle(values);
      const totalW = ordered.length * buttonW + (ordered.length - 1) * gap;
      const startX = LAYOUT.barX - totalW / 2 + buttonW / 2;

      ordered.forEach((v, i) => {
        const btn = choice(k, {
          label: String(v),
          x: startX + i * (buttonW + gap),
          y: LAYOUT.buttonY,
          w: buttonW, h: buttonH,
          onClick: () => onPick(v, i),
        });
        state.buttons.push({ btn, value: v });
      });
      return state.buttons;
    }

    // Shared context for every step's renderer.
    const ctx = {
      k, round, ri, totalRounds, bar, buddy, reveal, context,
      setEquation, setAnchorEquation, clearBody, clearButtons, renderButtons,
      get step() { return state.step; },
    };

    function buildStep(stepNumber, prev) {
      const stepCfg = config.steps[stepNumber - 1];
      if (!stepCfg) return;
      const built = stepCfg(ctx, prev) || {};
      if (built.equation) setEquation(built.equation, built.equationOpts || {});
      if (built.body) state.body = built.body;
      if (built.reveal) reveal(built.reveal);
      if (built.cue) window.PandaAudio.playCue(built.cue);
      ctx.lastHadQuestion = !!built.question;
      if (built.question) {
        renderButtons(
          built.question.values,
          built.question.correct,
          (v, i) => onPick(v, i, built, prev),
        );
      }
    }

    function onPick(value, idx, stepCfg, prev) {
      // Any real tap cancels the soft auto-advance so the child isn't yanked
      // into the next step on top of their own answer.
      if (autoAdvanceTimer) autoAdvanceTimer.cancel();
      autoAdvanceTimer = null;
      if (state.locked.has(idx)) return;
      if (value === stepCfg.question.correct) {
        state.locked.add(idx);
        state.buttons[idx].btn.setCorrect();
        buddy.setMood("cheer", { silent: true });
        // Hush everything that's still speaking — the L1 decompose
        // sentence keeps going for ~14s and a kid who answers in the
        // first 2s would otherwise hear the rest of the sentence
        // stacked on top of the encouragement and the next step's
        // audio prompt. Then play the encouragement.
        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue(ENCOURAGE[(ri + config.levelId) % ENCOURAGE.length]);
        if (stepCfg.onAdvance) stepCfg.onAdvance(ctx);
        const d = window.__skipTimers ? TEST_DELAY : 0.4;
        k.wait(d, () => advance(prev));
      } else {
        state.buttons[idx].btn.setDisabled(true);
        buddy.setMood("think");
      }
    }

    function advance(prev) {
      const d = window.__skipTimers ? TEST_DELAY : STEP_DELAY;
      if (state.step >= config.steps.length) {
        k.wait(d, finishRound);
        return;
      }
      state.step += 1;
      bar.setStep(state.step);
      // Clear the working area for the next beat but keep reveal lines — they
      // show the running total so far.
      clearButtons();
      clearBody();
      buildStep(state.step, prev || ctx.round);
      // Auto-advance only when the new step has no question to answer.
      // Question steps wait for the child to tap; reveal-only steps chain
      // through after a short pause so the screen doesn't sit still.
      if (!ctx.lastHadQuestion) {
        autoAdvanceTimer = k.wait(d, () => {
          if (state.step >= config.steps.length) {
            k.wait(d, finishRound);
          } else {
            advance(ctx.round);
          }
        });
      }
    }

    function finishRound() {
      // Cancel any pending auto-advance so it doesn't fire on the next round's
      // closure after we've moved on.
      if (autoAdvanceTimer) autoAdvanceTimer.cancel();
      autoAdvanceTimer = null;
      if (ri + 1 < totalRounds) {
        roundIdx = ri + 1;
        k.go(config.sceneName);
      } else {
        saveProgress(config.levelId);
        window.PandaAudio.playCue("lvl-done");
        roundIdx = 0;
        k.go("levelPicker");
      }
    }

    let autoAdvanceTimer = null;

    buildStep(1, round);

    // If step 1 has no question, chain forward. Question steps wait for tap.
    if (!ctx.lastHadQuestion) {
      const d = window.__skipTimers ? TEST_DELAY : STEP_DELAY;
      autoAdvanceTimer = k.wait(d, () => {
        if (state.step < config.steps.length) advance(ctx.round);
      });
    }
  }

  return function scene(k) {
    const data = (window.PandaLevels?.levels || []).find((l) => l.id === config.levelId);
    if (!data) {
      k.add([
        k.text(`第 ${config.levelId} 关数据缺失`, { size: 48, font: FONT }),
        k.color(...INK),
        k.pos(k.width() / 2, k.height() / 2),
        k.anchor("center"),
      ]);
      return;
    }

    if (roundIdx === 0) {
      window.PandaAudio.playCue(data.intro || config.introCue);
    }
    drawRound(k, data.rounds[roundIdx] || data.rounds[0], roundIdx, data.rounds.length);
  };
}

export { shuffle };
// scenes/pairScene.js — shared scaffold for "find pairs that sum to 10" games.
//
// Used by Boat (6 boats, pick 2 → fill bridge), Cloud (6 clouds, find 2-3 pairs),
// and Panda Feed (3-7 bubbles, find pairs). These differ from roundScene.js in
// three ways:
//   * the equation is implicit in the action — we don't render "a + ? = 10"
//   * the player makes 2+ correct picks per round (a pairScene round is "find
//     all valid pairs" or "make one valid pair"), not a single one
//   * the per-game win condition is custom (fill a 10-slot bridge, hug all
//     pairs, eat enough bamboo)
//
// A pair-scene config provides:
//   levelId        number        — save slot key (positive int, distinct from math levels)
//   sceneName      string        — Kaplay scene to re-enter for next round
//   introCue       string        — audio cue on entering round 0
//   roundCount     number        — total rounds in the game
//   candidates(r)  number[]      — items to pick from this round (e.g. [4,7,2,9,1,6])
//   pairs(r)       [number,number][] — valid pairs (subset of cartesian of candidates)
//   target         number        — the sum each pair must reach (always 10)
//   prompt(r)      string        — short instruction text under the prompt header
//   body(ctx)      (ctx) => any  — renders the picking grid; return value is exposed
//                                   to onCorrect / onWrong as ctx.body
//   onCorrect(ctx, a, b)         — animation + state mutation for a correct pick
//   onWrong(ctx, a, b)           — feedback for a wrong pick (defaults: shake only)
//   roundEndCue(r) string        — audio cue when this round finishes
//   replayCue(r, step) string    — audio cue when the player taps replay

import stepBar from "../components/stepBar.js";
import panda from "../components/panda.js";
import { iconButton } from "../components/choice.js";
import { INK, PAPER, FONT } from "../components/theme.js";

const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];

// Picks that happen during one round share the same step bar. Each correct
// pick moves the bar forward; the round is complete when step === roundSteps.
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Default wrong-pick handler: shake the two most recently picked items in red.
function defaultOnWrong(ctx, a, b) {
  ctx.buddy.setMood("think");
}

export default function createPairScene(config) {
  let roundIdx = 0;

  function drawRound(k, round) {
    const state = {
      // Items already selected this round, in pick order. Pairs of indices.
      selections: [],
      // Pairs already found and removed from play this round.
      foundPairs: 0,
      // Whether the round is finished (all valid pairs found).
      done: false,
    };

    // Header band, icon buttons, and panda — same chrome as the math levels.
    k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

    iconButton(k, {
      label: "←",
      x: 84, y: 92, w: 96, h: 72, fontSize: 44,
      onClick: () => {
        roundIdx = 0;
        k.go("gamesPicker");
      },
    });

    const totalSteps = Math.max(1, config.pairs(round.index).length);
    const bar = stepBar(k, {
      labels: Array.from({ length: totalSteps + 1 }, (_, i) =>
        i === 0 ? "开始" : i === totalSteps ? "完成" : `第 ${i} 对`),
      step: 1,
      x: 748, y: 84, w: 1060, h: 36,
    });

    k.add([
      k.text(`第 ${roundIdx + 1} 轮 / 共 ${config.roundCount} 轮`, { size: 28, font: FONT }),
      k.color(...INK),
      k.pos(748, 196),
      k.anchor("center"),
    ]);

    const buddy = panda(k, { x: 170, y: 640, size: 230 });

    // The prompt: e.g. "Pick two boats that make 10".
    k.add([
      k.text(config.prompt(round), { size: 64, font: FONT }),
      k.color(...INK),
      k.pos(748, 310),
      k.anchor("center"),
    ]);

    const ctx = {
      k, round, ri: roundIdx, totalRounds: config.roundCount,
      bar, buddy, state,
      onCorrect: config.onCorrect,
      onWrong: config.onWrong || defaultOnWrong,
    };
    ctx.body = config.body(ctx);

    // The picking grid is exposed on ctx so onCorrect/onWrong can mutate it
    // (highlight, fade, shake). The body must set ctx.items to an array of
    // { value, node, setDisabled(bool), shake() } descriptors.
    if (!Array.isArray(ctx.items)) {
      throw new Error(
        `pairScene body() for ${config.sceneName} must set ctx.items to an array`,
      );
    }

    function tryPair(aIdx, bIdx) {
      if (state.done) return;
      if (state.selections.includes(aIdx) || state.selections.includes(bIdx)) return;
      const a = ctx.items[aIdx].value;
      const b = ctx.items[bIdx].value;
      const sum = a + b;

      if (sum === config.target) {
        // Correct — record, animate, advance step.
        state.selections.push(aIdx, bIdx);
        state.foundPairs += 1;
        ctx.items[aIdx].setDisabled(true);
        ctx.items[bIdx].setDisabled(true);
        ctx.onCorrect(ctx, a, b);

        window.PandaAudio.playCue(
          config.correctCue?.(a, b) || ENCOURAGE[state.foundPairs % ENCOURAGE.length],
        );
        buddy.setMood("cheer", { silent: true });

        if (state.foundPairs >= totalSteps) {
          state.done = true;
          bar.setStep(totalSteps + 1);
          k.wait(1.0, () => {
            window.PandaAudio.playCue(config.roundEndCue(round));
            if (roundIdx + 1 < config.roundCount) {
              roundIdx += 1;
              k.go(config.sceneName);
            } else {
              saveProgress(config.levelId);
              window.PandaAudio.playCue("lvl-done");
              roundIdx = 0;
              k.go("gamesPicker");
            }
          });
        } else {
          bar.setStep(state.foundPairs + 1);
          // Clear selection so the player can pick the next pair.
          state.selections.length = 0;
        }
      } else {
        // Wrong — shake both items, encourage, no progress.
        ctx.items[aIdx].shake();
        ctx.items[bIdx].shake();
        ctx.onWrong(ctx, a, b);
        window.PandaAudio.playCue("enc-try");
      }
    }

    // Wire up item clicks: pick 1 = first selection, pick 2 = tryPair.
    let pending = null;
    ctx.items.forEach((item, idx) => {
      const onTap = () => {
        if (state.done) return;
        if (state.selections.includes(idx)) return;
        if (item.value === null || item.value === undefined) return;
        if (pending === null) {
          pending = idx;
          item.highlight?.();
        } else {
          const first = pending;
          pending = null;
          ctx.items[first].unhighlight?.();
          if (first === idx) return;
          tryPair(first, idx);
        }
      };
      item.node.onClick(onTap);
    });

    // Clicking the panda clears the pending selection — saves the child a
    // frustrating reset when they accidentally tap something they didn't mean.
    buddy.setMood("idle");
    if (buddy.root) {
      buddy.root.onClick(() => {
        if (pending !== null) {
          ctx.items[pending].unhighlight?.();
          pending = null;
        }
      });
    }
  }

  return function scene(k) {
    // Audio: only the first round of a session speaks. Subsequent rounds
    // continue silently to keep the rhythm from getting noisy.
    if (roundIdx === 0) {
      window.PandaAudio.playCue(config.introCue);
    }
    const round = {
      index: roundIdx,
      candidates: config.candidates(roundIdx),
      pairs: config.pairs(roundIdx),
    };
    drawRound(k, round);
  };
}

function saveProgress(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, levelId + 1);
  save.starsByGame = save.starsByGame || {};
  save.starsByGame[levelId] = (save.starsByGame[levelId] || 0) + 1;
  window.PandaSave?.save(save);
}

export { shuffle };
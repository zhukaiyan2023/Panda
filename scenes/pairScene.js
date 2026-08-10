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
import { pickCheerCue, pickWrongCue } from "../audio/praise.js";
import { celebrate } from "../components/celebration.js";

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

// Default wrong-pick handler: panda sprite switches to "thinking" pose.
// The audio cue for the wrong pick is fired explicitly in tryPair
// (pickWrongCue → enc-wrong-N), so defaultOnWrong runs silent —
// otherwise setMood("think") would re-fire "enc-try" (now gone) on top
// of the explicit enc-wrong-N, double-playing the audio.
function defaultOnWrong(ctx, a, b) {
  ctx.buddy.setMood("think", { silent: true });
}

export default function createPairScene(config) {
  let roundIdx = 0;
  // Streak of consecutive correct picks across this game's session —
  // drives the process-praise tier in tryPair. Resets on wrong pick or
  // when the kid taps ←. Lives on the scene closure (above drawRound)
  // so it persists across the rounds of one play-through.
  let streak = 0;
  // Sticky flag flipped on the first wrong pick this session. Used by
  // pickCheerCue to gate enc-streak5-1 ("你试了好几次才对，这叫有耐心")
  // — its text only makes sense if the kid actually missed at least once.
  // Never resets (mirrors roundScene's behaviour).
  let hadWrongs = false;

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
        streak = 0;
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

    const buddy = panda(k, { x: 170, y: 640, size: 180 });

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
        streak += 1;
        state.selections.push(aIdx, bIdx);
        state.foundPairs += 1;
        ctx.items[aIdx].setDisabled(true);
        ctx.items[bIdx].setDisabled(true);
        ctx.onCorrect(ctx, a, b);

        // Tier-based dispatch (see audio/praise.js) — same system as
        // roundScene. The chain already includes the panda-cue on
        // streak-3+ (panda-praise-N) or level-complete (panda-cheer-N);
        // no separate playAfter → panda-celebrate call needed. The old
        // pattern double-played the panda voice on every correct pick.
        //
        // `isRoundComplete` flips to true when this is the last pair in
        // the round — that dispatches the "level" tier (enc-level-N +
        // panda-cheer-N) so the round-end navigation chains off an
        // appropriately celebratory last cue.
        const isRoundComplete = state.foundPairs >= totalSteps;
        const { chain, lastEncourageId, tier } = pickCheerCue({
          streak,
          isRoundComplete,
          levelId: config.levelId,
          // Discovery feedback (math-specific praise like "你找到了能
          // 凑成十的一对") doesn't apply to pair games — the kid isn't
          // learning a math rule here, just playing a memory/matching
          // game with target=10. Gate hasDiscovery off.
          hasDiscovery: false,
          // Gate enc-streak5-1 on the kid having actually missed before
          // — see the `let hadWrongs` declaration above drawRound.
          hadWrongs,
        });
        ctx.lastEncourageId = lastEncourageId;
        window.PandaAudio.playSequence(chain, 200, 0);
        buddy.setMood("cheer", { silent: true });
        // Visual celebration at the midpoint of the two picked items
        // so the burst lands between the boat/cloud/bubble the kid
        // just matched, not at a random spot.
        const aNode = ctx.items[aIdx].node;
        const bNode = ctx.items[bIdx].node;
        const mx = (aNode.pos.x + bNode.pos.x) / 2;
        const my = (aNode.pos.y + bNode.pos.y) / 2;
        celebrate(k, {
          tier,
          anchor: { x: mx, y: my },
          pandaBody: buddy?.body,
          pandaBaseSize: 180,
        });

        if (isRoundComplete) {
          state.done = true;
          bar.setStep(totalSteps + 1);
          // Wait for the celebration audio to actually end before
          // playing the round-end cue and navigating. playAfter hooks
          // ctx.lastEncourageId's `ended` event — no k.wait guess.
          // Was hardcoded to "panda-celebrate" before; now follows
          // the actual last cue of the new tier chain (panda-cheer-N
          // on round-complete, panda-praise-N on streak tiers).
          if (roundIdx + 1 < config.roundCount) {
            const endIds = config.roundEndCue(round) ? [config.roundEndCue(round)] : [];
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              endIds,
              { gapMs: 0, seqGapMs: 0 },
              () => {
                roundIdx += 1;
                k.go(config.sceneName);
              },
            );
          } else {
            saveProgress(config.levelId);
            window.PandaAudio.playAfter(
              ctx.lastEncourageId,
              ["lvl-done"],
              { gapMs: 0, seqGapMs: 0 },
              () => {
                roundIdx = 0;
                k.go("gamesPicker");
              },
            );
          }
        } else {
          bar.setStep(state.foundPairs + 1);
          // Clear selection so the player can pick the next pair.
          state.selections.length = 0;
        }
      } else {
        // Wrong — shake both items, encourage, no progress. Plays an
        // enc-wrong-N cue from the new tier system (the old "enc-try"
        // cue is GONE). panda.js's setMood("think") would have fired
        // enc-try automatically — but now we explicitly play an
        // enc-wrong-N here so the wrong-path audio is consistent
        // across pair games. Pass {silent: true} to setMood so the
        // panda changes pose without double-playing its own audio.
        streak = 0;
        // Sticky flag: any future streak-5 cue can now include
        // enc-streak5-1's "你试了好几次才对，这叫有耐心" line.
        hadWrongs = true;
        ctx.items[aIdx].shake();
        ctx.items[bIdx].shake();
        buddy.setMood("think", { silent: true });
        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue(pickWrongCue());
        ctx.onWrong(ctx, a, b);
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
    };
    // Build candidates first, then derive pairs from them — so the round's
    // "valid pairs" always refer to numbers actually on the board. The
    // earlier version called candidates() and pairs() separately; a pairs
    // generator that re-rolled its own candidates could advertise a pair
    // that wasn't shown.
    round.candidates = config.candidates(roundIdx);
    round.pairs = config.pairs(roundIdx, round.candidates);
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
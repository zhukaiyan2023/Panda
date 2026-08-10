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
import { pickCheerCue, pickWrongCue } from "../audio/praise.js";
import { celebrate } from "../components/celebration.js";

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
  // Panda shrunk from 230 → 180 (2026-08-10). The previous size made
  // the panda dominate the left third of the canvas and could press
  // against the body row when an L1 round carried the maximum 10 beads
  // (body left edge ≈ x=320, panda right edge ≈ x=285 — only 35 px of
  // clearance). 180 × 180 with the same (x, y) anchor gives ~50 px of
  // margin from the body, ~50 px from the buttons, and stops the panda
  // from competing visually with the equation.
  pandaX: 170,
  pandaY: 640,
  pandaSize: 180,
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
  // Streak of consecutive correct picks across rounds AND steps in this
  // session — drives the process-praise tier in onPick. Resets to 0 on
  // wrong pick (a real mistake, not just disabled re-tap) or when the
  // kid taps ← (intentional: a fresh entry shouldn't inherit another
  // session's run). Lives on the scene closure (above drawRound) so it
  // persists across the 10 sampled rounds within one play-through.
  let streak = 0;
  // Total count of wrong picks this session — flipped to true on the
  // first wrong answer and never reset. Used by pickCheerCue so the
  // "你试了好几次才对，这叫有耐心" cue (enc-streak5-1) only fires when
  // the kid has actually missed at least once — otherwise a clean run
  // of 5 would hear "you tried several times", which is wrong.
  let hadWrongs = false;
  // Sampled round sequence for this session — drawn once when the scene
  // starts (roundIdx === 0), then walked through in order. The next time
  // the kid enters this level, a fresh sample is drawn. Pool comes from
  // either data/pools.js's poolGens[levelId] (the default) or a custom
  // config.poolGen. sampleSize defaults to 10.
  let sampledRounds = null;
  const poolGen = config.poolGen || null;
  const sampleSize = config.sampleSize ?? 10;

  function drawRound(k, round, ri, totalRounds) {
    const state = { step: 1, locked: new Set(), buttons: [], body: null };

    k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

    iconButton(k, {
      label: "←",
      x: LAYOUT.iconX, y: LAYOUT.backY, w: 96, h: 72,
      fontSize: 44,
      onClick: () => {
        roundIdx = 0;
        streak = 0;
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
        const bx = startX + i * (buttonW + gap);
        const btn = choice(k, {
          label: String(v),
          x: bx,
          y: LAYOUT.buttonY,
          w: buttonW, h: buttonH,
          onClick: () => onPick(v, i),
        });
        state.buttons.push({ btn, value: v, x: bx, y: LAYOUT.buttonY });
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
      // deferEquation lets a step own when its sub-question appears.
      // The step still returns the equation so onAdvance() can use it,
      // but buildStep skips the immediate render — the step's audio
      // chain is responsible for calling setEquation from its onComplete
      // callback. Used by L1 step 1 so "2+3=?" only appears AFTER the
      // audio has read "2+3+4等于几", not at the same instant the
      // explanation starts.
      if (built.equation && !built.deferEquation) {
        setEquation(built.equation, built.equationOpts || {});
      }
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
      // Any tap on an answer button — right or wrong — stops whatever
      // spoken sentence was still going. The kid has engaged; the
      // remaining audio for this step is no longer relevant. The
      // correct branch immediately plays the tier-based cheer chain
      // on top of the silence; the wrong branch sits in silence for
      // the enc-wrong cue.
      window.PandaAudio.stopAllAudio();
      if (value === stepCfg.question.correct) {
        streak += 1;
        state.locked.add(idx);
        state.buttons[idx].btn.setCorrect();
        buddy.setMood("cheer", { silent: true });
        // Tier-based dispatch (see audio/praise.js). Returns the chain
        // to play as a sequence, the id of the LAST cue in that chain
        // (used as the anchor for onAdvance audio gates), and the
        // tier name for logging.
        //
        // Chain shapes:
        //   first    → [enc-first-N]                   (or + enc-specific-N for L2/L3 discovery)
        //   streak3  → [enc-streak3-N, panda-praise-N] (panda joins at 3)
        //   streak5  → [enc-streak5-N, panda-praise-N]
        //   streak10 → [enc-streak10-N, panda-praise-N]
        //   level    → [enc-level-N,    panda-cheer-N]
        //
        // No more "好棒 / panda-celebrate" double-praise stacking —
        // the panda-cue only fires on streak-3+ or level-complete.
        const isRoundComplete = state.step >= config.steps.length;
        const { chain, lastEncourageId, tier } = pickCheerCue({
          streak,
          isRoundComplete,
          levelId: config.levelId,
          hasDiscovery: !!stepCfg.hasDiscovery,
          // Gate enc-streak5-1 ("你试了好几次才对，这叫有耐心") on the
          // kid having actually missed before. See the `let hadWrongs`
          // declaration above for the rationale.
          hadWrongs,
        });
        // Stash on ctx so a step's onAdvance can chain its post-celebration
        // audio (e.g. L1 step 2's equation read-back) off the actual
        // LAST cue in the chain — first-tier ends on enc-first-N,
        // streak tiers end on panda-praise-N, level-complete ends on
        // panda-cheer-N. Was hardcoded to "panda-celebrate" before;
        // now follows whichever cue actually played.
        ctx.lastEncourageId = lastEncourageId;
        // Play the chain as one playSequence. seqGapMs 200 gives the
        // enc + panda-cue room to breathe without dragging. The
        // chain uses playCueRaw internally (per the function's
        // contract), so it won't cancel itself mid-flight.
        window.PandaAudio.playSequence(chain, 200, 0);
        // Visual celebration — tier-matched fireworks / sparkles that
        // run in parallel with the audio chain. See
        // components/celebration.js. The anchor is the tapped button so
        // the first-correct sparkle bursts out of where the kid tapped,
        // not from a random spot. The panda body is passed only for the
        // level-complete hop.
        const tappedBtn = state.buttons[idx];
        celebrate(k, {
          tier,
          anchor: tappedBtn ? { x: tappedBtn.x, y: tappedBtn.y } : null,
          pandaBody: buddy?.body,
          pandaBaseSize: LAYOUT.pandaSize,
        });
        // stepCfg.onAdvance may return a thenable (Promise) — for
        // audio-gated advances like L1 step 2's equation read-back,
        // the promise resolves when the audio chain finishes, and
        // roundScene waits on it instead of guessing with
        // advancePauseMs.
        //
        // For steps whose onAdvance returns no Promise, advance is
        // gated on the cheer chain's last cue (ctx.lastEncourageId)
        // firing its `ended` event — fully event-driven. The old
        // k.wait(d, advance) timer based the transition on a fixed
        // ms guess, which the user flagged as too slow and prone to
        // overlapping with panda-celebrate's tail.
        //
        // advancePauseMs is kept as a safety ceiling for both paths
        // so a stuck audio chain (e.g. an audio element with no
        // `ended` event ever firing on iPad Safari) can't lock the
        // game. The `advanced` flag dedupes whichever wins.
        const advanceResult = stepCfg.onAdvance ? stepCfg.onAdvance(ctx) : null;
        let advanced = false;
        const adv = () => {
          if (advanced) return;
          advanced = true;
          advance(prev);
        };
        if (advanceResult && typeof advanceResult.then === 'function') {
          advanceResult.then(adv);
        } else {
          // Default: advance when the celebration audio's last cue
          // ends. The cheer chain (enc + maybe panda-cue) is playing
          // now via playSequence; we wait on its last cue. Each
          // level's fireStepAudio chains the next step's audio off
          // this same ctx.lastEncourageId so the new step audio never
          // starts before the celebration's tail finishes.
          const lastEl = window.PandaAudio.audio[lastEncourageId];
          if (lastEl) {
            lastEl.addEventListener("ended", () => adv(), { once: true });
          } else {
            // lastEncourageId audio element missing — fall back to
            // immediate advance so the kid isn't stuck.
            adv();
          }
        }
        if (stepCfg.advancePauseMs != null) {
          const d = window.__skipTimers
            ? TEST_DELAY
            : stepCfg.advancePauseMs / 1000;
          k.wait(d, adv);
        }
      } else {
        // Wrong pick — break the streak (a wrong answer is exactly the
        // "real mistake" that should reset run-length). Then play a
        // wrong-answer cue from the new tier system: universal
        // enc-wrong-N (any level) or enc-near-N for near-miss
        // coaching in L2/L3 (the level opts in via stepCfg.isNearMiss).
        //
        // No longer relies on panda.js's MOOD_CUE.think firing enc-try
        // (the old "enc-try" cue is GONE). buddy.setMood runs with
        // {silent: true} so the panda sprite changes to its "thinking"
        // pose without double-playing its own audio — we explicitly
        // fire the wrong cue below.
        //
        // `hadWrongs` is sticky: it never resets, so any future streak-5
        // cue picks from the full pool (including enc-streak5-1's
        // "你试了好几次才对，这叫有耐心"). See the closure-level comment.
        streak = 0;
        hadWrongs = true;
        state.buttons[idx].btn.setDisabled(true);
        buddy.setMood("think", { silent: true });
        const wrongCue = pickWrongCue({ isNearMiss: !!stepCfg.isNearMiss });
        window.PandaAudio.playCue(wrongCue);
      }
    }

    function advance(prev) {
      const d = window.__skipTimers ? TEST_DELAY : STEP_DELAY;
      if (state.step >= config.steps.length) {
        // Last step done — finish the round directly. The audio gate
        // already waited for the celebration (or reward) audio to
        // finish before getting here, so no extra timer is needed.
        finishRound();
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
      // through after a short pause so the screen doesn't sit still. A step
      // that knows it'll be a no-op (e.g. L2's non-make-ten "steps 2-4")
      // can set `noQuestionDelay: <seconds>` to skip the default 4s pad —
      // there's nothing for the child to look at, so waiting would just be
      // dead time.
      if (!ctx.lastHadQuestion) {
        const stepCfg = config.steps[state.step - 1] || {};
        const stepDelay = stepCfg.noQuestionDelay != null
          ? stepCfg.noQuestionDelay
          : d;
        autoAdvanceTimer = k.wait(stepDelay, () => {
          if (state.step >= config.steps.length) {
            finishRound();
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
        return;
      }
      // Last round over — navigate to the level picker. The previous
      // "lvl-done" cue ("all done") was removed per user feedback;
      // the kid just gets back to the level map after the celebration
      // audio. panda-celebrate has already ended by the time we get
      // here (advance was gated on it), so navigating immediately is
      // a clean exit.
      saveProgress(config.levelId);
      roundIdx = 0;
      k.go("levelPicker");
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

    // First entry (or after the kid completed the previous sample) —
    // draw a fresh N rounds from the level's pool. Without this every
    // replay would see the exact same 6 rounds.
    if (roundIdx === 0 || !sampledRounds) {
      const pool = poolGen ? poolGen() : (data.rounds || []);
      // shuffle() is in this module — pool order is otherwise deterministic.
      sampledRounds = shuffle(pool).slice(0, sampleSize);
    }

    if (roundIdx === 0) {
      window.PandaAudio.playCue(data.intro || config.introCue);
    }
    const round = sampledRounds[roundIdx] || sampledRounds[0];
    drawRound(k, round, roundIdx, sampledRounds.length);
  };
}

export { shuffle };
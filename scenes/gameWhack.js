// scenes/gameWhack.js — whack-a-mole (rebuilt 2026-08-15).
//
// Single-tap-answer mechanic. 6 holes (3x2 grid). Each hole carries a
// mole with a candidate-answer number. Equation "a + b = ?" displayed
// at the top. 90-second timer; max correct = score.
//
// Audio chain lives entirely in this scene — no shared pairScene/pickCheer
// owner. pickCheerCue() is called here on correct picks, then
// PandaAudio.playSequence is fired directly. The audio safety ceiling
// (panda memory) is enforced: every chain's total duration is summed for
// the fallback timer, never a single lastEncourageId.duration.

import stepBar from "../components/stepBar.js?v=20260815";
import panda from "../components/panda.js?v=20260815";
import { iconButton } from "../components/choice.js?v=20260815";
import { INK, PAPER, FONT, GREEN, ORANGE, DANGER } from "../components/theme.js?v=20260815";
import sceneBg from "../components/sceneBg.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import whackHole from "../components/whackHole.js?v=20260815";
import { celebrate } from "../components/celebration.js?v=20260815";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260815";
import { buildQuestion, pickType } from "../data/whackRounds.js?v=20260815";

const TIME_LIMIT = 90;
const HOLE_COUNT = 6;
const HOLE_COLS = 3;
const HOLE_CELLW = 320;
const HOLE_CELLH = 220;
const GRID_X = 748 - ((HOLE_COLS - 1) * HOLE_CELLW) / 2;  // 428
const GRID_Y0 = 540;
const GRID_Y1 = 760;

// Mulberry32 for stable hole-variant assignment.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleSeeded(arr, rng) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// State lives on the scene closure so it survives across rounds.
let roundIdx = 0;
let streak = 0;
let correctCount = 0;
let prevKey = null;

function saveProgress(levelId, count) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, levelId + 1);
  save.starsByGame = save.starsByGame || {};
  const stars = count >= 10 ? 3 : count >= 6 ? 2 : count >= 2 ? 1 : 0;
  const prev = save.starsByGame[levelId] || 0;
  if (stars > prev) save.starsByGame[levelId] = stars;
  window.PandaSave?.save(save);
}

// Sum the audio chain's total runtime so the fallback timer never cuts
// a cue mid-stride (panda memory). Each entry's `duration` comes from
// PandaAudio.audio[id]?.duration (in seconds). Gap is the seqGapMs / 1000
// between consecutive cues.
function chainDurationSec(chain, seqGapMs) {
  const gap = (seqGapMs || 0) / 1000;
  let total = 0;
  for (const id of chain) {
    const dur = window.PandaAudio?.audio?.[id]?.duration || 0;
    total += dur + gap;
  }
  return total + 0.5;  // post-buffer
}

// Summary overlay shown after the 90s timer expires. Renders a full-screen
// PAPER scrim at z=50 (above every scene element), the big "做对 N 题"
// headline at z=51, and a 1-3 star row based on correctCount. Saves
// progress via saveProgress(5, ...) and auto-returns to gamesPicker after
// 3s. Stars: ≥10 → 3, ≥6 → 2, ≥2 → 1, else 0 (matches saveProgress's
// star math so on-screen and saved stars agree).
function showSummary(k, correctCount, buddy) {
  const stars = correctCount >= 10 ? 3 : correctCount >= 6 ? 2 : correctCount >= 2 ? 1 : 0;
  const W = k.width();

  // Scrim.
  k.add([
    k.rect(W, k.height(), { radius: 0 }),
    k.color(...PAPER),
    k.opacity(0.6),
    k.pos(W / 2, k.height() / 2),
    k.anchor("center"),
    k.z(50),
  ]);

  // Headline.
  k.add([
    k.text(`做对 ${correctCount} 题`, { size: 96, font: FONT }),
    k.color(...INK),
    k.pos(W / 2, 360),
    k.anchor("center"),
    k.z(51),
  ]);

  // Stars row — filled (ORANGE) for earned, dim+INK-tinted for unearned.
  const starY = 540;
  const starGap = 130;
  for (let i = 0; i < 3; i++) {
    const cx = W / 2 + (i - 1) * starGap;
    const filled = i < stars;
    k.add([
      k.sprite("star"),
      k.pos(cx, starY),
      k.anchor("center"),
      k.scale(0.4),
      k.opacity(filled ? 1 : 0.25),
      k.color(...(filled ? ORANGE : INK)),
      k.z(51),
    ]);
  }

  // Save once, then auto-return after 3s. Reset module-scoped counters so
  // the next entry starts clean. saveProgress(5, correctCount) only fires
  // here — the correct-tap branch never calls saveProgress, so we never
  // double-save.
  saveProgress(5, correctCount);
  k.wait(3.0, () => {
    roundIdx = 0;
    streak = 0;
    k.go("gamesPicker");
  });
}

export default function gameWhack(k) {
  sceneBg(k, "bg-meadow");

  // === State container for runtime mutables (declared early so handlers
  // can close over). `pending` is the index of the hole currently being
  // considered — single-tap-answer: flash on the first pick. `finished`
  // is set when the 90-second timer expires and we transition to the
  // results scene. Also set by the back-button so surviving k.wait
  // callbacks (which all check state.finished) don't fire on the
  // destination scene and spawn stray moles/equation/audio.
  // `sceneAlive` is cleared ONLY by the back button so the timeup chain's
  // own k.wait callbacks can bail when the player hits ← during the
  // post-timer celebration (otherwise the celebrate/playSequence/showSummary
  // block would land on the gamesPicker scene after navigation).
  const state = {
    finished: false,
    pending: null,
    sceneAlive: true,
  };

  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => {
      // Gate surviving k.wait callbacks before navigating — otherwise
      // the in-flight celebration chain (correct/wrong path) fires on
      // gamesPicker and spawns stray moles + audio.
      state.sceneAlive = false;
      state.finished = true;
      roundIdx = 0;
      streak = 0;
      k.go("gamesPicker");
    },
  });

  // Step bar (steps are unbounded; render up to 30 ticks).
  const bar = stepBar(k, {
    labels: Array.from({ length: 31 }, (_, i) => i === 0 ? "开始" : `${i}`),
    step: 0,
    x: 748, y: 84, w: 1060, h: 36,
  });

  // Title.
  k.add([
    k.text("打地鼠 · 水墨出题", { size: 36, font: FONT }),
    k.color(...INK),
    k.pos(748, 160),
    k.anchor("center"),
  ]);

  // Score pill (top-right).
  const scoreText = k.add([
    k.text("做对 0 题", { size: 32, font: FONT }),
    k.color(...INK),
    k.pos(1240, 196),
    k.anchor("center"),
  ]);

  // Timer pill (top-right below score, second line — but we want timer
  // prominent, so swap: timer top-right, score below it).
  scoreText.pos.x = 1240;
  scoreText.pos.y = 240;

  const timerText = k.add([
    k.text(`${TIME_LIMIT}`, { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(1240, 130),
    k.anchor("center"),
  ]);
  k.add([
    k.text("秒", { size: 24, font: FONT }),
    k.color(...INK),
    k.opacity(0.6),
    k.pos(1300, 145),
    k.anchor("center"),
  ]);

  // Panda.
  const buddy = panda(k, { x: 130, y: 800, size: 200 });

  // Clicking the panda clears any pending selection (currently unused
  // but mirrors pairScene for consistency).
  if (buddy.root) {
    buddy.root.onClick(() => {
      if (state.pending !== null) {
        holes[state.pending].setSelected(false);
        state.pending = null;
      }
    });
  }

  // Equation — re-rendered per question via destroy + recreate (see
  // buildAndSpawn below). The component exposes only slotCenters /
  // slotSizes / slotY — not textNodes — so in-place text mutation isn't
  // available. `let` (not const) so the next round's buildAndSpawn can
  // reassign after destroying the current root.
  let eq = expression(k, {
    slots: ["□", "+", "□", "=", "□"],
    x: 748, y: 320, size: 100,
    boxMode: true,
  });

  // Hint.
  k.add([
    k.text("点中头顶是答案的地鼠", { size: 32, font: FONT }),
    k.color(...INK),
    k.opacity(0.7),
    k.pos(748, 420),
    k.anchor("center"),
  ]);

  // Grass strip behind the holes.
  k.add([
    k.sprite("grass-ground"),
    k.pos(GRID_X - (1100 - HOLE_COLS * HOLE_CELLW) / 2, GRID_Y0 - 100),
    k.z(0),
  ]);

  // Hole grid.
  const sceneSeed = (Date.now() ^ 0xA53F19B1) >>> 0;
  const variants = shuffleSeeded([0, 0, 1, 1, 2, 2], mulberry32(sceneSeed));
  const holes = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const col = i % HOLE_COLS;
    const row = Math.floor(i / HOLE_COLS);
    const x = GRID_X + col * HOLE_CELLW;
    const y = row === 0 ? GRID_Y0 : GRID_Y1;
    const h = whackHole(k, { x, y, variant: variants[i] });
    // Per-hole tap lock — first valid tap sets this; buildAndSpawn clears
    // it on the next popUp. Prevents a fast double-tap inside the 0.5s
    // flash phase from inflating streak/score + racing audio chains.
    h._tapped = false;
    holes.push(h);
  }

  // Map streak → celebration tier (matches audio/praise.js pickTier).
  // First-tier chains are enc-first-N only; streak-3+ add a panda-cue;
  // the visual burst count is tier-matched in components/celebration.js.
  function streakTier(s) {
    if (s >= 10) return "streak10";
    if (s >= 5) return "streak5";
    if (s >= 3) return "streak3";
    return "first";
  }

  // === Question builder ===
  //
  // Pulls a fresh question from the data layer, re-renders the equation
  // (destroy + recreate since textNodes isn't exposed), pops up 6 moles
  // with the question's candidates, then fires the "算一算 a 加 b"
  // read-out chain. For the FIRST question we chain the read-out off the
  // intro's `whack-start` cue (no stopAllAudio — would cut the intro
  // mid-stride and violate the single-active-audio invariant). Subsequent
  // questions use stopAllAudio() + playSequence to clear any residual cue.
  let currentQ = null;
  function buildAndSpawn(isFirst = false) {
    const type = pickType(roundIdx);
    currentQ = buildQuestion(type, prevKey);
    prevKey = currentQ.key;
    roundIdx += 1;

    // Update equation — destroy the old root and re-render with the new
    // slots. Keep the same x / y / size / boxMode so the row sits in the
    // same place on screen. Last slot stays "□" so the unknown reads as
    // a hand-drawn box, not a "?" glyph (per user feedback 2026-08-11:
    // "用这个方格子表示未知，不要用问号了").
    //
    // reserve[] locks per-slot widths to the widest content the row will
    // ever hold: Type B a ∈ [11..18] → 2-digit "11"; b up to 9 → "9";
    // answer slot mirrors a → "11". Without reserve[], the 2-digit `a`
    // slot widens between rounds and shifts the whole row.
    eq.destroy();
    eq = expression(k, {
      slots: [String(currentQ.a), "+", String(currentQ.b), "=", "□"],
      x: 748, y: 320, size: 100,
      boxMode: true,
      reserve: ["17", "+", "9", "=", "11"],
    });

    // Populate 6 holes — each hole shows one of the 6 candidates (the
    // correct answer + 5 distractors, shuffled by buildQuestion). Reset
    // the per-hole tap lock here so the next question is tappable.
    for (let i = 0; i < HOLE_COUNT; i++) {
      holes[i]._tapped = false;
      holes[i].popUp(currentQ.candidates[i]);
    }

    // Read-out: "算一算 a 加 b" — [whack-q-pre, n-A, q-plus, n-B].
    const readChain = [
      "whack-q-pre",
      `n-${currentQ.a}`,
      "q-plus",
      `n-${currentQ.b}`,
    ];

    if (isFirst) {
      // Chain off the intro's last cue ("whack-start") so the read-out
      // starts as soon as "开始" finishes — no stopAllAudio, which would
      // cut the intro mid-stride (single-active invariant).
      window.PandaAudio.playAfter("whack-start", readChain, {
        gapMs: 200,
        seqGapMs: 200,
      });
    } else {
      // Subsequent questions: clear any residual audio, then play fresh.
      // stopAllAudio enforces single-active-audio (panda memory).
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playSequence(readChain, 200, 0);
    }
  }

  // Scene-entry audio: intro + start. The first question's read-out
  // chains off `whack-start` inside buildAndSpawn(true) so we never have
  // two chains overlapping (single-active invariant). Subsequent
  // buildAndSpawn(false) calls use the stopAllAudio + playSequence path.
  window.PandaAudio.playSequence(["whack-intro", "whack-start"], 200, 0);

  // Initial spawn (replaces the random 1..9 placeholder loop). The
  // first-question read-out is chained off `whack-start` above; tap-handler
  // and win/lose flows call buildAndSpawn(false) for subsequent rounds.
  buildAndSpawn(true);

  // === Tap handler (single-tap-answer) ===
  // Each hole carries one candidate. Tap compares getValue() against
  // currentQ.answer. Correct → flash + retreat + cheer chain + advance
  // once the audio ends. Wrong → shake + wrong-cue + auto-advance after
  // the cue finishes (so the kid is never stuck on a wrong pick).
  //
  // Hit-target sits above the hole rim, centered on the mole's face
  // position (y - 120, per whackHole.js MOLE_Y_OFFSET). Width 220 ×
  // height 200 — slightly larger than the mole's on-screen size so
  // 3-6 year-olds can land it with a finger tap on iPad Safari.
  const TAP_HIT_W = 220;
  const TAP_HIT_H = 200;
  holes.forEach((h) => {
    const hit = k.add([
      k.rect(TAP_HIT_W, TAP_HIT_H, { radius: 20 }),
      // Anchor center so k.pos(h.x, h.y - 120) lands the rect's center
      // on the mole's face. Without k.anchor("center") — kaplay's rect
      // default anchor is topleft — the box would extend rightward of
      // h.x by TAP_HIT_W/2 (≈110px), so taps on the left half of the
      // mole would miss entirely. The -120 matches MOLE_Y_OFFSET in
      // whackHole.js (mole head pokes 120px above the hole rim).
      k.anchor("center"),
      k.pos(h.x, h.y - 120),
      k.opacity(0),
      k.area(),
    ]);
    hit.onClick(() => {
      // Taps landing after the 90s timer has expired are no-ops; the
      // results scene is about to take over.
      if (state.finished) return;
      // Empty holes (post-retreat / not yet populated) can't be answered.
      if (!h.isOccupied()) return;
      // Per-hole tap lock — first valid tap sets it, buildAndSpawn clears
      // it on the next popUp. Prevents a fast double-tap inside the 0.5s
      // flash phase from inflating streak/score + racing audio chains.
      if (h._tapped) return;
      h._tapped = true;
      const v = h.getValue();
      if (v === currentQ.answer) {
        // === CORRECT ===
        streak += 1;
        correctCount += 1;
        scoreText.text = `做对 ${correctCount} 题`;
        bar.setStep(Math.min(correctCount + 1, 30));
        const tier = streakTier(streak);

        // Visual: flashCorrect (which calls retreat internally once the
        // halo fades) + tier-matched particle burst at the mole's face.
        h.flashCorrect();
        celebrate(k, {
          tier,
          anchor: { x: h.x, y: h.y - 120 },
          pandaBody: buddy?.body,
          pandaBaseSize: 200,
        });

        // Audio: stop anything playing, then fire the chain. The first
        // half (whack-tap → whack-correct) plays as discrete playCue
        // calls separated by short timer waits so the snap sound bytes
        // the start of whack-correct cleanly — no overlap, per
        // panda-audio-event-driven memory's single-active invariant.
        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue("whack-tap");
        k.wait(0.05, () => window.PandaAudio.stopAllAudio());
        k.wait(0.06, () => window.PandaAudio.playCue("whack-correct"));

        // Once whack-correct ends, fire the streak cheer chain. Then
        // after the chain ends, advance to the next question via
        // buildAndSpawn(false) — not the isFirst flag, since we already
        // finished the intro chain earlier.
        const { chain } = pickCheerCue({
          streak,
          isRoundComplete: false,
          levelId: 5,
          // No math discovery for gameWhack — the kid isn't learning
          // 凑十法 here, just playing a matching game.
          hasDiscovery: false,
        });
        // Wait for whack-correct's natural audio duration + small post-
        // buffer before kicking off the cheer chain. Reading the cue's
        // loaded duration keeps the wait accurate; if it isn't loaded
        // yet (first tap before Safari decodes metadata), fall back to
        // a conservative 0.8s so we never cut whack-correct mid-
        // syllable. After the cheer chain, sum its full runtime so the
        // fallback timer can't pre-empt it — per
        // panda-audio-safety-ceiling-full-chain memory.
        const whackCorrectDur =
          (window.PandaAudio?.audio?.["whack-correct"]?.duration || 0.6) +
          0.2;
        k.wait(whackCorrectDur, () => {
          if (state.finished) return;
          window.PandaAudio.playSequence(chain, 200, 0);
          const cheerDur = chainDurationSec(chain, 200);
          k.wait(cheerDur, () => {
            if (!state.finished) buildAndSpawn();
          });
        });
      } else {
        // === WRONG ===
        streak = 0;
        h.shake();

        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue("whack-tap");
        k.wait(0.05, () => window.PandaAudio.stopAllAudio());
        k.wait(0.06, () => {
          const wrongCue = pickWrongCue();
          window.PandaAudio.playCue(wrongCue);
          // chainDurationSec on a single-element chain reduces to
          // (wrongCue.duration + 0.5s buffer). Sums the FULL cue per
          // panda-audio-safety-ceiling-full-chain so the auto-advance
          // never cuts the wrong-cue off mid-sentence.
          const wd = chainDurationSec([wrongCue], 0);
          k.wait(wd, () => {
            if (!state.finished) buildAndSpawn();
          });
        });
      }
    });
  });

  // === 90s timer ===
  // Decrements timerText every frame (display rounds to ceil). Below 10s,
  // color flips to DANGER red and the text pulses 0.95→1.05 every second.
  // At 0 the tick cancels itself, sets state.finished, and fires the
  // time-up chain: whack-timeup cue → celebrate + cheer chain → summary
  // overlay. chainDurationSec sums the full cheer chain so the fallback
  // timer (inner k.wait) can't pre-empt the celebration mid-stride — per
  // panda-audio-safety-ceiling-full-chain memory.
  const start = k.time();
  const tick = k.onUpdate(() => {
    // Back button cleared sceneAlive; tick should also wind down so it
    // doesn't keep mutating timerText on the gamesPicker scene.
    if (state.finished) { tick.cancel(); return; }
    const elapsed = k.time() - start;
    const remaining = Math.max(0, Math.ceil(TIME_LIMIT - elapsed));
    timerText.text = String(remaining);
    if (remaining <= 10) {
      timerText.color = k.rgb(...DANGER);
      // Subtle 5% scale pulse, one cycle per second. Phase is the
      // fractional second inside the current countdown window.
      const phase = (TIME_LIMIT - elapsed) % 1;
      const pulse = 1 + Math.sin(phase * Math.PI * 2) * 0.05;
      timerText.scale = k.vec2(pulse, pulse);
    }
    if (elapsed >= TIME_LIMIT) {
      tick.cancel();
      state.finished = true;
      // Time-up audio chain — stopAllAudio enforces single-active-audio
      // invariant (panda memory). whack-timeup is a fixed cue, not the
      // cheer chain, so reading its .duration from PandaAudio.audio gives
      // an accurate wait without the chainDurationSec loop.
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playCue("whack-timeup");
      const td = (window.PandaAudio?.audio?.["whack-timeup"]?.duration || 1) + 0.3;
      k.wait(td, () => {
        // Bail if the player tapped ← during the timeup cue.
        if (!state.sceneAlive) return;
        // Celebratory close based on score. tier controls particle burst
        // count + panda hop per components/celebration.js.
        const tier = correctCount >= 10 ? "level" : correctCount >= 6 ? "streak5" : "first";
        celebrate(k, { tier, pandaBody: buddy?.body, pandaBaseSize: 200 });
        const { chain } = pickCheerCue({ streak: 0, isRoundComplete: true, levelId: 5, hasDiscovery: false });
        window.PandaAudio.playSequence(chain, 200, 0);
        const dur = chainDurationSec(chain, 200);
        k.wait(dur, () => {
          // Bail if the player tapped ← during the cheer chain.
          if (!state.sceneAlive) return;
          showSummary(k, correctCount, buddy);
        });
      });
    }
  });
}
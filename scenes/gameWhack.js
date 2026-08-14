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

export default function gameWhack(k) {
  sceneBg(k, "bg-meadow");

  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => { roundIdx = 0; streak = 0; k.go("gamesPicker"); },
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
    holes.push(whackHole(k, { x, y, variant: variants[i] }));
  }

  // === State container for runtime mutables (declared early so handlers
  // can close over). `pending` is the index of the hole currently being
  // considered — single-tap-answer: flash on the first pick. `finished`
  // is set when the 90-second timer expires and we transition to the
  // results scene.
  const state = {
    finished: false,
    pending: null,
  };

  // === Question builder ===
  //
  // Pulls a fresh question from the data layer, re-renders the equation
  // (destroy + recreate since textNodes isn't exposed), pops up 6 moles
  // with the question's candidates, then fires the "算一算 a 加 b"
  // read-out chain. stopAllAudio() before playSequence enforces the
  // single-active-audio invariant (panda memory).
  let currentQ = null;
  function buildAndSpawn() {
    const type = pickType(roundIdx);
    currentQ = buildQuestion(type, prevKey);
    prevKey = currentQ.key;
    roundIdx += 1;

    // Update equation — destroy the old root and re-render with the new
    // slots. Keep the same x / y / size / boxMode so the row sits in the
    // same place on screen. Last slot stays "□" so the unknown reads as
    // a hand-drawn box, not a "?" glyph (per user feedback 2026-08-11:
    // "用这个方格子表示未知，不要用问号了").
    eq.destroy();
    eq = expression(k, {
      slots: [String(currentQ.a), "+", String(currentQ.b), "=", "□"],
      x: 748, y: 320, size: 100,
      boxMode: true,
    });

    // Populate 6 holes — each hole shows one of the 6 candidates (the
    // correct answer + 5 distractors, shuffled by buildQuestion).
    for (let i = 0; i < HOLE_COUNT; i++) {
      holes[i].popUp(currentQ.candidates[i]);
    }

    // Read-out: "算一算 a 加 b" — [whack-q-pre, n-A, q-plus, n-B].
    // stopAllAudio() first so any in-flight audio from scene init or a
    // previous round's cue doesn't bleed into this chain (single-active
    // invariant).
    window.PandaAudio.stopAllAudio();
    const readChain = [
      "whack-q-pre",
      `n-${currentQ.a}`,
      "q-plus",
      `n-${currentQ.b}`,
    ];
    window.PandaAudio.playSequence(readChain, 200, 0);
  }

  // Initial spawn (replaces the random 1..9 placeholder loop). buildAndSpawn
  // handles both the mole pop-up AND the first question's read-out audio —
  // the scene-entry `whack-intro + whack-start` chain that previously lived
  // here would have cancelled the read-out mid-stride (single-active
  // invariant), so the intro audio is dropped from the entry path. Tap-handler
  // and win/lose flows can still fire it later if needed.
  buildAndSpawn();
}
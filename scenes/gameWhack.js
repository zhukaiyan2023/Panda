// scenes/gameWhack.js — whack-a-mole answer game.
// A round shows one math question and six answer moles. Only one answer
// interaction may be active at a time; this prevents concurrent audio,
// animations and round transitions from racing each other.

import panda from "../components/panda.js?v=20260815";
import { iconButton } from "../components/choice.js?v=20260815";
import { INK, PAPER, FONT, ORANGE, DANGER } from "../components/theme.js?v=20260815";
import sceneBg from "../components/sceneBg.js?v=20260815";
import expression from "../components/expression.js?v=20260815";
import whackHole from "../components/whackHole.js?v=20260815";
import { celebrate } from "../components/celebration.js?v=20260815";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260815";
import { buildQuestion, pickType } from "../data/whackRounds.js?v=20260815";
import { ALL_SPRITE_NAMES } from "../data/whackPack.js?v=20260815";

const TIME_LIMIT = 90;
const HOLE_COUNT = 6;
const HOLE_COLS = 3;
const HOLE_CELLW = 320;
const GRID_X = 748 - ((HOLE_COLS - 1) * HOLE_CELLW) / 2;
const GRID_Y0 = 600;
const GRID_Y1 = 820;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, rng) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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

function chainDurationSec(chain, seqGapMs) {
  const gap = (seqGapMs || 0) / 1000;
  let total = 0;
  for (const id of chain) {
    total += (window.PandaAudio?.audio?.[id]?.duration || 0) + gap;
  }
  return total + 0.5;
}

function showSummary(k, count, buddy) {
  const stars = count >= 10 ? 3 : count >= 6 ? 2 : count >= 2 ? 1 : 0;
  const W = k.width();
  k.add([
    k.rect(W, k.height(), { radius: 0 }),
    k.color(...PAPER),
    k.opacity(0.6),
    k.pos(W / 2, k.height() / 2),
    k.anchor("center"),
    k.z(50),
  ]);
  k.add([
    k.text(`做对 ${count} 题`, { size: 96, font: FONT }),
    k.color(...INK),
    k.pos(W / 2, 360),
    k.anchor("center"),
    k.z(51),
  ]);
  for (let i = 0; i < 3; i++) {
    k.add([
      k.sprite("star"),
      k.pos(W / 2 + (i - 1) * 130, 540),
      k.anchor("center"),
      k.scale(0.4),
      k.opacity(i < stars ? 1 : 0.25),
      k.color(...(i < stars ? ORANGE : INK)),
      k.z(51),
    ]);
  }
  saveProgress(5, count);
  k.wait(3, () => {
    roundIdx = 0;
    streak = 0;
    correctCount = 0;
    prevKey = null;
    k.go("gamesPicker");
  });
}

export default function gameWhack(k) {
  sceneBg(k, "bg-meadow");

  // Preflight: check that all 54 baked mole+number sprites are loaded.
  // If any are missing, fall back to the legacy badge + num path so the
  // game still plays during partial asset delivery.
  function hasSprite(name) {
    try { return !!k.getSprite(name); } catch (_) { return false; }
  }
  const missingSprites = ALL_SPRITE_NAMES.filter((n) => !hasSprite(n));
  const useBakedSprite = missingSprites.length === 0;
  if (!useBakedSprite) {
    console.warn(
      `[whack] missing ${missingSprites.length} sprites, falling back to badge style. First few: ${missingSprites.slice(0, 5).join(", ")}`,
    );
  }

  const state = {
    finished: false,
    sceneAlive: true,
    inputLocked: false,
  };

  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => {
      state.sceneAlive = false;
      state.finished = true;
      state.inputLocked = true;
      roundIdx = 0;
      streak = 0;
      correctCount = 0;
      prevKey = null;
      window.PandaAudio?.stopAllAudio?.();
      k.go("gamesPicker");
    },
  });

  const scoreText = k.add([
    k.text("做对 0 题", { size: 32, font: FONT }),
    k.color(...INK),
    k.pos(1240, 240),
    k.anchor("center"),
  ]);

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

  const buddy = panda(k, { x: 130, y: 800, size: 200 });

  let eq = expression(k, {
    slots: ["□", "+", "□", "=", "□"],
    x: 748, y: 320, size: 100,
    boxMode: true,
  });

  k.add([
    k.sprite("grass-ground"),
    k.pos(GRID_X - (1100 - HOLE_COLS * HOLE_CELLW) / 2, 660),
    k.scale(1.0, 0.15),
    k.z(0),
  ]);

  const variants = shuffleSeeded(
    [0, 0, 1, 1, 2, 2],
    mulberry32((Date.now() ^ 0xA53F19B1) >>> 0),
  );
  const holes = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const col = i % HOLE_COLS;
    const row = Math.floor(i / HOLE_COLS);
    const x = GRID_X + col * HOLE_CELLW;
    const y = row === 0 ? GRID_Y0 : GRID_Y1;
    const h = whackHole(k, { x, y, variant: variants[i], useBakedSprite });
    h._tapped = false;
    holes.push(h);
  }

  function resetSelections() {
    for (const h of holes) h.setSelected(false);
  }

  function streakTier(s) {
    if (s >= 10) return "streak10";
    if (s >= 5) return "streak5";
    if (s >= 3) return "streak3";
    return "first";
  }

  let currentQ = null;

  function buildAndSpawn(isFirst = false) {
    if (state.finished) return;

    resetSelections();
    const type = pickType(roundIdx);
    currentQ = buildQuestion(type, prevKey);
    prevKey = currentQ.key;
    roundIdx += 1;

    eq.destroy();
    eq = expression(k, {
      slots: [String(currentQ.a), "+", String(currentQ.b), "=", "□"],
      x: 748, y: 320, size: 100,
      boxMode: true,
      reserve: ["17", "+", "9", "=", "11"],
    });

    for (let i = 0; i < HOLE_COUNT; i++) {
      holes[i]._tapped = false;
      holes[i].popUp(currentQ.candidates[i]);
    }

    const readChain = [
      "whack-q-pre",
      `n-${currentQ.a}`,
      "q-plus",
      `n-${currentQ.b}`,
    ];

    if (isFirst) {
      window.PandaAudio.playAfter("whack-start", readChain, {
        gapMs: 200,
        seqGapMs: 200,
      });
    } else {
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playSequence(readChain, 200, 0);
    }

    state.inputLocked = false;
  }

  window.PandaAudio.playSequence(["whack-intro", "whack-start"], 200, 0);
  buildAndSpawn(true);

  // The previous implementation used 220x280 overlapping hit rectangles
  // and also attached the same click to the mole. A single tap could then
  // activate two holes, race multiple audio chains and schedule multiple
  // round transitions. Keep one compact, non-overlapping hit target per
  // hole and use a global input lock for the whole answer transition.
  const TAP_HIT_W = 150;
  const TAP_HIT_H = 150;
  for (const h of holes) {
    const hit = k.add([
      k.rect(TAP_HIT_W, TAP_HIT_H, { radius: 30 }),
      k.anchor("center"),
      k.pos(h.x, h.y - 50),
      k.opacity(0),
      k.area(),
      k.z(10),
    ]);

    hit.onClick(() => {
      if (state.finished || state.inputLocked || !h.isOccupied() || !currentQ) return;
      if (h._tapped) return;

      state.inputLocked = true;
      h._tapped = true;
      h.setSelected(true);

      const value = h.getValue();
      if (value === currentQ.answer) {
        streak += 1;
        correctCount += 1;
        scoreText.text = `做对 ${correctCount} 题`;
        const tier = streakTier(streak);

        h.flashCorrect();
        celebrate(k, {
          tier,
          anchor: { x: h.x, y: h.y - 40 },
          pandaBody: buddy?.body,
          pandaBaseSize: 200,
        });

        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue("whack-tap");
        k.wait(0.05, () => {
          if (!state.finished) window.PandaAudio.stopAllAudio();
        });
        k.wait(0.06, () => {
          if (!state.finished) window.PandaAudio.playCue("whack-correct");
        });

        const { chain } = pickCheerCue({
          streak,
          isRoundComplete: false,
          levelId: 5,
          hasDiscovery: false,
        });
        const whackCorrectDur =
          (window.PandaAudio?.audio?.["whack-correct"]?.duration || 0.6) + 0.2;
        k.wait(whackCorrectDur, () => {
          if (state.finished) return;
          window.PandaAudio.playSequence(chain, 200, 0);
          const cheerDur = chainDurationSec(chain, 200);
          k.wait(cheerDur, () => {
            if (!state.finished) buildAndSpawn(false);
          });
        });
      } else {
        streak = 0;
        h.shake();

        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue("whack-tap");
        k.wait(0.05, () => {
          if (!state.finished) window.PandaAudio.stopAllAudio();
        });
        k.wait(0.06, () => {
          if (state.finished) return;
          const wrongCue = pickWrongCue();
          window.PandaAudio.playCue(wrongCue);
          const wrongDur = chainDurationSec([wrongCue], 0);
          k.wait(wrongDur, () => {
            if (!state.finished) buildAndSpawn(false);
          });
        });
      }
    });
  }

  const start = k.time();
  const tick = k.onUpdate(() => {
    if (state.finished) {
      tick.cancel();
      return;
    }

    const elapsed = k.time() - start;
    const remaining = Math.max(0, Math.ceil(TIME_LIMIT - elapsed));
    timerText.text = String(remaining);

    if (remaining <= 10) {
      timerText.color = k.rgb(...DANGER);
      const phase = (TIME_LIMIT - elapsed) % 1;
      const pulse = 1 + Math.sin(phase * Math.PI * 2) * 0.05;
      timerText.scale = k.vec2(pulse, pulse);
    }

    if (elapsed >= TIME_LIMIT) {
      tick.cancel();
      state.finished = true;
      state.inputLocked = true;
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playCue("whack-timeup");
      const td = (window.PandaAudio?.audio?.["whack-timeup"]?.duration || 1) + 0.3;
      k.wait(td, () => {
        if (!state.sceneAlive) return;
        const tier = correctCount >= 10 ? "level" : correctCount >= 6 ? "streak5" : "first";
        celebrate(k, { tier, pandaBody: buddy?.body, pandaBaseSize: 200 });
        const { chain } = pickCheerCue({
          streak: 0,
          isRoundComplete: true,
          levelId: 5,
          hasDiscovery: false,
        });
        window.PandaAudio.playSequence(chain, 200, 0);
        const dur = chainDurationSec(chain, 200);
        k.wait(dur, () => {
          if (!state.sceneAlive) return;
          showSummary(k, correctCount, buddy);
        });
      });
    }
  });
}

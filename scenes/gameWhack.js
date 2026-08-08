// scenes/gameWhack.js — whack-a-mole (whack.html from panda-park).
//
// Six grass-mound holes in a 3x2 grid. Moles pop up at random, each carrying
// a 1-9 number. The player has 30 seconds to find 5 valid friends-of-10 pairs.
// Two-tap mechanic: tap one mole, then a second; if they sum to 10 the pair
// scores. Otherwise the second tap shakes and resets.
//
// This is the only timed game in the collection. It uses a different chrome
// (timer pill instead of step bar) and a fresh scene rather than pairScene.

import stepBar from "../components/stepBar.js";
import panda from "../components/panda.js";
import { iconButton } from "../components/choice.js";
import { INK, PAPER, FONT, YELLOW, ORANGE, DANGER } from "../components/theme.js";

const TIME_LIMIT = 30;     // seconds
const PAIRS_NEEDED = 5;
const HOLE_COUNT = 6;
const SPAWN_INTERVAL = 1.4; // seconds between mole spawns
const HOLE_DWELL = 1.4;     // seconds a mole stays up before retreating

const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];

function shuffle(arr) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

function saveProgress() {
  const save = window.PandaSave?.load() || {};
  const next = {
    ...save,
    unlockedGame: Math.max(save.unlockedGame || 1, 5),
    starsByGame: {
      ...(save.starsByGame || {}),
      4: ((save.starsByGame || {})[4] || 0) + 1,
    },
  };
  window.PandaSave?.save(next);
}

export default function scene(k) {
  window.PandaAudio.playCue("whack-intro");

  // === Header chrome ===
  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => { k.go("gamesPicker"); },
  });

  const bar = stepBar(k, {
    labels: ["Start", "Pair 1", "Pair 2", "Pair 3", "Pair 4", "Done"],
    step: 1, x: 748, y: 84, w: 1060, h: 36,
  });

  // Timer pill.
  const timerText = k.add([
    k.text(`${TIME_LIMIT}`, { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(1100, 196),
    k.anchor("center"),
  ]);

  // Pair counter pill.
  const counterText = k.add([
    k.text(`0 / ${PAIRS_NEEDED}`, { size: 36, font: FONT }),
    k.color(...INK),
    k.pos(540, 196),
    k.anchor("center"),
  ]);

  k.add([
    k.text(`Tap two moles that make ten.`, { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(748, 310),
    k.anchor("center"),
  ]);

  const buddy = panda(k, { x: 130, y: 800, size: 200 });

  // === Hole grid (3 cols × 2 rows) ===
  const COLS = 3;
  const cellW = 320;
  const cellH = 280;
  const gridX = 748 - ((COLS - 1) * cellW) / 2;
  const gridY = 720;
  const holes = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;

    // Dirt mound — wide rounded rectangle (no ellipse in this Kaplay build).
    k.add([
      k.rect(240, 80, { radius: 40 }),
      k.color(74, 53, 32),
      k.pos(x, y + 80),
      k.anchor("center"),
    ]);
    // Hole — slightly darker rectangle behind the mound.
    const hole = k.add([
      k.rect(200, 50, { radius: 25 }),
      k.color(36, 24, 16),
      k.pos(x, y + 80),
      k.anchor("center"),
    ]);

    const mole = k.add([
      k.sprite("mole"),
      k.pos(x, y + 100),    // start below the hole
      k.anchor("center"),
      k.scale(0.7),
      k.opacity(0),
      k.z(1),
    ]);

    // Number badge — drawn over the mole sprite.
    const badge = k.add([
      k.circle(28),
      k.color(...YELLOW),
      k.outline(3, k.rgb(...INK)),
      k.pos(x, y - 10),
      k.anchor("center"),
      k.opacity(0),
      k.z(2),
    ]);
    const num = k.add([
      k.text("0", { size: 36, font: FONT }),
      k.color(...INK),
      k.pos(x, y - 10),
      k.anchor("center"),
      k.opacity(0),
      k.z(3),
    ]);

    holes.push({ x, y, mole, badge, num, occupied: false, value: null });
  }

  // === Game state ===
  let state = {
    timer: TIME_LIMIT,
    pairs: 0,
    pending: null,         // index of first-picked hole
    finished: false,
  };

  // Pre-built list of mole values to use in spawn order (so consecutive moles
  // can still be paired: we mix digits that don't always pair with the
  // previous one).
  let spawnQueue = [];
  function refillQueue() {
    spawnQueue = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  refillQueue();

  // Spawn a mole in a random free hole.
  function spawn() {
    if (state.finished) return;
    const free = holes.filter((h) => !h.occupied);
    if (!free.length) return;
    const hole = free[Math.floor(Math.random() * free.length)];
    const value = spawnQueue.length ? spawnQueue.pop() : 1 + Math.floor(Math.random() * 9);
    if (spawnQueue.length < 4) refillQueue();
    hole.value = value;
    hole.occupied = true;
    hole.num.text = String(value);
    hole.mole.opacity = 1;
    hole.badge.opacity = 1;
    hole.num.opacity = 1;
    // Pop-up animation.
    const start = k.time();
    hole.mole.onUpdate(() => {
      const t = k.time() - start;
      if (t > HOLE_DWELL) {
        // Retreat.
        hole.mole.opacity = 0;
        hole.badge.opacity = 0;
        hole.num.opacity = 0;
        hole.occupied = false;
        hole.value = null;
        hole.mole.onUpdate(() => {});
        return;
      }
      // Tiny bob.
      hole.mole.pos.y = hole.y + 100 - Math.sin(t * 8) * 6;
    });
  }

  // Pick a hole: either first of a pair or judging.
  function tap(idx) {
    if (state.finished) return;
    const hole = holes[idx];
    if (!hole.occupied) return;
    if (state.pending === null) {
      state.pending = idx;
      hole.badge.color = k.rgb(...ORANGE);
    } else if (state.pending === idx) {
      // Same hole tapped twice — clear selection.
      hole.badge.color = k.rgb(...YELLOW);
      state.pending = null;
    } else {
      const first = holes[state.pending];
      const second = hole;
      first.badge.color = k.rgb(...YELLOW);
      state.pending = null;
      if (first.value + second.value === 10) {
        state.pairs += 1;
        counterText.text = `${state.pairs} / ${PAIRS_NEEDED}`;
        bar.setStep(state.pairs + 1);
        // Retire both moles.
        [first, second].forEach((h) => {
          h.mole.opacity = 0;
          h.badge.opacity = 0;
          h.num.opacity = 0;
          h.occupied = false;
          h.value = null;
          h.mole.onUpdate(() => {});
        });
        // Whack is the loudest game by design (it's a time-attack), so the only
// audible feedback on a correct pair is a quiet mood swap — no cheering
// cues. Without this rule, 5 pairs in 30 seconds would be a wall of sound.
        buddy.setMood("cheer", { silent: true });
        if (state.pairs >= PAIRS_NEEDED) {
          finish(true);
        }
      } else {
        // Wrong pair — shake second mole briefly.
        const start = k.time();
        second.mole.onUpdate(() => {
          const t = k.time() - start;
          if (t > 0.4) { second.mole.pos.x = second.x; second.mole.onUpdate(() => {}); return; }
          second.mole.pos.x = second.x + Math.sin(t * 30) * 12;
        });
        buddy.setMood("think");
      }
    }
  }

  // Wire hole clicks: invisible hit target over each hole. The rect() component
// supplies renderArea, so k.area() with no explicit shape works.
  holes.forEach((h, idx) => {
    const hit = k.add([
      k.rect(220, 100, { radius: 20 }),
      k.pos(h.x, h.y + 50),
      k.opacity(0),
      k.area(),
    ]);
    hit.onClick(() => tap(idx));
  });

  function finish(won) {
    if (state.finished) return;
    state.finished = true;
    if (won) {
      window.PandaAudio.playCue("whack-done");
      saveProgress();
      k.add([
        k.text("5 pairs! You win!", { size: 72, font: FONT }),
        k.color(...ORANGE),
        k.pos(748, 540),
        k.anchor("center"),
      ]);
      k.wait(2.0, () => k.go("gamesPicker"));
    } else {
      window.PandaAudio.playCue("whack-timeup");
      k.add([
        k.text("Time's up!", { size: 72, font: FONT }),
        k.color(...DANGER),
        k.pos(748, 540),
        k.anchor("center"),
      ]);
      k.wait(2.0, () => k.go("gamesPicker"));
    }
  }

  // === Timer + spawner ===
  const start = k.time();
  const tick = k.onUpdate(() => {
    if (state.finished) { tick.cancel(); return; }
    const elapsed = k.time() - start;
    const remaining = Math.max(0, Math.ceil(TIME_LIMIT - elapsed));
    timerText.text = String(remaining);
    // Last 10s pulse red.
    if (remaining <= 10) timerText.color = k.rgb(...DANGER);
    if (elapsed >= TIME_LIMIT) {
      tick.cancel();
      finish(false);
    }
  });

  // Fire the first "Go!" cue, then start spawning.
  k.wait(0.4, () => window.PandaAudio.playCue("whack-start"));
  k.loop(SPAWN_INTERVAL, spawn);
  spawn();   // immediate first spawn
}
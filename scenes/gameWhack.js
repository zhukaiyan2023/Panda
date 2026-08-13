// scenes/gameWhack.js — whack-a-mole (whack.html from panda-park).
//
// Six grass-mound holes in a 3x2 grid. Moles pop up at random, each carrying
// a 1-9 number. The player has 75 seconds to find 5 valid friends-of-10 pairs.
// Two-tap mechanic: tap one mole, then a second; if they sum to 10 the pair
// scores. Otherwise the second tap shakes and resets.
//
// This is the only timed game in the collection. It uses a different chrome
// (timer pill instead of step bar) and a fresh scene rather than pairScene.
//
// 2026-08-13 grass retheme: brown dirt mound + dark-brown hole rects were
// replaced by AI-generated 3D elliptical green-grass hole sprites. Each hole
// is now a `whackHole(k, { x, y, variant })` entity (see
// components/whackHole.js). The mole sprite was also regenerated to remove
// the brown dirt baked into its frame. See
// docs/superpowers/specs/2026-08-13-whack-grass-retheme-design.md.

import stepBar from "../components/stepBar.js?v=20260813";
import panda from "../components/panda.js?v=20260813";
import { iconButton } from "../components/choice.js?v=20260813";
import { INK, PAPER, FONT, YELLOW, ORANGE, DANGER } from "../components/theme.js?v=20260813";
import sceneBg from "../components/sceneBg.js?v=20260813";
import whackHole from "../components/whackHole.js?v=20260813";

const TIME_LIMIT = 75;     // seconds (5s dwell × 5 pairs needs a longer play window)
const PAIRS_NEEDED = 5;
const HOLE_COUNT = 6;

// Spawn cadence (2026-08-12, rev 3): tuned for the 3–5 year-old memory
// variant. The kid has to (1) read the number, (2) calculate its
// complement to 10 in their head (e.g. "7, so I need 3"), (3) scan the
// other holes, (4) tap the pair. Per the user on 2026-08-12, each step
// costs the kid a real beat — the dwell is 5s flat, not 2.5s reflex-game
// speed. Spawn interval 2.8s keeps ~1.8 moles visible at once so the kid
// always has options to pair but isn't overwhelmed by a forest of moles.
const SPAWN_INTERVAL = 2.8; // seconds between mole spawns

// Mulberry32 PRNG seeded by `seed`. Used so the 6-hole variant assignment
// (which of the 3 hole sprites each hole uses) is reproducible across
// renders — same scene → same mix of holes. Gameplay randomness (spawn
// positions, mole values) still uses Math.random for variety.
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

function shuffle(arr) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// Mirror pairScene.saveProgress. gameWhack is the last game (id 5), so
// levelId+1 = 6 has nothing to unlock — the `max` keeps the existing value.
// (The previous hardcoded `5` and starsByGame[4] increment were both wrong
// for the same reason as gameBounce: balloon's custom saveProgress only
// unlocked balloon itself, breaking the chain.)
function saveProgress(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, levelId + 1);
  save.starsByGame = save.starsByGame || {};
  save.starsByGame[levelId] = (save.starsByGame[levelId] || 0) + 1;
  window.PandaSave?.save(save);
}

export default function scene(k) {
  window.PandaAudio.playCue("whack-intro");

  // === Header chrome ===
  sceneBg(k, "bg-meadow");

  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => { k.go("gamesPicker"); },
  });

  const bar = stepBar(k, {
    labels: ["开始", "第 1 对", "第 2 对", "第 3 对", "第 4 对", "完成"],
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
    k.text(`点两个地鼠，让它们加起来是十。`, { size: 48, font: FONT }),
    k.color(...INK),
    k.pos(748, 240),
    k.anchor("center"),
  ]);

  const buddy = panda(k, { x: 130, y: 800, size: 200 });

  // === Hole grid (3 cols × 2 rows) ===
  const COLS = 3;
  const cellW = 320;
  // gridY 510 (down from the pre-retheme 480): the AI hole sprites at
  // HOLE_SCALE 0.20 occupy ±83px around their y, leaving a 74-pixel gap
  // between rows for the bottom-row mole's face to peek into. Row 0 sits
  // at y=510 (sprite y=427-593), row 1 at y=750 (sprite y=667-833) —
  // row 1's bottom edge sits 191px above the canvas bottom, leaving room
  // for the buddy panda at x=130 (no horizontal overlap).
  const cellH = 240;
  const gridX = 748 - ((COLS - 1) * cellW) / 2;
  const gridY = 510;

  // Grass-ground tile spans the play-area band (1100×280). Positioned so
  // the bottom row of holes sits well inside the green strip and the top
  // of the tile fades into the bg-meadow background above the holes.
  // Anchor "topleft" so the x/y below is the upper-left corner, not center.
  k.add([
    k.sprite("grass-ground"),
    k.pos(gridX - (1100 - COLS * cellW) / 2, gridY - 100),
    k.z(0),
  ]);

  // Seeded variant assignment — Mulberry32 with a stable per-scene seed so
  // every reload shows the same 3×2 mix of the 3 hole sprites. Each variant
  // gets exactly 2 of the 6 holes (we pass [0,0,1,1,2,2] through the shuffle)
  // so every variant is visible regardless of the seed.
  const sceneSeed = (Date.now() ^ 0xA53F19B1) >>> 0;
  const variantRng = mulberry32(sceneSeed);
  const variants = shuffleSeeded([0, 0, 1, 1, 2, 2], variantRng);

  const holes = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    holes.push(whackHole(k, { x, y, variant: variants[i] }));
  }

  // === Game state ===
  const state = {
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
    hole.popUp(value);
  }

  // Pick a hole: either first of a pair or judging.
  function tap(idx) {
    if (state.finished) return;
    const hole = holes[idx];
    if (!hole.occupied) return;
    if (state.pending === null) {
      state.pending = idx;
      hole.setSelected(true);
    } else if (state.pending === idx) {
      // Same hole tapped twice — clear selection.
      hole.setSelected(false);
      state.pending = null;
    } else {
      const first = holes[state.pending];
      const second = hole;
      first.setSelected(false);
      state.pending = null;
      if (first.value + second.value === 10) {
        state.pairs += 1;
        counterText.text = `${state.pairs} / ${PAIRS_NEEDED}`;
        bar.setStep(state.pairs + 1);
        // Retire both moles.
        first.retreat();
        second.retreat();
        // Whack is the loudest game by design (it's a time-attack), so the only
        // audible feedback on a correct pair is a quiet mood swap — no cheering
        // cues. Without this rule, 5 pairs in 30 seconds would be a wall of sound.
        buddy.setMood("cheer", { silent: true });
        if (state.pairs >= PAIRS_NEEDED) {
          finish(true);
        }
      } else {
        // Wrong pair — shake second mole briefly.
        second.shake();
        buddy.setMood("think");
      }
    }
  }

  // Wire hole clicks: invisible hit target over each hole. Sized and
  // positioned to cover the mole's face area + a margin, since that's
  // where the kid taps. The mole face is at scene y ≈ hole.y + MOLE_Y_OFFSET
  // (see components/whackHole.js), so we centre the hit-target on that
  // point rather than on the hole's bottom-half as the pre-retheme brown
  // holes did.
  const MOLE_Y_OFFSET = -120;
  const HIT_W = 220;
  const HIT_H = 200;
  holes.forEach((h, idx) => {
    const hit = k.add([
      k.rect(HIT_W, HIT_H, { radius: 20 }),
      k.pos(h.x, h.y + MOLE_Y_OFFSET - HIT_H / 2),
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
      saveProgress(5);  // gameWhack is the last game (levelId 5)
      k.add([
        k.text("找全 5 对啦！你真棒！", { size: 72, font: FONT }),
        k.color(...ORANGE),
        k.pos(748, 540),
        k.anchor("center"),
      ]);
      k.wait(2.0, () => k.go("gamesPicker"));
    } else {
      window.PandaAudio.playCue("whack-timeup");
      k.add([
        k.text("时间到啦！", { size: 72, font: FONT }),
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

  // Fire the "Go!" cue after the intro's `ended` event — the previous
  // 0.4s k.wait could overlap if "whack-intro" took longer to play
  // than 400ms, and could cut "whack-start" short if it took less.
  window.PandaAudio.playAfter("whack-intro", ["whack-start"], {
    gapMs: 0,
    seqGapMs: 0,
  });
  k.loop(SPAWN_INTERVAL, spawn);
  spawn();   // immediate first spawn
}
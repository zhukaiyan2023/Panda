// scenes/gameWhack.js — whack-a-mole (whack.html from panda-park).
//
// Six grass-mound holes in a 3x2 grid. Moles pop up at random, each carrying
// a 1-9 number. The player has 30 seconds to find 5 valid friends-of-10 pairs.
// Two-tap mechanic: tap one mole, then a second; if they sum to 10 the pair
// scores. Otherwise the second tap shakes and resets.
//
// This is the only timed game in the collection. It uses a different chrome
// (timer pill instead of step bar) and a fresh scene rather than pairScene.

import stepBar from "../components/stepBar.js?v=20260812";
import panda from "../components/panda.js?v=20260812";
import { iconButton } from "../components/choice.js?v=20260812";
import { INK, PAPER, FONT, YELLOW, ORANGE, DANGER } from "../components/theme.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";

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
const HOLE_DWELL = 5.0;     // seconds a mole stays up before retreating

// mole.png is 579x728 (drawn at portrait scale for the panda-park hero
// art). 0.25 gives a ~145x182 mole. Combined with the dirt-mound-on-top
// z-order fix below, only the head and shoulders of the mole poke above
// the dirt, so the rendered footprint reads as "a mole popping out" rather
// than "a full-body mole standing in front of a hole".
const MOLE_SCALE = 0.25;

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
    k.text(`点两个地鼠，让它们加起来是十。`, { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(748, 310),
    k.anchor("center"),
  ]);

  const buddy = panda(k, { x: 130, y: 800, size: 200 });

  // === Hole grid (3 cols × 2 rows) ===
  const COLS = 3;
  const cellW = 320;
  // The 2026-08-12 shift: gridY was 720 with cellH 280, which put row 1
  // holes at y=1080 — past the bottom edge of the 1024-tall canvas, so the
  // bottom row of holes was invisible. Tightening cellH and pulling gridY
  // up to 480 lands row 0 holes near y=560 and row 1 near y=800, both
  // comfortably inside the visible band (the title bar ends ~y=340).
  const cellH = 240;
  const gridX = 748 - ((COLS - 1) * cellW) / 2;
  const gridY = 480;
  const holes = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;

    // Dirt mound — tall wide rounded rectangle. The 2026-08-12 z-order
    // fix: rendered ON TOP of the mole (z 1 > mole's z 0) so the dirt
    // covers the mole's lower body. The kid only sees the head and upper
    // chest poking above the mound — reads as "popping out of a hole"
    // instead of "full-body mole standing in front of a hole". The mound
    // is also taller (120 vs the old 80) so it has enough vertical real
    // estate to swallow a 182-tall mole sprite.
    k.add([
      k.rect(240, 120, { radius: 40 }),
      k.color(74, 53, 32),
      k.pos(x, y + 80),
      k.anchor("center"),
      k.z(1),
    ]);
    // Hole — slightly darker rectangle on top of the mound. Higher z than
    // the mound so the dark "hole" reads as a depression, not paint.
    const hole = k.add([
      k.rect(200, 50, { radius: 25 }),
      k.color(36, 24, 16),
      k.pos(x, y + 80),
      k.anchor("center"),
      k.z(2),
    ]);

    const mole = k.add([
      k.sprite("mole"),
      k.pos(x, y + 20),     // center just above hole center — head pokes above dirt
      k.anchor("center"),
      k.scale(MOLE_SCALE),
      k.opacity(0),
      k.z(0),
    ]);

    // Number badge — drawn over the mole sprite. The mole's eye sits ~28%
    // from the sprite top; with MOLE_SCALE 0.25 and the mole centered at
    // y+20, that lands the badge at y-19 so it reads "on" the eye above
    // the dirt mound line.
    const badge = k.add([
      k.circle(28),
      k.color(...YELLOW),
      k.outline(3, k.rgb(...INK)),
      k.pos(x, y - 19),
      k.anchor("center"),
      k.opacity(0),
      k.z(3),
    ]);
    const num = k.add([
      k.text("0", { size: 36, font: FONT }),
      k.color(...INK),
      k.pos(x, y - 19),
      k.anchor("center"),
      k.opacity(0),
      k.z(4),
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
      hole.mole.pos.y = hole.y + 20 - Math.sin(t * 8) * 6;
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
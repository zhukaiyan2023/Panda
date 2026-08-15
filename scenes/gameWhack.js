// scenes/gameWhack.js — Whack-a-mole (打地鼠), panda-park migration.
//
// Self-contained scene (not a scenes/pairScene.js wrapper): its round
// shape — a single 90s timed session where every correct tap immediately
// spawns a new question — doesn't fit the find-a-pair mechanic that
// Boat/Bounce/Cloud/Feed share.
//
// Mechanic: read "a + b = ?", then tap the one mole (of 6) whose number
// equals the sum. A correct tap scores a point and spawns a fresh
// question right away; a wrong tap plays a gentle "near" cue and the
// SAME question stays up so the child can try again — no penalty for a
// miss, only for running out of time.
//
// Visual style (2026-08-15 minimax-image rewrite): every visual is a
// generated sprite under assets/art/. The HUD is a wooden equation
// plaque in the top-center, a small stopwatch in the top-left, and a
// star progress bar in the top-right — matching the layout in the
// reference image (1.png). The decorative sign at the bottom-left
// reads "快敲正确的地鼠!" and a tiny hammer sits in the bottom-right.

import {
  INK, PAPER, CARD, ORANGE, ORANGE_DEEP, SUCCESS, DANGER, GREEN,
  YELLOW, BLUE, PINK, PURPLE, MUTED, DISABLED_BG, FONT,
} from "../components/theme.js?v=20260815";

const ROUND_SECONDS = 90;
const HOLE_COUNT = 6;
const GAME_ID = 5;

const STAR_THRESHOLDS = [4, 10, 18];

// 2 rows × 3 cols. Wider column gaps (400px) so the holes don't feel
// crowded, and a taller row gap (300px) so the two rows breathe. The
// y range 600→900 stays inside the meadow band, well clear of the HUD
// above and the hint sign / hammer below.
const HOLE_POS = [
  [283, 600], [683, 600], [1083, 600],
  [283, 900], [683, 900], [1083, 900],
];

// HIDDEN is the y-offset from holeY where the mole sprite's centre
// sits when fully hidden (the mole pops back up from here). POP_DY is
// the upward travel during pop-up.
// HIDDEN > hole sprite half-height (140) + buffer so the mole really
// disappears underground between rounds.
const HIDDEN = 320;
const POP_DY = 260;
// MOLE_REST_LIFT raises the popped-up mole so its baked-in dirt mound
// (88px tall, rendered) lines up with the hole sprite's dark interior
// (187px tall, rendered). 68 puts the mole's dirt bottom flush with
// the hole's dirt bottom and the head/upper body well above the rim.
// The hole sprite (z=12) still masks the lower body so the mole
// appears to be standing in the hole.
const MOLE_REST_LIFT = 68;
// Sink target offset for the moleGroup y, relative to holeY. The
// sink ends with moleGroup at holeY + MOLE_HIDE_OFFSET_Y so the mole
// sprite's top edge ends up inside the hole sprite's rim — no part
// of the mole sticks out above the grass. The mole appears to duck
// back into the hole rather than vanish mid-air or slide off the
// bottom of the screen.
const MOLE_HIDE_OFFSET_Y = -10;

// ---------- sprite helpers ----------
function fitSprite(parent, k, name, x, y, size, anchor = "center", z = 0) {
  if (!k.getSprite(name)) return null;
  const sp = k.getSprite(name);
  const sw = sp.data?.width ?? size;
  const sh = sp.data?.height ?? size;
  const longSide = Math.max(sw, sh) || size;
  const scale = size / longSide;
  return parent.add([
    k.sprite(name),
    k.anchor(anchor),
    k.pos(x, y),
    k.scale(scale),
    k.z(z),
  ]);
}

function fitSpriteWidth(parent, k, name, x, y, targetWidth, anchor = "botleft", z = 0) {
  if (!k.getSprite(name)) return null;
  const sp = k.getSprite(name);
  const sw = sp.data?.width ?? targetWidth;
  const scale = targetWidth / sw;
  return parent.add([k.sprite(name), k.anchor(anchor), k.pos(x, y), k.scale(scale), k.z(z)]);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
const easeInQuad = (t) => t * t;

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestion() {
  let a, b, sum;
  do {
    a = rnd(2, 9);
    b = rnd(2, 9);
    sum = a + b;
  } while (sum < 11 || sum > 19);
  return { a, b, sum };
}

function pickDecoys(correct, count) {
  const pool = [];
  for (let n = 10; n <= 19; n++) if (n !== correct) pool.push(n);
  return shuffle(pool).slice(0, count);
}

export default function gameWhack(k) {
  const A = window.PandaAudio;
  const Save = window.PandaSave;

  let running = false;
  let timeLeft = ROUND_SECONDS;
  let correctCount = 0;
  let currentAnswer = null;
  let firstRound = true;
  let timerHandle = null;
  const moleObjs = [];

  // ---------- background ----------
  // Draw a cream backdrop that fills the entire canvas first; the
  // meadow sprite renders on top. The kaplay canvas reports
  // 1366×1024 but the renderer appears to clip along a 16:9
  // band (1366×768) at the top. Stretching the sprite so its
  // rendered footprint is 1366×768 + 128px buffer keeps the
  // meadow art bleeding under the visible 16:9 region instead of
  // exposing the canvas clear color.
  k.add([
    k.rect(1366, 1024),
    k.pos(0, 0),
    k.color(255, 241, 220),
    k.z(-1000),
  ]);
  const bg = k.add([
    k.sprite("whack-bg-meadow"),
    k.pos(683, 384),
    k.anchor("center"),
  ]);
  bg.width = 1366;
  bg.height = 900;

  // ---------- HUD ----------
  // Top-right: a clean stopwatch sprite (no markings, no hands, no
  // numbers, transparent background) with the live second readout
  // drawn on top. No starbar and no 3-star markers — the user
  // removed them as too cluttered.
  fitSprite(k, k, "whack-stopwatch", 1230, 138, 170, "center", 20);
  const stopwatchSecs = k.add([
    k.text(String(ROUND_SECONDS), { size: 56, font: FONT }),
    k.pos(1230, 148),
    k.anchor("center"),
    k.color(...ORANGE_DEEP),
    k.z(21),
  ]);

  // Wooden equation plaque in the top-center. The plaque sprite is
  // blank (minimax regenerates it with no text); the equation is
  // drawn live on top so the digits (and their colors) update every
  // round. Mirrors the look of the reference image (1.png) where
  // the wooden board has the equation baked in.
  fitSpriteWidth(k, k, "whack-plaque", 683, 130, 580, "center", 20);
  const NUM_SIZE = 78;
  const PLAQUE_Y = 138; // vertical center of the plaque sprite
  // Slot x-centers: center the expression on the plaque (visible range
  // ≈ x∈[393, 973] at targetWidth=580 anchored at x=683). Spacing
  // 95/80/95/80 — slightly tighter between number and operator so the
  // `+` / `=` read as separators, not as part of the digit.
  // Midpoint of the 5 slots = (510+860)/2 = 685 ≈ 683.
  const plaqueSlots = {
    a: k.add([k.text("?", { size: NUM_SIZE, font: FONT }), k.anchor("center"), k.pos(510, PLAQUE_Y), k.color(...BLUE), k.z(21)]),
    plus: k.add([k.text("+", { size: NUM_SIZE, font: FONT }), k.anchor("center"), k.pos(590, PLAQUE_Y), k.color(...INK), k.z(21)]),
    b: k.add([k.text("?", { size: NUM_SIZE, font: FONT }), k.anchor("center"), k.pos(685, PLAQUE_Y), k.color(...GREEN), k.z(21)]),
    eq: k.add([k.text("=", { size: NUM_SIZE, font: FONT }), k.anchor("center"), k.pos(765, PLAQUE_Y), k.color(...INK), k.z(21)]),
    q: k.add([
      k.text("?", { size: NUM_SIZE, font: FONT }),
      k.anchor("center"),
      k.pos(860, PLAQUE_Y),
      k.color(225, 50, 50),
      k.outline(3, k.rgb(255, 255, 255)),
      k.z(21),
    ]),
  };

  // Hint sign at the bottom-left. Tucked into the corner so it
  // doesn't overlap the bottom-left mole.
  const HINT_W = 180;
  const HINT_H = 180;
  const hintX = 30;
  const hintY = 990;
  fitSpriteWidth(k, k, "whack-hint-sign", hintX, hintY, HINT_W, "botleft", 20);
  k.add([
    k.text("快敲", { size: 22, font: FONT }),
    k.anchor("center"),
    k.pos(hintX + HINT_W / 2, hintY - HINT_H + 65),
    k.color(...ORANGE_DEEP),
    k.z(21),
  ]);
  k.add([
    k.text("正确的地鼠!", { size: 16, font: FONT }),
    k.anchor("center"),
    k.pos(hintX + HINT_W / 2, hintY - HINT_H + 95),
    k.color(...INK),
    k.z(21),
  ]);

  // Decorative daisies scattered between the holes — references the
  // small white flowers visible in the reference image's meadow.
  const daisyPositions = [
    [180, 730], [512, 745], [850, 740], [1180, 750],
    [340, 760], [683, 760], [1025, 760],
  ];
  for (const [dx, dy] of daisyPositions) {
    const daisy = k.add([k.pos(dx, dy), k.z(3)]);
    for (let p = 0; p < 5; p++) {
      const ang = (p * Math.PI * 2) / 5;
      daisy.add([
        k.circle(8),
        k.pos(Math.cos(ang) * 9, Math.sin(ang) * 9),
        k.anchor("center"),
        k.color(...CARD),
        k.outline(2, k.rgb(...ORANGE_DEEP)),
      ]);
    }
    daisy.add([
      k.circle(6),
      k.pos(0, 0),
      k.anchor("center"),
      k.color(...YELLOW),
    ]);
  }

  // Decorative hammer in the bottom-right.
  fitSprite(k, k, "whack-hammer", 1280, 960, 140, "center", 20);

  // ---------- back button ----------
  const backBtn = k.add([
    k.rect(96, 64, { radius: 16 }),
    k.pos(32, 32),
    k.color(...CARD),
    k.outline(4, k.rgb(...INK)),
    k.area(),
    k.z(30),
  ]);
  backBtn.add([
    k.text("←", { size: 40, font: FONT }),
    k.anchor("center"),
    k.pos(48, 32),
    k.color(...INK),
  ]);
  backBtn.onClick(() => k.go("gamesPicker"));

  // ---------- per-number color helpers ----------
  const DIGIT_COLOR = [
    BLUE, GREEN, ORANGE, PURPLE, PINK, ORANGE_DEEP, SUCCESS, DANGER,
    PURPLE, GREEN,
  ];

  // ---------- holes + moles ----------
  for (let i = 0; i < HOLE_COUNT; i++) {
    const [x, y] = HOLE_POS[i];
    // Round dirt hole. Size 260 keeps the hole footprint close to the
    // mole sprite (rendered 328px wide at scale 0.32) so the mole's
    // dirt mound visually continues into the hole dirt. z=2 keeps the
    // hole below the mole sprite.
    fitSprite(k, k, "whack-hole-clean", x, y, 260, "center", 2);

    // Mole grows up from below the hole. The whole mole + sprite +
    // number rides on a single position so the pop-up tween moves
    // everything together. moleGroup z=10 keeps it above the hole rim.
    const moleGroup = k.add([
      k.pos(x, y + HIDDEN),
      k.anchor("center"),
      k.opacity(1),
      k.z(10),
      "mole",
    ]);

    // Visible mole body. The mole sprite bakes in its own dirt mound,
    // so the MOLE_REST_LIFT constant is tuned to align that baked-in
    // dirt rim with the hole sprite's rim. Scale 0.32 keeps the mole
    // body big and readable. The hole sprite (z=12) is sized smaller
    // than the mole sprite so only the mole's dirt mound gets masked
    // — the cream body stays fully visible above the hole rim.
    const moleSpriteNode = moleGroup.add([
      k.sprite("whack-mole-popup"),
      k.pos(0, 30),
      k.anchor("center"),
      k.scale(0.32),
      k.area(),
    ]);

    // Soft golden halo behind the mole — only visible on the correct
    // mole (see showCorrectGlow). Starts hidden so non-correct
    // moles don't carry a halo, matching the reference image where
    // only the answer mole is highlighted.
    const halo = moleGroup.add([
      k.circle(150),
      k.pos(0, 0),
      k.anchor("center"),
      k.color(255, 220, 100),
      k.opacity(0),
      k.z(-1),
    ]);
    // Four small stars around the halo that brighten on correct
    // tap.
    const haloStars = [];
    for (let s = 0; s < 4; s++) {
      const ang = (s * Math.PI * 2) / 4 + Math.PI / 4;
      const star = moleGroup.add([
        k.text("★", { size: 32, font: FONT }),
        k.anchor("center"),
        k.pos(Math.cos(ang) * 95, Math.sin(ang) * 95),
        k.color(...YELLOW),
        k.opacity(0),
      ]);
      haloStars.push(star);
    }

    // Brighter pulsing stars that pop on correct tap to confirm the
    // correct answer.
    const starNodes = [];
    for (let s = 0; s < 4; s++) {
      const star = moleGroup.add([
        k.text("★", { size: 50, font: FONT }),
        k.pos(0, -90),
        k.anchor("center"),
        k.color(...YELLOW),
        k.opacity(0),
      ]);
      starNodes.push(star);
    }

    // Answer digit — drawn directly on the mole's cream belly. The
    // mole sprite lives at moleGroup-internal (0, 30); its cream
    // tummy centre sits at about 0.625 of the sprite height, so
    // (0.625 − 0.5) × 0.32 × 1024 ≈ 41 below the sprite centre.
    // 30 + 41 ≈ 71 puts the digit on the belly centre, well clear
    // of the dirt mound that starts around y = 106.
    const numText = moleGroup.add([
      k.text("", { size: 56, font: FONT }),
      k.anchor("center"),
      k.pos(0, 71),
      k.color(...INK),
      k.z(1),
    ]);

    const entry = {
      holeX: x, holeY: y,
      moleGroup, moleSpriteNode, numText,
      halo, haloStars, starNodes,
      value: null,
      up: false,
      correct: false,
      generation: 0,
      motionHandle: null,
    };

    moleSpriteNode.onClick(() => onMoleTap(entry));
    moleObjs.push(entry);
  }

  // ---------- round flow ----------
  function cancelMoleMotion(entry) {
    entry.generation += 1;
    if (entry.motionHandle) {
      try { entry.motionHandle.cancel(); } catch (_) {}
      entry.motionHandle = null;
    }
  }

  function spawnMole(entry, value, isCorrect) {
    cancelMoleMotion(entry);
    const token = entry.generation;
    entry.value = value;
    entry.correct = isCorrect;
    entry.numText.text = String(value);
    entry.numText.color = k.rgb(...DIGIT_COLOR[value - 10]);
    entry.up = true;
    entry.moleGroup.pos.y = entry.holeY + HIDDEN;
    const restY = entry.holeY - MOLE_REST_LIFT;
    const startT = k.time();
    entry.motionHandle = k.onUpdate(() => {
      if (entry.generation !== token) return;
      const t = Math.min(1, (k.time() - startT) / 0.42);
      entry.moleGroup.pos.y = entry.holeY + HIDDEN - POP_DY * easeOutBack(t);
      if (t >= 1) {
        entry.moleGroup.pos.y = restY;
        try { entry.motionHandle.cancel(); } catch (_) {}
        entry.motionHandle = null;
      }
    });
  }

  function sinkMole(entry, dur = 0.30) {
    cancelMoleMotion(entry);
    const token = entry.generation;
    entry.up = false;
    const startY = entry.moleGroup.pos.y;
    // Sink down to holeY + MOLE_HIDE_OFFSET_Y — a y just below the
    // hole's top rim so the mole sprite's head ends up inside the hole
    // sprite rather than poking out. The mole then disappears into the
    // hole instead of sliding off the bottom of the screen.
    const endY = entry.holeY + MOLE_HIDE_OFFSET_Y;
    const startT = k.time();
    entry.motionHandle = k.onUpdate(() => {
      if (entry.generation !== token) return;
      const t = Math.min(1, (k.time() - startT) / dur);
      entry.moleGroup.pos.y = startY + (endY - startY) * easeInQuad(t);
      // No opacity fade during tween: the mole visibly ducks into the
      // hole. Opacity drops to 0 only after the tween settles so the
      // mole stays "in the hole" instead of fading mid-air.
      if (t >= 1) {
        entry.moleGroup.pos.y = endY;
        entry.moleGroup.opacity = 0;
        try { entry.motionHandle.cancel(); } catch (_) {}
        entry.motionHandle = null;
      }
    });
  }

  function sinkAllMoles() {
    moleObjs.forEach((m) => sinkMole(m));
  }

  function layoutRound(sum) {
    const values = shuffle([sum, ...pickDecoys(sum, HOLE_COUNT - 1)]);
    moleObjs.forEach((m, i) => {
      m.moleGroup.opacity = 1;
      spawnMole(m, values[i], values[i] === sum);
    });
  }

  function spawnRound() {
    const { a, b, sum } = pickQuestion();
    currentAnswer = sum;
    plaqueSlots.a.text = String(a);
    plaqueSlots.b.text = String(b);
    layoutRound(sum);
    const introCue = firstRound ? "whack-q-pre" : "whack-next";
    firstRound = false;
    A.playSequence([introCue, `n-${a}`, "q-plus", `n-${b}`, "q-equals", "whack-pop"]);
  }

  function showCorrectGlow(entry) {
    entry.starNodes.forEach((star, i) => {
      star.opacity = 1;
      const ang0 = (i * Math.PI * 2) / 4;
      const startT = k.time();
      const handle = k.onUpdate(() => {
        const t = (k.time() - startT) / 0.9;
        if (t >= 1) {
          star.opacity = 0;
          try { handle.cancel(); } catch (_) {}
          return;
        }
        const radius = 110 + 8 * Math.sin(t * Math.PI);
        const ang = ang0 + t * Math.PI * 1.4;
        star.pos.x = Math.cos(ang) * radius;
        star.pos.y = -100 + Math.sin(ang) * radius * 0.6;
        star.opacity = 1 - t;
      });
    });
  }

  function onMoleTap(entry) {
    if (!running || !entry.up) return;
    if (entry.value === currentAnswer) {
      correctCount++;
      showCorrectGlow(entry);
      entry.up = false;
      moleObjs.forEach((m) => {
        if (m === entry) return;
        sinkMole(m, 0.24);
      });
      k.wait(0.55, () => sinkMole(entry, 0.30));
      A.playSequence(["whack-tap", "whack-down", "whack-correct"]);
      k.wait(0.85, () => {
        if (running) spawnRound();
      });
    } else {
      entry.up = false;
      const startX = entry.moleGroup.pos.x;
      const startT = k.time();
      const handle = k.onUpdate(() => {
        const t = (k.time() - startT) / 0.32;
        if (t >= 1) {
          entry.moleGroup.pos.x = startX;
          entry.up = true;
          try { handle.cancel(); } catch (_) {}
          return;
        }
        entry.moleGroup.pos.x = startX + Math.sin(t * Math.PI * 8) * 14 * (1 - t);
      });
      A.playSequence(["whack-tap", "whack-near"]);
    }
  }

  // ---------- timer ----------
  function tick() {
    if (!running) return;
    timeLeft--;
    stopwatchSecs.text = String(Math.max(0, timeLeft));
    if (timeLeft <= 0) endRound();
  }

  function startRound() {
    running = true;
    timeLeft = ROUND_SECONDS;
    correctCount = 0;
    firstRound = true;
    stopwatchSecs.text = String(ROUND_SECONDS);
    timerHandle = k.loop(1, tick);
    spawnRound();
  }

  function starsForScore(n) {
    let stars = 0;
    for (const t of STAR_THRESHOLDS) if (n >= t) stars++;
    return stars;
  }

  function endRound() {
    running = false;
    if (timerHandle) { timerHandle.cancel(); timerHandle = null; }
    sinkAllMoles();
    plaqueSlots.a.text = "?";
    plaqueSlots.b.text = "?";

    const stars = starsForScore(correctCount);
    if (Save) {
      const state = Save.load();
      state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
      Save.save(state);
    }

    A.playSequence(["whack-timeup", "whack-done"]);
    showEndCard(stars);
  }

  function showEndCard(stars) {
    const card = k.add([
      k.rect(560, 380, { radius: 28 }),
      k.pos(683, 512),
      k.anchor("center"),
      k.color(...CARD),
      k.outline(6, k.rgb(...ORANGE_DEEP)),
      k.z(40),
    ]);
    card.add([
      k.text("时间到啦！", { size: 44, font: FONT }),
      k.anchor("center"),
      k.pos(0, -120),
      k.color(...INK),
    ]);
    card.add([
      k.text("★".repeat(stars) + "☆".repeat(3 - stars), { size: 56, font: FONT }),
      k.anchor("center"),
      k.pos(0, -40),
      k.color(...ORANGE),
    ]);
    card.add([
      k.text(`答对 ${correctCount} 题`, { size: 32, font: FONT }),
      k.anchor("center"),
      k.pos(0, 30),
      k.color(...MUTED),
    ]);

    const again = card.add([
      k.rect(220, 76, { radius: 16 }),
      k.pos(-130, 130),
      k.anchor("center"),
      k.color(...SUCCESS),
      k.area(),
    ]);
    again.add([
      k.text("再玩一次", { size: 30, font: FONT }),
      k.anchor("center"),
      k.color(...PAPER),
    ]);
    again.onClick(() => {
      k.destroy(card);
      startRound();
    });

    const back = card.add([
      k.rect(220, 76, { radius: 16 }),
      k.pos(130, 130),
      k.anchor("center"),
      k.color(...DISABLED_BG),
      k.area(),
    ]);
    back.add([
      k.text("返回", { size: 30, font: FONT }),
      k.anchor("center"),
      k.color(...INK),
    ]);
    back.onClick(() => k.go("gamesPicker"));
  }

  // ---------- entry ----------
  A.playSequence(["whack-intro", "whack-start"]);
  startRound();

  k.onSceneLeave?.(() => {
    if (timerHandle) timerHandle.cancel();
  });
}

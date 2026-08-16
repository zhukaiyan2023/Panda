// scenes/gameWhack.js
//
// Stable whack-a-mole implementation:
// - Real mole + number + hole assets are loaded by this scene.
// - The number is a child of the mole, never a separate floating object.
// - Every hole has a fixed position on a 3x2 board.
// - Each mole follows a deterministic pop -> hold -> retreat cycle.
// - Correct tap locks the board, plays one serialized audio chain, shows a
//   hammer bonk + dizzy stars, then advances only after the chain completes.

import {
  INK, PAPER, CARD, ORANGE, ORANGE_DEEP, SUCCESS, DANGER,
  YELLOW, BLUE, GREEN, PINK, PURPLE, MUTED, DISABLED_BG, FONT,
} from "../components/theme.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";

const GAME_ID = 5;
const ROUND_SECONDS = 90;
const MOLE_COUNT = 6;

// Fixed board. No layout recalculation after the round starts.
const SLOTS = [
  [320, 515], [683, 515], [1046, 515],
  [320, 760], [683, 760], [1046, 760],
];

const MOLE_SPRITES = [
  "whack-mole-blue",
  "whack-mole-orange",
  "whack-mole-green",
];

const MOLE_SCALE = 0.31;
const HOLE_SCALE = 0.43;
const HIDDEN_Y = 155;
const REST_Y = -55;
const POP_SECONDS = 0.42;
const HOLD_SECONDS = 1.18;
const RETREAT_SECONDS = 0.42;
const CYCLE_SECONDS = 2.90;
const STAGGER_SECONDS = 0.30;
const NUMBER_Y = 72;
const NUMBER_SIZE = 58;

const DIGIT_COLORS = [
  BLUE, GREEN, ORANGE, PURPLE, PINK,
  ORANGE_DEEP, SUCCESS, DANGER, PURPLE,
];

let sessionId = 0;

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(values) {
  const a = values.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion() {
  let a;
  let b;
  let answer;
  do {
    a = rnd(2, 9);
    b = rnd(2, 9);
    answer = a + b;
  } while (answer < 11 || answer > 18);
  return { a, b, answer };
}

function buildValues(answer) {
  const values = [];
  for (let n = 10; n <= 18; n += 1) {
    if (n !== answer) values.push(n);
  }
  return shuffle([answer, ...values.slice(0, MOLE_COUNT - 1)]);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInCubic(t) {
  return t * t * t;
}

function loadAssets(k) {
  const specs = [
    ["whack-mole-blue", "assets/art/whack-mole-blue.svg?v=20260816"],
    ["whack-mole-orange", "assets/art/whack-mole-orange.svg?v=20260816"],
    ["whack-mole-green", "assets/art/whack-mole-green.svg?v=20260816"],
    ["whack-hole", "assets/art/whack-hole.svg?v=20260816"],
    ["whack-hole-front", "assets/art/whack-hole-front.svg?v=20260816"],
  ];

  return Promise.all(
    specs.map(([name, url]) =>
      Promise.resolve(k.loadSprite(name, url)).catch((error) => {
        console.error(`[whack] failed to load ${name}`, error);
        return null;
      }),
    ),
  );
}

function addPanel(k, x, y, w, h, fill, outline = INK) {
  return k.add([
    k.rect(w, h, { radius: 26 }),
    k.pos(x, y),
    k.anchor("center"),
    k.color(...fill),
    k.outline(5, k.rgb(...outline)),
  ]);
}

function saveScore(save, score) {
  if (!save) return;
  const state = save.load();
  state.starsByGame = state.starsByGame || {};
  const stars = score >= 18 ? 3 : score >= 10 ? 2 : score >= 4 ? 1 : 0;
  state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
  save.save(state);
}

function createHammer(k, x, y, onDone) {
  const hammer = k.add([
    k.pos(x + 95, y - 150),
    k.z(50),
  ]);

  hammer.add([
    k.rect(20, 122, { radius: 8 }),
    k.pos(-24, 52),
    k.anchor("center"),
    k.color(244, 176, 71),
    k.outline(4, k.rgb(...ORANGE_DEEP)),
  ]);
  hammer.add([
    k.rect(100, 44, { radius: 12 }),
    k.pos(18, 0),
    k.anchor("center"),
    k.color(231, 65, 58),
    k.outline(5, k.rgb(...INK)),
  ]);

  hammer.angle = -55;
  const start = k.time();
  const handle = hammer.onUpdate(() => {
    const t = Math.min(1, (k.time() - start) / 0.42);
    if (t < 0.55) {
      const p = easeInCubic(t / 0.55);
      hammer.angle = -55 + 120 * p;
      hammer.pos.x = x + 98 - 52 * p;
      hammer.pos.y = y - 152 + 90 * p;
    } else {
      const p = (t - 0.55) / 0.45;
      hammer.angle = 65 - 55 * p;
      hammer.pos.x = x + 46 + 25 * p;
      hammer.pos.y = y - 62 - 48 * p;
    }

    if (t >= 1) {
      handle.cancel();
      hammer.destroy();
      onDone?.();
    }
  });
}

export default function gameWhack(k) {
  const audio = window.PandaAudio;
  const save = window.PandaSave;
  const localSession = ++sessionId;

  k.add([
    k.rect(1366, 1024),
    k.pos(683, 512),
    k.anchor("center"),
    k.color(255, 241, 220),
    k.z(-100),
  ]);

  const bg = k.add([
    k.sprite("bg-meadow"),
    k.pos(683, 512),
    k.anchor("center"),
    k.z(-90),
  ]);
  bg.width = 1366;
  bg.height = 1024;

  let running = false;
  let inputLocked = true;
  let timeLeft = ROUND_SECONDS;
  let score = 0;
  let streak = 0;
  let hadWrongs = false;
  let current = null;
  let timer = null;
  let roundToken = 0;
  let audioToken = 0;
  let loopHandle = null;
  const moles = [];

  addPanel(k, 88, 78, 112, 66, PAPER);
  const back = k.add([
    k.text("←", { size: 42, font: FONT }),
    k.pos(88, 78),
    k.anchor("center"),
    k.color(...INK),
    k.area(),
    k.z(30),
  ]);
  back.onClick(() => k.go("gamesPicker"));

  addPanel(k, 683, 110, 610, 150, [250, 231, 191]);
  const eqA = k.add([k.text("?", { size: 78, font: FONT }), k.pos(505, 110), k.anchor("center"), k.color(...BLUE), k.z(30)]);
  k.add([k.text("+", { size: 72, font: FONT }), k.pos(590, 110), k.anchor("center"), k.color(...INK), k.z(30)]);
  const eqB = k.add([k.text("?", { size: 78, font: FONT }), k.pos(684, 110), k.anchor("center"), k.color(...GREEN), k.z(30)]);
  k.add([k.text("=", { size: 72, font: FONT }), k.pos(770, 110), k.anchor("center"), k.color(...INK), k.z(30)]);
  const eqAnswer = k.add([k.text("?", { size: 78, font: FONT }), k.pos(860, 110), k.anchor("center"), k.color(...DANGER), k.z(30)]);

  addPanel(k, 1180, 70, 210, 64, [249, 220, 143], ORANGE_DEEP);
  k.add([k.text("SCORE", { size: 20, font: FONT }), k.pos(1120, 54), k.anchor("center"), k.color(...INK), k.z(30)]);
  const scoreText = k.add([k.text("0", { size: 34, font: FONT }), k.pos(1250, 72), k.anchor("center"), k.color(...INK), k.z(30)]);

  addPanel(k, 1180, 152, 210, 64, PAPER);
  k.add([k.text("TIME", { size: 20, font: FONT }), k.pos(1125, 137), k.anchor("center"), k.color(...MUTED), k.z(30)]);
  const timeText = k.add([k.text(String(ROUND_SECONDS), { size: 34, font: FONT }), k.pos(1252, 154), k.anchor("center"), k.color(...INK), k.z(30)]);

  const hint = k.add([
    k.rect(340, 76, { radius: 24 }),
    k.pos(1120, 290),
    k.anchor("center"),
    k.color(255, 245, 211),
    k.outline(4, k.rgb(...ORANGE_DEEP)),
    k.z(30),
  ]);
  hint.add([
    k.text("WHACK THE RIGHT NUMBER!", { size: 25, font: FONT }),
    k.pos(0, 0),
    k.anchor("center"),
    k.color(...INK),
  ]);

  function hideMole(entry) {
    entry.visible = false;
    entry.group.opacity = 0;
    entry.group.pos.y = entry.y + HIDDEN_Y;
  }

  function setMolePose(entry, localT, now) {
    if (localT < POP_SECONDS) {
      const p = easeOutBack(localT / POP_SECONDS);
      entry.visible = true;
      entry.group.opacity = 1;
      entry.group.pos.y = entry.y + HIDDEN_Y + (REST_Y - HIDDEN_Y) * p;
      return;
    }

    if (localT < POP_SECONDS + HOLD_SECONDS) {
      entry.visible = true;
      entry.group.opacity = 1;
      entry.group.pos.y = entry.y + REST_Y + Math.sin(now * 5 + entry.index) * 4;
      return;
    }

    if (localT < POP_SECONDS + HOLD_SECONDS + RETREAT_SECONDS) {
      entry.visible = true;
      const p = easeInCubic(
        (localT - POP_SECONDS - HOLD_SECONDS) / RETREAT_SECONDS,
      );
      entry.group.opacity = 1;
      entry.group.pos.y = entry.y + REST_Y + (HIDDEN_Y - REST_Y) * p;
      return;
    }

    hideMole(entry);
  }

  function buildMoles() {
    for (let i = 0; i < MOLE_COUNT; i += 1) {
      const [x, y] = SLOTS[i];

      const holeBack = k.add([
        k.sprite("whack-hole"),
        k.pos(x, y),
        k.anchor("center"),
        k.scale(HOLE_SCALE),
        k.z(2),
      ]);

      const group = k.add([
        k.pos(x, y + HIDDEN_Y),
        k.z(4),
      ]);

      const moleNode = group.add([
        k.sprite(MOLE_SPRITES[i % MOLE_SPRITES.length]),
        k.pos(0, 0),
        k.anchor("center"),
        k.scale(MOLE_SCALE),
        k.area(),
      ]);

      const number = group.add([
        k.text("", { size: NUMBER_SIZE, font: FONT }),
        k.pos(0, NUMBER_Y),
        k.anchor("center"),
        k.color(...INK),
        k.outline(5, k.rgb(...PAPER)),
        k.z(2),
      ]);

      const holeFront = k.add([
        k.sprite("whack-hole-front"),
        k.pos(x, y),
        k.anchor("center"),
        k.scale(HOLE_SCALE),
        k.z(6),
      ]);

      const entry = {
        index: i,
        x,
        y,
        group,
        moleNode,
        number,
        holeBack,
        holeFront,
        value: null,
        visible: false,
        startAt: 0,
      };

      moleNode.onClick(() => {
        if (!running || inputLocked || !entry.visible || entry.value == null) return;
        onMoleTap(entry);
      });

      moles.push(entry);
    }
  }

  function startMoleLoop() {
    if (loopHandle) loopHandle.cancel();
    const startTime = k.time();
    moles.forEach((entry) => {
      entry.startAt = startTime + entry.index * STAGGER_SECONDS;
    });

    loopHandle = k.onUpdate(() => {
      if (!running || inputLocked) return;
      const now = k.time();
      for (const entry of moles) {
        const elapsed = now - entry.startAt;
        if (elapsed < 0) {
          hideMole(entry);
          continue;
        }
        setMolePose(entry, elapsed % CYCLE_SECONDS, now);
      }
    });
  }

  function stopMoleLoop() {
    if (!loopHandle) return;
    loopHandle.cancel();
    loopHandle = null;
  }

  function assignRound(question) {
    const values = buildValues(question.answer);
    roundToken += 1;
    values.forEach((value, i) => {
      const entry = moles[i];
      entry.value = value;
      entry.number.text = String(value);
      entry.number.color = k.rgb(...DIGIT_COLORS[i % DIGIT_COLORS.length]);
      hideMole(entry);
    });
  }

  function nextRound() {
    if (!running) return;
    inputLocked = true;
    stopMoleLoop();

    const q = buildQuestion();
    current = q;
    eqA.text = String(q.a);
    eqB.text = String(q.b);
    eqAnswer.text = "?";
    assignRound(q);

    inputLocked = false;
    startMoleLoop();

    const cueStart = score === 0 ? "whack-q-pre" : "whack-next";
    audio.stopAllAudio();
    audio.playSequence([
      cueStart,
      `n-${q.a}`,
      "q-plus",
      `n-${q.b}`,
      "q-equals",
    ], 120, 0);
  }

  function playSingleAudio(ids, onComplete) {
    const generation = ++audioToken;
    audio.stopAllAudio();
    audio.playSequence(ids, 130, 0, () => {
      if (generation !== audioToken || !running) return;
      onComplete?.();
    });
  }

  function showDizzy(entry) {
    const stars = [];
    const start = k.time();
    for (let i = 0; i < 3; i += 1) {
      stars.push(k.add([
        k.text("★", { size: 38, font: FONT }),
        k.pos(entry.x, entry.y - 98),
        k.anchor("center"),
        k.color(...YELLOW),
        k.z(45),
      ]));
    }
    const handle = k.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.95);
      stars.forEach((star, i) => {
        const angle = i * (Math.PI * 2 / 3) + t * Math.PI * 4;
        star.pos.x = entry.x + Math.cos(angle) * 58;
        star.pos.y = entry.y - 102 + Math.sin(angle) * 24;
        star.opacity = 1 - t;
      });
      if (t >= 1) {
        handle.cancel();
        stars.forEach((star) => star.destroy());
      }
    });
  }

  function hammerHit(entry, onDone) {
    createHammer(k, entry.x, entry.y, onDone);
    showDizzy(entry);

    const start = k.time();
    const baseScale = MOLE_SCALE;
    const handle = entry.moleNode.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.34);
      if (t < 1) {
        const wobble = Math.sin(t * Math.PI * 8) * 0.08 * (1 - t);
        entry.moleNode.scale = k.vec2(baseScale * (1 + wobble), baseScale * (1 - wobble));
      } else {
        entry.moleNode.scale = k.vec2(baseScale, baseScale);
        handle.cancel();
      }
    });
  }

  function retreatAll() {
    stopMoleLoop();
    moles.forEach(hideMole);
  }

  function onMoleTap(entry) {
    if (!current || inputLocked || !entry.visible) return;
    inputLocked = true;
    stopMoleLoop();

    const correct = entry.value === current.answer;
    if (!correct) {
      hadWrongs = true;
      streak = 0;
      hammerHit(entry, () => {
        entry.group.pos.y = entry.y + REST_Y;
        inputLocked = false;
        startMoleLoop();
      });

      playSingleAudio([
        "whack-tap",
        pickWrongCue({ isNearMiss: Math.abs(entry.value - current.answer) <= 1 }),
      ]);
      return;
    }

    score += 1;
    streak += 1;
    scoreText.text = String(score);
    eqAnswer.text = String(current.answer);

    const { chain } = pickCheerCue({
      streak,
      isRoundComplete: false,
      levelId: GAME_ID,
      hasDiscovery: false,
      hadWrongs,
    });

    hammerHit(entry, retreatAll);

    // Exactly one audio sequence for the complete correct-answer event.
    // No fixed timeout is used to start the next round.
    playSingleAudio([
      "whack-tap",
      ...chain,
      `n-${current.a}`,
      "q-plus",
      `n-${current.b}`,
      "q-equals",
      `n-${current.answer}`,
    ], nextRound);
  }

  function endGame() {
    if (!running) return;
    running = false;
    inputLocked = true;
    stopMoleLoop();
    audioToken += 1;
    audio.stopAllAudio();
    if (timer) {
      timer.cancel();
      timer = null;
    }
    retreatAll();
    saveScore(save, score);

    const card = k.add([
      k.rect(560, 350, { radius: 28 }),
      k.pos(683, 540),
      k.anchor("center"),
      k.color(...CARD),
      k.outline(6, k.rgb(...ORANGE_DEEP)),
      k.z(60),
    ]);
    card.add([
      k.text("TIME'S UP!", { size: 46, font: FONT }),
      k.pos(0, -105),
      k.anchor("center"),
      k.color(...INK),
    ]);
    card.add([
      k.text(`Score: ${score}`, { size: 34, font: FONT }),
      k.pos(0, -30),
      k.anchor("center"),
      k.color(...INK),
    ]);
    card.add([
      k.text(score >= 18 ? "★★★" : score >= 10 ? "★★☆" : score >= 4 ? "★☆☆" : "☆☆☆", { size: 60, font: FONT }),
      k.pos(0, 48),
      k.anchor("center"),
      k.color(...ORANGE),
    ]);

    const again = card.add([
      k.rect(220, 70, { radius: 18 }),
      k.pos(-125, 125),
      k.anchor("center"),
      k.color(...SUCCESS),
      k.area(),
    ]);
    again.add([k.text("PLAY AGAIN", { size: 26, font: FONT }), k.anchor("center"), k.color(...PAPER)]);
    again.onClick(() => {
      card.destroy();
      running = true;
      inputLocked = false;
      timeLeft = ROUND_SECONDS;
      score = 0;
      streak = 0;
      hadWrongs = false;
      scoreText.text = "0";
      timeText.text = String(ROUND_SECONDS);
      nextRound();
    });

    const backButton = card.add([
      k.rect(180, 70, { radius: 18 }),
      k.pos(105, 125),
      k.anchor("center"),
      k.color(...DISABLED_BG),
      k.area(),
    ]);
    backButton.add([k.text("BACK", { size: 26, font: FONT }), k.anchor("center"), k.color(...INK)]);
    backButton.onClick(() => k.go("gamesPicker"));
  }

  function tick() {
    if (!running) return;
    timeLeft = Math.max(0, timeLeft - 1);
    timeText.text = String(timeLeft);
    if (timeLeft <= 10) timeText.color = k.rgb(...DANGER);
    if (timeLeft === 0) endGame();
  }

  loadAssets(k).then(() => {
    if (localSession !== sessionId) return;
    buildMoles();
    running = true;
    inputLocked = false;
    timer = k.loop(1, tick);

    audio.stopAllAudio();
    audio.playSequence(["whack-intro", "whack-start"], 140, 0, () => {
      if (running) nextRound();
    });
  });

  k.onSceneLeave?.(() => {
    running = false;
    inputLocked = true;
    audioToken += 1;
    stopMoleLoop();
    if (timer) timer.cancel();
    audio.stopAllAudio();
  });
}

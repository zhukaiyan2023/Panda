// scenes/gameWhack.js
// PNG-first whack-a-mole game. The scene uses the existing polished PNG
// assets and keeps every number inside the mole visual unit.

import {
  INK, PAPER, ORANGE, ORANGE_DEEP, SUCCESS, DANGER,
  YELLOW, BLUE, GREEN, PINK, PURPLE, MUTED, FONT,
} from "../components/theme.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";

const GAME_ID = 5;
const ROUND_SECONDS = 90;

const SLOTS = [
  [300, 585], [683, 585], [1066, 585],
  [300, 815], [683, 815], [1066, 815],
];

const MOLE_SCALE = 0.24;
const HOLE_SCALE = 0.30;
const HIDDEN_OFFSET = 145;
const REST_OFFSET = -48;
const POP_SECONDS = 0.48;
const HOLD_SECONDS = 1.30;
const RETREAT_SECONDS = 0.45;
const CYCLE_SECONDS = 3.15;
const STAGGER_SECONDS = 0.38;
const NUMBER_Y = 58;
const NUMBER_SIZE = 62;
const DIGIT_COLORS = [BLUE, GREEN, ORANGE, PURPLE, PINK, ORANGE_DEEP, SUCCESS, DANGER, YELLOW];

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(values) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQuestion() {
  let a;
  let b;
  let answer;
  do {
    a = rnd(2, 9);
    b = rnd(2, 9);
    answer = a + b;
  } while (answer < 10 || answer > 18);
  return { a, b, answer };
}

function buildValues(answer) {
  const candidates = [];
  for (let value = 10; value <= 18; value += 1) {
    if (value !== answer) candidates.push(value);
  }
  return shuffle([answer, ...shuffle(candidates).slice(0, 5)]);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInCubic(t) {
  return t * t * t;
}

function safeCancel(handle) {
  if (!handle) return;
  try { handle.cancel(); } catch (_) {}
}

function fitSprite(k, name, x, y, targetWidth, z = 1) {
  const sprite = k.getSprite(name);
  if (!sprite) return null;
  const sourceWidth = Number(sprite.data?.width || targetWidth);
  const scale = targetWidth / sourceWidth;
  return k.add([
    k.sprite(name),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(scale),
    k.z(z),
  ]);
}

function saveStars(save, score) {
  if (!save) return;
  const state = save.load();
  state.starsByGame = state.starsByGame || {};
  const stars = score >= 18 ? 3 : score >= 10 ? 2 : score >= 4 ? 1 : 0;
  state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
  save.save(state);
}

export default function gameWhack(k) {
  const audio = window.PandaAudio;
  const save = window.PandaSave;

  let running = false;
  let locked = true;
  let timeLeft = ROUND_SECONDS;
  let score = 0;
  let streak = 0;
  let hadWrongs = false;
  let question = null;
  let timerHandle = null;
  let moleLoopHandle = null;
  let audioToken = 0;

  const moles = [];

  // ---------- background ----------
  if (!fitSprite(k, "whack-bg-meadow", 683, 512, 1366, -20)) {
    k.add([
      k.rect(1366, 1024),
      k.pos(683, 512),
      k.anchor("center"),
      k.color(255, 241, 220),
      k.z(-20),
    ]);
  }

  // ---------- HUD: use the existing PNG art, not hand-drawn substitutes ----------
  const back = k.add([
    k.rect(104, 68, { radius: 18 }),
    k.pos(80, 76),
    k.anchor("center"),
    k.color(...PAPER),
    k.outline(5, k.rgb(...INK)),
    k.area(),
    k.z(30),
  ]);
  back.add([
    k.text("←", { size: 42, font: FONT }),
    k.pos(0, 0),
    k.anchor("center"),
    k.color(...INK),
  ]);
  back.onClick(() => k.go("gamesPicker"));

  fitSprite(k, "whack-plaque", 683, 118, 590, 20);
  const eqA = k.add([k.text("?", { size: 76, font: FONT }), k.pos(520, 118), k.anchor("center"), k.color(...BLUE), k.z(25)]);
  k.add([k.text("+", { size: 70, font: FONT }), k.pos(600, 118), k.anchor("center"), k.color(...INK), k.z(25)]);
  const eqB = k.add([k.text("?", { size: 76, font: FONT }), k.pos(685, 118), k.anchor("center"), k.color(...GREEN), k.z(25)]);
  k.add([k.text("=", { size: 70, font: FONT }), k.pos(765, 118), k.anchor("center"), k.color(...INK), k.z(25)]);
  const eqAnswer = k.add([k.text("?", { size: 76, font: FONT }), k.pos(850, 118), k.anchor("center"), k.color(...DANGER), k.z(25)]);

  fitSprite(k, "whack-stopwatch", 1208, 76, 176, 20);
  const timeText = k.add([k.text(String(ROUND_SECONDS), { size: 38, font: FONT }), k.pos(1210, 86), k.anchor("center"), k.color(...ORANGE_DEEP), k.z(26)]);

  fitSprite(k, "whack-starbar", 1208, 160, 232, 20);
  const scoreText = k.add([k.text("0", { size: 34, font: FONT }), k.pos(1124, 159), k.anchor("center"), k.color(...INK), k.z(26)]);

  fitSprite(k, "whack-hint-sign", 1185, 282, 300, 20);
  k.add([k.text("WHACK THE RIGHT NUMBER!", { size: 23, font: FONT }), k.pos(1185, 282), k.anchor("center"), k.color(...INK), k.z(26)]);

  // ---------- mole units ----------
  for (let i = 0; i < SLOTS.length; i += 1) {
    const [x, y] = SLOTS[i];
    const hole = k.add([
      k.sprite("whack-hole-clean"),
      k.pos(x, y),
      k.anchor("center"),
      k.scale(HOLE_SCALE),
      k.z(4),
    ]);

    const group = k.add([
      k.pos(x, y + HIDDEN_OFFSET),
      k.opacity(0),
      k.z(8),
    ]);

    const mole = group.add([
      k.sprite("whack-mole-popup"),
      k.pos(0, 0),
      k.anchor("center"),
      k.scale(MOLE_SCALE),
      k.area({ scale: 0.82 }),
    ]);

    const number = group.add([
      k.text("", { size: NUMBER_SIZE, font: FONT }),
      k.pos(0, NUMBER_Y),
      k.anchor("center"),
      k.color(...INK),
      k.outline(5, k.rgb(...PAPER)),
      k.z(2),
    ]);

    const entry = {
      index: i,
      x,
      y,
      hole,
      group,
      mole,
      number,
      value: null,
      visible: false,
      startAt: 0,
      dizzy: false,
    };

    mole.onClick(() => handleMoleTap(entry));
    moles.push(entry);
  }

  function hideMole(entry) {
    entry.visible = false;
    entry.group.opacity = 0;
    entry.group.pos.x = entry.x;
    entry.group.pos.y = entry.y + HIDDEN_OFFSET;
    entry.group.scale = k.vec2(1, 1);
    entry.number.opacity = 0;
    entry.mole.angle = 0;
  }

  function updateMole(entry, elapsed, now) {
    const cycle = elapsed % CYCLE_SECONDS;

    if (cycle < POP_SECONDS) {
      entry.visible = true;
      entry.group.opacity = 1;
      entry.number.opacity = 1;
      const p = easeOutBack(cycle / POP_SECONDS);
      entry.group.pos.y = entry.y + HIDDEN_OFFSET + (REST_OFFSET - HIDDEN_OFFSET) * p;
      entry.group.scale = k.vec2(0.94 + 0.06 * p, 0.94 + 0.06 * p);
      return;
    }

    if (cycle < POP_SECONDS + HOLD_SECONDS) {
      entry.visible = true;
      entry.group.opacity = 1;
      entry.number.opacity = 1;
      entry.group.pos.y = entry.y + REST_OFFSET + Math.sin(now * 5 + entry.index) * 4;
      entry.group.scale = k.vec2(1, 1);
      return;
    }

    if (cycle < POP_SECONDS + HOLD_SECONDS + RETREAT_SECONDS) {
      entry.visible = true;
      entry.group.opacity = 1;
      const p = easeInCubic((cycle - POP_SECONDS - HOLD_SECONDS) / RETREAT_SECONDS);
      entry.group.pos.y = entry.y + REST_OFFSET + (HIDDEN_OFFSET - REST_OFFSET) * p;
      entry.group.scale = k.vec2(1 - 0.06 * p, 1 - 0.06 * p);
      entry.number.opacity = p > 0.72 ? 1 - ((p - 0.72) / 0.28) : 1;
      return;
    }

    hideMole(entry);
  }

  function stopMoleLoop() {
    safeCancel(moleLoopHandle);
    moleLoopHandle = null;
  }

  function startMoleLoop() {
    stopMoleLoop();
    const start = k.time();
    moles.forEach((entry, index) => {
      entry.startAt = start + index * STAGGER_SECONDS;
      hideMole(entry);
    });

    moleLoopHandle = k.onUpdate(() => {
      if (!running || locked) return;
      const now = k.time();
      for (const entry of moles) {
        const elapsed = now - entry.startAt;
        if (elapsed < 0) continue;
        updateMole(entry, elapsed, now);
      }
    });
  }

  function hideAll() {
    stopMoleLoop();
    moles.forEach(hideMole);
  }

  // ---------- hammer / dizzy ----------
  function hammerBonk(entry) {
    const hammer = k.add([
      k.sprite("whack-hammer"),
      k.pos(entry.x + 105, entry.y - 135),
      k.anchor("center"),
      k.scale(0.17),
      k.z(60),
    ]);

    const startX = hammer.pos.x;
    const startY = hammer.pos.y;
    const hitX = entry.x + 28;
    const hitY = entry.y - 5;
    const start = k.time();
    const handle = hammer.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.46);
      if (t < 0.58) {
        const p = easeInCubic(t / 0.58);
        hammer.pos.x = startX + (hitX - startX) * p;
        hammer.pos.y = startY + (hitY - startY) * p;
        hammer.angle = -38 + 78 * p;
      } else {
        const p = (t - 0.58) / 0.42;
        hammer.pos.x = hitX + (startX - hitX) * p;
        hammer.pos.y = hitY + (startY - hitY) * p;
        hammer.angle = 40 - 78 * p;
      }
      if (t >= 1) {
        safeCancel(handle);
        hammer.destroy();
      }
    });

    const burst = k.add([
      k.text("★", { size: 46, font: FONT }),
      k.pos(hitX, hitY - 20),
      k.anchor("center"),
      k.color(...YELLOW),
      k.z(61),
    ]);
    const burstStart = k.time();
    const burstHandle = burst.onUpdate(() => {
      const t = Math.min(1, (k.time() - burstStart) / 0.35);
      burst.scale = k.vec2(0.6 + t, 0.6 + t);
      burst.opacity = 1 - t;
      if (t >= 1) {
        safeCancel(burstHandle);
        burst.destroy();
      }
    });
  }

  function dizzy(entry) {
    entry.dizzy = true;
    const stars = [];
    for (let i = 0; i < 3; i += 1) {
      stars.push(k.add([
        k.text("★", { size: 34, font: FONT }),
        k.pos(entry.x, entry.y - 88),
        k.anchor("center"),
        k.color(...YELLOW),
        k.z(62),
      ]));
    }

    const start = k.time();
    const handle = k.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.9);
      entry.mole.angle = Math.sin(t * Math.PI * 6) * 9 * (1 - t);
      entry.group.scale = k.vec2(1 - 0.06 * Math.sin(t * Math.PI), 1 + 0.06 * Math.sin(t * Math.PI));
      stars.forEach((star, i) => {
        const a = i * ((Math.PI * 2) / 3) + t * Math.PI * 2;
        star.pos.x = entry.x + Math.cos(a) * (48 + 15 * t);
        star.pos.y = entry.y - 88 + Math.sin(a) * (25 + 8 * t);
        star.opacity = 1 - t;
      });
      if (t >= 1) {
        safeCancel(handle);
        stars.forEach((star) => star.destroy());
        entry.mole.angle = 0;
        entry.group.scale = k.vec2(1, 1);
        entry.dizzy = false;
      }
    });
  }

  // ---------- audio ----------
  function playQuestionAudio(q) {
    audio.stopAllAudio();
    audio.playSequence([
      score === 0 ? "whack-q-pre" : "whack-next",
      `n-${q.a}`,
      "q-plus",
      `n-${q.b}`,
      "q-equals",
      "whack-pop",
    ], 110);
  }

  function playCorrectAudio(q, token) {
    const cheer = pickCheerCue({
      streak,
      isRoundComplete: false,
      levelId: GAME_ID,
      hasDiscovery: false,
      hadWrongs,
    });
    const chain = [
      "whack-tap",
      ...cheer.chain,
      `n-${q.a}`,
      "q-plus",
      `n-${q.b}`,
      "q-equals",
      `n-${q.answer}`,
    ];
    audio.stopAllAudio();
    audio.playSequence(chain, 140, 0, () => {
      if (!running || token !== audioToken) return;
      nextRound();
    });
  }

  // ---------- round ----------
  function renderQuestion(q) {
    eqA.text = String(q.a);
    eqB.text = String(q.b);
    eqAnswer.text = "?";

    const values = buildValues(q.answer);
    values.forEach((value, index) => {
      const entry = moles[index];
      entry.value = value;
      entry.number.text = String(value);
      entry.number.color = k.rgb(...DIGIT_COLORS[index % DIGIT_COLORS.length]);
      hideMole(entry);
    });
  }

  function nextRound() {
    if (!running) return;
    locked = true;
    hideAll();
    question = buildQuestion();
    renderQuestion(question);
    locked = false;
    startMoleLoop();
    playQuestionAudio(question);
  }

  function handleMoleTap(entry) {
    if (!running || locked || !entry.visible || !question) return;

    if (entry.value !== question.answer) {
      hadWrongs = true;
      streak = 0;
      audio.stopAllAudio();
      audio.playSequence(["whack-tap", pickWrongCue({ isNearMiss: false })], 120);

      const baseX = entry.group.pos.x;
      const start = k.time();
      const handle = entry.group.onUpdate(() => {
        const t = Math.min(1, (k.time() - start) / 0.30);
        entry.group.pos.x = baseX + Math.sin(t * Math.PI * 10) * 10 * (1 - t);
        if (t >= 1) {
          safeCancel(handle);
          entry.group.pos.x = baseX;
        }
      });
      return;
    }

    locked = true;
    stopMoleLoop();
    score += 1;
    streak += 1;
    scoreText.text = String(score);

    hammerBonk(entry);
    dizzy(entry);

    audioToken += 1;
    playCorrectAudio(question, audioToken);
  }

  function tick() {
    if (!running) return;
    timeLeft -= 1;
    timeText.text = String(Math.max(0, timeLeft));
    if (timeLeft <= 0) endGame();
  }

  function endGame() {
    if (!running) return;
    running = false;
    locked = true;
    audioToken += 1;
    audio.stopAllAudio();
    safeCancel(timerHandle);
    timerHandle = null;
    hideAll();
    saveStars(save, score);

    audio.playSequence(["whack-timeup", "whack-done"], 140);

    const card = k.add([
      k.rect(560, 350, { radius: 30 }),
      k.pos(683, 512),
      k.anchor("center"),
      k.color(255, 247, 224),
      k.outline(6, k.rgb(...ORANGE_DEEP)),
      k.z(100),
    ]);
    card.add([k.text("Great job!", { size: 50, font: FONT }), k.pos(0, -90), k.anchor("center"), k.color(...INK)]);
    card.add([k.text(String(score), { size: 74, font: FONT }), k.pos(0, 0), k.anchor("center"), k.color(...ORANGE_DEEP)]);

    const again = card.add([
      k.rect(200, 68, { radius: 18 }),
      k.pos(-112, 110),
      k.anchor("center"),
      k.color(...SUCCESS),
      k.area(),
    ]);
    again.add([k.text("PLAY AGAIN", { size: 22, font: FONT }), k.anchor("center"), k.color(...PAPER)]);
    again.onClick(() => { card.destroy(); startGame(); });

    const back = card.add([
      k.rect(200, 68, { radius: 18 }),
      k.pos(112, 110),
      k.anchor("center"),
      k.color(242, 229, 200),
      k.area(),
    ]);
    back.add([k.text("BACK", { size: 22, font: FONT }), k.anchor("center"), k.color(...INK)]);
    back.onClick(() => k.go("gamesPicker"));
  }

  function startGame() {
    running = true;
    locked = false;
    timeLeft = ROUND_SECONDS;
    score = 0;
    streak = 0;
    hadWrongs = false;
    scoreText.text = "0";
    timeText.text = String(ROUND_SECONDS);
    nextRound();
    safeCancel(timerHandle);
    timerHandle = k.loop(1, tick);
  }

  startGame();

  k.onSceneLeave?.(() => {
    audioToken += 1;
    audio.stopAllAudio();
    safeCancel(timerHandle);
    stopMoleLoop();
  });
}

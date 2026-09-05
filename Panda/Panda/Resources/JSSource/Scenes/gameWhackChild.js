// scenes/gameWhackChild.js
// Child-first whack-a-mole scene.
//
// Design rules:
// - Only ONE mole is active at a time.
// - Each mole gets a full 6-second visible window.
// - Fixed 3x2 positions; no random motion between holes.
// - Mole + number are one visual group.
// - Correct answer: hammer -> dizzy -> serialized audio -> next round.
// - Wrong answer: gentle shake + one short wrong cue; the same mole remains.
// - PNG-first: uses the project's existing whack PNG assets.

import {
  INK, PAPER, ORANGE, ORANGE_DEEP, SUCCESS, DANGER,
  YELLOW, BLUE, GREEN, PINK, PURPLE, MUTED, FONT,
} from "../components/theme.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";

const GAME_ID = 5;
const ROUND_SECONDS = 90;
const MOLE_VISIBLE_SECONDS = 6;
const NEXT_MOLE_GAP_SECONDS = 0.7;
const POP_SECONDS = 0.55;
const RETREAT_SECONDS = 0.5;

// Intentionally conservative for 3-6 year olds.
// The second row is moved up so the full mole stays inside the 1024px canvas.
const SLOTS = [
  [300, 495], [683, 495], [1066, 495],
  [300, 700], [683, 700], [1066, 700],
];

const HOLE_SCALE = 0.22;
const MOLE_SCALE = 0.19;
const HIDDEN_OFFSET = 105;
const REST_OFFSET = -76;
const NUMBER_Y = 48;
const NUMBER_SIZE = 58;

const DIGIT_COLORS = [BLUE, GREEN, ORANGE, PURPLE, PINK, ORANGE_DEEP];

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

function safeCancel(handle) {
  if (!handle) return;
  try { handle.cancel(); } catch (_) { /* scene already gone */ }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t) {
  return t * t * t;
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
  for (let n = 10; n <= 18; n += 1) {
    if (n !== answer) candidates.push(n);
  }
  return shuffle([answer, ...shuffle(candidates).slice(0, 5)]);
}

function saveStars(save, score) {
  if (!save) return;
  const state = save.load();
  state.starsByGame = state.starsByGame || {};
  const stars = score >= 12 ? 3 : score >= 7 ? 2 : score >= 3 ? 1 : 0;
  state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
  save.save(state);
}

function fitSprite(k, name, x, y, targetWidth, z = 1) {
  const info = k.getSprite(name);
  if (!info) return null;
  const sourceWidth = Number(info.data?.width || targetWidth);
  const scale = targetWidth / sourceWidth;
  return k.add([
    k.sprite(name),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(scale),
    k.z(z),
  ]);
}

export default function gameWhackChild(k) {
  const audio = window.PandaAudio;
  const save = window.PandaSave;

  let running = false;
  let locked = true;
  let timeLeft = ROUND_SECONDS;
  let score = 0;
  let streak = 0;
  let hadWrongs = false;
  let question = null;
  let currentIndex = 0;
  let active = null;
  let phase = "hidden";
  let phaseStarted = 0;
  let gapHandle = null;
  let timerHandle = null;
  let moleUpdateHandle = null;
  let audioToken = 0;
  let hammerHandle = null;
  let dizzyHandle = null;

  const entries = [];

  // ---------- background ----------
  fitSprite(k, "whack-bg-meadow", 683, 512, 1366, -20);

  // ---------- HUD ----------
  const back = k.add([
    k.rect(104, 68, { radius: 18 }),
    k.pos(78, 76),
    k.anchor("center"),
    k.color(...PAPER),
    k.outline(5, k.rgb(...INK)),
    k.area(),
    k.z(40),
  ]);
  back.add([
    k.text("←", { size: 42, font: FONT }),
    k.anchor("center"),
    k.color(...INK),
  ]);
  back.onClick(() => k.go("gamesPicker"));

  fitSprite(k, "whack-plaque", 683, 112, 590, 30);
  const eqA = k.add([k.text("?", { size: 74, font: FONT }), k.pos(520, 112), k.anchor("center"), k.color(...BLUE), k.z(32)]);
  k.add([k.text("+", { size: 68, font: FONT }), k.pos(600, 112), k.anchor("center"), k.color(...INK), k.z(32)]);
  const eqB = k.add([k.text("?", { size: 74, font: FONT }), k.pos(683, 112), k.anchor("center"), k.color(...GREEN), k.z(32)]);
  k.add([k.text("=", { size: 68, font: FONT }), k.pos(766, 112), k.anchor("center"), k.color(...INK), k.z(32)]);
  const eqAnswer = k.add([k.text("?", { size: 74, font: FONT }), k.pos(850, 112), k.anchor("center"), k.color(...DANGER), k.z(32)]);

  fitSprite(k, "whack-stopwatch", 1206, 72, 170, 30);
  const timeText = k.add([k.text(String(ROUND_SECONDS), { size: 36, font: FONT }), k.pos(1206, 84), k.anchor("center"), k.color(...ORANGE_DEEP), k.z(32)]);

  fitSprite(k, "whack-starbar", 1195, 160, 220, 30);
  const scoreText = k.add([k.text("0", { size: 32, font: FONT }), k.pos(1128, 159), k.anchor("center"), k.color(...INK), k.z(32)]);

  fitSprite(k, "whack-hint-sign", 1165, 292, 292, 30);
  k.add([
    k.text("WHACK THE RIGHT NUMBER!", { size: 22, font: FONT }),
    k.pos(1165, 292),
    k.anchor("center"),
    k.color(...INK),
    k.z(32),
  ]);

  // ---------- fixed mole board ----------
  for (let i = 0; i < SLOTS.length; i += 1) {
    const [x, y] = SLOTS[i];

    // Hole stays fixed. The mole group travels only vertically relative to it.
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
      k.area({ scale: 0.9 }),
    ]);

    const number = group.add([
      k.text("", { size: NUMBER_SIZE, font: FONT }),
      k.pos(0, NUMBER_Y),
      k.anchor("center"),
      k.color(...INK),
      k.outline(5, k.rgb(...PAPER)),
      k.z(3),
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
      shakeUntil: 0,
    };

    mole.onClick(() => handleMoleTap(entry));
    entries.push(entry);
  }

  function hideEntry(entry) {
    entry.visible = false;
    entry.group.opacity = 0;
    entry.group.pos.x = entry.x;
    entry.group.pos.y = entry.y + HIDDEN_OFFSET;
    entry.group.scale = k.vec2(1, 1);
    entry.mole.angle = 0;
    entry.number.opacity = 0;
  }

  function setEntryVisible(entry) {
    entry.visible = true;
    entry.group.opacity = 1;
    entry.number.opacity = 1;
  }

  function stopMoleMotion() {
    safeCancel(moleUpdateHandle);
    moleUpdateHandle = null;
    entries.forEach(hideEntry);
    active = null;
    phase = "hidden";
  }

  function animateOut(entry, now) {
    const t = Math.min(1, (now - phaseStarted) / POP_SECONDS);
    const p = easeOutCubic(t);
    setEntryVisible(entry);
    entry.group.pos.y = entry.y + HIDDEN_OFFSET + (REST_OFFSET - HIDDEN_OFFSET) * p;
    entry.group.scale = k.vec2(0.96 + 0.04 * p, 0.96 + 0.04 * p);
    if (t >= 1) {
      phase = "hold";
      phaseStarted = now;
      entry.group.pos.y = entry.y + REST_OFFSET;
    }
  }

  function animateHold(entry, now) {
    setEntryVisible(entry);
    const t = now - phaseStarted;
    entry.group.pos.y = entry.y + REST_OFFSET + Math.sin(t * 2.4) * 2.5;
    entry.group.scale = k.vec2(1, 1);

    if (t >= MOLE_VISIBLE_SECONDS) {
      phase = "retreat";
      phaseStarted = now;
    }
  }

  function animateRetreat(entry, now) {
    const t = Math.min(1, (now - phaseStarted) / RETREAT_SECONDS);
    const p = easeInCubic(t);
    entry.group.pos.y = entry.y + REST_OFFSET + (HIDDEN_OFFSET - REST_OFFSET) * p;
    entry.group.opacity = t > 0.78 ? 1 - ((t - 0.78) / 0.22) : 1;
    entry.number.opacity = entry.group.opacity;
    if (t >= 1) {
      hideEntry(entry);
      active = null;
      phase = "gap";
      phaseStarted = now;
      gapHandle = k.wait(NEXT_MOLE_GAP_SECONDS, () => {
        gapHandle = null;
        if (!running || locked) return;
        showNextMole();
      });
    }
  }

  function updateActiveMole() {
    if (!running || locked || !active) return;
    const now = k.time();
    if (phase === "out") animateOut(active, now);
    else if (phase === "hold") animateHold(active, now);
    else if (phase === "retreat") animateRetreat(active, now);
  }

  function showNextMole() {
    if (!running || locked) return;

    if (!question) return;
    entries.forEach((entry) => {
      if (entry !== active) hideEntry(entry);
    });

    active = entries[currentIndex % entries.length];
    currentIndex = (currentIndex + 1) % entries.length;
    active.visible = true;
    active.group.opacity = 1;
    active.group.pos.x = active.x;
    active.group.pos.y = active.y + HIDDEN_OFFSET;
    active.group.scale = k.vec2(0.96, 0.96);
    active.number.opacity = 1;
    active.mole.angle = 0;
    phase = "out";
    phaseStarted = k.time();
  }

  function assignRound(q) {
    const values = buildValues(q.answer);
    values.forEach((value, index) => {
      const entry = entries[index];
      entry.value = value;
      entry.number.text = String(value);
      entry.number.color = k.rgb(...DIGIT_COLORS[index % DIGIT_COLORS.length]);
      hideEntry(entry);
    });
  }

  // ---------- hammer / dizzy ----------
  function clearHammerAndDizzy() {
    safeCancel(hammerHandle);
    safeCancel(dizzyHandle);
    hammerHandle = null;
    dizzyHandle = null;
  }

  function playHammer(entry) {
    const hammer = k.add([
      k.sprite("whack-hammer"),
      k.pos(entry.x + 100, entry.y - 135),
      k.anchor("center"),
      k.scale(0.16),
      k.z(70),
    ]);

    const startX = hammer.pos.x;
    const startY = hammer.pos.y;
    const hitX = entry.x + 18;
    const hitY = entry.y - 38;
    const started = k.time();

    hammerHandle = hammer.onUpdate(() => {
      const t = Math.min(1, (k.time() - started) / 0.45);
      if (t < 0.56) {
        const p = easeInCubic(t / 0.56);
        hammer.pos.x = startX + (hitX - startX) * p;
        hammer.pos.y = startY + (hitY - startY) * p;
        hammer.angle = -42 + 88 * p;
      } else {
        const p = (t - 0.56) / 0.44;
        hammer.pos.x = hitX + (startX - hitX) * p;
        hammer.pos.y = hitY + (startY - hitY) * p;
        hammer.angle = 46 - 82 * p;
      }
      if (t >= 1) {
        safeCancel(hammerHandle);
        hammerHandle = null;
        hammer.destroy();
      }
    });
  }

  function playDizzy(entry) {
    const stars = [
      k.add([k.text("★", { size: 34, font: FONT }), k.pos(entry.x - 42, entry.y - 90), k.anchor("center"), k.color(...YELLOW), k.z(71)]),
      k.add([k.text("★", { size: 40, font: FONT }), k.pos(entry.x, entry.y - 116), k.anchor("center"), k.color(...YELLOW), k.z(71)]),
      k.add([k.text("★", { size: 34, font: FONT }), k.pos(entry.x + 42, entry.y - 90), k.anchor("center"), k.color(...YELLOW), k.z(71)]),
    ];

    const started = k.time();
    dizzyHandle = k.onUpdate(() => {
      const t = Math.min(1, (k.time() - started) / 0.85);
      entry.mole.angle = Math.sin(t * Math.PI * 8) * 11 * (1 - t);
      entry.group.scale = k.vec2(1 + 0.08 * Math.sin(t * Math.PI), 1 - 0.05 * Math.sin(t * Math.PI));
      stars.forEach((star, i) => {
        const base = i * (Math.PI * 2 / 3);
        const a = base + t * Math.PI * 2.4;
        star.pos.x = entry.x + Math.cos(a) * 52;
        star.pos.y = entry.y - 96 + Math.sin(a) * 20;
        star.opacity = 1 - t;
      });
      if (t >= 1) {
        safeCancel(dizzyHandle);
        dizzyHandle = null;
        stars.forEach((star) => star.destroy());
        entry.mole.angle = 0;
        entry.group.scale = k.vec2(1, 1);
      }
    });
  }

  function shakeWrong(entry) {
    const baseX = entry.group.pos.x;
    const started = k.time();
    const handle = entry.group.onUpdate(() => {
      const t = Math.min(1, (k.time() - started) / 0.32);
      entry.group.pos.x = baseX + Math.sin(t * Math.PI * 11) * 10 * (1 - t);
      if (t >= 1) {
        safeCancel(handle);
        entry.group.pos.x = baseX;
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

    const ids = [
      "whack-tap",
      ...cheer.chain,
      `n-${q.a}`,
      "q-plus",
      `n-${q.b}`,
      "q-equals",
      `n-${q.answer}`,
    ];

    audio.stopAllAudio();
    audio.playSequence(ids, 140, 0, () => {
      if (!running || token !== audioToken) return;
      nextRound();
    });
  }

  // ---------- gameplay ----------
  function nextRound() {
    if (!running) return;
    locked = true;
    stopMoleMotion();
    question = buildQuestion();
    eqA.text = String(question.a);
    eqB.text = String(question.b);
    eqAnswer.text = "?";
    assignRound(question);
    currentIndex = 0;
    locked = false;
    showNextMole();
    playQuestionAudio(question);
  }

  function handleMoleTap(entry) {
    if (!running || locked || !entry.visible || entry !== active || !question) return;

    if (entry.value !== question.answer) {
      hadWrongs = true;
      streak = 0;
      audio.stopAllAudio();
      audio.playSequence(["whack-tap", pickWrongCue({ isNearMiss: false })], 120);
      shakeWrong(entry);
      return;
    }

    locked = true;
    stopMoleMotion();
    score += 1;
    streak += 1;
    scoreText.text = String(score);
    eqAnswer.text = String(question.answer);

    playHammer(entry);
    playDizzy(entry);

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
    safeCancel(gapHandle);
    safeCancel(moleUpdateHandle);
    clearHammerAndDizzy();
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

    const again = card.add([k.rect(200, 68, { radius: 18 }), k.pos(-112, 110), k.anchor("center"), k.color(...SUCCESS), k.area()]);
    again.add([k.text("PLAY AGAIN", { size: 22, font: FONT }), k.anchor("center"), k.color(...PAPER)]);
    again.onClick(() => { card.destroy(); startGame(); });

    const backAgain = card.add([k.rect(200, 68, { radius: 18 }), k.pos(112, 110), k.anchor("center"), k.color(242, 229, 200), k.area()]);
    backAgain.add([k.text("BACK", { size: 22, font: FONT }), k.anchor("center"), k.color(...INK)]);
    backAgain.onClick(() => k.go("gamesPicker"));
  }

  function hideAll() {
    entries.forEach(hideEntry);
    active = null;
  }

  function startGame() {
    running = true;
    locked = false;
    timeLeft = ROUND_SECONDS;
    score = 0;
    streak = 0;
    hadWrongs = false;
    audioToken += 1;
    scoreText.text = "0";
    timeText.text = String(ROUND_SECONDS);
    nextRound();
    safeCancel(timerHandle);
    timerHandle = k.loop(1, tick);
    if (!moleUpdateHandle) moleUpdateHandle = k.onUpdate(updateActiveMole);
  }

  startGame();

  k.onSceneLeave?.(() => {
    running = false;
    locked = true;
    audioToken += 1;
    audio.stopAllAudio();
    safeCancel(timerHandle);
    safeCancel(gapHandle);
    safeCancel(moleUpdateHandle);
    clearHammerAndDizzy();
  });
}

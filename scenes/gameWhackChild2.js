// scenes/gameWhackChild2.js
// Child-friendly Whack-a-Mole: one mole at a time, six seconds per mole.

import {
  INK, PAPER, CARD, ORANGE, ORANGE_DEEP, SUCCESS, DANGER,
  YELLOW, BLUE, GREEN, PINK, PURPLE, MUTED, DISABLED_BG, FONT,
} from "../components/theme.js?v=20260816";
import { celebrate } from "../components/celebration.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";
import { buildQuestion, pickType } from "../data/whackRounds.js?v=20260816";

const GAME_ID = 5;
const ROUND_SECONDS = 90;
const MOLE_VISIBLE_SECONDS = 6;
const NEXT_MOLE_GAP_SECONDS = 0.45;
const POP_SECONDS = 0.42;
const RETREAT_SECONDS = 0.30;
const SLOTS = [
  [300, 500], [683, 500], [1066, 500],
  [300, 770], [683, 770], [1066, 770],
];
const MOLE_ART = [
  "whack-mole-blue-child",
  "whack-mole-orange-child",
  "whack-mole-green-child",
];
const MOLE_SCALE = 0.40;
const HOLE_SCALE = 0.35;
const HIDDEN_OFFSET = 132;
const REST_OFFSET = -86;
const NUMBER_Y = 44;
const NUMBER_SIZE = 56;
const DIGIT_COLORS = [BLUE, GREEN, ORANGE, PURPLE, PINK, ORANGE_DEEP];

function shuffle(values) {
  const next = values.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function safeCancel(handle) {
  if (!handle) return;
  try { handle.cancel(); } catch (_) { /* scene or animation already ended */ }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeIn(t) {
  return t * t * t;
}

function loadSceneArt(k) {
  const specs = [
    [MOLE_ART[0], "assets/art/whack-mole-blue.svg?v=20260816c"],
    [MOLE_ART[1], "assets/art/whack-mole-orange.svg?v=20260816c"],
    [MOLE_ART[2], "assets/art/whack-mole-green.svg?v=20260816c"],
    ["whack-hole-child", "assets/art/whack-hole.svg?v=20260816c"],
    ["whack-hole-front-child", "assets/art/whack-hole-front.svg?v=20260816c"],
  ];
  return Promise.all(specs.map(([name, url]) => (
    Promise.resolve(k.loadSprite(name, url)).catch((error) => {
      console.warn(`[whack] failed to load ${name}:`, error?.message || error);
      return null;
    })
  )));
}

function addWoodPanel(k, x, y, width, height, radius = 28, z = 30) {
  k.add([
    k.rect(width + 10, height + 12, { radius: radius + 2 }),
    k.pos(x + 3, y + 8), k.anchor("center"),
    k.color(88, 48, 27), k.opacity(0.30), k.z(z - 1),
  ]);
  const panel = k.add([
    k.rect(width, height, { radius }), k.pos(x, y), k.anchor("center"),
    k.color(246, 183, 91), k.outline(7, k.rgb(119, 61, 31)), k.z(z),
  ]);
  panel.add([
    k.rect(width - 26, height - 22, { radius: Math.max(12, radius - 8) }),
    k.anchor("center"), k.color(255, 232, 169), k.opacity(0.86),
  ]);
  panel.add([k.circle(6), k.pos(-width / 2 + 28, -height / 2 + 25), k.color(108, 61, 34)]);
  panel.add([k.circle(5), k.pos(width / 2 - 30, height / 2 - 23), k.color(108, 61, 34)]);
  return panel;
}

function addFlower(k, x, y, size = 1) {
  const root = k.add([k.pos(x, y), k.z(4)]);
  [[-11, 0], [11, 0], [0, -11], [0, 11]].forEach(([dx, dy]) => {
    root.add([k.circle(9 * size), k.pos(dx * size, dy * size), k.color(255, 255, 248)]);
  });
  root.add([k.circle(8 * size), k.color(255, 198, 42)]);
}

function drawScene(k) {
  const bg = k.add([
    k.sprite("whack-bg-meadow"), k.pos(k.width() / 2, k.height() / 2),
    k.anchor("center"), k.z(-20),
  ]);
  bg.width = k.width();
  bg.height = k.height();

  // Hedge, wooden fence, and grass bands mirror the depth of the reference.
  for (let x = -35; x <= k.width() + 40; x += 72) {
    const size = 44 + (Math.abs(Math.round(x / 72)) % 3) * 7;
    k.add([k.circle(size), k.pos(x, 320), k.color(61, 149, 67), k.z(-9)]);
    k.add([k.circle(size * 0.70), k.pos(x + 26, 292), k.color(100, 188, 73), k.z(-8)]);
  }
  k.add([k.rect(k.width(), 25, { radius: 9 }), k.pos(0, 340), k.color(218, 147, 65), k.outline(4, k.rgb(139, 82, 39)), k.z(-6)]);
  k.add([k.rect(k.width(), 20, { radius: 9 }), k.pos(0, 398), k.color(230, 163, 78), k.outline(4, k.rgb(139, 82, 39)), k.z(-6)]);
  for (let x = 34; x < k.width(); x += 112) {
    k.add([k.rect(28, 126, { radius: 7 }), k.pos(x, 318), k.color(229, 163, 78), k.outline(4, k.rgb(139, 82, 39)), k.z(-5)]);
  }
  k.add([k.rect(k.width(), 630), k.pos(0, 420), k.color(99, 201, 65), k.z(-3)]);
  k.add([k.ellipse(850, 260), k.pos(683, 655), k.anchor("center"), k.color(231, 177, 94), k.opacity(0.72), k.z(-2)]);
  addFlower(k, 74, 470, 1.0);
  addFlower(k, 1290, 486, 1.0);
  addFlower(k, 92, 890, 0.85);
  addFlower(k, 916, 944, 0.75);
}

function saveStars(save, score) {
  if (!save) return;
  const state = save.load();
  state.starsByGame = state.starsByGame || {};
  const stars = score >= 10 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
  state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
  save.save(state);
}

export default function gameWhackChild2(k) {
  const audio = window.PandaAudio;
  const save = window.PandaSave;
  const roundSeconds = Math.max(1, Number(window.__whackRoundSeconds) || ROUND_SECONDS);
  const entries = [];
  let running = false;
  let locked = true;
  let round = null;
  let roundIndex = 0;
  let previousQuestionKey = null;
  let active = null;
  let activeIndex = 0;
  let phase = "hidden";
  let phaseStart = k.time();
  let gapHandle = null;
  let timerHandle = null;
  let updateHandle = null;
  let hammerHandle = null;
  let dizzyHandle = null;
  let audioToken = 0;
  let timeLeft = roundSeconds;
  let score = 0;
  let streak = 0;
  let hadWrongs = false;
  const starNodes = [];

  drawScene(k);

  const back = k.add([
    k.circle(38), k.pos(57, 57), k.anchor("center"), k.color(255, 238, 196),
    k.outline(5, k.rgb(119, 61, 31)), k.area(), k.z(50),
  ]);
  back.add([k.text("←", { size: 42, font: FONT }), k.pos(0, -2), k.anchor("center"), k.color(...INK)]);
  back.onClick(() => k.go("gamesPicker"));

  addWoodPanel(k, 683, 105, 650, 158, 42, 30);
  const eqA = k.add([k.text("?", { size: 82, font: FONT }), k.pos(505, 104), k.anchor("center"), k.color(...BLUE), k.outline(3, k.rgb(30, 82, 128)), k.z(34)]);
  k.add([k.text("+", { size: 72, font: FONT }), k.pos(592, 106), k.anchor("center"), k.color(98, 47, 25), k.z(34)]);
  const eqB = k.add([k.text("?", { size: 82, font: FONT }), k.pos(684, 104), k.anchor("center"), k.color(...GREEN), k.outline(3, k.rgb(36, 103, 46)), k.z(34)]);
  k.add([k.text("=", { size: 72, font: FONT }), k.pos(776, 106), k.anchor("center"), k.color(98, 47, 25), k.z(34)]);
  const eqAnswer = k.add([k.text("?", { size: 84, font: FONT }), k.pos(868, 104), k.anchor("center"), k.color(...ORANGE), k.outline(3, k.rgb(...DANGER)), k.z(34)]);

  addWoodPanel(k, 185, 105, 236, 102, 28, 30);
  const clock = k.add([k.circle(40), k.pos(125, 104), k.anchor("center"), k.color(...PAPER), k.outline(7, k.rgb(...ORANGE_DEEP)), k.z(34)]);
  clock.add([k.line(k.vec2(0, 0), k.vec2(0, -21), { width: 5, color: k.rgb(...ORANGE_DEEP) })]);
  clock.add([k.line(k.vec2(0, 0), k.vec2(14, 8), { width: 5, color: k.rgb(...ORANGE_DEEP) })]);
  clock.add([k.circle(5), k.color(...ORANGE_DEEP)]);
  const timeText = k.add([
    k.text(String(roundSeconds), { size: 49, font: FONT }), k.pos(211, 106),
    k.anchor("center"), k.color(...PAPER), k.outline(5, k.rgb(91, 47, 25)),
    k.z(35), "whack-time",
  ]);

  k.add([k.rect(250, 38, { radius: 18 }), k.pos(1159, 105), k.anchor("center"), k.color(97, 109, 111), k.outline(6, k.rgb(113, 61, 31)), k.z(31)]);
  const scoreFill = k.add([k.rect(14, 26, { radius: 12 }), k.pos(1041, 105), k.anchor("left"), k.color(255, 214, 48), k.z(32)]);
  for (let i = 0; i < 3; i += 1) {
    starNodes.push(k.add([k.sprite("star"), k.pos(1242 + i * 45, 105), k.anchor("center"), k.scale(0.12), k.color(137, 81, 48), k.opacity(0.72), k.z(34)]));
  }
  const scoreText = k.add([k.text("0", { size: 29, font: FONT }), k.pos(1030, 156), k.anchor("center"), k.color(91, 47, 25), k.z(34), "whack-score"]);

  const hint = addWoodPanel(k, 176, 946, 300, 112, 20, 42);
  hint.angle = -4;
  hint.add([k.text("算一算，找答案！", { size: 30, font: FONT, width: 260, align: "center" }), k.anchor("center"), k.color(91, 47, 25)]);
  const idleHammer = k.add([k.sprite("whack-hammer"), k.pos(1264, 916), k.anchor("center"), k.scale(0.24), k.z(46)]);
  idleHammer.angle = -8;

  function updateScoreHud() {
    scoreText.text = String(score * 10);
    scoreFill.width = Math.max(14, Math.min(174, 14 + score * 18));
    const stars = score >= 10 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
    starNodes.forEach((node, index) => {
      node.color = k.rgb(...(index < stars ? YELLOW : [137, 81, 48]));
      node.opacity = index < stars ? 1 : 0.72;
      node.scale = k.vec2(index < stars ? 0.15 : 0.12);
    });
  }

  function setEntryVisible(entry, visible) {
    entry.group.opacity = visible ? 1 : 0;
    entry.mole.opacity = visible ? 1 : 0;
    entry.number.opacity = visible ? 1 : 0;
  }

  function createTargets() {
    SLOTS.forEach(([x, y], index) => {
      const row = index < 3 ? 0 : 1;
      const baseZ = 8 + row * 12;
      const hole = k.add([k.sprite("whack-hole-child"), k.pos(x, y + 8), k.anchor("center"), k.scale(HOLE_SCALE), k.z(baseZ)]);
      const group = k.add([k.pos(x, y + HIDDEN_OFFSET), k.opacity(0), k.z(baseZ + 2)]);
      const mole = group.add([
        k.sprite(MOLE_ART[index % MOLE_ART.length]), k.anchor("center"),
        k.scale(MOLE_SCALE * (index % 2 === 0 ? 1 : 0.96)), k.opacity(0),
        k.area({ scale: 0.88 }), "whack-mole",
      ]);
      mole.angle = [-3, 0, 3, 2, -2, 1][index];
      const number = group.add([
        k.text("", { size: NUMBER_SIZE, font: FONT }), k.pos(0, NUMBER_Y),
        k.anchor("center"), k.color(...INK), k.outline(5, k.rgb(...PAPER)),
        k.opacity(0), k.z(3),
      ]);
      const front = k.add([k.sprite("whack-hole-front-child"), k.pos(x, y + 8), k.anchor("center"), k.scale(HOLE_SCALE), k.z(baseZ + 4)]);
      const entry = { index, x, y, hole, front, group, mole, number, value: null, visible: false };
      mole.onClick(() => tap(entry));
      entries.push(entry);
    });
  }

  function hide(entry) {
    entry.visible = false;
    entry.group.pos.x = entry.x;
    entry.group.pos.y = entry.y + HIDDEN_OFFSET;
    entry.group.scale = k.vec2(1, 1);
    entry.group.angle = 0;
    setEntryVisible(entry, false);
  }

  function hideAll() {
    entries.forEach(hide);
    active = null;
  }

  function showNext() {
    if (!running || locked || entries.length === 0) return;
    entries.forEach((entry) => {
      if (entry !== active) hide(entry);
    });
    active = entries[activeIndex];
    activeIndex = (activeIndex + 1) % entries.length;
    active.visible = true;
    active.group.pos.y = active.y + HIDDEN_OFFSET;
    active.group.scale = k.vec2(0.96, 0.96);
    setEntryVisible(active, true);
    phase = "out";
    phaseStart = k.time();
  }

  function animateMole() {
    if (!running || locked || !active) return;
    const now = k.time();
    const elapsed = now - phaseStart;
    if (phase === "out") {
      const t = Math.min(1, elapsed / POP_SECONDS);
      const p = easeOutBack(t);
      active.group.pos.y = active.y + HIDDEN_OFFSET + (REST_OFFSET - HIDDEN_OFFSET) * p;
      active.group.scale = k.vec2(0.96 + 0.04 * Math.min(1, t * 2), 0.96 + 0.04 * Math.min(1, t * 2));
      if (t >= 1) {
        phase = "hold";
        phaseStart = now;
      }
      return;
    }
    if (phase === "hold") {
      active.group.pos.y = active.y + REST_OFFSET + Math.sin(elapsed * 2.5) * 3;
      if (elapsed >= MOLE_VISIBLE_SECONDS) {
        phase = "retreat";
        phaseStart = now;
      }
      return;
    }
    if (phase === "retreat") {
      const t = Math.min(1, elapsed / RETREAT_SECONDS);
      const p = easeIn(t);
      active.group.pos.y = active.y + REST_OFFSET + (HIDDEN_OFFSET - REST_OFFSET) * p;
      const opacity = t > 0.68 ? 1 - ((t - 0.68) / 0.32) : 1;
      active.group.opacity = opacity;
      active.mole.opacity = opacity;
      active.number.opacity = opacity;
      if (t >= 1) {
        hide(active);
        active = null;
        phase = "gap";
        gapHandle = k.wait(NEXT_MOLE_GAP_SECONDS, () => {
          gapHandle = null;
          showNext();
        });
      }
    }
  }

  function assignQuestion(question) {
    const values = shuffle(question.candidates);
    values.forEach((value, index) => {
      const entry = entries[index];
      entry.value = value;
      entry.mole.whackValue = value;
      entry.number.text = String(value);
      entry.number.color = k.rgb(...DIGIT_COLORS[index]);
      hide(entry);
    });
  }

  function revealQuestion() {
    if (!running) return;
    locked = false;
    activeIndex = 0;
    showNext();
    if (!timerHandle) timerHandle = k.loop(1, tick);
  }

  function nextRound() {
    if (!running) return;
    locked = true;
    safeCancel(gapHandle);
    gapHandle = null;
    hideAll();
    round = buildQuestion(pickType(roundIndex), previousQuestionKey);
    previousQuestionKey = round.key;
    roundIndex += 1;
    eqA.text = String(round.a);
    eqB.text = String(round.b);
    eqAnswer.text = "?";
    assignQuestion(round);

    const token = ++audioToken;
    audio.stopAllAudio();
    audio.playSequence([
      score === 0 ? "whack-q-pre" : "whack-next",
      `n-${round.a}`, "q-plus", `n-${round.b}`, "q-equals",
    ], 110, 0, () => {
      if (running && token === audioToken) revealQuestion();
    });
  }

  function wrongShake(entry) {
    const baseX = entry.group.pos.x;
    const start = k.time();
    const handle = entry.group.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.30);
      entry.group.pos.x = baseX + Math.sin(t * Math.PI * 11) * 10 * (1 - t);
      if (t < 1) return;
      safeCancel(handle);
      entry.group.pos.x = baseX;
    });
  }

  function hammer(entry) {
    idleHammer.opacity = 0.35;
    const node = k.add([
      k.sprite("whack-hammer"), k.pos(entry.x + 125, entry.y - 165),
      k.anchor("center"), k.scale(0.21), k.z(80),
    ]);
    node.angle = -66;
    const startX = node.pos.x;
    const startY = node.pos.y;
    const hitX = entry.x + 38;
    const hitY = entry.y - 66;
    const start = k.time();
    hammerHandle = node.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.42);
      if (t < 0.58) {
        const p = easeIn(t / 0.58);
        node.pos.x = startX + (hitX - startX) * p;
        node.pos.y = startY + (hitY - startY) * p;
        node.angle = -66 + 52 * p;
      } else {
        const p = (t - 0.58) / 0.42;
        node.pos.x = hitX + 70 * p;
        node.pos.y = hitY - 74 * p;
        node.angle = -14 - 30 * p;
        node.opacity = 1 - p;
      }
      if (t < 1) return;
      safeCancel(hammerHandle);
      hammerHandle = null;
      node.destroy();
      idleHammer.opacity = 1;
    });
  }

  function dizzy(entry) {
    const stars = [-1, 0, 1].map((offset) => k.add([
      k.sprite("star"), k.pos(entry.x + offset * 46, entry.y - 112),
      k.anchor("center"), k.scale(offset === 0 ? 0.15 : 0.12),
      k.color(...YELLOW), k.z(81),
    ]));
    const start = k.time();
    dizzyHandle = k.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.84);
      entry.group.angle = Math.sin(t * Math.PI * 8) * 7 * (1 - t);
      stars.forEach((star, index) => {
        const angle = index * 2.1 + t * 6;
        star.pos.x = entry.x + Math.cos(angle) * 54;
        star.pos.y = entry.y - 112 + Math.sin(angle) * 21;
        star.opacity = 1 - t;
      });
      if (t < 1) return;
      safeCancel(dizzyHandle);
      dizzyHandle = null;
      stars.forEach((star) => star.destroy());
      entry.group.angle = 0;
    });
  }

  function tap(entry) {
    if (!running || locked || entry !== active || !entry.visible || !round) return;
    locked = true;
    const correct = entry.value === round.answer;
    hammer(entry);

    if (!correct) {
      hadWrongs = true;
      streak = 0;
      wrongShake(entry);
      const token = ++audioToken;
      audio.stopAllAudio();
      audio.playSequence(["whack-tap", pickWrongCue({ isNearMiss: false })], 120, 0, () => {
        if (!running || token !== audioToken) return;
        locked = false;
        phase = "hold";
        phaseStart = k.time();
      });
      return;
    }

    score += 1;
    streak += 1;
    updateScoreHud();
    eqAnswer.text = String(round.answer);
    phase = "hit";
    dizzy(entry);
    celebrate(k, {
      tier: streak >= 10 ? "streak10" : streak >= 5 ? "streak5" : streak >= 3 ? "streak3" : "first",
      anchor: { x: entry.x, y: entry.y - 120 },
    });
    const cheer = pickCheerCue({
      streak,
      isRoundComplete: false,
      levelId: GAME_ID,
      hasDiscovery: false,
      hadWrongs,
    });
    const token = ++audioToken;
    audio.stopAllAudio();
    audio.playSequence([
      "whack-tap", "whack-correct", ...cheer.chain,
      `n-${round.a}`, "q-plus", `n-${round.b}`, "q-equals", `n-${round.answer}`,
    ], 140, 0, () => {
      if (running && token === audioToken) nextRound();
    });
    k.wait(0.22, () => {
      if (!running || entry !== active) return;
      hide(entry);
      active = null;
    });
  }

  function showEndCard() {
    const stars = score >= 10 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
    const scrim = k.add([k.rect(k.width(), k.height()), k.color(38, 52, 31), k.opacity(0.50), k.z(90)]);
    const card = k.add([
      k.rect(600, 390, { radius: 36 }), k.pos(683, 515), k.anchor("center"),
      k.color(...CARD), k.outline(8, k.rgb(119, 61, 31)), k.z(92), "whack-end-card",
    ]);
    card.add([k.text("时间到！", { size: 58, font: FONT }), k.pos(0, -125), k.anchor("center"), k.color(...INK)]);
    card.add([k.text("★".repeat(stars) + "☆".repeat(3 - stars), { size: 62, font: FONT }), k.pos(0, -42), k.anchor("center"), k.color(...ORANGE)]);
    card.add([k.text(`答对 ${score} 题`, { size: 36, font: FONT }), k.pos(0, 35), k.anchor("center"), k.color(...MUTED)]);

    const again = card.add([k.rect(220, 76, { radius: 20 }), k.pos(-125, 135), k.anchor("center"), k.color(...SUCCESS), k.area()]);
    again.add([k.text("再玩一次", { size: 29, font: FONT }), k.anchor("center"), k.color(...PAPER)]);
    again.onClick(() => {
      scrim.destroy();
      card.destroy();
      startGame();
    });

    const exit = card.add([k.rect(220, 76, { radius: 20 }), k.pos(125, 135), k.anchor("center"), k.color(...DISABLED_BG), k.area()]);
    exit.add([k.text("返回", { size: 29, font: FONT }), k.anchor("center"), k.color(...INK)]);
    exit.onClick(() => k.go("gamesPicker"));
  }

  function endGame() {
    if (!running) return;
    running = false;
    locked = true;
    audioToken += 1;
    safeCancel(timerHandle);
    safeCancel(gapHandle);
    safeCancel(updateHandle);
    safeCancel(hammerHandle);
    safeCancel(dizzyHandle);
    timerHandle = null;
    gapHandle = null;
    updateHandle = null;
    hideAll();
    saveStars(save, score);
    audio.stopAllAudio();
    audio.playSequence(["whack-timeup", "whack-done"], 140, 0, showEndCard);
  }

  function tick() {
    if (!running) return;
    timeLeft = Math.max(0, timeLeft - 1);
    timeText.text = String(timeLeft);
    timeText.color = k.rgb(...(timeLeft <= 10 ? DANGER : PAPER));
    if (timeLeft <= 0) endGame();
  }

  function startGame() {
    running = true;
    locked = true;
    timeLeft = roundSeconds;
    score = 0;
    streak = 0;
    hadWrongs = false;
    roundIndex = 0;
    previousQuestionKey = null;
    activeIndex = 0;
    audioToken += 1;
    timeText.text = String(roundSeconds);
    timeText.color = k.rgb(...PAPER);
    updateScoreHud();
    safeCancel(timerHandle);
    timerHandle = null;
    safeCancel(updateHandle);
    updateHandle = k.onUpdate(animateMole);
    const token = ++audioToken;
    audio.stopAllAudio();
    audio.playSequence(["whack-intro", "whack-start"], 140, 0, () => {
      if (running && token === audioToken) nextRound();
    });
  }

  const loading = addWoodPanel(k, 683, 540, 420, 120, 26, 60);
  const loadingText = loading.add([k.text("准备中...", { size: 40, font: FONT }), k.anchor("center"), k.color(...INK)]);

  loadSceneArt(k).then(() => {
    const required = ["whack-hole-child", "whack-hole-front-child", ...MOLE_ART];
    if (required.some((name) => !k.getSprite(name))) {
      loadingText.text = "游戏素材加载失败";
      loadingText.color = k.rgb(...DANGER);
      return;
    }
    loading.destroy();
    createTargets();
    startGame();
  });

  k.onSceneLeave?.(() => {
    running = false;
    locked = true;
    audioToken += 1;
    audio.stopAllAudio();
    safeCancel(timerHandle);
    safeCancel(gapHandle);
    safeCancel(updateHandle);
    safeCancel(hammerHandle);
    safeCancel(dizzyHandle);
  });
}

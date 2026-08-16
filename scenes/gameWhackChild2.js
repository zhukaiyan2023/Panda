// scenes/gameWhackChild2.js
// Child-friendly Whack-a-Mole: one mole at a time, six seconds per mole.

import {
  INK, PAPER, ORANGE, ORANGE_DEEP, SUCCESS, DANGER,
  YELLOW, BLUE, GREEN, PINK, PURPLE, FONT,
} from "../components/theme.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";

const GAME_ID = 5;
const ROUND_SECONDS = 90;
const MOLE_VISIBLE_SECONDS = 6;
const NEXT_MOLE_GAP_SECONDS = 0.7;
const POP_SECONDS = 0.55;
const RETREAT_SECONDS = 0.5;
const SLOTS = [
  [300, 490], [683, 490], [1066, 490],
  [300, 700], [683, 700], [1066, 700],
];
const HOLE_SCALE = 0.22;
const MOLE_SCALE = 0.19;
const HIDDEN_OFFSET = 105;
const REST_OFFSET = -76;
const NUMBER_Y = 48;
const NUMBER_SIZE = 58;
const DIGIT_COLORS = [BLUE, GREEN, ORANGE, PURPLE, PINK, ORANGE_DEEP];

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
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
  try { handle.cancel(); } catch (_) {}
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t * t; }
function question() {
  let a; let b; let answer;
  do { a = rnd(2, 9); b = rnd(2, 9); answer = a + b; } while (answer < 10 || answer > 18);
  return { a, b, answer };
}
function valuesFor(answer) {
  const wrong = [];
  for (let n = 10; n <= 18; n += 1) if (n !== answer) wrong.push(n);
  return shuffle([answer, ...shuffle(wrong).slice(0, 5)]);
}
function saveStars(save, score) {
  if (!save) return;
  const state = save.load();
  state.starsByGame = state.starsByGame || {};
  const stars = score >= 12 ? 3 : score >= 7 ? 2 : score >= 3 ? 1 : 0;
  state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
  save.save(state);
}
function fitSprite(k, name, x, y, width, z) {
  const info = k.getSprite(name);
  if (!info) return null;
  const sourceWidth = Number(info.data?.width || width);
  return k.add([k.sprite(name), k.pos(x, y), k.anchor("center"), k.scale(width / sourceWidth), k.z(z)]);
}

export default function gameWhackChild2(k) {
  const audio = window.PandaAudio;
  const save = window.PandaSave;
  const entries = [];
  let running = true;
  let locked = false;
  let round = null;
  let active = null;
  let activeIndex = 0;
  let phase = "out";
  let phaseStart = k.time();
  let gapHandle = null;
  let timerHandle = null;
  let updateHandle = null;
  let hammerHandle = null;
  let dizzyHandle = null;
  let audioToken = 0;
  let timeLeft = ROUND_SECONDS;
  let score = 0;
  let streak = 0;
  let hadWrongs = false;

  fitSprite(k, "whack-bg-meadow", 683, 512, 1366, -20);

  const back = k.add([
    k.rect(104, 68, { radius: 18 }), k.pos(78, 76), k.anchor("center"),
    k.color(...PAPER), k.outline(5, k.rgb(...INK)), k.area(), k.z(40),
  ]);
  back.add([k.text("←", { size: 42, font: FONT }), k.anchor("center"), k.color(...INK)]);
  back.onClick(() => k.go("gamesPicker"));

  fitSprite(k, "whack-plaque", 683, 110, 590, 30);
  const eqA = k.add([k.text("?", { size: 74, font: FONT }), k.pos(520, 110), k.anchor("center"), k.color(...BLUE), k.z(32)]);
  k.add([k.text("+", { size: 68, font: FONT }), k.pos(600, 110), k.anchor("center"), k.color(...INK), k.z(32)]);
  const eqB = k.add([k.text("?", { size: 74, font: FONT }), k.pos(683, 110), k.anchor("center"), k.color(...GREEN), k.z(32)]);
  k.add([k.text("=", { size: 68, font: FONT }), k.pos(766, 110), k.anchor("center"), k.color(...INK), k.z(32)]);
  const eqAnswer = k.add([k.text("?", { size: 74, font: FONT }), k.pos(850, 110), k.anchor("center"), k.color(...DANGER), k.z(32)]);

  fitSprite(k, "whack-stopwatch", 1206, 72, 170, 30);
  const timeText = k.add([k.text(String(ROUND_SECONDS), { size: 36, font: FONT }), k.pos(1206, 84), k.anchor("center"), k.color(...ORANGE_DEEP), k.z(32)]);
  fitSprite(k, "whack-starbar", 1195, 160, 220, 30);
  const scoreText = k.add([k.text("0", { size: 32, font: FONT }), k.pos(1128, 159), k.anchor("center"), k.color(...INK), k.z(32)]);
  fitSprite(k, "whack-hint-sign", 1165, 292, 292, 30);
  k.add([k.text("WHACK THE RIGHT NUMBER!", { size: 22, font: FONT }), k.pos(1165, 292), k.anchor("center"), k.color(...INK), k.z(32)]);

  SLOTS.forEach(([x, y], index) => {
    const hole = k.add([k.sprite("whack-hole-clean"), k.pos(x, y), k.anchor("center"), k.scale(HOLE_SCALE), k.z(4)]);
    const group = k.add([k.pos(x, y + HIDDEN_OFFSET), k.opacity(0), k.z(8)]);
    const mole = group.add([k.sprite("whack-mole-popup"), k.pos(0, 0), k.anchor("center"), k.scale(MOLE_SCALE), k.area({ scale: 0.9 })]);
    const number = group.add([
      k.text("", { size: NUMBER_SIZE, font: FONT }), k.pos(0, NUMBER_Y), k.anchor("center"),
      k.color(...INK), k.outline(5, k.rgb(...PAPER)), k.z(3),
    ]);
    const entry = { index, x, y, hole, group, mole, number, value: null, visible: false };
    mole.onClick(() => tap(entry));
    entries.push(entry);
  });

  function hide(entry) {
    entry.visible = false;
    entry.group.opacity = 0;
    entry.group.pos.x = entry.x;
    entry.group.pos.y = entry.y + HIDDEN_OFFSET;
    entry.group.scale = k.vec2(1, 1);
    entry.mole.angle = 0;
    entry.number.opacity = 0;
  }
  function hideAll() { entries.forEach(hide); active = null; }
  function showNext() {
    if (!running || locked) return;
    entries.forEach((e) => { if (e !== active) hide(e); });
    active = entries[activeIndex];
    activeIndex = (activeIndex + 1) % entries.length;
    active.visible = true;
    active.group.opacity = 1;
    active.number.opacity = 1;
    active.group.pos.y = active.y + HIDDEN_OFFSET;
    active.group.scale = k.vec2(0.96, 0.96);
    phase = "out";
    phaseStart = k.time();
  }
  function animateMole() {
    if (!running || locked || !active) return;
    const now = k.time();
    const elapsed = now - phaseStart;
    if (phase === "out") {
      const t = Math.min(1, elapsed / POP_SECONDS);
      const p = easeOut(t);
      active.group.pos.y = active.y + HIDDEN_OFFSET + (REST_OFFSET - HIDDEN_OFFSET) * p;
      active.group.scale = k.vec2(0.96 + 0.04 * p, 0.96 + 0.04 * p);
      if (t >= 1) { phase = "hold"; phaseStart = now; }
      return;
    }
    if (phase === "hold") {
      active.group.pos.y = active.y + REST_OFFSET + Math.sin(elapsed * 2.4) * 2;
      active.group.scale = k.vec2(1, 1);
      if (elapsed >= MOLE_VISIBLE_SECONDS) { phase = "retreat"; phaseStart = now; }
      return;
    }
    if (phase === "retreat") {
      const t = Math.min(1, elapsed / RETREAT_SECONDS);
      const p = easeIn(t);
      active.group.pos.y = active.y + REST_OFFSET + (HIDDEN_OFFSET - REST_OFFSET) * p;
      active.group.opacity = t > 0.78 ? 1 - ((t - 0.78) / 0.22) : 1;
      active.number.opacity = active.group.opacity;
      if (t >= 1) {
        hide(active);
        phase = "gap";
        active = null;
        gapHandle = k.wait(NEXT_MOLE_GAP_SECONDS, () => { gapHandle = null; showNext(); });
      }
    }
  }

  function assignQuestion(q) {
    const vals = valuesFor(q.answer);
    vals.forEach((value, i) => {
      entries[i].value = value;
      entries[i].number.text = String(value);
      entries[i].number.color = k.rgb(...DIGIT_COLORS[i]);
      hide(entries[i]);
    });
  }
  function playQuestion(q) {
    audio.stopAllAudio();
    audio.playSequence([
      score === 0 ? "whack-q-pre" : "whack-next", `n-${q.a}`, "q-plus", `n-${q.b}`, "q-equals", "whack-pop",
    ], 110);
  }
  function nextRound() {
    if (!running) return;
    locked = true;
    if (gapHandle) { safeCancel(gapHandle); gapHandle = null; }
    hideAll();
    round = question();
    eqA.text = String(round.a);
    eqB.text = String(round.b);
    eqAnswer.text = "?";
    assignQuestion(round);
    activeIndex = 0;
    locked = false;
    showNext();
    playQuestion(round);
  }
  function wrongShake(entry) {
    const baseX = entry.group.pos.x;
    const start = k.time();
    const h = entry.group.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.3);
      entry.group.pos.x = baseX + Math.sin(t * Math.PI * 11) * 10 * (1 - t);
      if (t >= 1) { safeCancel(h); entry.group.pos.x = baseX; }
    });
  }
  function hammer(entry) {
    const node = k.add([k.sprite("whack-hammer"), k.pos(entry.x + 95, entry.y - 140), k.anchor("center"), k.scale(0.16), k.z(70)]);
    const sx = node.pos.x; const sy = node.pos.y; const hx = entry.x + 18; const hy = entry.y - 40; const start = k.time();
    hammerHandle = node.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.45);
      const p = t < 0.56 ? easeIn(t / 0.56) : (t - 0.56) / 0.44;
      if (t < 0.56) { node.pos.x = sx + (hx - sx) * p; node.pos.y = sy + (hy - sy) * p; node.angle = -42 + 88 * p; }
      else { node.pos.x = hx + (sx - hx) * p; node.pos.y = hy + (sy - hy) * p; node.angle = 46 - 82 * p; }
      if (t >= 1) { safeCancel(hammerHandle); hammerHandle = null; node.destroy(); }
    });
  }
  function dizzy(entry) {
    const stars = [-1, 0, 1].map((i) => k.add([k.text("★", { size: 34 + (i === 0 ? 6 : 0), font: FONT }), k.pos(entry.x + i * 44, entry.y - 96), k.anchor("center"), k.color(...YELLOW), k.z(71)]));
    const start = k.time();
    dizzyHandle = k.onUpdate(() => {
      const t = Math.min(1, (k.time() - start) / 0.85);
      entry.mole.angle = Math.sin(t * Math.PI * 8) * 10 * (1 - t);
      stars.forEach((s, i) => { const a = i * 2.1 + t * 6; s.pos.x = entry.x + Math.cos(a) * 52; s.pos.y = entry.y - 98 + Math.sin(a) * 20; s.opacity = 1 - t; });
      if (t >= 1) { safeCancel(dizzyHandle); dizzyHandle = null; stars.forEach((s) => s.destroy()); entry.mole.angle = 0; }
    });
  }
  function correctAudio(q, token) {
    const cheer = pickCheerCue({ streak, isRoundComplete: false, levelId: GAME_ID, hasDiscovery: false, hadWrongs });
    audio.stopAllAudio();
    audio.playSequence([
      "whack-tap", ...cheer.chain, `n-${q.a}`, "q-plus", `n-${q.b}`, "q-equals", `n-${q.answer}`,
    ], 140, 0, () => { if (running && token === audioToken) nextRound(); });
  }
  function tap(entry) {
    if (!running || locked || entry !== active || !entry.visible || !round) return;
    if (entry.value !== round.answer) {
      hadWrongs = true;
      streak = 0;
      audio.stopAllAudio();
      audio.playSequence(["whack-tap", pickWrongCue({ isNearMiss: false })], 120);
      wrongShake(entry);
      return;
    }
    locked = true;
    score += 1;
    streak += 1;
    scoreText.text = String(score);
    eqAnswer.text = String(round.answer);
    phase = "hit";
    hammer(entry);
    dizzy(entry);
    audioToken += 1;
    correctAudio(round, audioToken);
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
    safeCancel(timerHandle); safeCancel(gapHandle); safeCancel(updateHandle); safeCancel(hammerHandle); safeCancel(dizzyHandle);
    hideAll();
    saveStars(save, score);
    audio.playSequence(["whack-timeup", "whack-done"], 140);
    const card = k.add([k.rect(560, 350, { radius: 30 }), k.pos(683, 512), k.anchor("center"), k.color(255, 247, 224), k.outline(6, k.rgb(...ORANGE_DEEP)), k.z(100)]);
    card.add([k.text("Great job!", { size: 50, font: FONT }), k.pos(0, -90), k.anchor("center"), k.color(...INK)]);
    card.add([k.text(String(score), { size: 74, font: FONT }), k.pos(0, 0), k.anchor("center"), k.color(...ORANGE_DEEP)]);
    const again = card.add([k.rect(200, 68, { radius: 18 }), k.pos(-112, 110), k.anchor("center"), k.color(...SUCCESS), k.area()]);
    again.add([k.text("PLAY AGAIN", { size: 22, font: FONT }), k.anchor("center"), k.color(...PAPER)]);
    again.onClick(() => { card.destroy(); startGame(); });
    const backAgain = card.add([k.rect(200, 68, { radius: 18 }), k.pos(112, 110), k.anchor("center"), k.color(242, 229, 200), k.area()]);
    backAgain.add([k.text("BACK", { size: 22, font: FONT }), k.anchor("center"), k.color(...INK)]);
    backAgain.onClick(() => k.go("gamesPicker"));
  }
  function startGame() {
    running = true; locked = false; timeLeft = ROUND_SECONDS; score = 0; streak = 0; hadWrongs = false; audioToken += 1;
    scoreText.text = "0"; timeText.text = String(ROUND_SECONDS); nextRound();
    safeCancel(timerHandle); timerHandle = k.loop(1, tick);
    safeCancel(updateHandle); updateHandle = k.onUpdate(animateMole);
  }
  startGame();
  k.onSceneLeave?.(() => { running = false; locked = true; audioToken += 1; audio.stopAllAudio(); safeCancel(timerHandle); safeCancel(gapHandle); safeCancel(updateHandle); safeCancel(hammerHandle); safeCancel(dizzyHandle); });
}

// scenes/gameWhack.js — rebuilt whack-a-mole game.
// The board is intentionally self-contained: one question owns one set of six
// moles, audio is strictly serialized, and each mole is a single visual unit
// (mole + number) that emerges from and retreats into its hole.

import {
  INK, PAPER, CARD, ORANGE, ORANGE_DEEP, SUCCESS, DANGER,
  YELLOW, BLUE, GREEN, PINK, PURPLE, MUTED, DISABLED_BG, FONT,
} from "../components/theme.js?v=20260816";
import sceneBg from "../components/sceneBg.js?v=20260816";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260816";

const GAME_ID = 5;
const ROUND_SECONDS = 90;
const MOLE_COUNT = 6;
const BOARD_POS = [
  [285, 430], [683, 430], [1081, 430],
  [285, 660], [683, 660], [1081, 660],
];
const MOLE_ART = [
  "whack-mole-blue-runtime",
  "whack-mole-orange-runtime",
  "whack-mole-green-runtime",
];
const MOLE_SCALE = 0.27;
const MOLE_HIDDEN_Y = 92;
const MOLE_REST_Y = -62;
const POP_SECONDS = 0.46;
const HOLD_SECONDS = 1.35;
const RETREAT_SECONDS = 0.44;
const BETWEEN_CYCLES = 0.72;
const NUMBER_Y = 54;
const NUMBER_SIZE = 60;
const HAMMER_Z = 40;

const DIGIT_COLORS = [BLUE, GREEN, ORANGE, PURPLE, PINK, ORANGE_DEEP, SUCCESS, DANGER, PURPLE, GREEN];

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

function question() {
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

function decoys(answer) {
  const pool = [];
  for (let n = 10; n <= 18; n += 1) {
    if (n !== answer) pool.push(n);
  }
  return shuffle(pool).slice(0, MOLE_COUNT - 1);
}

function safeCancel(handle) {
  if (!handle) return;
  try { handle.cancel(); } catch (_) { /* scene already gone */ }
}

function loadWhackArt(k) {
  const specs = [
    [MOLE_ART[0], "assets/art/whack-mole-blue.svg?v=20260816"],
    [MOLE_ART[1], "assets/art/whack-mole-orange.svg?v=20260816"],
    [MOLE_ART[2], "assets/art/whack-mole-green.svg?v=20260816"],
    ["whack-hole-runtime", "assets/art/whack-hole.svg?v=20260816"],
    ["whack-hole-front-runtime", "assets/art/whack-hole-front.svg?v=20260816"],
  ];
  return Promise.all(
    specs.map(([name, url]) => Promise.resolve(k.loadSprite(name, url)).catch((err) => {
      console.warn(`[whack] failed to load ${name}:`, err?.message || err);
      return null;
    })),
  );
}

function addPanel(k, x, y, width, height, fill, outline = INK) {
  return k.add([
    k.rect(width, height, { radius: 28 }),
    k.pos(x, y),
    k.anchor("center"),
    k.color(...fill),
    k.outline(5, k.rgb(...outline)),
  ]);
}

function animate(k, duration, update, done) {
  const start = k.time();
  let handle = null;
  handle = k.onUpdate(() => {
    const t = Math.min(1, (k.time() - start) / duration);
    update(t);
    if (t >= 1) {
      safeCancel(handle);
      handle = null;
      done?.();
    }
  });
  return handle;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t) {
  return t * t * t;
}

export default function gameWhack(k) {
  const audio = window.PandaAudio;
  const save = window.PandaSave;

  sceneBg(k, "bg-meadow");

  let running = false;
  let inputLocked = false;
  let timeLeft = ROUND_SECONDS;
  let score = 0;
  let streak = 0;
  let hadWrong = false;
  let current = null;
  let roundGeneration = 0;
  let timerHandle = null;
  let audioGeneration = 0;
  const moles = [];

  // --- HUD ---
  addPanel(k, 80, 72, 120, 66, PAPER);
  const back = k.add([
    k.text("←", { size: 42, font: FONT }),
    k.pos(80, 72),
    k.anchor("center"),
    k.color(...INK),
    k.area(),
    k.z(30),
  ]);
  back.onClick(() => k.go("gamesPicker"));

  addPanel(k, 683, 100, 600, 142, [248, 231, 190]);
  const eqA = k.add([k.text("?", { size: 72, font: FONT }), k.pos(505, 100), k.anchor("center"), k.color(...BLUE), k.z(10)]);
  k.add([k.text("+", { size: 68, font: FONT }), k.pos(590, 100), k.anchor("center"), k.color(...INK), k.z(10)]);
  const eqB = k.add([k.text("?", { size: 72, font: FONT }), k.pos(685, 100), k.anchor("center"), k.color(...GREEN), k.z(10)]);
  k.add([k.text("=", { size: 68, font: FONT }), k.pos(770, 100), k.anchor("center"), k.color(...INK), k.z(10)]);
  k.add([k.text("?", { size: 72, font: FONT }), k.pos(860, 100), k.anchor("center"), k.color(...DANGER), k.z(10)]);

  addPanel(k, 1215, 72, 200, 78, [248, 221, 146], ORANGE_DEEP);
  k.add([k.text("SCORE", { size: 22, font: FONT }), k.pos(1155, 58), k.anchor("center"), k.color(...INK)]);
  const scoreText = k.add([k.text("0", { size: 36, font: FONT }), k.pos(1250, 78), k.anchor("center"), k.color(...INK)]);

  addPanel(k, 1215, 166, 200, 70, PAPER);
  k.add([k.text("TIME", { size: 20, font: FONT }), k.pos(1155, 152), k.anchor("center"), k.color(...MUTED)]);
  const timeText = k.add([k.text(String(ROUND_SECONDS), { size: 36, font: FONT }), k.pos(1250, 168), k.anchor("center"), k.color(...INK)]);

  const hint = addPanel(k, 1120, 300, 330, 88, [255, 244, 205], ORANGE_DEEP);
  hint.add([k.text("WHACK THE RIGHT NUMBER!", { size: 27, font: FONT }), k.pos(0, 0), k.anchor("center"), k.color(...INK)]);

  // --- mole builder ---
  function createMole(index) {
    const [x, y] = BOARD_POS[index];
    const holeBack = k.add([
      k.sprite("whack-hole-runtime"),
      k.pos(x, y + 8),
      k.anchor("center"),
      k.scale(0.23),
      k.z(2),
    ]);
    const group = k.add([
      k.pos(x, y + MOLE_HIDDEN_Y),
      k.z(5),
    ]);
    const moleNode = group.add([
      k.sprite(MOLE_ART[index % MOLE_ART.length]),
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
      k.outline(4, k.rgb(...PAPER)),
      k.z(2),
    ]);
    const holeFront = k.add([
      k.sprite("whack-hole-front-runtime"),
      k.pos(x, y + 8),
      k.anchor("center"),
      k.scale(0.23),
      k.z(7),
    ]);

    const entry = {
      index, x, y, group, moleNode, number, holeBack, holeFront,
      value: null, up: false, motion: null, wait: null, cycleToken: 0,
    };
    moleNode.onClick(() => onMoleTap(entry));
    return entry;
  }

  function cancelEntry(entry) {
    entry.cycleToken += 1;
    safeCancel(entry.motion);
    safeCancel(entry.wait);
    entry.motion = null;
    entry.wait = null;
  }

  function setMolePosition(entry, y) {
    entry.group.pos.y = y;
    entry.number.opacity = entry.group.opacity;
  }

  function pop(entry, token) {
    if (token !== entry.cycleToken || !running) return;
    entry.up = true;
    entry.group.opacity = 1;
    const startY = entry.y + MOLE_HIDDEN_Y;
    const endY = entry.y + MOLE_REST_Y;
    entry.group.pos.y = startY;
    entry.motion = animate(k, POP_SECONDS, (t) => {
      setMolePosition(entry, startY + (endY - startY) * easeOutCubic(t));
    }, () => {
      entry.group.pos.y = endY;
      scheduleHide(entry, token);
    });
  }

  function scheduleHide(entry, token) {
    entry.wait = k.wait(HOLD_SECONDS, () => retreat(entry, token));
  }

  function retreat(entry, token, immediate = false) {
    if (token !== entry.cycleToken) return;
    safeCancel(entry.wait);
    entry.wait = null;
    const startY = entry.group.pos.y;
    const endY = entry.y + MOLE_HIDDEN_Y;
    entry.up = false;
    entry.motion = animate(k, immediate ? 0.24 : RETREAT_SECONDS, (t) => {
      const eased = easeInCubic(t);
      const nextY = startY + (endY - startY) * eased;
      setMolePosition(entry, nextY);
      entry.group.opacity = t > 0.72 ? 1 - ((t - 0.72) / 0.28) : 1;
    }, () => {
      entry.group.pos.y = endY;
      entry.group.opacity = 0;
      entry.number.opacity = 0;
      entry.motion = null;
      if (token === entry.cycleToken && running && !inputLocked) {
        entry.wait = k.wait(BETWEEN_CYCLES, () => {
          if (token !== entry.cycleToken || !running || inputLocked) return;
          pop(entry, token);
        });
      }
    });
  }

  function startCycle(entry, delay) {
    cancelEntry(entry);
    const token = entry.cycleToken;
    entry.wait = k.wait(delay, () => pop(entry, token));
  }

  function sinkAll() {
    for (const entry of moles) {
      cancelEntry(entry);
      if (entry.up) retreat(entry, entry.cycleToken, true);
      else {
        entry.group.opacity = 0;
        entry.number.opacity = 0;
      }
    }
  }

  function resetMoleValues() {
    const values = shuffle([current.answer, ...decoys(current.answer)]);
    const nextGeneration = roundGeneration;
    moles.forEach((entry, index) => {
      cancelEntry(entry);
      entry.value = values[index];
      entry.number.text = String(values[index]);
      entry.number.color = k.rgb(...DIGIT_COLORS[(values[index] - 10) % DIGIT_COLORS.length]);
      entry.group.pos.y = entry.y + MOLE_HIDDEN_Y;
      entry.group.opacity = 0;
      entry.number.opacity = 0;
      entry.up = false;
      if (nextGeneration === roundGeneration) startCycle(entry, index * 0.26);
    });
  }

  // --- hammer + dizzy effect ---
  function bonkEffect(entry, strong) {
    const root = k.add([k.pos(entry.x + 78, entry.y - 145), k.z(HAMMER_Z)]);
    root.add([
      k.rect(18, 112, { radius: 8 }),
      k.pos(-20, 46),
      k.anchor("center"),
      k.color(234, 169, 72),
      k.outline(4, k.rgb(...ORANGE_DEEP)),
    ]);
    root.add([
      k.rect(94, 40, { radius: 12 }),
      k.pos(18, 0),
      k.anchor("center"),
      k.color(224, 63, 56),
      k.outline(5, k.rgb(...INK)),
    ]);
    root.angle = -55;
    const hammerStart = k.time();
    const hammerMotion = root.onUpdate(() => {
      const t = Math.min(1, (k.time() - hammerStart) / 0.42);
      if (t < 0.58) {
        const p = easeInCubic(t / 0.58);
        root.angle = -55 + 110 * p;
        root.pos.x = entry.x + 85 - 50 * p;
        root.pos.y = entry.y - 155 + 85 * p;
      } else {
        const p = (t - 0.58) / 0.42;
        root.angle = 55 - 45 * p;
        root.pos.x = entry.x + 35 + 30 * p;
        root.pos.y = entry.y - 70 - 55 * p;
      }
      if (t >= 1) {
        safeCancel(hammerMotion);
        root.destroy();
      }
    });

    const spinStart = k.time();
    for (let i = 0; i < 3; i += 1) {
      const angle = i * (Math.PI * 2 / 3);
      const star = k.add([
        k.text("★", { size: 34, font: FONT }),
        k.pos(entry.x, entry.y - 115),
        k.anchor("center"),
        k.color(...YELLOW),
        k.z(HAMMER_Z + 1),
      ]);
      const handle = star.onUpdate(() => {
        const t = Math.min(1, (k.time() - spinStart) / 0.9);
        star.pos.x = entry.x + Math.cos(angle + t * Math.PI * 2) * (55 + 12 * t);
        star.pos.y = entry.y - 115 + Math.sin(angle + t * Math.PI * 2) * (28 + 8 * t);
        star.opacity = 1 - t;
        if (t >= 1) {
          safeCancel(handle);
          star.destroy();
        }
      });
    }

    const spinStartMole = k.time();
    const hitMotion = entry.group.onUpdate(() => {
      const t = Math.min(1, (k.time() - spinStartMole) / 0.42);
      const wobble = Math.sin(t * Math.PI * 6) * (strong ? 0.16 : 0.09) * (1 - t);
      entry.group.angle = wobble * 180 / Math.PI;
      entry.group.scale = k.vec2(1 + wobble * 0.35, 1 - Math.abs(wobble) * 0.25);
      if (t >= 1) {
        safeCancel(hitMotion);
        entry.group.angle = 0;
        entry.group.scale = k.vec2(1, 1);
      }
    });
  }

  function spawnQuestion(playVoice = true) {
    if (!running) return;
    roundGeneration += 1;
    inputLocked = false;
    current = question();
    eqA.text = String(current.a);
    eqB.text = String(current.b);
    scoreText.text = String(score);
    sinkAll();
    resetMoleValues();

    if (playVoice) {
      const ids = ["whack-q-pre", `n-${current.a}`, "q-plus", `n-${current.b}`, "q-equals", "whack-pop"];
      const token = ++audioGeneration;
      audio.stopAllAudio();
      audio.playSequence(ids, 140, 0, () => {
        if (token !== audioGeneration || !running) return;
      });
    }
  }

  function onMoleTap(entry) {
    if (!running || inputLocked || !entry.up || !current) return;

    if (entry.value === current.answer) {
      inputLocked = true;
      streak += 1;
      score += 1;
      scoreText.text = String(score);
      bonkEffect(entry, true);

      const cheer = pickCheerCue({
        streak,
        isRoundComplete: false,
        levelId: GAME_ID,
        hasDiscovery: false,
        hadWrongs: hadWrong,
      });
      const readback = [
        `n-${current.a}`,
        "q-plus",
        `n-${current.b}`,
        "q-equals",
        `n-${current.answer}`,
      ];
      const token = ++audioGeneration;
      audio.stopAllAudio();
      audio.playSequence(["whack-tap", ...cheer.chain, ...readback], 150, 0, () => {
        if (token !== audioGeneration || !running) return;
        spawnQuestion(true);
      });

      const generation = roundGeneration;
      for (const other of moles) {
        if (other === entry) continue;
        cancelEntry(other);
        if (other.up) retreat(other, other.cycleToken, true);
      }
      k.wait(0.20, () => {
        if (generation === roundGeneration && entry.up) retreat(entry, entry.cycleToken, true);
      });
      return;
    }

    streak = 0;
    hadWrong = true;
    bonkEffect(entry, false);
    const token = ++audioGeneration;
    audio.stopAllAudio();
    audio.playSequence(["whack-tap", pickWrongCue()], 130, 0, () => {
      if (token !== audioGeneration || !running) return;
    });
  }

  function endRound() {
    if (!running) return;
    running = false;
    inputLocked = true;
    roundGeneration += 1;
    audioGeneration += 1;
    audio.stopAllAudio();
    safeCancel(timerHandle);
    timerHandle = null;
    sinkAll();

    const stars = score >= 10 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
    if (save) {
      const state = save.load();
      state.starsByGame = state.starsByGame || {};
      state.starsByGame[GAME_ID] = Math.max(state.starsByGame[GAME_ID] || 0, stars);
      save.save(state);
    }

    playExclusive(audio, ["whack-timeup", "whack-done"], () => showEndCard(stars));
  }

  function showEndCard(stars) {
    const card = k.add([
      k.rect(580, 360, { radius: 32 }),
      k.pos(683, 500),
      k.anchor("center"),
      k.color(...CARD),
      k.outline(6, k.rgb(...ORANGE_DEEP)),
      k.z(60),
    ]);
    card.add([k.text("TIME!", { size: 52, font: FONT }), k.pos(0, -118), k.anchor("center"), k.color(...INK)]);
    card.add([k.text("★".repeat(stars) + "☆".repeat(3 - stars), { size: 56, font: FONT }), k.pos(0, -30), k.anchor("center"), k.color(...ORANGE)]);
    card.add([k.text(`Score ${score}`, { size: 34, font: FONT }), k.pos(0, 45), k.anchor("center"), k.color(...MUTED)]);

    const again = card.add([k.rect(210, 70, { radius: 18 }), k.pos(-120, 125), k.anchor("center"), k.color(...SUCCESS), k.area()]);
    again.add([k.text("PLAY AGAIN", { size: 26, font: FONT }), k.anchor("center"), k.color(...PAPER)]);
    again.onClick(() => {
      k.destroy(card);
      score = 0;
      streak = 0;
      hadWrong = false;
      timeLeft = ROUND_SECONDS;
      running = true;
      timeText.text = String(timeLeft);
      startTimer();
      spawnQuestion(true);
    });

    const backButton = card.add([k.rect(210, 70, { radius: 18 }), k.pos(120, 125), k.anchor("center"), k.color(...DISABLED_BG), k.area()]);
    backButton.add([k.text("BACK", { size: 26, font: FONT }), k.anchor("center"), k.color(...INK)]);
    backButton.onClick(() => k.go("gamesPicker"));
  }

  function startTimer() {
    safeCancel(timerHandle);
    timerHandle = k.loop(1, () => {
      if (!running) return;
      timeLeft = Math.max(0, timeLeft - 1);
      timeText.text = String(timeLeft);
      timeText.color = k.rgb(...(timeLeft <= 10 ? DANGER : INK));
      if (timeLeft <= 0) endRound();
    });
  }

  const loading = k.add([
    k.text("Loading...", { size: 40, font: FONT }),
    k.pos(683, 510),
    k.anchor("center"),
    k.color(...INK),
  ]);

  loadWhackArt(k).then(() => {
    if (!k.getSprite("whack-hole-runtime") || !k.getSprite(MOLE_ART[0])) {
      loading.text = "Game art unavailable";
      return;
    }
    loading.destroy();
    for (let i = 0; i < MOLE_COUNT; i += 1) moles.push(createMole(i));
    running = true;
    timeLeft = ROUND_SECONDS;
    startTimer();
    spawnQuestion(true);
  });

  timeText.text = String(ROUND_SECONDS);
  scoreText.text = "0";

  k.onSceneLeave?.(() => {
    running = false;
    inputLocked = true;
    roundGeneration += 1;
    audioGeneration += 1;
    audio.stopAllAudio();
    safeCancel(timerHandle);
    for (const entry of moles) cancelEntry(entry);
  });
}

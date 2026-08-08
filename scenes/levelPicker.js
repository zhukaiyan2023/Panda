// scenes/levelPicker.js — L1 / L2 / L3 selection screen.
//
// Three large cards. Locked levels show a lock badge and play level-locked.mp3
// when tapped. Unlocked levels are reachable from save data (window.PandaSave).

const INK = [61, 54, 82];
const PAPER = [255, 250, 240];
const LOCKED_BG = [220, 213, 230];
const UNLOCKED_BG = [255, 255, 255];
const ACCENT = [255, 138, 61];

const SHORT_TITLES = {
  1: "Up to 5",
  2: "Make 10",
  3: "Up to 20",
};

function drawCard(k, parent, level, unlocked) {
  const w = 320;
  const h = 380;
  const x = level.cardX;
  const y = level.cardY;

  const card = parent.add([
    k.rect(w, h, { radius: 28 }),
    k.color(...(unlocked ? UNLOCKED_BG : LOCKED_BG)),
    k.outline(5, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
  ]);

  const titleColor = unlocked ? INK : [150, 140, 170];

  card.add([
    k.text(`Level ${level.id}`, { size: 36 }),
    k.color(...titleColor),
    k.pos(0, -h / 2 + 60),
    k.anchor("center"),
  ]);

  card.add([
    k.text(SHORT_TITLES[level.id] || level.title, { size: 40 }),
    k.color(...titleColor),
    k.pos(0, 0),
    k.anchor("center"),
  ]);

  if (unlocked) {
    card.add([
      k.text("▶", { size: 56 }),
      k.color(...ACCENT),
      k.pos(0, h / 2 - 60),
      k.anchor("center"),
    ]);
  } else {
    card.add([
      k.text("🔒", { size: 56 }),
      k.color(...titleColor),
      k.pos(0, h / 2 - 60),
      k.anchor("center"),
    ]);
  }

  const onPick = () => {
    if (unlocked) {
      window.PandaAudio.playCue("next");
      k.go(`level${level.id}`);
    } else {
      window.PandaAudio.playCue("level-locked");
    }
  };
  card.onClick(onPick);
  card.onTouchStart(onPick);
}

export default function levelPickerScene(k) {
  const levels = (window.PandaLevels?.levels || []);
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };

  k.add([
    k.rect(k.width(), k.height()),
    k.color(255, 241, 220),
  ]);

  k.add([
    k.text("Panda's Make-Ten Adventure", { size: 64 }),
    k.color(...INK),
    k.pos(k.width() / 2, 110),
    k.anchor("center"),
  ]);

  k.add([
    k.text("Pick a level", { size: 32 }),
    k.color(...INK),
    k.pos(k.width() / 2, 190),
    k.anchor("center"),
  ]);

  const stride = 380;
  const totalSpan = (levels.length - 1) * stride;
  const baseY = 560;
  levels.forEach((lvl, i) => {
    const lvlWithCoords = {
      ...lvl,
      cardX: k.width() / 2 - totalSpan / 2 + i * stride,
      cardY: baseY,
    };
    const unlocked = lvl.id <= save.unlockedLevel;
    drawCard(k, k, lvlWithCoords, unlocked);
  });

  const totalStars = Object.values(save.starsByLevel || {}).reduce((a, b) => a + b, 0);
  k.add([
    k.text(`⭐ ${totalStars}`, { size: 36 }),
    k.color(...INK),
    k.pos(k.width() / 2, k.height() - 80),
    k.anchor("center"),
  ]);

  window.PandaAudio.playCue("panda-hi");
}
// scenes/levelPicker.js — L1 / L2 / L3 selection screen.
//
// Three large cards. Locked levels show a lock badge and play level-locked.mp3
// when tapped. Unlocked levels are reachable from save data (window.PandaSave).

const INK = [61, 54, 82];
const PAPER = [255, 250, 240];
const LOCKED_BG = [220, 213, 230];
const UNLOCKED_BG = [255, 255, 255];
const ACCENT = [255, 138, 61];

function drawCard(k, parent, level, unlocked, onClick) {
  const w = 280;
  const h = 360;
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
    k.text(`Level ${level.id}`, { size: 30 }),
    k.color(...titleColor),
    k.pos(x, y - h / 2 + 50),
    k.anchor("center"),
  ]);

  card.add([
    k.text(level.title, { size: 32, align: "center", width: w - 32 }),
    k.color(...titleColor),
    k.pos(x, y - 20),
    k.anchor("center"),
  ]);

  if (unlocked) {
    card.add([
      k.text("▶", { size: 48 }),
      k.color(...ACCENT),
      k.pos(x, y + h / 2 - 60),
      k.anchor("center"),
    ]);
  } else {
    card.add([
      k.text("🔒", { size: 48 }),
      k.color(...titleColor),
      k.pos(x, y + h / 2 - 60),
      k.anchor("center"),
    ]);
  }

  card.onClick(() => {
    if (unlocked) {
      window.PandaAudio.playCue("next");
      k.go(`level${level.id}`);
    } else {
      window.PandaAudio.playCue("level-locked");
    }
    if (onClick) onClick(level);
  });
  card.onTouchStart(() => {
    if (unlocked) {
      window.PandaAudio.playCue("next");
      k.go(`level${level.id}`);
    } else {
      window.PandaAudio.playCue("level-locked");
    }
    if (onClick) onClick(level);
  });
}

export default function levelPicker() {
  const k = window.kaplay;
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
    k.pos(k.width() / 2, 180),
    k.anchor("center"),
  ]);

  const baseY = 500;
  const cards = levels.map((lvl, i) => ({
    ...lvl,
    cardX: k.width() / 2 - 320 + i * 320,
    cardY: baseY,
  }));
  cards.forEach((lvl) => {
    const unlocked = lvl.id <= save.unlockedLevel;
    drawCard(k, k, lvl, unlocked);
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
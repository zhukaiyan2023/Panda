// scenes/levelPicker.js — L1 / L2 / L3 selection screen.
//
// Three large cards. Locked levels show a lock badge and play level-locked.mp3
// when tapped. Unlocked levels are reachable from save data (window.PandaSave).
//
// The emoji lock and star are replaced by the SVG sprites in assets/art/, and
// the panda now actually appears on the screen the game is named after.

import panda from "../components/panda.js";
import {
  INK, PAPER, CARD, ORANGE, YELLOW, BLUE, PURPLE, FONT,
} from "../components/theme.js";

const LOCKED_BG = [220, 213, 230];
const LOCKED_INK = [150, 140, 170];

const SHORT_TITLES = {
  1: "三数相加",
  2: "凑十法",
  3: "二十以内",
};

const CARD_ACCENT = { 1: BLUE, 2: ORANGE, 3: PURPLE };

// Sprites are decoration: a missing art file must not blank the screen a child
// needs in order to start playing.
function hasSprite(k, name) {
  try {
    return !!k.getSprite(name);
  } catch (_) {
    return false;
  }
}

function sprite(parent, k, name, { x, y, size }) {
  if (!hasSprite(k, name)) return null;
  const node = parent.add([k.sprite(name), k.anchor("center"), k.pos(x, y)]);
  node.width = size;
  node.height = size;
  return node;
}

function drawCard(k, parent, level, unlocked) {
  const w = 320;
  const h = 380;
  const { cardX: x, cardY: y } = level;

  const accent = CARD_ACCENT[level.id] || ORANGE;

  parent.add([
    k.rect(w, h, { radius: 28 }),
    k.color(...INK),
    k.opacity(0.15),
    k.pos(x, y + 10),
    k.anchor("center"),
  ]);

  const card = parent.add([
    k.rect(w, h, { radius: 28 }),
    k.color(...(unlocked ? CARD : LOCKED_BG)),
    k.outline(5, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
  ]);

  const titleColor = unlocked ? INK : LOCKED_INK;

  // A colored band behind the badge gives each level its own identity at a
  // glance, which matters more than the words to a pre-reader.
  if (unlocked) {
    card.add([
      k.rect(w - 10, 96, { radius: 24 }),
      k.color(...accent),
      k.opacity(0.28),
      k.pos(0, -h / 2 + 53),
      k.anchor("center"),
    ]);
  }

  const badge = sprite(card, k, `badge-${level.id}`, { x: 0, y: -h / 2 + 62, size: 78 });
  if (!badge) {
    card.add([
      k.text(`第 ${level.id} 关`, { size: 36, font: FONT }),
      k.color(...titleColor),
      k.pos(0, -h / 2 + 62),
      k.anchor("center"),
    ]);
  }

  card.add([
    k.text(SHORT_TITLES[level.id] || level.title, { size: 40, font: FONT }),
    k.color(...titleColor),
    k.pos(0, 10),
    k.anchor("center"),
  ]);

  if (unlocked) {
    card.add([
      k.text("▶", { size: 56, font: FONT }),
      k.color(...accent),
      k.pos(0, h / 2 - 62),
      k.anchor("center"),
    ]);
  } else if (!sprite(card, k, "lock", { x: 0, y: h / 2 - 62, size: 72 })) {
    card.add([
      k.text("还没解锁", { size: 32, font: FONT }),
      k.color(...titleColor),
      k.pos(0, h / 2 - 62),
      k.anchor("center"),
    ]);
  }

  const onPick = () => {
    if (unlocked) {
      k.go(`level${level.id}`);
    }
  };
  // Kaplay is configured with touchToMouse, so onClick covers both mouse and
  // touch input without double-firing on iPad Safari.
  card.onClick(onPick);
}

export default function levelPickerScene(k) {
  const levels = window.PandaLevels?.levels || [];
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };

  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

  // Bamboo framing the edges, kept well outside the card row.
  [90, k.width() - 90].forEach((bx, i) => {
    if (!hasSprite(k, "bamboo")) return;
    const stalk = k.add([
      k.sprite("bamboo"),
      k.anchor("center"),
      k.pos(bx, k.height() - 200),
      k.opacity(0.55),
      k.z(-5),
    ]);
    stalk.width = 130;
    stalk.height = 260;
    stalk.flipX = i === 1;
  });

  k.add([
    k.text("熊猫凑十乐园", { size: 64, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, 110),
    k.anchor("center"),
  ]);

  // "Games" tab below the title (was at y=92 where it overlapped the title).
  // Mirrors the tab row in gamesPicker so the two screens feel symmetric.
  const gamesTab = k.add([
    k.rect(200, 70, { radius: 22 }),
    k.color(...CARD),
    k.outline(4, k.rgb(...INK)),
    k.pos(k.width() - 200, 200),
    k.anchor("center"),
    k.area(),
  ]);
  k.add([
    k.text("小游戏", { size: 32, font: FONT }),
    k.color(...INK),
    k.pos(k.width() - 200, 200),
    k.anchor("center"),
  ]);

  k.add([
    k.text("选一关开始吧", { size: 32, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, 290),
    k.anchor("center"),
  ]);
  gamesTab.onClick(() => {
    k.go("gamesPicker");
  });

  const stride = 380;
  const totalSpan = (levels.length - 1) * stride;
  const baseY = 560;
  levels.forEach((lvl, i) => {
    drawCard(
      k,
      k,
      {
        ...lvl,
        cardX: k.width() / 2 - totalSpan / 2 + i * stride,
        cardY: baseY,
      },
      lvl.id <= save.unlockedLevel,
    );
  });

  // Kept above the card row: at the previous size and position the panda's body
  // overlapped the Level 1 card.
  const buddy = panda(k, { x: 150, y: 248, size: 172 });
  buddy.setMood("idle");

  const totalStars = Object.values(save.starsByLevel || {}).reduce((a, b) => a + b, 0);
  const starY = k.height() - 76;
  const hasStarSprite = sprite(k, k, "star", { x: k.width() / 2 - 40, y: starY, size: 52 });
  k.add([
    k.text(String(totalStars), { size: 40, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2 + (hasStarSprite ? 6 : 0), starY),
    k.anchor("center"),
  ]);
  if (!hasStarSprite) {
    k.add([
      k.text("颗星", { size: 26, font: FONT }),
      k.color(...INK),
      k.pos(k.width() / 2, starY + 38),
      k.anchor("center"),
    ]);
  }
}

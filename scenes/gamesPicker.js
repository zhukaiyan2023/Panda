// scenes/gamesPicker.js — panda-park games tab.
//
// Five large cards: Boat, Bounce, Cloud, Feed, Whack. Locked games show a
// lock badge; unlocked games play their intro cue and enter the scene on tap.
// Stars are tracked separately under save.starsByGame so the math and games
// tracks are independent.
//
// The tab bar at the top mirrors the one on the math picker — same chrome,
// same tab pill style — so a child can predict where "Math" went when they
// want it back.

import panda from "../components/panda.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";
import {
  INK, CARD, ORANGE, YELLOW, BLUE, PURPLE, PINK, FONT,
} from "../components/theme.js?v=20260812";

const LOCKED_BG = [220, 213, 230];
const LOCKED_INK = [150, 140, 170];

const GAMES = [
  { id: 1, title: "小船",  sub: "凑十过河",  scene: "gameBoat",   sprite: "boat",   accent: BLUE },
  { id: 2, title: "气球",  sub: "扎破凑十",  scene: "gameBounce", sprite: "balloon", accent: PINK },
  { id: 3, title: "云朵",  sub: "抱出好朋友", scene: "gameCloud",  sprite: "cloud",  accent: PURPLE },
  { id: 4, title: "喂食",  sub: "帮熊猫吃饱", scene: "gameFeed",   sprite: "bubble", accent: ORANGE },
];

function hasSprite(k, name) {
  try { return !!k.getSprite(name); } catch (_) { return false; }
}

function sprite(parent, k, name, { x, y, size }) {
  if (!hasSprite(k, name)) return null;
  const node = parent.add([k.sprite(name), k.anchor("center"), k.pos(x, y)]);
  node.width = size;
  node.height = size;
  return node;
}

function drawTab(k, parent, label, x, y, w, h, active) {
  const fill = active ? ORANGE : CARD;
  const text = parent.add([
    k.rect(w, h, { radius: 22 }),
    k.color(...fill),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
  ]);
  parent.add([
    k.text(label, { size: 32, font: FONT }),
    k.color(active ? [255, 255, 255] : INK),
    k.pos(x, y),
    k.anchor("center"),
  ]);
  text.onClick(() => {
    k.go(label === "学数学" ? "levelPicker" : "gamesPicker");
  });
}

function drawCard(k, parent, game, unlocked) {
  const w = 240;
  const h = 280;
  const x = game.cardX;
  const y = game.cardY;

  parent.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...INK),
    k.opacity(0.15),
    k.pos(x, y + 10),
    k.anchor("center"),
  ]);

  const card = parent.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...(unlocked ? CARD : LOCKED_BG)),
    k.outline(5, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
  ]);

  // Accent band.
  if (unlocked) {
    card.add([
      k.rect(w - 10, 84, { radius: 20 }),
      k.color(...game.accent),
      k.opacity(0.28),
      k.pos(0, -h / 2 + 46),
      k.anchor("center"),
    ]);
  }

  // Prop sprite centered on the card.
  if (unlocked) {
    sprite(card, k, game.sprite, { x: 0, y: -10, size: 110 });
  } else {
    sprite(card, k, "lock", { x: 0, y: 0, size: 90 });
  }

  const titleColor = unlocked ? INK : LOCKED_INK;
  card.add([
    k.text(game.title, { size: 36, font: FONT }),
    k.color(...titleColor),
    k.pos(0, h / 2 - 70),
    k.anchor("center"),
  ]);
  card.add([
    k.text(game.sub, { size: 18, font: FONT }),
    k.color(...titleColor),
    k.opacity(0.7),
    k.pos(0, h / 2 - 38),
    k.anchor("center"),
  ]);

  const onPick = () => {
    if (unlocked) {
      k.go(game.scene);
    }
  };
  card.onClick(onPick);
}

export default function gamesPickerScene(k) {
  const save = window.PandaSave?.load() || { unlockedGame: 1, starsByGame: {} };

  sceneBg(k, "bg-meadow");

  // Tabs at the top.
  drawTab(k, k, "学数学", 600, 200, 200, 70, false);
  drawTab(k, k, "小游戏", 850, 200, 200, 70, true);

  // Back to math picker (icon button top-left).
  const back = k.add([
    k.rect(96, 72, { radius: 20 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(84, 92),
    k.anchor("center"),
    k.area(),
  ]);
  k.add([
    k.text("←", { size: 44, font: FONT }),
    k.color(255, 255, 255),
    k.pos(84, 92),
    k.anchor("center"),
  ]);
  back.onClick(() => {
    k.go("levelPicker");
  });

  k.add([
    k.text("熊猫游戏乐园", { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, 110),
    k.anchor("center"),
  ]);

  k.add([
    k.text("选一个游戏吧", { size: 28, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, 290),
    k.anchor("center"),
  ]);

  // 5 cards in a single row.
  const stride = 240;
  const totalSpan = (GAMES.length - 1) * stride;
  const baseY = 600;
  GAMES.forEach((g, i) => {
    drawCard(
      k,
      k,
      {
        ...g,
        cardX: k.width() / 2 - totalSpan / 2 + i * stride,
        cardY: baseY,
      },
      true,
    );
  });

  // Panda greeter in the bottom-left so they recognize the character from
  // the math picker.
  const buddy = panda(k, { x: 120, y: 850, size: 200 });
  buddy.setMood("idle");

  // Total stars for games tab.
  const totalStars = Object.values(save.starsByGame || {}).reduce((a, b) => a + b, 0);
  const starY = k.height() - 80;
  const hasStarSprite = sprite(k, k, "star", { x: k.width() / 2 - 40, y: starY, size: 52 });
  k.add([
    k.text(String(totalStars), { size: 40, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2 + (hasStarSprite ? 6 : 0), starY),
    k.anchor("center"),
  ]);
  if (!hasStarSprite) {
    k.add([
      k.text("游戏星", { size: 24, font: FONT }),
      k.color(...INK),
      k.pos(k.width() / 2, starY + 36),
      k.anchor("center"),
    ]);
  }
}
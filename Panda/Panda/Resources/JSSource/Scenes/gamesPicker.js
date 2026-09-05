// scenes/gamesPicker.js — panda-park games tab.
//
// Four large cards: Boat, Bounce, Cloud, Feed. Locked games show a
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
  INK, CARD, ORANGE, YELLOW, BLUE, PURPLE, PINK, GREEN, FONT,
} from "../components/theme.js?v=20260812";

const LOCKED_BG = [220, 213, 230];
const LOCKED_INK = [150, 140, 170];

const GAMES = [
  { id: 6, title: "一眼识数", sub: "瞬间识数",  scene: "gameCount", sprite: "count-icon", accent: BLUE },
  { id: 1, title: "小船",  sub: "凑十过河",  scene: "gameBoat",   sprite: "boat",   accent: BLUE },
  { id: 2, title: "气球",  sub: "扎破凑十",  scene: "gameBounce", sprite: "balloon", accent: PINK },
  { id: 3, title: "云朵",  sub: "看算式找答案", scene: "gameCloud",  sprite: "cloud",  accent: PURPLE },
  { id: 4, title: "喂食",  sub: "帮熊猫吃饱", scene: "gameFeed",   sprite: "bubble", accent: ORANGE },
  { id: 5, title: "打地鼠", sub: "水墨出题", scene: "gameWhack",  sprite: "mole-1", accent: GREEN },
];

function hasSprite(k, name) {
  try { return !!k.getSprite(name); } catch (_) { return false; }
}

function sprite(parent, k, name, { x, y, size }) {
  if (!hasSprite(k, name)) return null;
  // Preserve the source aspect ratio. balloon.png is 443x899 (very tall
  // because of the trailing string) and forcing it into a size x size box
  // squashed it into a short fat shape next to the boat / cloud / bubble
  // (which are roughly square). We use uniform k.scale() (matching
  // pickerItem.js:202) and fit the longer side to `size` so the balloon
  // reads as tall and the boat reads as wide — same visual weight, no
  // compression.
  //
  // Two earlier attempts were wrong:
  //   (a) reading sp.width / sp.height — modern kaplay stores sprite
  //       source dimensions on sp.data.width / sp.data.height, so the
  //       top-level accessors return undefined and the aspect math
  //       degenerates to NaN.
  //   (b) setting node.width / node.height after `k.sprite(name)` — that
  //       only resizes the hitbox in modern kaplay, not the visual
  //       sprite drawing. k.scale() is the component that drives the
  //       visual size for sprites.
  const sp = k.getSprite(name);
  const sw = sp.data?.width  ?? size;
  const sh = sp.data?.height ?? size;
  const longSide = Math.max(sw, sh) || size;
  const scale = size / longSide;
  return parent.add([
    k.sprite(name),
    k.anchor("center"),
    k.pos(x, y),
    k.scale(scale),
  ]);
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

function drawCard(k, parent, game, unlocked, dailyLocked) {
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

  // Prop sprite centered on the card. Three states:
  //   - truly-locked (not unlocked yet): lock icon at the top
  //   - daily-locked (unlocked but hit today's cap): lock icon at the
  //       top, replaces the regular sprite so the kid sees the same
  //       "locked" visual cue as math-level daily-locked cards
  //   - freely playable: regular game sprite at the top
  //
  // 2026-08-16 user feedback: "锁放最上面". The earlier pass put the
  // lock at the bottom (matching the math-level play-arrow position),
  // but the kid's expectation is "the lock replaces the sprite" — same
  // visual idea as a real iOS-locked row.
  if (!unlocked || dailyLocked) {
    sprite(card, k, "lock", { x: 0, y: -10, size: 110 });
  } else {
    sprite(card, k, game.sprite, { x: 0, y: -10, size: 110 });
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

  // Daily-locked cards fall back to "今天练够啦" text when the lock
  // sprite is missing — title and subtitle are kept readable so the
  // text fallback still lands. The lock sprite is the primary visual
  // (replaces the regular sprite above), so the fallback is rare.
  //
  // (No lock icon drawn at the bottom: 2026-08-16 user feedback
  // "锁放最上面" moved the lock to the top of the card, replacing the
  // regular sprite. The text below is purely a defensive fallback.)

  const onPick = () => {
    if (!unlocked) return;
    if (dailyLocked) {
      // Stop any in-flight cue first so the prior scene's "round done"
      // audio doesn't bleed into the daily-done voice. Matches the
      // levelPicker.js pattern.
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playCue("daily-done");
      return;
    }
    k.go(game.scene);
  };
  card.onClick(onPick);
}

export default function gamesPickerScene(k) {
  const save = window.PandaSave?.load() || { unlockedGame: 1, starsByGame: {} };

  sceneBg(k, "bg-meadow");

  // Pre-create Audio elements for the most common cues across all
  // panda-park games. The browser starts downloading each MP3 as the
  // element is touched; by the time the kid picks a game, the intro +
  // common encouragements are already buffered and the first .play()
  // lands gap-free. The LRU cache (MAX_AUDIO_CACHE=40 in main.js)
  // bounds how much of this sticks around — anything beyond the cap
  // is evicted immediately as fresh game-specific cues come in.
  //
  // The set covers:
  //   - Game intros for all 6 games (count-/bounce-/cloud-/boat-/
  //     feed-/whack-intro) so the very first cue in a fresh game
  //     doesn't buffer-stall
  //   - "好棒"/"对啦"/enc-first-N (always plays on first correct)
  //   - enc-streak3-N (streak escalation — high prob after 3 picks)
  //   - enc-wrong-N (wrong picks — common during learning)
  //   - panda-praise-N + panda-cheer-N (the panda character voice)
  //   - daily-done (the daily-locked response cue)
  //
  // Game-specific deep chain cues (whack-pop, feed-q-pre, etc.) are
  // still preloaded via playSequence/playAfter inside each scene —
  // see the chain-preload comment in main.js.
  window.PandaAudio?.preloadCueIds([
    // Common encouragements — fire on most correct picks.
    "enc-first-1", "enc-first-2", "enc-first-3", "enc-first-4",
    "enc-streak3-1", "enc-streak3-2", "enc-streak3-3",
    "enc-wrong-1", "enc-wrong-2", "enc-wrong-3",
    "panda-praise-1", "panda-praise-2", "panda-praise-3",
    "panda-cheer-1", "panda-cheer-2",
    "daily-done",
    // Game intros — the very first cue played on a fresh game.
    "count-intro", "bounce-intro", "cloud-intro",
    "boat-intro", "feed-intro", "whack-intro",
    // Game "all done" / pair cues — fire at round-end / mid-session.
    "count-pair", "count-done",
    "bounce-pop", "bounce-done",
    "cloud-pair", "cloud-done",
    "boat-pair", "boat-done",
    "feed-nom", "feed-done",
    "whack-correct", "whack-done",
  ]);

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

  // 6 cards in two rows of 3. With one row of 6, the row overflowed 1366
  // wide (stride 240 → 5 stride gaps = 1200 px, leaving only ~80 px margin
  // on each end with 240 px cards). 2026-08-16 user feedback: "一排太挤了".
  // 3 per row × 2 rows keeps each card readable and lands the row pair
  // symmetrically between the subtitle (y=290) and the star counter (y=944).
  const COLS = 3;
  const ROWS = Math.ceil(GAMES.length / COLS);
  const stride = 320;
  const rowH = 280;
  const rowGap = 30;
  const totalSpan = (COLS - 1) * stride;
  // Subtitle sits at y=290, star at y=944 — usable band is 290..944.
  // 2 rows of 280 + 30 gap = 590 total. Centre the pair in the band:
  // firstRowCenter = 290 + (654 - 590) / 2 + 140 = 462.
  const firstRowCenter = 462;
  GAMES.forEach((g, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // All panda-park games are unlocked by default (mirrors the existing
    // gamesPicker contract — the unlock chain is driven by saveProgress
    // hits, not by gating). The DAILY cap is the only gate that can
    // disable a card mid-session.
    const unlocked = true;
    const dailyLocked = window.PandaSave?.isGameDailyLocked(g.id) ?? false;
    drawCard(
      k,
      k,
      {
        ...g,
        cardX: k.width() / 2 - totalSpan / 2 + col * stride,
        cardY: firstRowCenter + row * (rowH + rowGap),
      },
      unlocked,
      dailyLocked,
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
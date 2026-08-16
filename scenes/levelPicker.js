// scenes/levelPicker.js — math level selection screen.
//
// Large cards, one per math level. Locked levels show a lock badge
// and play level-locked.mp3 when tapped. Unlocked levels are reachable
// from save data (window.PandaSave). The card row auto-sizes — adding
// more levels shrinks the stride so the row stays inside the canvas.
//
// The emoji lock and star are replaced by the SVG sprites in assets/art/, and
// the panda now actually appears on the screen the game is named after.

import panda from "../components/panda.js?v=20260815";
import { card } from "../components/card.js?v=20260815";
import sceneBg from "../components/sceneBg.js?v=20260815";
import {
  INK, CARD, ORANGE, YELLOW, BLUE, PURPLE, PINK, FONT, SUCCESS,
} from "../components/theme.js?v=20260815";

const LOCKED_BG = [220, 213, 230];
const LOCKED_INK = [150, 140, 170];

const SHORT_TITLES = {
  1: "十以内减法",
  2: "三数相加",
  3: "两数凑十",
  4: "凑十法",
  5: "二十以内",
  6: "十几加十几",
  7: "十几减几（不退位）",
  8: "破十法",
};

const CARD_ACCENT = {
  1: PINK, 2: BLUE, 3: ORANGE, 4: PURPLE, 5: YELLOW,
  6: SUCCESS, 7: BLUE, 8: ORANGE,
};

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

function drawCard(k, parent, level, unlocked, dailyLocked, cardW = 320, cardH = 380) {
  const w = cardW;
  const h = cardH;
  const compact = h < 300;
  const { cardX: x, cardY: y } = level;

  const accent = CARD_ACCENT[level.id] || ORANGE;
  const face = card(parent, k, {
    x, y, w, h,
    fill: unlocked ? CARD : LOCKED_BG,
  });

  const titleColor = unlocked ? INK : LOCKED_INK;

  // A colored band behind the badge gives each level its own identity at a
  // glance, which matters more than the words to a pre-reader.
  if (unlocked) {
    face.add([
      k.rect(w - 10, compact ? 70 : 96, { radius: 24 }),
      k.color(...accent),
      k.opacity(0.28),
      k.pos(0, -h / 2 + (compact ? 40 : 53)),
      k.anchor("center"),
    ]);
  }

  const badge = sprite(face, k, `badge-${level.id}`, { x: 0, y: -h / 2 + (compact ? 42 : 62), size: compact ? 58 : 78 });
  if (!badge) {
    face.add([
      k.text(`第 ${level.id} 关`, { size: compact ? 28 : 36, font: FONT }),
      k.color(...titleColor),
      k.pos(0, -h / 2 + (compact ? 42 : 62)),
      k.anchor("center"),
    ]);
  }

  face.add([
    k.text(SHORT_TITLES[level.id] || level.title, { size: compact ? 29 : 40, font: FONT }),
    k.color(...titleColor),
    k.pos(0, 10),
    k.anchor("center"),
  ]);

  if (unlocked && !dailyLocked) {
    face.add([
      k.text("▶", { size: compact ? 44 : 56, font: FONT }),
      k.color(...accent),
      k.pos(0, h / 2 - (compact ? 42 : 62)),
      k.anchor("center"),
    ]);
  } else if (!sprite(face, k, "lock", { x: 0, y: h / 2 - 62, size: 72 })) {
    // Both truly-locked and daily-locked fall through here. They
    // share the same greyed visual so the kid just sees "not now".
    // The text differs ("还没解锁" vs "今天练够啦") so an adult
    // notices the distinction; a pre-reader doesn't need to.
    face.add([
      k.text(dailyLocked ? "今天练够啦" : "还没解锁", { size: 32, font: FONT }),
      k.color(...titleColor),
      k.pos(0, h / 2 - 62),
      k.anchor("center"),
    ]);
  }

  const onPick = () => {
    if (unlocked && dailyLocked) {
      // Friendly feedback — kid tapped a card they've used up for
      // today. stopAllAudio first so the previous cue doesn't
      // bleed through. Same cue the dailyDone scene plays.
      window.PandaAudio.stopAllAudio();
      window.PandaAudio.playCue("daily-done");
      return;
    }
    if (unlocked) {
      // Pre-unlock every pool-driven composite cue for this level while
      // we're still inside the card tap gesture. iPad Safari only
      // accepts .play() for <audio> elements whose first play/pause
      // cycle ran inside a user activation — and roundScene's first
      // .play() (the step-1 cue, e.g. l3-s1-12-6) fires after k.go()
      // returns, which is OUTSIDE the gesture. Without this, the first
      // round plays in silence and the rejection logs once per pool
      // cue. User-reported 2026-08-12: "用户第一次进来点击时，必然出现".
      window.PandaAudio.unlockLevelPool(level.id);
      k.go(`level${level.id}`);
    }
  };
  // Kaplay is configured with touchToMouse, so onClick covers both mouse and
  // touch input without double-firing on iPad Safari.
  face.onClick(onPick);
}

export default function levelPickerScene(k) {
  const levels = window.PandaLevels?.levels || [];
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };

  sceneBg(k, "bg-meadow");

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

  // "小游戏" tab below the title (not at y=92, where it would overlap the
  // title). Mirrors the tab row in gamesPicker so the two screens feel
  // symmetric. Was closed off on 2026-08-10 and reopened on 2026-08-12.
  // k.go is wrapped in main.js to stopAllAudio first, so tapping this while
  // a cue is still speaking can't stack two voices.
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
  gamesTab.onClick(() => {
    k.go("gamesPicker");
  });

  k.add([
    k.text("选一关开始吧", { size: 32, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, 290),
    k.anchor("center"),
  ]);

  // Auto-size the card row so N cards fit across the canvas.
  //   * Start at the ideal cardW (320). Shrink only if even a
  //     minimum-gap (6px) layout would overflow the margin. That
  //     keeps the 3-card historical layout intact (320 wide, 232
  //     gap) while letting 4 cards shrink to ~280 wide so the row
  //     fits with a comfortable gap.
  //   * Below 240 px wide the badge + title stop being readable —
  //     stop shrinking there.
  const useGrid = levels.length > 5;
  const columns = useGrid ? 4 : levels.length;
  const cardH = useGrid ? 250 : 380;
  const margin = 80;
  const idealCardW = 320;
  const minGap = 6;
  let cardW = useGrid ? 280 : idealCardW;
  while (cardW > 240) {
    const needed = cardW * columns + minGap * (columns - 1);
    if (needed <= k.width() - 2 * margin) break;
    cardW -= 20;
  }
  // Final gap that uses all available horizontal space (no upper
  // cap — the canvas is wide enough that the gap stays comfortable).
  const availForGaps = k.width() - 2 * margin - cardW * columns;
  const gap = Math.max(minGap, availForGaps / Math.max(1, columns - 1));
  const stride = cardW + gap;
  const totalSpan = (columns - 1) * stride;
  const baseY = useGrid ? 480 : 560;
  levels.forEach((lvl, i) => {
    const column = i % columns;
    const row = Math.floor(i / columns);
    const unlocked = lvl.id <= save.unlockedLevel;
    // dailyLocked is only meaningful for unlocked levels — a truly
    // locked level is already gated by the unlocked check above.
    const dailyLocked = unlocked && window.PandaSave?.isLevelDailyLocked(lvl.id);
    drawCard(
      k,
      k,
      {
        ...lvl,
        cardX: k.width() / 2 - totalSpan / 2 + column * stride,
        cardY: baseY + row * (cardH + 50),
      },
      unlocked,
      dailyLocked,
      cardW,
      cardH,
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

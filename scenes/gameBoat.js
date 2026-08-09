// scenes/gameBoat.js — pair to cross (boat game from panda-park).
//
// Six boats float on a river. Five rounds; each round picks a fresh
// friends-of-10 pair + four non-conflicting distractors. The player taps two
// boats; if they sum to 10, the bridge fills with sequential pops, sparkles
// burst around the picked boats, a "过河啦！" header bounces in, and the
// panda cheers — five small visual beats so the kid feels rewarded, not just
// told they won.
//
// Mechanic note for a 3-6 year old: the visual reward (a full bridge of 10)
// directly mirrors the arithmetic they just performed, which is why this game
// is more memorable than the equivalent 4-button math question.

import createPairScene, { shuffle } from "./pairScene.js";
import item from "../components/pickerItem.js";
import { INK, FONT, ORANGE } from "../components/theme.js";

const TARGET = 10;

// All friends of 10 — every game round picks one of these.
const FRIENDS = [
  [1, 9], [2, 8], [3, 7], [4, 6], [5, 5],
  [6, 4], [7, 3], [8, 2], [9, 1],
];

// Picks `n` distinct candidates that include exactly one valid pair. The four
// distractors never form a second valid pair with anything else on screen,
// otherwise the player can win in more than one way.
//
// Uses an array (not a Set) so the [5, 5] pair keeps both 5s — a Set would
// dedupe them and the round would be impossible to win. The conflict check
// still treats any value that completes a 10 with the pair itself as part
// of the pair (only relevant when both pair addends are equal).
function candidatesFor(roundIdx) {
  const pair = FRIENDS[roundIdx % FRIENDS.length];
  const list = [...pair];
  const have = new Set(list);
  // Random digits 1..9 that don't complete a 10 with anything already in the
  // list, except values that ARE part of the intended pair.
  while (list.length < 6) {
    const v = 1 + Math.floor(Math.random() * 9);
    let conflict = false;
    for (const existing of have) {
      if (existing + v !== TARGET) continue;
      // v + existing = 10. It's only allowed if (existing, v) IS the pair
      // we're building toward. For [5, 5] that means v=5 with existing=5.
      const isPairValue =
        (existing === pair[0] && v === pair[1]) ||
        (existing === pair[1] && v === pair[0]);
      if (!isPairValue) { conflict = true; break; }
    }
    if (conflict) continue;
    // Skip a duplicate that isn't part of the pair (would only add visual
    // confusion). For [5, 5] we explicitly allow a second 5 here.
    const isPairValue = (v === pair[0] && v === pair[1]);
    if (have.has(v) && !isPairValue) continue;
    list.push(v);
    have.add(v);
  }
  return shuffle(list);
}

function pairsFor(roundIdx) {
  const [a, b] = FRIENDS[roundIdx % FRIENDS.length];
  return [[a, b]];
}

// Body renders 6 boats in a 3x2 grid, plus a 10-slot bridge above that fills
// sequentially on a correct pair.
function body(ctx) {
  const { k, round } = ctx;
  const values = round.candidates;

  // Bridge header — a "凑成十" label plus 10 empty wooden slots. The label
  // makes the bridge's purpose obvious (10 slots = the sum of the pair);
  // without it kids saw 10 cream rectangles and didn't know what they meant.
  k.add([
    k.text("凑成十", { size: 44, font: FONT }),
    k.color(...INK),
    k.opacity(0.85),
    k.pos(748, 360),
    k.anchor("center"),
  ]);
  for (let i = 0; i < TARGET; i++) {
    const x = 748 - (TARGET - 1) * 56 + i * 112;
    const y = 450;
    k.add([
      k.rect(96, 56, { radius: 12 }),
      k.color(255, 250, 240),
      k.outline(3, k.rgb(...INK)),
      k.pos(x, y),
      k.anchor("center"),
      "bridge_slot",
    ]);
  }

  // 6 boats in a 3x2 grid below the bridge.
  const cols = 3;
  const cellW = 280;
  const cellH = 220;
  const gridX = 748 - ((cols - 1) * cellW) / 2;
  const gridY = 700;
  const items = [];
  values.forEach((v, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    items.push(item(k, { value: v, sprite: "boat", x, y, size: 180 }));
  });
  ctx.items = items;
}

export default createPairScene({
  levelId: 1,                 // boat is the first panda-park game
  sceneName: "gameBoat",
  introCue: "boat-intro",
  roundCount: 5,
  target: TARGET,
  candidates: candidatesFor,
  pairs: pairsFor,
  prompt: () => "选两艘小船，让它们加起来是十。",
  body,
  // On a correct pair: bridge slots fill sequentially with a pop, sparkles
  // burst around the two picked boats, a big "过河啦！" header bounces in,
  // and the equation appears. Five beats of feedback so the kid feels
  // rewarded rather than told.
  onCorrect(ctx, a, b) {
    const k = ctx.k;

    // 1. Bridge slots fill sequentially with a pop scale. Each slot
    // recolours to soft yellow + bounces (1 → 1.25 → 1) before settling.
    const slots = k.get("bridge_slot", { recursive: true });
    slots.forEach((slot, i) => {
      k.wait(i * 0.06, () => {
        slot.color = k.rgb(255, 213, 90);
        slot.scale = k.vec2(1, 1);
        k.tween(1, 1.25, 0.08, (v) => { slot.scale = k.vec2(v, v); });
        k.wait(0.08, () => {
          k.tween(1.25, 1, 0.12, (v) => { slot.scale = k.vec2(v, v); });
        });
      });
    });

    // 2. Sparkles burst around each of the two correct boats. We add ✨
    // glyphs at random offsets, fade them in/out with random delays so they
    // don't all fire on the same frame.
    const sparkleTargets = ctx.items.filter(
      (it) => it.value === a || it.value === b,
    );
    sparkleTargets.forEach((it) => {
      const cx = it.node.pos?.x ?? 0;
      const cy = it.node.pos?.y ?? 0;
      for (let s = 0; s < 6; s++) {
        const sparkle = k.add([
          k.text("✨", { size: 36 }),
          k.color(...ORANGE),
          k.pos(
            cx + (Math.random() - 0.5) * 140,
            cy + (Math.random() - 0.5) * 140,
          ),
          k.anchor("center"),
          k.opacity(0),
          k.z(5),
        ]);
        const delay = 0.2 + Math.random() * 0.4;
        k.wait(delay, () => {
          k.tween(0, 1, 0.2, (v) => { sparkle.opacity = v; });
          k.wait(0.5, () => {
            k.tween(1, 0, 0.3, (v) => { sparkle.opacity = v; });
          });
        });
      }
    });

    // 3. Big "过河啦！" header bounces in between the bridge and the boats.
    // Scale starts small (0.5), springs up past 1, settles back to 1 — the
    // classic "appearing" beat that kids react to.
    const celebrate = k.add([
      k.text("过河啦！", { size: 88, font: FONT }),
      k.color(...ORANGE),
      k.outline(4, k.rgb(...INK)),
      k.pos(748, 560),
      k.anchor("center"),
      k.opacity(0),
      k.scale(0.5),
      k.z(10),
    ]);
    k.wait(0.35, () => {
      k.tween(0, 1, 0.25, (v) => { celebrate.opacity = v; });
      k.tween(0.5, 1.25, 0.35, (v) => {
        celebrate.scale = k.vec2(v, v);
      });
      k.wait(0.35, () => {
        k.tween(1.25, 1, 0.15, (v) => {
          celebrate.scale = k.vec2(v, v);
        });
      });
    });

    // 4. Equation fades in below the celebrate text. Placed low enough that
    // it doesn't overlap the bridge slots above or the boats below.
    const reward = k.add([
      k.text(`${a} + ${b} = ${a + b}！`, { size: 64, font: FONT }),
      k.color(...INK),
      k.pos(748, 620),
      k.anchor("center"),
      k.opacity(0),
    ]);
    k.wait(0.6, () => {
      k.tween(0, 1, 0.3, (v) => { reward.opacity = v; });
    });

    window.PandaAudio.playCue("boat-pair");
    return reward;
  },
  roundEndCue: () => null,
  replayCue: () => null,
});
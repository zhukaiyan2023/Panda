// scenes/gameBoat.js — pair to cross (boat game from panda-park).
//
// Six boats float on a river. Five rounds; each round picks a fresh
// friends-of-10 pair + four non-conflicting distractors. The player taps two
// boats; if they sum to 10, the two boats bounce, sparkles burst around the
// picked boats, a "过河啦！" header bounces in, and the panda cheers — four
// small visual beats so the kid feels rewarded, not just told they won.
//
// The digit on each boat floats above the sprite (see pickerItem.js
// labelPosition: "above") so the number reads against sky instead of being
// swallowed by the brown hull.

import createPairScene, { shuffle } from "./pairScene.js";
import item from "../components/pickerItem.js";
import { INK, FONT, ORANGE } from "../components/theme.js";

const TARGET = 10;

// All friends of 10 — every game round picks one of these.
const FRIENDS = [
  [1, 9], [2, 8], [3, 7], [4, 6], [5, 5],
  [6, 4], [7, 3], [8, 2], [9, 1],
];

// Picks 6 candidates that include exactly one valid pair. The four distractors
// never form a second valid pair with anything else on screen, otherwise the
// player can win in more than one way.
//
// Uses a Map of counts (not a Set) so [5, 5] keeps both 5s exactly — a Set
// dedupes them, but if we allowed unlimited 5s every boat would become a 5
// and the round would have many "right" answers (or none if all candidates
// are identical and the kid never guesses two 5s).
function candidatesFor(roundIdx) {
  const pair = FRIENDS[roundIdx % FRIENDS.length];
  const list = [...pair];
  const counts = new Map();
  list.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  while (list.length < 6) {
    const v = 1 + Math.floor(Math.random() * 9);
    // Reject if v completes 10 with anything already in the list — that
    // would create a second valid pair. (The pair itself is already in the
    // list, so we don't need a special case here.)
    let conflict = false;
    for (const existing of counts.keys()) {
      if (existing + v === TARGET) { conflict = true; break; }
    }
    if (conflict) continue;
    // Reject duplicates. For [5, 5] the pair already contributes exactly 2
    // fives — adding a third 5 would make every two-5s pick a valid pair
    // and dilute the round. For [1, 9] etc., one copy of each value is
    // already in the list; adding a duplicate just confuses the kid.
    if (counts.has(v)) continue;
    list.push(v);
    counts.set(v, 1);
  }
  return shuffle(list);
}

function pairsFor(roundIdx) {
  const [a, b] = FRIENDS[roundIdx % FRIENDS.length];
  return [[a, b]];
}

// Body renders 6 boats in a 3x2 grid. The digit on each boat floats above the
// sprite (labelPosition: "above") so it reads against sky instead of getting
// swallowed by the brown hull.
function body(ctx) {
  const { k, round } = ctx;
  const values = round.candidates;

  // 6 boats in a 3×2 grid. Numbers sit above the boat, not on the hull —
  // kid sees boat+sail against the water and the digit floating over it.
  //
  // Sizing/spacing (per user feedback 2026-08-09: previous boats still felt
  // too big, and the row-2 number label was clipping into the row-1 face).
  //   size 180 → 160     (smaller face, slightly more breathing room)
  //   spriteScale 0.45 → 0.4  (boat sprite inside the face)
  //   gridY 700 → 580    (move boats up; leaves room for the prompt above
  //                       and the bottom edge for the panda)
  //   cellH 220 → 260    (gap between row-1 face bottom and row-2 label top
  //                       = (580+260) − 140 − 40 − (580+80) = 0 — they
  //                       touch but don't overlap)
  const cols = 3;
  const cellW = 320;
  const cellH = 260;
  const gridX = 748 - ((cols - 1) * cellW) / 2;
  const gridY = 580;
  const items = [];
  values.forEach((v, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    items.push(item(k, {
      value: v,
      sprite: "boat",
      x,
      y,
      size: 160,
      spriteScale: 0.4,    // tighter than default 0.6 — boats felt crowded
      // Number sits just above the boat's flag/mast (sprite top is at
      // y-67, so y-60 places the number circle 7px above the flag —
      // matches the "top: -8px" pattern from panda-park/boat.html).
      // Earlier we used labelPosition: "above" which put the number at
      // y-140 (way above the boat) — the kid saw the digit floating in
      // empty sky with the boat far below it. -60 keeps the digit on
      // the boat.
      labelYOffset: -60,
      hideFace: true,      // no card frame around the boat (matches
                           // panda-park/boat.html — the boat sits on the
                           // water, the digit floats above it)
    }));
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
  // On a correct pair: the two boats bounce, sparkles burst around them,
  // a big "过河啦！" header bounces in, and the equation appears. Four beats
  // of feedback so the kid feels rewarded rather than told.
  onCorrect(ctx, a, b) {
    const k = ctx.k;

    // 1. The two correct boats bounce — quick 1 → 1.3 → 1 scale pulse so the
    // kid visually sees "those are the ones I picked, and they did the thing."
    const correct = ctx.items.filter((it) => it.value === a || it.value === b);
    correct.forEach((it, i) => {
      k.wait(i * 0.08, () => {
        const root = it.node;
        root.scale = k.vec2(1, 1);
        k.tween(1, 1.3, 0.12, (v) => { root.scale = k.vec2(v, v); });
        k.wait(0.12, () => {
          k.tween(1.3, 1, 0.18, (v) => { root.scale = k.vec2(v, v); });
        });
      });
    });

    // 2. Sparkles burst around each of the two correct boats. We add ✨
    // glyphs at random offsets, fade them in/out with random delays so they
    // don't all fire on the same frame. Anchored to descriptor.x/y (root.pos
    // is always (0, 0); the boat's world coords live on the descriptor).
    correct.forEach((it) => {
      const cx = it.x;
      const cy = it.y;
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

    // 3. Big "过河啦！" header bounces in above the boats. Scale starts small
    // (0.5), springs up past 1, settles back to 1 — the classic "appearing"
    // beat that kids react to. Lives in the gap between the prompt (y≈310)
    // and the top-row boat labels (y≈550).
    const celebrate = k.add([
      k.text("过河啦！", { size: 88, font: FONT }),
      k.color(...ORANGE),
      k.outline(4, k.rgb(...INK)),
      k.pos(748, 400),
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

    // 4. Equation fades in below the celebrate text, in the empty band
    // between the celebration and the top-row boat labels.
    const reward = k.add([
      k.text(`${a} + ${b} = ${a + b}！`, { size: 64, font: FONT }),
      k.color(...INK),
      k.pos(748, 500),
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
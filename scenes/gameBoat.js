// scenes/gameBoat.js — pair to cross (boat game from panda-park).
//
// Six boats float on a river. Five rounds; each round picks a fresh
// friends-of-10 pair + four non-conflicting distractors. The player taps two
// boats; if they sum to 10, the two boats disable (fade out) and the panda
// cheers. The previous "bounce + sparkles + 过河啦! header + equation" stack
// was removed on 2026-08-12 — user feedback was that the matching animation
// was too noisy and the selected boat looked ugly. The selection indicator
// is now a whole-sprite swap (regular boat ↔ golden-sail + heart boat).

import createPairScene, { shuffle } from "./pairScene.js?v=20260812";
import item from "../components/pickerItem.js?v=20260813";

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

  // 6 boats in a 3×2 grid. The new shorter boat SVG (200-tall viewbox,
  // 256x200) replaces the original 256-tall one — 2026-08-12 user feedback
  // was that the previous boats were too tall and the rows felt cramped.
  //
  //   spriteScale 0.4 → 0.42  (slight bump — shorter SVG means each pixel
  //                            of width is now more boat-body than empty
  //                            mast, so a small scale-up keeps the boat
  //                            reading at the same visual size as before)
  //   cellH 260 → 220         (tighter vertical pitch; new boats leave a
  //                            visible ~150 px gap between rows instead of
  //                            the old row 1 label touching row 0 hull)
  //   gridY 580 → 540          (lift the grid a touch; prompt at y=310
  //                            now has more breathing room above row 0)
  //
  // labelYOffset stays at -60 — the new flag top sits ~50 px above the
  // item center, so the number circle (radius 40) clears the flag by ~10 px
  // and the digit reads against sky, not the mast.
  const cols = 3;
  const cellW = 320;
  const cellH = 220;
  const gridX = 748 - ((cols - 1) * cellW) / 2;
  const gridY = 540;
  const items = [];
  values.forEach((v, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    items.push(item(k, {
      value: v,
      sprite: "boat",
      // selectedSprite swaps the visible whole-boat sprite on highlight()
      // and swaps back on unhighlight(). The pulsing orange ring is
      // skipped in this mode (see pickerItem.js useSpriteSwap) — the
      // 2026-08-12 feedback was that the ring was ugly.
      selectedSprite: "boat-sel",
      // selectedLift raises the picked boat 20 px above the row so the
      // kid sees "this one is up, this one is picked" in addition to the
      // golden-sail sprite swap. 2026-08-12 follow-up: the sprite swap
      // alone wasn't obvious enough at the smaller (200-tall) sprite size.
      selectedLift: 20,
      x,
      y,
      size: 160,
      spriteScale: 0.42,
      // labelYOffset -85 + labelPosition "above" — the new shorter
      // 200-tall boat has the flag at scene y≈-46; the white circle
      // around the digit has radius 40, so a -60 offset put the circle
      // bottom at y=-20 and covered the top of the sail. -85 lifts the
      // circle bottom to y=-45, leaving a 1-px gap above the flag so
      // the full boat (flag + sail + hull) stays visible. "above" also
      // extends the hit area 80 px above the face so the kid can still
      // tap the digit without the click landing on empty sky.
      labelPosition: "above",
      labelYOffset: -85,
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
  // On a correct pair, the boats themselves are already disabled by
  // pairScene's tryPair (setDisabled(true) on each — they fade to 35%
  // opacity). No matching animation here on purpose: 2026-08-12 user
  // feedback was that the previous "bounce + sparkles + 过河啦! header
  // + equation" stack was too noisy and felt "效果太差了". The pairScene
  // also skips its celebrate() fireworks for this game (noCelebrate: true
  // below), so the only positive feedback is the cheer audio + the boats
  // fading out + the panda switching to its cheer pose.
  noCelebrate: true,
  onCorrect(ctx, a, b) {
    window.PandaAudio.playCue("boat-pair");
  },
  roundEndCue: () => null,
  replayCue: () => null,
});
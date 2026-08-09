// scenes/gameBoat.js — pair to cross (boat game from panda-park).
//
// Six boats float on a river. Five rounds; each round picks a fresh
// friends-of-10 pair + four non-conflicting distractors. The player taps two
// boats; if they sum to 10, all 10 bridge slots light up and the round ends.
//
// Mechanic note for a 3-6 year old: the visual reward (a full bridge of 10)
// directly mirrors the arithmetic they just performed, which is why this game
// is more memorable than the equivalent 4-button math question.

import createPairScene, { shuffle } from "./pairScene.js";
import item from "../components/pickerItem.js";
import { INK, FONT } from "../components/theme.js";

const TARGET = 10;

// All friends of 10 — every game round picks one of these.
const FRIENDS = [
  [1, 9], [2, 8], [3, 7], [4, 6], [5, 5],
  [6, 4], [7, 3], [8, 2], [9, 1],
];

// Picks `n` distinct candidates that include exactly one valid pair. The four
// distractors never form a second valid pair with anything else on screen,
// otherwise the player can win in more than one way.
function candidatesFor(roundIdx) {
  const pair = FRIENDS[roundIdx % FRIENDS.length];
  const set = new Set(pair);
  // Random digits 1..9 that don't complete a 10 with anything already in set.
  while (set.size < 6) {
    const v = 1 + Math.floor(Math.random() * 9);
    let conflict = false;
    for (const existing of set) {
      if (existing + v === TARGET) { conflict = true; break; }
    }
    if (!conflict && !set.has(v)) set.add(v);
  }
  return shuffle([...set]);
}

function pairsFor(roundIdx) {
  const [a, b] = FRIENDS[roundIdx % FRIENDS.length];
  return [[a, b]];
}

// Body renders 6 boats in a 3x2 grid, plus a 10-slot bridge above that fills
// all at once on a correct pair.
function body(ctx) {
  const { k, round } = ctx;
  const values = round.candidates;

  // Bridge header — 10 empty wooden slots.
  for (let i = 0; i < TARGET; i++) {
    const x = 748 - (TARGET - 1) * 56 + i * 112;
    const y = 432;
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
  const gridY = 660;
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
  // When a correct pair is found, light up every bridge slot at once.
  onCorrect(ctx, a, b) {
    const k = ctx.k;
    // The bridge slots were created with the cream colour [255,250,240]
    // and a 3px ink outline. We tagged them with the string "bridge_slot" so
    // we can recolour safely without fishing through every node in the scene.
    const slots = k.get("bridge_slot", { recursive: true });
    slots.forEach((slot) => {
      slot.color = k.rgb(255, 213, 90);   // soft yellow
    });
    // Reward text — placed in a clear band between the bridge and the boats.
    const reward = k.add([
      k.text(`${a} + ${b} = ${a + b}！`, { size: 56, font: FONT }),
      k.color(...INK),
      k.pos(748, 540),
      k.anchor("center"),
    ]);
    window.PandaAudio.playCue("boat-pair");
    return reward;
  },
  roundEndCue: () => null,
  replayCue: () => null,
});
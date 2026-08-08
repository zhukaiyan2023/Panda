// scenes/gameCloud.js — hug a pair (cloud game from panda-park).
//
// Three rounds. Each round hides 2 or 3 valid friends-of-10 pairs inside 6
// clouds; the player must find every pair before the round ends. Distinct from
// boat because a single round demands multiple correct pairs.

import createPairScene, { shuffle } from "./pairScene.js";
import item from "../components/pickerItem.js";
import { INK, FONT, PINK } from "../components/theme.js";

const TARGET = 10;
const ROUND_PAIR_COUNT = [2, 3, 3];

const FRIENDS = [
  [1, 9], [2, 8], [3, 7], [4, 6], [5, 5],
  [6, 4], [7, 3], [8, 2], [9, 1],
];

// Each round hides a different number of pairs (escalating difficulty).
function candidatesFor(roundIdx) {
  const pairCount = ROUND_PAIR_COUNT[roundIdx] || 2;
  const pairs = [];
  const used = new Set();
  let attempts = 0;
  while (pairs.length < pairCount && attempts < 40) {
    attempts += 1;
    const [a, b] = FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (pairs.some((p) => `${Math.min(p[0], p[1])}-${Math.max(p[0], p[1])}` === key)) continue;
    if (used.has(a) || used.has(b)) continue;
    pairs.push([a, b]);
    used.add(a); used.add(b);
  }
  // Fill remaining cloud slots with non-conflicting distractors.
  const set = new Set();
  pairs.forEach((p) => p.forEach((v) => set.add(v)));
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
  const count = ROUND_PAIR_COUNT[roundIdx] || 2;
  const cands = candidatesFor(roundIdx);
  const pairs = [];
  for (let i = 0; i < cands.length && pairs.length < count; i++) {
    for (let j = i + 1; j < cands.length && pairs.length < count; j++) {
      if (cands[i] + cands[j] === TARGET) pairs.push([cands[i], cands[j]]);
    }
  }
  return pairs.slice(0, count);
}

function body(ctx) {
  const { k, round } = ctx;
  const cols = 3;
  const cellW = 280;
  const cellH = 220;
  const gridX = 748 - ((cols - 1) * cellW) / 2;
  const gridY = 680;

  // Tiny "found pairs" progress row above the grid.
  const total = round.pairs.length;
  for (let i = 0; i < total; i++) {
    k.add([
      k.rect(96, 36, { radius: 18 }),
      k.color(255, 213, 90),
      k.outline(3, k.rgb(...INK)),
      k.pos(748 - (total - 1) * 56 + i * 112, 500),
      k.anchor("center"),
    ]);
  }

  const items = [];
  round.candidates.forEach((v, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    items.push(item(k, { value: v, sprite: "cloud", x, y, size: 180 }));
  });
  ctx.items = items;
}

export default createPairScene({
  levelId: 2,
  sceneName: "gameCloud",
  introCue: "cloud-intro",
  roundCount: 3,
  target: TARGET,
  candidates: candidatesFor,
  pairs: pairsFor,
  prompt: () => "Find every pair that hugs to ten.",
  body,
  onCorrect(ctx, a, b) {
    // A pair found — float the chosen clouds upward briefly.
    const k = ctx.k;
    window.PandaAudio.playCue("cloud-pair");
    k.add([
      k.text(`${a} + ${b} = ${TARGET}!`, { size: 52, font: FONT }),
      k.color(...PINK),
      k.pos(748, 580),
      k.anchor("center"),
    ]);
  },
  roundEndCue: () => null,
  replayCue: () => null,
});
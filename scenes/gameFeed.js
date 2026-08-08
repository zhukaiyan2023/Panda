// scenes/gameFeed.js — feed the panda (panda.html from panda-park).
//
// 3 escalating rounds: 5 bubbles, 7 bubbles, 9 bubbles. Each round hides at
// least one friends-of-10 pair plus distractors. Picking a valid pair makes
// the panda "eat" — bubbles scale to 0, score increments. After 3 pairs the
// panda is "full" and the round ends.

import createPairScene, { shuffle } from "./pairScene.js";
import item from "../components/pickerItem.js";
import { INK, FONT, ORANGE } from "../components/theme.js";

const TARGET = 10;
const ROUND_COUNT = 3;
const BUBBLES_PER_ROUND = [5, 7, 9];

function buildCandidates(roundIdx) {
  const n = BUBBLES_PER_ROUND[Math.min(roundIdx, BUBBLES_PER_ROUND.length - 1)];
  // Always include exactly one valid pair so the round is solvable.
  const FRIENDS = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5], [6, 4], [7, 3], [8, 2], [9, 1]];
  const [a, b] = FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
  const set = new Set([a, b]);
  while (set.size < n) {
    const v = 1 + Math.floor(Math.random() * 9);
    if (set.has(v)) continue;
    let conflict = false;
    for (const existing of set) {
      if (existing + v === TARGET) { conflict = true; break; }
    }
    if (!conflict) set.add(v);
  }
  return shuffle([...set]);
}

function buildPairs(roundIdx) {
  const cands = buildCandidates(roundIdx);
  const pairs = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      if (cands[i] + cands[j] === TARGET) pairs.push([cands[i], cands[j]]);
    }
  }
  // Cap to 3 — the panda can only eat so many per round.
  return pairs.slice(0, 3);
}

function body(ctx) {
  const { k, round } = ctx;
  const n = round.candidates.length;

  // Bubbles in a row at the right; panda already on the left at (170, 640).
  const cellW = 130;
  const gridX = 540 - ((n - 1) * cellW) / 2;
  const gridY = 600;

  const items = [];
  round.candidates.forEach((v, i) => {
    const x = gridX + i * cellW;
    const y = gridY;
    items.push(item(k, { value: v, sprite: "bubble", x, y, size: 110 }));
  });
  ctx.items = items;

  // Score pill above the bubbles.
  k.add([
    k.rect(180, 64, { radius: 32 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(540, 460),
    k.anchor("center"),
  ]);
  const scoreText = k.add([
    k.text("0", { size: 40, font: FONT }),
    k.color(255, 255, 255),
    k.pos(540, 460),
    k.anchor("center"),
  ]);
  ctx.scoreText = scoreText;
  ctx.score = 0;
}

export default createPairScene({
  levelId: 3,
  sceneName: "gameFeed",
  introCue: "feed-intro",
  roundCount: ROUND_COUNT,
  target: TARGET,
  candidates: buildCandidates,
  pairs: buildPairs,
  prompt: () => "Help the panda eat. Pick two that make ten.",
  body,
  onCorrect(ctx, a, b) {
    ctx.score += 10;
    if (ctx.scoreText) ctx.scoreText.text = String(ctx.score);
    ctx.k.add([
      ctx.k.text(`${a} + ${b} = ${TARGET}!`, { size: 48, font: FONT }),
      ctx.k.color(...INK),
      ctx.k.pos(540, 540),
      ctx.k.anchor("center"),
    ]);
    window.PandaAudio.playCue("feed-nom");
  },
  // Each round advances silently; the only spoken cue is the very first
// intro when the session opens.
  roundEndCue: () => null,
  replayCue: () => null,
});
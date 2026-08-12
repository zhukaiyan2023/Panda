// scenes/gameFeed.js — feed the panda (panda.html from panda-park).
//
// 3 escalating rounds: 5 bubbles, 7 bubbles, 9 bubbles. Each round hides at
// least one friends-of-10 pair plus distractors. Picking a valid pair makes
// the panda "eat" — the two bubbles scale to 0 + fade, the score increments,
// and the equation text replaces itself (no stacking). After 3 pairs the
// panda is "full" and the round ends.

import createPairScene, { shuffle } from "./pairScene.js?v=20260812";
import item from "../components/pickerItem.js?v=20260812";
import { INK, FONT, ORANGE } from "../components/theme.js?v=20260812";

const TARGET = 10;
const ROUND_COUNT = 3;
const BUBBLES_PER_ROUND = [5, 7, 9];

const FRIENDS = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5], [6, 4], [7, 3], [8, 2], [9, 1]];

function buildCandidates(roundIdx) {
  const n = BUBBLES_PER_ROUND[Math.min(roundIdx, BUBBLES_PER_ROUND.length - 1)];
  const [a, b] = FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
  // Use a list + Map (not Set) so [5, 5] keeps BOTH 5s. The previous
  // Set-based version deduped them and produced an unsolvable round.
  const list = [a, b];
  const counts = new Map();
  list.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  while (list.length < n) {
    const v = 1 + Math.floor(Math.random() * 9);
    let conflict = false;
    for (const existing of counts.keys()) {
      if (existing + v === TARGET) { conflict = true; break; }
    }
    if (conflict) continue;
    // Don't add a value already in the list — for [5, 5] this would add
    // a third 5 and create extra wrong-pair possibilities (e.g. [5, 5, 5]
    // has three valid pairs).
    if (counts.has(v)) continue;
    list.push(v);
    counts.set(v, 1);
  }
  return shuffle(list);
}

function buildPairs(roundIdx, candidates) {
  // Derive pairs from the actual candidates shown this round — earlier
  // versions re-rolled their own candidate list, so a pair could be
  // advertised that wasn't actually on the board.
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[i] + candidates[j] === TARGET) pairs.push([candidates[i], candidates[j]]);
    }
  }
  // Cap to 3 — the panda can only eat so many per round.
  return pairs.slice(0, 3);
}

function body(ctx) {
  const { k, round } = ctx;
  const n = round.candidates.length;

  // Bubbles sit in a horizontal row to the right of the panda. pairScene
  // draws the panda at (170, 640) size 230 → right edge ≈ x=285, so we
  // start bubbles at x=380 (95 px gap). cellW 110 keeps all rounds
  // within the 1366-wide canvas:
  //   n=5: bubbles at x=380..820   (last extends to ~875)
  //   n=7: bubbles at x=380..1040  (last extends to ~1095)
  //   n=9: bubbles at x=380..1260  (last extends to ~1315, fits)
  // Earlier gridX 540-((n-1)*130)/2 had n=9 putting the first bubble at
  // x=20 — half of it off the left edge — and n=5/7 overlapped the panda.
  const cellW = 110;
  const gridX = 380;
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
  // Track the equation text so onCorrect can replace it (not stack it).
  ctx.eqText = null;
}

export default createPairScene({
  levelId: 4,
  sceneName: "gameFeed",
  introCue: "feed-intro",
  roundCount: ROUND_COUNT,
  target: TARGET,
  candidates: buildCandidates,
  pairs: buildPairs,
  prompt: () => "帮熊猫吃饱，选两个加起来是十。",
  body,
  onCorrect(ctx, a, b) {
    ctx.score += 10;
    if (ctx.scoreText) ctx.scoreText.text = String(ctx.score);

    // Eat animation: scale the two picked bubbles to 0 + fade out, with
    // a small offset between them so they don't vanish in lockstep.
    const itemA = ctx.items.find((it) => it.value === a);
    const itemB = ctx.items.find((it) => it.value === b);
    [itemA, itemB].forEach((it, i) => {
      if (!it) return;
      ctx.k.wait(i * 0.08, () => {
        const start = ctx.k.time();
        const dur = 0.5;
        it.node.onUpdate(() => {
          const dt = ctx.k.time() - start;
          if (dt > dur) {
            it.node.opacity = 0;
            it.node.onUpdate(() => {});
            return;
          }
          const t = dt / dur;
          it.node.scale = ctx.k.vec2(1 - t, 1 - t);
          it.node.opacity = 1 - t;
        });
      });
    });

    // Equation — replace the previous one so multiple correct picks in a
    // round don't stack on top of each other.
    if (ctx.eqText) ctx.eqText.destroy();
    ctx.eqText = ctx.k.add([
      ctx.k.text(`${a} + ${b} = ${TARGET}！`, { size: 48, font: FONT }),
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
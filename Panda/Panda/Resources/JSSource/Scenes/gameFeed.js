// scenes/gameFeed.js — feed the panda.
//
// The old implementation leaked a permanent `node.onUpdate()` handler for
// every eaten bubble. After several pair selections those handlers continued
// to run forever, and the leaked closures accumulated across scene changes.
// This version uses short-lived tweens instead and keeps the visual bubble
// size aligned with the actual 1024px bubble art.

import createPairScene from "./pairScene.js?v=20260812";
import item from "../components/pickerItem.js?v=20260813";
import expression from "../components/expression.js?v=20260812";
import { INK, FONT, ORANGE } from "../components/theme.js?v=20260812";
import {
  buildFeedRound,
  pairsOnBoard,
  targetFor,
  PAIRS_PER_ROUND,
} from "../data/feedRounds.js?v=20260814";

const ROUND_COUNT = 5;
const BOARD_X = 748;
const BOARD_Y = 640;
const CELL_W = 124;
// bubble.png / bubble-sel.png are 1024×1024. 0.105 => ~108 game px,
// leaving a real 16px gap inside the 124px cells.
const BUBBLE_SCALE = 0.105;

function buildQuestionCues(target) {
  const nId = `n-${target}`;
  if (window.PandaAudio?.audio?.["feed-q-pre"]) {
    return ["feed-q-pre", nId];
  }
  return ["feed-intro", nId];
}

function body(ctx) {
  const { k, round } = ctx;
  const target = targetFor(ctx.ri);
  const n = round.candidates.length;
  round.target = target;

  ctx.eqRoot = expression(k, {
    slots: ["□", "+", "□", "=", target],
    x: BOARD_X,
    y: 310,
    size: 110,
    boxMode: true,
  });

  k.add([
    k.text(`目标 ${target}`, { size: 32, font: FONT }),
    k.color(...INK),
    k.opacity(0.55),
    k.pos(BOARD_X, 420),
    k.anchor("center"),
  ]);

  const gridX = BOARD_X - ((n - 1) * CELL_W) / 2;
  ctx.items = round.candidates.map((value, i) => {
    const x = gridX + i * CELL_W;
    return item(k, {
      value,
      sprite: "bubble",
      x,
      y: BOARD_Y,
      size: 118,
      spriteScale: BUBBLE_SCALE,
      labelYOffset: -16,
      hideFace: true,
      noLabelBg: true,
      noLabelBgTextColor: [40, 40, 40],
      noLabelBgStrokeColor: [255, 255, 255],
      selectedSprite: "bubble-sel",
      selectedLift: 20,
    });
  });

  window.PandaAudio.stopAllAudio();
  window.PandaAudio.playSequence(buildQuestionCues(target), 90, 0);

  k.add([
    k.rect(160, 56, { radius: 28 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(1240, 196),
    k.anchor("center"),
  ]);
  ctx.scoreText = k.add([
    k.text("0", { size: 36, font: FONT }),
    k.color(255, 255, 255),
    k.pos(1240, 196),
    k.anchor("center"),
  ]);
  ctx.score = 0;
  ctx.eqText = null;
  ctx.pandaNode = ctx.buddy;
}

export default createPairScene({
  levelId: 4,
  sceneName: "gameFeed",
  introCue: "feed-intro",
  roundCount: ROUND_COUNT,
  target: targetFor(0),
  candidates: (roundIdx) => buildFeedRound(roundIdx).candidates,
  pairs: (roundIdx, candidates) =>
    pairsOnBoard(candidates, targetFor(roundIdx)).slice(0, PAIRS_PER_ROUND),
  prompt: () => "",
  body,

  onCorrect(ctx, a, b) {
    ctx.score += 10;
    if (ctx.scoreText) ctx.scoreText.text = String(ctx.score);

    const itemA = ctx.items.find((it) => it.value === a);
    const itemB = ctx.items.find((it) => it.value === b);

    if (ctx.pandaNode && itemA && itemB) {
      const pandaNode = ctx.pandaNode;
      const startX = pandaNode.pos.x;
      const startY = pandaNode.pos.y;
      const midX = startX + (((itemA.x + itemB.x) / 2) - startX) * 0.55;
      const midY = startY + (((itemA.y + itemB.y) / 2) - startY) * 0.55;

      ctx.k.tween(0, 1, 0.42, (v) => {
        if (!pandaNode.exists()) return;
        let x = startX;
        let y = startY;
        if (v < 0.16) {
          const f = v / 0.16;
          const ease = 1 - Math.pow(1 - f, 2);
          x = startX + (midX - startX) * ease;
          y = startY + (midY - startY) * ease;
        } else if (v < 0.60) {
          const w = (v - 0.16) / 0.44;
          x = midX + Math.sin(w * Math.PI * 6) * 8 * (1 - w);
          y = midY;
        } else {
          const w = (v - 0.60) / 0.40;
          const ease = w * w;
          x = midX + (startX - midX) * ease;
          y = midY + (startY - midY) * ease;
        }
        pandaNode.pos.x = x;
        pandaNode.pos.y = y;
      });
    }

    // Use finite tweens. Do NOT attach an onUpdate listener that replaces
    // itself with another listener when the item is already destroyed.
    for (const [it, delay] of [[itemA, 0], [itemB, 0.08]]) {
      if (!it) continue;
      ctx.k.wait(delay, () => {
        if (!it.node.exists()) return;
        ctx.k.tween(1, 0, 0.5, (v) => {
          if (!it.node.exists()) return;
          it.node.scale = ctx.k.vec2(v, v);
          it.node.opacity = v;
        });
      });
    }

    if (ctx.eqText) ctx.eqText.destroy();
    ctx.eqText = ctx.k.add([
      ctx.k.text(`${a} + ${b} = ${ctx.round.target}!`, { size: 48, font: FONT }),
      ctx.k.color(...INK),
      ctx.k.pos(BOARD_X, 540),
      ctx.k.anchor("center"),
    ]);
  },

  roundEndCue: () => null,
  replayCue: () => null,
});

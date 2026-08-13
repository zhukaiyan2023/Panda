// scenes/gameFeed.js — feed the panda (panda.html from panda-park).
//
// Dynamic-target variant of the original feed game. Each round the kid is
// shown a fresh target N (cycling 5→10 across rounds) as an equation
// "□ + □ = N" so the on-screen problem changes every round instead of
// always being "凑成十". Picking two bubbles whose digits sum to N makes
// the panda "eat" them — bubbles shrink/fade, the panda hops toward them
// with a chewing animation, and a new equation "a + b = N" flashes up.
//
// 3 escalating rounds: 5/7/9 bubbles. Each round hides at least one
// pair summing to N plus distractors. After 3 pairs the panda is "full"
// and the round ends. The round's target comes from TARGETS[roundIdx].
//
// Voice: per-round intro plays the chain "feed-q-pre + n-N" — e.g.
// "选两个加起来是七" — so the kid hears a distinct question for each
// target instead of one fixed prompt. feed-q-pre is a single new cue
// added to tools/cues.cjs (text: "选两个加起来是"); the per-target
// number comes from the existing n-N cues chained via playSequence.

import createPairScene, { shuffle } from "./pairScene.js?v=20260812";
import item from "../components/pickerItem.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import { INK, FONT, ORANGE } from "../components/theme.js?v=20260812";

// Targets per round — cycles 5 → 6 → 7 → 8 → 9 → 10. Round 0/1/2 see
// 5/6/7 then wrap to 8/9/10 if ROUND_COUNT > 3. Targets ≥ 5 give the
// kid at least 2 distinct unordered pairs (e.g. 7 → 1+6, 2+5, 3+4) so
// every round has multiple valid picks — same mechanic as the old
// fixed-10 version, just with a different sum per round.
const TARGETS = [5, 6, 7, 8, 9, 10];
const ROUND_COUNT = 3;
const BUBBLES_PER_ROUND = [5, 7, 9];

function targetFor(roundIdx) {
  return TARGETS[Math.min(roundIdx, TARGETS.length - 1)];
}

function buildCandidates(roundIdx) {
  const target = targetFor(roundIdx);
  const n = BUBBLES_PER_ROUND[Math.min(roundIdx, BUBBLES_PER_ROUND.length - 1)];

  // Pick a valid pair that fits the target (avoid [0, target] because
  // 0 + N is trivial and we want at least two non-trivial digits).
  // We try 1..target-1 for the smaller addend and pair it with
  // target - small — works for every target in TARGETS.
  const small = 1 + Math.floor(Math.random() * Math.max(1, target - 1));
  const big = target - small;
  const list = [small, big];
  const counts = new Map();
  list.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  while (list.length < n) {
    const v = 1 + Math.floor(Math.random() * 9);
    let conflict = false;
    for (const existing of counts.keys()) {
      if (existing + v === target) { conflict = true; break; }
    }
    if (conflict) continue;
    if (counts.has(v)) continue;
    list.push(v);
    counts.set(v, 1);
  }
  return shuffle(list);
}

function buildPairs(roundIdx, candidates) {
  const target = targetFor(roundIdx);
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[i] + candidates[j] === target) pairs.push([candidates[i], candidates[j]]);
    }
  }
  return pairs.slice(0, 3);
}

// Build the "选两个加起来是N" voice chain. Chained via playSequence so
// the leading phrase and the number read as one sentence. Falls back
// to feed-intro + n-N if the new feed-q-pre cue hasn't been built yet
// (so the game still speaks if someone runs an old audio manifest).
function buildQuestionCues(target) {
  const nId = `n-${target}`;
  if (window.PandaAudio?.audio?.["feed-q-pre"]) {
    return ["feed-q-pre", nId];
  }
  return ["feed-intro", nId];
}

function body(ctx) {
  const { k, round } = ctx;
  const n = round.candidates.length;
  const target = targetFor(ctx.ri);

  // Set the round's per-round target now that pairScene has already
  // built `round` — pairScene's tryPair reads ctx.round.target with
  // `?? config.target` fallthrough, so this overrides the session-wide
  // config.target for the dynamic-target comparison.
  round.target = target;

  // Bubbles sit in a horizontal row to the right of the panda, same
  // layout as the original Feed game so the panda-body size and
  // bubble positions stay familiar. cellW 110 keeps all rounds
  // within the 1366-wide canvas.
  const cellW = 110;
  const gridX = 380;
  const gridY = 600;

  const items = [];
  round.candidates.forEach((v, i) => {
    const x = gridX + i * cellW;
    const y = gridY;
    items.push(item(k, {
      value: v,
      sprite: "bubble",
      x, y, size: 110,
      spriteScale: 0.16,
      labelYOffset: -16,
      hideFace: true,
      noLabelBg: true,
      noLabelBgTextColor: [40, 40, 40],
      noLabelBgStrokeColor: [255, 255, 255],
    }));
  });
  ctx.items = items;

  // Equation card: big "□ + □ = N" header. Pinned to the upper portion
  // of the screen so the kid reads it before reaching for the bubbles.
  // The two box slots reserve width via the expression component so
  // the layout doesn't shift when a correct pick reveals them.
  // boxMode true renders "□" as outlined squares (per panda memory:
  // L1 uses "□" for unknowns since the 2026-08-11 user feedback —
  // "用这个方格子表示未知，不要用问号了"). Pass `k` as the parent
  // (not a wrapping node) — same pattern level1.js uses, so the
  // expression slots render directly on the scene canvas at the
  // given x/y.
  ctx.eqRoot = expression(k, {
    slots: ["□", "+", "□", "=", target],
    x: 540,
    y: 360,
    size: 110,
    boxMode: true,
  });

  // Voice prompt: chain "选两个加起来是" + n-target. Stops any audio
  // first so the prompt is the only thing the kid hears on entry —
  // the global single-active-audio invariant (panda memory) requires
  // exactly 0 or 1 audio playing at any moment.
  window.PandaAudio.stopAllAudio();
  window.PandaAudio.playSequence(buildQuestionCues(target), 90, 0);

  // Score pill above the bubbles (same look as the old Feed game).
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
  // Remember the panda so onCorrect can animate it. pairScene already
  // places the panda and exposes buddy via ctx.buddy — buddy IS the
  // panda root (panda.js returns root, with .body and .setMood
  // attached), so ctx.buddy.pos and ctx.buddy.body are the right refs.
  ctx.pandaNode = ctx.buddy;
}

export default createPairScene({
  levelId: 4,
  sceneName: "gameFeed",
  introCue: "feed-intro",
  roundCount: ROUND_COUNT,
  // session-wide fallback target — pairScene's tryPair reads
  // `ctx.round.target ?? config.target`, so the per-round override
  // set in body() wins for the actual pick comparison. config.target
  // is still used by other call sites (e.g. the initial cue lookup)
  // so we set it to the round-0 target as a sane default.
  target: targetFor(0),
  candidates: buildCandidates,
  pairs: buildPairs,
  // prompt is rendered by pairScene BEFORE body() runs, so round.target
  // isn't set yet — compute from round.index via targetFor().
  prompt: (round) => `选两个加起来是${targetFor(round.index)}`,
  body,
  onCorrect(ctx, a, b) {
    ctx.score += 10;
    if (ctx.scoreText) ctx.scoreText.text = String(ctx.score);

    // Panda hop: when a pair is picked, the panda lunges toward the
    // midpoint of the two bubbles, then bounces back. The hop runs in
    // parallel with the bubble-shrink animation so the visual reads as
    // "panda snatches both bubbles at once". Uses ctx.pandaRoot (set
    // in body) instead of reaching into the panda component's internals.
    const itemA = ctx.items.find((it) => it.value === a);
    const itemB = ctx.items.find((it) => it.value === b);
    let hopX = 0, hopY = 0;
    if (itemA && itemB) {
      const aPos = itemA.node.pos;
      const bPos = itemB.node.pos;
      hopX = (aPos.x + bPos.x) / 2;
      hopY = (aPos.y + bPos.y) / 2;
    }
    if (ctx.pandaNode) {
      const startX = ctx.pandaNode.pos.x;
      const startY = ctx.pandaNode.pos.y;
      const midX = startX + (hopX - startX) * 0.55;
      const midY = startY + (hopY - startY) * 0.55;
      // Use k.tween on a single phase value so we don't trample the
      // panda's breathing-bob onUpdate handler (panda.js owns that
      // handler — overwriting it would kill the bob for the rest of
      // the scene). The tween drives a 0..1 "phase" and we map it to
      // the lunge / chew / return path inside the callback.
      const totalDur = 0.42;
      ctx.k.tween(0, 1, totalDur, (v) => {
        // Phase map: 0..0.14 lunge (ease-out), 0.14..0.57 chew wiggle,
        // 0.57..1.0 ease-in return.
        let x, y;
        if (v < 0.14) {
          const f = v / 0.14;
          const ease = 1 - Math.pow(1 - f, 2);
          x = startX + (midX - startX) * ease;
          y = startY + (midY - startY) * ease;
        } else if (v < 0.57) {
          const w = (v - 0.14) / 0.43;
          // Sin-based wiggle that decays to 0 at the end of the chew.
          const wiggle = Math.sin(w * Math.PI * 6) * 8 * (1 - w);
          x = midX + wiggle;
          y = midY;
        } else {
          const w = (v - 0.57) / 0.43;
          const ease = w * w;
          x = midX + (startX - midX) * ease;
          y = midY + (startY - midY) * ease;
        }
        ctx.pandaNode.pos.x = x;
        ctx.pandaNode.pos.y = y;
      });
    }

    // Eat animation: scale the two picked bubbles to 0 + fade out, with
    // a small offset between them so they don't vanish in lockstep.
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
      ctx.k.text(`${a} + ${b} = ${ctx.round.target}！`, { size: 48, font: FONT }),
      ctx.k.color(...INK),
      ctx.k.pos(540, 540),
      ctx.k.anchor("center"),
    ]);
    window.PandaAudio.playCue("feed-nom");
  },
  // Each round advances silently; the per-round voice prompt is fired
  // inside body() so it lands at the start of every round, not just
  // round 0. pairScene's introCue is only used for round 0 — body()
  // handles rounds 1..N by calling playSequence itself.
  roundEndCue: () => null,
  replayCue: () => null,
});

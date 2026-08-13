// scenes/gameBounce.js — pop a balloon (bounce game from panda-park).
//
// Four balloons float on screen with a "a + ? = N" equation above them. N is
// not always 10 — the game teaches decomposition (a number can be split into
// two parts), not just make-ten. The kid reads the equation, finds the
// balloon whose number fills the ? so the pair sums to N, and pops it.
// Wrong taps shake and float away.
//
// This is the only single-pick game in the panda-park set, so it doesn't use
// the pairScene factory — a thin scene file is clearer than bending the pair
// protocol. The chrome (header, icon buttons, step bar, panda, save) is
// copied from pairScene; if a sixth pair-style game appears, factor it out.

import item from "../components/pickerItem.js?v=20260813";
import stepBar from "../components/stepBar.js?v=20260812";
import panda from "../components/panda.js?v=20260812";
import expression from "../components/expression.js?v=20260812";
import { iconButton } from "../components/choice.js?v=20260812";
import { INK, PAPER, FONT, PINK } from "../components/theme.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";

const ROUND_COUNT = 5;
// Each round uses a different target N (≤ 10) so the kid practices the
// general "a + ? = N" decomposition, not just the make-ten case. 5 rounds
// hit 5 different N values; the last slot is left as-is (no 11th).
const TARGETS = [7, 5, 9, 6, 8];

let roundIdx = 0;

function shuffle(arr) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// One balloon per candidate. The correct balloon is the unique v such that
// a + v === N. Distractors never form a second valid pair with a or with
// each other (i.e. no two distractor values sum to N either).
function buildCandidates() {
  const N = TARGETS[roundIdx % TARGETS.length];
  // Pick `a` deterministically from values that aren't the midpoint of N —
  // i.e. avoid `a === N/2`, which would make the correct answer equal the
  // visible addend (a "3 + ? = 6 → balloon 3" round reads as self-reference,
  // not as a real decomposition). For odd N every value in [1, N-1] is
  // valid; for even N we skip the midpoint.
  const validA = [];
  for (let v = 1; v < N; v++) {
    if (v !== N - v) validA.push(v);
  }
  const a = validA[roundIdx % validA.length];
  const correct = N - a;
  const set = new Set([correct]);
  let tries = 0;
  while (set.size < 4 && tries < 40) {
    tries += 1;
    const v = 1 + Math.floor(Math.random() * 9);
    if (set.has(v)) continue;
    // Reject v if it completes N with anything already in the set —
    // including the correct answer and the visible `a`. That guarantees
    // there is exactly one balloon that satisfies `a + v = N`.
    let conflict = false;
    for (const existing of set) {
      if (existing + v === N) { conflict = true; break; }
    }
    if (conflict) continue;
    if (a + v === N) continue;
    set.add(v);
  }
  return { a, N, candidates: shuffle([...set]), correct };
}

// Mirror pairScene.saveProgress: completing game `levelId` unlocks levelId+1
// and awards a star on levelId itself. (The previous hardcoded `2` and the
// starsByGame[1] increment never advanced the unlock chain past balloon —
// cloud stayed locked forever even after a perfect balloon run.)
function saveProgress(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, levelId + 1);
  save.starsByGame = save.starsByGame || {};
  save.starsByGame[levelId] = (save.starsByGame[levelId] || 0) + 1;
  window.PandaSave?.save(save);
}

function drawRound(k, ctx) {
  const { a, N, candidates, correct } = ctx.roundData;

  sceneBg(k, "bg-meadow");

  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => {
      roundIdx = 0;
      k.go("gamesPicker");
    },
  });

  const bar = stepBar(k, {
    labels: ["开始", "扎破它", "完成"],
    step: 1, x: 748, y: 84, w: 1060, h: 36,
  });

  k.add([
    k.text(`第 ${roundIdx + 1} 轮 / 共 ${ROUND_COUNT} 轮`, { size: 28, font: FONT }),
    k.color(...INK),
    k.pos(748, 230),
    k.anchor("center"),
  ]);

  const buddy = panda(k, { x: 170, y: 640, size: 230 });

  // The equation is the whole instruction: "a + ? = N". The kid reads the
  // left side, picks the balloon that fills the ?, and pops it. Without
  // showing `a` on screen, the kid has no way to know which balloon pairs
  // up — that's the bug we hit when testing.
  const eq = expression(k, {
    slots: [a, "+", "?", "=", N],
    x: 748, y: 400, size: 96,
  });

  // Short caption so the kid knows what to do with the equation (otherwise
  // it's just a math expression they may not connect to the balloons).
  // Positioned below the round counter (~y=230) with enough vertical room
  // that the caption cluster doesn't overlap the counter text.
  k.add([
    k.text(`扎破那个能凑成 ${N} 的气球！`, { size: 40, font: FONT }),
    k.color(...INK),
    k.opacity(0.85),
    k.pos(748, 300),
    k.anchor("center"),
  ]);

  // 4 balloons, alternating heights. Per user feedback 2026-08-09: no
  // card frame behind the balloon, and the number renders directly on the
  // pink body (not in a separate white circle). Matches
  // panda-park/bounce.html: balloon-shape with a chunky white num inside.
  const cols = 4;
  const cellW = 200;
  const gridX = 748 - ((cols - 1) * cellW) / 2;
  const gridY = 700;
  const items = [];
  candidates.forEach((v, i) => {
    const col = i % cols;
    const x = gridX + col * cellW;
    const y = gridY + (col % 2 ? -50 : 50);
    items.push(item(k, {
      value: v,
      sprite: "balloon",
      x,
      y,
      // Hit box 180×180 (matches gameCloud's default): the visible red ball
      // sits at scene y-77 from the item center (sprite-y 275 × 0.35 minus
      // the -16 anchor offset), so a 100×100 box centered at (x,y) misses
      // the top of the ball and the kid's tap on the body lands on empty
      // space — picks do nothing. 180 puts the body well inside the hit
      // rect; balloons are 200 px apart so 180×180 still leaves a 20 px
      // gap between adjacent hit boxes.
      size: 180,
      hideFace: true,     // no card frame around the balloon
      noLabelBg: true,    // no white circle around the digit
      // The balloon PNG is 443×899 (much taller than the old 200×240 SVG),
      // and the red body fills the upper ~520 px — body centre sits at
      // sprite-y ≈ 275. With the sprite anchored at (x, y-16) and scaled
      // 0.35, that body centre lands at scene y-77 ((275 - 449.5)·0.35 =
      // -61, plus -16). -77 places the digit at the body's vertical
      // centre so it sits in the middle of the balloon, not near the top.
      //
      // spriteScale 0.35 per user feedback 2026-08-13: 0.4 was still a
      // touch too big and left the digit off-centre because the label
      // offset above assumed the old 200×240 sprite. 0.35 → ~155 px
      // visible width; 200 - 155 = 45 px gap between adjacent centres,
      // and the hit target 100 stays a comfortable tap margin for small
      // fingers.
      spriteScale: 0.35,
      labelYOffset: -77,
    }));
  });

  // One-shot tap handler: first balloon the player taps is judged.
  let locked = false;
  items.forEach((it) => {
    const node = it.node;
    node.onClick(() => {
      if (locked) return;
      locked = true;
      if (it.value === correct) {
        it.setDisabled(true);
        window.PandaAudio.playCue("bounce-pop");
        buddy.setMood("cheer", { silent: true });
        bar.setStep(2);
        // Reveal the answer in the equation — replace "?" with the picked
        // balloon's number so the kid sees the pair they just completed.
        eq.destroy();
        expression(k, {
          slots: [a, "+", it.value, "=", N],
          x: 748, y: 400, size: 96,
          colors: [undefined, undefined, PINK, undefined, undefined],
        });
        // Wait for the "砰" pop sound to actually end before
        // navigating. playAfter hooks bounce-pop's `ended` event —
        // no k.wait guess needed (the old 1.6s could overlap if
        // bounce-pop lasted longer, and would cut "lvl-done" short
        // in the last round).
        if (roundIdx + 1 < ROUND_COUNT) {
          window.PandaAudio.playAfter(
            "bounce-pop",
            [],
            { gapMs: 0, seqGapMs: 0 },
            () => {
              roundIdx += 1;
              k.go("gameBounce");
            },
          );
        } else {
          saveProgress(2);  // gameBounce is levelId 2; unlocks cloud (id 3)
          window.PandaAudio.playAfter(
            "bounce-pop",
            ["lvl-done"],
            { gapMs: 0, seqGapMs: 0 },
            () => {
              roundIdx = 0;
              k.go("gamesPicker");
            },
          );
        }
      } else {
        it.shake();
        it.setDisabled(true);
        // Wrong — silent panda mood. The wrong-pick audio is fired by
        // pairScene-equivalent flow (pickWrongCue → enc-wrong-N); game
        // scenes inherit the silent-mode mood so the panda pose changes
        // without doubling the audio. The old "enc-try" cue that used
        // to fire from setMood("think") is GONE.
        buddy.setMood("think", { silent: true });
        locked = false;     // allow another try on the remaining balloons
      }
    });
  });
}

export default function scene(k) {
  if (roundIdx === 0) window.PandaAudio.playCue("bounce-intro");
  drawRound(k, { roundData: buildCandidates() });
}
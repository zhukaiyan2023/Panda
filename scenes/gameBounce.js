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
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260812";
import { celebrate } from "../components/celebration.js?v=20260812";
import { INK, PAPER, FONT, PINK } from "../components/theme.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";

const ROUND_COUNT = 5;
// Decomposition range: N ∈ [MIN_N, MAX_N], where N is the target the
// visible addend `a` plus the balloon's number must sum to. Min 2 = the
// simplest split (1+1, which we avoid via the midpoint filter below).
// Max 10 = the game's "凑十法 ceiling" — beyond that the pairing logic
// stops being intuitive for 3-6 year olds and overlaps with L2's make-
// ten pool. Pool size = 9 × ~5 valid `a`s each ≈ 50 distinct problems.
const MIN_N = 3;  // N=2 has no valid split (the only value v=1 is excluded by the midpoint filter 1 !== 1 fails). N=3+ keeps validA non-empty.
const MAX_N = 10;
// Memo of the last round's (N, a) so consecutive rounds never repeat.
// Without this, a kid playing 5 rounds could see the same problem twice
// in a row (small but real probability — ~2%). The retry loop caps at
// 20 to guarantee progress even with a tiny pool edge case.
let prevRoundKey = null;

let roundIdx = 0;
// Streak of consecutive correct picks this session — drives the tier
// escalation in tryAnswer. Resets on wrong pick or when the kid taps ←.
// Mirrors gameCloud's streak so a kid who clears L2 round 1 → L2 round 2
// (gameBounce is levelId 2 per saveProgress) on consecutive picks hears
// the streak3 tier on the second one, not a fresh "first" cue.
let streak = 0;
// Sticky flag flipped on the first wrong pick this session. Used by
// pickCheerCue to gate enc-streak5-1 ("你试了好几次才对，这叫有耐心")
// — its text only makes sense if the kid actually missed at least once.
// Never resets.
let hadWrongs = false;

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
  // Pick (N, a) randomly. Retry until we land on a key different from
  // last round so consecutive problems don't repeat. Keep N ≥ MIN_N so
  // validA is never empty (N=2 has only one valid split; N=1 has none).
  let N, a, key;
  let pickTries = 0;
  do {
    N = MIN_N + Math.floor(Math.random() * (MAX_N - MIN_N + 1));
    // Exclude the midpoint (v === N/2) because it makes the correct
    // answer equal the visible addend — a "3 + ? = 6 → balloon 3" round
    // reads as self-reference, not as a real decomposition.
    const validA = [];
    for (let v = 1; v < N; v++) {
      if (v !== N - v) validA.push(v);
    }
    a = validA[Math.floor(Math.random() * validA.length)];
    key = `${N}-${a}`;
    pickTries++;
    if (pickTries > 20) break;  // pool is large enough that this is unreachable
  } while (key === prevRoundKey);
  prevRoundKey = key;
  const correct = N - a;
  const set = new Set([correct]);
  let distractorTries = 0;
  while (set.size < 4 && distractorTries < 40) {
    distractorTries += 1;
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
      streak = 0;
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
      // Hit box 180 wide × 360 tall (was 180×180). The visible red ball
      // sits at scene y-77 from the item center (sprite-y 275 × 0.35 minus
      // the -16 anchor offset), and the sprite extends ±157 vertically at
      // scale 0.35 — the upper half of the balloon body lands ABOVE the
      // old hit box and taps there did nothing. 360 covers the full sprite
      // (top y-180, bottom y+180; sprite spans y-173 to y+141). Per
      // 2026-08-14 user feedback: kid's tap on the round body landed on
      // empty space above the hit box.
      //
      // Width stays 180 so balloons (200 px apart) keep a 20 px gap
      // between adjacent hit boxes. Adjacent rows alternate ±50 on y, so
      // the taller hit box overlaps across rows but never inside the same
      // row — picks remain unambiguous because each tap reads the body
      // position, not the row.
      size: 180,
      hitHeight: 360,
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
        // Streak escalates the encouragement chain — first pick of the
        // game fires the first tier ("enc-first-N → panda-praise-N" via
        // "level" path since this is single-pick), and consecutive
        // rounds keep climbing.
        streak += 1;
        // isRoundComplete drives the "level complete" tier (enc-level-N +
        // panda-cheer-N). It must flip on ONLY the last round — firing it
        // mid-session tells the kid "you're done" while rounds are still
        // queued, which is jarring. Each round has 1 pick, so "complete"
        // == "this was the last round of the session".
        const isRoundComplete = roundIdx + 1 >= ROUND_COUNT;
        const { chain, lastEncourageId, tier } = pickCheerCue({
          streak,
          isRoundComplete,
          levelId: 2,             // gameBounce is levelId 2; unlocks cloud (id 3)
          hasDiscovery: false,
          hadWrongs,
        });
        // Wait for "啵啵！" pop sound to actually end before the cheer
        // chain — playAfter hooks bounce-pop's `ended` event. The chain
        // itself plays in 200ms-gap sequence inside audio/praise.js.
        window.PandaAudio.playAfter("bounce-pop", chain, {
          gapMs: 200,
          seqGapMs: 200,
        });
        // Visual celebration anchored at the popped balloon — sparkles
        // and panda hop in parallel with the cheer chain. Mirrors
        // gameCloud's loop so both games feel equally alive.
        celebrate(k, {
          tier,
          anchor: { x: it.x, y: it.y },     // pickerItem descriptor's world position — see gameCount.js
          pandaBody: buddy?.body,
          pandaBaseSize: 230,
        });
        // After the cheer chain finishes, play the game-specific done
        // cue and navigate. The chain + bounce-done combo is the new
        // "yes!" moment — replaces the old single-cue "砰" loop.
        window.PandaAudio.playAfter(
          lastEncourageId,
          ["bounce-done"],
          { gapMs: 0, seqGapMs: 0 },
          () => {
            if (roundIdx + 1 < ROUND_COUNT) {
              roundIdx += 1;
              k.go("gameBounce");
            } else {
              // Last round — same chain as in-between, but mark progress
              // before navigating home. Reset roundIdx + streak so the
              // next session starts fresh.
              saveProgress(2);  // unlocks cloud (id 3)
              roundIdx = 0;
              streak = 0;
              k.go("gamesPicker");
            }
          },
        );
      } else {
        it.shake();
        it.setDisabled(true);
        buddy.setMood("think", { silent: true });
        // Wrong pick — fire an enc-wrong-N from the new tier system.
        // stopAllAudio before to be safe — wrong pick overlaps with any
        // pre-existing audio (rare, but a hint played on entry could
        // still be tail-firing). Mirrors gameCloud's wrong branch.
        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue(pickWrongCue({ isNearMiss: false }));
        streak = 0;
        // Sticky flag: any future streak-5 cue can now include
        // enc-streak5-1's "你试了好几次才对，这叫有耐心" line.
        hadWrongs = true;
        locked = false;     // allow another try on the remaining balloons
      }
    });
  });
}

export default function scene(k) {
  if (roundIdx === 0) window.PandaAudio.playCue("bounce-intro");
  drawRound(k, { roundData: buildCandidates() });
}
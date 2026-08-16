// scenes/gameCount.js — 一眼识数 (subitize / instant number recognition).
//
// A 2x5 ten-frame grid shows 1-10 dots. The kid reads the number at a glance
// — no counting allowed (well, the rounds are short enough that counting is
// the slow path). The dots fill left-to-right, top-to-bottom with no gaps, so
// the canonical patterns (5 = full row, 10 = full grid) become familiar.
//
// 3 rounds per session. Distractor numbers are +1/-1/+2 of the correct answer
// with random signs, so the answer choices cluster around the right number
// rather than including 1 and 10 as "obviously wrong" anchors. Quantity
// sampling is weighted — 6-10 appear ~2x as often as 1-5, because that's the
// range where kids tend to over-estimate "lots" without recognizing the exact
// count.
//
// Pattern follows the other panda-park games: sceneChrome + per-round draw,
// pickCheerCue / pickWrongCue for audio, celebrate() for visuals, standard
// saveProgress() on completion.

import tenFrame from "../components/tenFrame.js?v=20260812";
import item from "../components/pickerItem.js?v=20260813";
import panda from "../components/panda.js?v=20260812";
import sceneBg from "../components/sceneBg.js?v=20260812";
import { iconButton } from "../components/choice.js?v=20260812";
import { pickCheerCue, pickWrongCue } from "../audio/praise.js?v=20260812";
import { celebrate } from "../components/celebration.js?v=20260812";
import { INK, FONT, ORANGE } from "../components/theme.js?v=20260812";

// 3 rounds per session — short by design, subitize is a fast-recall skill
// where the kid benefits more from seeing varied patterns than from grinding
// long sessions.
const ROUND_COUNT = 3;

// Quantity pool. 1-5 each appear once; 6-10 each appear twice. Sampling this
// uniformly gives 6-10 a 2x frequency over 1-5, matching the design where
// kids need more practice on the "more than 5" range where exact count
// recognition tends to break down.
const POOL = [1, 2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];

// 4 options per round: the correct number + 3 distractors. Each wrong answer
// is `correct + sign * d` where sign in {-1, +1} and d in {1, 2, 3}. The
// offset range is ±3 (not just ±2) because correct=1 and correct=10 only
// have 2 neighbours within ±2 (a 3-distractor round would otherwise have
// to fall back to far-away values), and ±3 is still "nearby" for a 3-6 yo.
// Pool is small enough (10 numbers) that picking 3 nearby unique wrongs is
// always possible for any correct ∈ [1, 10].
function pickWrongs(correct) {
  const taken = new Set([correct]);
  const wrongs = [];
  const tried = new Set();
  let attempts = 0;
  while (wrongs.length < 3 && attempts < 60) {
    const sign = Math.random() < 0.5 ? -1 : 1;
    const d = 1 + Math.floor(Math.random() * 3);  // 1, 2, or 3
    const key = `${sign}-${d}`;
    if (tried.has(key)) { attempts++; continue; }
    tried.add(key);
    const w = correct + sign * d;
    if (w >= 1 && w <= 10 && !taken.has(w)) {
      wrongs.push(w);
      taken.add(w);
    }
    attempts++;
  }
  // Deterministic fallback — guaranteed to fill (correct ∈ [1, 10] always
  // has at least 3 neighbours in [1, 10] once we walk ±1, ±2, ±3).
  if (wrongs.length < 3) {
    for (const d of [1, 2, 3]) {
      for (const sign of [-1, 1]) {
        const w = correct + sign * d;
        if (wrongs.length >= 3) break;
        if (w >= 1 && w <= 10 && !taken.has(w)) {
          wrongs.push(w);
          taken.add(w);
        }
      }
    }
  }
  return wrongs;
}

function buildRound() {
  const count = POOL[Math.floor(Math.random() * POOL.length)];
  const wrongs = pickWrongs(count);
  const choices = [...wrongs, count];
  // Fisher-Yates shuffle so the correct answer isn't always at the same end.
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { count, choices, correct: count };
}

// Mirror pairScene.saveProgress: completing game `levelId` unlocks levelId+1
// and awards a star on levelId itself. gameCount is levelId 6 — at the time
// of writing it's the last game, so levelId+1 = 7 unlocks nothing. Kept
// matching the convention so adding a 7th game later is a one-line change.
function saveProgress(levelId) {
  const save = window.PandaSave?.load() || { unlockedLevel: 1, starsByLevel: {} };
  save.unlockedGame = Math.max(save.unlockedGame || 1, levelId + 1);
  save.starsByGame = save.starsByGame || {};
  save.starsByGame[levelId] = (save.starsByGame[levelId] || 0) + 1;
  window.PandaSave?.save(save);
}

let roundIdx = 0;
// Streak of consecutive correct picks across this game's session — drives
// the process-praise tier in onPick. Resets on wrong pick or when the kid
// taps ←. Lives on the scene closure so it persists across rounds of one
// play-through. Mirrors the streak pattern in gameBounce / gameCloud.
let streak = 0;
// Sticky flag flipped on the first wrong pick this session. Used by
// pickCheerCue to gate enc-streak5-1 ("你试了好几次才对，这叫有耐心")
// — its text only makes sense if the kid actually missed at least once.
let hadWrongs = false;

export default function scene(k) {
  // Audio: play the intro every round, not just round 0. The other panda-park
  // games skip the intro on rounds 2+ because the equation reads naturally as
  // a recap ("a + ? = N" stays the same), but 一眼识数 has a no-equation
  // design — the prompt "一眼看是几？" alone doesn't tell the kid what to do
  // with the grid. Replaying the intro each round keeps the mechanic explicit
  // without depending on a per-round contextual cue. With 3 rounds the
  // repetition is short-lived; if the round count grows we can revisit.
  window.PandaAudio.playCue("count-intro");

  const round = buildRound();

  sceneBg(k, "bg-meadow");

  // Back button — same chrome as the other panda-park games.
  iconButton(k, {
    label: "←", x: 84, y: 92, w: 96, h: 72, fontSize: 44,
    onClick: () => {
      roundIdx = 0;
      streak = 0;
      k.go("gamesPicker");
    },
  });

  // Round counter pill (top-right).
  const pillW = 240;
  const pillH = 64;
  const pillX = k.width() - 84 - pillW / 2;
  const pillY = 110;
  k.add([
    k.rect(pillW, pillH, { radius: 18 }),
    k.color(255, 255, 255),
    k.outline(4, k.rgb(...ORANGE)),
    k.pos(pillX, pillY),
    k.anchor("center"),
    k.z(2),
  ]);
  k.add([
    k.text(`第 ${roundIdx + 1} 轮 / 共 ${ROUND_COUNT} 轮`, { size: 26, font: FONT }),
    k.color(...ORANGE),
    k.pos(pillX, pillY),
    k.anchor("center"),
    k.z(2),
  ]);

  // Prompt — the kid's instruction. "一眼看是几" emphasises the no-count
  // reading: the answer should be a glance, not a tally.
  k.add([
    k.text("一眼看是几？", { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(k.width() / 2, 270),
    k.anchor("center"),
  ]);

  // The ten-frame itself. dots fill left-to-right, top-to-bottom with no
  // gaps — that's the subitize affordance: the kid sees canonical patterns
  // (5 = one full row, 10 = full grid) rather than random scatter.
  const frame = tenFrame(k, round.count, {
    x: k.width() / 2,
    y: 500,
    rows: 2,
    cell: 110,
    gap: 10,
    showLabel: false,    // the answer is the option row, not a label on the grid
    dot: "orange",
  });

  // 4 number options across the bottom. Reuse pickerItem so the wrong pick
  // gets the same shake + disable animation as the other games.
  const COLS = 4;
  const cellW = 160;
  const cellH = 140;
  const gridX = k.width() / 2 - ((COLS - 1) * cellW) / 2;
  const gridY = 820;
  const items = [];
  round.choices.forEach((v, i) => {
    const x = gridX + i * cellW;
    items.push(item(k, {
      value: v,
      x,
      y: gridY,
      size: 140,
      // Hide the prop sprite — option buttons are pure number cards, no
      // balloon/cloud sprite. hideFace skips the orange ring artifact and
      // the default sprite prop, leaving the standard numbered card face.
      hideFace: false,
    }));
  });

  // Panda greeter at the bottom-left, same position as the other panda-park
  // games. setMood("idle") is the default — success path flips to "cheer",
  // wrong path flips to "think" (silent, see below).
  const buddy = panda(k, { x: 170, y: 940, size: 180 });
  buddy.setMood("idle");

  // Click wiring. State lives on the closure so the handler can mutate
  // `locked` (one-shot per round) and reference the item array without
  // rebuilding anything.
  let locked = false;
  items.forEach((it) => {
    it.node.onClick(() => {
      if (locked) return;
      locked = true;
      if (it.value === round.correct) {
        // Correct path — mirror gameBounce's tier-chain + celebrate + unwind.
        it.setDisabled(true);
        buddy.setMood("cheer", { silent: true });
        window.PandaAudio.playCue("count-pair");
        streak += 1;
        // isRoundComplete drives the "level complete" tier in the audio
        // chain (enc-level-N + panda-cheer-N). It must flip on ONLY the last
        // round — firing it on round 1/2 tells the kid "you're done" while
        // 2 rounds are still queued, which is jarring. Each round has 1
        // pick, so "complete" == "this was the last round of the session".
        const isRoundComplete = roundIdx + 1 >= ROUND_COUNT;
        const { chain, lastEncourageId, tier } = pickCheerCue({
          streak,
          isRoundComplete,
          levelId: 6,               // gameCount levelId 6
          hasDiscovery: false,
          hadWrongs,
        });
        // Chain the celebration audio off the count-pair cue so the kid
        // hears "对啦" land before the encouragement tier.
        window.PandaAudio.playAfter("count-pair", chain, {
          gapMs: 200,
          seqGapMs: 200,
        });
        celebrate(k, {
          tier,
          anchor: { x: it.node.pos.x, y: it.node.pos.y },
          pandaBody: buddy?.body,
          pandaBaseSize: 180,
        });
        // After the cheer chain finishes, advance. The "count-done" cue
        // ("全做完啦") is only meaningful after the LAST round — hearing it
        // before round 2 would tell the kid "you're done" when there are
        // still rounds left, which is jarring. Match gameBounce's pattern:
        // mid-session rounds advance silently, the final round plays the
        // done cue alongside the level-complete cheer.
        const isLastRound = roundIdx + 1 >= ROUND_COUNT;
        const postChainCues = isLastRound ? ["count-done"] : [];
        window.PandaAudio.playAfter(
          lastEncourageId,
          postChainCues,
          { gapMs: 0, seqGapMs: 0 },
          () => {
            if (!isLastRound) {
              roundIdx += 1;
              k.go("gameCount");
            } else {
              saveProgress(6);
              roundIdx = 0;
              streak = 0;
              k.go("gamesPicker");
            }
          },
        );
      } else {
        // Wrong path — shake + grey out + enc-wrong cue. Mirrors gameBounce's
        // wrong branch exactly so the audio/visual feedback is consistent
        // across all panda-park games.
        it.shake();
        it.setDisabled(true);
        buddy.setMood("think", { silent: true });
        window.PandaAudio.stopAllAudio();
        window.PandaAudio.playCue(pickWrongCue());
        streak = 0;
        hadWrongs = true;
        locked = false;   // allow retry on the remaining options
      }
    });
  });
}

// scenes/gameBounce.js — pop a balloon (bounce game from panda-park).
//
// Four balloons float on screen; one carries the missing addend (so that
// a + balloon = 10). Tap the right one and it pops; wrong taps shake and
// float away. Five rounds.
//
// This is the only single-pick game in the panda-park set, so it doesn't use
// the pairScene factory — a thin scene file is clearer than bending the pair
// protocol. The chrome (header, icon buttons, step bar, panda, save) is
// copied from pairScene; if a sixth pair-style game appears, factor it out.

import item from "../components/pickerItem.js";
import stepBar from "../components/stepBar.js";
import panda from "../components/panda.js";
import { iconButton } from "../components/choice.js";
import { INK, PAPER, FONT, PINK } from "../components/theme.js";

const TARGET = 10;
const ROUND_COUNT = 5;
const ENCOURAGE = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];

let roundIdx = 0;

function shuffle(arr) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// One balloon per candidate. The correct answer is the unique value v such
// that the implied `a = 10 - v` doesn't pair with any other candidate.
function buildCandidates() {
  // Deterministic-ish rotation so a 3-6 year old sees varied numbers.
  const a = 2 + ((roundIdx * 3 + 1) % 7);   // 2..8
  const correct = TARGET - a;
  const set = new Set([correct]);
  let tries = 0;
  while (set.size < 4 && tries < 40) {
    tries += 1;
    const v = 1 + Math.floor(Math.random() * 9);
    if (set.has(v)) continue;
    let conflict = false;
    for (const existing of set) {
      if (existing + v === TARGET) { conflict = true; break; }
    }
    if (!conflict) set.add(v);
  }
  return { a, candidates: shuffle([...set]), correct };
}

function saveProgress() {
  const save = window.PandaSave?.load() || {};
  const next = {
    ...save,
    unlockedGame: Math.max(save.unlockedGame || 1, 2),
    starsByGame: {
      ...(save.starsByGame || {}),
      1: ((save.starsByGame || {})[1] || 0) + 1,
    },
  };
  window.PandaSave?.save(next);
}

function drawRound(k, ctx) {
  const { a, candidates, correct } = ctx.roundData;

  k.add([k.rect(k.width(), k.height()), k.color(...PAPER), k.z(-10)]);

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
    k.pos(748, 196),
    k.anchor("center"),
  ]);

  const buddy = panda(k, { x: 170, y: 640, size: 230 });

  k.add([
    k.text(`扎破那个能凑成十的气球！`, { size: 56, font: FONT }),
    k.color(...INK),
    k.pos(748, 310),
    k.anchor("center"),
  ]);

  // 4 balloons, alternating heights.
  const cols = 4;
  const cellW = 240;
  const gridX = 748 - ((cols - 1) * cellW) / 2;
  const gridY = 720;
  const items = [];
  candidates.forEach((v, i) => {
    const col = i % cols;
    const x = gridX + col * cellW;
    const y = gridY + (col % 2 ? -50 : 50);
    items.push(item(k, { value: v, sprite: "balloon", x, y, size: 170 }));
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
        k.add([
          k.text(`${a} + ${it.value} = ${TARGET}！`, { size: 64, font: FONT }),
          k.color(...PINK),
          k.pos(748, 540),
          k.anchor("center"),
        ]);
        k.wait(1.6, () => {
          if (roundIdx + 1 < ROUND_COUNT) {
            roundIdx += 1;
            k.go("gameBounce");
          } else {
            saveProgress();
            window.PandaAudio.playCue("lvl-done");
            roundIdx = 0;
            k.go("gamesPicker");
          }
        });
      } else {
        it.shake();
        it.setDisabled(true);
        // Wrong — just the panda mood (which plays enc-try) and a shake.
        buddy.setMood("think");
        locked = false;     // allow another try on the remaining balloons
      }
    });
  });
}

export default function scene(k) {
  if (roundIdx === 0) window.PandaAudio.playCue("bounce-intro");
  drawRound(k, { roundData: buildCandidates() });
}
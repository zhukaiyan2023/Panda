// components/whackHole.js — one hole + its mole + answer as ONE visual unit.
// The answer is printed directly on the mole body. Each mole now has
// a complete autonomous life cycle: emerge from the hole, peek/bob,
// retreat into the hole, then reappear with a randomized rhythm.

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";

const HOLE_SCALE = 0.20;
const MOLE_SCALE = 0.14;
const MOLE_Y_OFFSET = -50;
const NUMBER_OFFSET_X = 0;
const NUMBER_OFFSET_Y = -8;
const NUMBER_SIZE = 46;

const POP_DUR = 0.58;
const RETREAT_DUR = 0.56;
const SHAKE_DUR = 0.34;
const FLASH_DUR = 0.38;
const BOB_AMP = 8;
const BOB_FREQ = (2 * Math.PI) / 1.45;
const POP_TRAVEL = 180;
const INITIAL_DELAY_MIN = 0.04;
const INITIAL_DELAY_MAX = 0.42;
const VISIBLE_HOLD_MIN = 1.15;
const VISIBLE_HOLD_MAX = 2.35;
const REAPPEAR_DELAY_MIN = 0.18;
const REAPPEAR_DELAY_MAX = 0.75;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export default function whackHole(k, { x, y, variant }) {
  const v = ((variant % 3) + 3) % 3;

  const hole = k.add([
    k.sprite(`mole-hole-${v + 1}`),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(HOLE_SCALE),
    k.z(2),
  ]);

  const mole = k.add([
    k.sprite("mole-1"),
    k.pos(x, y + MOLE_Y_OFFSET + POP_TRAVEL),
    k.anchor("center"),
    k.scale(MOLE_SCALE),
    k.opacity(0),
    k.area(),
    k.z(1),
  ]);

  // The answer is part of the mole's body, not a separate badge/card.
  // It keeps a fixed local offset and follows the same position/scale/opacity
  // as the mole during emerge, bob, shake, hit and retreat.
  const num = k.add([
    k.text("0", {
      size: NUMBER_SIZE,
      font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif",
    }),
    k.color(...YELLOW),
    k.outline(4, k.rgb(...INK)),
    k.pos(x + NUMBER_OFFSET_X, y + MOLE_Y_OFFSET + POP_TRAVEL + NUMBER_OFFSET_Y),
    k.anchor("center"),
    k.opacity(0),
    k.z(3),
  ]);

  let occupied = false;
  let value = null;
  let cancelBob = null;
  let cancelAnimation = null;
  let cycleToken = 0;
  let suppressAutoCycle = false;

  function cancelBobFn() {
    if (cancelBob) {
      cancelBob.cancel();
      cancelBob = null;
    }
  }

  function cancelAnimationFn() {
    if (cancelAnimation) {
      cancelAnimation.cancel();
      cancelAnimation = null;
    }
  }

  // Mole and answer share exactly one transform state. There is no second
  // answer-card layout to drift independently from the mole.
  function syncUnit() {
    const visible = mole.opacity;
    const overlayScale = mole.scale.x / MOLE_SCALE;

    num.pos.x = mole.pos.x + NUMBER_OFFSET_X;
    num.pos.y = mole.pos.y + NUMBER_OFFSET_Y;
    num.scale = k.vec2(overlayScale, overlayScale);
    num.opacity = visible;
  }

  function setUnitOpacity(opacity) {
    mole.opacity = opacity;
    num.opacity = opacity;
  }

  function hideUnit() {
    setUnitOpacity(0);
  }

  function showUnit() {
    setUnitOpacity(1);
    syncUnit();
  }

  function scheduleNextAppearance(answer, token) {
    if (suppressAutoCycle) return;
    const delay = randomBetween(REAPPEAR_DELAY_MIN, REAPPEAR_DELAY_MAX);
    k.wait(delay, () => {
      if (token !== cycleToken || suppressAutoCycle) return;
      popUp(answer);
    });
  }

  function beginPop(valueToShow, token) {
    if (token !== cycleToken || suppressAutoCycle && occupied) return;

    occupied = true;
    value = valueToShow;
    num.text = String(valueToShow);
    num.color = k.rgb(...YELLOW);

    const variantIdx = 1 + Math.floor(Math.random() * 6);
    mole.use(k.sprite(`mole-${variantIdx}`));
    mole.scale = k.vec2(MOLE_SCALE, MOLE_SCALE);

    const startY = y + MOLE_Y_OFFSET + POP_TRAVEL;
    const endY = y + MOLE_Y_OFFSET;
    mole.pos.x = x;
    mole.pos.y = startY;
    showUnit();

    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      const t = (k.time() - t0) / POP_DUR;
      if (t >= 1) {
        mole.pos.y = endY;
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        startBob();

        // The mole does not wait forever anymore. It hides on its own,
        // forcing the child to watch and react instead of having an idle
        // target parked on screen for the whole question.
        const hold = randomBetween(VISIBLE_HOLD_MIN, VISIBLE_HOLD_MAX);
        const holdToken = cycleToken;
        k.wait(hold, () => {
          if (holdToken !== cycleToken || !occupied || suppressAutoCycle) return;
          retreat({ recycle: true, answer: value });
        });
        return;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      mole.pos.y = startY + (endY - startY) * ease;
      syncUnit();
    });
  }

  function popUp(valueToShow) {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const token = cycleToken;

    // Do not make all six moles rise at exactly the same frame. A tiny
    // randomized delay gives the board a playful "something is happening"
    // rhythm while keeping the rules simple for young children.
    const delay = randomBetween(INITIAL_DELAY_MIN, INITIAL_DELAY_MAX);
    k.wait(delay, () => {
      if (token !== cycleToken || suppressAutoCycle) return;
      beginPop(valueToShow, token);
    });
  }

  function startBob() {
    cancelBobFn();
    const baseY = y + MOLE_Y_OFFSET;
    const t0 = k.time();
    cancelBob = mole.onUpdate(() => {
      if (!occupied) {
        cancelBobFn();
        return;
      }
      const t = k.time() - t0;
      mole.pos.y = baseY - Math.sin(t * BOB_FREQ) * BOB_AMP;
      syncUnit();
    });
  }

  function retreat({ recycle = false, answer = null } = {}) {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const retreatToken = cycleToken;

    occupied = false;
    const nextAnswer = answer ?? value;
    value = null;

    const startY = mole.pos.y;
    const endY = y + MOLE_Y_OFFSET + POP_TRAVEL;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      const t = (k.time() - t0) / RETREAT_DUR;
      if (t >= 1) {
        mole.pos.y = endY;
        syncUnit();
        hideUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        if (recycle && !suppressAutoCycle && nextAnswer != null) {
          scheduleNextAppearance(nextAnswer, retreatToken);
        }
        return;
      }
      const ease = t * t;
      mole.pos.y = startY + (endY - startY) * ease;
      setUnitOpacity(1 - t);
      syncUnit();
    });
  }

  function setSelected(on) {
    // Selecting a mole means the child is interacting with THIS target.
    // Freeze its autonomous cycle until the question is rebuilt.
    suppressAutoCycle = on;
    num.color = k.rgb(...(on ? ORANGE : YELLOW));
  }

  function flashCorrect() {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const flashToken = cycleToken;

    const startScale = MOLE_SCALE;
    const peakScale = MOLE_SCALE * 1.42;
    const baseY = mole.pos.y;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      if (flashToken !== cycleToken) return;
      const t = (k.time() - t0) / FLASH_DUR;
      if (t >= 1) {
        mole.scale = k.vec2(startScale, startScale);
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        retreat();
        return;
      }
      const bell = Math.sin(Math.min(t / 0.6, 1) * Math.PI);
      const s = startScale + (peakScale - startScale) * bell;
      mole.scale = k.vec2(s, s);
      mole.pos.y = baseY;
      syncUnit();
    });
  }

  function shake() {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const shakeToken = cycleToken;
    const baseX = x;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      if (shakeToken !== cycleToken) return;
      const t = (k.time() - t0) / SHAKE_DUR;
      if (t >= 1) {
        mole.pos.x = baseX;
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        // Keep the wrong answer visible for the current question. The game
        // round controller decides when the new question is ready.
        return;
      }
      const amp = 12 * (1 - t);
      mole.pos.x = baseX + Math.sin(t * 60) * amp;
      syncUnit();
    });
  }

  return {
    x,
    y,
    variant: v,
    mole,
    popUp,
    retreat,
    setSelected,
    flashCorrect,
    shake,
    isOccupied: () => occupied,
    getValue: () => value,
  };
}

// components/whackHole.js — one hole + one large mole + its number.
// Designed as a readable children's whack-a-mole target:
// 1) the hole stays behind the mole instead of covering it;
// 2) the mole is large enough to read at a glance;
// 3) the answer is printed directly on the mole's belly;
// 4) appearances follow a predictable staggered rhythm, not six random timers.

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";

const HOLE_SCALE = 0.265;
const MOLE_SCALE = 0.215;
const MOLE_Y_OFFSET = -72;
const NUMBER_OFFSET_X = 0;
const NUMBER_OFFSET_Y = 22;
const NUMBER_SIZE = 58;

const POP_DUR = 0.46;
const RETREAT_DUR = 0.44;
const SHAKE_DUR = 0.30;
const FLASH_DUR = 0.34;
const BOB_AMP = 5;
const BOB_FREQ = (2 * Math.PI) / 1.55;
const POP_TRAVEL = 150;

// Fixed slot rhythm. The six holes are intentionally choreographed rather
// than independently randomized, so a child can learn the visual beat.
const STAGGER_BY_SLOT = [0.00, 0.24, 0.48, 0.72, 0.96, 1.20];
const HOLD_BY_SLOT = [1.55, 1.65, 1.55, 1.65, 1.55, 1.65];
const RECYCLE_GAP = 0.22;

function slotDelay(slotIndex) {
  return STAGGER_BY_SLOT[slotIndex % STAGGER_BY_SLOT.length] || 0;
}

export default function whackHole(k, { x, y, variant, slotIndex = 0 }) {
  const v = ((variant % 3) + 3) % 3;
  const slot = ((slotIndex % 6) + 6) % 6;

  // Hole is a BACK layer. The mole sits above it so its head/body is never
  // accidentally clipped by the hole sprite. The mole already retreats to
  // the hidden position when it goes down.
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
    k.z(4),
  ]);

  // Large, high-contrast answer printed directly on the mole's belly.
  // The yellow fill + dark outline stays readable across different mole skins.
  const num = k.add([
    k.text("0", {
      size: NUMBER_SIZE,
      font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif",
    }),
    k.color(...YELLOW),
    k.outline(6, k.rgb(...INK)),
    k.pos(x + NUMBER_OFFSET_X, y + MOLE_Y_OFFSET + POP_TRAVEL + NUMBER_OFFSET_Y),
    k.anchor("center"),
    k.opacity(0),
    k.z(5),
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

  function syncUnit() {
    const visible = mole.opacity;
    const localScale = mole.scale.x / MOLE_SCALE;
    num.pos.x = mole.pos.x + NUMBER_OFFSET_X;
    num.pos.y = mole.pos.y + NUMBER_OFFSET_Y;
    num.scale = k.vec2(localScale, localScale);
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
          const token = retreatToken;
          k.wait(RECYCLE_GAP + slotDelay(slot), () => {
            if (token !== cycleToken || suppressAutoCycle) return;
            popUp(nextAnswer, true);
          });
        }
        return;
      }
      // Strong ease-in means the mole visibly disappears into the hole.
      const ease = t * t * t;
      mole.pos.y = startY + (endY - startY) * ease;
      setUnitOpacity(1 - t);
      syncUnit();
    });
  }

  function beginPop(valueToShow, token) {
    if (token !== cycleToken || suppressAutoCycle) return;

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

        const hold = HOLD_BY_SLOT[slot];
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

  function popUp(valueToShow, immediate = false) {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const token = cycleToken;

    const delay = immediate ? 0 : slotDelay(slot);
    k.wait(delay, () => {
      if (token !== cycleToken || suppressAutoCycle) return;
      beginPop(valueToShow, token);
    });
  }

  function setSelected(on) {
    suppressAutoCycle = on;
    num.color = k.rgb(...(on ? ORANGE : YELLOW));
  }

  function flashCorrect() {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const flashToken = cycleToken;

    const startScale = MOLE_SCALE;
    const peakScale = MOLE_SCALE * 1.32;
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
        return;
      }
      const amp = 14 * (1 - t);
      mole.pos.x = baseX + Math.sin(t * 70) * amp;
      syncUnit();
    });
  }

  return {
    x,
    y,
    variant: v,
    slotIndex: slot,
    hole,
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

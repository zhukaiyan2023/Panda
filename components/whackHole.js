// components/whackHole.js — a large, readable whack-a-mole target.
// The visual treatment intentionally follows the new kid-friendly whack-a-mole
// art direction: oversized cartoon mole, deep dirt hole, and a large number
// printed directly on the mole's belly. Motion is a deterministic pop → hold
// → retreat loop so the board has a learnable rhythm instead of random drift.

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";

const MOLE_SCALE = 0.43;
const HOLE_SCALE = 0.48;
const MOLE_Y_OFFSET = -82;
const POP_TRAVEL = 170;
const NUMBER_OFFSET_Y = 50;
const NUMBER_SIZE = 76;

const POP_DUR = 0.46;
const HOLD_DUR = 1.60;
const RETREAT_DUR = 0.44;
const CYCLE_GAP = 0.68;
const SHAKE_DUR = 0.30;
const FLASH_DUR = 0.36;
const BOB_AMP = 5;
const BOB_FREQ = (2 * Math.PI) / 1.55;

// One fixed beat per slot. Every slot uses the same cycle duration after
// startup, so the stagger never drifts after 5–10 rounds.
const STAGGER = [0.00, 0.24, 0.48, 0.72, 0.96, 1.20];

let artLoadPromise = null;

function ensureWhackArt(k) {
  if (!artLoadPromise) {
    artLoadPromise = Promise.all([
      ["whack-mole-blue", "assets/art/whack-mole-blue.svg?v=20260815"],
      ["whack-mole-orange", "assets/art/whack-mole-orange.svg?v=20260815"],
      ["whack-mole-green", "assets/art/whack-mole-green.svg?v=20260815"],
      ["whack-hole", "assets/art/whack-hole.svg?v=20260815"],
    ].map(([name, url]) => Promise.resolve(k.loadSprite(name, url))))
      .catch((err) => console.warn("[whackHole] art preload failed:", err));
  }
  return artLoadPromise;
}

function moleSpriteName(slot) {
  return ["whack-mole-blue", "whack-mole-orange", "whack-mole-green"][slot % 3];
}

export default function whackHole(k, { x, y, variant = 0, slotIndex = 0 }) {
  const slot = ((slotIndex % 6) + 6) % 6;

  // Hole is always behind the mole. The mole retreats deep enough into the
  // hole that the hidden state looks like it actually went underground.
  const hole = k.add([
    k.sprite("mole-hole-1"),
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

  // Large number lives on the belly, not as a floating badge.
  const num = k.add([
    k.text("0", {
      size: NUMBER_SIZE,
      font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif",
    }),
    k.color(255, 255, 255),
    k.outline(7, k.rgb(...INK)),
    k.pos(x, y + MOLE_Y_OFFSET + POP_TRAVEL + NUMBER_OFFSET_Y),
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
    const localScale = mole.scale.x / MOLE_SCALE;
    num.pos.x = mole.pos.x;
    num.pos.y = mole.pos.y + NUMBER_OFFSET_Y;
    num.scale = k.vec2(localScale, localScale);
    num.opacity = mole.opacity;
  }

  function setUnitOpacity(opacity) {
    mole.opacity = opacity;
    num.opacity = opacity;
  }

  function hideUnit() {
    setUnitOpacity(0);
    mole.pos.x = x;
    mole.pos.y = y + MOLE_Y_OFFSET + POP_TRAVEL;
    syncUnit();
  }

  function startBob() {
    cancelBobFn();
    const baseY = y + MOLE_Y_OFFSET;
    const t0 = k.time();
    cancelBob = mole.onUpdate(() => {
      if (!occupied) return;
      const t = k.time() - t0;
      mole.pos.y = baseY - Math.sin(t * BOB_FREQ) * BOB_AMP;
      syncUnit();
    });
  }

  function retreat({ recycle = false, answer = null } = {}) {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const token = cycleToken;
    occupied = false;
    const nextAnswer = answer ?? value;
    value = null;

    const startY = mole.pos.y;
    const endY = y + MOLE_Y_OFFSET + POP_TRAVEL;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      if (token !== cycleToken) return;
      const t = (k.time() - t0) / RETREAT_DUR;
      if (t >= 1) {
        mole.pos.y = endY;
        setUnitOpacity(0);
        cancelAnimation.cancel();
        cancelAnimation = null;
        if (recycle && !suppressAutoCycle && nextAnswer != null) {
          const nextToken = cycleToken;
          k.wait(CYCLE_GAP, () => {
            if (nextToken !== cycleToken || suppressAutoCycle) return;
            popUp(nextAnswer, true);
          });
        }
        return;
      }
      const ease = t * t * (3 - 2 * t);
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

    const artName = moleSpriteName(slot + variant);
    const art = k.getSprite(artName);
    if (art) mole.use(k.sprite(artName));

    mole.scale = k.vec2(MOLE_SCALE, MOLE_SCALE);
    mole.pos.x = x;
    mole.pos.y = y + MOLE_Y_OFFSET + POP_TRAVEL;
    setUnitOpacity(1);
    syncUnit();

    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      if (token !== cycleToken) return;
      const t = (k.time() - t0) / POP_DUR;
      if (t >= 1) {
        mole.pos.y = y + MOLE_Y_OFFSET;
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        startBob();

        const holdToken = cycleToken;
        k.wait(HOLD_DUR, () => {
          if (holdToken !== cycleToken || !occupied || suppressAutoCycle) return;
          retreat({ recycle: true, answer: value });
        });
        return;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      mole.pos.y = (y + MOLE_Y_OFFSET + POP_TRAVEL) +
        ((y + MOLE_Y_OFFSET) - (y + MOLE_Y_OFFSET + POP_TRAVEL)) * ease;
      syncUnit();
    });
  }

  function popUp(valueToShow, immediate = false) {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const token = cycleToken;
    const delay = immediate ? 0 : STAGGER[slot];
    k.wait(delay, () => {
      if (token !== cycleToken || suppressAutoCycle) return;
      beginPop(valueToShow, token);
    });
  }

  function setSelected(on) {
    suppressAutoCycle = on;
    num.color = k.rgb(...(on ? ORANGE : [255, 255, 255]));
    if (on) {
      mole.color = k.rgb(255, 220, 165);
    } else {
      mole.color = k.rgb(255, 255, 255);
    }
  }

  function flashCorrect() {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const token = cycleToken;
    const baseScale = MOLE_SCALE;
    const peakScale = MOLE_SCALE * 1.18;
    const baseY = mole.pos.y;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      if (token !== cycleToken) return;
      const t = (k.time() - t0) / FLASH_DUR;
      if (t >= 1) {
        mole.scale = k.vec2(baseScale, baseScale);
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        retreat();
        return;
      }
      const bell = Math.sin(Math.min(t, 1) * Math.PI);
      const s = baseScale + (peakScale - baseScale) * bell;
      mole.scale = k.vec2(s, s);
      mole.pos.y = baseY;
      syncUnit();
    });
  }

  function shake() {
    cancelBobFn();
    cancelAnimationFn();
    cycleToken += 1;
    const token = cycleToken;
    const baseX = x;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      if (token !== cycleToken) return;
      const t = (k.time() - t0) / SHAKE_DUR;
      if (t >= 1) {
        mole.pos.x = baseX;
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        return;
      }
      mole.pos.x = baseX + Math.sin(t * Math.PI * 12) * 13 * (1 - t);
      syncUnit();
    });
  }

  // Swap to the new art as soon as the SVG assets finish loading. This keeps
  // the component safe during the initial scene boot while letting the new
  // illustration actually become the live game art.
  ensureWhackArt(k).then(() => {
    if (k.getSprite("whack-hole")) hole.use(k.sprite("whack-hole"));
    if (k.getSprite(moleSpriteName(slot + variant))) {
      mole.use(k.sprite(moleSpriteName(slot + variant)));
    }
  });

  return {
    x,
    y,
    variant,
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

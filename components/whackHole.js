// components/whackHole.js — one hole + its mole + answer as ONE visual unit.
// The answer is rendered as a transform-synced overlay of the mole.

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";

const HOLE_SCALE = 0.20;
const MOLE_SCALE = 0.14;
const MOLE_Y_OFFSET = -50;
const BADGE_OFFSET_X = 0;
const BADGE_OFFSET_Y = -50;
const BADGE_RADIUS = 28;
const NUMBER_SIZE = 36;

const POP_DUR = 1.0;
const RETREAT_DUR = 0.8;
const SHAKE_DUR = 0.5;
const FLASH_DUR = 0.5;
const BOB_AMP = 12;
const BOB_FREQ = (2 * Math.PI) / 1.6;
const POP_TRAVEL = 180;

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

  const badge = k.add([
    k.circle(BADGE_RADIUS),
    k.color(...YELLOW),
    k.outline(3, k.rgb(...INK)),
    k.pos(x, y + MOLE_Y_OFFSET + POP_TRAVEL + BADGE_OFFSET_Y),
    k.anchor("center"),
    k.opacity(0),
    k.z(3),
  ]);

  const num = k.add([
    k.text("0", { size: NUMBER_SIZE, font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif" }),
    k.color(...INK),
    k.pos(x, y + MOLE_Y_OFFSET + POP_TRAVEL + BADGE_OFFSET_Y),
    k.anchor("center"),
    k.opacity(0),
    k.z(4),
  ]);

  let occupied = false;
  let value = null;
  let cancelBob = null;
  let cancelAnimation = null;

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

  // Mole, badge and number share ONE transform state. Every frame derives
  // the answer's position, scale and opacity from the mole itself.
  function syncUnit() {
    const visible = mole.opacity;
    const overlayScale = mole.scale.x / MOLE_SCALE;

    badge.pos.x = mole.pos.x + BADGE_OFFSET_X;
    badge.pos.y = mole.pos.y + BADGE_OFFSET_Y;
    num.pos.x = badge.pos.x;
    num.pos.y = badge.pos.y;

    badge.scale = k.vec2(overlayScale, overlayScale);
    num.scale = k.vec2(overlayScale, overlayScale);
    badge.opacity = visible;
    num.opacity = visible;
  }

  function setUnitOpacity(opacity) {
    mole.opacity = opacity;
    badge.opacity = opacity;
    num.opacity = opacity;
  }

  function hideUnit() {
    setUnitOpacity(0);
  }

  function showUnit() {
    setUnitOpacity(1);
    syncUnit();
  }

  function popUp(v_) {
    cancelBobFn();
    cancelAnimationFn();

    occupied = true;
    value = v_;
    num.text = String(v_);

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
        return;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      mole.pos.y = startY + (endY - startY) * ease;
      syncUnit();
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

  function retreat() {
    cancelBobFn();
    cancelAnimationFn();

    occupied = false;
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
        return;
      }
      const ease = t * t;
      mole.pos.y = startY + (endY - startY) * ease;
      setUnitOpacity(1 - t);
      syncUnit();
    });
  }

  function setSelected(on) {
    badge.color = k.rgb(...(on ? ORANGE : YELLOW));
  }

  function flashCorrect() {
    cancelBobFn();
    cancelAnimationFn();

    const startScale = MOLE_SCALE;
    const peakScale = MOLE_SCALE * 1.4;
    const baseY = mole.pos.y;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
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
    const baseX = x;
    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      const t = (k.time() - t0) / SHAKE_DUR;
      if (t >= 1) {
        mole.pos.x = baseX;
        syncUnit();
        cancelAnimation.cancel();
        cancelAnimation = null;
        startBob();
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

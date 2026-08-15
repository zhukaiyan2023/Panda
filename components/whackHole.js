// components/whackHole.js — one hole + its mole + answer badge for gameWhack.
// The mole and answer badge are treated as one visual unit: all movement,
// hiding/showing, bobbing and retreat operations update both together.
//
// When useBakedSprite=true, the mole sprite is swapped to a pre-baked
// "mole + number on belly" asset (one image = one visual unit). The
// badge/num elements are skipped and replaced with an outline overlay
// that signals the selected state.

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";
import { spriteName } from "../data/whackPack.js?v=20260815";

const HOLE_SCALE = 0.20;
const MOLE_SCALE = 0.14;
const MOLE_Y_OFFSET = -50;
const BADGE_OFFSET_X = 0;
const BADGE_OFFSET_Y = -50; // relative to mole center
const BADGE_RADIUS = 28;
const OUTLINE_SIZE = 180;

const POP_DUR = 1.0;
const RETREAT_DUR = 0.8;
const SHAKE_DUR = 0.5;
const FLASH_DUR = 0.5;
const BOB_AMP = 12;
const BOB_FREQ = (2 * Math.PI) / 1.6;
const POP_TRAVEL = 180;

export default function whackHole(k, { x, y, variant, useBakedSprite = false }) {
  const v = ((variant % 6) + 6) % 6;  // 0..5 for baked sprite variant

  const hole = k.add([
    k.sprite(`mole-hole-${(v % 3) + 1}`),  // 3 hole variants
    k.pos(x, y),
    k.anchor("center"),
    k.scale(HOLE_SCALE),
    k.z(2),
  ]);

  const mole = k.add([
    k.sprite("mole-1"),  // placeholder; popUp() will use the real one
    k.pos(x, y + MOLE_Y_OFFSET + POP_TRAVEL),
    k.anchor("center"),
    k.scale(MOLE_SCALE),
    k.opacity(0),
    k.area(),
    k.z(1),
  ]);

  // Outline overlay for the selected state in baked-sprite mode. Created
  // up front but invisible until setSelected(true).
  let outline = null;
  if (useBakedSprite) {
    outline = k.add([
      k.rect(OUTLINE_SIZE, OUTLINE_SIZE, { radius: 30 }),
      k.outline(4, k.rgb(...ORANGE)),
      k.color(255, 255, 255),
      k.opacity(0),
      k.pos(x, y + MOLE_Y_OFFSET),
      k.anchor("center"),
      k.z(0),
    ]);
  }

  // Legacy badge + num (only when NOT using baked sprites).
  let badge = null;
  let num = null;
  if (!useBakedSprite) {
    badge = k.add([
      k.circle(BADGE_RADIUS),
      k.color(...YELLOW),
      k.outline(3, k.rgb(...INK)),
      k.pos(x, y + MOLE_Y_OFFSET + BADGE_OFFSET_Y),
      k.anchor("center"),
      k.opacity(0),
      k.z(3),
    ]);
    num = k.add([
      k.text("0", { size: 36, font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif" }),
      k.color(...INK),
      k.pos(x, y + MOLE_Y_OFFSET + BADGE_OFFSET_Y),
      k.anchor("center"),
      k.opacity(0),
      k.z(4),
    ]);
  }

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

  function syncBadge() {
    if (useBakedSprite) {
      if (outline) {
        outline.pos.x = mole.pos.x;
        outline.pos.y = mole.pos.y;
      }
      return;
    }
    if (badge && num) {
      badge.pos.x = mole.pos.x + BADGE_OFFSET_X;
      badge.pos.y = mole.pos.y + BADGE_OFFSET_Y;
      num.pos.x = badge.pos.x;
      num.pos.y = badge.pos.y;
    }
  }

  function hideVisual() {
    mole.opacity = 0;
    if (outline) outline.opacity = 0;
    if (badge) badge.opacity = 0;
    if (num) num.opacity = 0;
  }

  function showVisual() {
    mole.opacity = 1;
    if (outline) outline.opacity = 0;  // outline stays hidden until selected
    if (badge) badge.opacity = 1;
    if (num) num.opacity = 1;
  }

  function popUp(v_) {
    cancelBobFn();
    cancelAnimationFn();

    occupied = true;
    value = v_;

    if (useBakedSprite) {
      // Swap the mole sprite to the baked "mole + number on belly" image.
      mole.use(k.sprite(spriteName(v + 1, v_)));
    } else {
      num.text = String(v_);
      const variantIdx = 1 + Math.floor(Math.random() * 6);
      mole.use(k.sprite(`mole-${variantIdx}`));
    }

    const startY = y + MOLE_Y_OFFSET + POP_TRAVEL;
    const endY = y + MOLE_Y_OFFSET;
    mole.pos.x = x;
    mole.pos.y = startY;
    syncBadge();
    showVisual();

    const t0 = k.time();
    cancelAnimation = mole.onUpdate(() => {
      const t = (k.time() - t0) / POP_DUR;
      if (t >= 1) {
        mole.pos.y = endY;
        syncBadge();
        cancelAnimation.cancel();
        cancelAnimation = null;
        startBob();
        return;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      mole.pos.y = startY + (endY - startY) * ease;
      syncBadge();
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
      syncBadge();
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
        syncBadge();
        hideVisual();
        cancelAnimation.cancel();
        cancelAnimation = null;
        return;
      }
      const ease = t * t;
      mole.pos.y = startY + (endY - startY) * ease;
      // Keep the number attached while the mole sinks.
      syncBadge();
      // Fade the complete unit together during retreat.
      const opacity = 1 - t;
      mole.opacity = opacity;
      if (outline && outline.opacity > 0) outline.opacity = opacity;
      if (badge) badge.opacity = opacity;
      if (num) num.opacity = opacity;
    });
  }

  function setSelected(on) {
    if (useBakedSprite) {
      if (outline) outline.opacity = on ? 1 : 0;
    } else if (badge) {
      badge.color = k.rgb(...(on ? ORANGE : YELLOW));
    }
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
        syncBadge();
        cancelAnimation.cancel();
        cancelAnimation = null;
        retreat();
        return;
      }
      const bell = Math.sin(Math.min(t / 0.6, 1) * Math.PI);
      const s = startScale + (peakScale - startScale) * bell;
      mole.scale = k.vec2(s, s);
      mole.pos.y = baseY;
      syncBadge();
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
        syncBadge();
        cancelAnimation.cancel();
        cancelAnimation = null;
        startBob();
        return;
      }
      const amp = 12 * (1 - t);
      mole.pos.x = baseX + Math.sin(t * 60) * amp;
      syncBadge();
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

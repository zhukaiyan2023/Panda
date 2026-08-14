// components/whackHole.js — one hole + its mole for gameWhack.
//
// Each hole owns four kaplay entities: a hole sprite (one of 3 AI variants),
// a mole sprite that pops up from below the rim, a yellow badge circle for
// the candidate-answer number, and the digit text. z-order: hole(z=2) over
// mole(z=1) so the grass rim covers the mole's lower body, head pokes above.
//
// Animation timings (slow for 3-6 year olds):
//   popUp      0.6s ease-out, idle bob ±4px / 1.6s
//   retreat    0.4s ease-in
//   flashCorrect  0.5s (scale pulse + halo) then retreat
//   shake      0.5s (horizontal jitter, ±12 then ±8)
//
// API:
//   whackHole(k, { x, y, variant }) → hole
//   hole.popUp(value)        — slow rise + show number, idle bob
//   hole.retreat()           — sink back, opacity fade
//   hole.setSelected(on)     — badge yellow → orange
//   hole.flashCorrect()      — scale pulse + halo + retreat (call once per correct)
//   hole.shake()             — horizontal jitter (call once per wrong)
//   hole.isOccupied()        — true while a mole is up
//   hole.getValue()          — current number on the badge, or null

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";

// Sprite scale notes (2026-08-15):
//   task-4 generated the 6 ink moles (mole-1..mole-6.png) at cutout
//   bounding boxes 527-749×634-806, and the 3 holes (mole-hole-1..3.png)
//   at 762-783×397-647. The brief's plan assumed 1024×1024 mole + 1248×832
//   hole sprites, with MOLE_SCALE=0.16 / HOLE_SCALE=0.20 producing ~164×164
//   moles and ~250×166 holes. With the actual cutout sizes those constants
//   would yield only ~84-120 px wide moles (less than half the intended
//   on-screen size, too small to read at iPad-arm's-length). Bumped
//   MOLE_SCALE to 0.24 → 126-180 px wide moles, kept HOLE_SCALE at 0.20.
//
//   Final-review screenshot (2026-08-15) caught overlap that earlier per-
//   task reviews missed: at MOLE_SCALE=0.24 the mole heads at y=GRID_Y0
//   +MOLE_Y_OFFSET=420 land exactly on the hint text
//   "点中头顶是答案的地鼠" at y=420, completely covering it and brushing
//   the bottom of the equation at y=320 — unreadable for a 3-6 year-old.
//   Reduced MOLE_SCALE to 0.18 → ~95-135 px wide × ~114-145 px tall moles.
//   Smaller mole body means the head no longer reaches up into the hint
//   row. HOLE_SCALE stays at 0.20 → ~152-157 px wide holes — the planar
//   762-783 px source ratio means 0.20 already reads correctly.
const HOLE_SCALE = 0.20;     // 762-783×397-647 source → ~152-157 wide
const MOLE_SCALE = 0.18;     // 527-749×634-806 source → ~95-135 wide (reduced 0.24→0.18 to fit 3x2 grid + clear hint text)
const MOLE_Y_OFFSET = -120;  // head peeks ~120px above hole rim
const BADGE_Y_OFFSET = -150; // badge sits on the forehead
const BADGE_RADIUS = 28;

// Animation tunables (seconds).
const POP_DUR = 0.6;
const RETREAT_DUR = 0.4;
const SHAKE_DUR = 0.5;
const FLASH_DUR = 0.5;
const BOB_AMP = 4;
const BOB_FREQ = (2 * Math.PI) / 1.6;  // ω for 1.6s period

export default function whackHole(k, { x, y, variant }) {
  const v = ((variant % 3) + 3) % 3;  // clamp variant to 0..2

  // Hole sprite (AI ink-grass variant).
  const hole = k.add([
    k.sprite(`mole-hole-${v + 1}`),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(HOLE_SCALE),
    k.z(2),
  ]);

  // Mole sprite, starts hidden below rim.
  const mole = k.add([
    k.sprite("mole-1"),  // placeholder variant; popUp swaps to a random variant
    k.pos(x, y + MOLE_Y_OFFSET + 60),  // start 60px below pop position
    k.anchor("center"),
    k.scale(MOLE_SCALE),
    k.opacity(0),
    k.z(1),
  ]);

  // Number badge + digit on the mole's forehead.
  const badge = k.add([
    k.circle(BADGE_RADIUS),
    k.color(...YELLOW),
    k.outline(3, k.rgb(...INK)),
    k.pos(x, y + BADGE_Y_OFFSET),
    k.anchor("center"),
    k.opacity(0),
    k.z(3),
  ]);
  const num = k.add([
    k.text("0", { size: 36, font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif" }),
    k.color(...INK),
    k.pos(x, y + BADGE_Y_OFFSET),
    k.anchor("center"),
    k.opacity(0),
    k.z(4),
  ]);

  let occupied = false;
  let value = null;
  let cancelBob = null;

  function cancelBobFn() {
    if (cancelBob) { cancelBob(); cancelBob = null; }
  }

  function popUp(v_) {
    occupied = true;
    value = v_;
    num.text = String(v_);

    // Random mole variant for visual variety (1..6).
    const variantIdx = 1 + Math.floor(Math.random() * 6);
    mole.use(k.sprite(`mole-${variantIdx}`));

    // Tween rise + fade in.
    const startY = y + MOLE_Y_OFFSET + 60;
    const endY = y + MOLE_Y_OFFSET;
    const t0 = k.time();
    let popHandler = mole.onUpdate(() => {
      const t = (k.time() - t0) / POP_DUR;
      if (t >= 1) {
        mole.pos.y = endY;
        mole.opacity = 1;
        badge.opacity = 1;
        num.opacity = 1;
        popHandler.cancel();
        startBob();
        return;
      }
      const ease = 1 - Math.pow(1 - t, 3);  // ease-out cubic
      mole.pos.y = startY + (endY - startY) * ease;
      mole.opacity = ease;
      badge.opacity = ease;
      num.opacity = ease;
    });
  }

  function startBob() {
    cancelBobFn();
    const baseY = y + MOLE_Y_OFFSET;
    const t0 = k.time();
    cancelBob = mole.onUpdate(() => {
      if (!occupied) { cancelBobFn(); return; }
      const t = k.time() - t0;
      mole.pos.y = baseY - Math.sin(t * BOB_FREQ) * BOB_AMP;
    });
  }

  function retreat() {
    cancelBobFn();
    occupied = false;
    value = null;
    const startY = mole.pos.y;
    const endY = y + MOLE_Y_OFFSET + 60;
    const t0 = k.time();
    let handler = mole.onUpdate(() => {
      const t = (k.time() - t0) / RETREAT_DUR;
      if (t >= 1) {
        mole.pos.y = endY;
        mole.opacity = 0;
        badge.opacity = 0;
        num.opacity = 0;
        handler.cancel();
        return;
      }
      const ease = t * t;  // ease-in quad
      mole.pos.y = startY + (endY - startY) * ease;
      mole.opacity = 1 - ease;
      badge.opacity = 1 - ease;
      num.opacity = 1 - ease;
    });
  }

  function setSelected(on) {
    badge.color = k.rgb(...(on ? ORANGE : YELLOW));
  }

  function flashCorrect() {
    cancelBobFn();
    const startScale = MOLE_SCALE;
    const peakScale = MOLE_SCALE * 1.4;
    const baseY = mole.pos.y;
    const t0 = k.time();
    let handler = mole.onUpdate(() => {
      const t = (k.time() - t0) / FLASH_DUR;
      if (t >= 1) {
        mole.scale = k.vec2(startScale, startScale);
        handler.cancel();
        retreat();
        return;
      }
      // Bell curve: peak at t=0.3.
      const bell = Math.sin(Math.min(t / 0.6, 1) * Math.PI);
      const s = startScale + (peakScale - startScale) * bell;
      mole.scale = k.vec2(s, s);
      mole.pos.y = baseY;
    });
  }

  function shake() {
    const baseX = x;
    const t0 = k.time();
    let handler = mole.onUpdate(() => {
      const t = (k.time() - t0) / SHAKE_DUR;
      if (t >= 1) {
        mole.pos.x = baseX;
        handler.cancel();
        return;
      }
      // Decaying sine: amp 12 → 8 → 0.
      const amp = 12 * (1 - t);
      mole.pos.x = baseX + Math.sin(t * 60) * amp;
    });
  }

  return {
    x, y,
    variant: v,
    popUp,
    retreat,
    setSelected,
    flashCorrect,
    shake,
    isOccupied: () => occupied,
    getValue: () => value,
  };
}

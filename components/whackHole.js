// components/whackHole.js
// One complete whack-a-mole target: hole + mole + number are treated as one
// visual unit. The unit owns its position, animation token, value and input
// state so the number can never drift away from the mole.

import { INK, YELLOW, ORANGE } from "./theme.js?v=20260815";

const MOLE_SCALE = 0.46;
const HOLE_SCALE = 0.48;
const HIDDEN_OFFSET = 150;
const NUMBER_Y = 58;
const NUMBER_SIZE = 78;

const POP_SECONDS = 0.48;
const HOLD_SECONDS = 1.22;
const RETREAT_SECONDS = 0.46;
const BOB_SECONDS = 1.55;
const BOB_AMPLITUDE = 5;

const ART = [
  "whack-mole-blue",
  "whack-mole-orange",
  "whack-mole-green",
];

let artPromise = null;

function ensureArt(k) {
  if (!artPromise) {
    artPromise = Promise.all([
      ["whack-mole-blue", "assets/art/whack-mole-blue.svg?v=20260816"],
      ["whack-mole-orange", "assets/art/whack-mole-orange.svg?v=20260816"],
      ["whack-mole-green", "assets/art/whack-mole-green.svg?v=20260816"],
      ["whack-hole", "assets/art/whack-hole.svg?v=20260816"],
    ].map(([name, url]) => Promise.resolve(k.loadSprite(name, url))))
      .catch((error) => console.warn("[whack] art load failed", error));
  }
  return artPromise;
}

function safeCancel(handle) {
  if (!handle) return;
  try { handle.cancel(); } catch (_) { /* animation already finished */ }
}

export default function whackHole(k, {
  x,
  y,
  slotIndex = 0,
  variant = 0,
}) {
  const colorIndex = Math.abs((slotIndex + variant) % ART.length);

  // The hole is a BACK layer. Nothing here can cover the visible mole.
  const hole = k.add([
    k.sprite("mole-hole-1"),
    k.pos(x, y + 36),
    k.anchor("center"),
    k.scale(HOLE_SCALE),
    k.z(2),
  ]);

  // Everything that moves belongs to this root. The number is a child of the
  // same root, so movement, scale and visibility are mathematically shared.
  const unit = k.add([
    k.pos(x, y - HIDDEN_OFFSET),
    k.anchor("center"),
    k.z(4),
  ]);

  const mole = unit.add([
    k.sprite("mole-1"),
    k.pos(0, 0),
    k.anchor("center"),
    k.scale(MOLE_SCALE),
  ]);

  const numberStroke = unit.add([
    k.text("0", {
      size: NUMBER_SIZE,
      font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif",
    }),
    k.color(...INK),
    k.pos(0, NUMBER_Y + 5),
    k.anchor("center"),
    k.z(2),
  ]);

  const number = unit.add([
    k.text("0", {
      size: NUMBER_SIZE,
      font: "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif",
    }),
    k.color(255, 255, 255),
    k.pos(0, NUMBER_Y),
    k.anchor("center"),
    k.z(3),
  ]);

  // Use the new art as soon as it is available. The current frame keeps a
  // harmless fallback sprite until the async load finishes.
  ensureArt(k).then(() => {
    if (k.getSprite("whack-hole")) hole.use(k.sprite("whack-hole"));
    const spriteName = ART[colorIndex];
    if (k.getSprite(spriteName)) mole.use(k.sprite(spriteName));
  });

  let value = null;
  let visible = false;
  let selected = false;
  let animation = null;
  let bob = null;
  let generation = 0;
  let baseX = x;
  let baseY = y;

  function syncNumber() {
    number.text = String(value ?? "");
    numberStroke.text = String(value ?? "");
    number.color = k.rgb(...(selected ? ORANGE : [255, 255, 255]));
    numberStroke.color = k.rgb(...INK);
  }

  function stopMotion() {
    safeCancel(animation);
    safeCancel(bob);
    animation = null;
    bob = null;
  }

  function setHiddenImmediate() {
    stopMotion();
    generation += 1;
    visible = false;
    unit.pos.x = baseX;
    unit.pos.y = baseY - HIDDEN_OFFSET;
    unit.opacity = 0;
    selected = false;
    syncNumber();
  }

  function animatePosition(fromY, toY, seconds, onDone) {
    stopMotion();
    const token = generation;
    const started = k.time();
    animation = unit.onUpdate(() => {
      if (token !== generation) return;
      const t = Math.min(1, (k.time() - started) / seconds);
      const eased = t * t * (3 - 2 * t);
      unit.pos.y = fromY + (toY - fromY) * eased;
      if (t >= 1) {
        safeCancel(animation);
        animation = null;
        onDone?.();
      }
    });
  }

  function startBob() {
    safeCancel(bob);
    const token = generation;
    const started = k.time();
    bob = unit.onUpdate(() => {
      if (token !== generation || !visible) return;
      const t = k.time() - started;
      unit.pos.y = baseY - Math.sin((t / BOB_SECONDS) * Math.PI * 2) * BOB_AMPLITUDE;
    });
  }

  function hide({ animate = true } = {}) {
    stopMotion();
    generation += 1;
    visible = false;
    const token = generation;
    selected = false;
    syncNumber();

    const fromY = unit.pos.y;
    const toY = baseY - HIDDEN_OFFSET;
    if (!animate) {
      unit.pos.y = toY;
      unit.opacity = 0;
      return;
    }

    const started = k.time();
    animation = unit.onUpdate(() => {
      if (token !== generation) return;
      const t = Math.min(1, (k.time() - started) / RETREAT_SECONDS);
      const eased = t * t * (3 - 2 * t);
      unit.pos.y = fromY + (toY - fromY) * eased;
      unit.opacity = 1 - t;
      if (t >= 1) {
        safeCancel(animation);
        animation = null;
        unit.opacity = 0;
      }
    });
  }

  function show(nextValue) {
    stopMotion();
    generation += 1;
    const token = generation;
    value = nextValue;
    visible = true;
    selected = false;
    syncNumber();

    const spriteName = ART[colorIndex];
    if (k.getSprite(spriteName)) mole.use(k.sprite(spriteName));
    mole.scale = k.vec2(MOLE_SCALE, MOLE_SCALE);

    const fromY = baseY - HIDDEN_OFFSET;
    const toY = baseY;
    unit.pos.x = baseX;
    unit.pos.y = fromY;
    unit.opacity = 1;

    const started = k.time();
    animation = unit.onUpdate(() => {
      if (token !== generation) return;
      const t = Math.min(1, (k.time() - started) / POP_SECONDS);
      const eased = 1 - Math.pow(1 - t, 3);
      unit.pos.y = fromY + (toY - fromY) * eased;
      if (t >= 1) {
        safeCancel(animation);
        animation = null;
        startBob();
        const holdToken = generation;
        k.wait(HOLD_SECONDS, () => {
          if (holdToken !== generation || !visible || selected) return;
          hide();
        });
      }
    });
  }

  function flashCorrect() {
    if (!visible) return;
    stopMotion();
    generation += 1;
    const token = generation;
    const started = k.time();
    const startScale = MOLE_SCALE;
    const peakScale = MOLE_SCALE * 1.20;
    animation = unit.onUpdate(() => {
      if (token !== generation) return;
      const t = Math.min(1, (k.time() - started) / 0.34);
      const s = startScale + (peakScale - startScale) * Math.sin(t * Math.PI);
      mole.scale = k.vec2(s, s);
      if (t >= 1) {
        safeCancel(animation);
        animation = null;
        mole.scale = k.vec2(startScale, startScale);
        hide();
      }
    });
  }

  function shake() {
    if (!visible) return;
    stopMotion();
    generation += 1;
    const token = generation;
    const started = k.time();
    animation = unit.onUpdate(() => {
      if (token !== generation) return;
      const t = Math.min(1, (k.time() - started) / 0.28);
      unit.pos.x = baseX + Math.sin(t * Math.PI * 12) * 14 * (1 - t);
      if (t >= 1) {
        safeCancel(animation);
        animation = null;
        unit.pos.x = baseX;
      }
    });
  }

  function setSelected(on) {
    selected = !!on;
    syncNumber();
    if (on) {
      safeCancel(bob);
      bob = null;
      mole.scale = k.vec2(MOLE_SCALE * 1.06, MOLE_SCALE * 1.06);
    } else {
      mole.scale = k.vec2(MOLE_SCALE, MOLE_SCALE);
    }
  }

  function setValue(nextValue) {
    value = nextValue;
    syncNumber();
  }

  return {
    x: baseX,
    y: baseY,
    hole,
    unit,
    mole,
    number,
    show,
    hide,
    flashCorrect,
    shake,
    setSelected,
    setValue,
    reset: setHiddenImmediate,
    isVisible: () => visible,
    getValue: () => value,
  };
}

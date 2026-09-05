// components/celebration.js — visual counterpart to audio/praise.js.
//
// The audio tier chain (enc-first-N → panda-cheer-N) handles the spoken
// encouragement. This module renders the on-screen fireworks / sparkles
// so the praise is multi-sensory. Tiers match audio/praise.js:
//   first     — enc-first-N               small star burst at the answer
//   streak3   — enc-streak3 + panda-praise medium fireworks
//   streak5   — enc-streak5 + panda-praise bigger fireworks
//   streak10  — enc-streak10 + panda-praise double burst
//   level     — enc-level + panda-cheer    full-screen confetti shower +
//                                          panda hop
//
// Animation runs in parallel with audio — does NOT participate in the
// single-active-audio invariant. Each particle owns its lifetime via
// onUpdate() and self-destructs, so a kid tapping the next answer
// mid-shower just lets the existing particles fade naturally; no
// cleanup needed.
//
// Particle count is capped per tier (12–90) for iPad Safari. Stars use
// the existing `star` SVG sprite — no new art required.

const PARTICLE_COLORS = [
  [255, 209, 102], // gold
  [244, 162, 97],  // orange
  [231, 111, 81],  // red-orange
  [255, 138, 178], // pink
  [167, 196, 232], // sky blue
  [143, 211, 144], // mint
  [186, 145, 230], // purple
];

function pickColor() {
  return PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
}

// Spawn a single star particle with random velocity / lifetime. Self-
// destructs when its lifetime elapses (no cleanup plumbing needed).
function spawnParticle(k, x, y, opts = {}) {
  const angle = opts.angle ?? Math.random() * Math.PI * 2;
  const speed = opts.speed ?? 180 + Math.random() * 240;
  const size = opts.size ?? 28 + Math.random() * 18;
  const life = opts.life ?? 0.9 + Math.random() * 0.5;
  const gravity = opts.gravity ?? 420;
  const color = opts.color ?? pickColor();

  const star = k.add([
    k.pos(x, y),
    k.sprite("star"),
    k.anchor("center"),
    k.color(...color),
    k.opacity(1),
    k.rotate(Math.random() * 360),
  ]);
  // size is the visual diameter; star SVG is 256 px so scale = size / 256
  star.scale = k.vec2(size / 256, size / 256);

  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed - 110; // initial upward kick
  let elapsed = 0;
  const totalLife = life;
  star.onUpdate(() => {
    elapsed += k.dt();
    if (elapsed >= totalLife) { star.destroy(); return; }
    star.pos.x += vx * k.dt();
    star.pos.y += vy * k.dt();
    vy += gravity * k.dt();
    star.angle += k.dt() * 240;
    // Quadratic fade-out — fast at the start, gentle at the end.
    const t = elapsed / totalLife;
    star.opacity = 1 - t * t;
  });
}

// Burst N particles at (x, y), evenly distributed around a circle with
// slight angular jitter so it looks organic rather than mechanical.
function burst(k, x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    spawnParticle(k, x, y, { angle });
  }
}

// 1-2 second confetti shower across the upper 60% of the canvas. Stagger
// the bursts so they fire in sequence rather than all at once.
function shower(k, count) {
  const W = k.width();
  const H = k.height();
  const burstCount = Math.min(Math.floor(count / 12), 8);
  const perBurst = 12;
  for (let i = 0; i < burstCount; i++) {
    const delay = (i / burstCount) * 0.9; // 0..0.9s stagger
    k.wait(delay, () => {
      const x = 200 + Math.random() * (W - 400);
      const y = 180 + Math.random() * (H * 0.45);
      burst(k, x, y, perBurst);
    });
  }
}

// Hop the panda when level completes — 3 sine-wave bounces over 0.7s.
// Operates on the panda's `body` node (which carries the sprite and the
// current mood). Body.width/height are the visual size; we tween those
// and self-cancel the onUpdate handler when the duration elapses.
function pandaHop(k, body, baseSize) {
  if (!body || !Number.isFinite(baseSize)) return;
  const t0 = performance.now();
  const dur = 700; // ms
  const handler = body.onUpdate(() => {
    const t = (performance.now() - t0) / dur;
    if (t >= 1) {
      body.width = baseSize;
      body.height = baseSize;
      handler.cancel();
      return;
    }
    // Three bounces across 700ms
    const scale = 1 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.18;
    body.width = baseSize * scale;
    body.height = baseSize * scale;
  });
}

// Entry point. Callers (roundScene, pairScene, game scenes) invoke this
// from their correct-pick branch alongside `pickCheerCue(...)`.
//
//   k          — kaplay instance
//   tier       — "first" | "streak3" | "streak5" | "streak10" | "level"
//   anchor     — { x, y } of the tapped button (optional; random if absent)
//   pandaBody  — optional panda body node for the level-complete hop
//   pandaBaseSize — optional base sprite size (default 180)
export function celebrate(k, { tier, anchor, pandaBody, pandaBaseSize = 180 }) {
  const W = k.width();
  const H = k.height();

  const fallbackX = 280 + Math.random() * (W - 560);
  const fallbackY = 280 + Math.random() * (H * 0.4);
  const x = anchor?.x ?? fallbackX;
  const y = anchor?.y ?? fallbackY;

  switch (tier) {
    case "level":
      shower(k, 90);
      pandaHop(k, pandaBody, pandaBaseSize);
      break;
    case "streak10":
      burst(k, x, y, 40);
      // Secondary burst at a different spot, 220 ms later.
      k.wait(0.22, () => {
        const x2 = 240 + Math.random() * (W - 480);
        const y2 = 260 + Math.random() * (H * 0.4);
        burst(k, x2, y2, 28);
      });
      break;
    case "streak5":
      burst(k, x, y, 34);
      break;
    case "streak3":
      burst(k, x, y, 24);
      break;
    case "first":
    default:
      burst(k, x, y, 12);
      break;
  }
}
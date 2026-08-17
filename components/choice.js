// components/choice.js — a single numeric answer button (plain digits, no emoji).
//
// Each button is sized for >=44pt touch targets on iPad and accepts a label,
// an enabled/disabled state, and a click handler. Disabled buttons render
// dimmed to indicate they have been locked out (e.g. wrong answer).

import { INK, CARD, DISABLED_BG, DISABLED_INK, ORANGE, FONT } from "./theme.js?v=20260812";

// Audio invariant: the game must never have two HTMLAudioElements playing at
// the same time. roundScene already calls PandaAudio.stopAllAudio() when an
// answer is accepted, but Safari can deliver a late ended/timer callback from
// an older sequence. This final browser-level mutex makes the invariant true
// even if an old callback reaches HTMLMediaElement.play() after the logical
// sequence was cancelled: starting one audio element always pauses the other.
//
// This is intentionally installed here rather than in a level because choice
// is loaded by the shared round scene used by L1-L8. It therefore protects all
// eight levels and every pool-driven cue without changing their individual
// teaching logic.
function installAudioMutex() {
  if (typeof window === "undefined" || typeof HTMLMediaElement === "undefined") return;
  if (window.__pandaAudioMutexInstalled) return;
  window.__pandaAudioMutexInstalled = true;

  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;
  let activeAudio = null;

  HTMLMediaElement.prototype.play = function patchedPlay(...args) {
    // Only police actual audio elements. The game uses <audio> for PandaAudio;
    // leaving other media types alone avoids changing browser behaviour for
    // unrelated page elements.
    if (this instanceof HTMLAudioElement) {
      if (activeAudio && activeAudio !== this && !activeAudio.paused) {
        try { originalPause.call(activeAudio); } catch (_) {}
      }
      activeAudio = this;
    }
    return originalPlay.apply(this, args);
  };

  HTMLMediaElement.prototype.pause = function patchedPause(...args) {
    if (this === activeAudio) activeAudio = null;
    return originalPause.apply(this, args);
  };

  window.__pandaAudioMutexReset = () => {
    if (activeAudio && !activeAudio.paused) {
      try { originalPause.call(activeAudio); } catch (_) {}
    }
    activeAudio = null;
  };
}

installAudioMutex();

// area() falls back to the object's own renderArea(), which only shape
// components (rect/circle/sprite/text) provide. The shape here lives on a child,
// so the shape must be handed to area() explicitly — otherwise the root has no
// renderArea and Kaplay's per-frame hit test throws on every frame.
function hitShape(k, x, y, w, h) {
  return k.area({ shape: new k.Rect(k.vec2(x - w / 2, y - h / 2), w, h) });
}

// Answer interaction has one important cross-button invariant:
// once a correct answer is accepted, no other answer button from that
// step may fire while the encouragement / transition audio is still running.
// The round scaffold creates a fresh set of choice buttons for every step.
// We therefore use a tiny shared lock here: setCorrect() acquires it, and the
// next choice() creation releases it. This prevents a child from tapping a
// second answer while the first correct-answer feedback is playing and
// accidentally creating a second cheer/advance chain.
function isAnswerLocked() {
  return typeof window !== "undefined" && window.__pandaAnswerLocked === true;
}

function resetAnswerLockForNewStep() {
  if (typeof window !== "undefined") window.__pandaAnswerLocked = false;
}

function stopAudioBeforeAnswer() {
  // Do this synchronously in the same input callback, before roundScene's
  // answer handler starts any feedback. This closes the critical window:
  // previous spoken prompt -> child taps correct -> new feedback starts.
  try {
    window.PandaAudio?.stopAllAudio?.();
  } catch (_) {}
  try {
    window.__pandaAudioMutexReset?.();
  } catch (_) {}
}

export default function choice(parent, opts = {}) {
  const k = window.kaplay;
  // Every newly-rendered answer row starts a fresh interaction window.
  resetAnswerLockForNewStep();

  const label = String(opts.label);
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 132;
  const h = opts.h ?? 112;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), hitShape(k, x, y, w, h)]);

  // A flat offset slab behind the face reads as a raised key, which is easier
  // for a small child to recognize as pressable than an outlined rectangle.
  const shadow = root.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...INK),
    k.opacity(0.18),
    k.pos(x, y + 8),
    k.anchor("center"),
  ]);

  const face = root.add([
    k.rect(w, h, { radius: 24 }),
    k.color(...(opts.disabled ? DISABLED_BG : CARD)),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  const text = root.add([
    k.text(label, { size: 56, font: FONT }),
    k.color(...(opts.disabled ? DISABLED_INK : INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  if (opts.onClick && !opts.disabled) {
    // Kaplay is configured with touchToMouse, so onClick covers both mouse and
    // touch input without double-firing on iPad Safari.
    root.onClick(() => {
      if (isAnswerLocked()) return;
      // Stop the currently speaking prompt BEFORE invoking the answer logic.
      // The round-scene handler also calls stopAllAudio; keeping this guard at
      // the interaction boundary makes the no-overlap invariant independent
      // of which shared scene/step supplied the button.
      stopAudioBeforeAnswer();
      opts.onClick();
    });
  }

  root.setDisabled = (disabled) => {
    opts.disabled = disabled;
    face.color = k.rgb(...(disabled ? DISABLED_BG : CARD));
    text.color = k.rgb(...(disabled ? DISABLED_INK : INK));
    shadow.opacity = disabled ? 0.08 : 0.18;
  };

  // Marks a button as the confirmed correct answer, distinct from the dimmed
  // "already tried this" state. It also locks the entire answer row until
  // the next teaching step creates a fresh set of choice buttons.
  root.setCorrect = () => {
    if (typeof window !== "undefined") window.__pandaAnswerLocked = true;
    face.color = k.rgb(...ORANGE);
    text.color = k.rgb(255, 255, 255);
  };

  return root;
}

// iconButton — small square button used for scene chrome (back / replay / etc).
// Smaller than the numeric choice buttons and uses the accent palette.

export function iconButton(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 96;
  const h = opts.h ?? 72;
  const label = String(opts.label);

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 5), hitShape(k, x, y, w, h)]);

  root.add([
    k.rect(w, h, { radius: 20 }),
    k.color(...ORANGE),
    k.outline(4, k.rgb(...INK)),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  root.add([
    k.text(label, { size: opts.fontSize ?? 36, font: FONT }),
    k.color(255, 255, 255),
    k.pos(x, y),
    k.anchor("center"),
  ]);

  if (opts.onClick) {
    // Kaplay is configured with touchToMouse, so onClick covers both mouse and
    // touch input without double-firing on iPad Safari.
    root.onClick(() => opts.onClick());
  }

  return root;
}

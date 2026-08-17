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

// `playAfter()` has an important Safari race: the caller starts the reference
// cue with playSequence() and immediately calls playAfter(referenceId,...).
// On some WebKit versions the Audio element can still report `ended === true`
// for the previous playback for one event-loop turn. The old playAfter()
// interprets that stale flag as "reference already finished" and starts the
// reward immediately, which creates exactly the bug seen on L3-L8:
//
//   encouragement ────────────────┐
//   expression reward ────────────┘  (OVERLAP)
//
// Gate the public playAfter() at the interaction boundary. If the reference
// audio is currently playing, wait for THIS playback's real `ended` event
// before delegating to the original implementation. Once ended has fired,
// the original playAfter() is safe to call because its `ref.ended` fast path
// now refers to the current playback, not the previous one.
//
// This wrapper is installed after main.js exposes window.PandaAudio. choice.js
// is loaded by the shared roundScene, so polling here keeps the fix independent
// of individual level files and covers L1-L8.
function installPlayAfterGate() {
  if (typeof window === "undefined") return;
  if (window.__pandaPlayAfterGateInstalled) return true;

  const api = window.PandaAudio;
  if (!api || typeof api.playAfter !== "function" || !api.audio) return false;

  const originalPlayAfter = api.playAfter;
  const wrappedPlayAfter = function gatedPlayAfter(referenceId, ids, options, onComplete) {
    const ref = api.audio[referenceId];
    if (!ref) return originalPlayAfter(referenceId, ids, options, onComplete);

    // Only gate when the reference is actually playing. If it is already
    // finished, the original implementation can correctly use its ended fast
    // path. If playback was rejected and the element is paused, there is no
    // reference audio to wait for, so also delegate immediately.
    if (ref.paused || ref.ended) {
      return originalPlayAfter(referenceId, ids, options, onComplete);
    }

    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      ref.removeEventListener("ended", onEnded);
      if (timeoutId != null) clearTimeout(timeoutId);
    };

    const startAfterReference = () => {
      if (settled) return;
      cleanup();
      originalPlayAfter(referenceId, ids, options, onComplete);
    };

    const onEnded = () => startAfterReference();
    ref.addEventListener("ended", onEnded, { once: true });

    // The reference is already playing, so duration is a safe wall-clock
    // fallback only for the WebKit case where `ended` is missed. Never use a
    // short fixed delay: that would reintroduce the overlap this gate exists
    // to prevent. Add 1500ms after the actual duration, not before it.
    const durationMs = Number.isFinite(ref.duration) && ref.duration > 0
      ? ref.duration * 1000 + 1500
      : 10000;
    timeoutId = setTimeout(() => {
      // If Safari missed `ended`, only start after the media position has
      // reached the end. If it is merely paused/stopped before the end,
      // do NOT start the reward on top of another audio flow.
      const duration = Number.isFinite(ref.duration) ? ref.duration : 0;
      const reachedEnd = duration > 0 && ref.currentTime >= duration - 0.05;
      if (ref.ended || reachedEnd) {
        startAfterReference();
      } else {
        // Keep waiting rather than violating the single-audio invariant.
        timeoutId = setTimeout(() => {
          const d = Number.isFinite(ref.duration) ? ref.duration : 0;
          if (ref.ended || (d > 0 && ref.currentTime >= d - 0.05)) {
            startAfterReference();
          }
        }, 2000);
      }
    }, durationMs);

    return undefined;
  };

  wrappedPlayAfter.__pandaOriginal = originalPlayAfter;
  api.playAfter = wrappedPlayAfter;
  window.__pandaPlayAfterGateInstalled = true;
  return true;
}

// PandaAudio is created later by main.js, after this module is evaluated.
// Stop polling as soon as the wrapper is installed; the interval is only a
// bootstrap mechanism and does not participate in game timing.
if (typeof window !== "undefined") {
  const gateTimer = setInterval(() => {
    if (installPlayAfterGate()) clearInterval(gateTimer);
  }, 50);
  // Do not leave a bootstrap timer around forever if audio initialization is
  // delayed or the game is loaded in a non-game document.
  setTimeout(() => clearInterval(gateTimer), 15000);
}

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
  resetAnswerLockForNewStep();

  const label = String(opts.label);
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 132;
  const h = opts.h ?? 112;

  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), hitShape(k, x, y, w, h)]);

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
    root.onClick(() => {
      if (isAnswerLocked()) return;
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

  root.setCorrect = () => {
    if (typeof window !== "undefined") window.__pandaAnswerLocked = true;
    face.color = k.rgb(...ORANGE);
    text.color = k.rgb(255, 255, 255);
  };

  return root;
}

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
    root.onClick(() => opts.onClick());
  }

  return root;
}

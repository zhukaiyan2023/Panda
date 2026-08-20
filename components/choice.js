// components/choice.js — a single numeric answer button (plain digits, no emoji).
import { INK, CARD, DISABLED_BG, DISABLED_INK, ORANGE, FONT } from "./theme.js?v=20260812";

// Final browser-level invariant: never allow two HTMLAudioElements to play
// concurrently. The real sequencing logic lives in main.js; this guard is a
// last line of defence for Safari/WebKit races and late callbacks.
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

// The important fix for L3-L8:
//
// roundScene does this synchronously:
//   playSequence(encouragementChain)
//   onAdvance() -> playAfter(lastEncourageId, expression)
//
// main.js playSequence() starts the first Audio asynchronously. Therefore,
// checking ref.paused/ref.ended inside playAfter() is unsafe: immediately after
// play() those properties can still describe the PREVIOUS playback. This was
// the source of the very visible "encouragement + expression overlap".
//
// We solve this by tracking the completion callback of the ACTUAL sequence.
// playAfter waits for that sequence's onComplete, rather than inspecting an
// Audio element's stale state. This also means the internal setTimeouts in
// main.js cannot resurrect a reward after stopAllAudio: if the sequence is
// cancelled its completion never fires, so the gate never starts the reward.
function installPlayAfterGate() {
  if (typeof window === "undefined") return true;
  if (window.__pandaPlayAfterGateInstalled) return true;

  const api = window.PandaAudio;
  if (!api || typeof api.playAfter !== "function" || typeof api.playSequence !== "function" || !api.audio) {
    return false;
  }

  const originalPlayAfter = api.playAfter;
  const originalPlaySequence = api.playSequence;
  const originalStopAllAudio = api.stopAllAudio;

  let currentSequence = null;
  let generation = 0;
  const waiters = new Set();

  api.playSequence = function trackedPlaySequence(ids, seqGapMs, startDelayMs, onComplete) {
    const state = {
      generation: ++generation,
      ids: Array.isArray(ids) ? ids.slice() : [],
      lastId: Array.isArray(ids) && ids.length ? ids[ids.length - 1] : null,
      completed: false,
      cancelled: false,
      resolve: null,
    };

    state.promise = new Promise((resolve) => {
      state.resolve = resolve;
    });

    currentSequence = state;

    const wrappedComplete = () => {
      if (state.cancelled || state.completed) return;
      state.completed = true;
      state.resolve();
      if (currentSequence === state) currentSequence = null;
      if (typeof onComplete === "function") onComplete();
    };

    // Important: pass the wrapped completion into the REAL scheduler. We do
    // not try to reproduce playSequence here; main.js remains the single
    // source of truth for cue-by-cue ended-event sequencing.
    return originalPlaySequence(ids, seqGapMs, startDelayMs, wrappedComplete);
  };

  api.stopAllAudio = function guardedStopAllAudio(...args) {
    generation += 1;
    if (currentSequence) {
      currentSequence.cancelled = true;
      currentSequence = null;
    }
    // A playAfter waiter must be cancelled before main.js pauses audio. This
    // guarantees that a later ended/fallback callback cannot start a stale
    // reward in a new step or a new scene.
    for (const waiter of waiters) waiter.cancel();
    waiters.clear();
    return originalStopAllAudio.apply(this, args);
  };

  api.playAfter = function gatedPlayAfter(referenceId, ids, options, onComplete) {
    const state = currentSequence;
    const ref = api.audio[referenceId];

    // If this reference is the LAST cue of the sequence that was just started,
    // wait for that sequence's real completion callback. Do not inspect
    // ref.ended/ref.paused at all in this path.
    if (state && !state.cancelled && !state.completed && state.lastId === referenceId) {
      let cancelled = false;
      let settled = false;

      const waiter = {
        cancel() {
          if (settled) return;
          cancelled = true;
          settled = true;
          waiters.delete(waiter);
        },
      };
      waiters.add(waiter);

      state.promise.then(() => {
        if (cancelled || settled || state.cancelled) return;
        settled = true;
        waiters.delete(waiter);
        // The sequence has REALLY finished. Calling the original playAfter now
        // is safe: its ref.ended fast path refers to this completed playback.
        originalPlayAfter(referenceId, ids, options, onComplete);
      });

      return undefined;
    }

    // If there is a currently playing reference not owned by a tracked
    // sequence, still wait for its real ended event. This covers legacy/direct
    // callers without reintroducing the stale-ended race.
    if (ref && !ref.paused && !ref.ended) {
      let fired = false;
      const onEnded = () => {
        if (fired) return;
        fired = true;
        ref.removeEventListener("ended", onEnded);
        originalPlayAfter(referenceId, ids, options, onComplete);
      };
      ref.addEventListener("ended", onEnded, { once: true });

      const cancelOnStop = {
        cancel() {
          if (fired) return;
          fired = true;
          ref.removeEventListener("ended", onEnded);
          waiters.delete(cancelOnStop);
        },
      };
      waiters.add(cancelOnStop);
      return undefined;
    }

    return originalPlayAfter(referenceId, ids, options, onComplete);
  };

  window.__pandaPlayAfterGateInstalled = true;
  return true;
}

if (typeof window !== "undefined") {
  const gateTimer = setInterval(() => {
    if (installPlayAfterGate()) clearInterval(gateTimer);
  }, 50);
  setTimeout(() => clearInterval(gateTimer), 15000);
}

function hitShape(k, x, y, w, h) {
  return k.area({ shape: new k.Rect(k.vec2(x - w / 2, y - h / 2), w, h) });
}

function isAnswerLocked() {
  return typeof window !== "undefined" && window.__pandaAnswerLocked === true;
}

function resetAnswerLockForNewStep() {
  if (typeof window !== "undefined") window.__pandaAnswerLocked = false;
}

function stopAudioBeforeAnswer() {
  try { window.PandaAudio?.stopAllAudio?.(); } catch (_) {}
  try { window.__pandaAudioMutexReset?.(); } catch (_) {}
}

export default function choice(parent, opts = {}) {
  const k = window.kaplay;
  resetAnswerLockForNewStep();
  const label = String(opts.label);
  const x = opts.x, y = opts.y, w = opts.w ?? 132, h = opts.h ?? 112;

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
      // Stop the previous prompt synchronously in the same user gesture.
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
  const x = opts.x, y = opts.y, w = opts.w ?? 96, h = opts.h ?? 72;
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

  if (opts.onClick) root.onClick(() => opts.onClick());
  return root;
}

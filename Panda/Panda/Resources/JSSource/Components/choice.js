// components/choice.js — shared answer buttons + global audio serialization.
import { INK, CARD, DISABLED_BG, DISABLED_INK, ORANGE, FONT } from "./theme.js?v=20260812";

// Audio invariant for the whole game:
// 1. Only one HTMLAudioElement may actually play.
// 2. Only one PandaAudio sequence may own playback at a time.
// 3. New sequences are queued behind the current sequence instead of
//    overlapping it. Direct cues are replacement/cancellation boundaries.
// 4. playAfter waits for the exact current sequence to finish; it never uses
//    a stale `ended` flag from a reused Audio element.
// 5. stopAllAudio/playCue/navigation cancel the old sequence, its queue and
//    its waiters together.

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

function installAudioSequencer() {
  if (typeof window === "undefined" || window.__pandaAudioSequencerInstalled) return true;
  const api = window.PandaAudio;
  if (!api || typeof api.playSequence !== "function" || typeof api.stopAllAudio !== "function") return false;

  window.__pandaAudioSequencerInstalled = true;

  const originalPlaySequence = api.playSequence;
  const originalPlayCue = api.playCue;
  const originalStopAllAudio = api.stopAllAudio;
  const waiters = new Set();
  const queue = [];
  let active = null;
  let generation = 0;

  function cancelSchedulerState() {
    if (active && !active.cancelled && !active.done) {
      active.cancelled = true;
      active.resolve?.();
    }
    active = null;
    queue.length = 0;
    for (const waiter of [...waiters]) waiter.cancel();
    waiters.clear();
  }

  function drainQueue() {
    if (active || queue.length === 0) return;
    startSequence(queue.shift());
  }

  function startSequence(request) {
    const state = {
      generation: ++generation,
      ids: Array.isArray(request.ids) ? request.ids.slice() : [],
      lastId: Array.isArray(request.ids) && request.ids.length
        ? request.ids[request.ids.length - 1]
        : null,
      cancelled: false,
      done: false,
      resolve: null,
      promise: null,
    };

    state.promise = new Promise((resolve) => { state.resolve = resolve; });
    active = state;

    const complete = () => {
      if (state.done) return;
      state.done = true;
      if (active === state) active = null;
      state.resolve?.();
      if (!state.cancelled && typeof request.onComplete === "function") {
        request.onComplete();
      }
      drainQueue();
    };

    originalPlaySequence(request.ids, request.seqGapMs, request.startDelayMs, complete);
  }

  api.playSequence = function serializedPlaySequence(ids, seqGapMs = 90, startDelayMs = 0, onComplete) {
    if (window.__skipTimers) {
      if (typeof onComplete === "function") onComplete();
      return null;
    }

    const request = {
      ids: Array.isArray(ids) ? ids.slice() : [],
      seqGapMs,
      startDelayMs,
      onComplete,
    };

    // This is the important mini-game fix. pairScene can accept another pair
    // while the previous cheer is still speaking. Queue that cheer rather
    // than starting a second HTMLAudio chain on top of the first one.
    if (active) {
      queue.push(request);
      return active;
    }

    startSequence(request);
    return active;
  };

  // Direct cues are replacement boundaries. This covers wrong-answer cues,
  // game-specific pop/pair cues, and any other caller that intentionally wants
  // to interrupt the current speech. Crucially, clear OUR scheduler state too;
  // main.js's lexical stopAllAudio() cannot see this wrapper's active state.
  api.playCue = function serializedPlayCue(id) {
    cancelSchedulerState();
    return originalPlayCue(id);
  };

  api.stopAllAudio = function serializedStopAllAudio(...args) {
    cancelSchedulerState();
    return originalStopAllAudio.apply(this, args);
  };

  function waitForReference(ref, state, startNext) {
    let settled = false;
    let pollId = null;
    let timeoutId = null;

    const waiter = {
      cancel() {
        if (settled) return;
        settled = true;
        if (pollId != null) clearInterval(pollId);
        if (timeoutId != null) clearTimeout(timeoutId);
        if (ref) {
          try { ref.removeEventListener("ended", onEnded); } catch (_) {}
        }
        waiters.delete(waiter);
      },
    };
    waiters.add(waiter);

    const finish = () => {
      if (settled) return;
      settled = true;
      if (pollId != null) clearInterval(pollId);
      if (timeoutId != null) clearTimeout(timeoutId);
      if (ref) {
        try { ref.removeEventListener("ended", onEnded); } catch (_) {}
      }
      waiters.delete(waiter);
      startNext();
    };

    const onEnded = () => finish();

    // Exact active sequence match: its completion callback is authoritative.
    if (state && active === state && !state.cancelled && !state.done && state.lastId === ref?.dataset?.cue) {
      state.promise.then(() => {
        if (!settled && !state.cancelled) finish();
      });
      return waiter;
    }

    // A genuinely ended reference is safe. Never treat paused as ended.
    if (ref?.ended) {
      finish();
      return waiter;
    }

    if (ref) ref.addEventListener("ended", onEnded, { once: true });

    // WebKit fallback: wait for actual media position to reach duration.
    // This is intentionally not duration+N milliseconds, which can fire early.
    pollId = setInterval(() => {
      if (settled) return;
      const d = Number.isFinite(ref?.duration) ? ref.duration : 0;
      if (ref?.ended || (d > 0 && ref.currentTime >= d - 0.05)) finish();
    }, 50);

    // Safety only. It never starts the next cue.
    timeoutId = setTimeout(() => waiter.cancel(), 60000);
    return waiter;
  }

  api.playAfter = function serializedPlayAfter(referenceId, ids, options = {}, onComplete) {
    const ref = api.audio?.[referenceId];
    const gapMs = Number.isFinite(options.gapMs) ? options.gapMs : 1000;
    const seqGapMs = Number.isFinite(options.seqGapMs) ? options.seqGapMs : 90;

    const startNext = () => api.playSequence(ids, seqGapMs, gapMs, onComplete);

    if (window.__skipTimers) {
      startNext();
      return;
    }

    if (!ref) {
      api.playSequence(ids, seqGapMs, gapMs, onComplete);
      return;
    }

    // Current sequence's last cue: wait for this exact generation.
    if (active && !active.cancelled && !active.done && active.lastId === referenceId) {
      waitForReference(ref, active, startNext);
      return;
    }

    // If a sequence with this reference is queued behind another sequence,
    // `ended` may still describe an older playback. In that case it is safe to
    // queue the continuation now; it will naturally sit behind the queued
    // sequence and cannot overlap it.
    if (ref.ended || ref.paused) {
      api.playSequence(ids, seqGapMs, gapMs, onComplete);
      return;
    }

    waitForReference(ref, null, startNext);
  };

  api.audioSchedulerState = () => ({
    activeGeneration: active?.generation ?? null,
    activeLastId: active?.lastId ?? null,
    queuedSequences: queue.length,
    activeWaiters: waiters.size,
  });

  return true;
}

if (typeof window !== "undefined") {
  const timer = setInterval(() => {
    if (installAudioSequencer()) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 15000);
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

  if (opts.onClick) root.onClick(() => opts.onClick());
  return root;
}
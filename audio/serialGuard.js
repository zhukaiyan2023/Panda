// audio/serialGuard.js — runtime safety wrapper for the shared PandaAudio API.
//
// The underlying audio manager is intentionally event-driven, but iPad Safari
// can miss an `ended` event. A missed event used to leave playSequence() or the
// sequence launched by playAfter() alive forever. That could strand a level in
// a half-rendered step and could also leave a stale playAfter() waiting beside a
// newly-created step prompt.
//
// This module is imported before main.js creates window.PandaAudio. It installs
// a setter so the first assignment is wrapped immediately, without changing
// the audio manager implementation or every level scene.

const UNKNOWN_CUE_MS = 6000;
const SAFETY_BUFFER_MS = 2500;
const MIN_GUARD_MS = 1000;

function cueDurationMs(audio, id) {
  const el = audio?.[id];
  if (el && Number.isFinite(el.duration) && el.duration > 0) {
    return el.duration * 1000;
  }
  return UNKNOWN_CUE_MS;
}

function sequenceEstimateMs(audio, ids, seqGapMs = 90, startDelayMs = 0) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return Math.max(startDelayMs || 0, MIN_GUARD_MS);
  }
  const gap = Math.max(0, Number(seqGapMs) || 0);
  const start = Math.max(0, Number(startDelayMs) || 0);
  const cueMs = ids.reduce((sum, id) => sum + cueDurationMs(audio, id), 0);
  return Math.max(
    MIN_GUARD_MS,
    start + cueMs + gap * Math.max(0, ids.length - 1) + SAFETY_BUFFER_MS,
  );
}

function install(value) {
  if (!value || value.__audioSerialGuardInstalled) return value;

  const originalStopAllAudio = value.stopAllAudio;
  const originalPlaySequence = value.playSequence;
  const originalPlayAfter = value.playAfter;
  const guardTimers = new Set();

  // Multiple playAfter() calls can legitimately reference the same
  // encouragement cue. Level 3 is the important case: after the first
  // correct pick, the comparison read-back and the next-step prompt were
  // both chained from the same lastEncourageId. The old guard let both
  // continuations wait on that same cue and then start at nearly the same
  // time. Keep a strict FIFO of pending continuations instead.
  let continuationTail = Promise.resolve();
  let generation = 0;

  const clearGuardTimers = () => {
    for (const timer of guardTimers) clearTimeout(timer);
    guardTimers.clear();
  };

  value.stopAllAudio = function guardedStopAllAudio() {
    clearGuardTimers();
    generation += 1;
    continuationTail = Promise.resolve();
    return originalStopAllAudio();
  };

  value.playSequence = function guardedPlaySequence(
    ids,
    seqGapMs = 90,
    startDelayMs = 0,
    onComplete,
  ) {
    value.stopAllAudio();

    let completed = false;
    let timer = null;
    const complete = () => {
      if (completed) return;
      completed = true;
      if (timer != null) {
        clearTimeout(timer);
        guardTimers.delete(timer);
        timer = null;
      }
      onComplete?.();
    };

    const timeoutMs = sequenceEstimateMs(value.audio, ids, seqGapMs, startDelayMs);
    timer = setTimeout(() => {
      guardTimers.delete(timer);
      if (completed) return;
      value.stopAllAudio();
      complete();
    }, timeoutMs);
    guardTimers.add(timer);

    try {
      originalPlaySequence(ids, seqGapMs, startDelayMs, complete);
    } catch (err) {
      console.warn("[panda-audio] guarded playSequence failed:", err?.message || err);
      value.stopAllAudio();
      complete();
    }
  };

  value.playAfter = function guardedPlayAfter(
    referenceId,
    ids,
    opts = {},
    onComplete,
  ) {
    const requestedGeneration = generation;
    const previous = continuationTail;

    // Append this continuation after every continuation that was already
    // registered. This is deliberately global rather than keyed only by
    // referenceId: one audio chain owns the speaker, so no later chain may
    // start until the earlier chain has released it.
    let releaseCurrent;
    const current = new Promise((resolve) => { releaseCurrent = resolve; });
    continuationTail = previous.then(() => current);

    const start = () => {
      if (requestedGeneration !== generation) {
        releaseCurrent();
        onComplete?.();
        return;
      }

      const ref = value.audio?.[referenceId];
      // Do not call stopAllAudio when the reference is already ended/paused.
      // Original playAfter() is designed to kick off immediately in this
      // state; calling stopAllAudio here would cancel the queue generation.
      void ref;

      let completed = false;
      let timer = null;
      const finish = () => {
        if (completed) return;
        completed = true;
        if (timer != null) {
          clearTimeout(timer);
          guardTimers.delete(timer);
          timer = null;
        }
        releaseCurrent();
        onComplete?.();
      };

      const gapMs = Math.max(0, Number(opts?.gapMs) || 0);
      const seqGapMs = Math.max(0, Number(opts?.seqGapMs) || 90);
      const refWaitMs = ref
        ? (Number.isFinite(ref.duration) && ref.duration > 0 ? ref.duration * 1000 : UNKNOWN_CUE_MS)
        : 4000;
      const timeoutMs = Math.max(
        MIN_GUARD_MS,
        refWaitMs + gapMs + sequenceEstimateMs(value.audio, ids, seqGapMs, 0),
      );

      timer = setTimeout(() => {
        guardTimers.delete(timer);
        if (completed) return;
        value.stopAllAudio();
        finish();
      }, timeoutMs);
      guardTimers.add(timer);

      try {
        originalPlayAfter(referenceId, ids, opts, finish);
      } catch (err) {
        console.warn("[panda-audio] guarded playAfter failed:", err?.message || err);
        value.stopAllAudio();
        finish();
      }
    };

    // Waiting here is intentional: the previous continuation may itself
    // be waiting on the same encouragement cue. This prevents two
    // playAfter() chains from starting together after one `ended` event.
    previous.then(start);
  };

  Object.defineProperty(value, "__audioSerialGuardInstalled", {
    value: true,
    enumerable: false,
    configurable: false,
  });

  return value;
}

export function installPandaAudioSerialGuard() {
  if (typeof window === "undefined") return;

  let current = window.PandaAudio;
  if (current) current = install(current);

  Object.defineProperty(window, "PandaAudio", {
    configurable: true,
    enumerable: true,
    get() {
      return current;
    },
    set(value) {
      current = install(value);
    },
  });

  if (current) current = install(current);
}

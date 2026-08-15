// audio/serialGuard.js — shared audio transaction guard.
//
// The level scenes use one global PandaAudio manager. A correct answer can
// finish one sequence and immediately request a follow-up reward/prompt.
// Do not infer that the reference audio is finished from HTMLAudioElement's
// `ended` flag: the same element is reused across rounds and can still carry
// `ended=true` from an earlier playback while a new sequence has just started.
// Instead, serialize follow-up chains from the completion callback of the
// sequence that actually owns the speaker.

const UNKNOWN_CUE_MS = 6000;
const SAFETY_BUFFER_MS = 2500;
const MIN_GUARD_MS = 1000;

function cueDurationMs(audio, id) {
  const el = audio?.[id];
  return el && Number.isFinite(el.duration) && el.duration > 0
    ? el.duration * 1000
    : UNKNOWN_CUE_MS;
}

function sequenceEstimateMs(audio, ids, seqGapMs = 90, startDelayMs = 0) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return Math.max(MIN_GUARD_MS, Number(startDelayMs) || 0);
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

  // A generation invalidates every continuation registered before a hard
  // stop. This prevents old reward/prompt callbacks from leaking into the
  // next round or destination scene.
  let generation = 0;

  // Represents the sequence that currently owns the speaker. The promise is
  // resolved only when that sequence's onComplete fires, i.e. AFTER its final
  // cue ended. It is deliberately independent of the HTMLAudioElement
  // `ended` property.
  let activeSequence = null;

  // Follow-up requests are serialized FIFO. This covers multiple
  // playAfter() calls made from the same answer transition.
  let continuationTail = Promise.resolve();

  const clearGuardTimers = () => {
    for (const timer of guardTimers) clearTimeout(timer);
    guardTimers.clear();
  };

  const settleActiveSequence = (expected, cancelled = false) => {
    if (!activeSequence || activeSequence !== expected) return;
    activeSequence.cancelled = cancelled;
    activeSequence.resolve({ cancelled });
    activeSequence = null;
  };

  value.stopAllAudio = function guardedStopAllAudio() {
    clearGuardTimers();
    generation += 1;
    continuationTail = Promise.resolve();
    const current = activeSequence;
    activeSequence = null;
    if (current) {
      current.cancelled = true;
      current.resolve({ cancelled: true });
    }
    return originalStopAllAudio();
  };

  value.playSequence = function guardedPlaySequence(
    ids,
    seqGapMs = 90,
    startDelayMs = 0,
    onComplete,
  ) {
    // A new top-level sequence owns the speaker and therefore cancels any
    // previous sequence first.
    value.stopAllAudio();

    let completed = false;
    let timer = null;
    const expectedGeneration = generation;

    const completion = new Promise((resolve) => {
      const state = {
        cancelled: false,
        resolve,
      };
      activeSequence = state;
    });
    const state = activeSequence;

    const finish = (cancelled = false) => {
      if (completed) return;
      completed = true;
      if (timer != null) {
        clearTimeout(timer);
        guardTimers.delete(timer);
        timer = null;
      }
      settleActiveSequence(state, cancelled);
      onComplete?.();
    };

    const timeoutMs = sequenceEstimateMs(value.audio, ids, seqGapMs, startDelayMs);
    timer = setTimeout(() => {
      guardTimers.delete(timer);
      if (completed) return;
      value.stopAllAudio();
      // stopAllAudio resolves/cancels the active sequence. Release this
      // sequence's caller as a fallback even if the underlying manager never
      // emitted its final ended event.
      finish(true);
    }, timeoutMs);
    guardTimers.add(timer);

    // A hard stop or a newer sequence may invalidate this sequence before
    // PandaAudio calls the callback. Do not run the caller's continuation in
    // that case unless this is the sequence that is still active.
    const guardedComplete = () => {
      if (completed || expectedGeneration !== generation || state.cancelled) return;
      finish(false);
    };

    try {
      originalPlaySequence(ids, seqGapMs, startDelayMs, guardedComplete);
    } catch (err) {
      console.warn("[panda-audio] guarded playSequence failed:", err?.message || err);
      value.stopAllAudio();
      finish(true);
    }

    // Keep the promise reachable for callers/debugging without changing the
    // public API shape used by existing scenes.
    state.completion = completion;
  };

  value.playAfter = function guardedPlayAfter(
    referenceId,
    ids,
    opts = {},
    onComplete,
  ) {
    const requestedGeneration = generation;
    const gapMs = Math.max(0, Number(opts?.gapMs) || 0);
    const seqGapMs = Math.max(0, Number(opts?.seqGapMs) || 90);
    const previous = continuationTail;

    // Wait for every continuation already queued before this request.
    // When the current speaker is an active PandaAudio sequence, wait for
    // THAT sequence's completion callback instead of looking at ref.ended.
    const ownerCompletion = activeSequence?.completion || Promise.resolve({ cancelled: false });

    let releaseCurrent;
    const current = new Promise((resolve) => { releaseCurrent = resolve; });
    continuationTail = previous.then(() => ownerCompletion).then(() => current);

    const start = async () => {
      if (requestedGeneration !== generation) {
        releaseCurrent();
        onComplete?.();
        return;
      }

      // If an active PandaAudio sequence owns the speaker, it has now ended.
      // Start the follow-up directly with playSequence. This avoids the stale
      // HTMLAudioElement.ended problem entirely and guarantees:
      //   encouragement → follow-up prompt/reward → completion.
      if (ownerCompletion !== Promise.resolve()) {
        const result = await ownerCompletion;
        if (requestedGeneration !== generation || result?.cancelled) {
          releaseCurrent();
          onComplete?.();
          return;
        }
        if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
        if (requestedGeneration !== generation) {
          releaseCurrent();
          onComplete?.();
          return;
        }
        originalPlaySequence(ids, seqGapMs, 0, () => {
          releaseCurrent();
          onComplete?.();
        });
        return;
      }

      // Fallback for callers that really are referencing an externally
      // playing cue not created through this wrapper. Use the original
      // event-driven playAfter with a timeout safety net.
      const ref = value.audio?.[referenceId];
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
      const refWaitMs = ref && Number.isFinite(ref.duration) && ref.duration > 0
        ? ref.duration * 1000
        : UNKNOWN_CUE_MS;
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
        clearTimeout(timer);
        guardTimers.delete(timer);
        console.warn("[panda-audio] guarded playAfter failed:", err?.message || err);
        value.stopAllAudio();
        finish();
      }
    };

    void start();
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

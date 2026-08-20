// components/choice.js — shared answer buttons + global audio race protection.
import { INK, CARD, DISABLED_BG, DISABLED_INK, ORANGE, FONT } from "./theme.js?v=20260812";

/*
 * Audio policy
 * ------------
 * The game has one hard rule: audio is serialized. A later cue may start
 * only after the previous cue has really finished. In particular, never use
 * HTMLAudioElement.ended immediately after play() as proof that the current
 * playback has finished — WebKit can expose the previous playback state for
 * an event-loop turn.
 *
 * main.js owns the actual audio pool and playSequence implementation. This
 * module installs a small compatibility layer once PandaAudio exists. It does
 * NOT try to play audio itself; it only makes playAfter() wait for the exact
 * current playback before starting the next sequence.
 */
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
  const originalStopAllAudio = api.stopAllAudio;
  const waiters = new Set();
  let activeSequence = null;
  let sequenceGeneration = 0;

  function trackSequence(ids, seqGapMs, startDelayMs, onComplete) {
    const state = {
      generation: ++sequenceGeneration,
      ids: Array.isArray(ids) ? ids.slice() : [],
      lastId: Array.isArray(ids) && ids.length ? ids[ids.length - 1] : null,
      done: false,
      cancelled: false,
      resolve: null,
      promise: null,
    };
    state.promise = new Promise((resolve) => { state.resolve = resolve; });
    activeSequence = state;

    const complete = () => {
      if (state.done || state.cancelled) return;
      state.done = true;
      if (activeSequence === state) activeSequence = null;
      state.resolve();
      if (typeof onComplete === "function") onComplete();
    };

    originalPlaySequence(ids, seqGapMs, startDelayMs, complete);
    return state;
  }

  api.playSequence = trackSequence;

  api.stopAllAudio = function serializedStopAllAudio(...args) {
    if (activeSequence) {
      activeSequence.cancelled = true;
      activeSequence.resolve();
      activeSequence = null;
    }
    for (const waiter of [...waiters]) waiter.cancel();
    waiters.clear();
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

    // The exact sequence that owns this reference is authoritative. This is
    // the critical case for L3-L8: roundScene calls playSequence(cheer) and
    // immediately calls playAfter(lastCheer, expression). We wait for the
    // sequence completion callback, never for a stale ref.ended flag.
    if (state && !state.cancelled && !state.done && state.lastId === (ref?.dataset?.cue || null)) {
      state.promise.then(() => {
        if (!settled && !state.cancelled) finish();
      });
      // A sequence can complete while this waiter is being installed. The
      // promise above handles that case deterministically.
      return waiter;
    }

    if (!ref || ref.ended) {
      finish();
      return waiter;
    }

    ref.addEventListener("ended", onEnded, { once: true });

    // WebKit occasionally misses ended. Poll currentTime instead of guessing
    // from duration. This cannot fire early because currentTime is required
    // to reach the actual media duration. If the media is paused/stopped by
    // stopAllAudio, the waiter is cancelled and never starts stale audio.
    pollId = setInterval(() => {
      if (settled) return;
      const d = Number.isFinite(ref.duration) ? ref.duration : 0;
      if (ref.ended || (d > 0 && ref.currentTime >= d - 0.05)) finish();
    }, 50);

    // Absolute guard only prevents a permanently broken media element from
    // hanging forever. It intentionally does NOT start the next cue. This is
    // different from the old duration+2500ms fallback, which could overlap.
    timeoutId = setTimeout(() => {
      waiter.cancel();
    }, 60000);

    return waiter;
  }

  api.playAfter = function serializedPlayAfter(referenceId, ids, options = {}, onComplete) {
    const ref = api.audio?.[referenceId];
    const state = activeSequence;
    const gapMs = Number.isFinite(options.gapMs) ? options.gapMs : 1000;
    const seqGapMs = Number.isFinite(options.seqGapMs) ? options.seqGapMs : 90;

    const startNext = () => {
      // Never call main.js's old playAfter(). It contains the stale ended
      // shortcut and duration-based fallback that caused the overlap. Start
      // the next sequence directly after the verified reference completion.
      api.playSequence(ids, seqGapMs, gapMs, onComplete);
    };

    if (window.__skipTimers) {
      startNext();
      return;
    }

    if (!ref) {
      // Missing reference: preserve the old safe behaviour, but route through
      // the new serialized scheduler. There is no reference to overlap.
      api.playSequence(ids, seqGapMs, gapMs, onComplete);
      return;
    }

    // Exact current sequence match. We identify the sequence by its last cue
    // and the Audio element's dataset cue, avoiding any dependence on ended /
    // paused state immediately after play().
    if (state && !state.cancelled && !state.done && state.lastId === referenceId) {
      waitForReference(ref, state, startNext);
      return;
    }

    // Reference already ended: it is safe to apply only the requested gap.
    if (ref.ended) {
      api.playSequence(ids, seqGapMs, gapMs, onComplete);
      return;
    }

    // Reference is currently playing but not owned by a tracked sequence.
    waitForReference(ref, null, startNext);
  };

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

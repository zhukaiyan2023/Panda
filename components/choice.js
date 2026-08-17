// components/choice.js — a single numeric answer button (plain digits, no emoji).
import { INK, CARD, DISABLED_BG, DISABLED_INK, ORANGE, FONT } from "./theme.js?v=20260812";

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

// Strong WebKit fix: remember the sequence that was just requested. The
// caller can invoke playAfter() synchronously after playSequence(), before
// HTMLAudioElement.play() has resolved. In that window ref.paused/ended may
// describe the previous playback, so checking them is not a valid ownership
// test. We gate the reward on the actual ended event of the current sequence.
function installPlayAfterGate() {
  if (typeof window === "undefined") return true;
  if (window.__pandaPlayAfterGateInstalled) return true;
  const api = window.PandaAudio;
  if (!api || typeof api.playAfter !== "function" || typeof api.playSequence !== "function" || !api.audio) return false;

  const originalPlayAfter = api.playAfter;
  const originalPlaySequence = api.playSequence;
  const originalStopAllAudio = api.stopAllAudio;
  const activeGates = new Set();
  let generation = 0;
  let current = null;

  const cancelGates = () => {
    for (const gate of activeGates) gate.cancel();
    activeGates.clear();
    current = null;
  };

  api.stopAllAudio = function guardedStopAllAudio(...args) {
    cancelGates();
    return originalStopAllAudio.apply(this, args);
  };

  api.playSequence = function trackedPlaySequence(ids, seqGapMs, startDelayMs, onComplete) {
    const state = {
      generation: ++generation,
      ids: Array.isArray(ids) ? ids.slice() : [],
      lastId: Array.isArray(ids) && ids.length ? ids[ids.length - 1] : null,
      ended: false,
      cancelled: false,
      onEnded: null,
    };
    current = state;

    const lastEl = state.lastId ? api.audio[state.lastId] : null;
    if (lastEl) {
      state.onEnded = () => { state.ended = true; };
      lastEl.addEventListener("ended", state.onEnded, { once: true });
    }

    return originalPlaySequence(ids, seqGapMs, startDelayMs, onComplete);
  };

  api.playAfter = function gatedPlayAfter(referenceId, ids, options, onComplete) {
    const state = current;
    const ref = api.audio[referenceId];

    if (state && state.lastId === referenceId && !state.ended && !state.cancelled && ref) {
      let settled = false;
      let timeoutId = null;
      const gate = {
        cancel() {
          if (settled) return;
          settled = true;
          if (state.onEnded) ref.removeEventListener("ended", state.onEnded);
          ref.removeEventListener("ended", onEnded);
          if (timeoutId != null) clearTimeout(timeoutId);
          state.cancelled = true;
          activeGates.delete(gate);
        },
      };
      const cleanup = () => {
        if (settled) return;
        settled = true;
        ref.removeEventListener("ended", onEnded);
        if (timeoutId != null) clearTimeout(timeoutId);
        activeGates.delete(gate);
      };
      const start = () => {
        if (settled || state.cancelled) return;
        cleanup();
        state.ended = true;
        // Only after the current sequence's ended event do we delegate to
        // the original implementation, whose ended fast-path is now safe.
        originalPlayAfter(referenceId, ids, options, onComplete);
      };
      const onEnded = () => start();
      activeGates.add(gate);
      if (state.onEnded) ref.removeEventListener("ended", state.onEnded);
      state.onEnded = onEnded;
      ref.addEventListener("ended", onEnded, { once: true });
      timeoutId = setTimeout(() => {
        if (settled || state.cancelled) return;
        const d = Number.isFinite(ref.duration) ? ref.duration : 0;
        if (ref.ended || (d > 0 && ref.currentTime >= d - 0.05)) start();
      }, Number.isFinite(ref.duration) && ref.duration > 0 ? ref.duration * 1000 + 2000 : 12000);
      return undefined;
    }

    if (!ref) return originalPlayAfter(referenceId, ids, options, onComplete);
    if (!ref.paused && !ref.ended) {
      let fired = false;
      const onEnded = () => {
        if (fired) return;
        fired = true;
        ref.removeEventListener("ended", onEnded);
        originalPlayAfter(referenceId, ids, options, onComplete);
      };
      ref.addEventListener("ended", onEnded, { once: true });
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
  const shadow = root.add([k.rect(w, h, { radius: 24 }), k.color(...INK), k.opacity(0.18), k.pos(x, y + 8), k.anchor("center")]);
  const face = root.add([k.rect(w, h, { radius: 24 }), k.color(...(opts.disabled ? DISABLED_BG : CARD)), k.outline(4, k.rgb(...INK)), k.pos(x, y), k.anchor("center")]);
  const text = root.add([k.text(label, { size: 56, font: FONT }), k.color(...(opts.disabled ? DISABLED_INK : INK)), k.pos(x, y), k.anchor("center")]);
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
  const x = opts.x, y = opts.y, w = opts.w ?? 96, h = opts.h ?? 72;
  const label = String(opts.label);
  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 5), hitShape(k, x, y, w, h)]);
  root.add([k.rect(w, h, { radius: 20 }), k.color(...ORANGE), k.outline(4, k.rgb(...INK)), k.pos(x, y), k.anchor("center")]);
  root.add([k.text(label, { size: opts.fontSize ?? 36, font: FONT }), k.color(255, 255, 255), k.pos(x, y), k.anchor("center")]);
  if (opts.onClick) root.onClick(() => opts.onClick());
  return root;
}

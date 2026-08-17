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

// playAfter() has a WebKit race: playSequence() starts the reference cue and
// the caller immediately invokes playAfter(). Safari can briefly retain the
// previous playback's `ended === true`, causing the reward expression to
// start before the current encouragement has actually ended. Keep every
// playAfter gate cancellable so navigation/new answers cannot resurrect a
// stale reward chain later.
function installPlayAfterGate() {
  if (typeof window === "undefined") return true;
  if (window.__pandaPlayAfterGateInstalled) return true;
  const api = window.PandaAudio;
  if (!api || typeof api.playAfter !== "function" || !api.audio) return false;

  const originalPlayAfter = api.playAfter;
  const originalStopAllAudio = api.stopAllAudio;
  const activeGates = new Set();

  const cancelAllGates = () => {
    for (const gate of activeGates) gate.cancel();
    activeGates.clear();
  };

  api.stopAllAudio = function guardedStopAllAudio(...args) {
    cancelAllGates();
    return originalStopAllAudio.apply(this, args);
  };

  api.playAfter = function gatedPlayAfter(referenceId, ids, options, onComplete) {
    const ref = api.audio[referenceId];
    if (!ref || ref.paused || ref.ended) {
      return originalPlayAfter(referenceId, ids, options, onComplete);
    }

    let settled = false;
    let timeoutId = null;
    const gate = {
      cancel() {
        if (settled) return;
        settled = true;
        ref.removeEventListener("ended", onEnded);
        if (timeoutId != null) clearTimeout(timeoutId);
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

    const startAfterReference = () => {
      if (settled) return;
      cleanup();
      // At this point the CURRENT reference playback has ended. The original
      // playAfter() can safely take its ended fast path and apply its normal
      // gap before starting the expression reward.
      originalPlayAfter(referenceId, ids, options, onComplete);
    };

    const onEnded = () => startAfterReference();
    activeGates.add(gate);
    ref.addEventListener("ended", onEnded, { once: true });

    // Fallback is deliberately late. It is only for Safari missing `ended`,
    // never for estimating when the sentence should finish. If the media was
    // stopped before its natural end, the reward is NOT started.
    const durationMs = Number.isFinite(ref.duration) && ref.duration > 0
      ? ref.duration * 1000 + 1500
      : 10000;
    timeoutId = setTimeout(() => {
      if (settled) return;
      const duration = Number.isFinite(ref.duration) ? ref.duration : 0;
      if (ref.ended || (duration > 0 && ref.currentTime >= duration - 0.05)) {
        startAfterReference();
      } else {
        timeoutId = setTimeout(() => {
          if (settled) return;
          const d = Number.isFinite(ref.duration) ? ref.duration : 0;
          if (ref.ended || (d > 0 && ref.currentTime >= d - 0.05)) {
            startAfterReference();
          }
        }, 2000);
      }
    }, durationMs);

    return undefined;
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
  const x = opts.x;
  const y = opts.y;
  const w = opts.w ?? 132;
  const h = opts.h ?? 112;
  const root = parent.add([k.pos(0, 0), k.z(opts.z ?? 0), hitShape(k, x, y, w, h)]);
  const shadow = root.add([
    k.rect(w, h, { radius: 24 }), k.color(...INK), k.opacity(0.18),
    k.pos(x, y + 8), k.anchor("center"),
  ]);
  const face = root.add([
    k.rect(w, h, { radius: 24 }), k.color(...(opts.disabled ? DISABLED_BG : CARD)),
    k.outline(4, k.rgb(...INK)), k.pos(x, y), k.anchor("center"),
  ]);
  const text = root.add([
    k.text(label, { size: 56, font: FONT }),
    k.color(...(opts.disabled ? DISABLED_INK : INK)), k.pos(x, y), k.anchor("center"),
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
    k.rect(w, h, { radius: 20 }), k.color(...ORANGE), k.outline(4, k.rgb(...INK)),
    k.pos(x, y), k.anchor("center"),
  ]);
  root.add([
    k.text(label, { size: opts.fontSize ?? 36, font: FONT }),
    k.color(255, 255, 255), k.pos(x, y), k.anchor("center"),
  ]);
  if (opts.onClick) root.onClick(() => opts.onClick());
  return root;
}

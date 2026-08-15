import assert from "node:assert/strict";

globalThis.window = {};

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const timers = new Map();
let nextTimerId = 1;

globalThis.setTimeout = (fn, delay) => {
  const id = nextTimerId++;
  timers.set(id, { fn, delay });
  return id;
};
globalThis.clearTimeout = (id) => {
  timers.delete(id);
};

try {
  const { installPandaAudioSerialGuard } = await import("../audio/serialGuard.js?verify=2");
  installPandaAudioSerialGuard();

  let stopCalls = 0;
  let playSequenceCalls = 0;
  let playAfterCalls = 0;
  const sequenceCallbacks = [];
  const afterCallbacks = [];

  const audio = {
    cue: { duration: 0.1, ended: false, paused: false },
  };

  window.PandaAudio = {
    audio,
    stopAllAudio() {
      stopCalls += 1;
    },
    playSequence(ids, gapMs, startDelayMs, onComplete) {
      playSequenceCalls += 1;
      sequenceCallbacks.push(onComplete);
      assert.deepEqual(ids, ["cue"]);
      assert.equal(gapMs, 40);
      assert.equal(startDelayMs, 0);
    },
    playAfter(referenceId, ids, opts, onComplete) {
      playAfterCalls += 1;
      afterCallbacks.push(onComplete);
      assert.equal(referenceId, "cue");
      assert.deepEqual(ids, ["cue"]);
      assert.equal(opts.gapMs, 400);
      assert.equal(opts.seqGapMs, 40);
    },
  };

  // Normal sequence completion clears its watchdog and calls onComplete once.
  let completed = 0;
  window.PandaAudio.playSequence(["cue"], 40, 0, () => { completed += 1; });
  assert.equal(playSequenceCalls, 1);
  assert.equal(timers.size, 1);
  sequenceCallbacks.shift()();
  assert.equal(completed, 1);
  assert.equal(timers.size, 0);

  // Missing ended event must still release the caller through the watchdog.
  completed = 0;
  window.PandaAudio.playSequence(["cue"], 40, 0, () => { completed += 1; });
  assert.equal(timers.size, 1);
  const fallbackTimer = [...timers.values()][0];
  fallbackTimer.fn();
  assert.equal(completed, 1);
  assert.ok(stopCalls >= 2, "fallback must stop the stale sequence");

  // A continuation registered while its reference is still playing must wait
  // for the reference and must not stop it.
  stopCalls = 0;
  audio.cue.ended = false;
  audio.cue.paused = false;
  window.PandaAudio.playAfter("cue", ["cue"], { gapMs: 400, seqGapMs: 40 });
  assert.equal(stopCalls, 0);
  assert.equal(playAfterCalls, 1);
  assert.equal(afterCallbacks.length, 0, "playAfter must not start until its FIFO turn");

  // Complete the waiting continuation once its turn starts and verify its
  // release allows the next queued continuation to start — never together.
  // First, register a second continuation behind the first one.
  audio.cue.ended = true;
  audio.cue.paused = true;
  window.PandaAudio.playAfter("cue", ["cue"], { gapMs: 400, seqGapMs: 40 });
  assert.equal(afterCallbacks.length, 1, "only the first continuation may start");

  afterCallbacks.shift()();
  assert.equal(afterCallbacks.length, 2, "the second continuation starts only after the first releases");

  const pending = [...timers.values()];
  assert.ok(pending.length >= 1, "second continuation must own a watchdog");

  // Cancelling a round must release the FIFO generation and prevent stale
  // callbacks from firing into the next scene.
  window.PandaAudio.stopAllAudio();
  assert.equal(timers.size, 0);

  console.log("audio serialization verification passed");
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}

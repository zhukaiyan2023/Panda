import assert from "node:assert/strict";

// The guard is a browser bootstrap module. Provide the minimum browser
// surface before importing it; the real app already imports the module before
// main.js creates window.PandaAudio.
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
  const { installPandaAudioSerialGuard } = await import("../audio/serialGuard.js?verify=1");
  installPandaAudioSerialGuard();

  let stopCalls = 0;
  let playSequenceCalls = 0;
  let playAfterCalls = 0;
  let sequenceCallback = null;
  let afterCallback = null;

  const audio = {
    cue: { duration: 0.1, ended: false, paused: false },
    endedCue: { duration: 0.1, ended: true, paused: true },
  };

  window.PandaAudio = {
    audio,
    stopAllAudio() {
      stopCalls += 1;
    },
    playSequence(ids, gapMs, startDelayMs, onComplete) {
      playSequenceCalls += 1;
      sequenceCallback = onComplete;
      assert.deepEqual(ids, ["cue"]);
      assert.equal(gapMs, 40);
      assert.equal(startDelayMs, 0);
    },
    playAfter(referenceId, ids, opts, onComplete) {
      playAfterCalls += 1;
      afterCallback = onComplete;
      assert.equal(referenceId, "cue");
      assert.deepEqual(ids, ["cue"]);
      assert.equal(opts.gapMs, 400);
      assert.equal(opts.seqGapMs, 40);
    },
  };

  // A normal completion clears its guard timeout and propagates exactly once.
  let completed = 0;
  window.PandaAudio.playSequence(["cue"], 40, 0, () => { completed += 1; });
  assert.equal(playSequenceCalls, 1);
  assert.equal(timers.size, 1);
  sequenceCallback();
  assert.equal(completed, 1);
  assert.equal(timers.size, 0);

  // A sequence whose ended callback never arrives must eventually release the
  // caller. Drive the guard timer manually so the test is deterministic.
  completed = 0;
  window.PandaAudio.playSequence(["cue"], 40, 0, () => { completed += 1; });
  assert.equal(timers.size, 1);
  const fallbackTimer = [...timers.values()][0];
  fallbackTimer.fn();
  assert.equal(completed, 1);
  assert.ok(stopCalls >= 2, "fallback must stop the stale sequence before advancing");

  // playAfter may register while the reference is still speaking. It must
  // not stop that reference; the final reward pattern depends on this.
  stopCalls = 0;
  audio.cue.ended = false;
  audio.cue.paused = false;
  window.PandaAudio.playAfter("cue", ["cue"], { gapMs: 400, seqGapMs: 40 });
  assert.equal(stopCalls, 0);
  assert.equal(playAfterCalls, 1);
  afterCallback();
  assert.equal(timers.size, 0);

  // Once the reference has ended, a newly requested continuation is allowed
  // to clear an older waiting continuation. This is the de-duplication guard
  // that prevents stale next-step prompts from stacking.
  stopCalls = 0;
  audio.cue.ended = true;
  audio.cue.paused = true;
  window.PandaAudio.playAfter("cue", ["cue"], { gapMs: 400, seqGapMs: 40 });
  window.PandaAudio.playAfter("cue", ["cue"], { gapMs: 400, seqGapMs: 40 });
  assert.equal(stopCalls, 2);
  assert.equal(playAfterCalls, 3);

  console.log("audio serialization verification passed");
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}

// components/panda.js — the panda character and its mood feedback.
//
// Moods:
//   idle  — default, breathing bob
//   cheer — correct answer pose. Default behaviour plays nothing —
//           the new tier-based cheer system in audio/praise.js owns
//           every correct-pick audio (roundScene/pairScene pick
//           from enc-first-N / enc-streak*-N / panda-praise-N /
//           enc-level-N / panda-cheer-N based on streak). All
//           callers pass { silent: true } so this component only
//           changes the panda's pose, never its audio. The old
//           "panda-celebrate" / "好棒" person-praise cue that used
//           to fire here is GONE.
//   think — wrong answer pose. Default behaviour plays an enc-wrong-N
//           from audio/praise.js::pickStaticWrongCue() so any caller
//           that hasn't migrated yet still gets a wrong-answer cue
//           automatically. Scenes that explicitly fire enc-wrong
//           themselves (roundScene, pairScene, gameCloud) pass
//           { silent: true } to avoid double-playing.
//
// Usage:
//   const buddy = panda(parent, { x, y, size: 240 });
//   buddy.setMood("cheer");            // pose-only (new default)
//   buddy.setMood("cheer", { silent: true });  // same — silent is now default for cheer
//   buddy.setMood("think");            // plays enc-wrong-N
//   buddy.setMood("think", { silent: true });  // pose-only

import { pickStaticWrongCue } from "../audio/praise.js";

const MOODS = {
  idle: "panda-idle",
  cheer: "panda-cheer",
  think: "panda-think",
};

// Mood → audio-cue picker. cheer is null (caller owns the audio via
// the tier chain); think rotates through enc-wrong-N so each wrong
// pick sounds fresh (no fixed "再试一次" loop).
const MOOD_CUE = {
  cheer: null,
  think: () => pickStaticWrongCue(),
};

export default function panda(parent, opts = {}) {
  const k = window.kaplay;
  const x = opts.x;
  const y = opts.y;
  const size = opts.size ?? 240;

  const root = parent.add([k.pos(x, y), k.z(opts.z ?? 1)]);

  // A failed art download must not take the game down with it, so the sprite is
  // only attached when it actually loaded. The panda is decoration; arithmetic
  // still works without it.
  const available = Object.values(MOODS).filter((name) => {
    try {
      return !!k.getSprite(name);
    } catch (_) {
      return false;
    }
  });
  if (available.length === 0) return Object.assign(root, { setMood() {} });

  const body = root.add([
    k.sprite(MOODS.idle),
    k.anchor("center"),
    k.pos(0, 0),
  ]);
  body.width = size;
  body.height = size;
  // Expose the sprite body so callers (e.g. components/celebration.js
  // for the level-complete hop) can tween width/height without reaching
  // into the implementation. root itself is just a pos+z container.
  root.body = body;

  // Gentle vertical bob so the character feels alive without pulling attention
  // away from the equation.
  let t = 0;
  root.onUpdate(() => {
    t += k.dt();
    body.pos.y = Math.sin(t * 2) * size * 0.02;
  });

  let mood = "idle";
  let resetTimer = null;

  root.setMood = (next, opts2 = {}) => {
    const spriteName = MOODS[next];
    if (!spriteName || !k.getSprite(spriteName)) return;
    mood = next;
    body.use(k.sprite(spriteName));
    body.width = size;
    body.height = size;

    const cue = MOOD_CUE[next];
    if (cue && opts2.silent !== true) window.PandaAudio?.playCue(cue());

    if (resetTimer) resetTimer.cancel();
    resetTimer = null;
    // Reactions are momentary; the character settles back to idle on its own so
    // callers never have to remember to clear a mood.
    if (next !== "idle") {
      resetTimer = k.wait(opts2.hold ?? 1.6, () => {
        mood = "idle";
        body.use(k.sprite(MOODS.idle));
        body.width = size;
        body.height = size;
      });
    }
  };

  root.getMood = () => mood;

  return root;
}

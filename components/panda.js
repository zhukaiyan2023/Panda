// components/panda.js — the panda character and its mood feedback.
//
// Moods:
//   idle  — default, breathing bob
//   cheer — correct answer, plays panda-celebrate. Callers that chain
//           their own audio off the enc-* cue should pass
//           `{ silent: true }` and fire panda-celebrate manually so the
//           two don't overlap. roundScene and pairScene do exactly this.
//   think — wrong answer, plays enc-try. Deliberately warm and curious, never
//           sad or scolding: a 3-6 year old sees it right after a mistake.
//
// Usage:
//   const buddy = panda(parent, { x, y, size: 240 });
//   buddy.setMood("cheer");            // plays panda-celebrate immediately
//   buddy.setMood("cheer", { silent: true });  // caller will fire its own cue

const MOODS = {
  idle: "panda-idle",
  cheer: "panda-cheer",
  think: "panda-think",
};

const MOOD_CUE = {
  cheer: "panda-celebrate",
  think: "enc-try",
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
    if (cue && opts2.silent !== true) window.PandaAudio?.playCue(cue);

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

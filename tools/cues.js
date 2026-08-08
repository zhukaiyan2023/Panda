// tools/cues.js — 31-cue manifest for the Panda math game.
// Each entry maps a cue id (filename without .mp3) to the text that Azure Speech
// should speak. tools/build-audio.js reads this list and generates assets/audio/<id>.mp3.

module.exports = [
  // step transitions
  { id: "step-1", text: "Find a friend." },
  { id: "step-2", text: "Make ten." },
  { id: "step-3", text: "Add the rest." },
  { id: "step-4", text: "Celebrate!" },

  // encouragements (rotated on correct answer)
  { id: "enc-great",    text: "Great job!" },
  { id: "enc-awesome",  text: "Awesome!" },
  { id: "enc-amazing",  text: "Amazing!" },
  { id: "enc-nice",     text: "Nice work!" },
  { id: "enc-try",      text: "Try again." },

  // number names (used when picking an answer)
  { id: "n-1",  text: "one" },
  { id: "n-2",  text: "two" },
  { id: "n-3",  text: "three" },
  { id: "n-4",  text: "four" },
  { id: "n-5",  text: "five" },
  { id: "n-6",  text: "six" },
  { id: "n-7",  text: "seven" },
  { id: "n-8",  text: "eight" },
  { id: "n-9",  text: "nine" },
  { id: "n-10", text: "ten" },

  // round / level flow
  { id: "round-start", text: "Round start." },
  { id: "round-end",   text: "Round end." },
  { id: "lvl-1-intro", text: "Welcome to level one. Numbers up to five." },
  { id: "lvl-2-intro", text: "Welcome to level two. Make a ten." },
  { id: "lvl-3-intro", text: "Welcome to level three. Up to twenty." },
  { id: "lvl-done",    text: "Level complete!" },

  // panda teacher feedback
  { id: "panda-hi",         text: "Hi, I'm Panda. Let's play!" },
  { id: "panda-celebrate",  text: "You did it! High five!" },

  // ui feedback
  { id: "tap-unlock",     text: "Tap to start." },
  { id: "level-locked",   text: "Finish the previous level first." },
  { id: "next",           text: "Next." },
  { id: "back",           text: "Back." },
];
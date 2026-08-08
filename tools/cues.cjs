// tools/cues.js — short audio cues for the Panda math game.
//
// Each cue is a 1-3 word utterance. The target audience is 3-6 year old
// non-English speakers (the project description names Chinese kids), so:
//   * nothing longer than 3 syllables
//   * concrete words a toddler can attach to a picture (yum, pop, hug, ten)
//   * no abstract praise like "you did it" or "high five" — these don't
//     translate and a 3 year old won't follow the meaning anyway
//   * numbers stay short ("one".."ten") so they're recognisable
//
// tools/build-audio-elevenlabs.mjs reads this list and writes
// assets/audio/<id>.mp3. CommonJS so the Azure builder can keep its style.

module.exports = [
  // ===== math round step transitions =====
  // Short prompts the panda reads to the child. Each step is a teaching beat:
  // step-1 = find the biggest, step-2 = make a ten, step-3 = split the small,
  // step-4 = count it all. Calm, gentle, never shouty.
  { id: "step-1", text: "biggest?" },
  { id: "step-2", text: "friend?" },
  { id: "step-3", text: "small?" },
  { id: "step-4", text: "count!" },

  // Variant for Level 1 (mixed-addition). When the three numbers don't pair
  // to ten we skip the friend step, so the cue list is shorter.
  { id: "lvl1-step-1", text: "see?" },
  { id: "lvl1-step-2", text: "count!" },

  // ===== encouragements =====
  // One word each, rotated on a correct answer. Cheerful sounds a toddler
  // can mimic even without understanding English.
  { id: "enc-great",   text: "yay!" },
  { id: "enc-awesome", text: "woohoo!" },
  { id: "enc-amazing", text: "wow!" },
  { id: "enc-nice",    text: "yummy!" },
  { id: "enc-try",     text: "oops!" },

  // ===== number names =====
  // Spoken slowly when a number lands on the board.
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

  // ===== spoken equation intro =====
  // Glued together by PandaAudio.playSequence to read the problem aloud,
  // e.g. "what is two plus three plus four?". Kept as separate cues so we
  // can chain them with the existing n-1..n-10 number names.
  { id: "q-what-is", text: "what is" },
  { id: "q-plus",    text: "plus" },
  { id: "q-equals",  text: "equals" },

  // ===== round / level flow =====
  { id: "round-start", text: "go!" },
  { id: "round-end",   text: "done!" },
  { id: "lvl-1-intro", text: "three friends!" },
  { id: "lvl-2-intro", text: "make ten" },
  { id: "lvl-3-intro", text: "big numbers" },
  { id: "lvl-done",    text: "all done!" },

  // ===== panda teacher feedback =====
  // Was "Hi, I'm Panda. Let's play!" — now just a friendly panda noise so the
  // child associates the character with a sound, not a sentence.
  { id: "panda-hi",        text: "hi!" },
  { id: "panda-celebrate", text: "hurray!" },

  // ===== ui feedback =====
  { id: "tap-unlock",   text: "tap!" },
  { id: "level-locked", text: "not yet" },
  { id: "next",         text: "next" },
  { id: "back",         text: "back" },

  // ===== panda-park migrated games =====
  // boat — pair to cross
  { id: "boat-intro", text: "ten!" },
  { id: "boat-pair",  text: "yes!" },
  { id: "boat-done",  text: "yay!" },

  // cloud — find all pairs in six clouds
  { id: "cloud-intro", text: "hug!" },
  { id: "cloud-pair",  text: "hug!" },
  { id: "cloud-done",  text: "yay!" },

  // bounce — pop a balloon
  { id: "bounce-intro", text: "pop!" },
  { id: "bounce-pop",   text: "pop!" },
  { id: "bounce-done",  text: "yay!" },

  // whack-a-mole — 30 second race
  { id: "whack-intro",  text: "tap tap!" },
  { id: "whack-start",  text: "go!" },
  { id: "whack-tick",   text: "hurry!" },
  { id: "whack-timeup", text: "stop!" },
  { id: "whack-done",   text: "yay!" },

  // panda feed — find pairs, panda eats
  { id: "feed-intro", text: "yum!" },
  { id: "feed-nom",   text: "yum!" },
  { id: "feed-next",  text: "more!" },
  { id: "feed-done",  text: "full!" },
];
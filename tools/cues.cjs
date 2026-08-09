// tools/cues.js — short audio cues for the Panda math game.
//
// Each cue is a 1-3 word utterance. The target audience is 3-6 year old
// Chinese-speaking kids, so:
//   * nothing longer than 3 syllables
//   * concrete words a toddler can attach to a picture (好吃, 砰, 抱, 十)
//   * no abstract praise like "you did it" — these don't translate well and
//     a 3 year old won't follow the meaning anyway
//   * numbers stay short ("一".."十") so they're recognisable
//
// tools/build-audio-elevenlabs.mjs reads this list and writes
// assets/audio/<id>.mp3. CommonJS so the Azure builder can keep its style.

module.exports = [
  // ===== math round step transitions =====
  // Short prompts the panda reads to the child. Each step is a teaching beat
  // for L2 (Make Ten): step-1 = 比一比, step-2 = 凑成十, step-3 = 拆一拆,
  // step-4 = 算一算。 Calm, gentle, never shouty.
  { id: "step-1", text: "比一比" },
  { id: "step-2", text: "凑成十" },
  { id: "step-3", text: "拆一拆" },
  { id: "step-4", text: "算一算" },

  // Variant for Level 1 (mixed-addition). The three numbers don't pair to
  // ten, so the cue list is shorter.
  { id: "lvl1-step-1", text: "看一看" },
  { id: "lvl1-step-2", text: "算一算" },

  // ===== encouragements =====
  // One word each, rotated on a correct answer. Cheerful sounds a toddler
  // can mimic even without understanding the language.
  { id: "enc-great",   text: "耶！" },
  { id: "enc-awesome", text: "太棒啦！" },
  { id: "enc-amazing", text: "哇！" },
  { id: "enc-nice",    text: "真好吃！" },
  { id: "enc-try",     text: "哎呀！" },

  // ===== number names =====
  // Spoken slowly when a number lands on the board.
  { id: "n-1",  text: "一" },
  { id: "n-2",  text: "二" },
  { id: "n-3",  text: "三" },
  { id: "n-4",  text: "四" },
  { id: "n-5",  text: "五" },
  { id: "n-6",  text: "六" },
  { id: "n-7",  text: "七" },
  { id: "n-8",  text: "八" },
  { id: "n-9",  text: "九" },
  { id: "n-10", text: "十" },

  // ===== spoken equation intro =====
  // Glued together by PandaAudio.playSequence to read the problem aloud,
  // e.g. ["几加", "三", "加", "五"] → "几加三加五". The chain reads
  // "what is three plus five?" in a way a Mandarin toddler can parse.
  { id: "q-what-is", text: "几加" },
  { id: "q-plus",    text: "加" },
  { id: "q-equals",  text: "等于" },

  // ===== round / level flow =====
  { id: "round-start", text: "开始！" },
  { id: "round-end",   text: "完成！" },
  { id: "lvl-1-intro", text: "三个好朋友" },
  { id: "lvl-2-intro", text: "凑十法" },
  { id: "lvl-3-intro", text: "大数字" },
  { id: "lvl-done",    text: "全部完成！" },

  // ===== panda teacher feedback =====
  // Friendly panda sounds so the child associates the character with a voice.
  { id: "panda-hi",        text: "你好！" },
  { id: "panda-celebrate", text: "好棒！" },

  // ===== ui feedback =====
  { id: "tap-unlock",   text: "点一下！" },
  { id: "level-locked", text: "还没解锁" },
  { id: "next",         text: "下一个" },
  { id: "back",         text: "返回" },

  // ===== panda-park migrated games =====
  // boat — pair to cross
  { id: "boat-intro", text: "凑十！" },
  { id: "boat-pair",  text: "对啦！" },
  { id: "boat-done",  text: "耶！" },

  // cloud — find all pairs in six clouds
  { id: "cloud-intro", text: "抱一抱" },
  { id: "cloud-pair",  text: "抱一抱" },
  { id: "cloud-done",  text: "耶！" },

  // bounce — pop a balloon
  { id: "bounce-intro", text: "砰！" },
  { id: "bounce-pop",   text: "砰！" },
  { id: "bounce-done",  text: "耶！" },

  // whack-a-mole — 30 second race
  { id: "whack-intro",  text: "点点点" },
  { id: "whack-start",  text: "开始！" },
  { id: "whack-tick",   text: "快点！" },
  { id: "whack-timeup", text: "停！" },
  { id: "whack-done",   text: "耶！" },

  // panda feed — find pairs, panda eats
  { id: "feed-intro", text: "好吃！" },
  { id: "feed-nom",   text: "好吃！" },
  { id: "feed-next",  text: "再来！" },
  { id: "feed-done",  text: "吃饱啦！" },
];
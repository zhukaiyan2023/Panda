// tools/cues.cjs — short Mandarin audio cues for the Panda math game.
//
// Audience: 3-6 year old Chinese-speaking kids. Each cue is one or two
// syllables; long explanations don't translate and the child can't follow
// them anyway. The panda doesn't lecture — it cheers, encourages, and
// reads the equation.
//
// tools/build-audio-edge.mjs (Microsoft Edge TTS, no API key) reads this
// list and writes assets/audio/<id>.mp3. CommonJS so other tools can
// require it without an ESM dance.
//
// Notes for translators:
//   * numbers stay as "一".."十" — they're read as separate cues and chained
//     via PandaAudio.playSequence. Don't translate "一" into "壹" etc.
//   * the L1 spoken equation intro plays "q-what-is + n-A + q-plus + n-B",
//     which reads as "几加三加五" — a perfectly natural Mandarin question.
//   * all punctuation is half-width (the TTS speaks it naturally).

module.exports = [
  // ===== L1 (三数相加) spoken entry =====
  // The L1 entry is a two-part sentence: a fixed greeting, then a 1s
  // pause, then a per-round "decompose" sentence that reads out the
  // round's actual numbers. The decompose is built at runtime by
  // scenes/level1.js from these number-agnostic chunks plus the
  // universal n-0..n-10 + q-plus + q-equals cues. Numbers are NEVER
  // baked into a per-round file — any L1 round can use this set.
  //
  // Greeting plays once when the user first opens L1.
  { id: "lvl-1-greeting", text: "你好，小朋友，我们来学习三数相加。准备好了吗？" },
  // Chunks of the per-round decompose sentence. The full sentence for
  // a round with nums [a,b,c] reads:
  //   先看下 a 加 b 加 c 等于几，这个问题可以分解成我们先看看前两个数相加
  //   a 加 b 等于几，再加上 c，小朋友 a 加 b 等于几
  { id: "lvl-1-decomp-pre",      text: "先看下" },
  { id: "lvl-1-decomp-eq",       text: "等于几，这个问题可以分解成我们先看看前两个数相加" },
  { id: "lvl-1-decomp-after-b",  text: "等于几，再加上" },
  { id: "lvl-1-decomp-q-pre",    text: "小朋友" },

  // ===== other level intros =====
  // L2 (凑十法) plays a one-time entry greeting on round 0, then per-step
  // contextual sentences take over (see the lvl-2-step-N-* chunks below).
  // L3 still uses the one-syllable framing while its own per-round
  // intros are designed.
  { id: "lvl-2-intro", text: "小朋友好，现在我们一起学习凑十法" },
  { id: "lvl-3-intro", text: "二十以内" },

  // ===== L2 per-step sentences (凑十法) =====
  // Each teaching beat is a long contextual sentence that walks the
  // child through the make-a-ten strategy. Built at runtime by
  // scenes/level2.js from these number-agnostic chunks plus the
  // universal n-0..n-10 + q-plus + q-equals cues. Same set works for
  // every L2 round.
  //
  // Step 1 — Compare (a 还是 b 谁大):
  //   "我们来计算 [a] 加 [b] 等于几，先比一比，[a] 还是 [b] 谁大"
  { id: "lvl-2-step-1-pre",  text: "我们来计算" },
  { id: "lvl-2-step-1-eq",   text: "等于几，先比一比，" },
  { id: "lvl-2-step-1-or",   text: "还是" },
  { id: "lvl-2-step-1-q",    text: "谁大" },
  //
  // Step 2 — Find friend (大数的好朋友是几):
  //   "大数是 [big]，我们找找 [big] 的好朋友，小朋友 [big] 的好朋友是几"
  { id: "lvl-2-step-2-big-pre",    text: "大数是" },
  { id: "lvl-2-step-2-find",       text: "，我们找找" },
  { id: "lvl-2-step-2-friend-pre", text: "的好朋友，小朋友" },
  { id: "lvl-2-step-2-q",          text: "的好朋友是几" },
  //
  // Step 3 — Split (小的拆成 need 和 几):
  //   "[small] 需要拆一拆，大数 [big] 的好朋友是 [need]，那 [small]
  //    能分成 [need] 和几？帮忙拆一拆"
  { id: "lvl-2-step-3-split-pre", text: "需要拆一拆，大数" },
  { id: "lvl-2-step-3-friend-pre", text: "的好朋友是" },
  { id: "lvl-2-step-3-then",      text: "，那" },
  { id: "lvl-2-step-3-can-split", text: "能分成" },
  { id: "lvl-2-step-3-q",         text: "和几？帮忙拆一拆" },
  //
  // Step 4 — Calculate (算一算):
  //   "[small] 分成 [need] 加 [rest]，算一算 [big] 加 [need] 加 [rest] 等于几"
  { id: "lvl-2-step-4-split", text: "分成" },
  { id: "lvl-2-step-4-calc",  text: "，算一算" },

  // ===== math round step transitions =====
  // Each step is one teaching beat. The panda says one phrase per beat.
  // L2 = 凑十法 (Make a Ten) — 4 beats.
  { id: "step-1", text: "比一比" },   // big ? small
  { id: "step-2", text: "凑成十" },   // big + ? = 10
  { id: "step-3", text: "拆一拆" },   // ? + ? = small
  { id: "step-4", text: "算一算" },   // a + (need+rest) = ?

  // L1 = 三数相加 (mixed-addition) — only 2 beats.
  { id: "lvl1-step-1", text: "找一对" },     // step 1: 找出相加得 10 的一对
  { id: "lvl1-step-2", text: "加剩下的" },   // step 2: pairSum + third

  // ===== spoken equation intro =====
  // Glued together by PandaAudio.playSequence. L1 step 1 chains
  //   ["几加", n-A, "加", n-B]            → "几加三加五"
  // L1 step 2 chains
  //   ["几加", n-pairSum, "加", n-third]  → "几加六加三"
  // Both read as a natural Mandarin question: "what is three plus five?".
  // q-equals is reserved for L2/L3 reads that include the result slot.
  { id: "q-what-is", text: "几加" },
  { id: "q-plus",    text: "加" },
  { id: "q-equals",  text: "等于几" },

  // ===== result read-back =====
  // For "X 加 Y 加 Z 等于 答" — the cue after the last addend and
  // before the answer number. Different from q-equals ("等于几"),
  // which is the question form for an unknown answer. The L1 step-2
  // onAdvance uses equals to read the final equation as a reward.
  { id: "equals",    text: "等于" },

  // ===== number names =====
  // Read slowly when a number lands on the board. Single-syllable
  // Mandarin digits are easy to chain into multi-digit sums.
  { id: "n-0",  text: "零" },
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

  // ===== encouragements =====
  // One exclamation each, rotated on a correct answer. Cheerful Mandarin
  // interjections a toddler can mimic — none of them praise the child
  // explicitly (Chinese parents use praise sparingly; a 3 year old
  // understands "耶！" or "哇！" without needing "你真棒").
  { id: "enc-great",   text: "耶！" },
  { id: "enc-awesome", text: "太棒啦！" },
  { id: "enc-amazing", text: "哇！" },
  { id: "enc-nice",    text: "真好！" },
  { id: "enc-try",     text: "再试试" },

  // ===== round / level flow =====
  { id: "round-start", text: "开始" },
  { id: "round-end",   text: "完成" },
  { id: "lvl-done",    text: "全部完成啦" },

  // ===== panda teacher feedback =====
  // Used for setMood transitions. panda-hi plays on first contact (not
  // currently triggered); panda-celebrate plays on cheer unless silent.
  { id: "panda-hi",        text: "你好呀" },
  { id: "panda-celebrate", text: "好棒" },

  // ===== ui feedback =====
  { id: "tap-unlock",   text: "点一下" },
  { id: "level-locked", text: "还没到这一关" },
  { id: "next",         text: "下一个" },
  { id: "back",         text: "返回" },

  // ===== panda-park migrated games =====
  // Boat — 凑十过河. The first round opens with a friendly prompt; each
  // correct pair gets a small celebration.
  { id: "boat-intro", text: "凑十过河" },
  { id: "boat-pair",  text: "凑十啦" },
  { id: "boat-done",  text: "过河啦" },

  // Cloud — 找抱抱. Find all the friends-of-10 pairs hidden in clouds.
  { id: "cloud-intro", text: "找抱抱" },
  { id: "cloud-pair",  text: "抱到啦" },
  { id: "cloud-done",  text: "全找到啦" },

  // Bounce — 扎气球. One balloon carries the friend count.
  { id: "bounce-intro", text: "扎气球" },
  { id: "bounce-pop",   text: "砰" },
  { id: "bounce-done",  text: "全扎完啦" },

  // Whack-a-mole — 打地鼠. Time-pressure game; the only audio cues are
  // the start signal and the timeout, otherwise the round would be a
  // wall of sound.
  { id: "whack-intro",  text: "打地鼠" },
  { id: "whack-start",  text: "开始" },
  { id: "whack-tick",   text: "快点" },
  { id: "whack-timeup", text: "时间到" },
  { id: "whack-done",   text: "赢啦" },

  // Feed — 喂熊猫. Pick pairs, the panda eats them.
  { id: "feed-intro", text: "帮熊猫吃" },
  { id: "feed-nom",   text: "好吃" },
  { id: "feed-next",  text: "再来" },
  { id: "feed-done",  text: "吃饱啦" },
];
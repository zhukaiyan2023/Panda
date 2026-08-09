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
// Renamed in this revision (per user feedback, 2026-08-09):
//   "三个好朋友" (level-1 title concept) → "三数相加"
//   "先加一对" (L1 step 1 concept)        → "两数相加" (reflected in
//                                              stepLabels; not a standalone cue)
//   "加剩下的" (L1 step 2 concept)        → "计算结果" (same — reflected
//                                              in stepLabels; not standalone)
//
// The lvl1-step-1 ("找一对") / lvl1-step-2 ("加剩下的") MP3s were
// orphans — L1 step audio is the per-round decompose sentence, not
// standalone one-word cues. Removed from CUE_IDS.
//
// Orphan single-cues swept:
//   panda-hi         — no caller
//   round-start / -end, tap-unlock, level-locked, next, back
//                    — no caller
//   panda-celebrate  — was blocked by `silent: true` on every cheer;
//                      unblocked in roundScene + pairScene so the panda
//                      actually speaks on a correct pick (kept the cue)
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
  // Greeting plays once when the user first opens L1. Single sentence,
  // matches the L2 ("凑十法") and L3 ("二十以内") greeting style.
  { id: "lvl-1-greeting", text: "小朋友好，我们来学习三数相加" },
  // Chunks of the per-round decompose sentence. The full sentence for
  // a round with nums [a,b,c] reads:
  //   先看下 a 加 b 加 c 等于几，这个问题可以分解成我们先看看前两个数相加。
  //   a 加 b 等于几
  // (Earlier versions also prompted "再加上 c" and a repeat
  // "小朋友 a 加 b 等于几" — the user found those redundant. The
  // simplified sentence ends at the actual question for step 1.)
  { id: "lvl-1-decomp-pre",      text: "先看下" },
  { id: "lvl-1-decomp-eq",       text: "等于几，这个问题可以分解成我们先看看前两个数相加。" },

  // ===== other level intros =====
  // L2 (凑十法) drops the kid straight into round 0 step 1 — the lvl-2-intro
  // greeting ("现在我们一起学习凑十法") was removed per user feedback. The
  // per-step audio already names the strategy on the first round.
  // L3 (二十以内) keeps its entry greeting, then per-step contextual
  // sentences take over (see the lvl-3-step-N-* chunks below).
  { id: "lvl-3-intro", text: "小朋友好，现在我们一起学习二十以内的计算" },

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
  //   "大数是 [big]，我们找找 [big] 的好朋友，[big] 的好朋友是几"
  { id: "lvl-2-step-2-big-pre",    text: "大数是" },
  { id: "lvl-2-step-2-find",       text: "，我们找找" },
  { id: "lvl-2-step-2-friend-pre", text: "的好朋友，" },
  { id: "lvl-2-step-2-q",          text: "的好朋友是几" },
  //
  // Step 3 — Split (小的拆成 need 和 几):
  //   "[small] 需要拆一拆，[small] 能分成 [need] 和几？"
  // The "大数 [big] 的好朋友是 [need]" middle beat was removed — the
  // child already heard who the friend was in step 2, repeating it
  // here just made the chain longer without adding information.
  { id: "lvl-2-step-3-split-pre", text: "需要拆一拆" },
  { id: "lvl-2-step-3-can-split", text: "能分成" },
  { id: "lvl-2-step-3-q",         text: "和几？" },
  //
  // Step 4 — Calculate (算一算):
  //   "[small] 分成 [need] 加 [rest]，算一算 [big] 加 [need] 加 [rest] 等于几"
  { id: "lvl-2-step-4-split", text: "分成" },
  { id: "lvl-2-step-4-calc",  text: "，算一算" },

  // ===== L3 per-step sentences (二十以内) =====
  // L3 teaches the "split 2-digit into 10 + ones, then add the ones to
  // b" strategy in 2 teaching beats. Built at runtime by
  // scenes/level3.js from these number-agnostic chunks plus the
  // universal n-* / q-* cues. Same set works for every L3 round (a is
  // always 11-19, ones = a % 10, b is 1-9, and ones + b <= 10 — no
  // carrying).
  //
  // Step 1 — Split the 2-digit:
  //   "11+8等于几，我们先把 11 进行拆分，拆成十加几"
  //     (a + b 引导, then "我们先把", then "进行拆分", then "拆成十加几")
  { id: "lvl-3-step-1-pre",   text: "我们先把" },
  { id: "lvl-3-step-1-split", text: "进行拆分" },
  { id: "lvl-3-step-1-q",     text: "拆成十加几" },
  //
  // Step 2 — Add the two ones: "个位相加 [ones] 加 [b] 等于几"
  //   kid picks sum; the reward audio after correct reads "a+b=answer"
  //   (uses universal n-* / q-plus / equals cues — no chunks needed).
  { id: "lvl-3-step-2-pre", text: "个位相加" },

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
  // Teens (11-19) — previously chained as "n-10" + "n-{X}" which read
  // as "十---五" (a pause between the two syllables) instead of as a
  // single word "十五". Pre-baked so L3 step 1 ("先把 15 拆成十加几")
  // reads naturally.
  { id: "n-11", text: "十一" },
  { id: "n-12", text: "十二" },
  { id: "n-13", text: "十三" },
  { id: "n-14", text: "十四" },
  { id: "n-15", text: "十五" },
  { id: "n-16", text: "十六" },
  { id: "n-17", text: "十七" },
  { id: "n-18", text: "十八" },
  { id: "n-19", text: "十九" },

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
  { id: "lvl-done",    text: "全部完成啦" },

  // ===== panda teacher feedback =====
  // The panda is the heart of the game; when it cheers, the kid should
  // hear it. The previous version blocked panda-celebrate with
  // `silent: true` on every cheer (because the panda mood triggered the
  // cue automatically via components/panda.js). The fix was to drop the
  // silent flag from roundScene + pairScene — the panda now speaks on
  // every correct pick, on top of the rotated enc-* cue. This is the
  // only remaining panda-hi-style cue; panda-hi itself is unused.
  { id: "panda-celebrate", text: "好棒" },

  // ===== panda-park migrated games =====
  // Boat — 凑十过河. The first round opens with a friendly greeting that
  // walks the child through what's about to happen (panda wants to cross,
  // pick two boats that sum to ten, help the panda).
  { id: "boat-intro", text: "小朋友，小熊猫要过河，必须把相加等于十的小船选出来，才能过河，帮帮小熊猫吧。" },
  { id: "boat-pair",  text: "凑十啦" },
  { id: "boat-done",  text: "过河啦" },

  // Cloud — 找抱抱. Find all the friends-of-10 pairs hidden in clouds.
  { id: "cloud-intro", text: "找抱抱" },
  { id: "cloud-pair",  text: "抱到啦" },
  { id: "cloud-done",  text: "全找到啦" },

  // Bounce — 扎气球. Decomposition practice (a + ? = N, N ≤ 10). The intro
  // is short and concrete: greet, name the equation, name the action. A 3-6
  // year old can't follow a long explanation — they pick up the mechanic
  // from the equation on screen + this one-sentence nudge.
  { id: "bounce-intro", text: "小朋友好，看上面的等式，找那个能凑出答案的气球，扎破它。" },
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
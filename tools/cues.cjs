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
//   panda-celebrate  — DELETED 2026-08-10. Was a "好棒" person-praise
//                      cue that fired on every correct pick, stacking
//                      on top of the rotated enc-* cue (double-praise
//                      inflation — see tools/panda-praise-redesign-report.md).
//                      All call sites that hardcoded "panda-celebrate"
//                      now use ctx.lastEncourageId, which roundScene
//                      and pairScene set to the actual last cue of
//                      the new tier-based cheer chain (enc-streak3-N,
//                      panda-praise-N, enc-level-N, or panda-cheer-N).
//   enc-great/enc-awesome/enc-amazing/enc-nice
//                  — DELETED 2026-08-10. Replaced by the enc-first-N,
//                    enc-streak3-N, enc-streak5-N, enc-streak10-N,
//                    enc-level-N tier system (see audio/praise.js).
//   enc-try          — DELETED 2026-08-10. Replaced by enc-wrong-N
//                    (universal) and enc-near-N (凑十法 coaching).
//                    panda.js's MOOD_CUE.think now points to
//                    pickStaticWrongCue() from audio/praise.js.
//
// Notes for translators:
//   * numbers stay as "一".."十" — they're read as separate cues and chained
//     via PandaAudio.playSequence. Don't translate "一" into "壹" etc.
//   * the L1 spoken equation intro plays "q-what-is + n-A + q-plus + n-B",
//     which reads as "几加三加五" — a perfectly natural Mandarin question.
//   * all punctuation is half-width (the TTS speaks it naturally).

module.exports = [
  // ===== L1 (三数相加) spoken entry =====
  // The L1 entry has NO greeting audio — per user feedback 2026-08-10.
  // The old "lvl-1-greeting" ("小朋友好，我们来学习三数相加") was a vague
  // topic statement that ate ~4s before any guidance appeared; it gave
  // no instruction for what the kid should DO. The per-round "decompose"
  // sentence now IS the entry guidance — built at runtime by scenes/
  // level1.js from these number-agnostic chunks plus the universal
  // n-0..n-10 + q-plus + q-equals cues. For nums [a,b,c] the full
  // sentence reads:
  //   先看下 a 加 b 加 c 等于几，这个问题可以分解成我们先看看前两个数相加。
  //   a 加 b 等于几
  // (Earlier versions also prompted "再加上 c" and a repeat
  // "小朋友 a 加 b 等于几" — the user found those redundant. The
  // simplified sentence ends at the actual question for step 1.)
  // Numbers are NEVER baked into a per-round file — any L1 round uses
  // this same set.
  { id: "lvl-1-decomp-pre",      text: "先看下" },
  { id: "lvl-1-decomp-eq",       text: "等于几，这个问题可以分解成我们先看看前两个数相加。" },

  // ===== other level intros =====
  // L2 (凑十法) drops the kid straight into round 0 step 1 — the lvl-2-intro
  // greeting ("现在我们一起学习凑十法") was removed per user feedback. The
  // L3 ("二十以内") lvl-3-intro ("现在我们一起学习二十以内的计算", the
  // "big numbers" voice) was ALSO removed 2026-08-10 for the same reason:
  // both were vague topic statements with no instruction for what the
  // kid should DO. The per-step audio now IS the entry guidance.
  // per-step audio already names the strategy on the first round.
  // L3 (二十以内) has NO entry greeting — removed 2026-08-10. The
  // per-round step 1 audio ("11+8等于几，我们先把 11 进行拆分，拆成十加几")
  // IS the entry guidance: names the equation AND the strategy in one
  // fluent sentence. See the lvl-3-step-N-* chunks below for the
  // number-agnostic pieces.

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

  // ===== encouragements (process-praise tier system) =====
  // Redesigned 2026-08-10 per the praise audit (see
  // tools/panda-praise-redesign-report.md). Three principles drove the
  // rewrite:
  //
  //   1. Process praise over person praise (Dweck 1998). Every cue
  //      prioritises "你试了 / 你找到了" over "你真聪明 / 好棒" —
  //      person praise in failure context destroys persistence, and the
  //      3-6 yr brain reads generic delight as "I did the right thing"
  //      without learning WHAT they did right.
  //
  //   2. Streak-based escalation. The first correct pick and the 30th
  //      correct pick no longer sound the same. The five tiers are
  //      dispatched by audio/praise.js::pickTier based on the kid's
  //      running streak. Tier "first" is the only one that fires on
  //      every correct pick; higher tiers build on it.
  //
  //   3. No more "panda-celebrate" double-praise stacking. The panda
  //      character cue only fires on tier >= "streak3" (and on level
  //      complete as a "cheer" not "praise"). This keeps the panda
  //      voice rare and high-value, avoiding the Aronson-effect
  //      inflation where every correct = two cheers = zero signal.
  //
  // All 33 cues below are 1-2s (math-discovery ≤3s), Mandarin-only,
  // and never overlap with the step's system prompt audio. Callers
  // stopAllAudio() before invoking pickCheerCue()/pickWrongCue() so
  // the per-step audio chain and the encouragement never play at the
  // same moment.
  //
  // --- Tier: first-correct (every correct pick, no panda) ---
  { id: "enc-first-1", text: "答对啦！" },
  { id: "enc-first-2", text: "找对啦！" },
  { id: "enc-first-3", text: "对喽！" },
  { id: "enc-first-4", text: "好眼力！" },
  // --- Tier: streak-3 (consecutive correct, panda joins) ---
  { id: "enc-streak3-1", text: "连着对了三题！" },
  { id: "enc-streak3-2", text: "你越来越快了！" },
  { id: "enc-streak3-3", text: "小熊猫觉得你很认真！" },
  // --- Tier: streak-5 (process-praise strong signal) ---
  { id: "enc-streak5-1", text: "你试了好几次才对，这叫有耐心！" },
  { id: "enc-streak5-2", text: "你找到方法啦！" },
  { id: "enc-streak5-3", text: "连对五题啦！" },
  // --- Tier: streak-10 (celebration + 称号) ---
  { id: "enc-streak10-1", text: "连对十题！凑十小达人！" },
  { id: "enc-streak10-2", text: "哇，十题都对！" },
  { id: "enc-streak10-3", text: "小熊猫都为你鼓掌！" },
  // --- Tier: level-complete (always enc-level + panda-cheer) ---
  { id: "enc-level-1", text: "这一关全部完成啦！" },
  { id: "enc-level-2", text: "你过关啦！" },
  { id: "enc-level-3", text: "太厉害啦！" },
  { id: "enc-level-4", text: "全部找对啦！" },
  // --- Wrong-answer (universal, all levels) ---
  { id: "enc-wrong-1", text: "没关系，再试一次" },
  { id: "enc-wrong-2", text: "别着急，再看看" },
  { id: "enc-wrong-3", text: "我们再来一次吧" },
  // --- Near-miss wrong (凑十法专属 coaching; L2/L3 only) ---
  { id: "enc-near-1", text: "差一点啦，再想想" },
  { id: "enc-near-2", text: "你选的里面有 5，再找一个就能凑十" },
  { id: "enc-near-3", text: "就快找到啦，别放弃" },
  // --- Math-discovery feedback (process-praise on specific finding;
  //     L2/L3 only — L1 kids can't parse the math language yet) ---
  { id: "enc-specific-pair",  text: "你找到了能凑成十的一对！" },
  { id: "enc-specific-double", text: "你找到了双胞胎，5 和 5！" },
  { id: "enc-specific-decomp", text: "你把 8 分成了两部分！" },
  { id: "enc-specific-friend", text: "你找到了 10 的好朋友！" },

  // ===== panda character cues =====
  // The panda speaks in its own voice (recorded separately to give a
  // warmer, slower, first-person "小熊猫觉得..." cadence). It only
  // joins the cheer on tier >= streak3, and only on level-complete
  // for the cheer. This is the new home of the old "panda-celebrate"
  // "好棒" cue — that string was deleted because it's person-praise
  // and was double-firing on every correct pick. Every call site that
  // referenced "panda-celebrate" now uses ctx.lastEncourageId (set by
  // roundScene.onPick to the actual last cue of the cheer chain).
  { id: "panda-praise-1", text: "小熊猫觉得你很会想办法！" },
  { id: "panda-praise-2", text: "小熊猫也想去试试看！" },
  { id: "panda-praise-3", text: "小熊猫陪你一起想！" },
  { id: "panda-cheer-1",  text: "小熊猫跳起来啦！" },
  { id: "panda-cheer-2",  text: "小熊猫拍拍手！" },

  // ===== round / level flow =====
  { id: "lvl-done",    text: "全部完成啦" },
  // Friendly cue played when a kid taps a daily-locked card OR
  // enters the dailyDone scene after hitting the per-level daily
  // round cap. Mandarin: "今天已经练够啦，明天再来哦".
  { id: "daily-done",  text: "今天已经练够啦，明天再来哦" },

  // ===== panda-park migrated games =====
  // Boat — 凑十过河. The first round opens with a friendly greeting that
  // walks the child through what's about to happen (panda wants to cross,
  // pick two boats that sum to ten, help the panda).
  { id: "boat-intro", text: "小朋友，小熊猫要过河，必须把相加等于十的小船选出来，才能过河，帮帮小熊猫吧。" },
  { id: "boat-pair",  text: "凑十啦" },
  { id: "boat-done",  text: "过河啦" },

  // Cloud — 算式选云. Read the equation at the top, tap the cloud whose
  // number equals the answer. Mirrors bounce-intro's structure: greet, name
  // the equation, name the action. The on-screen equation + cue together are
  // enough for a 3-6 year old to pick up the mechanic.
  { id: "cloud-intro", text: "小朋友好，看上面的算式，找到答案对的那朵云。" },
  { id: "cloud-pair",  text: "对啦" },     // generic correct-tap callout (was "抱到啦", stale pair-match metaphor)
  { id: "cloud-done",  text: "全做完啦" },

  // Bounce — 扎气球. Decomposition practice (a + ? = N, N ≤ 10). The intro
  // is short and concrete: greet, name the equation, name the action. A 3-6
  // year old can't follow a long explanation — they pick up the mechanic
  // from the equation on screen + this one-sentence nudge.
  { id: "bounce-intro", text: "小朋友好，看上面的等式，找那个能凑出答案的气球，扎破它。" },
  { id: "bounce-pop",   text: "啵啵！" },
  { id: "bounce-done",  text: "全炸啦！" },
  // Whack-a-mole removed 2026-08-13 (user feedback: "做的太差了").

  // Feed — 喂熊猫. Pick pairs, the panda eats them.
  { id: "feed-intro", text: "帮熊猫吃" },
  { id: "feed-nom",   text: "好吃" },
  { id: "feed-next",  text: "再来" },
  { id: "feed-done",  text: "吃饱啦" },
  // Per-target question prompts for the dynamic-target feed variant.
  // Reads as "选两个加起来是七" / "选两个加起来是八" etc., so the kid
  // hears a distinct question for each round instead of the same fixed
  // "等于十" line. Numbers stay as separate n-N cues chained in
  // gameFeed.js, so these only carry the leading phrase.
  { id: "feed-q-pre", text: "选两个加起来是" },
];
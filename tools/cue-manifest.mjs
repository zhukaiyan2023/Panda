// tools/cue-manifest.mjs — the single source of truth for every spoken cue.
//
// Before this file, the cue texts were spread across five build scripts
// (build-composite-audio, build-additional-audio, build-intro-cues-tencent,
// build-l2-step2-mirrored-tencent, build-audio-tier-*), several of which
// re-implemented the pool math inline. That duplication had already drifted:
// build-composite-audio.mjs enumerates an `l3Pool` and then never uses it —
// its L3 section iterates `l2Pool` instead, so `r.a` is undefined and the
// script throws before writing a single L3 cue.
//
// Here the pools are IMPORTED from data/pools.js — the same module the game
// itself runs on — so cue text and gameplay can never disagree about what a
// round contains.
//
// Exports `buildManifest()` returning `[{ id, text }]`, deduped, with a
// collision check: two cues that share an id must share their text, otherwise
// whichever was written last would silently win.

import { createRequire } from "node:module";

import { poolGens } from "../data/pools.js";

const require = createRequire(import.meta.url);
const HAND_CUES = require("./cues.cjs");

const NUM = [
  "零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九",
  "二十", "二十一", "二十二", "二十三", "二十四", "二十五", "二十六",
  "二十七", "二十八", "二十九",
];

function numZh(n) {
  if (!Number.isInteger(n) || n < 0 || n >= NUM.length) {
    throw new Error(`numZh out of range: ${JSON.stringify(n)}`);
  }
  return NUM[n];
}

// Which two addends pair first, and which is the leftover. Index-driven so a
// triple with repeated values ([3, 2, 2]) resolves the third correctly instead
// of matching by value and losing track of which 2 was consumed.
function choosePair(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === 10) {
        const thirdIdx = nums.findIndex((_, k) => k !== i && k !== j);
        return { pair: [nums[i], nums[j]], third: nums[thirdIdx] };
      }
    }
  }
  return { pair: [nums[0], nums[1]], third: nums[2] };
}

export function buildManifest() {
  const out = [];
  const push = (id, text) => out.push({ id, text });

  // ---- Hand-authored short cues (numbers, praise, game chatter) ----------
  for (const c of HAND_CUES) push(c.id, c.text);

  // ---- L1 三数相加<10 ----------------------------------------------------
  for (const r of poolGens[1]()) {
    const [a, b, c] = r.nums;
    push(`l1-intro-${a}-${b}-${c}`,
      `${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先看看前两个数相加。`);
    push(`l1-sub-${a}-${b}`, `${numZh(a)}加${numZh(b)}等于几`);
    push(`l1-rwd-${a}-${b}-${c}-${r.answer}`,
      `${numZh(a)}加${numZh(b)}加${numZh(c)}等于${numZh(r.answer)}`);
    push(`l1-step2-${a + b}-${c}`, `${numZh(a + b)}加${numZh(c)}等于几`);
  }

  // ---- L2 两个数凑十 -----------------------------------------------------
  for (const r of poolGens[2]()) {
    const [a, b, c] = r.nums;
    push(`l1-intro-mt-${a}-${b}-${c}`,
      `${numZh(a)}加${numZh(b)}加${numZh(c)}等于几，这个问题可以分解成我们先找出相加为10的数。`);
    push(`l1-rwd-${a}-${b}-${c}-${r.answer}`,
      `${numZh(a)}加${numZh(b)}加${numZh(c)}等于${numZh(r.answer)}`);
    // The pair always sums to 10 here, so step 2 is "10 + third". Both
    // orderings are emitted because level2.js mirrors the phrasing to match
    // where the ten sits on screen (a+b=10 → ten on the left, b+c=10 → right).
    const { third } = choosePair(r.nums);
    push(`l1-step2-10-${third}`, `十加${numZh(third)}等于几`);
    push(`l1-step2-${third}-10`, `${numZh(third)}加十等于几`);
  }
  push("l1-sub-find-ten", "哪两个数相加等于10");

  // ---- L3 凑十法 (cue ids are l2-* for historical reasons) ---------------
  for (const r of poolGens[3]()) {
    const { a, b, need, rest, answer } = r;
    const big = Math.max(a, b);
    const small = Math.min(a, b);
    push(`l2-s1-${a}-${b}`,
      `我们来计算${numZh(a)}加${numZh(b)}等于几，先比一比，${numZh(a)}还是${numZh(b)}谁大`);
    push(`l2-s2-${big}`,
      `大数是${numZh(big)}，我们找找${numZh(big)}的好朋友，${numZh(big)}的好朋友是几`);
    push(`l2-s3-${small}-${need}`,
      `${numZh(small)}需要拆一拆，${numZh(small)}能分成${numZh(need)}和几？`);
    push(`l2-s4-${small}-${need}-${rest}-${big}`,
      `${numZh(small)}分成${numZh(need)}加${numZh(rest)}，算一算${numZh(big)}加${numZh(need)}加${numZh(rest)}等于几`);
    // Comparison reveal, played after the child picks 大于 / 小于. Equal
    // addends auto-advance with no pick, so they need no cue.
    if (a !== b) {
      push(`l2-cmp-${a}-${b}`, `${numZh(a)}${a > b ? "大于" : "小于"}${numZh(b)}`);
    }
    // Swapped step-4 phrasing, used whenever the smaller addend is written
    // first (round.a < round.b). The aIsSmall visual keeps the question's
    // order ("rest + need + big"), so the audio must read the same way.
    // Applies to rest === need cases too (e.g. 6+7 → "3 + 3 + 7") — the
    // previous `rest !== need` check was wrong because "big + need + rest"
    // (e.g. "7+3+3") and "rest + need + big" (e.g. "3+3+7") sit in
    // different slot positions even when the digits commute. Without
    // this, 6+7, 4+8, 2+9 played canonical audio over swapped visuals.
    if (a < b) {
      push(`l2-s4s-${a}-${b}-${need}-${rest}-${big}`,
        `${numZh(small)}分成${numZh(rest)}加${numZh(need)}，算一算${numZh(rest)}加${numZh(need)}加${numZh(big)}等于几`);
    }
    push(`l2-rwd-${a}-${b}-${answer}`, `${numZh(a)}加${numZh(b)}等于${numZh(answer)}`);
  }

  // ---- L4 二十以内 (cue ids are l3-* for historical reasons) -------------
  for (const r of poolGens[4]()) {
    const { a, b, answer } = r;
    const ones = a % 10;
    push(`l3-s1-${a}-${b}`,
      `${numZh(a)}加${numZh(b)}等于几，我们先把${numZh(a)}进行拆分，拆成十加几`);
    push(`l3-s2-${ones}-${b}`, `个位相加${numZh(ones)}加${numZh(b)}等于几`);
    push(`l3-s3-${ones + b}`, `十加${numZh(ones + b)}等于几`);
    push(`l3-rwd-${a}-${b}-${answer}`, `${numZh(a)}加${numZh(b)}等于${numZh(answer)}`);
  }

  // ---- L5 十几加十几 (cue ids are l5-*) ------------------------------------
  // Pool rule (data/pools.js generateL5Pool):
  //   a, b ∈ [11, 19]; onesA + onesB ≤ 9 (no carry); sum = onesA+onesB;
  //   answer = a + b ∈ [22, 29].
  // 5-step teaching: 拆 a / 拆 b / 加个位 / 加十位 / 加起来.
  for (const r of poolGens[5]()) {
    const { a, b, onesA, onesB, sum, answer } = r;
    push(`l5-s1-${a}-${b}`,
      `${numZh(a)}加${numZh(b)}等于几，我们先把${numZh(a)}拆成十加几`);
    push(`l5-s2-${a}-${b}`,
      `我们再把${numZh(b)}拆成十加几`);
    push(`l5-s3-${onesA}-${onesB}`,
      `个位相加${numZh(onesA)}加${numZh(onesB)}等于几`);
    // l5-s4 is a static cue — emitted once outside the loop below.
    push(`l5-s5-${sum}`,
      `二十加${numZh(sum)}等于几`);
    push(`l5-rwd-${a}-${b}-${answer}`,
      `${numZh(a)}加${numZh(b)}等于${numZh(answer)}`);
  }
  // Static cue — every L5 round plays this on step 4. The phrasing is
  // "十加十等于几" (ten plus ten equals what?), NOT "等于二十" — the answer
  // options at step 4 are {18, 19, 20} so the kid needs to compute the
  // answer themselves, the audio shouldn't give it away. Per user
  // feedback 2026-08-15: "十加十等于二十应该改成十加十等于几".
  push("l5-s4", "十加十等于几");

  // ---- L6 十以内减法 (cue ids are l6-*) -----------------------------------
  // Single teaching beat — kid just reads the equation and picks the
  // answer. Per user feedback 2026-08-16 ("没有介绍的声音，用腾讯生成"),
  // every L6 round plays its own step-1 prompt so the equation is named
  // before the answer options appear.
  for (const r of poolGens[6]()) {
    const { a, b, answer } = r;
    push(`l6-s1-${a}-${b}`, `${numZh(a)}减${numZh(b)}等于几`);
    push(`l6-rwd-${a}-${b}-${answer}`, `${numZh(a)}减${numZh(b)}等于${numZh(answer)}`);
  }

  // ---- L7 十几减几（不退位） (cue ids are l7-*) ---------------------------
  // Pool rule (data/pools.js generateL7Pool):
  //   a ∈ [11, 19]; ones = a % 10; b ∈ [1, ones]; answer = a - b.
  // 2-step teaching (after the 2026-08-16 redesign — kid picks ones,
  // then picks the answer after hearing sub + combine as one chain).
  // The diff (ones - b) is auto-revealed in the result row, the audio
  // chain states it. Strategy: split a into 10 + ones, then read the
  // answer off the bottom "10 + diff = ?" row.
  for (const r of poolGens[7]()) {
    const { a, b, ones, answer } = r;
    const diff = ones - b;
    push(`l7-s1-${a}-${b}`,
      `${numZh(a)}减${numZh(b)}等于几，我们先把${numZh(a)}拆成十加几`);
    // l7-s2 STATES the diff (not asks) — kid mentally computes the
    // ones subtraction as they listen, and the diff box reveals to the
    // value when the result row appears after this audio.
    // l7-s2 STATES the diff — retained for audio chains that want to
    // reveal the ones-sub result instead of asking the kid to compute
    // it. Step 2 in the current L7 flow uses l7-s2q (below) instead.
    push(`l7-s2-${ones}-${b}`,
      `个位相减${numZh(ones)}减${numZh(b)}等于${numZh(diff)}`);
    // l7-s2q ASKS for the diff — the L7 step 2 question ("9 减 8 等于
    // 几"). Per user feedback 2026-08-16: "第二步，应该是 九减八等于
    // 几" — the kid computes the ones subtraction themselves, then
    // step 3 asks for the final answer ("10+1=几").
    push(`l7-s2q-${ones}-${b}`,
      `个位相减${numZh(ones)}减${numZh(b)}等于几`);
    push(`l7-s3-${diff}`, `十加${numZh(diff)}等于几`);
    push(`l7-rwd-${a}-${b}-${answer}`,
      `${numZh(a)}减${numZh(b)}等于${numZh(answer)}`);
  }

  // ---- L8 十几减几（退位） (cue ids are l8-*) ---------------------------
  // Pool rule (data/pools.js generateL8Pool):
  //   a ∈ [11, 19]; ones = a % 10; b ∈ [ones + 1, 9];
  //   sub = 10 - b; answer = ones + sub.
  // Same 3-row persistent diagram as L7 (anchor / split / result), but
  // the 凑十法 strategy is 破十法 instead of 平十法: subtract b from 10
  // (not from ones, since b > ones is the borrow case), then add the
  // leftover ones. Mirrors L7's 破十法 for the non-borrow case (which
  // subtracts b from ones, since ones ≥ b there).
  //
  // 2026-08-16 redesign — user feedback "level8: 也要像这样改造" made L8
  // match L7's 3-row structure, then "破十法 / 名字也改一下" switched
  // the step-2 audio from "b 拆成 ones 和 几" (平十法) to "十减 b 等于几"
  // (破十法), with the result row reading "ones + sub = ?" instead of
  // "10 - rest = ?". All l8-s2/l8-s2q/l8-s3 cue IDs from the 平十法
  // version were retired; this is the only set the L8 scene references.
  for (const r of poolGens[8]()) {
    const { a, b, ones, answer } = r;
    const sub = 10 - b;
    push(`l8-s1-${a}-${b}`,
      `${numZh(a)}减${numZh(b)}等于几，我们先把${numZh(a)}拆成十加几`);
    // l8-s2 ASKS for sub (十减 b 等于几) — kid mentally reduces 10 - b as
    // they listen. Result row "ones + sub = ?" appears after this with
    // sub to be picked in step 2.
    push(`l8-s2-${b}`,
      `十减${numZh(b)}等于几`);
    // l8-s3 ASKS for the final answer using sub ("ones + sub = ?"). The
    // cue id encodes (ones, b) — sub = 10 - b is determined by b — but
    // the audio text needs both ones and sub so it matches the result
    // row the kid is filling.
    push(`l8-s3-${ones}-${b}`,
      `${numZh(ones)}加${numZh(sub)}等于几`);
    push(`l8-rwd-${a}-${b}-${answer}`,
      `${numZh(a)}减${numZh(b)}等于${numZh(answer)}`);
  }

  // ---- Dedupe, and refuse to guess on conflicts -------------------------
  const seen = new Map();
  const deduped = [];
  for (const c of out) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id)) {
      throw new Error(`illegal cue id: ${JSON.stringify(c.id)}`);
    }
    if (seen.has(c.id)) {
      if (seen.get(c.id) !== c.text) {
        throw new Error(
          `cue id "${c.id}" has two different texts:\n  ${seen.get(c.id)}\n  ${c.text}`,
        );
      }
      continue;
    }
    seen.set(c.id, c.text);
    deduped.push(c);
  }
  return deduped;
}

export default buildManifest;

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
  // Static cue — every L5 round plays this on step 4.
  push("l5-s4", "十加十等于二十");

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

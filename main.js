// main.js — Panda H5 (Kaplay) boot + audio pool + iPad viewport plumbing.
// No build step. Loads scenes and components from ./scenes and ./components.
//
// levels data is inlined as a JS const (not fetched, not JSON-imported) so
// the game boots under the file:// protocol on iPad Safari, where fetch()
// is blocked and JSON module imports require the assert { type: "json" }
// attribute that older WebKit builds do not honor. data/levels.json stays
// in the repo as a single source of truth for offline editing.

import kaplay from "./assets/vendor/kaplay.mjs";
import "./save.js";

// Per-level round data is now generated on the fly by data/pools.js —
// each level scene passes a `poolGen` to createRoundScene which samples
// 10 rounds per session from the full enumeration. This inline levelsData
// only carries metadata (title, intro) for the menu UI.
//
// Four math levels (added 2026-08-11 when the original combined L1
// was split into sum-≤-10 + two-sum-to-10, and 凑十法 / 二十以内 were
// renumbered to L3 / L4):
//   L1 三数相加<10  sum of three 1-digit addends ≤ 10
//   L2 两个数凑十   three addends where two sum to 10
//   L3 凑十法       single-digit pair whose sum > 10, teach the
//                   make-a-ten decomposition
//   L4 二十以内     teen + digit, no-carry, use 10+ones strategy
const levelsData = {
  "levels": [
    { "id": 1, "title": "三数相加" },
    { "id": 2, "title": "两数凑十" },
    { "id": 3, "title": "凑十法" },
    { "id": 4, "title": "二十以内" },
  ],
};

const CUE_IDS = [
  "enc-first-1", "enc-first-2", "enc-first-3", "enc-first-4", "enc-streak3-1", "enc-streak3-2", "enc-streak3-3", "enc-streak5-1", "enc-streak5-2", "enc-streak5-3",
  "enc-streak10-1", "enc-streak10-2", "enc-streak10-3", "enc-level-1", "enc-level-2", "enc-level-3", "enc-level-4", "enc-wrong-1", "enc-wrong-2", "enc-wrong-3",
  "enc-near-1", "enc-near-2", "enc-near-3", "enc-specific-pair", "enc-specific-double", "enc-specific-decomp", "enc-specific-friend",
  "panda-praise-1", "panda-praise-2", "panda-praise-3", "panda-cheer-1", "panda-cheer-2",
  "n-0", "n-1", "n-2", "n-3", "n-4", "n-5", "n-6", "n-7", "n-8", "n-9", "n-10", "n-11", "n-12", "n-13", "n-14", "n-15", "n-16", "n-17", "n-18", "n-19",
  "q-what-is", "q-plus", "q-equals", "equals", "lvl-done", "daily-done", "boat-intro", "boat-pair", "boat-done", "cloud-intro", "cloud-pair", "cloud-done",
  "bounce-intro", "bounce-pop", "bounce-done", "whack-intro", "whack-start", "whack-tick", "whack-timeup", "whack-done", "feed-intro", "feed-nom", "feed-next", "feed-done",
  "lvl-1-decomp-pre", "lvl-1-decomp-eq", "lvl-2-step-1-pre", "lvl-2-step-1-eq", "lvl-2-step-1-or", "lvl-2-step-1-q",
  "lvl-2-step-2-big-pre", "lvl-2-step-2-find", "lvl-2-step-2-friend-pre", "lvl-2-step-2-q", "lvl-2-step-3-split-pre", "lvl-2-step-3-can-split", "lvl-2-step-3-q", "lvl-2-step-4-split", "lvl-2-step-4-calc",
  "lvl-3-step-1-pre", "lvl-3-step-1-split", "lvl-3-step-1-q", "lvl-3-step-2-pre",
  "l1-intro-1-1-1", "l1-sub-1-1", "l1-step2-2-1", "l1-rwd-1-1-1-3", "l1-intro-1-1-2", "l1-step2-2-2",
  "l1-rwd-1-1-2-4", "l1-intro-1-1-3", "l1-step2-2-3", "l1-rwd-1-1-3-5", "l1-intro-1-1-4", "l1-step2-2-4",
  "l1-rwd-1-1-4-6", "l1-intro-1-1-5", "l1-step2-2-5", "l1-rwd-1-1-5-7", "l1-intro-1-1-6", "l1-step2-2-6",
  "l1-rwd-1-1-6-8", "l1-intro-1-1-7", "l1-step2-2-7", "l1-rwd-1-1-7-9", "l1-intro-1-1-8", "l1-step2-2-8",
  "l1-rwd-1-1-8-10", "l1-intro-1-2-1", "l1-sub-1-2", "l1-step2-3-1", "l1-rwd-1-2-1-4", "l1-intro-1-2-2",
  "l1-step2-3-2", "l1-rwd-1-2-2-5", "l1-intro-1-2-3", "l1-step2-3-3", "l1-rwd-1-2-3-6", "l1-intro-1-2-4",
  "l1-step2-3-4", "l1-rwd-1-2-4-7", "l1-intro-1-2-5", "l1-step2-3-5", "l1-rwd-1-2-5-8", "l1-intro-1-2-6",
  "l1-step2-3-6", "l1-rwd-1-2-6-9", "l1-intro-1-2-7", "l1-step2-3-7", "l1-rwd-1-2-7-10", "l1-intro-1-3-1",
  "l1-sub-1-3", "l1-step2-4-1", "l1-rwd-1-3-1-5", "l1-intro-1-3-2", "l1-step2-4-2", "l1-rwd-1-3-2-6",
  "l1-intro-1-3-3", "l1-step2-4-3", "l1-rwd-1-3-3-7", "l1-intro-1-3-4", "l1-step2-4-4", "l1-rwd-1-3-4-8",
  "l1-intro-1-3-5", "l1-step2-4-5", "l1-rwd-1-3-5-9", "l1-intro-1-3-6", "l1-step2-4-6", "l1-rwd-1-3-6-10",
  "l1-intro-1-4-1", "l1-sub-1-4", "l1-step2-5-1", "l1-rwd-1-4-1-6", "l1-intro-1-4-2", "l1-step2-5-2",
  "l1-rwd-1-4-2-7", "l1-intro-1-4-3", "l1-step2-5-3", "l1-rwd-1-4-3-8", "l1-intro-1-4-4", "l1-step2-5-4",
  "l1-rwd-1-4-4-9", "l1-intro-1-4-5", "l1-step2-5-5", "l1-rwd-1-4-5-10", "l1-intro-1-5-1", "l1-sub-1-5",
  "l1-step2-6-1", "l1-rwd-1-5-1-7", "l1-intro-1-5-2", "l1-step2-6-2", "l1-rwd-1-5-2-8", "l1-intro-1-5-3",
  "l1-step2-6-3", "l1-rwd-1-5-3-9", "l1-intro-1-5-4", "l1-step2-6-4", "l1-rwd-1-5-4-10", "l1-intro-1-6-1",
  "l1-sub-1-6", "l1-step2-7-1", "l1-rwd-1-6-1-8", "l1-intro-1-6-2", "l1-step2-7-2", "l1-rwd-1-6-2-9",
  "l1-intro-1-6-3", "l1-step2-7-3", "l1-rwd-1-6-3-10", "l1-intro-1-7-1", "l1-sub-1-7", "l1-step2-8-1",
  "l1-rwd-1-7-1-9", "l1-intro-1-7-2", "l1-step2-8-2", "l1-rwd-1-7-2-10", "l1-intro-1-8-1", "l1-sub-1-8",
  "l1-step2-9-1", "l1-rwd-1-8-1-10", "l1-intro-2-1-1", "l1-sub-2-1", "l1-rwd-2-1-1-4", "l1-intro-2-1-2",
  "l1-rwd-2-1-2-5", "l1-intro-2-1-3", "l1-rwd-2-1-3-6", "l1-intro-2-1-4", "l1-rwd-2-1-4-7", "l1-intro-2-1-5",
  "l1-rwd-2-1-5-8", "l1-intro-2-1-6", "l1-rwd-2-1-6-9", "l1-intro-2-1-7", "l1-rwd-2-1-7-10", "l1-intro-2-2-1",
  "l1-sub-2-2", "l1-rwd-2-2-1-5", "l1-intro-2-2-2", "l1-rwd-2-2-2-6", "l1-intro-2-2-3", "l1-rwd-2-2-3-7",
  "l1-intro-2-2-4", "l1-rwd-2-2-4-8", "l1-intro-2-2-5", "l1-rwd-2-2-5-9", "l1-intro-2-2-6", "l1-rwd-2-2-6-10",
  "l1-intro-2-3-1", "l1-sub-2-3", "l1-rwd-2-3-1-6", "l1-intro-2-3-2", "l1-rwd-2-3-2-7", "l1-intro-2-3-3",
  "l1-rwd-2-3-3-8", "l1-intro-2-3-4", "l1-rwd-2-3-4-9", "l1-intro-2-3-5", "l1-rwd-2-3-5-10", "l1-intro-2-4-1",
  "l1-sub-2-4", "l1-rwd-2-4-1-7", "l1-intro-2-4-2", "l1-rwd-2-4-2-8", "l1-intro-2-4-3", "l1-rwd-2-4-3-9",
  "l1-intro-2-4-4", "l1-rwd-2-4-4-10", "l1-intro-2-5-1", "l1-sub-2-5", "l1-rwd-2-5-1-8", "l1-intro-2-5-2",
  "l1-rwd-2-5-2-9", "l1-intro-2-5-3", "l1-rwd-2-5-3-10", "l1-intro-2-6-1", "l1-sub-2-6", "l1-rwd-2-6-1-9",
  "l1-intro-2-6-2", "l1-rwd-2-6-2-10", "l1-intro-2-7-1", "l1-sub-2-7", "l1-rwd-2-7-1-10", "l1-intro-3-1-1",
  "l1-sub-3-1", "l1-rwd-3-1-1-5", "l1-intro-3-1-2", "l1-rwd-3-1-2-6", "l1-intro-3-1-3", "l1-rwd-3-1-3-7",
  "l1-intro-3-1-4", "l1-rwd-3-1-4-8", "l1-intro-3-1-5", "l1-rwd-3-1-5-9", "l1-intro-3-1-6", "l1-rwd-3-1-6-10",
  "l1-intro-3-2-1", "l1-sub-3-2", "l1-rwd-3-2-1-6", "l1-intro-3-2-2", "l1-rwd-3-2-2-7", "l1-intro-3-2-3",
  "l1-rwd-3-2-3-8", "l1-intro-3-2-4", "l1-rwd-3-2-4-9", "l1-intro-3-2-5", "l1-rwd-3-2-5-10", "l1-intro-3-3-1",
  "l1-sub-3-3", "l1-rwd-3-3-1-7", "l1-intro-3-3-2", "l1-rwd-3-3-2-8", "l1-intro-3-3-3", "l1-rwd-3-3-3-9",
  "l1-intro-3-3-4", "l1-rwd-3-3-4-10", "l1-intro-3-4-1", "l1-sub-3-4", "l1-rwd-3-4-1-8", "l1-intro-3-4-2",
  "l1-rwd-3-4-2-9", "l1-intro-3-4-3", "l1-rwd-3-4-3-10", "l1-intro-3-5-1", "l1-sub-3-5", "l1-rwd-3-5-1-9",
  "l1-intro-3-5-2", "l1-rwd-3-5-2-10", "l1-intro-3-6-1", "l1-sub-3-6", "l1-rwd-3-6-1-10", "l1-intro-4-1-1",
  "l1-sub-4-1", "l1-rwd-4-1-1-6", "l1-intro-4-1-2", "l1-rwd-4-1-2-7", "l1-intro-4-1-3", "l1-rwd-4-1-3-8",
  "l1-intro-4-1-4", "l1-rwd-4-1-4-9", "l1-intro-4-1-5", "l1-rwd-4-1-5-10", "l1-intro-4-2-1", "l1-sub-4-2",
  "l1-rwd-4-2-1-7", "l1-intro-4-2-2", "l1-rwd-4-2-2-8", "l1-intro-4-2-3", "l1-rwd-4-2-3-9", "l1-intro-4-2-4",
  "l1-rwd-4-2-4-10", "l1-intro-4-3-1", "l1-sub-4-3", "l1-rwd-4-3-1-8", "l1-intro-4-3-2", "l1-rwd-4-3-2-9",
  "l1-intro-4-3-3", "l1-rwd-4-3-3-10", "l1-intro-4-4-1", "l1-sub-4-4", "l1-rwd-4-4-1-9", "l1-intro-4-4-2",
  "l1-rwd-4-4-2-10", "l1-intro-4-5-1", "l1-sub-4-5", "l1-rwd-4-5-1-10", "l1-intro-5-1-1", "l1-sub-5-1",
  "l1-rwd-5-1-1-7", "l1-intro-5-1-2", "l1-rwd-5-1-2-8", "l1-intro-5-1-3", "l1-rwd-5-1-3-9", "l1-intro-5-1-4",
  "l1-rwd-5-1-4-10", "l1-intro-5-2-1", "l1-sub-5-2", "l1-rwd-5-2-1-8", "l1-intro-5-2-2", "l1-rwd-5-2-2-9",
  "l1-intro-5-2-3", "l1-rwd-5-2-3-10", "l1-intro-5-3-1", "l1-sub-5-3", "l1-rwd-5-3-1-9", "l1-intro-5-3-2",
  "l1-rwd-5-3-2-10", "l1-intro-5-4-1", "l1-sub-5-4", "l1-rwd-5-4-1-10", "l1-intro-6-1-1", "l1-sub-6-1",
  "l1-rwd-6-1-1-8", "l1-intro-6-1-2", "l1-rwd-6-1-2-9", "l1-intro-6-1-3", "l1-rwd-6-1-3-10", "l1-intro-6-2-1",
  "l1-sub-6-2", "l1-rwd-6-2-1-9", "l1-intro-6-2-2", "l1-rwd-6-2-2-10", "l1-intro-6-3-1", "l1-sub-6-3",
  "l1-rwd-6-3-1-10", "l1-intro-7-1-1", "l1-sub-7-1", "l1-rwd-7-1-1-9", "l1-intro-7-1-2", "l1-rwd-7-1-2-10",
  "l1-intro-7-2-1", "l1-sub-7-2", "l1-rwd-7-2-1-10", "l1-intro-8-1-1", "l1-sub-8-1", "l1-rwd-8-1-1-10",
  "l2-simple-1-1", "l2-rwd-1-1-11", "l2-simple-1-2", "l2-rwd-1-2-11", "l2-simple-1-3", "l2-rwd-1-3-11",
  "l2-simple-1-4", "l2-rwd-1-4-11", "l2-simple-1-5", "l2-rwd-1-5-11", "l2-simple-1-6", "l2-rwd-1-6-11",
  "l2-simple-1-7", "l2-rwd-1-7-11", "l2-simple-1-8", "l2-rwd-1-8-11", "l2-simple-1-9", "l2-rwd-1-9-11",
  "l2-rwd-1-9-12", "l2-rwd-1-9-13", "l2-rwd-1-9-14", "l2-rwd-1-9-15", "l2-rwd-1-9-16", "l2-rwd-1-9-17",
  "l2-rwd-1-9-18", "l2-rwd-1-9-19", "l2-simple-2-1", "l2-rwd-2-1-12", "l2-simple-2-2", "l2-rwd-2-2-12",
  "l2-simple-2-3", "l2-rwd-2-3-12", "l2-simple-2-4", "l2-rwd-2-4-12", "l2-simple-2-5", "l2-rwd-2-5-12",
  "l2-simple-2-6", "l2-rwd-2-6-12", "l2-simple-2-7", "l2-rwd-2-7-12", "l2-simple-2-8", "l2-rwd-2-8-11",
  "l2-rwd-2-8-12", "l2-rwd-2-8-13", "l2-rwd-2-8-14", "l2-rwd-2-8-15", "l2-rwd-2-8-16", "l2-rwd-2-8-17",
  "l2-rwd-2-8-18", "l2-rwd-2-8-19", "l2-simple-2-9", "l2-rwd-2-9-12", "l2-simple-3-1", "l2-rwd-3-1-13",
  "l2-simple-3-2", "l2-rwd-3-2-13", "l2-simple-3-3", "l2-rwd-3-3-13", "l2-simple-3-4", "l2-rwd-3-4-13",
  "l2-simple-3-5", "l2-rwd-3-5-13", "l2-simple-3-6", "l2-rwd-3-6-13", "l2-simple-3-7", "l2-rwd-3-7-11",
  "l2-rwd-3-7-12", "l2-rwd-3-7-13", "l2-rwd-3-7-14", "l2-rwd-3-7-15", "l2-rwd-3-7-16", "l2-rwd-3-7-17",
  "l2-rwd-3-7-18", "l2-rwd-3-7-19", "l2-simple-3-8", "l2-rwd-3-8-13", "l2-simple-3-9", "l2-rwd-3-9-13",
  "l2-simple-4-1", "l2-rwd-4-1-14", "l2-simple-4-2", "l2-rwd-4-2-14", "l2-simple-4-3", "l2-rwd-4-3-14",
  "l2-simple-4-4", "l2-rwd-4-4-14", "l2-simple-4-5", "l2-rwd-4-5-14", "l2-simple-4-6", "l2-rwd-4-6-11",
  "l2-rwd-4-6-12", "l2-rwd-4-6-13", "l2-rwd-4-6-14", "l2-rwd-4-6-15", "l2-rwd-4-6-16", "l2-rwd-4-6-17",
  "l2-rwd-4-6-18", "l2-rwd-4-6-19", "l2-simple-4-7", "l2-rwd-4-7-14", "l2-simple-4-8", "l2-rwd-4-8-14",
  "l2-simple-4-9", "l2-rwd-4-9-14", "l2-simple-5-1", "l2-rwd-5-1-15", "l2-simple-5-2", "l2-rwd-5-2-15",
  "l2-simple-5-3", "l2-rwd-5-3-15", "l2-simple-5-4", "l2-rwd-5-4-15", "l2-simple-5-5", "l2-rwd-5-5-11",
  "l2-rwd-5-5-12", "l2-rwd-5-5-13", "l2-rwd-5-5-14", "l2-rwd-5-5-15", "l2-rwd-5-5-16", "l2-rwd-5-5-17",
  "l2-rwd-5-5-18", "l2-rwd-5-5-19", "l2-simple-5-6", "l2-rwd-5-6-15", "l2-simple-5-7", "l2-rwd-5-7-15",
  "l2-simple-5-8", "l2-rwd-5-8-15", "l2-simple-5-9", "l2-rwd-5-9-15", "l2-simple-6-1", "l2-rwd-6-1-16",
  "l2-simple-6-2", "l2-rwd-6-2-16", "l2-simple-6-3", "l2-rwd-6-3-16", "l2-simple-6-4", "l2-rwd-6-4-11",
  "l2-rwd-6-4-12", "l2-rwd-6-4-13", "l2-rwd-6-4-14", "l2-rwd-6-4-15", "l2-rwd-6-4-16", "l2-rwd-6-4-17",
  "l2-rwd-6-4-18", "l2-rwd-6-4-19", "l2-simple-6-5", "l2-rwd-6-5-16", "l2-simple-6-6", "l2-rwd-6-6-16",
  "l2-simple-6-7", "l2-rwd-6-7-16", "l2-simple-6-8", "l2-rwd-6-8-16", "l2-simple-6-9", "l2-rwd-6-9-16",
  "l2-simple-7-1", "l2-rwd-7-1-17", "l2-simple-7-2", "l2-rwd-7-2-17", "l2-simple-7-3", "l2-rwd-7-3-11",
  "l2-rwd-7-3-12", "l2-rwd-7-3-13", "l2-rwd-7-3-14", "l2-rwd-7-3-15", "l2-rwd-7-3-16", "l2-rwd-7-3-17",
  "l2-rwd-7-3-18", "l2-rwd-7-3-19", "l2-simple-7-4", "l2-rwd-7-4-17", "l2-simple-7-5", "l2-rwd-7-5-17",
  "l2-simple-7-6", "l2-rwd-7-6-17", "l2-simple-7-7", "l2-rwd-7-7-17", "l2-simple-7-8", "l2-rwd-7-8-17",
  "l2-simple-7-9", "l2-rwd-7-9-17", "l2-simple-8-1", "l2-rwd-8-1-18", "l2-simple-8-2", "l2-rwd-8-2-11",
  "l2-rwd-8-2-12", "l2-rwd-8-2-13", "l2-rwd-8-2-14", "l2-rwd-8-2-15", "l2-rwd-8-2-16", "l2-rwd-8-2-17",
  "l2-rwd-8-2-18", "l2-rwd-8-2-19", "l2-simple-8-3", "l2-rwd-8-3-18", "l2-simple-8-4", "l2-rwd-8-4-18",
  "l2-simple-8-5", "l2-rwd-8-5-18", "l2-simple-8-6", "l2-rwd-8-6-18", "l2-simple-8-7", "l2-rwd-8-7-18",
  "l2-simple-8-8", "l2-rwd-8-8-18", "l2-simple-8-9", "l2-rwd-8-9-18", "l2-simple-9-1", "l2-rwd-9-1-11",
  "l2-rwd-9-1-12", "l2-rwd-9-1-13", "l2-rwd-9-1-14", "l2-rwd-9-1-15", "l2-rwd-9-1-16", "l2-rwd-9-1-17",
  "l2-rwd-9-1-18", "l2-rwd-9-1-19", "l2-simple-9-2", "l2-rwd-9-2-19", "l2-simple-9-3", "l2-rwd-9-3-19",
  "l2-simple-9-4", "l2-rwd-9-4-19", "l2-simple-9-5", "l2-rwd-9-5-19", "l2-simple-9-6", "l2-rwd-9-6-19",
  "l2-simple-9-7", "l2-rwd-9-7-19", "l2-simple-9-8", "l2-rwd-9-8-19", "l2-simple-9-9", "l2-rwd-9-9-19",
  "l3-s1-2-9", "l3-s2-2-9", "l3-s3-11", "l3-rwd-2-9-11", "l3-s1-3-8", "l3-s2-3-8",
  "l3-rwd-3-8-11", "l3-s1-3-9", "l3-s2-3-9", "l3-s3-12", "l3-rwd-3-9-12", "l3-s1-4-7",
  "l3-s2-4-7", "l3-rwd-4-7-11", "l3-s1-4-8", "l3-s2-4-8", "l3-rwd-4-8-12", "l3-s1-4-9",
  "l3-s2-4-9", "l3-s3-13", "l3-rwd-4-9-13", "l3-s1-5-6", "l3-s2-5-6", "l3-rwd-5-6-11",
  "l3-s1-5-7", "l3-s2-5-7", "l3-rwd-5-7-12", "l3-s1-5-8", "l3-s2-5-8", "l3-rwd-5-8-13",
  "l3-s1-5-9", "l3-s2-5-9", "l3-s3-14", "l3-rwd-5-9-14", "l3-s1-6-5", "l3-s2-6-5",
  "l3-rwd-6-5-11", "l3-s1-6-6", "l3-s2-6-6", "l3-rwd-6-6-12", "l3-s1-6-7", "l3-s2-6-7",
  "l3-rwd-6-7-13", "l3-s1-6-8", "l3-s2-6-8", "l3-rwd-6-8-14", "l3-s1-6-9", "l3-s2-6-9",
  "l3-s3-15", "l3-rwd-6-9-15", "l3-s1-7-4", "l3-s2-7-4", "l3-rwd-7-4-11", "l3-s1-7-5",
  "l3-s2-7-5", "l3-rwd-7-5-12", "l3-s1-7-6", "l3-s2-7-6", "l3-rwd-7-6-13", "l3-s1-7-7",
  "l3-s2-7-7", "l3-rwd-7-7-14", "l3-s1-7-8", "l3-s2-7-8", "l3-rwd-7-8-15", "l3-s1-7-9",
  "l3-s2-7-9", "l3-s3-16", "l3-rwd-7-9-16", "l3-s1-8-3", "l3-s2-8-3", "l3-rwd-8-3-11",
  "l3-s1-8-4", "l3-s2-8-4", "l3-rwd-8-4-12", "l3-s1-8-5", "l3-s2-8-5", "l3-rwd-8-5-13",
  "l3-s1-8-6", "l3-s2-8-6", "l3-rwd-8-6-14", "l3-s1-8-7", "l3-s2-8-7", "l3-rwd-8-7-15",
  "l3-s1-8-8", "l3-s2-8-8", "l3-rwd-8-8-16", "l3-s1-8-9", "l3-s2-8-9", "l3-s3-17",
  "l3-rwd-8-9-17", "l3-s1-9-2", "l3-s2-9-2", "l3-rwd-9-2-11", "l3-s1-9-3", "l3-s2-9-3",
  "l3-rwd-9-3-12", "l3-s1-9-4", "l3-s2-9-4", "l3-rwd-9-4-13", "l3-s1-9-5", "l3-s2-9-5",
  "l3-rwd-9-5-14", "l3-s1-9-6", "l3-s2-9-6", "l3-rwd-9-6-15", "l3-s1-9-7", "l3-s2-9-7",
  "l3-rwd-9-7-16", "l3-s1-9-8", "l3-s2-9-8", "l3-rwd-9-8-17", "l3-s1-9-9", "l3-s2-9-9",
  "l3-s3-18", "l3-rwd-9-9-18", "l3-s1-11-1", "l3-s2-1-1", "l3-s3-2", "l3-rwd-11-1-12",
  "l3-s1-11-2", "l3-s2-1-2", "l3-s3-3", "l3-rwd-11-2-13", "l3-s1-11-3", "l3-s2-1-3",
  "l3-s3-4", "l3-rwd-11-3-14", "l3-s1-11-4", "l3-s2-1-4", "l3-s3-5", "l3-rwd-11-4-15",
  "l3-s1-11-5", "l3-s2-1-5", "l3-s3-6", "l3-rwd-11-5-16", "l3-s1-11-6", "l3-s2-1-6",
  "l3-s3-7", "l3-rwd-11-6-17", "l3-s1-11-7", "l3-s2-1-7", "l3-s3-8", "l3-rwd-11-7-18",
  "l3-s1-11-8", "l3-s2-1-8", "l3-s3-9", "l3-rwd-11-8-19", "l3-s1-12-1", "l3-s2-2-1",
  "l3-rwd-12-1-13", "l3-s1-12-2", "l3-s2-2-2", "l3-rwd-12-2-14", "l3-s1-12-3", "l3-s2-2-3",
  "l3-rwd-12-3-15", "l3-s1-12-4", "l3-s2-2-4", "l3-rwd-12-4-16", "l3-s1-12-5", "l3-s2-2-5",
  "l3-rwd-12-5-17", "l3-s1-12-6", "l3-s2-2-6", "l3-rwd-12-6-18", "l3-s1-12-7", "l3-s2-2-7",
  "l3-rwd-12-7-19", "l3-s1-13-1", "l3-s2-3-1", "l3-rwd-13-1-14", "l3-s1-13-2", "l3-s2-3-2",
  "l3-rwd-13-2-15", "l3-s1-13-3", "l3-s2-3-3", "l3-rwd-13-3-16", "l3-s1-13-4", "l3-s2-3-4",
  "l3-rwd-13-4-17", "l3-s1-13-5", "l3-s2-3-5", "l3-rwd-13-5-18", "l3-s1-13-6", "l3-s2-3-6",
  "l3-rwd-13-6-19", "l3-s1-14-1", "l3-s2-4-1", "l3-rwd-14-1-15", "l3-s1-14-2", "l3-s2-4-2",
  "l3-rwd-14-2-16", "l3-s1-14-3", "l3-s2-4-3", "l3-rwd-14-3-17", "l3-s1-14-4", "l3-s2-4-4",
  "l3-rwd-14-4-18", "l3-s1-14-5", "l3-s2-4-5", "l3-rwd-14-5-19", "l3-s1-15-1", "l3-s2-5-1",
  "l3-rwd-15-1-16", "l3-s1-15-2", "l3-s2-5-2", "l3-rwd-15-2-17", "l3-s1-15-3", "l3-s2-5-3",
  "l3-rwd-15-3-18", "l3-s1-15-4", "l3-s2-5-4", "l3-rwd-15-4-19", "l3-s1-16-1", "l3-s2-6-1",
  "l3-rwd-16-1-17", "l3-s1-16-2", "l3-s2-6-2", "l3-rwd-16-2-18", "l3-s1-16-3", "l3-s2-6-3",
  "l3-rwd-16-3-19", "l3-s1-17-1", "l3-s2-7-1", "l3-rwd-17-1-18", "l3-s1-17-2", "l3-s2-7-2",
  "l3-rwd-17-2-19", "l3-s1-18-1", "l3-s2-8-1", "l3-rwd-18-1-19"

];

const audio = {};
for (const id of CUE_IDS) {
  // MP3 from Edge TTS (see tools/build-audio-edge.mjs). Safari on iPad
  // and Chromium on desktop both handle MP3 in <audio> natively.
  const el = new Audio(`assets/audio/${id}.mp3`);
  el.preload = "auto";
  el.dataset.cue = id;
  audio[id] = el;
}

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  for (const el of Object.values(audio)) {
    const wasMuted = el.muted;
    el.muted = true;
    const p = el.play();
    const restore = () => {
      el.pause();
      // iPad Safari throws InvalidStateError on currentTime = 0 when the
      // element hasn't fully decoded yet (same race as playCueRaw).
      try { el.currentTime = 0; } catch (_) { /* Safari pre-metadata */ }
      el.muted = wasMuted;
    };
    if (p && typeof p.then === "function") {
      p.then(restore).catch(() => { el.muted = wasMuted; });
    } else {
      restore();
    }
  }
  audioUnlocked = true;
}

// Plays a single cue's audio element from the start. Use playCueRaw()
// from inside a chain (playSequence / playAfter / scheduleCue) — it
// plays without the global mutex, so chained cues don't cancel each
// other mid-flight. Use playCue() from any external caller: it first
// calls stopAllAudio() so a direct trigger can never overlap with an
// in-flight chain (this is the safety net for "user pressed button
// while previous audio was still going" — the design rule is "at most
// one active audio at any moment").
function playCueRaw(id) {
  const el = audio[id];
  if (!el) {
    console.warn(`[panda-audio] playCue("${id}"): no audio element`);
    return;
  }
  try {
    el.muted = false;
    el.volume = 1;
    // iPad Safari throws InvalidStateError on el.currentTime = 0 when
    // the element hasn't fully decoded metadata yet (e.g. right after
    // a cold load). Wrap so a stuck reset doesn't abort the whole
    // play() — the play() below still works, just starting from where
    // the element already is.
    try { el.currentTime = 0; } catch (_) { /* Safari pre-metadata */ }
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        // iPad Safari often rejects the very first play() of a freshly
        // loaded MP3 with NotAllowedError even after the unlock pattern —
        // log it so the user can tell us which cues are silently failing.
        console.warn(`[panda-audio] playCue("${id}") rejected:`, err?.message || err);
      });
    }
  } catch (err) {
    console.warn(`[panda-audio] playCue("${id}") threw:`, err?.message || err);
  }
}

function playCue(id) {
  // Mutex: any direct cue trigger cancels any in-flight chain first.
  // This guarantees the "at most one active audio" invariant for every
  // external caller without each call site having to remember. Chains
  // use playCueRaw() to bypass this so they don't cancel themselves.
  stopAllAudio();
  playCueRaw(id);
}

// Every scheduled cue (from playSequence, playAfter, or anywhere that uses
// scheduleCue) is tracked here so a correct pick can cancel all of them
// at once. Without this, a child who answers mid-sentence would hear the
// remaining words of the L1 decompose overlap with the encouragement +
// the next step's audio prompt — a wall of sound.
const pendingCueTimers = new Set();
function scheduleCue(id, delayMs) {
  const tid = setTimeout(() => {
    pendingCueTimers.delete(tid);
    playCue(id);
  }, delayMs);
  pendingCueTimers.add(tid);
  return tid;
}

// Every active playAfter() registers a context here so stopAllAudio can
// (a) cancel the fallback setTimeout that fires when iPad Safari misses
// the reference cue's `ended` event, and (b) detach the reference cue's
// `ended` listener so a re-entered scene's fresh play() of the same
// audio element doesn't accidentally fire a stale kickoff. Without
// this, tapping the back button while a step's audio was scheduled off
// the cheer chain would let the fallback fire ~2s later and start the
// next chain in the destination scene (the user reported "audio is
// still playing after I tap ←").
const activeAfters = new Set();
const afterFallbackTimers = new Set();

// Cancels all queued cues, marks every active sequence as cancelled so
// future `ended` events in the chain are no-ops, detaches every pending
// playAfter's `ended` listener and cancels its fallback timer, and
// pauses every currently-playing audio element. Used when a child taps
// an answer (right or wrong) or navigates away — the rest of any
// spoken sentence should never fight with the next audio.
function stopAllAudio() {
  pendingCueTimers.forEach((tid) => clearTimeout(tid));
  pendingCueTimers.clear();
  for (const seq of activeSequences) seq.cancelled = true;
  activeSequences.clear();
  afterFallbackTimers.forEach((tid) => clearTimeout(tid));
  afterFallbackTimers.clear();
  for (const ctx of activeAfters) {
    ctx.cancelled = true;
    if (ctx.onEnded && ctx.ref) {
      try { ctx.ref.removeEventListener("ended", ctx.onEnded); } catch (_) {}
    }
  }
  activeAfters.clear();
  for (const el of Object.values(audio)) {
    if (!el.paused) {
      try { el.pause(); } catch (_) {}
    }
  }
}

// Plays a series of cue ids chained strictly by each cue's `ended`
// event — not by a setTimeout estimate of audio.duration. A slow system
// that decodes audio slowly won't make the next cue fire too early, and
// the chain breaks cleanly when stopAllAudio pauses the audio (the
// `ended` event never fires, no further cues land).
//
// seqGapMs (default 90) is the silence between consecutive cues. It's a
// fixed padding for breathing room, not a timing estimate — the next
// cue is guaranteed to wait for the previous one to fully finish.
//
// startDelayMs (optional) is the silence before the first cue. Prefer
// playAfter() when you need to wait for another cue to end; that uses
// the audio's `ended` event for the wait, then hands the gapMs to
// playSequence as startDelayMs.
//
// onComplete (optional) fires once the entire chain has played through
// — specifically, after the LAST cue's `ended` event. Callers that need
// to gate UI on the audio finishing (e.g. roundScene waiting to
// transition to the next round) pass a callback here instead of
// estimating audio durations. The callback does NOT fire if the chain
// is cancelled by stopAllAudio — the caller is responsible for a
// fallback timeout if the user might navigate mid-sequence.
//
// In test mode (window.__skipTimers), the chain is bypassed and
// onComplete fires immediately, so verifiers don't hang waiting on
// audio events that never fire in headless browsers.
//
// Each sequence is tracked in activeSequences so stopAllAudio can
// cancel the whole chain (e.g. a kid who taps an answer mid-sentence
// should hear silence, not the remaining 12 words).
const activeSequences = new Set();

function playSequence(ids, seqGapMs = 90, startDelayMs = 0, onComplete) {
  if (!Array.isArray(ids) || ids.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  // Verifier mode: skip playback and resolve immediately so audio-gated
  // advances don't hang waiting on events that never fire.
  if (window.__skipTimers) {
    if (onComplete) onComplete();
    return;
  }
  const seq = { cancelled: false };
  activeSequences.add(seq);

  const playIdx = (i) => {
    if (seq.cancelled || i >= ids.length) {
      if (i >= ids.length) {
        activeSequences.delete(seq);
        // If the chain finished naturally (not via stopAllAudio
        // cancellation), signal completion so the caller can advance.
        if (!seq.cancelled && onComplete) onComplete();
      }
      return;
    }
    const el = audio[ids[i]];
    if (!el) {
      // Silent no-op when a cue isn't preloaded — but log it so a missing
      // audio file (e.g. a newly-added composite cue that hasn't been
      // built yet) is visible during dev instead of the kid hearing
      // nothing with no breadcrumb.
      console.warn(`[PandaAudio] cue "${ids[i]}" not loaded — chain continues silently. Re-run \`npm run audio:build\` if this is a new cue.`);
      activeSequences.delete(seq);
      if (onComplete) onComplete();
      return;
    }
    playCueRaw(ids[i]);
    if (i + 1 < ids.length) {
      // Closure-captured fired flag guards against iPad Safari
      // firing `ended` twice on the same element (it can if the
      // element was paused and re-played, or after a play() race).
      // Without this guard, the next cue in the chain would start
      // a second time and overlap with itself.
      let fired = false;
      el.addEventListener("ended", function onEnded() {
        el.removeEventListener("ended", onEnded);
        if (seq.cancelled || fired) return;
        fired = true;
        setTimeout(() => playIdx(i + 1), seqGapMs);
      });
    } else {
      // Last cue: fire onComplete AFTER its `ended` event so the
      // caller can chain a UI transition on the audio actually
      // finishing. (Without the wrapper, onComplete would fire when
      // the last cue STARTS, not when it ENDS.) Same fired guard as
      // above for Safari double-fire safety.
      let fired = false;
      el.addEventListener("ended", function onEnded() {
        el.removeEventListener("ended", onEnded);
        if (seq.cancelled || fired) return;
        fired = true;
        activeSequences.delete(seq);
        if (onComplete) onComplete();
      });
    }
  };

  if (startDelayMs > 0) {
    const tid = setTimeout(() => {
      pendingCueTimers.delete(tid);
      if (seq.cancelled) return;
      playIdx(0);
    }, startDelayMs);
    pendingCueTimers.add(tid);
  } else {
    playIdx(0);
  }
}

// Plays a sequence of cues after another cue's audio finishes, with a
// configurable gap. Uses the audio element's 'ended' event so the timing
// tracks reality (no race with audio.duration) — the L1 entry relies on
// this for the "greeting → 1s pause → decompose" transition, and L1
// step 2 uses it for the "encouragement → equation reward" handoff so
// the equation never starts mid-encouragement.
//
// If the reference cue has already ended (e.g. we re-entered a scene
// after the cue already played), the sequence fires immediately so the
// caller doesn't have to special-case the "already-played" branch.
//
// onComplete (optional) is forwarded to the underlying playSequence
// call — it fires when the FOLLOWING chain finishes, not when the
// reference cue ends. Use it to chain a UI action onto the audio
// fully landing (e.g. roundScene awaiting audio before advancing).
function playAfter(referenceId, ids, { gapMs = 1000, seqGapMs = 90 } = {}, onComplete) {
  // Test mode short-circuit — audio events never fire in headless
  // browsers, so don't block on `ref.ended` (it stays false forever).
  if (window.__skipTimers) {
    playSequence(ids, seqGapMs, 0, onComplete);
    return;
  }
  const ref = audio[referenceId];
  if (!ref) {
    // Reference cue doesn't exist — just play the sequence after a
    // generous fixed delay so the user still hears something.
    playSequence(ids, seqGapMs, 4000, onComplete);
    return;
  }
  // Per-playAfter context — registered with stopAllAudio so a
  // back-button tap (or any other navigation) can cancel the fallback
  // timer AND detach the `ended` listener. Without this, tapping ←
  // mid-cheer would let the fallback fire ~2s later in the destination
  // scene and start the step audio chain there ("audio still playing
  // after I tapped ←").
  const ctx = { cancelled: false, ref, onEnded: null };
  activeAfters.add(ctx);
  let fired = false;
  const kickoff = () => {
    if (fired || ctx.cancelled) return;
    fired = true;
    clearTimeout(fallback);
    afterFallbackTimers.delete(fallback);
    if (ctx.onEnded) {
      try { ctx.ref.removeEventListener("ended", ctx.onEnded); } catch (_) {}
    }
    activeAfters.delete(ctx);
    playSequence(ids, seqGapMs, gapMs, onComplete);
  };
  // Fallback timer: on iPad Safari the reference cue's `ended` event
  // sometimes never fires after the very first unlock — the play()
  // resolves but the metadata-driven `ended` event is missed, leaving
  // the kid in silence forever. Use the cue's known duration plus a
  // buffer as a wall-clock fallback. Whichever fires first wins.
  const durMs = (Number.isFinite(ref.duration) && ref.duration > 0)
    ? ref.duration * 1000
    : 6000; // generous default — L2/L3 spoken sentences can run 5-7s
  const fallback = setTimeout(kickoff, durMs + 2500);
  afterFallbackTimers.add(fallback);
  if (ref.ended) {
    kickoff();
    return;
  }
  ctx.onEnded = function onEnded() {
    ctx.ref.removeEventListener("ended", onEnded);
    kickoff();
  };
  ctx.ref.addEventListener("ended", ctx.onEnded);
}

const k = kaplay({
  width: 1366,
  height: 1024,
  letterbox: true,
  touchToMouse: true,
  canvas: document.getElementById("game"),
  background: [255, 241, 220],
  crisp: true,
  global: false,
});

window.kaplay = k;
window.PandaAudio = { audio, unlockAudio, playCue, playSequence, playAfter, stopAllAudio, isUnlocked: () => audioUnlocked };

// Wrap k.go so any scene transition (level card tap, back button, round
// transition, level-complete) stops the currently-speaking audio first.
// Without this, a kid who taps the L1 card while the L3 round is still
// reading its last cue would hear the rest of the L3 sentence on top of
// the L1 greeting — a wall of sound.
const _origGo = k.go.bind(k);
k.go = (name) => {
  window.PandaAudio.stopAllAudio();
  return _origGo(name);
};

// Art assets are hand-authored SVG under assets/art/. Unlike the level data
// above, these are fetched over HTTP, so the game must be served (see README) —
// double-clicking index.html will start but render without art. Each load is
// guarded individually: a missing or malformed file should cost the game its
// decoration, not its arithmetic. Components check k.getSprite() before drawing.
const SPRITES = [
  "panda-idle", "panda-cheer", "panda-think",
  "bamboo", "leaf",
  "star", "lock",
  "badge-1", "badge-2", "badge-3",
  // panda-park migrated game props
  "boat", "cloud", "mole", "balloon", "bubble",
];

function loadArt() {
  return Promise.all(
    SPRITES.map((name) =>
      Promise.resolve(k.loadSprite(name, `assets/art/${name}.svg`)).catch((err) => {
        console.warn(`[panda] sprite "${name}" failed to load:`, err?.message || err);
        return null;
      }),
    ),
  );
}

function tryLockLandscape() {
  if (!screen.orientation || typeof screen.orientation.lock !== "function") return;
  screen.orientation.lock("landscape").catch((err) => {
    // Common on iPad Safari without user activation; will retry on first
    // pointerdown below. Don't spam the console — log only the first miss.
    console.debug("[panda] screen.orientation.lock rejected:", err?.message || err);
  });
}

// True when the viewport is taller than wide. screen.orientation.type is
// the most reliable signal where available; iPad Safari's matchMedia
// "(orientation: portrait)" can lag behind the actual rotation, so we
// also fall back to window dimensions.
function isPortrait() {
  const t = screen.orientation && screen.orientation.type;
  if (typeof t === "string") return t.startsWith("portrait");
  return window.innerHeight > window.innerWidth;
}

function watchOrientation() {
  const hint = document.getElementById("rotate-hint");
  if (!hint) return;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const apply = () => {
    if (!isCoarse) { hint.hidden = true; return; }
    hint.hidden = !isPortrait();
  };
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}

// Fire on page load so browsers that don't gate orientation.lock on
// user activation (Chrome on desktop, some Android browsers) snap to
// landscape immediately. iPad Safari will reject this — that's fine,
// the pointerdown handler below retries inside the user gesture.
tryLockLandscape();

// Tap-anywhere to unlock audio + attempt orientation lock. The lock
// succeeds inside this handler on iPad Safari because the pointerdown
// is a user activation. The hint overlay is also wired to call
// tryLockLandscape explicitly so tapping the hint's button works
// even if the canvas doesn't see the event.
document.addEventListener("pointerdown", () => {
  unlockAudio();
  tryLockLandscape();
}, { passive: true, once: false });

const rotateHint = document.getElementById("rotate-hint");
if (rotateHint) {
  rotateHint.addEventListener("click", () => {
    tryLockLandscape();
  });
}

watchOrientation();

(async () => {
  window.PandaLevels = levelsData;

  const [
    { default: levelPicker },
    { default: gamesPicker },
    { default: level1 },
    { default: level2 },
    { default: level3 },
    { default: level4 },
    { default: dailyDone },
    { default: gameBoat },
    { default: gameBounce },
    { default: gameCloud },
    { default: gameFeed },
    { default: gameWhack },
  ] = await Promise.all([
    import("./scenes/levelPicker.js"),
    import("./scenes/gamesPicker.js"),
    import("./scenes/level1.js"),
    import("./scenes/level2.js"),
    import("./scenes/level3.js"),
    import("./scenes/level4.js"),
    import("./scenes/dailyDone.js"),
    import("./scenes/gameBoat.js"),
    import("./scenes/gameBounce.js"),
    import("./scenes/gameCloud.js"),
    import("./scenes/gameFeed.js"),
    import("./scenes/gameWhack.js"),
  ]);

  // Sprites must be resolved before the first scene runs: scenes decide at build
  // time whether a sprite exists, so loading them afterwards would leave the
  // opening screen permanently art-less.
  await loadArt();

  k.scene("levelPicker", () => levelPicker(k));
  k.scene("gamesPicker", () => gamesPicker(k));
  k.scene("level1", () => level1(k));
  k.scene("level2", () => level2(k));
  k.scene("level3", () => level3(k));
  k.scene("level4", () => level4(k));
  k.scene("dailyDone", () => dailyDone(k));
  k.scene("gameBoat",   () => gameBoat(k));
  k.scene("gameBounce", () => gameBounce(k));
  k.scene("gameCloud",  () => gameCloud(k));
  k.scene("gameFeed",   () => gameFeed(k));
  k.scene("gameWhack",  () => gameWhack(k));

  k.go("levelPicker");
})();
// Emit the new pool-driven CUE_IDS additions as a JS array literal.
// Drops them into stdout so we can paste into main.js.
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const { poolGens } = await import(path.join(ROOT, "data/pools.js"));

// Decide which two addends the kid should pair first, and which one is the
// "leftover" they add at the end. Returns the pair VALUES plus the third
// VALUE.
//
// Mirrors scenes/level2.js: only checks pool-valid pair positions
// (0,1) and (1,2) — skips (0,2). The L2 pool filter
// (data/pools.js: `a+b=10 || b+c=10`) drops a+c=10-only triples, but
// triples of form (a, a, 10-a) DO have a+c=10 too (e.g. (1,1,9));
// choosing (0,2) there would mismatch the tenOnLeft/tenOnRight mirror
// in step 2 (the pair would land at the start of nums, the leftover
// at the middle, so "third + 10" would read as "10 + third").
function choosePair(nums) {
  if (nums[0] + nums[1] === 10) {
    return { pair: [nums[0], nums[1]], third: nums[2], pairIndices: [0, 1] };
  }
  if (nums[1] + nums[2] === 10) {
    return { pair: [nums[1], nums[2]], third: nums[0], pairIndices: [1, 2] };
  }
  return { pair: [nums[0], nums[1]], third: nums[2], pairIndices: [0, 1] };
}

const seen = new Set();
const ids = [];

const l1 = poolGens[1]();
const l2 = poolGens[2]();
const l3 = poolGens[3]();
const l4 = poolGens[4]();

// isMakeTen must mirror scenes/level1.js choosePair so the emitted ids
// line up with the cues the scene actually requests at runtime. Previously
// this loop emitted only the non-make-ten ids (`l1-intro-*` + `l1-sub-*`),
// which left `l1-intro-mt-*` and `l1-sub-find-ten` out of CUE_IDS — every
// make-a-ten L1 round then played step 1 in silence because no <audio>
// element was ever created for those ids.
function isMakeTenRound(nums) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === 10) return true;
    }
  }
  return false;
}

for (const r of l1) {
  const [a, b, c] = r.nums;
  const { pair, third } = choosePair(r.nums);
  const pairSum = pair[0] + pair[1];
  const push = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  // Both cue sets are emitted for every round: the runtime only requests
  // one set per round (mt path or normal path), but emitting both keeps
  // the manifest complete so a pool-shape change can't silently leave
  // a cue unregistered.
  if (isMakeTenRound(r.nums)) {
    push(`l1-intro-mt-${a}-${b}-${c}`);
    push(`l1-sub-find-ten`);
  } else {
    push(`l1-intro-${a}-${b}-${c}`);
    push(`l1-sub-${pair[0]}-${pair[1]}`);
  }
  push(`l1-step2-${pairSum}-${third}`);
  push(`l1-rwd-${a}-${b}-${c}-${r.answer}`);
}

for (const r of l2) {
  const push = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  const [a, b, c] = r.nums;
  push(`l2-simple-${a}-${b}`);
  push(`l2-rwd-${a}-${b}-${r.answer}`);
}


for (const r of l3) {
  const ones = r.a % 10;
  const sum = ones + r.b;
  const push = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  push(`l3-s1-${r.a}-${r.b}`);
  push(`l3-s2-${ones}-${r.b}`);
  push(`l3-s3-${sum}`);
  push(`l3-rwd-${r.a}-${r.b}-${r.answer}`);
}

for (const r of l4) {
  const ones = r.a % 10;
  const sum = ones + r.b;
  const push = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  push(`l3-s1-${r.a}-${r.b}`);
  push(`l3-s2-${ones}-${r.b}`);
  push(`l3-s3-${sum}`);
  push(`l3-rwd-${r.a}-${r.b}-${r.answer}`);
}

console.log("// total pool-driven composite cues:", ids.length);
// Emit as a single string array literal, 6 ids per line.
let out = "";
for (let i = 0; i < ids.length; i++) {
  if (i % 6 === 0) {
    if (i > 0) out += ",\n";
    out += "  ";
  } else {
    out += ", ";
  }
  out += `"${ids[i]}"`;
}
console.log(out);
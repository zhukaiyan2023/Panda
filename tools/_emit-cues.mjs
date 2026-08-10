// Emit the new pool-driven CUE_IDS additions as a JS array literal.
// Drops them into stdout so we can paste into main.js.
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const { poolGens } = await import(path.join(ROOT, "data/pools.js"));

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

const seen = new Set();
const ids = [];

const l1 = poolGens[1]();
const l2 = poolGens[2]();
const l3 = poolGens[3]();

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
  push(`l2-rwd-${r.a}-${r.b}-${r.answer}`);
  // The 4-step make-a-ten teaching only applies to make-ten rounds.
  // Other kinds (simple / no-carry-2d / carry-2d / trivial) get a
  // single-step "a + b = ?" scene with no compare / friend / split,
  // so the only step audio is the prompt + the shared reward.
  if (r.kind === "make-ten") {
    const big = Math.max(r.a, r.b);
    const small = Math.min(r.a, r.b);
    push(`l2-s1-${r.a}-${r.b}`);
    push(`l2-s2-${big}`);
    push(`l2-s3-${small}-${r.need}`);
    push(`l2-s4-${small}-${r.need}-${r.rest}-${big}`);
    // Comparison reveal audio — reads "a 大于 b" or "a 小于 b"
    // after the kid picks the right sign in step 1. Same
    // (> / <) prompt for both orderings of the same unordered
    // pair, since the spoken comparison naturally follows the
    // kid's actual answer direction. Skipped when a == b
    // (the equal case auto-advances with no comparison pick).
    if (r.a !== r.b) {
      push(`l2-cmp-${r.a}-${r.b}`);
    }
    // Step 4 swap audio — fires ONLY when the smaller addend
    // comes first (round.a < round.b) AND the split has two
    // non-zero pieces in different order (rest ≠ need). For
    // those rounds the visual shows "(rest+need)+b = ?"
    // (preserving question order) but the canonical
    // l2-s4 audio still says "big+need+rest", which would
    // re-introduce the swap jump we just removed. The "s"
    // suffix marks the swapped text variant.
    if (r.a < r.b && r.rest !== r.need) {
      push(`l2-s4s-${r.a}-${r.b}-${r.need}-${r.rest}-${big}`);
    }
  } else {
    push(`l2-simple-${r.a}-${r.b}`);
  }
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
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

for (const r of l1) {
  const [a, b, c] = r.nums;
  const { pair, third } = choosePair(r.nums);
  const pairSum = pair[0] + pair[1];
  const push = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  push(`l1-intro-${a}-${b}-${c}`);
  push(`l1-sub-${pair[0]}-${pair[1]}`);
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
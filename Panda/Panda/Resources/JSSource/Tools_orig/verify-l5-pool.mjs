#!/usr/bin/env node
// tools/verify-l5-pool.mjs — 验证 L5 池枚举的正确性。
//
// 约束（来自 spec §2）：
//   - a, b ∈ [11, 19]
//   - ones(a) + ones(b) ≤ 9  （严格 < 10）
//   - 池大小必须恰好是 36
//
// 用法：node tools/verify-l5-pool.mjs
// 退出码 0 = 通过；非 0 = 失败。

import { poolGens } from "../data/pools.js";

let failed = 0;
const pool = poolGens[5]();

function expect(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

console.log("L5 pool:");

expect(pool.length === 36, `pool size = 36 (got ${pool.length})`);

let minAnswer = Infinity, maxAnswer = -Infinity;
let minSum = Infinity, maxSum = -Infinity;
const seen = new Set();

for (const r of pool) {
  expect(r.a >= 11 && r.a <= 19, `a ∈ [11,19] (a=${r.a})`);
  expect(r.b >= 11 && r.b <= 19, `b ∈ [11,19] (b=${r.b})`);
  expect(r.onesA === r.a % 10, `onesA = a%10 (${r.onesA} === ${r.a % 10})`);
  expect(r.onesB === r.b % 10, `onesB = b%10 (${r.onesB} === ${r.b % 10})`);
  expect(r.onesA + r.onesB <= 9, `ones sum < 10 (${r.onesA}+${r.onesB}=${r.onesA + r.onesB})`);
  expect(r.sum === r.onesA + r.onesB, `sum = onesA+onesB`);
  expect(r.answer === r.a + r.b, `answer = a+b`);
  if (r.answer < minAnswer) minAnswer = r.answer;
  if (r.answer > maxAnswer) maxAnswer = r.answer;
  if (r.sum < minSum) minSum = r.sum;
  if (r.sum > maxSum) maxSum = r.sum;
  const key = `${r.a}-${r.b}`;
  expect(!seen.has(key), `unique (a,b) pair: ${key}`);
  seen.add(key);
}

expect(minAnswer === 22 && maxAnswer === 29, `answer ∈ [22,29] (got ${minAnswer}..${maxAnswer})`);
expect(minSum === 2 && maxSum === 9, `sum ∈ [2,9] (got ${minSum}..${maxSum})`);

if (failed === 0) {
  console.log("\nAll L5 pool checks passed.");
  process.exit(0);
} else {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}

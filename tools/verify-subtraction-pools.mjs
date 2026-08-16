#!/usr/bin/env node

import { poolGens } from "../data/pools.js";

let failed = false;

function expect(condition, message) {
  if (!condition) {
    failed = true;
    console.error(`FAIL ${message}`);
  }
}

const level6 = poolGens[6]();
const level7 = poolGens[7]();
const level8 = poolGens[8]();

// 2026-08-16: L6 dropped its a-a facts (per user "不要出现相同的数相减"),
// so the pool is 45 entries — see data/pools.js generateL6Pool.
expect(level6.length === 45, `L6 pool size is 45, got ${level6.length}`);
for (const round of level6) {
  expect(round.a >= 1 && round.a <= 10, `L6 minuend out of range: ${round.a}`);
  expect(round.b >= 1 && round.b < round.a, `L6 invalid subtraction: ${round.a}-${round.b}`);
  expect(round.answer === round.a - round.b, `L6 answer mismatch: ${round.a}-${round.b}`);
}

expect(level7.length === 45, `L7 pool size is 45, got ${level7.length}`);
for (const round of level7) {
  expect(round.a >= 11 && round.a <= 19, `L7 minuend out of range: ${round.a}`);
  expect(round.b >= 1 && round.b <= round.ones, `L7 requires no borrowing: ${round.a}-${round.b}`);
  expect(round.answer === round.a - round.b, `L7 answer mismatch: ${round.a}-${round.b}`);
}

expect(level8.length === 36, `L8 pool size is 36, got ${level8.length}`);
for (const round of level8) {
  expect(round.a >= 11 && round.a <= 19, `L8 minuend out of range: ${round.a}`);
  expect(round.b > round.ones && round.b <= 9, `L8 requires borrowing: ${round.a}-${round.b}`);
  // 破十法 invariant: answer = ones + (10 - b). Equivalent to a - b but
  // checks the decomposition the L8 scene teaches.
  expect(round.answer === round.ones + (10 - round.b),
    `L8 破十法 invariant: ${round.a}-${round.b}, got ${round.answer}`);
  expect(round.answer === round.a - round.b, `L8 answer mismatch: ${round.a}-${round.b}`);
  // `rest` field is intentionally NOT in the pool — the L8 平十法
  // decomposition (b - ones) was dropped on the 2026-08-16 switch to
  // 破十法 (sub = 10 - b, computed in scene).
  expect(round.rest === undefined, `L8 pool should not carry .rest`);
}

if (failed) process.exit(1);
console.log("L6-L8 subtraction pools passed.");

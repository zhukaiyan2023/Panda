// tools/probe-kgo.mjs — directly call k.go("gameFeed") multiple times
// from the page console. If k.go itself is the freeze trigger, this
// minimal probe will reproduce it without any other onCorrect code.
import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const SKIP_TIMERS = process.env.SKIP_TIMERS !== "0";
console.log(`[probe] SKIP_TIMERS=${SKIP_TIMERS}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 1,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
}, SKIP_TIMERS);

await page.goto(URL, { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 }),
  );
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(1500);

async function isAlive(label) {
  try {
    const r = await Promise.race([
      page.evaluate(() => "alive"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("frozen")), 1500)),
    ]);
    return r === "alive";
  } catch (e) {
    return `DEAD: ${e.message}`;
  }
}

const t0 = Date.now();
function ms() { return Date.now() - t0; }

// Call k.go 5 times in a row from the page console
console.log(`[probe] @${ms()}ms before k.go #1`);
const r1 = await page.evaluate(() => {
  const t0 = performance.now();
  window.kaplay.go("gameFeed");
  return `k.go returned in ${performance.now() - t0}ms`;
});
console.log(`[probe] @${ms()}ms ${r1}`);
const a1 = await isAlive("after #1");
console.log(`[probe] @${ms()}ms alive after #1: ${a1}`);

await page.waitForTimeout(500);
console.log(`[probe] @${ms()}ms before k.go #2`);
const r2 = await page.evaluate(() => {
  const t0 = performance.now();
  window.kaplay.go("gameFeed");
  return `k.go returned in ${performance.now() - t0}ms`;
});
console.log(`[probe] @${ms()}ms ${r2}`);
const a2 = await isAlive("after #2");
console.log(`[probe] @${ms()}ms alive after #2: ${a2}`);

await page.waitForTimeout(500);
console.log(`[probe] @${ms()}ms before k.go #3`);
const r3 = await page.evaluate(() => {
  const t0 = performance.now();
  window.kaplay.go("gameFeed");
  return `k.go returned in ${performance.now() - t0}ms`;
});
console.log(`[probe] @${ms()}ms ${r3}`);
const a3 = await isAlive("after #3");
console.log(`[probe] @${ms()}ms alive after #3: ${a3}`);

await page.waitForTimeout(500);
console.log(`[probe] @${ms()}ms before k.go #4`);
const r4 = await page.evaluate(() => {
  const t0 = performance.now();
  window.kaplay.go("gameFeed");
  return `k.go returned in ${performance.now() - t0}ms`;
});
console.log(`[probe] @${ms()}ms ${r4}`);
const a4 = await isAlive("after #4");
console.log(`[probe] @${ms()}ms alive after #4: ${a4}`);

await page.waitForTimeout(500);
console.log(`[probe] @${ms()}ms before k.go #5`);
const r5 = await page.evaluate(() => {
  const t0 = performance.now();
  window.kaplay.go("gameFeed");
  return `k.go returned in ${performance.now() - t0}ms`;
});
console.log(`[probe] @${ms()}ms ${r5}`);
const a5 = await isAlive("after #5");
console.log(`[probe] @${ms()}ms alive after #5: ${a5}`);

await ctx.close();
await browser.close();
console.log("[probe] done");
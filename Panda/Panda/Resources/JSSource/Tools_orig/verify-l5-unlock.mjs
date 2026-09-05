#!/usr/bin/env node
// tools/verify-l5-unlock.mjs — 验证 save.js 修复 (L5 解锁)。
//
// Bug 2026-08-15: save.js sanitize() 把 unlockedLevel 钳到 [1, 4]，
// L5 永远解不了锁。修复后 clampInt(unlockedLevel, 1, 5, 1) + 5 步。
//
// 验证（不走完整 round 流程，因为 levels.json 没 rounds）：
//   1. save.js 加载/保存 with unlockedLevel=5 应该原样保留
//   2. picker 加载 unlockedLevel=5 → 5 个 play markers, 0 个 lock texts
//   3. starsByLevel[5] 可以 round-trip

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__skipTimers = true; });
await page.evaluate(() => { window.__skipDailyCap = true; });

let failed = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

// Test 1: save with unlockedLevel=5 should round-trip
console.log("Test 1: save.js unlockedLevel=5 round-trip");
const test1 = await page.evaluate(() => {
  window.PandaSave.save({
    unlockedLevel: 5,
    starsByLevel: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 0 },
    currentLevel: 5,
    unlockedGame: 1,
    starsByGame: {},
    daily: {},
  });
  const loaded = window.PandaSave.load();
  return {
    unlockedLevel: loaded.unlockedLevel,
    starsByLevel: loaded.starsByLevel,
    currentLevel: loaded.currentLevel,
  };
});
check(test1.unlockedLevel === 5, `unlockedLevel = 5 (got ${test1.unlockedLevel})`);
check(test1.currentLevel === 5, `currentLevel = 5 (got ${test1.currentLevel})`);
check(test1.starsByLevel[5] === 0, `starsByLevel[5] = 0 (got ${test1.starsByLevel[5]})`);
check(test1.starsByLevel[4] === 4, `starsByLevel[4] = 4 (got ${test1.starsByLevel[4]})`);

// Test 2: save with unlockedLevel=10 (out of range) should clamp to 5
console.log("\nTest 2: out-of-range unlockedLevel clamps to 5");
const test2 = await page.evaluate(() => {
  window.PandaSave.save({
    unlockedLevel: 10,
    starsByLevel: {},
    currentLevel: 1,
    unlockedGame: 1,
    starsByGame: {},
    daily: {},
  });
  return window.PandaSave.load().unlockedLevel;
});
check(test2 === 5, `unlockedLevel clamped to 5 (got ${test2})`);

// Test 3: picker should show 5 unlocked cards when unlockedLevel=5
console.log("\nTest 3: picker shows 5 unlocked cards");
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 5, starsByLevel: {}, currentLevel: 1 }),
  ),
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Navigate to picker
await page.evaluate(() => window.kaplay.go("levelPicker"));
await page.waitForTimeout(1500);

const pickerSnapshot = await page.evaluate(() => {
  const k = window.kaplay;
  const playMarkers = k
    .get("*", { recursive: true })
    .filter((o) => typeof o.text === "string" && o.text === "▶")
    .map((o) => {
      const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
      return { x: Math.round(p.x), y: Math.round(p.y) };
    });
  const lockTexts = k
    .get("*", { recursive: true })
    .filter((o) => typeof o.text === "string" && (o.text === "还没解锁" || o.text === "今天练够啦"))
    .map((o) => {
      const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
      return { text: o.text, x: Math.round(p.x), y: Math.round(p.y) };
    });
  return { playMarkers, lockTexts };
});
check(pickerSnapshot.playMarkers.length === 5, `5 play markers (got ${pickerSnapshot.playMarkers.length})`);
check(pickerSnapshot.lockTexts.length === 0, `0 lock texts (got ${pickerSnapshot.lockTexts.length})`);

// Test 4: L5 card should be clickable (taps advance to level5 scene)
console.log("\nTest 4: L5 card click navigates to level5 scene");
// Tap the L5 card area (rightmost card, ~x=1180, y=560)
await page.mouse.click(1180, 560);
await page.waitForTimeout(1500);

const sceneName = await page.evaluate(() => {
  // kaplay stores scene state; we can't directly query but we can check
  // whether level5 has been mounted by looking for stepBar labels.
  const k = window.kaplay;
  const hasLabels = k
    .get("*", { recursive: true })
    .filter((o) => typeof o.text === "string")
    .some((o) => o.text === "拆 a" || o.text === "拆 b" || o.text === "加个位" || o.text === "加十位" || o.text === "加起来");
  return hasLabels ? "level5" : "other";
});
check(sceneName === "level5", `navigated to level5 (got ${sceneName})`);

await browser.close();

if (consoleErrors.length > 0) {
  console.error(`\nConsole errors:\n${consoleErrors.join("\n")}`);
  process.exit(1);
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log("\n✓ L5 unlock verified: save.js supports L5, picker shows 5 cards unlocked, click → level5 scene.");
process.exit(0);
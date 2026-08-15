// tools/screenshot-whack.mjs — capture the gameWhack scene to verify the
// rebuilt whack-a-mole loads cleanly (no "Sprite not found" errors from
// the 10 new sprites registered in main.js).
//
// Force-unlocks `unlockedGame = 5` via localStorage.panda-save-v1 so the
// 5th card is reachable from the games picker. (Note: today's
// gamesPicker.js renders all 5 cards as unlocked regardless of save
// state, but injecting the unlock here is defensive — if future code
// gates the card on save.unlockedGame, this script keeps working.)
//
// Steps:
//   1. Navigate to index.html on the dev server
//   2. Force-unlock save.unlockedGame = 5 via page.evaluate(localStorage)
//   3. Click the "小游戏" tab on the level picker
//   4. Click the 打地鼠 card (i=4 in the 5-card row; x = 683 + (4 - 2) * 240 = 1163)
//   5. Wait 2-3s for the scene to settle (intro audio + 6 mole popUp)
//   6. Screenshot to tmp-screens/whack-scene.png
//
// Requires dev server running on localhost:8126 (npm run dev) and
// CHROME_PATH env var pointing at a chromium binary.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:8126/";
const OUT = "tmp-screens";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
});
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  // deviceScaleFactor 2 — retina-quality PNG, matches sibling screenshot tools.
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("[console.error]", msg.text());
  if (msg.type() === "log" && msg.text().includes("[whack]")) console.log("[console.log]", msg.text());
});

page.on("response", (res) => {
  if (res.status() >= 400) console.error("[404]", res.url(), "->", res.status());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Force-unlock unlockedGame=5 BEFORE first scene load so any pre-scene
// hooks that read PandaSave see the unlock. (gamesPicker currently renders
// all 5 cards unlocked regardless, but this is the documented entry
// pattern — keeps the script forward-compatible with future gating.)
await page.evaluate(() => {
  const KEY = "panda-save-v1";
  const cur = JSON.parse(window.localStorage.getItem(KEY) || "{}");
  cur.unlockedGame = 5;
  cur.starsByGame = cur.starsByGame || {};
  window.localStorage.setItem(KEY, JSON.stringify(cur));
});

// Tap to unlock audio (audio context requires a user gesture).
await page.mouse.click(683, 512);
await page.waitForTimeout(400);

const canvas = await page.$("canvas");
if (!canvas) throw new Error("canvas not found — page did not boot");
const box = await canvas.boundingBox();
const dims = await page.evaluate(() => {
  const c = document.getElementById("game");
  const r = c.getBoundingClientRect();
  return { width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height };
});
console.log("[canvas-dims]", JSON.stringify(dims));

// Inspect world-level scene size from the kaplay instance.
const sceneSize = await page.evaluate(() => {
  const k = window.kaplay;
  if (!k) return null;
  return { width: k.width(), height: k.height(), dt: k.dt?.() };
});
console.log("[scene-size]", JSON.stringify(sceneSize));

// Click the "小游戏" tab (levelPicker default scene).
await page.mouse.click(box.x + 1166, box.y + 200);
await page.waitForTimeout(900);

// Click the 打地鼠 card (i=4 in the 5-card row).
// stride=240, totalSpan=(5-1)*240=960, baseY=600.
// cardX[i] = 683 - 480 + i*240 = 203 + i*240.
// i=4 → x = 203 + 960 = 1163, y = 600.
await page.mouse.click(box.x + 1163, box.y + 600);

// Wait for the scene to settle: intro audio chain ("whack-intro" +
// "whack-start") plus 6 mole popUps (0.6s ease-out each, staggered). 3s
// gives the read-out audio time to fire and one round of mole animation
// to complete.
await page.waitForTimeout(3000);

await page.screenshot({ path: `${OUT}/whack-scene.png` });
console.log("[screenshot] captured whack scene");

await browser.close();
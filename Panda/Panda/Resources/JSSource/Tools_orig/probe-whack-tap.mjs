// tools/probe-whack-tap.mjs — verify tap handler fires + capture mid-popUp screenshot.
//
// Run after starting the dev server on localhost:8126:
//   CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//   node tools/probe-whack-tap.mjs
//
// What it does:
//   1. Loads the page, force-unlocks unlockedGame=5 in localStorage.
//   2. Clicks the 小游戏 tab + 打地鼠 card (matches screenshot-whack.mjs).
//   3. Waits ~3s for the scene to settle.
//   4. Captures whack-scene.png (post-popUp, all 6 moles up).
//   5. Captures whack-popup.png ~0.3s after a fresh popUp (mid-rise).
//   6. Clicks the middle-top mole and captures whack-tap.png ~0.3s later.
//   7. Streams all browser console messages — taps will log "[gameWhack]
//      tap { value: ..., occupied: true }" if the hit handler fired.
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
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error") console.error("[console.error]", msg.text());
  else console.log(`[browser.${t}]`, msg.text());
});
page.on("response", (res) => {
  if (res.status() >= 400) console.error("[404]", res.url(), "->", res.status());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

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

await page.mouse.click(box.x + 1166, box.y + 200);  // 小游戏 tab
await page.waitForTimeout(900);
await page.mouse.click(box.x + 1163, box.y + 600);  // 打地鼠 card

// Settle: intro audio + first popUp. Wait 3s.
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/whack-scene.png` });
console.log("[probe] captured whack-scene.png (post-popUp, settled)");

// Force a fresh popUp so we can capture mid-rise. The buildAndSpawn is
// scene-internal — we can't easily trigger one from outside. Instead,
// we just snapshot the next question's popUp phase by waiting for
// the audio chain to finish + a fresh round to spawn. The
// whack-correct → cheer chain is ~2-3s, so the next popUp fires
// around T+5-6s. Wait long enough to land mid-popUp.
await page.waitForTimeout(2500);  // mid-popUp of the next round
await page.screenshot({ path: `${OUT}/whack-popup.png` });
console.log("[probe] captured whack-popup.png (mid-popUp)");

// Now tap the top-middle mole. Grid x=748, top-row y=600 (mole center
// y ≈ 550 post-pop). Hit target center: (748, 580), rect 220×280
// centered → y range 440-720, x range 638-858. Tap near the mole face.
await page.mouse.click(box.x + 748, box.y + 560);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/whack-tap.png` });
console.log("[probe] captured whack-tap.png (post-tap)");

await browser.close();
console.log("[probe] done");
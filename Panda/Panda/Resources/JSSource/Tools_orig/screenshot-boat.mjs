// tools/screenshot-boat.mjs — quick visual check of the boat scene after
// the 2026-08-12 layout + sprite-swap changes.
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
  if (msg.type() === "error") console.error("[console.error]", msg.text());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
// Tap to unlock audio.
await page.mouse.click(683, 512);
await page.waitForTimeout(400);

const canvas = await page.$("canvas");
const box = await canvas.boundingBox();

// Click Games tab on the level picker.
await page.mouse.click(box.x + 1166, box.y + 200);
await page.waitForTimeout(900);

// Click the 小船 game tile. Tile centers: i=0:203, i=1:443, i=2:683,
// i=3:923, i=4:1163. We want i=0 (小船 / boat).
await page.mouse.click(box.x + 203, box.y + 580);
await page.waitForTimeout(900);

// Round 0: take a baseline screenshot (no selection).
await page.screenshot({ path: `${OUT}/boat-unselected.png` });
console.log("[screenshot] captured boat (unselected)");

// Tap the first boat (top-left of the 3x2 grid) to swap to the
// selected sprite. With the new layout (cellW=320, gridX=428, gridY=540),
// top-left boat center is roughly at (428, 540).
await page.mouse.click(box.x + 428, box.y + 540);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/boat-selected.png` });
console.log("[screenshot] captured boat (selected)");

// Tap another boat to make a (likely-wrong) pair so the kid's
// onCorrect path doesn't run; just verify the second boat also swaps.
await page.mouse.click(box.x + 748, box.y + 540);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/boat-pair-attempt.png` });
console.log("[screenshot] captured boat (pair attempt)");

await browser.close();

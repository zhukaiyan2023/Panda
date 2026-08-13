// tools/screenshot-bounce-and-picker.mjs — verify the unlock-all + balloon-shrink fixes.
//
// 1. Load app, click "小游戏" tab → screenshot games picker (should show 5 unlocked cards).
// 2. Click 气球 card → screenshot gameBounce (balloons should fit comfortably).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:8126/?v=20260812";
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
page.on("response", (res) => {
  if (res.status() >= 400) console.error("[404]", res.url(), "->", res.status());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// Tap to unlock audio.
await page.mouse.click(683, 512);
await page.waitForTimeout(400);

const canvas = await page.$("canvas");
if (!canvas) throw new Error("canvas not found after 2.4s wait — page did not boot");
const box = await canvas.boundingBox();

// Click Games tab on the level picker.
await page.mouse.click(box.x + 1166, box.y + 200);
await page.waitForTimeout(900);

await page.screenshot({ path: `${OUT}/games-picker.png` });
console.log("[screenshot] captured games picker");

// Now click the 气球 (balloon) card. With 4 cards centered on x=683 and
// stride 240, the cards are at x = 683 + (i - 1.5) * 240 →
//   小船(i=0): 323, 气球(i=1): 563, 云朵(i=2): 803, 喂食(i=3): 1043
await page.mouse.click(box.x + 563, box.y + 600);
await page.waitForTimeout(900);

await page.screenshot({ path: `${OUT}/bounce-after.png` });
console.log("[screenshot] captured gameBounce");

await browser.close();
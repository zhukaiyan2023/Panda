// tools/screenshot-games.mjs — capture the games picker to see layout issues.
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
  deviceScaleFactor: 1,
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

await page.screenshot({ path: `${OUT}/games-picker.png` });
console.log("[screenshot] captured games picker");

await browser.close();

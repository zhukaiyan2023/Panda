// tools/screenshot-feed.mjs — capture the gameFeed scene after my changes.
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
await page.mouse.click(683, 512); // unlock audio
await page.waitForTimeout(400);

// Unlock all games.
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, unlockedGame: 5, starsByLevel: {}, starsByGame: {}, currentLevel: 1 }),
  ),
);

// Go directly to gameFeed scene.
await page.evaluate(() => window.kaplay.go("gameFeed"));
await page.waitForTimeout(1500);

await page.screenshot({ path: `${OUT}/game-feed.png` });
console.log("[screenshot] captured gameFeed");

await browser.close();

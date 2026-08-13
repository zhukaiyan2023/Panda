// Boot gameFeed, click one bubble via Playwright's real mouse API,
// and screenshot the highlighted state.
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

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

await page.evaluate(() =>
  localStorage.setItem("panda-save-v1", JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 })),
);
await page.evaluate(() => window.kaplay.go("gameFeed"));
await page.waitForTimeout(3500);

// For n=5 the bubble row centers at x=748 with cellW=110. Leftmost
// bubble center is at x=748 - 2*110 = 528. Hitbox is 110x110 centered
// at the bubble's world position. Tap the leftmost bubble (its world
// y is 640 per gridY in gameFeed.js). Convert to page coords: kaplay's
// canvas covers the full viewport so canvas y == page y.
await page.mouse.click(528, 640);
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/feed-selected.png" });

await browser.close();
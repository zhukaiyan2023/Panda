// Boot gameFeed and capture a screenshot.
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
await page.screenshot({ path: "/tmp/feed-screenshot.png" });
await browser.close();
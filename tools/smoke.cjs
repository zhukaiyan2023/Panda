// tools/smoke.js — Playwright headless smoke test.
// Loads http://localhost:8126/, waits for the canvas to render, captures
// any console errors, and saves a screenshot to /tmp/panda-smoke.png.

const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/Users/kaiyan/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => consoleErrors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));

  try {
    await page.goto("http://localhost:8126/", { waitUntil: "networkidle", timeout: 15000 });
  } catch (err) {
    console.error("[smoke] navigation failed:", err.message);
    process.exitCode = 1;
  }

  await page.waitForTimeout(1500);

  const canvasExists = await page.evaluate(() => !!document.getElementById("game"));
  const audioCount = await page.evaluate(() => Object.keys((window.PandaAudio && window.PandaAudio.audio) || {}).length);
  const levelsLoaded = await page.evaluate(() => (window.PandaLevels && window.PandaLevels.levels || []).length);

  await page.screenshot({ path: "/tmp/panda-smoke.png", fullPage: false });

  console.log(`canvas=${canvasExists} audioCues=${audioCount} levelsLoaded=${levelsLoaded}`);
  console.log(`consoleErrors=${consoleErrors.length}`);
  for (const e of consoleErrors) console.log(`  err: ${e}`);

  // try a tap to simulate user gesture / audio unlock
  try {
    await page.tap("#game");
    await page.waitForTimeout(500);
  } catch (_) {}

  // tap the L1 card (centered horizontally, slightly above middle)
  try {
    const canvasBox = await page.locator("#game").boundingBox();
    if (canvasBox) {
      // click roughly where the L1 card lives: left third, ~50% down
      await page.mouse.click(canvasBox.x + canvasBox.width * 0.18, canvasBox.y + canvasBox.height * 0.55);
      await page.waitForTimeout(800);
      const sceneNow = await page.evaluate(() => {
        const k = window.kaplay;
        if (!k) return null;
        try { return k.getSceneName(); } catch (_) { return null; }
      });
      console.log(`after-tap scene=${sceneNow}`);
      await page.screenshot({ path: "/tmp/panda-smoke-level1.png", fullPage: false });
    }
  } catch (err) {
    console.log(`after-tap error: ${err.message}`);
  }

  await ctx.close();
  await browser.close();

  if (!canvasExists || audioCount < 31 || levelsLoaded !== 3) {
    console.error("[smoke] FAIL: required game state not initialized");
    process.exit(2);
  }
  console.log("[smoke] OK");
})();
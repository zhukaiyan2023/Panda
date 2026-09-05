// tools/probe-smoke.mjs — load the dev server in headless Chromium and
// report every console message + pageerror verbatim, with a screenshot.
//
// tools/smoke.cjs collapses errors to a count and aborts when something
// fails, which is the right shape for CI but useless when I'm trying to
// see what broke after a refactor. This script is the equivalent of
// "open the page in Chrome and watch the devtools console".

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  // deviceScaleFactor 2 (was 1, 2026-08-12) — matches iPad retina.
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

const lines = [];
page.on("console", (msg) => lines.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => lines.push(`[pageerror] ${err.stack || err.message}`));
page.on("requestfailed", (req) => lines.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

try {
  await page.goto("http://localhost:8126/", { waitUntil: "networkidle", timeout: 15000 });
} catch (err) {
  lines.push(`[nav-failed] ${err.message}`);
}

await page.waitForTimeout(2000);

const audioCount = await page.evaluate(() => window.PandaAudio?.audioMaterializedCount?.() ?? -1);
const levelsLoaded = await page.evaluate(() => (window.PandaLevels?.levels || []).length);
const sceneNow = await page.evaluate(() => {
  try { return window.kaplay?.getSceneName?.(); } catch (_) { return null; }
});

await page.screenshot({ path: "/tmp/probe.png", fullPage: false });

await ctx.close();
await browser.close();

console.log(`audioCues=${audioCount} levels=${levelsLoaded} scene=${sceneNow}`);
console.log("--- console ---");
for (const l of lines) console.log(l);

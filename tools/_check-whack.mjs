// Manual smoke test for gameWhack — boots the scene, lets moles spawn
// for ~3s, dumps the on-screen entity positions, and saves a screenshot
// to /tmp/whack-screenshot.png for visual inspection of the grass retheme.
//
// Run with: CHROME_PATH=... node tools/_check-whack.mjs
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

await page.evaluate(() => window.kaplay.go("gameWhack"));
await page.waitForTimeout(3500);

const scene = await page.evaluate(() => {
  const k = window.kaplay;
  const all = k.get("*", { recursive: true });
  const moles = all.filter(o => o.sprite === "mole" && o.opacity > 0.5);
  const badges = all.filter(o => o.sprite === undefined && o.radius > 20 && o.opacity > 0.5);
  const nums = all.filter(o => typeof o.text === "string" && /^[1-9]$/.test(o.text));
  const holes = all.filter(o => typeof o.sprite === "string" && o.sprite.startsWith("mole-hole"));
  return {
    moles: moles.map(m => ({
      sprite: m.sprite,
      pos: { x: m.pos.x, y: m.pos.y },
      opacity: m.opacity,
      z: m.z,
      scale: m.scale ? m.scale.x : null,
    })),
    badges: badges.map(b => ({
      pos: { x: b.pos.x, y: b.pos.y },
      opacity: b.opacity,
      z: b.z,
      color: b.color,
      radius: b.radius,
    })),
    nums: nums.map(n => ({
      text: n.text,
      pos: { x: n.pos.x, y: n.pos.y },
      opacity: n.opacity,
      z: n.z,
    })),
    holes: holes.map(h => ({
      sprite: h.sprite,
      pos: { x: h.pos.x, y: h.pos.y },
      z: h.z,
      scale: h.scale ? h.scale.x : null,
    })),
  };
});
console.log(JSON.stringify(scene, null, 2));

await page.screenshot({ path: "/tmp/whack-screenshot.png" });
await browser.close();
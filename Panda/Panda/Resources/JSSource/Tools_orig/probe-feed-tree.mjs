// tools/probe-feed-tree.mjs — dump tree nodes for debugging
import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 1,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 }),
  );
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(2500);

const tree = await page.evaluate(() => {
  const k = window.kaplay;
  const root = k.getTreeRoot();
  const out = [];
  function walk(n, d) {
    if (!n || d > 12) return;
    const info = {
      d,
      type: n.constructor?.name || typeof n,
      hasText: n.text != null,
      text: n.text != null ? String(n.text) : null,
      hasPos: !!n.pos,
      x: n.pos?.x ?? null,
      y: n.pos?.y ?? null,
      hasSprite: !!n.sprite,
      sprite: n.sprite || null,
      hasChildren: !!(n.children && n.children.length),
    };
    if (n.children) info.childCount = n.children.length;
    out.push(info);
    if (n.children) for (const c of n.children) walk(c, d + 1);
  }
  walk(root, 0);
  return out;
});

for (const n of tree) {
  console.log(`d=${n.d} type=${n.type} x=${n.x} y=${n.y} text=${n.text} sprite=${n.sprite} kids=${n.childCount}`);
}

await ctx.close();
await browser.close();
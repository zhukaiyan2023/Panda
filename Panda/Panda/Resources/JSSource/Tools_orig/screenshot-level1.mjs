// tools/screenshot-level1.mjs — capture L1 rounds to verify the merged
// cell-row + persistent-anchor + sub-question layout. Steps 1 and 2 are
// captured for each round.
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
  // deviceScaleFactor bumped 1 → 2 (2026-08-12) so screenshots are
  // rendered at 2732×2048 instead of 1366×1024 — the user reported
  // "图有些模糊" because the 1× PNG gets upscaled by the viewer
  // and the font edges blur. 2× matches the iPad's native pixel
  // ratio (the actual target platform). Click coordinates are
  // unchanged because Playwright's mouse.click uses CSS pixels, not
  // device pixels.
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("[console.error]", msg.text());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.evaluate(() => { window.__skipTimers = true; });
await page.mouse.click(683, 512);
await page.waitForTimeout(400);

const canvas = await page.$("canvas");
const box = await canvas.boundingBox();

// Pick L1 — click the "三数相加" card center. The picker lays out 4
// cards at the same y; L1 sits at the leftmost slot. Card 1 center
// in the 1366×1024 viewport is ~(275, 480). The earlier (360, 560)
// coord was from the pre-2026-08-11 picker layout.
await page.mouse.click(box.x + 275, box.y + 480);
await page.waitForTimeout(900);

async function readRow(y, tol = 12) {
  return page.evaluate(({ y, tol }) => {
    const k = window.kaplay;
    return k.get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && o.text.length > 0)
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: o.text, x: p.x, y: p.y };
      })
      .filter((o) => Math.abs(o.y - y) <= tol)
      .sort((a, b) => a.x - b.x);
  }, { y, tol });
}

async function findButton(value) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const row = await readRow(838, 12);
    const hit = row.find((b) => String(b.text) === String(value));
    if (hit) return hit;
    await page.waitForTimeout(50);
  }
  return null;
}

async function readHighlightedStep() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const stepRects = k.get("*", { recursive: true })
      .filter((o) => o.width && o.height && o.children && o.children.length >= 1)
      .filter((o) => {
        const c = o.children[0];
        return c && c.color && Array.isArray(c.color.rgb) && c.width > 100 && c.width < 400 && Math.abs(c.pos.y - 134) < 5;
      })
      .map((o) => o.children[0])
      .sort((a, b) => a.pos.x - b.pos.x);
    return stepRects.map((c) => c.color.rgb.join(","));
  });
}

// Identify the current round by reading the persistent anchor equation's
// three addends and computing pair sum + answer directly. Replaces the
// old `PandaLevels.levels` lookup which doesn't exist any more
// (2026-08-11 refactor — `levelsData` only carries title metadata, the
// rounds are generated on the fly by data/pools.js's `poolGens[1]()`).
async function expectedPicks() {
  return page.evaluate(() => {
    const k = window.kaplay;
    // The persistent anchor sits at y=360 (2026-08-11 layout — was 220
    // when cells were below it). Read every numeric text node at that
    // row, sorted by x — gives us [num, num, num] in order.
    const anchorTexts = k.get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && /^\d+$/.test(o.text))
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: o.text, x: p.x, y: p.y };
      })
      .filter((o) => Math.abs(o.y - 360) < 30)
      .sort((a, b) => a.x - b.x)
      .map((o) => Number(o.text));
    if (anchorTexts.length < 3) return { pairSum: null, answer: null };
    const [a, b, c] = anchorTexts;
    // L1's pool is SUM-≤-10 only — choosePair always picks the first
    // two addends as the pair (no make-a-ten shortcut). pair sum is
    // a+b, the final answer is a+b+c. Both are exact given the anchor.
    return { pairSum: a + b, answer: a + b + c };
  });
}

for (let r = 1; r <= 4; r++) {
  const { pairSum, answer } = await expectedPicks();
  console.log(`round ${r}: pairSum=${pairSum}, answer=${answer}`);

  // Step 1 — capture before picking.
  await page.screenshot({ path: `${OUT}/l1-r${r}-step1.png` });
  const btn1 = await findButton(pairSum);
  if (!btn1) { console.error(`  r${r} step1: no button for ${pairSum}`); continue; }
  await page.mouse.click(box.x + btn1.x, box.y + btn1.y);
  await page.waitForTimeout(400);

  // Wait for step 2 to land.
  const yellow = "255,209,102";
  for (let attempt = 0; attempt < 80; attempt++) {
    const colors = await readHighlightedStep();
    if (colors[1] === yellow) break;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);

  // Step 2 — capture before picking.
  await page.screenshot({ path: `${OUT}/l1-r${r}-step2.png` });
  const btn2 = await findButton(answer);
  if (!btn2) { console.error(`  r${r} step2: no button for ${answer}`); continue; }
  await page.mouse.click(box.x + btn2.x, box.y + btn2.y);
  await page.waitForTimeout(400);

  // Reveal state.
  await page.screenshot({ path: `${OUT}/l1-r${r}-reveal.png` });
  await page.waitForTimeout(700);
}

await browser.close();
console.log("[screenshot] done → " + OUT);

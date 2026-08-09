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
  deviceScaleFactor: 1,
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

// Pick L1.
await page.mouse.click(box.x + 360, box.y + 560);
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

// Compute pair sum (Pattern A: first two; Pattern B: pair to ten).
async function expectedPicks() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const label = k.get("*", { recursive: true })
      .find((o) => typeof o.text === "string" && /^Round \d+ \/ \d+$/.test(o.text))?.text || "";
    const roundNum = Number(label.split("/")[0].replace("Round", "").trim()) - 1;
    const lvl = window.PandaLevels.levels.find((l) => l.id === 1);
    const r = lvl.rounds[roundNum];
    let pair;
    for (let i = 0; i < r.nums.length; i++) {
      for (let j = i + 1; j < r.nums.length; j++) {
        if (r.nums[i] + r.nums[j] === 10) { pair = [r.nums[i], r.nums[j]]; break; }
      }
      if (pair) break;
    }
    if (!pair) pair = [r.nums[0], r.nums[1]];
    return { pairSum: pair[0] + pair[1], answer: r.answer };
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

// tools/screenshot-level2.mjs — capture L2 rounds to verify the compare →
// make-ten → split → count flow.
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
  if (m => m.type() === "error") console.error("[console.error]", msg.text());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.evaluate(() => { window.__skipTimers = true; });
// Unlock all levels so L2/L3 are reachable.
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, currentLevel: 2 }),
  ),
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.mouse.click(683, 512);
await page.waitForTimeout(300);

const canvas = await page.$("canvas");
const box = await canvas.boundingBox();

// Pick L2.
await page.mouse.click(box.x + 740, box.y + 560);
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
    const hit = row.find((b) => b.text === String(value));
    if (hit) return hit;
    await page.waitForTimeout(50);
  }
  return null;
}

async function readHighlightedStep() {
  // The step bar shows 4 pills; the highlighted one is the current step.
  // Pills are at y≈134, the active one has YELLOW bg (255, 209, 102), the
  // rest have TRACK bg (240, 236, 250).
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

// Round 1: 8+5, need=2, rest=3, answer=13. Correct split = "2+3".
// Round 2: 7+6, need=3, rest=3, answer=13. Correct split = "3+3".
const expectedByRound = {
  1: [">", 2, "2+3", 13],
  2: [">", 3, "3+3", 13],
};

for (let r = 1; r <= 2; r++) {
  const expectedSteps = expectedByRound[r];
  for (let s = 0; s < expectedSteps.length; s++) {
    // Wait for the highlighted step pill to actually match this step index.
    if (s > 0) {
      const yellow = "255,209,102";
      for (let attempt = 0; attempt < 80; attempt++) {
        const colors = await readHighlightedStep();
        if (colors[s] === yellow) break;
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: `${OUT}/l2-r${r}-step${s + 1}.png` });
    const expected = expectedSteps[s];
    const btn = await findButton(expected);
    if (!btn) {
      console.error(`  r${r} step ${s+1}: no button for ${expected}`);
      continue;
    }
    await page.mouse.click(box.x + btn.x, box.y + btn.y);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/l2-r${r}-step${expectedSteps.length + 1}-reveal.png` });
}

await browser.close();
console.log("[screenshot] done → " + OUT);
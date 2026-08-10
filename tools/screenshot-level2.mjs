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
  if (msg.type() === "error") console.error("[console.error]", msg.text());
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
    const row = await readRow(838, 16);
    const hit = row.find((b) => b.text === String(value));
    if (hit) return hit;
    await page.waitForTimeout(50);
  }
  // Last resort: dump what's at y=838±20 so we can see what's actually there
  const dbg = await readRow(838, 30);
  console.error(`  [findButton] wanted "${value}" but row was: ${JSON.stringify(dbg.map((b) => b.text))}`);
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

// Read the actual round values from the persistent anchor at y=420.
// (Frame labels at y=205 were removed per user feedback 2026-08-11
// — "方格子上数字不要展示了，多余" — so we can't derive big/small
// from frame labels anymore.) The anchor preserves round.a on the
// LEFT and round.b on the RIGHT, so the compare sign we want
// ("a ? b") is determined by the anchor's order, NOT by which
// addend happens to be bigger. big/small themselves are derived
// from max/min of round.a and round.b.
async function readRound() {
  const dump = await page.evaluate(() => {
    const k = window.kaplay;
    return k.get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && /^\d+$/.test(o.text))
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: parseInt(o.text, 10), x: Math.round(p.x), y: Math.round(p.y) };
      });
  });
  // Anchor digits at y=420 (the persistent "a + b = □" at the top).
  // Sort by x to recover round.a (left) and round.b (right).
  const anchorDigits = dump
    .filter((o) => o.y >= 400 && o.y <= 440)
    .sort((a, b) => a.x - b.x);
  if (anchorDigits.length < 2) return null;
  const roundA = anchorDigits[0].text;
  const roundB = anchorDigits[1].text;
  const big = Math.max(roundA, roundB);
  const small = Math.min(roundA, roundB);
  if (big === small) return { equal: true, big, small, roundA, roundB };
  const need = 10 - big;
  const rest = small - need;
  const answer = big + small;
  // Compare sign uses round.a vs round.b (the anchor's order, which
  // matches the sub-question's order). Big > small would be wrong for
  // a round where round.a is small (e.g. round.a=5 round.b=8 — the
  // sub-question reads "5 □ 8", correct sign "<", even though the
  // bigger addend is on the right).
  const compareCorrect = roundA > roundB ? ">" : "<";
  // The correct split is always need+rest (canonical image-1 order,
  // need first). buildSplitOptions also uses need+rest as correctStr
  // and excludes the swap — both orderings never co-exist in the
  // button row. So we hardcode need+rest here too, regardless of
  // which is the smaller number.
  const correctSplit = `${need}+${rest}`;
  return { big, small, roundA, roundB, need, rest, answer, compareCorrect, correctSplit };
}

let capturedBig = false;
let capturedSmall = false;
for (let r = 1; r <= 10; r++) {
  const round = await readRound();
  if (!round) { console.error(`  r${r}: no frame labels found`); continue; }
  if (round.equal) {
    console.log(`[round ${r}] big=small=${round.big} — equal case, skipping`);
    // Step 1 has no question for equal — just wait for auto-advance.
    await page.waitForTimeout(1500);
    continue;
  }
  // Track which cases we already captured so we don't redo work.
  // aIsBig  → round.a is the bigger addend (round.a > round.b)
  // aIsSmall → round.a is the smaller addend (round.a < round.b)
  const isBigCase = round.roundA > round.roundB;
  if (isBigCase && capturedBig) { await advanceOneRound(); continue; }
  if (!isBigCase && capturedSmall) { await advanceOneRound(); continue; }
  console.log(`[round ${r}] big=${round.big} small=${round.small} need=${round.need} rest=${round.rest} answer=${round.answer} aIsBig=${isBigCase}`);
  const expectedSteps = [round.compareCorrect, String(round.need), round.correctSplit, String(round.answer)];
  for (let s = 0; s < expectedSteps.length; s++) {
    if (s > 0) {
      const yellow = "255,209,102";
      for (let attempt = 0; attempt < 80; attempt++) {
        const colors = await readHighlightedStep();
        if (colors[s] === yellow) break;
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(200);
    }
    const tag = isBigCase ? "big" : "small";
    await page.screenshot({ path: `${OUT}/l2-r${r}-${tag}-step${s + 1}.png` });
    const expected = expectedSteps[s];
    const btn = await findButton(expected);
    if (!btn) {
      console.error(`  r${r} step ${s+1}: no button for ${expected}`);
      continue;
    }
    await page.mouse.click(box.x + btn.x, box.y + btn.y);
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/l2-r${r}-${isBigCase ? "big" : "small"}-step${expectedSteps.length + 1}-reveal.png` });
  if (isBigCase) capturedBig = true;
  else capturedSmall = true;
  if (capturedBig && capturedSmall) break;
}

async function advanceOneRound() {
  // Quick skip: just wait long enough for the round to finish its
  // remaining steps (no clicks) and the next round to start rendering.
  await page.waitForTimeout(2500);
}

await browser.close();
console.log("[screenshot] done → " + OUT);
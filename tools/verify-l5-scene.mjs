#!/usr/bin/env node
// tools/verify-l5-scene.mjs — L5 关卡专项验证 (v5 cascading 6-row)。
//
// v5 layout (6 persistent rows + anchor):
//   y=200  anchor        a + b = ?
//   y=320  split-1       □ + □ + b = ?
//   y=400  split-2       10 + 1 + □ + □ = ?
//   y=480  split-3       10 + 1 + 10 + 1 = ?
//   y=600  combine-tens  10 + 10 = ?
//   y=680  combine-ones  □ + □ = ?
//   y=760  final         □ + □ = ?
//
// All 7 rows persistent across all 5 steps; only slot CONTENT
// (□ → digit) changes as the kid answers.

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

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__skipTimers = true; });
await page.evaluate(() => { window.__skipDailyCap = true; });

await page.evaluate(() => window.kaplay.go("level5"));
await page.waitForTimeout(1500);

async function readAllText() {
  return page.evaluate(() => {
    const k = window.kaplay;
    return k
      .get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && o.text.length > 0)
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: o.text, x: Math.round(p.x), y: Math.round(p.y) };
      })
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  });
}

function readAnchorPair(nodes) {
  const anchor = nodes.filter((n) => n.y >= 180 && n.y <= 220);
  const twoDigit = anchor.filter((n) => /^\d{2}$/.test(n.text));
  if (twoDigit.length < 2) return null;
  twoDigit.sort((a, b) => a.x - b.x);
  return { a: parseInt(twoDigit[0].text, 10), b: parseInt(twoDigit[1].text, 10) };
}

function readDigitsAtY(nodes, yCenter, tolerance = 25) {
  return nodes
    .filter((n) => Math.abs(n.y - yCenter) <= tolerance)
    .filter((n) => /^\d+$/.test(n.text))
    .map((n) => parseInt(n.text, 10));
}

async function clickButtonValue(value) {
  const all = await readAllText();
  const btns = all
    .filter((n) => n.y >= 820 && n.y <= 860)
    .filter((n) => /^\d+$/.test(n.text))
    .map((n) => ({ value: parseInt(n.text, 10), x: n.x, y: n.y }));
  const target = btns.find((b) => b.value === value);
  if (!target) return false;
  await page.mouse.click(target.x, target.y);
  return true;
}

let totalQuestions = 0;
let totalCorrect = 0;
const roundsToPlay = 3;

for (let roundIdx = 0; roundIdx < roundsToPlay; roundIdx++) {
  await page.waitForTimeout(800);
  const all = await readAllText();
  const pair = readAnchorPair(all);
  if (!pair) {
    console.error(`FAIL round ${roundIdx + 1}: anchor pair not found`);
    console.error("all nodes:", JSON.stringify(all, null, 2));
    process.exit(1);
  }
  const { a, b } = pair;
  const onesA = a % 10;
  const onesB = b % 10;
  const sum = onesA + onesB;
  const answer = a + b;
  const correctSequence = [onesA, onesB, 20, sum, answer];
  console.log(`\nRound ${roundIdx + 1}: a=${a}, b=${b} (onesA=${onesA}, onesB=${onesB}, sum=${sum}, answer=${answer})`);

  for (let step = 0; step < 5; step++) {
    await page.waitForTimeout(600);
    const stepAll = await readAllText();

    const split1 = readDigitsAtY(stepAll, 320).sort();
    const split2 = readDigitsAtY(stepAll, 400).sort();
    const split3 = readDigitsAtY(stepAll, 480).sort();
    const tensDigits  = readDigitsAtY(stepAll, 600).sort();
    const onesDigits  = readDigitsAtY(stepAll, 680).sort();
    const finalDigits = readDigitsAtY(stepAll, 760).sort();

    // split-1: "? + ? + b = ?" (step 1 pre-click) → "10 + onesA + b = ?"
    //   digits: [b] pre-click, [10, onesA, b] post-click.
    let expSplit1 = [];
    if (step >= 1) expSplit1.push(10, onesA);
    expSplit1.push(b);

    // split-2: "10 + onesA + ? + ? = ?" (step 2 pre-click) →
//          "10 + onesA + 10 + onesB = ?" (step 2 reveal onwards).
    //   digits: [10, onesA] pre-click, [10, onesA, 10, onesB] post-click.
    let expSplit2 = [10, onesA];
    if (step >= 2) expSplit2.push(10, onesB);

    // split-3: "10 + onesA + 10 + onesB = ?" — always fully revealed.
    //   But on step 1 pre-click, the kid hasn't picked yet so the
    //   onesA / onesB are technically unknown — we still show them
    //   (the cascading rows are persistent and the kid will see all
    //   the splits as "given"). Digits: [10, onesA, 10, onesB].
    let expSplit3 = [10, onesA, 10, onesB];

    // combine-tens: "10 + 10 = ?" (step 3 reveal: → 20).
    let expTens = [10, 10];
    if (step >= 3) expTens.push(20);

    // combine-ones: "□ + □ = ?" — at step 4 (加个位) the addends
    // onesA + onesB are pre-filled (revealed from steps 1-2); sum is
    // the answer slot to be picked. After step 4 reveal, sum shows.
    let expOnes = [];
    if (step >= 3) expOnes.push(onesA, onesB);
    if (step >= 4) expOnes.push(sum);

    // final: "□ + □ = ?" — at step 5 (加起来) the 20 is pre-filled
    // (revealed from step 3) and sum is pre-filled (revealed from
    // step 4); answer is the answer slot to be picked.
    let expFinal = [];
    if (step >= 3) expFinal.push(20);
    if (step >= 4) expFinal.push(sum);
    if (step >= 5) expFinal.push(answer);

    const s1OK = JSON.stringify(split1) === JSON.stringify(expSplit1.sort());
    const s2OK = JSON.stringify(split2) === JSON.stringify(expSplit2.sort());
    const s3OK = JSON.stringify(split3) === JSON.stringify(expSplit3.sort());
    const tOK  = JSON.stringify(tensDigits) === JSON.stringify(expTens.sort());
    const oOK  = JSON.stringify(onesDigits) === JSON.stringify(expOnes.sort());
    const fOK  = JSON.stringify(finalDigits) === JSON.stringify(expFinal.sort());

    console.log(`  Step ${step + 1}:`);
    console.log(`    split1 y=320: ${JSON.stringify(split1)} expected ${JSON.stringify(expSplit1.sort())} ${s1OK ? "✓" : "✗"}`);
    console.log(`    split2 y=400: ${JSON.stringify(split2)} expected ${JSON.stringify(expSplit2.sort())} ${s2OK ? "✓" : "✗"}`);
    console.log(`    split3 y=480: ${JSON.stringify(split3)} expected ${JSON.stringify(expSplit3.sort())} ${s3OK ? "✓" : "✗"}`);
    console.log(`    tens   y=600: ${JSON.stringify(tensDigits)} expected ${JSON.stringify(expTens.sort())} ${tOK ? "✓" : "✗"}`);
    console.log(`    ones   y=680: ${JSON.stringify(onesDigits)} expected ${JSON.stringify(expOnes.sort())} ${oOK ? "✓" : "✗"}`);
    console.log(`    final  y=760: ${JSON.stringify(finalDigits)} expected ${JSON.stringify(expFinal.sort())} ${fOK ? "✓" : "✗"}`);

    if (!s1OK || !s2OK || !s3OK || !tOK || !oOK || !fOK) {
      console.error(`  FAIL: row digits mismatch at step ${step + 1}`);
      console.error("  all text nodes:", JSON.stringify(stepAll, null, 2));
      process.exit(1);
    }

    const ok = await clickButtonValue(correctSequence[step]);
    if (!ok) {
      console.error(`  FAIL: button ${correctSequence[step]} not found at step ${step + 1}`);
      process.exit(1);
    }
    totalCorrect++;
    totalQuestions++;
  }

  console.log(`  ✓ 5 steps completed for (a=${a}, b=${b}, answer=${answer})`);
}

await browser.close();

if (consoleErrors.length > 0) {
  console.error(`\nConsole errors during play:\n${consoleErrors.join("\n")}`);
  process.exit(1);
}

console.log(`\n✓ L5 scene verified: ${totalCorrect}/${totalQuestions} correct picks across ${roundsToPlay} rounds.`);
process.exit(0);
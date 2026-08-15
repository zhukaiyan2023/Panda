#!/usr/bin/env node
// tools/verify-l5-scene.mjs — L5 关卡专项验证 (v4 cascading layout)。
//
// v4 layout (persistent across all 5 steps):
//   y=200  anchor        a + b = ?
//   y=320  split row     cascading 4 stages (boxes fill in over steps 1-2)
//   y=460  tens sum      10 + 10 = ?
//   y=540  ones sum      □ + □ = ?
//   y=620  final         □ + □ = ?

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

function readDigitsAtY(nodes, yCenter, tolerance = 30) {
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

    const splitDigits = readDigitsAtY(stepAll, 320).sort();
    const tensDigits  = readDigitsAtY(stepAll, 460).sort();
    const onesDigits  = readDigitsAtY(stepAll, 540).sort();
    const finalDigits = readDigitsAtY(stepAll, 620).sort();

    // Split row stages at each loop step (BEFORE click):
    //   step=0 (拆 a pre):    stage 0 → [b]
    //   step=1 (拆 b pre):    stage 2 → [10, onesA]   (b is now split into boxes)
    //   step=2 (加十位 pre): stage 3 → [10, onesA, 10, onesB]
    //   step=3 (加个位 pre): stage 3 (held)
    //   step=4 (加起来 pre): stage 3 (held)
    let expSplit = [];
    if (step === 0) expSplit.push(b);
    if (step >= 1) expSplit.push(10, onesA);
    if (step >= 2) expSplit.push(10, onesB);

    // Tens sum row: 10 + 10 = ?. Step 3 (加十位 pre-click) shows
    // only the two 10s. Step 3 reveal adds 20 — so step 4 onwards
    // shows [10, 10, 20].
    let expTens = [10, 10];
    if (step >= 3) expTens.push(20);

    // Ones sum row: ? + ? = ?. Step 3 (加十位 pre-click) builds
    // the row with addends visible (onesA, onesB). Step 4 (加个位
    // pre-click) has the same. After step 4 reveal, sum is added.
    let expOnes = [];
    if (step >= 2) expOnes.push(onesA, onesB);
    if (step >= 4) expOnes.push(sum);

    // Final row: □ + □ = ?. Step 4 (加个位 pre-click) pre-fills 20.
    // Step 5 (加起来 pre-click) adds sum.
    let expFinal = [];
    if (step >= 3) expFinal.push(20);
    if (step >= 4) expFinal.push(sum);
    if (step >= 5) expFinal.push(answer);

    const splitOK = JSON.stringify(splitDigits) === JSON.stringify(expSplit.sort());
    const tensOK  = JSON.stringify(tensDigits)  === JSON.stringify(expTens.sort());
    const onesOK  = JSON.stringify(onesDigits)  === JSON.stringify(expOnes.sort());
    const finalOK = JSON.stringify(finalDigits) === JSON.stringify(expFinal.sort());

    console.log(`  Step ${step + 1}:`);
    console.log(`    split y=320: ${JSON.stringify(splitDigits)} expected ${JSON.stringify(expSplit.sort())} ${splitOK ? "✓" : "✗"}`);
    console.log(`    tens  y=460: ${JSON.stringify(tensDigits)} expected ${JSON.stringify(expTens.sort())} ${tensOK ? "✓" : "✗"}`);
    console.log(`    ones  y=540: ${JSON.stringify(onesDigits)} expected ${JSON.stringify(expOnes.sort())} ${onesOK ? "✓" : "✗"}`);
    console.log(`    final y=620: ${JSON.stringify(finalDigits)} expected ${JSON.stringify(expFinal.sort())} ${finalOK ? "✓" : "✗"}`);

    if (!splitOK || !tensOK || !onesOK || !finalOK) {
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
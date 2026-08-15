#!/usr/bin/env node
// tools/verify-l5-scene.mjs — L5 关卡专项验证 (v3 cascading layout)。
//
// v3: 4 persistent sub-equations at y=370 (split), y=490 (tens sum),
// y=590 (ones sum), y=690 (final). 5 steps in order:
//   1. 拆 a   (fill split "□_a")
//   2. 拆 b   (fill split "□_b")
//   3. 加十位 (fill tens sum "?")
//   4. 加个位 (fill ones sum "?")
//   5. 加起来 (fill final "?")
//
// At step 5, the final row is pre-built with left=20, right=sum to
// give the kid a reference for the answer.

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
  const anchor = nodes.filter((n) => n.y >= 200 && n.y <= 240);
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

    const splitDigits = readDigitsAtY(stepAll, 370).sort();
    const tensDigits  = readDigitsAtY(stepAll, 490).sort();
    const onesDigits  = readDigitsAtY(stepAll, 590).sort();
    const finalDigits = readDigitsAtY(stepAll, 690).sort();

    // Per-step expected digits (operators are sprites, so only digits).
    // Split row: baseline 10×2 (the two "10"s in (10+□)(10+□)).
    // The □ slots are boxes; the "=" and "?" are boxes too. The
    // ("(" ")" are operators (sprites). After step 1 reveal, split
    // gets +onesA. After step 2, +onesB.
    const expectedSplit = [10, 10];
    if (step >= 1) expectedSplit.push(onesA);
    if (step >= 2) expectedSplit.push(onesB);

    // Tens sum row: baseline 10×2. After step 3 reveal, +20.
    const expectedTens = [10, 10];
    if (step >= 3) expectedTens.push(20);

    // Ones sum row: starts blank. Step 3 (加十位, index 2) builds
    // the row with addends (onesA, onesB) already revealed from
    // steps 1-2. Step 4 (index 3, pre-click) shows the same addends
    // (kid hasn't picked sum yet). Step 5 (index 4) after step 4
    // reveal: includes sum.
    let expectedOnes = [];
    if (step >= 2) expectedOnes.push(onesA, onesB);
    if (step >= 4) expectedOnes.push(sum);

    // Final row: starts blank. Step 4 (加个位, index 3) pre-fills
    // 20 (from step 3 reveal). Step 5 (index 4) adds sum (from step
    // 4 reveal). Step 5 click reveals answer.
    let expectedFinal = [];
    if (step >= 3) expectedFinal.push(20);
    if (step >= 4) expectedFinal.push(sum);
    if (step >= 5) expectedFinal.push(answer);

    const splitOK = JSON.stringify(splitDigits) === JSON.stringify(expectedSplit.sort());
    const tensOK  = JSON.stringify(tensDigits)  === JSON.stringify(expectedTens.sort());
    const onesOK  = JSON.stringify(onesDigits)  === JSON.stringify(expectedOnes.sort());
    const finalOK = JSON.stringify(finalDigits) === JSON.stringify(expectedFinal.sort());

    console.log(`  Step ${step + 1}:`);
    console.log(`    split y=370: ${JSON.stringify(splitDigits)} expected ${JSON.stringify(expectedSplit.sort())} ${splitOK ? "✓" : "✗"}`);
    console.log(`    tens  y=490: ${JSON.stringify(tensDigits)} expected ${JSON.stringify(expectedTens.sort())} ${tensOK ? "✓" : "✗"}`);
    console.log(`    ones  y=590: ${JSON.stringify(onesDigits)} expected ${JSON.stringify(expectedOnes.sort())} ${onesOK ? "✓" : "✗"}`);
    console.log(`    final y=690: ${JSON.stringify(finalDigits)} expected ${JSON.stringify(expectedFinal.sort())} ${finalOK ? "✓" : "✗"}`);

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
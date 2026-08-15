#!/usr/bin/env node
// tools/verify-l5-scene.mjs — L5 关卡专项验证 (v2 persistent layout)。
//
// v2: 4 persistent sub-equations on screen at once, plus 7
// decomposition lines between them. Per-step onAdvance reveals one
// slot. We check each row's content (digits at that y) independently
// rather than aggregating all sub-y text nodes.

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
  const correctSequence = [onesA, onesB, sum, 20, answer];
  console.log(`\nRound ${roundIdx + 1}: a=${a}, b=${b} (onesA=${onesA}, onesB=${onesB}, sum=${sum}, answer=${answer})`);

  // Row expectations per step (digits at each y position).
  // y=360 split: should always contain {a, 10, b, 10}.
  // y=480 ones: should contain onesA + onesB as addends from step 3,
  //              and the answer (sum) after step 3's reveal.
  // y=580 tens: should always contain {10, 10}.
  // y=680 final: should always contain {20, sum}, plus answer after step 5.
  //
  // Step 1: reveals □_a → onesA (in split row only).
  // Step 2: reveals □_b → onesB (in split row only).
  // Step 3: reveals ? → sum in ones sum row (now shows onesA+onesB=sum).
  // Step 4: reveals ? → 20 in tens sum row.
  // Step 5: reveals ? → answer in final row.
  for (let step = 0; step < 5; step++) {
    await page.waitForTimeout(600);
    const stepAll = await readAllText();

    const splitDigits = readDigitsAtY(stepAll, 360).sort();
    const onesDigits  = readDigitsAtY(stepAll, 480).sort();
    const tensDigits  = readDigitsAtY(stepAll, 580).sort();
    const finalDigits = readDigitsAtY(stepAll, 680).sort();

    // Build expected digits for each row at this step.
    const expectedSplit = [a, 10, b, 10]; // □_a / □_b are box sprites
    const expectedTens  = [10, 10];
    const expectedFinal = [20, sum]; // sum is shown from start

    // After step 1 click, □_a → onesA (in split row). After step 2,
    // □_b → onesB (in split row). Step 3 builds the ones sum row
    // with addends already revealed from steps 1-2 — so by the time
    // the kid sees step 3, the ones row shows [onesA, onesB].
    // Step 3's click reveals the answer slot to sum.
    let onesAddedInSplit = [];
    let onesAddedInOnesSum = [];
    if (step >= 1) onesAddedInSplit.push(onesA);
    if (step >= 2) onesAddedInSplit.push(onesB);
    // Step 3 (index 2) builds the ones sum row with addends visible.
    // Steps 0/1 (before step 3 builds the row) have no ones row.
    if (step >= 2) {
      onesAddedInOnesSum.push(onesA, onesB);
    }
    // Step 4 (index 3) is the first step where the ones row also has
    // its answer slot revealed to sum.
    if (step >= 3) {
      onesAddedInOnesSum.push(sum);
    }

    const expSplit = [...expectedSplit, ...onesAddedInSplit].sort();
    const expOnes  = [...onesAddedInOnesSum].sort();
    const expTens  = [...expectedTens];
    if (step >= 4) expTens.push(20);
    const expFinal = [...expectedFinal];
    if (step >= 5) expFinal.push(answer);

    const splitOK = JSON.stringify(splitDigits) === JSON.stringify(expSplit);
    const onesOK  = JSON.stringify(onesDigits)  === JSON.stringify(expOnes);
    const tensOK  = JSON.stringify(tensDigits)  === JSON.stringify(expTens);
    const finalOK = JSON.stringify(finalDigits) === JSON.stringify(expFinal);

    console.log(`  Step ${step + 1}:`);
    console.log(`    split y=360: ${JSON.stringify(splitDigits)} expected ${JSON.stringify(expSplit)} ${splitOK ? "✓" : "✗"}`);
    console.log(`    ones  y=480: ${JSON.stringify(onesDigits)} expected ${JSON.stringify(expOnes)} ${onesOK ? "✓" : "✗"}`);
    console.log(`    tens  y=580: ${JSON.stringify(tensDigits)} expected ${JSON.stringify(expTens)} ${tensOK ? "✓" : "✗"}`);
    console.log(`    final y=680: ${JSON.stringify(finalDigits)} expected ${JSON.stringify(expFinal)} ${finalOK ? "✓" : "✗"}`);

    if (!splitOK || !onesOK || !tensOK || !finalOK) {
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
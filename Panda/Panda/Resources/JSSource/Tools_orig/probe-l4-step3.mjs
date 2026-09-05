#!/usr/bin/env node
// tools/probe-l4-step3.mjs — capture row positions around the step 3
// pick in L4 (二十以内) to confirm the split row's answer slot is
// also revealed alongside the anchor and bottom row.
//
// Drives round [a, b] → answer, reads the live expression nodes
// (slotCenters + text content) before and after the final pick.
// Verifies:
//   1. All three rows' slot centers are stable (reserve works).
//   2. After the pick, the split row's slot 6 text is the answer
//      (was "?" — would be a layout bug if still "?").
import { chromium } from "playwright";

const URL = "http://localhost:8126/";
const STEP_DELAY_MS = 8000;
const PICK_DELAY_MS = 1500;

async function readRow(page, y, tolerance = 30) {
  return page.evaluate(({ y, tolerance }) => {
    const k = window.kaplay;
    return k
      .get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && o.text.length > 0)
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: o.text, x: Math.round(p.x), y: Math.round(p.y) };
      })
      .filter((o) => Math.abs(o.y - y) <= tolerance)
      .sort((a, b) => a.x - b.x);
  }, { y, tolerance });
}

async function readAllRows(page) {
  return {
    anchor: await readRow(page, 220, 30),
    split:  await readRow(page, 440, 30),
    bottom: await readRow(page, 600, 30),
  };
}

async function clickButton(page, value) {
  for (let tries = 0; tries < 80; tries++) {
    const buttons = await readRow(page, 838, 30);
    const target = buttons.find((b) => b.text === String(value));
    if (target) {
      await page.mouse.click(target.x, target.y);
      return true;
    }
    await page.waitForTimeout(50);
  }
  return false;
}

async function readAB(page) {
  for (let tries = 0; tries < 40; tries++) {
    const anchor = await readRow(page, 220, 30);
    const values = anchor
      .filter((o) => !/^[+=]$/.test(o.text) && o.text !== "?")
      .map((o) => o.text);
    if (values.length >= 2 && /^\d+$/.test(values[0]) && /^\d+$/.test(values[1])) {
      return { a: Number(values[0]), b: Number(values[1]) };
    }
    await page.waitForTimeout(100);
  }
  return null;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);
  await page.evaluate(() => { window.__skipTimers = true; });
  await page.mouse.click(683, 512);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.kaplay.go("level4"));
  await page.waitForTimeout(STEP_DELAY_MS);

  const ab = await readAB(page);
  if (!ab) { console.error("FAIL: couldn't read a/b"); process.exit(1); }
  const ones = ab.a % 10;
  const sum = ones + ab.b;
  const answer = ab.a + ab.b;
  console.log(`Round: a=${ab.a} b=${ab.b} ones=${ones} sum=${sum} answer=${answer}`);

  // Click through steps 1, 2.
  await clickButton(page, String(ones));
  await page.waitForTimeout(PICK_DELAY_MS);
  await clickButton(page, String(sum));
  await page.waitForTimeout(PICK_DELAY_MS);

  // Freeze the scene so the post-onAdvance capture lands before
  // the next round's rendering swaps out the expression nodes.
  await page.evaluate(() => {
    const k = window.kaplay;
    window.__origGo = k.go.bind(k);
    k.go = () => {};
  });

  const beforeRows = await readAllRows(page);

  // Click the final answer.
  const s3 = await clickButton(page, String(answer));
  if (!s3) { console.error("FAIL: step 3 click"); process.exit(1); }
  await page.waitForTimeout(20);

  const afterRows = await readAllRows(page);

  await page.evaluate(() => { window.kaplay.go = window.__origGo; });

  // Show the split row's slot 6 text before/after the pick — the
  // key signal: was "?" before, must be the answer after.
  const splitAnswerBefore = beforeRows.split.find((o) => o.x > 900)?.text ?? "?";
  const splitAnswerAfter  = afterRows.split.find((o) => o.x > 900)?.text ?? "?";
  console.log(`\nsplit row slot 6 text: before="${splitAnswerBefore}" after="${splitAnswerAfter}"`);

  // Show the rightmost element of every row.
  console.log("\nbefore step 3 pick:");
  for (const [label, rows] of Object.entries(beforeRows)) {
    console.log(`  ${label}: [${rows.map((o) => `${o.text}@${o.x}`).join(", ")}]`);
  }
  console.log("\nafter step 3 pick:");
  for (const [label, rows] of Object.entries(afterRows)) {
    console.log(`  ${label}: [${rows.map((o) => `${o.text}@${o.x}`).join(", ")}]`);
  }

  // Check 1: split row's last slot is the answer.
  if (splitAnswerAfter === String(answer)) {
    console.log(`\nPASS: split row answer slot revealed to ${answer}`);
  } else {
    console.log(`\nFAIL: split row answer slot is "${splitAnswerAfter}", expected "${answer}"`);
    process.exit(1);
  }

  // Check 2: slot centers stable across the pick.
  for (const key of Object.keys(beforeRows)) {
    const before = beforeRows[key].map((o) => o.x);
    const after  = afterRows[key].map((o) => o.x);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      console.log(`FAIL: ${key} slot x moved (before=${before} after=${after})`);
      process.exit(1);
    }
  }
  console.log("PASS: all three rows' slot centers are stable");

  // Capture a screenshot for visual confirmation.
  await page.screenshot({ path: "tmp-screens/l4-step3-after.png", fullPage: false });
  console.log("\nWrote tmp-screens/l4-step3-after.png");

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

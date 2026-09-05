#!/usr/bin/env node
// tools/probe-l4-bottom-defer.mjs — smoke test for the L4 step-1→step-2
// transition fix. Verifies the bottom row + split→bottom merge lines
// still render (eventually) after the user picks the ones digit, and
// that step 2/3 picks still work end-to-end.
//
// What this test CAN'T verify directly: in `__skipTimers` mode
// `playSequence` fires `onComplete` synchronously, so the bottom row
// would render immediately either way. The fix is about REAL-TIME
// audio playback — i.e. the child hears the "个位相加 [ones] 加 [b]"
// prompt before the bottom row appears. This script confirms the fix
// doesn't break the existing layout.

import { chromium } from "playwright";

const URL = "http://localhost:8126/";
const STEP_DELAY_MS = 8000;
const PICK_DELAY_MS = 1500;

async function readRow(page, y, tolerance = 30) {
  // Read text + sprite nodes (operators + box sprites render without text).
  // The "□" / "?" boxes are sprites (slot-answer sprite) and don't expose
  // `text`, so any filter that requires `o.text` would miss them.
  return page.evaluate(({ y, tolerance }) => {
    const k = window.kaplay;
    return k
      .get("*", { recursive: true })
      .filter((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        if (!p) return false;
        if (Math.abs(p.y - y) > tolerance) return false;
        // Keep text nodes and sprite nodes (operators/box slots).
        return typeof o.text === "string" || o.sprite != null;
      })
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return {
          text: typeof o.text === "string" ? o.text : (o.sprite ? `<sprite:${o.sprite}>` : ""),
          x: Math.round(p.x),
          y: Math.round(p.y),
        };
      })
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
      .filter((o) => /^\d+$/.test(o.text))
      .map((o) => Number(o.text));
    if (values.length >= 2) {
      return { a: values[0], b: values[1] };
    }
    await page.waitForTimeout(100);
  }
  return null;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
    console.error("[pageerror]", err.message);
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);
  await page.evaluate(() => { window.__skipTimers = true; });
  await page.mouse.click(683, 512);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.kaplay.go("level4"));
  await page.waitForTimeout(STEP_DELAY_MS);

  const ab = await readAB(page);
  if (!ab) {
    console.error("FAIL: couldn't read a/b from anchor row");
    process.exit(1);
  }
  const ones = ab.a % 10;
  const sum = ones + ab.b;
  const answer = ab.a + ab.b;
  console.log(`Round: a=${ab.a} b=${ab.b} ones=${ones} sum=${sum} answer=${answer}`);

  // Step 1 pick.
  const s1 = await clickButton(page, String(ones));
  if (!s1) {
    console.error("FAIL: step 1 click didn't land");
    process.exit(1);
  }
  await page.waitForTimeout(PICK_DELAY_MS);

  // After step 1 pick: split row should show `10 + ones + b = ?`
  // (ones digit filled in). Bottom row should also render in test
  // mode (onComplete fires synchronously under __skipTimers) showing
  // `10 + □ = ?` — slots for +, □, =, ? render as sprites (no text
  // property), so we check for ≥4 nodes in the bottom row band (text
  // "10" + 4 sprite slots) rather than scanning for the "□" character.
  const afterStep1 = await readAllRows(page);
  const splitText = afterStep1.split.map((o) => o.text).join(" ");
  const bottomNodeCount = afterStep1.bottom.length;
  console.log(`After step 1 pick:`);
  console.log(`  split  row: [${afterStep1.split.map((o) => `${o.text}@${o.x}`).join(", ")}]`);
  console.log(`  bottom row: [${afterStep1.bottom.map((o) => `${o.text}@${o.x}`).join(", ")}]`);

  if (!splitText.includes(String(ones))) {
    console.error(`FAIL: split row missing ones=${ones} (got "${splitText}")`);
    process.exit(1);
  }
  // 5 slots total — 1 text ("10") + 4 sprites/rects (+, □, =, ?). With
  // my fix the bottom row is rendered via the audio onComplete path,
  // which fires synchronously under __skipTimers. The row MUST exist
  // for the kid to see "10 + □ = ?" before tapping step 2's answer.
  if (bottomNodeCount < 4) {
    console.error(`FAIL: bottom row has ${bottomNodeCount} nodes, expected ≥4`);
    process.exit(1);
  }
  console.log(`PASS: split row reveals ones=${ones}, bottom row has ${bottomNodeCount} nodes`);

  // Step 2 pick (sum).
  const s2 = await clickButton(page, String(sum));
  if (!s2) {
    console.error("FAIL: step 2 click didn't land");
    process.exit(1);
  }
  await page.waitForTimeout(PICK_DELAY_MS);

  // Step 3 pick (final answer).
  const s3 = await clickButton(page, String(answer));
  if (!s3) {
    console.error("FAIL: step 3 click didn't land");
    process.exit(1);
  }
  await page.waitForTimeout(1500);

  if (pageErrors.length > 0) {
    console.error(`FAIL: ${pageErrors.length} page error(s) during L4 flow`);
    process.exit(1);
  }

  console.log("\nPASS: L4 step 1→2→3 picks all land, no page errors");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
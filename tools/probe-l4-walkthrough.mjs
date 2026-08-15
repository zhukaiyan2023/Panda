// tools/probe-l4-walkthrough.mjs — walk L4 step-by-step and capture the
// row positions (anchor / split / bottom) at every transition to find
// which step boundary causes drift.
//
// Snapshots:
//   s0: step 1 entry, anchor only (no split, no bottom)
//   s1: step 1 after audio, split row added (boxes)
//   s2: step 1 after pick, split row reveals □→ones
//   s3: step 2 entry (anchor re-rendered, split preserved)
//   s4: step 2 after audio, bottom row added (boxes)
//   s5: step 2 after pick, bottom row reveals □→sum
//   s6: step 3 entry (anchor re-rendered, bottom preserved)
//   s7: step 3 after pick (final reveal: anchor/split/bottom all reveal)
//
// Drift = any row's slot centers x-coords changing between snapshots.
// Even 1px is reported.

import { chromium } from "playwright";

const URL = "http://localhost:8126/";

async function readRow(page, y, tolerance = 30) {
  return page.evaluate(({ y, tolerance }) => {
    const k = window.kaplay;
    return k
      .get("*", { recursive: true })
      .filter((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        if (!p) return false;
        if (Math.abs(p.y - y) > tolerance) return false;
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
    split: await readRow(page, 440, 30),
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

function fmtRow(label, rows) {
  return `  ${label}: [${rows.map((o) => `${o.text}@${o.x}`).join(", ")}]`;
}

function diffRows(before, after) {
  const xs1 = before.map((o) => o.x);
  const xs2 = after.map((o) => o.x);
  if (xs1.length !== xs2.length) {
    return { changed: true, reason: `count ${xs1.length}→${xs2.length}`, before: xs1, after: xs2 };
  }
  const deltas = xs1.map((x, i) => x - xs2[i]).filter((d) => d !== 0);
  if (deltas.length === 0) return { changed: false };
  return { changed: true, deltas, before: xs1, after: xs2 };
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
  await page.waitForTimeout(1500);

  const ab = await readAB(page);
  if (!ab) { console.error("FAIL: couldn't read a/b"); process.exit(1); }
  const ones = ab.a % 10;
  const sum = ones + ab.b;
  const answer = ab.a + ab.b;
  console.log(`Round: a=${ab.a} b=${ab.b} ones=${ones} sum=${sum} answer=${answer}`);

  const snaps = {};

  // s0: step 1 entry, anchor only
  await page.waitForTimeout(200);
  snaps.s0 = await readAllRows(page);
  console.log("\n=== s0 step 1 entry (anchor only) ===");
  for (const [k, v] of Object.entries(snaps.s0)) console.log(fmtRow(k, v));

  // s1: step 1 after audio completes (split row added via fireL3StepAudio callback)
  // With __skipTimers=true the audio callback fires synchronously after a small delay.
  await page.waitForTimeout(800);
  snaps.s1 = await readAllRows(page);
  console.log("\n=== s1 step 1 after audio (split row added) ===");
  for (const [k, v] of Object.entries(snaps.s1)) console.log(fmtRow(k, v));

  // s2: pick the ones digit
  const ok1 = await clickButton(page, String(ones));
  await page.waitForTimeout(300);
  snaps.s2 = await readAllRows(page);
  console.log("\n=== s2 step 1 after pick (split row reveals □→ones) ===");
  for (const [k, v] of Object.entries(snaps.s2)) console.log(fmtRow(k, v));

  // s3: step 2 entry — wait for audio to settle, then snapshot.
  // With __skipTimers=true the audio onComplete fires immediately, so the
  // bottom row appears quickly. But the anchor re-renders synchronously.
  await page.waitForTimeout(2000);
  snaps.s3 = await readAllRows(page);
  console.log("\n=== s3 step 2 entry (anchor re-rendered, split preserved) ===");
  for (const [k, v] of Object.entries(snaps.s3)) console.log(fmtRow(k, v));

  // s4: step 2 after audio — bottom row added
  await page.waitForTimeout(800);
  snaps.s4 = await readAllRows(page);
  console.log("\n=== s4 step 2 after audio (bottom row added) ===");
  for (const [k, v] of Object.entries(snaps.s4)) console.log(fmtRow(k, v));

  // s5: pick the sum
  await clickButton(page, String(sum));
  await page.waitForTimeout(300);
  snaps.s5 = await readAllRows(page);
  console.log("\n=== s5 step 2 after pick (bottom row reveals □→sum) ===");
  for (const [k, v] of Object.entries(snaps.s5)) console.log(fmtRow(k, v));

  // s6: step 3 entry — anchor re-rendered with "?", bottom preserved
  await page.waitForTimeout(2000);
  snaps.s6 = await readAllRows(page);
  console.log("\n=== s6 step 3 entry (anchor re-rendered) ===");
  for (const [k, v] of Object.entries(snaps.s6)) console.log(fmtRow(k, v));

  // s7: pick the answer — all three rows reveal
  await clickButton(page, String(answer));
  await page.waitForTimeout(500);
  snaps.s7 = await readAllRows(page);
  console.log("\n=== s7 step 3 after pick (final reveal) ===");
  for (const [k, v] of Object.entries(snaps.s7)) console.log(fmtRow(k, v));

  // Compare consecutive snapshots for drift
  console.log("\n=== DRIFT REPORT ===");
  const keys = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"];
  let anyDrift = false;
  for (let i = 1; i < keys.length; i++) {
    const before = keys[i - 1];
    const after = keys[i];
    for (const row of ["anchor", "split", "bottom"]) {
      const b = snaps[before][row];
      const a = snaps[after][row];
      if (!b.length && !a.length) continue;
      if (!b.length || !a.length) {
        console.log(`[${before}→${after}] ${row}: count change 0→${a.length}`);
        anyDrift = true;
        continue;
      }
      const d = diffRows(b, a);
      if (d.changed) {
        console.log(`[${before}→${after}] ${row}: DRIFT`);
        console.log(`  before xs=${JSON.stringify(d.before)}`);
        console.log(`  after  xs=${JSON.stringify(d.after)}`);
        if (d.deltas) console.log(`  deltas=${JSON.stringify(d.deltas)}`);
        anyDrift = true;
      }
    }
  }
  if (!anyDrift) console.log(">>> NO DRIFT — all transitions locked");

  await page.screenshot({ path: "tmp-screens/l4-walkthrough-final.png", fullPage: false });
  console.log("\nWrote tmp-screens/l4-walkthrough-final.png");

  await browser.close();
  if (anyDrift) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
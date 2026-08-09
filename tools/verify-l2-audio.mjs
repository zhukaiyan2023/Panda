#!/usr/bin/env node
// tools/verify-l2-audio.mjs — focused check that L2's per-step
// contextual audio plays for every teaching beat.
//
// L2 (凑十法) has 4 teaching beats. Each step's audio is a long
// contextual sentence built from universal numbers + number-agnostic
// chunks. The verifier drives round 1 ([8, 5] → 13) in a real browser
// and confirms each step's chain started (at least the first chunk
// fired). Failing to start means the audio chain wired wrong —
// silence for the child.
//
// Chain shapes for round [8, 5, need=2, rest=3]:
//   entry:  lvl-2-intro
//   step 1: lvl-2-step-1-pre n-8 q-plus n-5 lvl-2-step-1-eq n-8
//           lvl-2-step-1-or n-5 lvl-2-step-1-q
//   step 2: lvl-2-step-2-big-pre n-8 lvl-2-step-2-find n-8
//           lvl-2-step-2-friend-pre n-8 lvl-2-step-2-q
//   step 3: n-5 lvl-2-step-3-split-pre n-8 lvl-2-step-3-friend-pre
//           n-2 lvl-2-step-3-then n-5 lvl-2-step-3-can-split n-2
//           lvl-2-step-3-q
//   step 4: n-5 lvl-2-step-4-split n-2 q-plus n-3 lvl-2-step-4-calc
//           n-8 q-plus n-2 q-plus n-3 q-equals

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BUTTON_Y = 838;
const ROW_TOLERANCE = 80;
const PICK_DELAY_MS = 2500;  // let each step's chain START before we click

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url === "/" ? "/index.html" : req.url;
      const file = path.join(ROOT, url.split("?")[0]);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        res.writeHead(404); res.end("not found"); return;
      }
      const ext = path.extname(file).toLowerCase();
      const types = {
        ".html": "text/html", ".js": "application/javascript",
        ".mjs": "application/javascript", ".css": "text/css",
        ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
        ".json": "application/json", ".png": "image/png",
      };
      res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function readRow(page, y, tolerance = ROW_TOLERANCE) {
  return page.evaluate(({ y, tolerance }) => {
    const k = window.kaplay;
    return k
      .get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && o.text.length > 0)
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: o.text, x: p.x, y: p.y };
      })
      .filter((o) => Math.abs(o.y - y) <= tolerance)
      .sort((a, b) => a.x - b.x);
  }, { y, tolerance });
}

async function clickButton(page, value, y = BUTTON_Y, tolerance = ROW_TOLERANCE) {
  // Buttons may need a moment to appear; poll a few times.
  for (let tries = 0; tries < 40; tries++) {
    const buttons = await readRow(page, y, tolerance);
    const target = buttons.find((b) => b.text === String(value));
    if (target) {
      await page.mouse.click(target.x, target.y);
      return true;
    }
    await page.waitForTimeout(150);
  }
  return false;
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  // Viewport matches the Kaplay world so world coords == screen coords.
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
  });
  const page = await context.newPage();

  await page.goto(url);
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);

  // Real audio (no __skipTimers) — we want to confirm chains fire.
  await page.evaluate(() => { window.__skipTimers = false; });

  // Record play() calls with timestamps.
  await page.evaluate(() => {
    window.__audioEvents = [];
    const audio = window.PandaAudio.audio;
    for (const [id, el] of Object.entries(audio)) {
      const orig = el.play.bind(el);
      el.play = function () {
        window.__audioEvents.push({ id, t: performance.now() });
        return orig();
      };
    }
  });

  // Unlock audio + navigate into L2.
  await page.click("body");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.kaplay.go("level2"));

  // The entry greeting (~3.7s) + 800ms pause kicks off step 1.
  // Wait a bit longer than that to confirm entry + first chunk fired.
  await page.waitForTimeout(5500);

  // Pick > (step 1's correct answer). The button is one of two
  // symbols in the row.
  const step1Picked = await clickButton(page, ">");
  if (!step1Picked) {
    console.error("FAIL: could not find step 1 button '>'");
    process.exit(1);
  }
  // Let step 2 chain start.
  await page.waitForTimeout(PICK_DELAY_MS);

  // Pick 2 (step 2's correct answer = need).
  const step2Picked = await clickButton(page, "2");
  if (!step2Picked) {
    console.error("FAIL: could not find step 2 button '2'");
    process.exit(1);
  }
  await page.waitForTimeout(PICK_DELAY_MS);

  // Pick "2+3" (step 3's correct split).
  const step3Picked = await clickButton(page, "2+3");
  if (!step3Picked) {
    console.error("FAIL: could not find step 3 button '2+3'");
    process.exit(1);
  }
  await page.waitForTimeout(PICK_DELAY_MS);

  // Pick 13 (step 4's correct answer).
  const step4Picked = await clickButton(page, "13");
  if (!step4Picked) {
    console.error("FAIL: could not find step 4 button '13'");
    process.exit(1);
  }

  // Wait for step 4 chain to start.
  await page.waitForTimeout(PICK_DELAY_MS);

  const events = await page.evaluate(() => window.__audioEvents);

  await browser.close();
  server.close();

  // Build a set of fired cue ids for membership checks.
  const firedIds = new Set(events.map((e) => e.id));

  const checks = [
    { name: "entry",           must: ["lvl-2-intro"] },
    { name: "step 1 (compare)", must: ["lvl-2-step-1-pre", "lvl-2-step-1-q"] },
    { name: "step 2 (friend)",  must: ["lvl-2-step-2-big-pre", "lvl-2-step-2-q"] },
    { name: "step 3 (split)",   must: ["lvl-2-step-3-split-pre", "lvl-2-step-3-q"] },
    { name: "step 4 (count)",   must: ["lvl-2-step-4-split", "lvl-2-step-4-calc"] },
  ];

  let failed = false;
  for (const check of checks) {
    const missing = check.must.filter((id) => !firedIds.has(id));
    if (missing.length) {
      console.error(`FAIL — ${check.name} missing cues: ${missing.join(", ")}`);
      failed = true;
    } else {
      console.log(`ok  ${check.name}: all ${check.must.length} required cues fired`);
    }
  }

  if (failed) {
    console.error("\nAll fired L2 step cues:", [...firedIds].filter((id) => id.startsWith("lvl-2")).sort());
    process.exit(1);
  }
  console.log("\n[l2-audio] OK — every L2 step's audio chain started");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

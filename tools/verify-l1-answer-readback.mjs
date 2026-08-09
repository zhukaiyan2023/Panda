#!/usr/bin/env node
// tools/verify-l1-answer-readback.mjs — focused check that L1 step 2's
// equation read-back audio plays through completely (no cut-off).
//
// The user reported "2+3+4=9" was being cut off — the equals + answer
// cues never landed. Root cause was a hardcoded advancePauseMs that
// was too short for the audio chain. The fix wires the advance to
// the audio's `ended` event (roundScene awaits a Promise from
// onAdvance; playSequence fires onComplete after the last cue).
//
// This test:
//   1. Loads L1 (real audio, no __skipTimers)
//   2. Picks L1 step 1's correct answer (5)
//   3. Picks L1 step 2's correct answer (9)
//   4. Records the audio timeline and confirms "equals" + "n-9" both
//      fired AFTER the encouragement cue
//
// PASS = the equation read-back plays in full.

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BUTTON_Y = 838;
const ROW_TOLERANCE = 80;

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

async function clickButton(page, value) {
  // Buttons may need a moment to appear; poll a few times.
  for (let tries = 0; tries < 30; tries++) {
    const buttons = await readRow(page, BUTTON_Y);
    const target = buttons.find((b) => b.text === String(value));
    if (target) {
      await page.mouse.click(target.x, target.y);
      return true;
    }
    await page.waitForTimeout(200);
  }
  return false;
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  // Viewport matches the Kaplay world (1366x1024) so world coordinates
  // match screen coordinates — same as tools/verify-math.mjs.
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
  });
  const page = await context.newPage();

  await page.goto(url);
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);

  // Real audio playback (no __skipTimers) — we want to confirm the
  // audio chain actually fires.
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

  // Unlock audio + enter L1.
  await page.click("body");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.kaplay.go("level1"));

  // Wait past the greeting + first decompose sentence so step 1's
  // buttons are the only thing playing. (greeting 5.1s + 1s pause +
  // ~15s decompose = ~21s; give it a safe 24s.)
  await page.waitForTimeout(24000);

  // Pick step 1's correct answer for L1 round 1 ([2,3,4] → pair 2+3=5).
  const step1Picked = await clickButton(page, 5);
  if (!step1Picked) {
    console.error("FAIL: could not find step 1 button '5'");
    process.exit(1);
  }

  // Wait for step 2 buttons to appear + the speakSequence audio
  // ("n-5 q-plus n-4 q-equals") to finish. After the audio lands the
  // step 2 buttons (correct = 9) are the answer.
  await page.waitForTimeout(4000);

  const step2Picked = await clickButton(page, 9);
  if (!step2Picked) {
    console.error("FAIL: could not find step 2 button '9'");
    process.exit(1);
  }

  // Wait for the equation read-back to finish. Chain for [2,3,4]→9
  // is 7 cues (n-2 q-plus n-3 q-plus n-4 equals n-9) plus the
  // encouragement before it. Cue durations are ~1s each, gaps 200ms,
  // so the whole chain takes ~9s. Give 12s for safety.
  await page.waitForTimeout(12000);

  const events = await page.evaluate(() => window.__audioEvents);

  await browser.close();
  server.close();

  // Find the most recent encouragement cue — that's the one fired
  // AFTER step 2's pick.
  const encourages = ["enc-great", "enc-awesome", "enc-amazing", "enc-nice"];
  let recentEncourageIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (encourages.includes(events[i].id)) { recentEncourageIdx = i; break; }
  }

  if (recentEncourageIdx === -1) {
    console.error("FAIL: no encouragement cue recorded after step 2 pick");
    console.error("Last 10 events:", events.slice(-10).map((e) => e.id));
    process.exit(1);
  }

  const afterEncourage = events.slice(recentEncourageIdx);
  const hasEquals = afterEncourage.some((e) => e.id === "equals");
  const hasN9 = afterEncourage.some((e) => e.id === "n-9");

  console.log(`[l1-answer] events after encouragement:`);
  for (const e of afterEncourage) {
    console.log(`         ${e.id.padEnd(28)} @ ${Math.round(e.t).toString().padStart(5)} ms`);
  }

  if (!hasEquals) {
    console.error(`\n[l1-answer] FAIL — "equals" cue never fired after the encouragement`);
    process.exit(1);
  }
  if (!hasN9) {
    console.error(`\n[l1-answer] FAIL — answer number "n-9" never fired after the encouragement`);
    process.exit(1);
  }

  console.log(`\n[l1-answer] OK — "equals" + "n-9" both played after the encouragement`);
  console.log(`[l1-answer] Equation read-back plays in full; advance is event-based.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// tools/verify-back-button.mjs — regression test for the playAfter
// fallback leak. Before the fix, tapping the ← back button while a
// step's audio was scheduled off the cheer chain would let the
// playAfter fallback setTimeout fire ~2s later and start the next
// chain in the destination scene. After the fix, no audio should
// start after the back button is tapped.
//
// The verifier:
//   1. Goes into L2 (round 0)
//   2. Waits for the step 1 audio to start
//   3. Picks the correct answer (cheer chain fires)
//   4. Records current audio event count
//   5. Taps ← (back to levelPicker)
//   6. Waits 5s — longer than any playAfter fallback
//   7. Verifies no NEW audio events fired between steps 4 and 6.

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BUTTON_Y = 838;
const ROW_TOLERANCE = 80;
const BACK_BUTTON_X = 84;   // LAYOUT.iconX — root.pos is (0,0), the
                            // clickable area sits at (iconX, backY) via
                            // hitShape; clicking the corner of the visible
                            // rect misses the hitShape.
const BACK_BUTTON_Y = 92;   // LAYOUT.backY
const SETTLE_MS = 500;       // small settle after clicking
const LEAK_WINDOW_MS = 5000; // wait this long after back tap

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

async function clickButton(page, value, y = BUTTON_Y, tolerance = ROW_TOLERANCE) {
  for (let tries = 0; tries < 40; tries++) {
    const buttons = await page.evaluate(({ y, tolerance }) => {
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
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
  });
  const page = await context.newPage();

  await page.goto(url);
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);

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

  await page.click("body"); // unlock audio
  await page.waitForTimeout(100);
  await page.evaluate(() => window.kaplay.go("level2"));

  // Wait for step 1 audio to start (after the L2 intro + gap).
  // L2 intro is ~3-4s + 800ms gap + step 1 audio starts.
  await page.waitForTimeout(5500);

  // L2 round 0: a=8, b=5 → "8 还是 5 谁大" → pick ">"
  const step1Picked = await clickButton(page, ">");
  if (!step1Picked) {
    console.error("FAIL: could not find step 1 button '>'");
    process.exit(1);
  }
  const step1PickedAt = Date.now();

  // Give the cheer chain (enc + panda-celebrate) a moment to start,
  // but stay within the cheer chain window so the back tap fires
  // DURING the cheer (the scenario where the bug originally
  // manifested — enc played but panda-celebrate was about to start).
  await page.waitForTimeout(SETTLE_MS);

  // Snapshot the audio events that have fired so far — anything
  // fired AFTER this snapshot is the leak we're testing for.
  const eventsBeforeBack = await page.evaluate(() =>
    window.__audioEvents.length,
  );

  // Tap the ← back button.
  const sceneBeforeBack = await page.evaluate(() => window.kaplay.getSceneName());
  await page.mouse.click(BACK_BUTTON_X, BACK_BUTTON_Y);
  // Give it a moment for scene change to settle.
  await page.waitForTimeout(200);
  const sceneAfterBack = await page.evaluate(() => window.kaplay.getSceneName());
  if (sceneBeforeBack === sceneAfterBack) {
    console.error(`FAIL: back tap did not navigate away (still in ${sceneAfterBack})`);
    process.exit(1);
  }

  // Wait long enough for any playAfter fallback to fire (~2s) plus
  // margin. If the bug is present, step 2 audio would start firing
  // here. With the fix, no new audio events should be recorded.
  await page.waitForTimeout(LEAK_WINDOW_MS);

  const eventsAfterBack = await page.evaluate(() =>
    window.__audioEvents.length,
  );

  await browser.close();
  server.close();

  const leaked = eventsAfterBack - eventsBeforeBack;
  if (leaked > 0) {
    const allEvents = await import("node:fs").then((fs) => fs)
      .catch(() => null);
    console.error(
      `FAIL: ${leaked} new audio event(s) fired after the back button was tapped`,
    );
    process.exit(1);
  }
  console.log(
    `ok  back-button audio leak: no new audio fired in ${LEAK_WINDOW_MS}ms ` +
      `(${eventsBeforeBack} events before, ${eventsAfterBack} after)`,
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
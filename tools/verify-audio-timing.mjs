#!/usr/bin/env node
// tools/verify-audio-timing.mjs — load the game in a real browser, click
// into L1, and check that the spoken audio cues do not overlap.
//
// "Overlap" here means: a new audio element starts playing while a
// previous one is still playing. That's the symptom the user reported
// after the chained-cue L1 entry was added. The fix is in main.js —
// playSequence now uses audio.duration to chain cues, playAfter uses
// the audio 'ended' event for the greeting→decompose wait, and
// stopAllAudio on a correct pick silences the rest of the sentence.

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Tiny static server so the page can fetch assets under http:// (file://
// breaks fetch in Safari/WebKit).
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url === "/" ? "/index.html" : req.url;
      const file = path.join(ROOT, url.split("?")[0]);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
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
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(url);
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);

  // Install play spies on every audio element so we can record the
  // timeline of play() calls and compare with what should be happening.
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

  // Unlock audio (main.js attaches the unlock handler to first pointerdown).
  await page.click("body");
  await page.waitForTimeout(50);

  // Navigate into L1 by clicking the L1 card on the level picker.
  // The cards are rendered by levelPicker.js; the simplest way is to
  // ask Kaplay to go there directly so we don't depend on the click
  // position math.
  await page.evaluate(() => window.kaplay.go("level1"));
  await page.waitForTimeout(50);

  // Give the greeting + the full 17-cue decompose enough time to fire
  // (greeting 5.1s + 1s pause + ~17s of decompose = ~23s). We record
  // 26s of audio events to capture the L1 round 1 entry end-to-end.
  await page.waitForTimeout(26000);

  const events = await page.evaluate(() => window.__audioEvents);
  await browser.close();
  server.close();

  // The unlock phase (main.js: unlockAudio) fires every audio element
  // at once so iOS Safari will let them play later. That batch shows
  // up as N events in the first ~100ms — they're a single intentional
  // overlap, not a bug. Skip everything before the first 500ms.
  const t0 = events.length > 0 ? events[0].t : 0;
  const postUnlock = events.filter((e) => e.t - t0 > 500);

  // Walk the post-unlock events and find any pair where cue N is still
  // playing when cue N+1 starts. We don't have per-cue durations from
  // JS (audio.duration is what the browser says; the recorded events
  // only have start times), so we approximate by flagging any two
  // distinct cues that fired within 200ms of each other — that's the
  // boundary the user reported as "乱".
  const overlaps = [];
  for (let i = 1; i < postUnlock.length; i++) {
    const prev = postUnlock[i - 1];
    const cur = postUnlock[i];
    const gap = cur.t - prev.t;
    if (gap < 200 && prev.id !== cur.id) {
      overlaps.push({ prev: prev.id, cur: cur.id, gapMs: Math.round(gap), tMs: Math.round(cur.t - t0) });
    }
  }

  // Print the event log so a human can see the timeline.
  console.log(`[audio] ${events.length} play() calls total; ${postUnlock.length} after the unlock batch`);
  console.log(`[audio] L1 entry timeline (post-unlock, t in ms since first event):`);
  for (const e of postUnlock.slice(0, 30)) {
    console.log(`         ${e.id.padEnd(28)} @ ${Math.round(e.t - t0).toString().padStart(5)} ms`);
  }
  if (overlaps.length === 0) {
    console.log("\n[audio] OK — no cue fired within 200ms of a different cue");
    process.exit(0);
  } else {
    console.log(`\n[audio] FAIL — ${overlaps.length} potential overlap(s):`);
    for (const o of overlaps.slice(0, 10)) {
      console.log(`         t=${o.tMs}ms  ${o.prev} → ${o.cur}  (${o.gapMs} ms apart)`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

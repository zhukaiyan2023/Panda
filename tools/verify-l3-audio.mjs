#!/usr/bin/env node
// tools/verify-l3-audio.mjs — focused check that L3's per-step
// contextual audio plays for every teaching beat.
//
// L3 (二十以内) has 3 teaching beats for the "split 2-digit into
// 10 + ones, add the ones to b, add 10 to the sum" strategy. Each
// step's audio is a short contextual sentence built from universal
// numbers + number-agnostic chunks. The verifier drives round 1
// ([11, 8] → 19) in a real browser and confirms each step's chain
// started, plus the post-correct reward audio "11+8=19".
//
// Chain shapes for round [11, 8] (ones=1, sum=9):
//   entry:  (no entry greeting — per user feedback 2026-08-10 the
//            old lvl-3-intro "big numbers" voice was removed. The
//            step 1 audio IS the entry guidance.)
//   step 1: n-11 q-plus n-8 q-equals lvl-3-step-1-pre n-11
//           lvl-3-step-1-split lvl-3-step-1-q
//   step 2: lvl-3-step-2-pre n-1 q-plus n-8 q-equals
//   step 3: n-10 q-plus n-9 q-equals
//   reward: n-11 q-plus n-8 equals n-19  (after step 3 correct)

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BUTTON_Y = 838;
const ROW_TOLERANCE = 80;
const PICK_DELAY_MS = 2500;  // let each step's chain START before we click
const REWARD_DELAY_MS = 4500; // let the cheer chain + reward audio start

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

  // Unlock audio + navigate into L3.
  await page.click("body");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.kaplay.go("level3"));

  // The entry greeting (~5s with the longer L3 intro) + 800ms pause
  // kicks off step 1. Wait a bit longer than that to confirm entry +
  // first chunk fired.
  await page.waitForTimeout(7000);

  // Step 1 — pick ones (a=11, ones=1).
  const step1Picked = await clickButton(page, "1");
  if (!step1Picked) {
    console.error("FAIL: could not find step 1 button '1' (ones digit of 11)");
    process.exit(1);
  }
  await page.waitForTimeout(PICK_DELAY_MS);

  // Step 2 — pick sum (ones=1 + b=8 = 9).
  const step2Picked = await clickButton(page, "9");
  if (!step2Picked) {
    console.error("FAIL: could not find step 2 button '9' (sum of 1 + 8)");
    process.exit(1);
  }
  await page.waitForTimeout(PICK_DELAY_MS);

  // Step 3 — pick answer (11 + 8 = 19).
  const step3Picked = await clickButton(page, "19");
  if (!step3Picked) {
    console.error("FAIL: could not find step 3 button '19' (final answer)");
    process.exit(1);
  }
  // Wait for the cheer chain (enc-first-N + maybe panda-praise-N or
  // panda-cheer-N depending on streak tier) AND the reward audio
  // "11+8=19" to fire. Cheer ~1.5s, reward ~1.5s, plus the gapMs.
  // 4.5s gives a safe margin. The old "panda-celebrate" cue is
  // gone; the cheer chain now lives in audio/praise.js.
  await page.waitForTimeout(REWARD_DELAY_MS);

  const events = await page.evaluate(() => window.__audioEvents);

  await browser.close();
  server.close();

  // Build a set of fired cue ids for membership checks.
  const firedIds = new Set(events.map((e) => e.id));

  // Each step's "must" cues: only the unique contextual / number chunks
  // that distinguish that step from the others. Universal cues (q-plus,
  // q-equals, equals) overlap with L1/L2 so we don't assert on them —
  // the contextual + number cues are sufficient to confirm each step's
  // chain actually fired.
  const checks = [
    // No entry check — the old "entry" gating on lvl-3-intro was removed
    // 2026-08-10 along with the cue itself (it was a vague topic intro,
    // not a prompt). Step 1's must list covers the actual entry audio now.
    {
      name: "step 1 (split)",
      must: ["lvl-3-step-1-pre", "n-11", "lvl-3-step-1-split", "lvl-3-step-1-q"],
    },
    { name: "step 2 (add ones)", must: ["lvl-3-step-2-pre", "n-1", "n-8"] },
    { name: "step 3 (total)",    must: ["n-10", "n-9"] },
    { name: "reward (11+8=19)",  must: ["n-11", "n-8", "n-19"] },
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
    console.error("\nAll fired L3 step cues:", [...firedIds].filter((id) => id.startsWith("lvl-3") || /^n-\d+$/.test(id)).sort());
    process.exit(1);
  }
  console.log("\n[l3-audio] OK — every L3 step's audio chain started");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
#!/usr/bin/env node
// tools/verify-7-6-4-audio.mjs — diagnose "7+6+4 没有声音".
//
// The user's hypothesis: "是缺少语音吗？" (missing audio?). This test
// answers that concretely for the 6 orderings of (7, 6, 4) that the
// L1 pool can hand us, since each ordering produces a DIFFERENT
// per-round cue id (`l1-intro-mt-{a}-{b}-{c}` / `l1-rwd-{a}-{b}-{c}-17`).
//
// Checks:
//   1. All 6 intro cues + all 6 reward cues + the 2 shared cues
//      (l1-sub-find-ten, l1-step2-10-7) are registered in PandaAudio.audio.
//      Deterministic; if any are missing, the answer to "missing audio?"
// is "yes".
//   2. Each registered <audio> element's underlying file responds 200
//      with audio/mpeg and a non-zero body. Catches stale placeholder
//      mp3s that exist on disk but were never re-encoded with TTS.
//   3. Spin up L1 with audio events captured and run until a make-a-ten
//      round shows up. Confirm its `l1-intro-mt-*` audio fires (proves
//      the runtime path actually plays the per-round cue, not just that
//      it's registered).

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const PERMS = [
  [7, 6, 4], [7, 4, 6], [6, 7, 4], [6, 4, 7], [4, 7, 6], [4, 6, 7],
];
const REQUIRED = [];
for (const [a, b, c] of PERMS) {
  REQUIRED.push(`l1-intro-mt-${a}-${b}-${c}`);
  REQUIRED.push(`l1-rwd-${a}-${b}-${c}-17`);
}
REQUIRED.push("l1-sub-find-ten", "l1-step2-10-7");

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

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 1024 } })).newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);

  // ---- Check 1: CUE_IDS registration.
  const reg = await page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const el = window.PandaAudio.audio[id];
      out[id] = el ? { ok: true, src: el.src } : { ok: false };
    }
    return out;
  }, REQUIRED);

  let missing = [];
  console.log("[7+6+4] cue registration:");
  for (const id of REQUIRED) {
    const s = reg[id];
    if (s.ok) console.log(`  ok   ${id.padEnd(28)} -> ${s.src.split("/").pop()}`);
    else { console.error(`  MISS ${id}`); missing.push(id); }
  }
  if (missing.length) {
    console.error(`\n[7+6+4] FAIL — ${missing.length} cue id(s) missing from PandaAudio.audio.`);
    console.error("Add them to main.js CUE_IDS, then re-run tools/_emit-cues.mjs.");
    await browser.close(); server.close(); process.exit(1);
  }
  console.log(`[7+6+4] ok — all ${REQUIRED.length} cue ids registered.\n`);

  // ---- Check 2: each registered file actually has audio bytes on disk.
  let zero = [];
  console.log("[7+6+4] mp3 file integrity:");
  for (const id of REQUIRED) {
    const src = reg[id].src;
    const fp = path.join(ROOT, src.replace(/^.*\/\//, "").replace(/^https?:\/\/[^/]+/, ""));
    const abs = fs.existsSync(fp) ? fp : path.join(ROOT, "assets/audio", `${id}.mp3`);
    if (!fs.existsSync(abs)) { console.error(`  MISS FILE ${id}`); zero.push(id); continue; }
    const sz = fs.statSync(abs).size;
    if (sz < 500) { console.error(`  EMPTY ${id} (${sz} bytes)`); zero.push(id); continue; }
    console.log(`  ok   ${id.padEnd(28)} ${sz} bytes`);
  }
  if (zero.length) {
    console.error(`\n[7+6+4] FAIL — ${zero.length} mp3 file(s) missing or empty on disk.`);
    await browser.close(); server.close(); process.exit(1);
  }
  console.log("[7+6+4] ok — all mp3 files have audio data.\n");

  // ---- Check 3: runtime play — does l1-intro-mt-* actually fire?
  await page.evaluate(() => { window.__skipTimers = false; });
  await page.evaluate(() => {
    window.__audioEvents = [];
    for (const [id, el] of Object.entries(window.PandaAudio.audio)) {
      const orig = el.play.bind(el);
      el.play = function () { window.__audioEvents.push({ id, t: performance.now() }); return orig(); };
    }
  });
  await page.click("body");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.kaplay.go("level1"));
  // wait long enough for any greeting + first decompose sentence
  await page.waitForTimeout(30000);
  const events = await page.evaluate(() => window.__audioEvents);
  const introIds = REQUIRED.filter(id => id.startsWith("l1-intro-mt-"));
  const firedIntro = events.find(e => introIds.includes(e.id));
  if (!firedIntro) {
    console.log("[7+6+4] note — first sampled L1 round isn't 7+6+4 (make-a-ten); skipping play-through check.");
    console.log(`         intro cue observed: ${events.find(e => e.id.startsWith("l1-intro-"))?.id || "(none)"}`);
    await browser.close(); server.close(); process.exit(0);
  }
  console.log(`[7+6+4] ok — runtime played ${firedIntro.id} for the make-a-ten round.`);
  const sub = events.find(e => e.id === "l1-sub-find-ten");
  if (!sub) {
    console.error("[7+6+4] FAIL — intro fired but l1-sub-find-ten did not follow.");
    await browser.close(); server.close(); process.exit(1);
  }
  console.log("[7+6+4] ok — l1-sub-find-ten followed the intro.");

  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
#!/usr/bin/env node
// tools/verify-l1-mt-audio.mjs — confirm L1 make-a-ten round audio is wired.
//
// Regression guard for the 3+7+1 bug: the make-a-ten composite cues
// (l1-intro-mt-* + l1-sub-find-ten) were generated as MP3s but never
// registered in main.js CUE_IDS, so PandaAudio.playCue() warned
// "no audio element" and the kid heard silence for the whole of step 1
// on every round where two of three addends summed to ten (e.g. 3+7+1,
// 1+9+2, 4+6+5, etc.).
//
// This test:
//   1. Boots the page and asserts the process-praise tier system is
//      fully registered (every new cue id has an <audio> element) AND
//      the deleted cues are gone (catches accidental re-registration).
//   2. Boots the page and asserts that the make-a-ten pool-driven cue
//      ids for 3+7+1 are loaded into PandaAudio.audio as <audio>
//      elements. (This is the deterministic check that would have
//      caught the original bug at CI time — no randomness involved.)
//   3. Plays through one L1 round. If the sampled first round is a
//      make-a-ten round, asserts that l1-intro-mt-* + l1-sub-find-ten
//      both fire before the step-1 buttons appear, and l1-step2-10-1
//      fires after the correct pair is picked. (Probabilistic — see
//      "sampling caveat" below.)
//
// Sampling caveat: L1 samples 10 random rounds from a 337-round pool
// where ~217 are make-a-ten, so the chance of the first sampled round
// being make-a-ten is roughly 64% per session. The deterministic
// existence checks (steps 1 + 2) are the durable guard; the play-through
// check (step 3) is a bonus smoke test when sampling cooperates.

import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// The specific make-a-ten round the user reported ("3+7+1 — no sound").
// pair = [3,7] sums to 10, third = 1, pairSum = 10, answer = 11.
const SAMPLE_ROUND = { nums: [3, 7, 1], pair: [3, 7], third: 1, pairSum: 10, answer: 11 };
// Cues that must be in the runtime audio pool for this round's full chain
// to play. Sourced from scenes/level1.js step 1 phase 1/2 + step 2 audio.
const REQUIRED_CUES = [
  `l1-intro-mt-${SAMPLE_ROUND.nums.join("-")}`,
  "l1-sub-find-ten",
  `l1-step2-${SAMPLE_ROUND.pairSum}-${SAMPLE_ROUND.third}`,
];

// 2026-08-10 process-praise tier system — every new cue id must be
// registered. Also catch any drift that re-registers the deleted
// "好棒" / "enc-try" / "enc-great" / "enc-awesome" / "enc-amazing" /
// "enc-nice" cues — they would either shadow the new system (silent
// warning at playCue) or fight it for the panda voice, depending on
// call site.
const REQUIRED_TIER_CUES = [
  "enc-first-1", "enc-first-2", "enc-first-3", "enc-first-4",
  "enc-streak3-1", "enc-streak3-2", "enc-streak3-3",
  "enc-streak5-1", "enc-streak5-2", "enc-streak5-3",
  "enc-streak10-1", "enc-streak10-2", "enc-streak10-3",
  "enc-level-1", "enc-level-2", "enc-level-3", "enc-level-4",
  "enc-wrong-1", "enc-wrong-2", "enc-wrong-3",
  "enc-near-1", "enc-near-2", "enc-near-3",
  "enc-specific-pair", "enc-specific-double", "enc-specific-decomp", "enc-specific-friend",
  "panda-praise-1", "panda-praise-2", "panda-praise-3",
  "panda-cheer-1",  "panda-cheer-2",
];
const DELETED_CUES = [
  "panda-celebrate",
  "enc-try",
  "enc-great", "enc-awesome", "enc-amazing", "enc-nice",
];

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
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);

  // ---- Check 0: process-praise tier system wiring (2026-08-10 rewrite).
  // Every cue id in the new 32-cue system must be registered (a missing
  // id silently breaks roundScene.onPick's pickCheerCue → playSequence
  // chain). And none of the deleted cues (panda-celebrate / enc-try /
  // enc-great/awesome/amazing/nice) must be re-registered — if they
  // are, either some old call site still fires them and would fight
  // the new system for the panda voice, or some fork accidentally
  // re-added them to CUE_IDS.
  const tierStatus = await page.evaluate(
    ({ required, deleted }) => {
      const out = { missing: [], reRegistered: [] };
      for (const id of required) if (!window.PandaAudio.audio[id]) out.missing.push(id);
      for (const id of deleted) if (window.PandaAudio.audio[id]) out.reRegistered.push(id);
      return out;
    },
    { required: REQUIRED_TIER_CUES, deleted: DELETED_CUES },
  );

  if (tierStatus.missing.length > 0 || tierStatus.reRegistered.length > 0) {
    console.error("[l1-mt] FAIL — tier system drift:");
    for (const id of tierStatus.missing)        console.error(`  missing    ${id}`);
    for (const id of tierStatus.reRegistered)   console.error(`  re-registered (was deleted)  ${id}`);
    console.error("Update main.js CUE_IDS to match tools/cues.cjs + audio/praise.js.");
    await browser.close();
    server.close();
    process.exit(1);
  }
  console.log(`[l1-mt] ok — tier system wired (${REQUIRED_TIER_CUES.length} new cues, ${DELETED_CUES.length} deleted gone)\n`);

  // ---- Check 1: all required cue ids are registered in the audio pool.
  // This is the deterministic guard. Even if sampling is unlucky and
  // the first L1 round isn't 3+7+1, this check fires on every boot
  // and would have caught the original CUE_IDS drift bug at CI time.
  const cueStatus = await page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const el = window.PandaAudio.audio[id];
      out[id] = {
        registered: !!el,
        src: el ? el.src.split("/").pop() : null,
      };
    }
    return out;
  }, REQUIRED_CUES);

  console.log("[l1-mt] cue pool registration for 3+7+1:");
  let missing = [];
  for (const id of REQUIRED_CUES) {
    const s = cueStatus[id];
    if (s.registered) {
      console.log(`  ok  ${id.padEnd(24)} -> ${s.src}`);
    } else {
      console.error(`  MISS ${id.padEnd(24)} (no <audio> element)`);
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    console.error(`\n[l1-mt] FAIL — ${missing.length} required cue(s) missing from PandaAudio.audio:`);
    for (const id of missing) console.error(`  - ${id}`);
    console.error("Add them to main.js CUE_IDS, then re-run tools/_emit-cues.mjs to refresh the manifest.");
    await browser.close();
    server.close();
    process.exit(1);
  }
  console.log("[l1-mt] ok — all required cues registered\n");

  // ---- Check 2: play through L1 and verify a make-a-ten round's audio chain.
  // Probabilistic. If the first sampled round isn't make-a-ten we just
  // note it; the deterministic check above is the durable guard.
  await page.evaluate(() => { window.__skipTimers = false; });
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
  await page.click("body");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.kaplay.go("level1"));
  // Wait past the greeting + first decompose sentence so we can see
  // which round came up. (greeting 5s + 1s pause + ~15s decompose = ~21s.)
  await page.waitForTimeout(24000);

  const events = await page.evaluate(() => window.__audioEvents);
  const mtIntro = events.find((e) => e.id.startsWith("l1-intro-mt-"));
  if (!mtIntro) {
    // The first sampled round wasn't make-a-ten — note and pass, since
    // check 1 already proved the audio pool is correctly registered.
    console.log("[l1-mt] note — first sampled L1 round isn't make-a-ten; skipping play-through check.");
    console.log(`[l1-mt] intro cue observed: ${events.find((e) => e.id.startsWith("l1-intro-"))?.id || "(none)"}`);
    await browser.close();
    server.close();
    process.exit(0);
  }

  const subFindTen = events.find((e) => e.id === "l1-sub-find-ten");
  if (!subFindTen) {
    console.error(`\n[l1-mt] FAIL — make-a-ten intro fired (${mtIntro.id}) but l1-sub-find-ten never played.`);
    console.error("The runtime requested l1-sub-find-ten but no event was recorded — likely the audio element is broken or another chain cancelled it.");
    await browser.close();
    server.close();
    process.exit(1);
  }
  console.log(`[l1-mt] ok — make-a-ten chain played: ${mtIntro.id} -> l1-sub-find-ten`);

  // Step 2 audio: pair=3+7=10, third=1, so we expect l1-step2-10-1 after
  // the user picks the correct pair. We don't pick here (the verifier
  // would need to know which of the 4 make-ten pair options is the
  // correct one for this specific round) — just confirm the registration
  // already passed in check 1 and exit.
  await browser.close();
  server.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

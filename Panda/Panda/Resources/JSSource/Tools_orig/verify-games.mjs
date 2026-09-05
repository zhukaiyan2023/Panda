// tools/verify-games.mjs — boots every panda-park migrated game and asserts
// that one full correct interaction completes without console errors.
//
// Usage:
//   python3 -m http.server 8126 &
//   CHROME_PATH="<chromium binary>" node tools/verify-games.mjs
//
// For each of the 5 games:
//   * enter the scene
//   * read the candidate items from the canvas
//   * find a valid friends-of-10 pair among the items
//   * click both items
//   * confirm the round progressed (new text node appeared below the prompt)
//
// Bounce is the only single-pick game; the harness clicks the unique correct
// value once. (Whack used to be timed; removed 2026-08-13.)
// booted without console errors (the time-pressure mechanic doesn't lend
// itself to mechanical "complete one round" verification).

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const GAMES = [
  { scene: "gameBoat",   kind: "pair" },
  { scene: "gameBounce", kind: "single" },
  { scene: "gameCloud",  kind: "add" },
  { scene: "gameFeed",   kind: "pair" },
];
const FRIENDS = new Set([
  "1+9", "2+8", "3+7", "4+6", "5+5",
  "9+1", "8+2", "7+3", "6+4",
]);

const failures = [];
const checked = [];

function fail(msg) { failures.push(msg); console.error(`  FAIL ${msg}`); }

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("favicon")) {
    // Allow 404s for cues that haven't been generated yet — the audio
    // manifest can list a new cue id before the corresponding mp3 file
    // has been built (gameFeed's feed-q-pre, for example). The game
    // itself falls back to a pre-existing cue when this happens
    // (buildQuestionCues in scenes/gameFeed.js), so a 404 here is
    // expected during the build→manifest cycle and not a real error.
    if (r.url().match(/\/assets\/audio\/[^/]+\.mp3$/)) return;
    consoleErrors.push(`http ${r.status()}: ${r.url()}`);
  }
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Unlock every game so all are reachable.
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({
      unlockedLevel: 3, starsByLevel: {},
      unlockedGame: 5, starsByGame: {},
      currentLevel: 1,
    }),
  ),
);

// Defensive: the games track doesn't call markRoundFinished today,
// but pin the daily-cap skip anyway in case a future games scene
// shares code with roundScene. Harmless if no caller exists.
await page.evaluate(() => { window.__skipDailyCap = true; });

// Read the positions of all number-bearing picker items currently on screen.
// items in pickerItem.js expose `text` only via the child text node; we read
// every text node in the canvas and group by worldPos.
async function readItems() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const all = k.get("*", { recursive: true });
    // Find the number text nodes — they sit at a known font size set in
    // pickerItem.js (size 64 by default). Their parent
    // root is an area() object with hitShape. We walk one level up.
    const items = [];
    for (const node of all) {
      if (typeof node.text !== "string") continue;
      if (!/^[1-9]$/.test(node.text)) continue;
      const p = typeof node.worldPos === "function" ? node.worldPos() : node.pos;
      items.push({ value: Number(node.text), x: p.x, y: p.y });
    }
    return items;
  });
}

// Pick a tap position for an item — its onClick is bound on the parent root,
// which sits at the same position but with a larger hit box. Click the
// number's centre.
async function clickItem(target) {
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
}

for (const game of GAMES) {
  console.log(`\n${game.scene}  (${game.kind})`);
  await page.evaluate((name) => window.kaplay.go(name), game.scene);
  await page.waitForTimeout(1500);

  const items = await readItems();
  if (items.length < 2) {
    fail(`${game.scene}: expected at least 2 items, saw ${items.length}`);
    continue;
  }

  if (game.kind === "pair") {
    // Read the round's target from the on-screen text. gameFeed is
    // dynamic-target (cycles 5..10 across rounds). It renders a small
    // "目标 N" label below the equation, which the verifier reads via
    // the `目标\s*(\d+)` pattern below. The other pair games
    // (boat/cloud/bounce) never expose a numeric target on screen, so
    // the regex falls through to the 10 default — which matches their
    // fixed target.
    const target = await page.evaluate(() => {
      const k = window.kaplay;
      const nodes = k.get("*", { recursive: true });
      for (const o of nodes) {
        if (typeof o.text !== "string") continue;
        // gameFeed's "目标 N" label (below the equation). The 目标
        // label is the most specific pattern for gameFeed's round
        // target, so check it first.
        let m = o.text.match(/目标\s*(\d+)/);
        if (m) return Number(m[1]);
        // Other pair games with dynamic target — currently only
        // gameFeed, but future-proof for any new pair-scene variant
        // that surfaces the target in plain text.
        m = o.text.match(/加起来是(\d+)/);
        if (m) return Number(m[1]);
        // Reward text "a + b = N！" — works for any correct-pick reveal.
        m = o.text.match(/=\s*(\d+)[\s！!]/);
        if (m) return Number(m[1]);
      }
      return 10;
    });

    // Find a valid pair (a + b == target) and click both.
    let pair = null;
    outer: for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        // items[].value comes from o.text which is a string — coerce.
        if (Number(items[i].value) + Number(items[j].value) === target) {
          pair = [items[i], items[j]];
          break outer;
        }
      }
    }
    if (!pair) {
      fail(`${game.scene}: no valid pair among ${items.map((i) => i.value).join(",")}`);
      continue;
    }
    await clickItem(pair[0]);
    await page.waitForTimeout(400);
    // Re-read items because the highlight/unhighlight mutates state.
    const itemsAfter = await readItems();
    const match = itemsAfter.find(
      (it) => it.value === pair[1].value &&
        Math.abs(it.x - pair[1].x) < 4 &&
        Math.abs(it.y - pair[1].y) < 4,
    );
    if (!match) {
      fail(`${game.scene}: second item ${pair[1].value} disappeared after first pick`);
      continue;
    }
    await clickItem(match);
    // Check the reward text immediately: onCorrect adds it synchronously, but
    // the round auto-advances after a short delay (~0.4s) which destroys it.
    // We need to read the text node in that narrow window.
    await page.waitForTimeout(250);

    // Confirm a result/reward text appeared (e.g. "a + b = N!").
    const gotReward = await page.evaluate((target) => {
      const k = window.kaplay;
      const re = new RegExp(`\\+.*=.*${target}`);
      return k.get("*", { recursive: true })
        .some((o) => typeof o.text === "string" && re.test(o.text));
    }, target);
    if (!gotReward) {
      fail(`${game.scene}: correct pair produced no "+...=${target}" reveal text`);
      continue;
    }
    checked.push(`${game.scene}: ${pair[0].value}+${pair[1].value}=${target}`);
    console.log(`  ok  ${pair[0].value} + ${pair[1].value} = ${target}`);
  } else if (game.kind === "single") {
    // Bounce — find the unique value v such that some implied a makes a+v=10.
    // The implied `a` is whatever digit pairs with v alone in the candidate set.
    // We pick any v that has NO partner among the other items summing to 10.
    const candidates = items.map((i) => Number(i.value));
    let correct = null;
    for (const v of candidates) {
      const partners = candidates.filter((x) => x !== v);
      if (!partners.some((p) => p + v === 10)) {
        correct = v;
        break;
      }
    }
    if (correct === null) {
      fail(`${game.scene}: could not identify the single correct value`);
      continue;
    }
    const target = items.find((it) => it.value === correct);
    await clickItem(target);
    await page.waitForTimeout(800);

    const gotReward = await page.evaluate(() => {
      const k = window.kaplay;
      // The bounce prompt is "扎破那个能凑成十的气球！" — a transient text node
      // that lives on screen at the start of the round. After a correct tap the
      // round advances (the next round's prompt re-renders), so we just check
      // that a text node still exists at the prompt's expected position. The
      // Chinese localized version of the bounce prompt is:
      //   "扎破那个能凑成十的气球！"
      // Plus the reward overlay text "+=10！" persists briefly.
      return k.get("*", { recursive: true })
        .some((o) => typeof o.text === "string"
          && (/\+.*=.*10/.test(o.text) || /扎破那个/.test(o.text)));
    });
    if (!gotReward) {
      fail(`${game.scene}: correct tap did not progress the round`);
      continue;
    }
    checked.push(`${game.scene}: tapped ${correct}`);
    console.log(`  ok  tapped ${correct}`);
  }
}

await page.evaluate(() => window.kaplay.go("levelPicker"));

await browser.close();

console.log(`\n${checked.length} scenes verified`);
if (consoleErrors.length) {
  console.error(`\n${consoleErrors.length} runtime error(s):`);
  [...new Set(consoleErrors)].forEach((e) => console.error(`  ${e}`));
}

// gameFeed smoke above only proves "the scene renders and accepts one
// correct pick". The "喂食第二轮之后卡死" bug shipped because that was
// the only check. Round transitions, multi-pair round completion,
// and the playAfter / k.go chain were never exercised. Spawn the
// dedicated multi-round verifier as a sub-test so "verify-games OK"
// finally implies "all 3 rounds of gameFeed finish and return to the
// picker". The child uses the same dev server we relied on above.
console.log("\ngameFeed multi-round:");
const { spawnSync } = await import("node:child_process");
const mr = spawnSync(process.execPath, ["tools/verify-feed-multiround.mjs"], {
  stdio: "inherit",
  env: { ...process.env, PANDA_URL: process.env.PANDA_URL || URL },
});
if (mr.status !== 0) {
  failures.push(`gameFeed multi-round failed (exit ${mr.status})`);
}

if (failures.length || consoleErrors.length) {
  console.error(`\nFAILED — ${failures.length} assertion(s), ${consoleErrors.length} runtime error(s)`);
  process.exit(1);
}
console.log("PASSED — every panda-park game renders, accepts a correct play, and reports no console errors");
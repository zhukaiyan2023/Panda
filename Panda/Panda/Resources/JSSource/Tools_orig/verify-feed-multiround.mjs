// tools/verify-feed-multiround.mjs — plays gameFeed through ALL 3 rounds.
//
// Closes the test gap that let "喂食第二轮之后卡死" ship: tools/verify-games.mjs
// only ever completes ONE correct pick in gameFeed, so it never builds the
// round-2 board and never exercises a round→round transition. The freeze was
// an unbounded `while` loop in the round-2 candidate generator — invisible to
// a single-pick check, fatal on the third board.
//
// This harness plays every round to completion and asserts the game lands
// back on gamesPicker. A hung JS thread shows up as a page.evaluate timeout,
// which we report as a freeze rather than letting the run wedge forever.
//
// Usage:
//   node tools/dev-server.mjs &
//   node tools/verify-feed-multiround.mjs

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const EVAL_TIMEOUT = 5000;

const failures = [];
function fail(msg) { failures.push(msg); console.error(`  FAIL ${msg}`); }
function ok(msg) { console.log(`  ok ${msg}`); }

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// Every evaluate goes through this so a frozen JS thread surfaces as a
// diagnosable timeout instead of hanging the whole verification run.
async function evalSafe(fn, label) {
  try {
    return await page.evaluate(fn, undefined, { timeout: EVAL_TIMEOUT });
  } catch (e) {
    throw new Error(`FROZEN: JS thread unresponsive during "${label}" (${e.message.split("\n")[0]})`);
  }
}

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

await page.evaluate(() => {
  window.__skipTimers = true;
  localStorage.setItem("panda-save-v1", JSON.stringify({
    unlockedLevel: 3, starsByLevel: {},
    unlockedGame: 5, starsByGame: {}, currentLevel: 1,
  }));
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(600);

// Reads the bubble row (digit text nodes on the bubble baseline) plus the
// round's target, straight off the kaplay tree.
function readBoard() {
  const k = window.kaplay;
  const root = k.getTreeRoot();
  const bubbles = [];
  const seenX = new Set();
  let target = null;
  let roundLabel = null;
  function walk(n, d) {
    if (!n || d > 20) return;
    const t = n.text == null ? null : String(n.text);
    if (t) {
      const mTarget = t.match(/^目标\s*(\d+)$/);
      if (mTarget) target = Number(mTarget[1]);
      const mRound = t.match(/^第\s*(\d+)\s*轮/);
      if (mRound) roundLabel = Number(mRound[1]);
      if (/^\d$/.test(t) && n.pos && Math.abs(n.pos.y - 624) < 3 && !seenX.has(n.pos.x)) {
        seenX.add(n.pos.x);
        bubbles.push({ value: Number(t), x: n.pos.x });
      }
    }
    if (n.children) for (const c of n.children) walk(c, d + 1);
  }
  walk(root, 0);
  bubbles.sort((a, b) => a.x - b.x);
  return { bubbles, target, roundLabel, scene: k.getSceneName ? k.getSceneName() : null };
}

// Play every round. Each round we repeatedly find and click a valid pair
// until the board advances (round label changes) or we leave the scene.
const ROUNDS = 5;
for (let r = 1; r <= ROUNDS; r++) {
  const board = await evalSafe(readBoard, `read board for round ${r}`);
  if (board.roundLabel !== r) {
    fail(`expected round ${r}, saw round label ${board.roundLabel}`);
    break;
  }
  const values = board.bubbles.map((b) => b.value);
  ok(`round ${r}: target=${board.target} bubbles=[${values.join(",")}]`);

  // Find every valid pair on this board; the round needs all of them.
  const pairsOnBoard = [];
  for (let i = 0; i < board.bubbles.length; i++) {
    for (let j = i + 1; j < board.bubbles.length; j++) {
      if (board.bubbles[i].value + board.bubbles[j].value === board.target) {
        pairsOnBoard.push([board.bubbles[i], board.bubbles[j]]);
      }
    }
  }
  if (pairsOnBoard.length === 0) {
    fail(`round ${r}: no valid pair sums to ${board.target} on board [${values.join(",")}]`);
    break;
  }
  ok(`round ${r}: ${pairsOnBoard.length} valid pair(s) available`);

  // Click pairs until the round completes. Cap the attempts so a broken
  // advance can't loop forever.
  let advanced = false;
  for (const [pa, pb] of pairsOnBoard) {
    await page.mouse.click(pa.x, 624);
    await page.waitForTimeout(120);
    await page.mouse.click(pb.x, 624);
    await page.waitForTimeout(400);

    // This is the call that hangs when the next round's candidate
    // generator can't terminate.
    const after = await evalSafe(readBoard, `board state after pair in round ${r}`);
    if (after.scene === "gamesPicker" || after.roundLabel !== r) {
      advanced = true;
      break;
    }
  }
  if (!advanced && r < ROUNDS) {
    fail(`round ${r} did not advance after clicking all valid pairs`);
    break;
  }
}

const final = await evalSafe(
  () => (window.kaplay.getSceneName ? window.kaplay.getSceneName() : null),
  "final scene check",
);
if (final === "gamesPicker") ok(`finished all ${ROUNDS} rounds and returned to gamesPicker`);
else fail(`after ${ROUNDS} rounds expected gamesPicker, got "${final}"`);

for (const e of pageErrors) fail(`pageerror: ${e}`);

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\ngameFeed multi-round: PASS");

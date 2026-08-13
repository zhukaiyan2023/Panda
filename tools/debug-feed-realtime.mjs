// tools/debug-feed-realtime.mjs — runs gameFeed WITHOUT __skipTimers
// and uses the real playAfter fallback timer (duration+2500ms per
// transition, capped at 6000ms default). Long waits, but it's the
// only way to actually exercise the audio path the user reports as
// broken in the real browser.
//
// Round transitions each take 6-9s in headless (audio play() rejects
// in headless, but the playAfter fallback timer still fires). 3
// rounds + final transition ≈ 30s wall clock.
//
// Usage:
//   PORT=8126 node tools/dev-server.mjs &
//   node tools/debug-feed-realtime.mjs

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const ROUNDS = 5;
const ROUND_WAIT_MS = 9000;   // > 6s default fallback + 2.5s buffer
const FINAL_WAIT_MS = 9000;

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-cache", "--disk-cache-size=0"],
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();

const consoleMsgs = [];
page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  const t = m.text();
  if (!t.includes("favicon")) consoleMsgs.push(`[${m.type()}] ${t}`);
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);

await page.evaluate(() => {
  localStorage.setItem("panda-save-v1", JSON.stringify({
    unlockedLevel: 3, starsByLevel: {},
    unlockedGame: 5, starsByGame: {}, currentLevel: 1,
  }));
  // NO __skipTimers — real audio path.
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(600);

async function readBoard() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    const bubbles = [];
    const seenX = new Set();
    let target = null;
    let roundLabel = null;
    let scene = null;
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
    try { scene = k.getSceneName(); } catch (_) {}
    return { bubbles, target, roundLabel, scene };
  });
}

let success = true;

for (let r = 1; r <= ROUNDS; r++) {
  let board = await readBoard();
  if (board.roundLabel !== r) {
    console.error(`FAIL expected round ${r}, saw ${board.roundLabel} scene=${board.scene}`);
    success = false;
    break;
  }
  const values = board.bubbles.map((b) => b.value);
  console.log(`[debug] round ${r}: target=${board.target} bubbles=[${values.join(",")}]`);

  // Find every valid pair.
  const pairs = [];
  for (let i = 0; i < board.bubbles.length; i++) {
    for (let j = i + 1; j < board.bubbles.length; j++) {
      if (board.bubbles[i].value + board.bubbles[j].value === board.target) {
        pairs.push([board.bubbles[i], board.bubbles[j]]);
      }
    }
  }
  console.log(`[debug] round ${r}: ${pairs.length} valid pair(s) on board`);

  for (const [pa, pb] of pairs) {
    await page.mouse.click(pa.x, 624);
    await page.waitForTimeout(120);
    await page.mouse.click(pb.x, 624);
    // Wait the full round transition window. playAfter falls back
    // to the duration+2500ms timer when audio doesn't actually play
    // (headless rejects play()).
    await page.waitForTimeout(ROUND_WAIT_MS);
    const after = await readBoard();
    if (after.scene === "gamesPicker" || after.roundLabel !== r) {
      console.log(`[debug] round ${r}: advanced to ${after.scene === "gamesPicker" ? "gamesPicker" : `round ${after.roundLabel}`}`);
      board = after;
      break;
    }
  }
  if (board.scene !== "gamesPicker" && board.roundLabel === r) {
    console.error(`[debug] round ${r}: STUCK after ${pairs.length * ROUND_WAIT_MS}ms wait`);
    success = false;
    break;
  }
}

// Final scene check — wait the fallback window for the lvl-done
// playAfter chain to complete.
console.log(`\n[debug] waiting ${FINAL_WAIT_MS}ms for final scene transition...`);
await page.waitForTimeout(FINAL_WAIT_MS);
const finalScene = await page.evaluate(() => {
  try { return window.kaplay.getSceneName(); } catch (_) { return null; }
});
console.log(`[debug] final scene: ${finalScene}`);

if (finalScene === "gamesPicker") {
  console.log(`\n[debug] PASS: reached gamesPicker after ${ROUNDS} rounds in real-audio path`);
} else {
  console.error(`\n[debug] FAIL: stuck on ${finalScene} after ${FINAL_WAIT_MS}ms wait`);
  success = false;
}

if (consoleMsgs.length) {
  console.log("\n[debug] last 30 page console messages:");
  for (const m of consoleMsgs.slice(-30)) console.log(`  ${m}`);
}

await browser.close();
process.exit(success ? 0 : 1);

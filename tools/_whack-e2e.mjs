// End-to-end test for gameWhack — drives the 2-tap pair logic via the
// debug tap hook (gated behind ?debug=tap so production never exposes it).
//
// Covers correct pair, wrong pair, same-hole deselect, and the win path.
import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/?debug=tap";
const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.evaluate(() =>
  localStorage.setItem("panda-save-v1", JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 })),
);
await page.evaluate(() => window.kaplay.go("gameWhack"));
await page.waitForTimeout(3500);

// Reset every hole to empty so the test fully controls mole placement.
await page.evaluate(() => {
  const w = window.__whack;
  w.holes.forEach((h) => { if (h.occupied) h.retreat(); });
});

const results = {};

async function spawn(idx, value) {
  await page.evaluate(({ idx, value }) => {
    window.__whack.spawnAt(idx, value);
  }, { idx, value });
  await page.waitForTimeout(150);
}
async function tap(idx) {
  await page.evaluate((idx) => { window.__whack.tap(idx); }, idx);
  await page.waitForTimeout(150);
}
async function snapshot() {
  return await page.evaluate(() => ({
    pairs: window.__whack.state.pairs,
    pending: window.__whack.state.pending,
    occ: window.__whack.holes.map((h) => h.occupied),
    finished: window.__whack.state.finished,
    winTextShown: window.kaplay.get("*", { recursive: true })
      .some((o) => typeof o.text === "string" && o.text.includes("找全")),
  }));
}

// === Test 1: correct pair (8+2=10) ===
await spawn(0, 8); await spawn(1, 2);
await tap(0); await tap(1);
await page.waitForTimeout(200);
results.test1 = await snapshot();

// === Test 2: wrong pair (5+7=12) does NOT score ===
await spawn(0, 5); await spawn(1, 7);
const pairsBeforeT2 = (await snapshot()).pairs;
await tap(0); await tap(1);
await page.waitForTimeout(200);
results.test2 = await snapshot();
results.test2_expected = pairsBeforeT2;

// === Test 3: tap same hole twice = deselect (no scoring) ===
await spawn(0, 6);
await tap(0); await tap(0);
await page.waitForTimeout(150);
results.test3 = await snapshot();

// === Test 4: complete 5 pairs to win ===
// We have pairs=1 from Test 1. Score 4 more.
const winPairs = [[1, 9], [2, 8], [3, 7], [4, 6]];
// Each pair uses two adjacent holes; cycle through the 6 holes so we
// don't collide with Test 1's holes 0/1 (which were just used).
const winSlots = [[2, 3], [4, 5], [0, 1], [2, 3]];
for (let i = 0; i < winPairs.length; i++) {
  const [a, b] = winPairs[i];
  const [idxA, idxB] = winSlots[i];
  // Make sure these holes are empty before spawning (Test 1 may have
  // left moles around; spawnAt refuses to overwrite an occupied hole).
  await page.evaluate(([idxA, idxB]) => {
    if (window.__whack.holes[idxA].occupied) window.__whack.holes[idxA].retreat();
    if (window.__whack.holes[idxB].occupied) window.__whack.holes[idxB].retreat();
  }, [idxA, idxB]);
  await spawn(idxA, a);
  await spawn(idxB, b);
  await tap(idxA);
  await tap(idxB);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(800);  // let win text render
results.test4 = await snapshot();

await page.screenshot({ path: "/tmp/whack-screenshot.png" });

console.log("=== RESULTS ===");
console.log("Test 1 (correct 8+2=10):       ", JSON.stringify(results.test1), "  EXPECT pairs=1 occ=[false,false]");
console.log(`Test 2 (wrong 5+7=12):         `, JSON.stringify(results.test2), `  EXPECT pairs=${results.test2_expected} occ=[true,true]`);
console.log("Test 3 (same hole tap twice): ", JSON.stringify(results.test3), "  EXPECT pending=null");
console.log("Test 4 (win at 5 pairs):       ", JSON.stringify(results.test4), "  EXPECT pairs=5 finished=true winTextShown=true");

const pass =
  results.test1.pairs === 1 && !results.test1.occ[0] && !results.test1.occ[1] &&
  results.test2.pairs === results.test2_expected && results.test2.occ[0] && results.test2.occ[1] &&
  results.test3.pending === null &&
  results.test4.pairs === 5 && results.test4.finished && results.test4.winTextShown;
console.log(`\n${pass ? "✓ ALL TESTS PASSED" : "✗ SOME TESTS FAILED"}`);
await browser.close();
process.exit(pass ? 0 : 1);
// tools/save-daily.test.mjs — verifies the daily-cap save layer.
//
// Boots the app in Playwright, clears any pre-existing save, and
// exercises isLevelDailyLocked / markRoundFinished / getDailyState
// directly via window.PandaSave. The picker / roundScene integration
// is covered by the existing tools/verify-math.mjs and the smoke
// tests; this file focuses on the save layer's contract.

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";

const failures = [];
function fail(msg) { failures.push(msg); console.error(`  FAIL ${msg}`); }
function ok(msg) { console.log(`  ok ${msg}`); }

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await (await browser.newContext()).newPage();

page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Start clean so we don't inherit state from a previous run.
await page.evaluate(() => localStorage.removeItem("panda-save-v1"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

async function callSave(method, ...args) {
  return page.evaluate(
    ({ method, args }) => window.PandaSave[method](...args),
    { method, args },
  );
}

async function getSave() {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("panda-save-v1") || "null"),
  );
}

// --- Test 1: initial state is unlocked for all levels ---
const l1Initial = await callSave("isLevelDailyLocked", 1);
if (l1Initial === false) ok("L1 not locked initially");
else fail(`L1 locked initially (got ${l1Initial})`);

const l4Initial = await callSave("isLevelDailyLocked", 4);
if (l4Initial === false) ok("L4 not locked initially");
else fail(`L4 locked initially (got ${l4Initial})`);

// --- Test 2: getDailyState returns sane shape ---
const l1State = await callSave("getDailyState", 1);
if (l1State && l1State.count === 0 && l1State.cap === 6 && l1State.locked === false) {
  ok("L1 getDailyState initial: count=0, cap=6, locked=false");
} else {
  fail(`L1 getDailyState wrong: ${JSON.stringify(l1State)}`);
}

const l3State = await callSave("getDailyState", 3);
if (l3State && l3State.cap === 10) ok("L3 getDailyState cap=10");
else fail(`L3 getDailyState cap wrong: ${JSON.stringify(l3State)}`);

// --- Test 3: markRoundFinished increments and persists ---
const r1 = await callSave("markRoundFinished", 1);
if (r1 && r1.count === 1 && r1.cap === 6 && r1.locked === false) {
  ok("markRoundFinished(L1) #1: count=1, locked=false");
} else {
  fail(`markRoundFinished(L1) #1 wrong: ${JSON.stringify(r1)}`);
}

const stored = await getSave();
if (stored && stored.daily && stored.daily[1] && stored.daily[1].count === 1) {
  ok("localStorage has daily[1].count=1");
} else {
  fail(`localStorage daily[1] wrong: ${JSON.stringify(stored && stored.daily)}`);
}

// --- Test 4: 6th finished round on L1 hits the cap (count >= cap → locked) ---
let lastResult = null;
for (let i = 2; i <= 6; i++) {
  lastResult = await callSave("markRoundFinished", 1);
}
if (lastResult && lastResult.count === 6 && lastResult.locked === true) {
  ok("L1 6th finished round: count=6, locked=true");
} else {
  fail(`L1 6th finished round wrong: ${JSON.stringify(lastResult)}`);
}

// --- Test 5: isLevelDailyLocked(1) now returns true ---
const l1LockedNow = await callSave("isLevelDailyLocked", 1);
if (l1LockedNow === true) ok("isLevelDailyLocked(1) returns true after 6 rounds");
else fail(`isLevelDailyLocked(1) wrong after 6 rounds: ${l1LockedNow}`);

// --- Test 6: L1 locked, L2 still unlocked (per-level isolation) ---
const l1Iso = await callSave("isLevelDailyLocked", 1);
const l2Iso = await callSave("isLevelDailyLocked", 2);
if (l1Iso === true && l2Iso === false) {
  ok("per-level isolation: L1 locked, L2 unlocked");
} else {
  fail(`per-level isolation broken: L1=${l1Iso}, L2=${l2Iso}`);
}

// --- Test 7: windowStartedAt is set on first finished round ---
if (stored && stored.daily && stored.daily[1] && typeof stored.daily[1].windowStartedAt === "number"
    && stored.daily[1].windowStartedAt > 0) {
  ok("windowStartedAt is a positive number");
} else {
  fail(`windowStartedAt wrong: ${JSON.stringify(stored && stored.daily && stored.daily[1])}`);
}

// --- Test 8: lazy rollover — manually expire the window, next call resets count ---
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("panda-save-v1"));
  s.daily[1].windowStartedAt = Date.now() - (25 * 60 * 60 * 1000); // 25h ago
  localStorage.setItem("panda-save-v1", JSON.stringify(s));
});
const l1AfterExpiry = await callSave("isLevelDailyLocked", 1);
if (l1AfterExpiry === false) ok("lazy rollover: L1 unlocked after 25h expiry");
else fail(`lazy rollover broken: L1 locked after 25h: ${l1AfterExpiry}`);

const storedAfterExpiry = await getSave();
if (storedAfterExpiry && storedAfterExpiry.daily && storedAfterExpiry.daily[1]
    && storedAfterExpiry.daily[1].count === 0
    && storedAfterExpiry.daily[1].windowStartedAt === null) {
  ok("lazy rollover persists: count=0, windowStartedAt=null");
} else {
  fail(`lazy rollover didn't persist: ${JSON.stringify(storedAfterExpiry && storedAfterExpiry.daily && storedAfterExpiry.daily[1])}`);
}

// --- Test 9: __skipDailyCap honored ---
await page.evaluate(() => { window.__skipDailyCap = true; });
let skipResult = null;
for (let i = 0; i < 10; i++) {
  skipResult = await callSave("markRoundFinished", 1);
}
if (skipResult && skipResult.locked === false) {
  ok("__skipDailyCap: locked=false after 16 finished rounds");
} else {
  fail(`__skipDailyCap ignored: ${JSON.stringify(skipResult)}`);
}

console.log(`\n${failures.length} failure(s)`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);

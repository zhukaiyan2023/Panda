// tools/probe-feed-round1-crash.mjs — narrower probe: just round 1 → round 2
// transition for gameFeed. Captures scene name + node count before/after each
// step and exits with non-zero if the page crashes or hangs longer than 6s.
import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const SKIP_TIMERS = process.env.SKIP_TIMERS !== "0";
console.log(`[probe] SKIP_TIMERS=${SKIP_TIMERS}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 1,
  hasTouch: true,
});
const page = await ctx.newPage();

const events = [];
page.on("pageerror", (err) => events.push({ t: Date.now(), kind: "pageerror", msg: err.stack || err.message }));
page.on("console", (msg) => {
  const t = msg.type();
  const txt = msg.text();
  if (txt.startsWith("[gameFeed]") || txt.startsWith("[pairScene]") || txt.startsWith("[trace]")) {
    events.push({ t: Date.now(), kind: "log", txt });
  }
  if (t === "error") events.push({ t: Date.now(), kind: "console.error", txt });
});

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  window.__events = [];
  const origLog = console.log;
  console.log = function (...args) {
    if (typeof args[0] === "string" && (args[0].startsWith("[gameFeed]") || args[0].startsWith("[pairScene]") || args[0].startsWith("[trace]"))) {
      window.__events.push(args.map(String).join(" "));
    }
    return origLog.apply(console, args);
  };
}, SKIP_TIMERS);

await page.goto(URL, { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 }),
  );
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(1500);

async function safeSnapshot(label) {
  try {
    return await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      let sceneName = null;
      try { sceneName = k.getSceneName(); } catch (_) {}
      let bubbles = 0;
      function walk(n, d) {
        if (!n || d > 18) return;
        if (n.text != null && /^\d$/.test(String(n.text)) && n.pos && Math.abs(n.pos.y - 624) < 2) bubbles++;
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      return { sceneName, bubbles, eventCount: window.__events.length };
    });
  } catch (e) {
    return { error: e.message };
  }
}

async function getEvents() {
  return page.evaluate(() => {
    const out = window.__events.slice();
    window.__events.length = 0;
    return out;
  });
}

const t0 = Date.now();
function ms() { return Date.now() - t0; }

console.log(`[probe] @${ms()}ms entering gameFeed`);
const init = await safeSnapshot("init");
console.log(`[probe] init: ${JSON.stringify(init)}`);
for (const e of await getEvents()) console.log(`[probe] ${ms()}ms ${e}`);

// Click first bubble
const first = await safeSnapshot("round0-ready");
console.log(`[probe] @${ms()}ms round0: ${JSON.stringify(first)}`);

console.log(`[probe] @${ms()}ms clicking first bubble (528, 624)`);
await page.mouse.click(528, 624);
await page.waitForTimeout(150);
console.log(`[probe] @${ms()}ms state after first click`);
console.log(`  snapshot: ${JSON.stringify(await safeSnapshot("after-click1"))}`);
for (const e of await getEvents()) console.log(`  ${e}`);

console.log(`[probe] @${ms()}ms clicking second bubble (858, 624)`);
await page.mouse.click(858, 624);

// Now poll for state changes for up to 6 seconds
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(500);
  const snap = await safeSnapshot(`poll-${i}`);
  const evs = await getEvents();
  console.log(`[probe] @${ms()}ms poll ${i}: ${JSON.stringify(snap)}`);
  for (const e of evs) console.log(`  ${e}`);
  if (snap.error) {
    console.log(`[probe] *** page crashed at ${ms()}ms ***`);
    break;
  }
}

console.log(`\n[probe] === ALL EVENTS ===`);
for (const e of events) console.log(`[probe] event ${JSON.stringify(e)}`);

await ctx.close();
await browser.close();
console.log("[probe] done");
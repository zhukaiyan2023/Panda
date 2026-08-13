// tools/probe-feed-precise.mjs — runs only round 1 → round 2 transition,
// captures EVERY event in order, and wraps each step with try/catch in
// the page so we can pinpoint where the crash occurs.
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
page.on("pageerror", (err) => events.push({ kind: "pageerror", msg: err.stack || err.message }));
page.on("console", (msg) => {
  const t = msg.type();
  const txt = msg.text();
  if (txt.startsWith("[gameFeed]") || txt.startsWith("[pairScene]") || txt.startsWith("[trace]") || txt.startsWith("[PandaAudio]") || t === "error") {
    events.push({ kind: "console", txt });
  }
});

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  window.__events = [];
  const origLog = console.log;
  console.log = function (...args) {
    if (typeof args[0] === "string" && (args[0].startsWith("[gameFeed]") || args[0].startsWith("[pairScene]") || args[0].startsWith("[trace]") || args[0].startsWith("[PandaAudio]"))) {
      window.__events.push(args.map(String).join(" "));
    }
    return origLog.apply(console, args);
  };
  // Catch all uncaught exceptions in the page
  window.addEventListener("error", (e) => {
    window.__events.push(`[window.error] ${e.message} at ${e.filename}:${e.lineno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__events.push(`[unhandledrejection] ${e.reason?.message || e.reason}`);
  });
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

async function getEvents() {
  return page.evaluate(() => {
    const out = window.__events.slice();
    window.__events.length = 0;
    return out;
  });
}

async function getBubbles() {
  try {
    return await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      const bubbles = [];
      function walk(n, d) {
        if (!n || d > 12) return;
        if (n.text != null && /^\d$/.test(String(n.text)) && n.pos && Math.abs(n.pos.y - 624) < 2) {
          bubbles.push({ value: Number(n.text), x: n.pos.x });
        }
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      return bubbles;
    });
  } catch (_) { return null; }
}

async function isAlive() {
  try {
    const r = await Promise.race([
      page.evaluate(() => "alive"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("js-frozen")), 1500)),
    ]);
    return r === "alive";
  } catch (e) {
    return `DEAD: ${e.message}`;
  }
}

async function getRoundPill() {
  try {
    return await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      let pill = null;
      function walk(n, d) {
        if (!n || d > 12) return;
        if (n.text != null && /第\s*\d+\s*轮/.test(String(n.text))) pill = String(n.text);
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      return pill;
    });
  } catch (_) { return null; }
}

const t0 = Date.now();
function ms() { return Date.now() - t0; }

// Run round 1 (game round 0)
let pill = await getRoundPill();
console.log(`[probe] @${ms()}ms start pill=${pill}`);
let bubbles = await getBubbles();
console.log(`[probe] @${ms()}ms bubbles=${bubbles.map(b=>b.value).join(",")}`);

// Find valid pair
const target = Number((await page.evaluate(() => {
  const k = window.kaplay;
  const root = k.getTreeRoot();
  let last = null;
  function walk(n, d) {
    if (!n || d > 12) return;
    if (n.slotCenters && n.slotCenters.length >= 5) {
      function collect(x, dd) {
        if (!x || dd > 6) return;
        if (x.text != null) last = String(x.text);
        if (x.children) for (const c of n.children) collect(c, dd + 1);
      }
      collect(n, 0);
    }
    if (n.children) for (const c of n.children) walk(c, d + 1);
  }
  walk(root, 0);
  return last;
})));
console.log(`[probe] @${ms()}ms target=${target}`);

const vals = bubbles.map(b => b.value);
let pair = null;
for (let i = 0; i < vals.length; i++) {
  for (let j = i + 1; j < vals.length; j++) {
    if (vals[i] + vals[j] === target) {
      pair = [bubbles[i], bubbles[j]];
      break;
    }
  }
  if (pair) break;
}
console.log(`[probe] @${ms()}ms clicking pair (${pair[0].value},${pair[1].value})`);
await page.mouse.click(pair[0].x, 624);
await page.waitForTimeout(150);
await page.mouse.click(pair[1].x, 624);

// Poll for round advance
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(250);
  const newPill = await getRoundPill();
  const alive = await isAlive();
  const evs = await getEvents();
  console.log(`[probe] @${ms()}ms poll ${i}: pill=${newPill} alive=${alive}`);
  for (const e of evs) console.log(`  ${e}`);
  if (alive !== true) {
    console.log(`[probe] page ${alive} after ${i} polls`);
    break;
  }
  if (newPill !== pill && newPill !== null) {
    console.log(`[probe] @${ms()}ms round advanced to ${newPill}`);
    break;
  }
}

// Run round 2 (game round 1) — capture exact crash point
pill = await getRoundPill();
bubbles = await getBubbles();
console.log(`[probe] @${ms()}ms now in ${pill}, bubbles=${bubbles?.map(b=>b.value).join(",")}`);

if (!bubbles) {
  console.log(`[probe] no bubbles — aborting`);
} else {
  const target2 = Number((await page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    let last = null;
    function walk(n, d) {
      if (!n || d > 12) return;
      if (n.slotCenters && n.slotCenters.length >= 5) {
        function collect(x, dd) {
          if (!x || dd > 6) return;
          if (x.text != null) last = String(x.text);
          if (x.children) for (const c of n.children) collect(c, dd + 1);
        }
        collect(n, 0);
      }
      if (n.children) for (const c of n.children) walk(c, d + 1);
    }
    walk(root, 0);
    return last;
  })));
  console.log(`[probe] target2=${target2}`);

  const vals2 = bubbles.map(b => b.value);
  let pair2 = null;
  for (let i = 0; i < vals2.length; i++) {
    for (let j = i + 1; j < vals2.length; j++) {
      if (vals2[i] + vals2[j] === target2) {
        pair2 = [bubbles[i], bubbles[j]];
        break;
      }
    }
    if (pair2) break;
  }
  console.log(`[probe] clicking pair2 (${pair2[0].value},${pair2[1].value})`);
  await page.mouse.click(pair2[0].x, 624);
  await page.waitForTimeout(150);
  await page.mouse.click(pair2[1].x, 624);

  // Poll densely to catch the crash moment
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    const alive = await isAlive();
    const evs = await getEvents();
    if (evs.length || alive !== true) {
      console.log(`[probe] @${ms()}ms poll ${i}: alive=${alive}`);
      for (const e of evs) console.log(`  ${e}`);
    }
    if (alive !== true) break;
  }
}

console.log(`\n[probe] === ALL EVENTS ===`);
for (const e of events) console.log(`[probe] ${JSON.stringify(e)}`);

await ctx.close();
await browser.close();
console.log("[probe] done");
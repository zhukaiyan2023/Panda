// tools/probe-feed-dup.mjs — same as probe-feed-stuck.mjs but with extra
// instrumentation: logs round 1 (3,3) pick attempt step by step, and waits
// 12s before each snapshot so cheer chains (which are ~3-4s in real audio)
// can fully settle. Catches the "page crashed during round transition" race.
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
      const bubbles = [];
      const seenX = new Set();
      function walk(n, d) {
        if (!n || d > 18) return;
        if (n.text != null && /^\d$/.test(String(n.text)) && n.pos
            && Math.abs(n.pos.y - 624) < 2 && !seenX.has(n.pos.x)) {
          seenX.add(n.pos.x);
          bubbles.push({ value: Number(n.text), x: n.pos.x, y: n.pos.y });
        }
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      bubbles.sort((a, b) => a.x - b.x);
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

// Find and click the first valid pair for each round
let roundNum = 1;
const MAX_ROUNDS = 4;
while (roundNum <= MAX_ROUNDS) {
  console.log(`\n[probe] === Round ${roundNum} @${ms()}ms ===`);
  await page.waitForTimeout(500);
  const before = await safeSnapshot(`round${roundNum}-before`);
  console.log(`[probe] before: ${JSON.stringify(before)}`);
  for (const e of await getEvents()) console.log(`  ${e}`);
  if (before.error) { console.log(`[probe] *** CRASHED before click ***`); break; }
  if (!before.bubbles.length) { console.log(`[probe] *** no bubbles ***`); break; }

  const target = Number(String(before.sceneName).match(/./)?.[0]);  // dummy
  const eqnNodes = await page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    const out = [];
    function walk(n, d) {
      if (!n || d > 18) return;
      if (n.slotCenters && n.slotCenters.length >= 5) {
        function collect(x, dd) {
          if (!x || dd > 6) return;
          if (x.text != null) out.push(String(x.text));
          if (x.children) for (const c of n.children) collect(c, dd + 1);
        }
        collect(n, 0);
      }
      if (n.children) for (const c of n.children) walk(c, d + 1);
    }
    walk(root, 0);
    return out;
  });
  const tgt = Number(eqnNodes[eqnNodes.length - 1]);
  if (!Number.isFinite(tgt)) { console.log(`[probe] *** no target ***`); break; }

  const vals = before.bubbles.map((b) => b.value);
  let chosen = null;
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (vals[i] + vals[j] === tgt) {
        chosen = { ...before.bubbles[i], b: before.bubbles[j], aVal: vals[i], bVal: vals[j] };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) { console.log(`[probe] *** no pair sums to ${tgt} in ${JSON.stringify(vals)} ***`); break; }

  console.log(`[probe] @${ms()}ms clicking pair (${chosen.aVal},${chosen.bVal}) at (${chosen.x},624) & (${chosen.b.x},624)`);
  await page.mouse.click(chosen.x, 624);
  await page.waitForTimeout(150);
  console.log(`[probe] @${ms()}ms after click 1`);
  const afterClick1 = await safeSnapshot("after-click1");
  console.log(`  ${JSON.stringify(afterClick1)}`);
  for (const e of await getEvents()) console.log(`  ${e}`);

  await page.mouse.click(chosen.b.x, 624);
  await page.waitForTimeout(150);
  console.log(`[probe] @${ms()}ms after click 2`);
  const afterClick2 = await safeSnapshot("after-click2");
  console.log(`  ${JSON.stringify(afterClick2)}`);
  for (const e of await getEvents()) console.log(`  ${e}`);

  // poll 8 times for 800ms each — covers cheer chain settle + scene transition
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    const snap = await safeSnapshot(`poll-${i}`);
    const evs = await getEvents();
    console.log(`[probe] @${ms()}ms poll ${i}: ${JSON.stringify(snap)}`);
    for (const e of evs) console.log(`  ${e}`);
    if (snap.error) {
      console.log(`[probe] *** page crashed at poll ${i} ***`);
      break;
    }
  }
  roundNum++;
}

console.log(`\n[probe] === ALL EVENTS ===`);
for (const e of events) console.log(`[probe] ${JSON.stringify(e)}`);

await ctx.close();
await browser.close();
console.log("[probe] done");
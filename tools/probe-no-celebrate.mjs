// tools/probe-no-celebrate.mjs — runs gameFeed with celebration disabled
// (gated on window.__trace_no_celebrate=true). If it doesn't crash, the
// crash is in celebrate(); if it still crashes, it's elsewhere.
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

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  window.__trace_no_celebrate = true;
  window.__trace_no_audio = true;
  window.__trace_no_mood = true;
  window.__trace_no_eat = true;
  window.__trace_no_transition = false;
  window.__events = [];
  const origLog = console.log;
  console.log = function (...args) {
    if (typeof args[0] === "string" && (args[0].startsWith("[gameFeed]") || args[0].startsWith("[pairScene]"))) {
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
await page.waitForTimeout(2500);

async function getEvents() {
  return page.evaluate(() => {
    const out = window.__events.slice();
    window.__events.length = 0;
    return out;
  });
}

async function isAlive() {
  try {
    await Promise.race([
      page.evaluate(() => "alive"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("js-frozen")), 1500)),
    ]);
    return true;
  } catch (e) {
    return e.message;
  }
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

async function getTarget() {
  return page.evaluate(() => {
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
  });
}

const t0 = Date.now();
function ms() { return Date.now() - t0; }

let pill = await page.evaluate(() => {
  const k = window.kaplay;
  const root = k.getTreeRoot();
  let p = null;
  function walk(n, d) {
    if (!n || d > 12) return;
    if (n.text != null && /第\s*\d+\s*轮/.test(String(n.text))) p = String(n.text);
    if (n.children) for (const c of n.children) walk(c, d + 1);
  }
  walk(root, 0);
  return p;
});
console.log(`[probe] @${ms()}ms start pill=${pill}`);

for (let roundNum = 1; roundNum <= 4; roundNum++) {
  await page.waitForTimeout(500);
  const bubbles = await getBubbles();
  if (!bubbles) { console.log(`[probe] @${ms()}ms round ${roundNum}: page dead`); break; }
  const target = Number(await getTarget());
  console.log(`[probe] @${ms()}ms round ${roundNum} (${pill}): bubbles=${bubbles.map(b=>b.value).join(",")} target=${target}`);

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
  if (!pair) { console.log(`[probe] no pair`); break; }
  console.log(`[probe] @${ms()}ms clicking pair (${pair[0].value},${pair[1].value})`);
  const alive1 = await isAlive();
  console.log(`[probe] alive before click 1: ${alive1}`);
  await page.mouse.click(pair[0].x, 624);
  const alive2 = await isAlive();
  console.log(`[probe] @${ms()}ms alive after click 1: ${alive2}`);
  await page.waitForTimeout(150);
  const alive3 = await isAlive();
  console.log(`[probe] @${ms()}ms alive before click 2: ${alive3}`);
  await page.mouse.click(pair[1].x, 624, { timeout: 3000 });
  const alive4 = await isAlive();
  console.log(`[probe] @${ms()}ms alive after click 2: ${alive4}`);

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(200);
    const alive = await isAlive();
    const evs = await getEvents();
    const newPill = await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      let p = null;
      function walk(n, d) {
        if (!n || d > 12) return;
        if (n.text != null && /第\s*\d+\s*轮/.test(String(n.text))) p = String(n.text);
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      return p;
    });
    if (evs.length) {
      console.log(`[probe] @${ms()}ms poll ${i}: pill=${newPill} alive=${alive}`);
      for (const e of evs) console.log(`  ${e}`);
    }
    if (alive !== true) { console.log(`[probe] page ${alive}`); break; }
    if (newPill !== pill && newPill !== null) {
      pill = newPill;
      console.log(`[probe] @${ms()}ms round advanced to ${newPill}`);
      break;
    }
  }
}

console.log("\n[probe] === ALL EVENTS ===");
for (const e of await getEvents()) console.log(e);

await ctx.close();
await browser.close();
console.log("[probe] done");
// tools/probe-feed-freeze.mjs — focused detector: after each round's pair
// pick, do a tiny page.evaluate (just `1+1`) with a 1s timeout. If that
// times out, the page's JS thread is frozen (not necessarily crashed).
// This tells us whether the bug is a freeze (renderer alive, JS stuck)
// or a hard crash (renderer gone).
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
page.on("pageerror", (err) => events.push(`[pageerror] ${err.stack || err.message}`));
page.on("console", (msg) => {
  const t = msg.type();
  const txt = msg.text();
  if (txt.startsWith("[gameFeed]") || txt.startsWith("[pairScene]") || txt.startsWith("[trace]")) {
    events.push(`[page] ${txt}`);
  }
  if (t === "error") events.push(`[console.error] ${txt}`);
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

async function isAlive(label) {
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
  } catch (_) {
    return null;
  }
}

async function getEvents() {
  return page.evaluate(() => {
    const out = window.__events.slice();
    window.__events.length = 0;
    return out;
  });
}

async function getRoundPill() {
  return page.evaluate(() => {
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
}

const t0 = Date.now();
function ms() { return Date.now() - t0; }

console.log(`[probe] @${ms()}ms start`);

const alive = await isAlive("start");
console.log(`[probe] alive: ${alive}`);

let roundNum = 1;
while (roundNum <= 5) {
  const pill = await getRoundPill();
  console.log(`\n[probe] === Round ${roundNum} (${pill}) @${ms()}ms ===`);
  const bubbles = await getBubbles();
  if (!bubbles) { console.log(`[probe] page dead`); break; }
  console.log(`[probe] bubbles: ${bubbles.map(b => b.value).join(",")}`);
  const tgt = await page.evaluate(() => {
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
  console.log(`[probe] target: ${tgt}`);
  const vals = bubbles.map(b => b.value);
  let pair = null;
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (vals[i] + vals[j] === Number(tgt)) {
        pair = [bubbles[i], bubbles[j]];
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) { console.log(`[probe] no pair`); break; }

  console.log(`[probe] click 1 @${ms()}ms at (${pair[0].x}, 624)`);
  await page.mouse.click(pair[0].x, 624);
  await page.waitForTimeout(100);
  const evs1 = await getEvents();
  for (const e of evs1) console.log(`  ${e}`);

  console.log(`[probe] click 2 @${ms()}ms at (${pair[1].x}, 624)`);
  await page.mouse.click(pair[1].x, 624);

  // Poll aliveness every 200ms
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200);
    const a = await isAlive(`poll${i}`);
    const evs = await getEvents();
    for (const e of evs) console.log(`  ${e}`);
    if (a !== true) {
      console.log(`[probe] @${ms()}ms poll ${i}: ${a}`);
      // Once frozen/crashed, give up
      break;
    }
    // Check if round advanced
    const newPill = await getRoundPill();
    if (newPill !== pill) {
      console.log(`[probe] @${ms()}ms poll ${i}: round advanced to ${newPill}`);
      break;
    }
  }
  roundNum++;
}

console.log(`\n[probe] === EVENTS ===`);
for (const e of events) console.log(e);

await ctx.close();
await browser.close();
console.log("[probe] done");
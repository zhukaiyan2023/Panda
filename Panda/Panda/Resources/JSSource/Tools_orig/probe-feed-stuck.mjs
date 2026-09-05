// tools/probe-feed-stuck.mjs — full 3-round gameFeed probe with verbose
// logging. Runs with SKIP_TIMERS=1 (default) for speed.
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

const logs = [];
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.stack || err.message}`));
page.on("console", (msg) => {
  const t = msg.type();
  const txt = msg.text();
  if (t === "error") logs.push(`[console.error] ${txt}`);
  else if (t === "warning") logs.push(`[console.warn] ${txt}`);
  else if (txt.startsWith("[gameFeed]")) logs.push(`[page] ${txt}`);
});

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  const oAdd = HTMLMediaElement.prototype.addEventListener;
  HTMLMediaElement.prototype.addEventListener = function (t, l, oo) {
    if (t === "ended") {
      const s = (this.src || "").split("/").pop();
      window.__endedEvents = window.__endedEvents || [];
      window.__endedEvents.push({ id: s ? s.replace(/\.[^.]+$/, "") : "?", t: Math.round(performance.now()) });
    }
    return oAdd.call(this, t, l, oo);
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
await page.waitForTimeout(2000);

async function snapshot() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    let sceneName = null;
    try { sceneName = k.getSceneName(); } catch (_) {}
    let roundPillText = null;
    let equation = [];
    function walk(n, d) {
      if (!n || d > 18) return;
      if (n.children) for (const c of n.children) walk(c, d + 1);
      if (n.text) {
        const t = String(n.text);
        if (/第\s*\d+\s*轮/.test(t)) roundPillText = t;
      }
      if (n.slotCenters && n.slotCenters.length >= 5) {
        const out = [];
        function collect(x, dd) {
          if (!x || dd > 6) return;
          if (x.text != null) out.push(String(x.text));
          if (x.children) for (const c of n.children) collect(c, dd + 1);
        }
        collect(n, 0);
        equation = out.slice(0, n.slotCenters.length);
      }
    }
    walk(root, 0);
    const bubbles = [];
    const seenX = new Set();
    function findBubbles(n, d) {
      if (!n || d > 18) return;
      if (n.text != null && /^\d$/.test(String(n.text)) && n.pos
          && Math.abs(n.pos.y - 624) < 2 && !seenX.has(n.pos.x)) {
        seenX.add(n.pos.x);
        bubbles.push({ value: Number(n.text), x: n.pos.x, y: n.pos.y });
      }
      if (n.children) for (const c of n.children) findBubbles(c, d + 1);
    }
    findBubbles(root, 0);
    bubbles.sort((a, b) => a.x - b.x);
    return { sceneName, roundPillText, equation, bubbles };
  });
}

let roundNum = 1;
const MAX_ROUNDS = 6;
while (roundNum <= MAX_ROUNDS) {
  console.log(`\n[probe] === Round ${roundNum} ===`);
  await page.waitForTimeout(800);
  const before = await snapshot();
  console.log(`[probe] before: scene=${before.sceneName} pill=${before.roundPillText} eqn=${JSON.stringify(before.equation)} bubbles=${before.bubbles.length}`);
  if (!before.bubbles.length) {
    console.log(`[probe] *** No bubbles — stopping ***`);
    break;
  }
  const target = Number(before.equation[before.equation.length - 1]);
  if (!Number.isFinite(target)) {
    console.log(`[probe] *** Cannot read target: ${JSON.stringify(before.equation)} ***`);
    break;
  }
  const vals = before.bubbles.map((b) => b.value);
  let chosen = null;
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (vals[i] + vals[j] === target) {
        const a = before.bubbles[i];
        const b = before.bubbles[j];
        chosen = { ax: a.x, ay: a.y, bx: b.x, by: b.y, a: a.value, b: b.value };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) {
    console.log(`[probe] *** No pair sums to ${target} in ${JSON.stringify(vals)} ***`);
    break;
  }
  console.log(`[probe] clicking pair (${chosen.a},${chosen.b}) at (${chosen.ax},${chosen.ay}) & (${chosen.bx},${chosen.by})`);
  await page.mouse.click(chosen.ax, chosen.ay);
  await page.waitForTimeout(200);
  await page.mouse.click(chosen.bx, chosen.by);
  await page.waitForTimeout(SKIP_TIMERS ? 2500 : 13000);
  const after = await snapshot();
  console.log(`[probe] after:  scene=${after.sceneName} pill=${after.roundPillText} eqn=${JSON.stringify(after.equation)} bubbles=${after.bubbles.length}`);
  if (before.sceneName === after.sceneName && before.roundPillText === after.roundPillText && before.equation.join("|") === after.equation.join("|")) {
    console.log(`[probe] *** STUCK — pair accepted but state did not advance ***`);
    break;
  }
  roundNum++;
}

console.log("\n[probe] === LOGS ===");
for (const l of logs.slice(-40)) console.log(l);

await ctx.close();
await browser.close();
console.log("[probe] done");
console.log("\n[probe] === ALL LOGS ===");
for (const l of logs) console.log(l);
// tools/probe-feed-cpu.mjs — captures a CPU profile when the page hangs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

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
page.on("console", (msg) => {
  const t = msg.type();
  const txt = msg.text();
  if (t === "error") logs.push(`[console.error] ${txt}`);
  else if (txt.startsWith("[gameFeed]") || txt.startsWith("[pairScene]") || txt.startsWith("[trace]")) logs.push(`[page] ${txt}`);
});

// CDP session for CPU profiling
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.start", { samplingInterval: 1000 });

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  window.__logs = [];
  const origLog = console.log;
  console.log = function (...args) {
    if (typeof args[0] === "string" && (args[0].startsWith("[gameFeed]") || args[0].startsWith("[pairScene]") || args[0].startsWith("[trace]"))) {
      window.__logs.push(args.map(String).join(" "));
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
    return { sceneName, roundPillText, equation, bubbles, logs: window.__logs };
  });
}

let roundNum = 1;
const MAX_ROUNDS = 6;
let cpuProfileTaken = false;
while (roundNum <= MAX_ROUNDS) {
  console.log(`\n[probe] === Round ${roundNum} ===`);
  await page.waitForTimeout(800);
  const before = await snapshot();
  console.log(`[probe] before: scene=${before.sceneName} pill=${before.roundPillText} bubbles=${before.bubbles.length} logs=${before.logs.length}`);
  for (const l of before.logs) console.log(`  [log] ${l}`);
  before.logs.length = 0;

  if (!before.bubbles.length) break;
  const target = Number(before.equation[before.equation.length - 1]);
  if (!Number.isFinite(target)) break;
  const vals = before.bubbles.map((b) => b.value);
  let chosen = null;
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (vals[i] + vals[j] === target) {
        chosen = { ax: before.bubbles[i].x, ay: before.bubbles[i].y, bx: before.bubbles[j].x, by: before.bubbles[j].y, a: vals[i], b: vals[j] };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) break;
  console.log(`[probe] clicking pair (${chosen.a},${chosen.b}) at (${chosen.ax},${chosen.ay}) & (${chosen.bx},${chosen.by})`);
  await page.mouse.click(chosen.ax, chosen.ay);
  await page.waitForTimeout(200);
  await page.mouse.click(chosen.bx, chosen.by);
  // Use a polling snapshot with timeout to detect hang
  const afterPromise = (async () => {
    await page.waitForTimeout(2500);
    return snapshot();
  })();
  const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("snapshot-timeout")), 5000));
  let after;
  try {
    after = await Promise.race([afterPromise, timeoutPromise]);
    console.log(`[probe] after:  scene=${after.sceneName} pill=${after.roundPillText} bubbles=${after.bubbles.length} logs=${after.logs.length}`);
    for (const l of after.logs) console.log(`  [log] ${l}`);
    after.logs.length = 0;
  } catch (e) {
    console.log(`[probe] *** snapshot timed out — page is hung, taking CPU profile ***`);
    if (!cpuProfileTaken) {
      const profile = await cdp.send("Profiler.stop");
      writeFileSync("/tmp/feed-cpu-profile.cpuprofile", JSON.stringify(profile.profile));
      console.log(`[probe] saved CPU profile to /tmp/feed-cpu-profile.cpuprofile`);
      cpuProfileTaken = true;
    }
    break;
  }
  if (before.sceneName === after.sceneName && before.roundPillText === after.roundPillText && before.equation.join("|") === after.equation.join("|")) {
    console.log(`[probe] *** STUCK — pair accepted but state did not advance ***`);
    if (!cpuProfileTaken) {
      const profile = await cdp.send("Profiler.stop");
      writeFileSync("/tmp/feed-cpu-profile.cpuprofile", JSON.stringify(profile.profile));
      cpuProfileTaken = true;
    }
    break;
  }
  roundNum++;
}

console.log("\n[probe] === ALL LOGS ===");
for (const l of logs) console.log(l);
await ctx.close();
await browser.close();
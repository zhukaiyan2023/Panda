// tools/probe-min.mjs — minimal probe to capture full page lifecycle
// from gameFeed round 2 (ri=1) completion through whatever happens next.
import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const SKIP_TIMERS = process.env.SKIP_TIMERS !== "0";
console.log(`[probe] SKIP_TIMERS=${SKIP_TIMERS}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await ctx.newPage();

// Capture everything — every console message and every pageerror.
const allMsgs = [];
page.on("console", (msg) => {
  allMsgs.push({ t: Date.now(), kind: "console", type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  allMsgs.push({ t: Date.now(), kind: "pageerror", msg: err.stack || err.message });
});
page.on("crash", () => allMsgs.push({ t: Date.now(), kind: "crash", msg: "page crashed" }));
page.on("close", () => allMsgs.push({ t: Date.now(), kind: "close", msg: "page closed" }));

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
}, SKIP_TIMERS);

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(500);

await page.evaluate(() => {
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 }),
  );
  window.kaplay.go("gameFeed");
});

await page.waitForTimeout(800);

async function snapshot(label) {
  try {
    const r = await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      let sceneName = null;
      try { sceneName = k.getSceneName(); } catch (_) {}
      let pill = null;
      function walk(n, d) {
        if (!n || d > 18) return;
        if (n.text != null && /第\s*\d+\s*轮/.test(String(n.text))) pill = String(n.text);
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      const bubbles = [];
      const seenX = new Set();
      function findBubbles(n, d) {
        if (!n || d > 18) return;
        if (n.text != null && /^\d$/.test(String(n.text)) && n.pos
            && Math.abs(n.pos.y - 624) < 2 && !seenX.has(n.pos.x)) {
          seenX.add(n.pos.x);
          bubbles.push({ value: Number(n.text), x: n.pos.x });
        }
        if (n.children) for (const c of n.children) findBubbles(c, d + 1);
      }
      findBubbles(root, 0);
      bubbles.sort((a, b) => a.x - b.x);
      return { sceneName, pill, bubbles };
    });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

const t0 = Date.now();
function ms() { return Date.now() - t0; }

// Find a valid pair from current round and click it
async function playOneRound(roundNum) {
  const before = await snapshot(`round${roundNum}-before`);
  if (!before.ok) { console.log(`[probe] @${ms()}ms page dead at ${roundNum}`); return false; }
  console.log(`[probe] @${ms()}ms round ${roundNum}: scene=${before.sceneName} pill=${before.pill} bubbles=[${before.bubbles.map(b=>b.value).join(",")}]`);
  if (before.bubbles.length === 0) { console.log(`[probe] no bubbles`); return false; }

  // Read target from equation
  const target = await page.evaluate(() => {
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
  console.log(`[probe] @${ms()}ms target=${target}`);

  // Find pair
  const vals = before.bubbles.map(b => b.value);
  let pair = null;
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (vals[i] + vals[j] === Number(target)) {
        pair = [before.bubbles[i], before.bubbles[j]];
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) { console.log(`[probe] no pair sums to ${target} in ${JSON.stringify(vals)}`); return false; }

  console.log(`[probe] @${ms()}ms click 1 at (${pair[0].x}, 624)`);
  await page.mouse.click(pair[0].x, 624);
  await page.waitForTimeout(100);
  console.log(`[probe] @${ms()}ms click 2 at (${pair[1].x}, 624)`);
  await page.mouse.click(pair[1].x, 624);
  return true;
}

// Play 3 rounds (each pair is one pick; the game has 3 pairs per round)
let roundNum = 1;
while (roundNum <= 3) {
  console.log(`\n[probe] === ROUND ${roundNum} ===`);
  const ok = await playOneRound(roundNum);
  if (!ok) break;
  // Wait between rounds
  await page.waitForTimeout(SKIP_TIMERS ? 800 : 5000);
  roundNum++;
}

console.log(`\n[probe] === FINAL SNAPSHOT @${ms()}ms ===`);
console.log(JSON.stringify(await snapshot("final"), null, 2));

console.log(`\n[probe] === ALL MESSAGES ===`);
for (const m of allMsgs) {
  console.log(`[probe] @${m.t - t0}ms ${m.kind} ${m.type || ""} ${m.msg || m.text}`);
}

await ctx.close();
await browser.close();
console.log("[probe] done");
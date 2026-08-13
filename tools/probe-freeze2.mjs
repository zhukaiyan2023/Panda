// tools/probe-freeze2.mjs — surgical probe with full error capture
// focused on round 2 → round 3 transition
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

// Capture EVERYTHING
const all = [];
page.on("console", (msg) => all.push({ t: Date.now(), k: "console", type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => all.push({ t: Date.now(), k: "pageerror", msg: (err.stack || err.message || String(err)) }));
page.on("crash", () => all.push({ t: Date.now(), k: "crash", msg: "page crashed" }));
page.on("close", () => all.push({ t: Date.now(), k: "close", msg: "page closed" }));

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  // Catch uncaught errors explicitly
  window.addEventListener("error", (e) => {
    window.__lastErr = `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`;
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__lastRej = `${e.reason?.message || e.reason}`;
  });
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

const t0 = Date.now();
function ms() { return Date.now() - t0; }
function log(...a) { console.log(`[probe] @${ms()}ms`, ...a); }

// Play 2 rounds with full pair coverage
async function playFullRound(roundNum, nPairs) {
  log(`\n=== ROUND ${roundNum} (need ${nPairs} pairs) ===`);
  for (let p = 0; p < nPairs; p++) {
    log(`pair ${p+1}/${nPairs}`);
    // Get bubbles
    let bubbles = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        bubbles = await page.evaluate(() => {
          const k = window.kaplay;
          const root = k.getTreeRoot();
          const out = [];
          const seenX = new Set();
          function walk(n, d) {
            if (!n || d > 18) return;
            if (n.text != null && /^\d$/.test(String(n.text)) && n.pos
                && Math.abs(n.pos.y - 624) < 2 && !seenX.has(n.pos.x)) {
              seenX.add(n.pos.x);
              out.push({ value: Number(n.text), x: n.pos.x });
            }
            if (n.children) for (const c of n.children) walk(c, d + 1);
          }
          walk(root, 0);
          out.sort((a, b) => a.x - b.x);
          return out;
        });
        break;
      } catch (e) { log(`snapshot attempt ${attempt} failed: ${e.message}`); await page.waitForTimeout(200); }
    }
    if (!bubbles || bubbles.length < 2) { log(`no bubbles, abort`); return false; }
    log(`  bubbles: [${bubbles.map(b=>b.value).join(",")}]`);

    // Get target
    let target = null;
    try {
      target = await page.evaluate(() => {
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
    } catch (e) { log(`target snapshot failed: ${e.message}`); return false; }
    log(`  target: ${target}`);

    // Find pair
    const vals = bubbles.map(b => b.value);
    let pair = null;
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        if (vals[i] + vals[j] === Number(target)) {
          pair = [bubbles[i], bubbles[j]];
          break;
        }
      }
      if (pair) break;
    }
    if (!pair) { log(`  no pair sums to ${target}, abort`); return false; }
    log(`  clicking (${pair[0].value}, ${pair[1].value}) at (${pair[0].x}, 624) & (${pair[1].x}, 624)`);

    try {
      await page.mouse.click(pair[0].x, 624, { timeout: 3000 });
    } catch (e) { log(`  click 1 failed: ${e.message}`); return false; }
    await page.waitForTimeout(80);
    try {
      await page.mouse.click(pair[1].x, 624, { timeout: 3000 });
    } catch (e) { log(`  click 2 failed: ${e.message}`); return false; }
    await page.waitForTimeout(SKIP_TIMERS ? 400 : 3000);
  }
  return true;
}

// Round 1: 3 pairs (3 bubbles → 5 → 1 pair, then with new bubbles 3 more)
const ok1 = await playFullRound(1, 3);
log(`round 1 done: ${ok1}`);
if (!ok1) { await browser.close(); process.exit(1); }

await page.waitForTimeout(SKIP_TIMERS ? 200 : 2000);

const ok2 = await playFullRound(2, 3);
log(`round 2 done: ${ok2}`);
if (!ok2) { await browser.close(); process.exit(1); }

log(`\n=== waiting for round 3 ===`);
await page.waitForTimeout(SKIP_TIMERS ? 800 : 5000);

try {
  const final = await page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    let pill = null;
    function walk(n, d) {
      if (!n || d > 18) return;
      if (n.text != null && /第\s*\d+\s*轮/.test(String(n.text))) pill = String(n.text);
      if (n.children) for (const c of n.children) walk(c, d + 1);
    }
    walk(root, 0);
    return { pill, lastErr: window.__lastErr, lastRej: window.__lastRej };
  });
  log(`final: ${JSON.stringify(final)}`);
} catch (e) { log(`final snapshot failed: ${e.message}`); }

log(`\n=== ALL MESSAGES (${all.length}) ===`);
for (const m of all) log(`${m.t - t0}ms ${m.k} ${m.type || ""} ${m.msg || m.text}`);

await ctx.close();
await browser.close();
log("done");
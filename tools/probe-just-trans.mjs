import { chromium } from "playwright";
const URL = process.env.PANDA_URL || "http://localhost:8126/";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true });
const page = await ctx.newPage();
const all = [];
page.on("console", (m) => all.push({ t: Date.now(), k: "console", type: m.type(), text: m.text() }));
page.on("pageerror", (err) => all.push({ t: Date.now(), k: "pageerror", msg: (err.stack || err.message || String(err)) }));
page.on("close", () => all.push({ t: Date.now(), k: "close", msg: "page closed" }));

// Run with ONLY __trace_no_transition = true (others default = false)
await page.addInitScript(() => {
  window.__skipTimers = true;
  window.__trace_no_transition = true;
});
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(500);
await page.evaluate(() => {
  localStorage.setItem("panda-save-v1", JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 }));
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(800);

const t0 = Date.now();
function ms() { return Date.now() - t0; }
function log(...a) { console.log(`[probe] @${ms()}ms`, ...a); }

async function playOneRound(roundNum) {
  log(`=== ROUND ${roundNum} ===`);
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
          if (n.text != null && /^\d$/.test(String(n.text)) && n.pos && Math.abs(n.pos.y - 624) < 2 && !seenX.has(n.pos.x)) {
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
    } catch (e) { log(`snapshot failed: ${e.message}`); await page.waitForTimeout(200); }
  }
  if (!bubbles || bubbles.length < 2) return false;
  log(`bubbles: [${bubbles.map(b=>b.value).join(",")}]`);
  let target = null;
  try {
    target = await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      let last = null;
      function walk(n, d) {
        if (!n || d > 12) return;
        if (n.slotCenters && n.slotCenters.length >= 5) {
          function collect(x, dd) { if (!x || dd > 6) return; if (x.text != null) last = String(x.text); if (x.children) for (const c of n.children) collect(c, dd + 1); }
          collect(n, 0);
        }
        if (n.children) for (const c of n.children) walk(c, d + 1);
      }
      walk(root, 0);
      return last;
    });
  } catch (e) { return false; }
  const vals = bubbles.map(b => b.value);
  let pair = null;
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) if (vals[i] + vals[j] === Number(target)) { pair = [bubbles[i], bubbles[j]]; break; }
  if (!pair) return false;
  log(`click (${pair[0].value}, ${pair[1].value})`);
  try { await page.mouse.click(pair[0].x, 624, { timeout: 3000 }); } catch (e) { return false; }
  await page.waitForTimeout(80);
  try { await page.mouse.click(pair[1].x, 624, { timeout: 3000 }); } catch (e) { return false; }
  await page.waitForTimeout(500);
  return true;
}

for (let r = 1; r <= 3; r++) {
  const ok = await playOneRound(r);
  if (!ok) { log(`aborted at round ${r}`); break; }
  await page.waitForTimeout(300);
}
log(`=== probe complete, page should be alive ===`);
await page.waitForTimeout(500);
log(`=== ALL MESSAGES ===`);
for (const m of all) log(`${m.t - t0}ms ${m.k} ${m.type || ""} ${m.msg || m.text}`);
await ctx.close();
await browser.close();
log("done");

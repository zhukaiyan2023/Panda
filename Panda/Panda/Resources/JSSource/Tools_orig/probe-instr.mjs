// tools/probe-instr.mjs — runs gameFeed and instruments the page to
// trace every step of the round transition. Uses page.evaluate to
// monkey-patch kaplay methods so we see exactly which call hangs.
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

const pageEvents = [];
page.on("pageerror", (err) => pageEvents.push(`[pageerror] ${err.message}`));
page.on("console", (msg) => {
  const t = msg.type();
  const txt = msg.text();
  if (txt.startsWith("[probe-instr]") || txt.startsWith("[gameFeed]") || txt.startsWith("[pairScene]") || t === "error") {
    pageEvents.push(`[${t}] ${txt}`);
  }
});

await page.addInitScript((skipTimers) => {
  window.__skipTimers = skipTimers;
  window.__probeEvents = [];
  const log = (msg) => { window.__probeEvents.push(`[probe-instr] ${msg}`); console.log(`[probe-instr] ${msg}`); };
  // Wait until kaplay is loaded
  const ready = setInterval(() => {
    if (window.kaplay && window.PandaAudio) {
      clearInterval(ready);
      log("kaplay ready");
      const k = window.kaplay;
      // Patch k.go to log every transition
      const _origGo = k.go.bind(k);
      k.go = (name) => {
        log(`k.go("${name}") called`);
        window.PandaAudio.stopAllAudio();
        const r = _origGo(name);
        log(`k.go("${name}") returned`);
        return r;
      };
      // Patch k.tween to log first call after a mark
      window.__tweenMark = 0;
      const _origTween = k.tween.bind(k);
      k.tween = function(...args) {
        if (window.__tweenMark) {
          log(`k.tween called (mark=${window.__tweenMark}, args len=${args.length})`);
        }
        return _origTween(...args);
      };
      // Patch k.wait to log
      const _origWait = k.wait.bind(k);
      k.wait = function(...args) {
        if (window.__tweenMark) {
          log(`k.wait called (delay=${args[0]})`);
        }
        return _origWait(...args);
      };
      // Patch playAfter to log
      const _origPlayAfter = window.PandaAudio.playAfter;
      window.PandaAudio.playAfter = function(refId, ids, opts, cb) {
        if (window.__tweenMark) {
          log(`playAfter(refId=${refId}, ids=${JSON.stringify(ids)})`);
        }
        return _origPlayAfter.call(this, refId, ids, opts, cb);
      };
    }
  }, 50);
}, SKIP_TIMERS);

await page.goto(URL, { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(2500);

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

await page.evaluate(() => {
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, unlockedGame: 5, starsByGame: {}, currentLevel: 1 }),
  );
  window.kaplay.go("gameFeed");
});
await page.waitForTimeout(1500);

for (let roundNum = 1; roundNum <= 4; roundNum++) {
  console.log(`\n[probe] === Round ${roundNum} @${ms()}ms ===`);
  await page.waitForTimeout(500);
  const bubbles = await getBubbles();
  if (!bubbles) { console.log(`[probe] no bubbles — abort`); break; }
  const target = Number(await getTarget());
  console.log(`[probe] @${ms()}ms bubbles=${bubbles.map(b=>b.value).join(",")} target=${target}`);

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
  if (!pair) { console.log(`[probe] no pair — abort`); break; }
  console.log(`[probe] clicking (${pair[0].value},${pair[1].value})`);
  // Mark the next round's tweens/wait calls so we see them in logs
  await page.evaluate((rn) => { window.__tweenMark = `round${rn}_click`; }, roundNum);
  await page.mouse.click(pair[0].x, 624);
  await page.waitForTimeout(150);
  await page.mouse.click(pair[1].x, 624);

  // Poll for round advance
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(200);
    const alive = await Promise.race([
      page.evaluate(() => "alive"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("frozen")), 1000)),
    ]).catch((e) => e.message);
    const newPill = await page.evaluate(() => {
      try {
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
      } catch (_) { return null; }
    });
    if (alive !== "alive") {
      console.log(`[probe] @${ms()}ms poll ${i}: ${alive}`);
      break;
    }
    if (newPill && newPill !== `第 ${roundNum} 轮 / 共 3 轮`) {
      console.log(`[probe] @${ms()}ms round advanced to ${newPill}`);
      break;
    }
  }
}

console.log("\n[probe] === ALL EVENTS ===");
for (const e of pageEvents) console.log(e);

await ctx.close();
await browser.close();
console.log("[probe] done");
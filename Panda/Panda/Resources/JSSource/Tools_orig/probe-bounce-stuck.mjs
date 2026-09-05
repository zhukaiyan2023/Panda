// tools/probe-bounce-stuck.mjs — round-by-round gameBounce probe with
// correctly alternating balloon y positions.
import { chromium } from "playwright";
const SCENE = process.argv[2] || "gameBounce";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const logs = [];
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.stack || err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") logs.push(`[console.error] ${msg.text()}`); });

await page.addInitScript(() => {
  window.__audio = [];
  const o = HTMLMediaElement.prototype.addEventListener;
  HTMLMediaElement.prototype.addEventListener = function (t, l, oo) {
    if (t === "ended" || t === "play" || t === "error") {
      const s = (this.src || "").split("/").pop();
      window.__audio.push({ type: t, id: s ? s.replace(/\.[^.]+$/, "") : "?", t: Math.round(performance.now()) });
    }
    return o.call(this, t, l, oo);
  };
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const s = (this.src || "").split("/").pop();
    window.__audio.push({ type: "play()", id: s ? s.replace(/\.[^.]+$/, "") : "?", t: Math.round(performance.now()) });
    return op.call(this);
  };
});

await page.goto("http://localhost:8126/", { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(800);
await page.evaluate((s) => window.kaplay.go(s), SCENE);
await page.waitForTimeout(1500);

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
          if (x.children) for (const c of x.children) collect(c, dd + 1);
        }
        collect(n, 0);
        equation = out.slice(0, n.slotCenters.length);
      }
    }
    walk(root, 0);
    return { sceneName, roundPillText, equation };
  });
}

// gameBounce balloons at y=750 (even cols) / y=650 (odd cols).
const coords = SCENE === "gameBounce"
  ? [[448, 750], [648, 650], [848, 750], [1048, 650]]
  : [[298, 640], [598, 640], [898, 640], [1198, 640]];

let initial = await snapshot();
console.log("Initial:", initial);

let roundNum = 1;
const MAX_ROUNDS = 6;
while (roundNum <= MAX_ROUNDS) {
  let advanced = false;
  for (let i = 0; i < coords.length; i++) {
    const [x, y] = coords[i];
    const before = await snapshot();
    await page.mouse.click(x, y);
    await page.waitForTimeout(1500);
    const after = await snapshot();
    const changed = (before.sceneName !== after.sceneName)
      || (before.roundPillText !== after.roundPillText)
      || (before.equation.join("|") !== after.equation.join("|"));
    if (changed) {
      console.log(`Round ${roundNum} tap ${i} at (${x},${y}): state changed`);
      console.log("  before:", before);
      console.log("  after :", after);
      advanced = true;
      break;
    }
  }
  if (!advanced) {
    console.log(`\n*** Round ${roundNum}: STUCK after all 4 taps ***`);
    console.log(JSON.stringify(await snapshot(), null, 2));
    break;
  }
  const s = await snapshot();
  if (s.sceneName && s.sceneName !== SCENE) {
    console.log(`\nLeft ${SCENE} -> ${s.sceneName} after round ${roundNum}`);
    break;
  }
  roundNum++;
}

console.log("\n=== LOGS ===");
for (const l of logs.slice(-20)) console.log(l);
console.log("\n=== AUDIO (last 40) ===");
const all = await page.evaluate(() => window.__audio);
for (const e of all.slice(-40)) console.log(JSON.stringify(e));

await ctx.close();
await browser.close();

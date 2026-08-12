// tools/probe-cloud-e2e.mjs — boot gameCloud in the browser and verify
// every generated round's three addends contain at least one pair summing
// to exactly 10 (for make10 rounds) or no pair summing to 10 (for
// makeSmall rounds). Reads equation only — does not tap to advance.

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.stack || err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
});

let roundsRead = 0;
let make10Count = 0, makeSmallCount = 0;
let make10Bad = 0, makeSmallBad = 0;
const make10Samples = [];
const makeSmallSamples = [];

async function readRound() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    // Find expression: 7-slotCenters node (a, +, b, +, c, =, ?).
    let addends = null;
    let hint = null;
    function walk(node, depth) {
      if (!node || depth > 14) return;
      if (node.slotCenters && node.slotCenters.length === 7) {
        const texts = [];
        function collect(n, out, d) {
          if (!n || d > 6) return;
          if (n.text != null) out.push(String(n.text));
          if (n.children) for (const c of n.children) collect(c, out, d + 1);
        }
        collect(node, texts, 0);
        const digits = texts.filter((t) => /^[0-9]$/.test(t));
        if (digits.length >= 3) addends = digits.slice(0, 3);
      }
      if (node.text && /哪个云朵是对的/.test(String(node.text))) {
        hint = String(node.text);
      }
      if (node.children) for (const c of node.children) walk(c, depth + 1);
    }
    walk(root, 0);
    if (!addends || !hint) return null;
    const type = hint.includes("凑十") ? "make10" : "makeSmall";
    return { type, addends: addends.map(Number) };
  });
}

async function loadSession() {
  await page.goto("http://localhost:8126/", { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.kaplay.go("gameCloud"));
  await page.waitForTimeout(800);
}

const N_SESSIONS = 30;
for (let s = 0; s < N_SESSIONS; s++) {
  await loadSession();
  for (let r = 0; r < 5; r++) {
    const round = await readRound();
    if (!round) {
      errors.push(`session=${s} round=${r}: readRound returned null`);
      continue;
    }
    roundsRead++;
    const { type, addends } = round;
    const [a, b, c] = addends;
    const sums = [a + b, a + c, b + c];
    if (type === "make10") {
      make10Count++;
      const ok = sums.some((v) => v === 10);
      if (!ok) {
        make10Bad++;
        errors.push(`make10 BAD: ${a}+${b}+${c} pair-sums=${JSON.stringify(sums)}`);
      }
      if (make10Samples.length < 8) make10Samples.push({ addends, sums });
    } else {
      makeSmallCount++;
      const ok = !sums.some((v) => v === 10);
      if (!ok) {
        makeSmallBad++;
        errors.push(`makeSmall BAD: ${a}+${b}+${c} pair-sums=${JSON.stringify(sums)}`);
      }
      if (makeSmallSamples.length < 8) makeSmallSamples.push({ addends, sums });
    }
    // Tap the leftmost cloud to advance. Use the scene's pickerItem by
    // finding any area() node whose worldPos.y is in the cloud row band.
    const taps = await page.evaluate(() => {
      const k = window.kaplay;
      const root = k.getTreeRoot();
      const out = [];
      function walk(node, depth) {
        if (!node || depth > 14) return;
        if (node.children) for (const c of node.children) walk(c, depth + 1);
        if (node.area && typeof node.worldPos === "function") {
          const wp = node.worldPos();
          out.push({ x: wp.x, y: wp.y });
        }
      }
      walk(root, 0);
      return out.filter((t) => t.y > 550 && t.y < 800).sort((a, b) => a.x - b.x);
    });
    if (taps.length >= 1) {
      await page.mouse.click(taps[0].x, taps[0].y);
      await page.waitForTimeout(900);
    }
  }
}

console.log(`Rounds read: ${roundsRead}`);
console.log(`make10: ${make10Count}, bad: ${make10Bad}`);
console.log(`makeSmall: ${makeSmallCount}, bad: ${makeSmallBad}`);
console.log(`\nmake10 samples (must have a pair summing to 10):`);
for (const s of make10Samples) console.log(`  ${s.addends.join("+")}=${s.addends[0]+s.addends[1]+s.addends[2]}  pair-sums=${JSON.stringify(s.sums)}`);
console.log(`\nmakeSmall samples (must have NO pair summing to 10):`);
for (const s of makeSmallSamples) console.log(`  ${s.addends.join("+")}=${s.addends[0]+s.addends[1]+s.addends[2]}  pair-sums=${JSON.stringify(s.sums)}`);

if (errors.length > 0) {
  console.log(`\nFirst 10 errors:`);
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
  console.log(`... total ${errors.length} errors`);
}

await ctx.close();
await browser.close();

if (make10Bad > 0 || makeSmallBad > 0) {
  console.log(`\nFAIL: ${make10Bad + makeSmallBad} bad rounds`);
  process.exit(1);
}
console.log(`\nAll ${roundsRead} rendered rounds pass invariants. ✓`);
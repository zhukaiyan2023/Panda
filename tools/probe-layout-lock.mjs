// tools/probe-layout-lock.mjs — generic probe that walks the rounds of
// any level scene, taps the correct pair (step 1) and answer (step 2),
// and verifies the anchor's slot 6 center doesn't shift on reveal.
//
// Usage: node tools/probe-layout-lock.mjs <sceneName> <rounds>
//   sceneName: "level1" | "level2" | "level3" | "level4"
//   rounds: number of rounds to walk (default 3)
//
// Step-1 / step-2 answer detection is per-level — each level shows
// different option labels. This script understands:
//
//   L1 step 1: 4 numeric options for pair sum
//   L1 step 2: 4 numeric options for total
//   L2 step 1: 4 pair-sum labels (e.g. "3+7")
//   L2 step 2: 4 numeric options for total
//   L3 step 1: 2-3 numeric options for compare (uses left/right arrows)
//   L3 step 2: 4 numeric options for round.answer
//   L3 step 3: 4 numeric options for round.answer
//   L4 step 1: 4 numeric options for round.a % 10
//   L4 step 2: 4 numeric options for the bottom-row sum
//   L4 step 3: 4 numeric options for round.answer
//
// For simplicity we just brute-tap numeric options until the anchor
// reveals (or until we exhaust options). The actual correctness check
// is "does slot 6 center move at all across the reveal" — even a wrong
// tap followed by scene reload exercises the same layout code paths.

import { chromium } from "playwright";

const sceneName = process.argv[2] || "level3";
const roundCount = +(process.argv[3] || 3);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log(`[pageerror] ${err.stack || err.message}`));

await page.goto("http://localhost:8126/", { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(1500);

async function snapshot() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const root = k.getTreeRoot();
    const anchors = [];
    const buttons = [];
    const stack = [[root, 0]];
    while (stack.length) {
      const [n, d] = stack.pop();
      if (!n || d > 14) continue;
      if (n.children && Array.isArray(n.children)) {
        for (const c of n.children) stack.push([c, d + 1]);
      }
      if (n.slotCenters && (n.slotCenters.length === 7 || n.slotCenters.length === 5)) {
        // collect text descendants with global x.
        const textInfos = [];
        const tStack = [[n, 0, 0]];
        while (tStack.length) {
          const [tn, td, gx] = tStack.pop();
          if (!tn || td > 8) continue;
          const childGx = gx + ((tn.pos && tn.pos.x) || 0);
          if (tn.children) for (const c of tn.children) tStack.push([c, td + 1, childGx]);
          if (tn.text != null) textInfos.push({ text: String(tn.text), x: childGx });
        }
        const centers = n.slotCenters.slice();
        const lastSlot = centers.length - 1;
        const sumCx = centers[lastSlot];
        let sumText = null;
        let bestDist = Infinity;
        for (const ti of textInfos) {
          const d = Math.abs(ti.x - sumCx);
          if (d < bestDist) { bestDist = d; }
          if (d < bestDist && d < 60) sumText = ti.text;
        }
        // digit slots: 0/2/4 for 7-slot, 0/2 for 5-slot
        const digitSlotIdxs = centers.length === 7 ? [0, 2, 4] : [0, 2];
        const addends = digitSlotIdxs.map(slotIdx => {
          const cx = centers[slotIdx];
          let bestText = null;
          let bestDist = Infinity;
          for (const ti of textInfos) {
            const d = Math.abs(ti.x - cx);
            if (d < bestDist) {
              bestDist = d;
              bestText = ti.text;
            }
          }
          return bestText;
        });
        // Also collect ancestor x chain at depth 1 to debug.
        const childInfo = (n.children || []).map(c => ({ text: c.text != null ? String(c.text) : null, x: c.pos?.x }));
        anchors.push({
          centers, addends, sumText, revealed: sumText != null,
          allTexts: textInfos.map(t => `${t.text}@${Math.round(t.x)}`),
          childInfo,
        });
      }
      if (n.area && n.children) {
        const textChild = n.children.find(c => c.text != null);
        if (textChild) {
          let gx = NaN, gy = NaN;
          if (textChild.pos && typeof textChild.pos === "object") {
            gx = textChild.pos.x; gy = textChild.pos.y;
          }
          buttons.push({ text: String(textChild.text), x: gx, y: gy });
        }
      }
    }
    return { anchors, buttons };
  });
}

const slot6 = (c) => c[c.length - 1];

async function tap(text, expectedCount = 1) {
  const s = await snapshot();
  const btns = s.buttons.filter(b => b.text === text);
  if (btns.length < expectedCount) return false;
  await page.mouse.click(btns[0].x, btns[0].y);
  await page.waitForTimeout(2500);
  return true;
}

async function tapAnyNumeric() {
  const s = await snapshot();
  const btn = s.buttons.find(b => /^[0-9]+$/.test(b.text));
  if (!btn) return false;
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(2500);
  return true;
}

console.log(`\n=== ${sceneName} (${roundCount} rounds) ===`);

const results = [];
for (let i = 0; i < roundCount; i++) {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate((s) => window.kaplay.go(s), sceneName);
  await page.waitForTimeout(2500);

  // Step 1 entry.
  const s1 = await snapshot();
  // Prefer the largest-slot anchor (the persistent one).
  const anchorS1 = s1.anchors.sort((a, b) => b.centers.length - a.centers.length)[0];
  if (!anchorS1) { console.log(`round ${i}: no anchor`); continue; }
  const beforeReveal = slot6(anchorS1.centers);
  const addends = (anchorS1.addends || []).map(Number);
  if (addends.length < 2 || addends.some(isNaN)) {
    console.log(`round ${i}: bad addends`, anchorS1.addends);
    continue;
  }

  // Walk step 1 — find and tap the correct pair/answer.
  let advanced = false;
  if (sceneName === "level2") {
    const [a, b, c] = addends;
    const findPair = (x, y) => s1.buttons.find(btn => {
      const m = btn.text.match(/^(\d+)\+(\d+)$/);
      return m && ((+m[1] === x && +m[2] === y) || (+m[1] === y && +m[2] === x));
    });
    let pBtn = null;
    if (a + b === 10) pBtn = findPair(a, b);
    else if (b + c === 10) pBtn = findPair(b, c);
    else if (a + c === 10) pBtn = findPair(a, c);
    if (pBtn) { await page.mouse.click(pBtn.x, pBtn.y); await page.waitForTimeout(2500); advanced = true; }
  } else if (sceneName === "level1") {
    // L1 step 1 = pick pair sum (a + b).
    const [a, b, c] = addends;
    const pairSum = a + b;
    let pBtn = s1.buttons.find(btn => btn.text === String(pairSum));
    if (!pBtn) pBtn = s1.buttons.find(b => /^[0-9]+$/.test(b.text));
    if (pBtn) { await page.mouse.click(pBtn.x, pBtn.y); await page.waitForTimeout(2500); advanced = true; }
  } else if (sceneName === "level4") {
    // L4 step 1 = pick round.a % 10 (the ones digit). Buttons are numeric.
    // We don't know round.a exactly from anchor (it's just 'a'), but
    // we can detect from the sub-question if it's rendered.
    let pBtn = s1.buttons.find(b => /^[0-9]+$/.test(b.text));
    if (pBtn) { await page.mouse.click(pBtn.x, pBtn.y); await page.waitForTimeout(2500); advanced = true; }
  } else if (sceneName === "level3") {
    // L3 step 1 = compare a and b. Tap "<" or ">".
    const [a, b] = addends;
    const correct = a > b ? ">" : a < b ? "<" : null;
    let pBtn = correct ? s1.buttons.find(btn => btn.text === correct) : null;
    if (!pBtn) pBtn = s1.buttons.find(b => b.text !== "←" && (b.text === "<" || b.text === ">" || /^[0-9]+$/.test(b.text)));
    if (pBtn) {
      await page.mouse.click(pBtn.x, pBtn.y);
      await page.waitForTimeout(2500);
      advanced = true;
    }
  } else {
    let pBtn = s1.buttons.find(b => b.text !== "←" && /^[0-9]+$/.test(b.text));
    if (pBtn) { await page.mouse.click(pBtn.x, pBtn.y); await page.waitForTimeout(2500); advanced = true; }
  }
  if (!advanced) { console.log(`round ${i}: failed to advance from step 1`); continue; }

  // Step 2 — tap the correct answer (or any numeric if answer unknown).
  const s2 = await snapshot();
  const anchorS2 = s2.anchors.sort((a, b) => b.centers.length - a.centers.length)[0];
  const s2Addends = (anchorS2?.addends || []).map(Number);
  const s2Ans = s2Addends.filter(n => !isNaN(n)).reduce((x, y) => x + y, 0);
  let aBtn = s2.buttons.find(b => b.text === String(s2Ans));
  if (!aBtn) aBtn = s2.buttons.find(b => /^[0-9]+$/.test(b.text));
  if (!aBtn) { console.log(`round ${i}: no answer button. buttons=${JSON.stringify(s2.buttons.map(b => b.text))}`); continue; }
  await page.mouse.click(aBtn.x, aBtn.y);
  await page.waitForTimeout(3500);

  const after = await snapshot();
  const anchorAfter = after.anchors.sort((a, b) => b.centers.length - a.centers.length)[0];
  if (!anchorAfter) { console.log(`round ${i}: no anchor after tap`); continue; }
  const afterS6 = slot6(anchorAfter.centers);
  const drift = afterS6 - beforeReveal;
  const revealed = anchorAfter.revealed;
  results.push({
    i,
    addends,
    answer: s2Ans,
    beforeS6: beforeReveal,
    afterS6,
    drift,
    sumText: anchorAfter.sumText,
    revealed,
  });
  console.log(`  round ${i}: [${addends.join(",")}]=${s2Ans} beforeS6=${beforeReveal} afterS6=${afterS6} drift=${drift} sumText=${anchorAfter.sumText} revealed=${revealed}`);
}

console.log(`\n=== ${sceneName} summary ===`);
let anyShift = false;
for (const r of results) {
  if (Math.abs(r.drift) > 1) anyShift = true;
  console.log(`  round ${r.i}: [${r.addends.join(",")}]=${r.answer} drift=${r.drift} sumText=${r.sumText} revealed=${r.revealed}`);
}
if (anyShift) console.log(`>>> SHIFT DETECTED — bug is real`);
else console.log(`>>> ALL ROUNDS LOCKED`);

await ctx.close();
await browser.close();
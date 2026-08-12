// tools/probe-l2-anchor.mjs — load L2, click through step 1 → step 2,
// capture the anchor's slotCenters across the reveal. Verify slot 6
// (the sum slot) doesn't shift when "?" reveals to a 2-digit answer.

import { chromium } from "playwright";

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
await page.evaluate(() => window.kaplay.go("level2"));
await page.waitForTimeout(2500);

// Snapshot helper — single round-trip.
async function snapshot(label) {
  return page.evaluate(({ label }) => {
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
      if (n.slotCenters && n.slotCenters.length === 7) {
        // Walk all descendants, collect each text node with its
        // absolute x (sum of ancestor pos.x values).
        const textInfos = [];
        const stack = [[n, 0, 0]];
        while (stack.length) {
          const [tn, td, gx] = stack.pop();
          if (!tn || td > 8) continue;
          const childGx = gx + ((tn.pos && tn.pos.x) || 0);
          if (tn.children) for (const c of tn.children) stack.push([c, td + 1, childGx]);
          if (tn.text != null) textInfos.push({ text: String(tn.text), x: childGx });
        }
        const centers = n.slotCenters.slice();
        // Slot 6 is at centers[6] — if there's a text descendant within
        // ~half its slotSize (~size/2 = ~50px), the slot is a digit
        // (revealed). Otherwise it's still a sprite (box / "?").
        const sumCx = centers[6];
        const sumText = (() => {
          let best = null, bestDist = Infinity;
          for (const ti of textInfos) {
            const d = Math.abs(ti.x - sumCx);
            if (d < bestDist) { bestDist = d; best = ti; }
          }
          return best && bestDist < 60 ? best.text : null;
        })();
        // Digit slots are 0/2/4 → match their respective texts.
        const slotTexts = [centers[0], centers[2], centers[4]].map(cx => {
          let best = null, bestDist = Infinity;
          for (const ti of textInfos) {
            const d = Math.abs(ti.x - cx);
            if (d < bestDist) { bestDist = d; best = ti; }
          }
          return best ? best.text : null;
        });
        anchors.push({
          centers: n.slotCenters.slice(),
          addends: slotTexts,
          sumText,
          isRevealed: sumText != null,
          allTexts: textInfos.map(t => `${t.text}@${Math.round(t.x)}`),
        });
      }
      if (n.area && n.children) {
        const textChild = n.children.find(c => c.text != null);
        if (textChild) {
          // In this kaplay setup, button's pos is 0,0 but the text
          // child's pos holds the absolute canvas position. Use it.
          let gx = NaN, gy = NaN;
          if (textChild.pos && typeof textChild.pos === "object") {
            gx = textChild.pos.x; gy = textChild.pos.y;
          }
          buttons.push({ text: String(textChild.text), x: gx, y: gy });
        }
      }
    }
    return { label, anchors, buttons };
  }, { label });
}

const slot6 = (centers) => centers[centers.length - 1];

function logSnap(s) {
  console.log(`\n=== ${s.label} ===`);
  for (const a of s.anchors) {
    console.log(`  anchor centers=${JSON.stringify(a.centers)} addends=${JSON.stringify(a.addends)} sumText=${a.sumText} revealed=${a.isRevealed}`);
  }
  console.log(`  buttons: ${JSON.stringify(s.buttons.map(b => b.text))}`);
}

const s1 = await snapshot("STEP 1 ENTRY");
logSnap(s1);

// Pick the correct pair: the anchor addends are at slots 0,2,4 → a,b,c.
const addends = (s1.anchors[0]?.addends || []).map(Number);
const [a, b, c] = addends;
const expectedAnswer = a + b + c;
let pairBtn = null;
const findPair = (x, y) => s1.buttons.find(btn => {
  const m = btn.text.match(/^(\d+)\+(\d+)$/);
  return m && ((+m[1] === x && +m[2] === y) || (+m[1] === y && +m[2] === x));
});
if (a + b === 10) pairBtn = findPair(a, b);
else if (b + c === 10) pairBtn = findPair(b, c);
else if (a + c === 10) pairBtn = findPair(a, c);
if (!pairBtn) {
  console.error("no correct pair button.");
  console.error("  addends=", addends, "a=", a, "b=", b, "c=", c);
  console.error("  a+b=", a + b, "b+c=", b + c, "a+c=", a + c);
  console.error("  buttons=", s1.buttons.map(b => b.text));
  process.exit(1);
}
console.log(`\nTapping CORRECT pair button: "${pairBtn.text}" (round answer=${expectedAnswer})`);
await page.mouse.click(pairBtn.x, pairBtn.y);
await page.waitForTimeout(2500);

const s2 = await snapshot("STEP 2 ENTRY (anchor still '?')");
logSnap(s2);

const s2Addends = (s2.anchors[0]?.addends || []).map(Number);
const s2Answer = s2Addends.reduce((x, y) => x + y, 0);
console.log(`Step 2 expected answer: ${s2Answer}`);

const ansBtn = s2.buttons.find(b => b.text === String(s2Answer));
if (!ansBtn) {
  console.error(`No button labeled "${s2Answer}". buttons=${JSON.stringify(s2.buttons.map(b => b.text))}`);
  process.exit(1);
}

console.log(`\nTapping CORRECT answer button: "${ansBtn.text}"`);
const beforeRevealS6 = slot6(s2.anchors[0].centers);
console.log(`slot 6 center BEFORE reveal: ${beforeRevealS6}`);

const reveals = [];
await page.mouse.click(ansBtn.x, ansBtn.y);
await page.waitForTimeout(3500);

const after = await snapshot(`AFTER correct answer tap`);
logSnap(after);
if (after.anchors[0]) {
  const s6 = slot6(after.anchors[0].centers);
  reveals.push({
    tapped: ansBtn.text,
    s6,
    addends: after.anchors[0].addends,
    sumText: after.anchors[0].sumText,
    revealed: after.anchors[0].isRevealed,
  });
  console.log(`\n>>> anchor AFTER reveal: sumText=${after.anchors[0].sumText} revealed=${after.anchors[0].isRevealed}`);
}

console.log("\n=== SUMMARY ===");
console.log(`slot 6 center BEFORE reveal: ${beforeRevealS6}`);
for (const r of reveals) {
  console.log(`  tapped ${r.tapped}: afterS6=${r.s6} sumText=${r.sumText} revealed=${r.revealed}`);
}

const allS6 = [beforeRevealS6, ...reveals.map(r => r.s6).filter(v => v != null)];
const minS6 = Math.min(...allS6);
const maxS6 = Math.max(...allS6);
const driftPx = maxS6 - minS6;
console.log(`\n  min=${minS6} max=${maxS6} drift=${driftPx.toFixed(2)}px`);
if (driftPx > 1) {
  console.log(`  >>> STILL SHIFTING — bug is real`);
} else {
  console.log(`  >>> LOCKED — no visible shift`);
}

// Now do multiple rounds so we can sample across different answers.
console.log("\n=== Multi-round scan: 5 rounds ===");
const rounds = [];
for (let i = 0; i < 5; i++) {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.kaplay.go("level2"));
  await page.waitForTimeout(2500);

  const s1a = await snapshot(`round ${i} STEP 1`);
  logSnap(s1a);
  const addends = (s1a.anchors[0]?.addends || []).map(Number);
  const [a1, b1, c1] = addends;
  const ans = addends.reduce((x, y) => x + y, 0);
  let pBtn = null;
  if (a1 + b1 === 10) pBtn = s1a.buttons.find(b => /^\d+\+\d+$/.test(b.text) && b.text.split("+").map(Number).sort().join(",") === [a1, b1].sort().join(","));
  else if (b1 + c1 === 10) pBtn = s1a.buttons.find(b => /^\d+\+\d+$/.test(b.text) && b.text.split("+").map(Number).sort().join(",") === [b1, c1].sort().join(","));
  else if (a1 + c1 === 10) pBtn = s1a.buttons.find(b => /^\d+\+\d+$/.test(b.text) && b.text.split("+").map(Number).sort().join(",") === [a1, c1].sort().join(","));
  if (!pBtn) { console.log(`  no pair button for [${a1},${b1},${c1}], skip`); continue; }
  await page.mouse.click(pBtn.x, pBtn.y);
  await page.waitForTimeout(2500);

  const s2a = await snapshot(`round ${i} STEP 2`);
  const beforeS6r = slot6(s2a.anchors[0].centers);
  const aBtn = s2a.buttons.find(b => b.text === String(ans));
  if (!aBtn) { console.log(`  no answer button for ${ans}, skip`); continue; }
  await page.mouse.click(aBtn.x, aBtn.y);
  await page.waitForTimeout(3500);

  const afterR = await snapshot(`round ${i} AFTER answer`);
  const afterS6r = slot6(afterR.anchors[0].centers);
  const driftR = afterS6r - beforeS6r;
  rounds.push({
    i,
    addends: [a1, b1, c1],
    answer: ans,
    beforeS6: beforeS6r,
    afterS6: afterS6r,
    sumText: afterR.anchors[0]?.sumText,
    revealed: afterR.anchors[0]?.isRevealed,
    drift: driftR,
  });
  console.log(`  round ${i}: [${a1},${b1},${c1}]=${ans} beforeS6=${beforeS6r} afterS6=${afterS6r} drift=${driftR} sumText=${afterR.anchors[0]?.sumText} revealed=${afterR.anchors[0]?.isRevealed}`);
}

console.log("\n=== Multi-round results ===");
let anyShift = false;
for (const r of rounds) {
  if (Math.abs(r.drift) > 1) anyShift = true;
  console.log(`  round ${r.i}: [${r.addends.join(",")}]=${r.answer} drift=${r.drift} sumText=${r.sumText} revealed=${r.revealed}`);
}
if (anyShift) console.log(`>>> SOME ROUND SHIFTED — bug is real`);
else console.log(`>>> ALL ROUNDS LOCKED — fix is correct`);

await ctx.close();
await browser.close();
console.log("done");
// tools/probe-whack-correct.mjs — verify correct-tap audio + visual feedback.
//
// Reads the live scene state (equation slots + badge text), computes the
// answer, locates the badge carrying it, taps the corresponding hit
// rect, then captures screenshots at T+0.15s, T+0.4s, T+1.1s, T+2.6s
// to verify the flash + celebrate + cheer chain actually fired.
//
// Run after starting the dev server on localhost:8126.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:8126/";
const OUT = "tmp-screens";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
});
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const consoleLog = [];
page.on("pageerror", (err) => {
  console.error("[pageerror]", err.message, err.stack);
});
page.on("console", (msg) => {
  const t = msg.type();
  const text = msg.text();
  consoleLog.push(`[${t}] ${text}`);
  if (t === "error") console.error("[console.error]", text);
  else if (t === "warning") console.warn("[console.warn]", text);
  else console.log(`[browser.${t}]`, text);
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

await page.evaluate(() => {
  const KEY = "panda-save-v1";
  const cur = JSON.parse(window.localStorage.getItem(KEY) || "{}");
  cur.unlockedGame = 5;
  cur.starsByGame = cur.starsByGame || {};
  window.localStorage.setItem(KEY, JSON.stringify(cur));
});

await page.evaluate(() => {
  const tryPatch = () => {
    if (!window.PandaAudio) return false;
    const orig = {
      playCue: window.PandaAudio.playCue,
      playSequence: window.PandaAudio.playSequence,
      stopAllAudio: window.PandaAudio.stopAllAudio,
    };
    window.PandaAudio.playCue = function(id) {
      console.log(`[INSTRUMENT] playCue("${id}")`);
      return orig.playCue.call(this, id);
    };
    window.PandaAudio.playSequence = function(ids, gap, delay, cb) {
      console.log(`[INSTRUMENT] playSequence(${JSON.stringify(ids)}, ${gap}, ${delay})`);
      return orig.playSequence.call(this, ids, gap, delay, cb);
    };
    window.PandaAudio.stopAllAudio = function() {
      console.log(`[INSTRUMENT] stopAllAudio()`);
      return orig.stopAllAudio.call(this);
    };
    return true;
  };
  if (!tryPatch()) {
    const id = setInterval(() => {
      if (tryPatch()) clearInterval(id);
    }, 50);
  }
});

await page.mouse.click(683, 512);  // unlock audio
await page.waitForTimeout(400);

const canvas = await page.$("canvas");
if (!canvas) throw new Error("canvas not found");
const box = await canvas.boundingBox();

await page.mouse.click(box.x + 1166, box.y + 200);  // 小游戏 tab
await page.waitForTimeout(900);
await page.mouse.click(box.x + 1163, box.y + 600);  // 打地鼠 card

await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/whack-correct-pre.png` });

// Read scene state.
const scene = await page.evaluate(() => {
  const k = window.kaplay;
  if (!k) return null;
  const eq = [], badges = [];
  const walk = (node) => {
    if (!node) return;
    let pos, text, h;
    try { pos = node.pos ? { x: node.pos.x, y: node.pos.y } : null; } catch (_) {}
    try { text = typeof node.text === "string" ? node.text : null; } catch (_) {}
    try { h = node.height; } catch (_) {}
    if (text && /^\d+$/.test(text)) {
      if (h === 36) badges.push({ x: pos.x, y: pos.y, value: parseInt(text, 10) });
      else if (h === 100) eq.push({ x: pos.x, y: pos.y, value: parseInt(text, 10) });
    }
    for (const c of (node.children || [])) walk(c);
  };
  walk(k.root || k.getTreeRoot?.());
  eq.sort((a, b) => a.x - b.x);
  return { eq, badges };
});

console.log("[probe] equation slots:", scene?.eq);
console.log("[probe] badges:", scene?.badges);

if (!scene || scene.eq.length < 2) {
  throw new Error("could not read equation");
}
const answer = scene.eq[0].value + scene.eq[1].value;
const correctBadge = scene.badges.find((b) => b.value === answer);
if (!correctBadge) {
  throw new Error(`no badge with value ${answer}`);
}
console.log(`[probe] answer = ${answer}, badge at (${correctBadge.x}, ${correctBadge.y})`);

// Tap the hit rect for that hole. The hit rect is at (badgeX, badgeY + 100 - 20)
// = (badgeX, badgeY + 80). (Badge y = h.y - 100, hit rect y = h.y - 20.)
const tapX = correctBadge.x;
const tapY = correctBadge.y + 80;
console.log(`[probe] tapping (${tapX}, ${tapY})`);

await page.mouse.click(box.x + tapX, box.y + tapY);
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/whack-correct-t150.png` });
await page.waitForTimeout(280);
await page.screenshot({ path: `${OUT}/whack-correct-t430.png` });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/whack-correct-t1130.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/whack-correct-t2630.png` });

// Filter the console log for the relevant signals.
console.log("\n=== FILTERED CONSOLE ===");
for (const line of consoleLog) {
  if (
    line.includes("INSTRUMENT") ||
    line.includes("[gameWhack] tap") ||
    line.includes("TypeError") ||
    line.includes("Error")
  ) {
    console.log(line);
  }
}

// Pass/fail summary.
const sawTap = consoleLog.some((l) => l.includes("[gameWhack] tap"));
const sawWhackTap = consoleLog.some((l) => l.includes('playCue("whack-tap")'));
const sawWhackCorrect = consoleLog.some((l) => l.includes('playCue("whack-correct")'));
const sawCheerChain = consoleLog.some((l) => l.includes("playSequence") && l.includes("enc-"));
const sawEncouragement = consoleLog.some((l) => l.includes('playCue("enc-') || l.includes('panda-praise') || l.includes('panda-cheer'));
const sawError = consoleLog.some((l) => l.includes("TypeError") || l.includes("[error]"));
console.log("\n=== SUMMARY ===");
console.log(`  tap fired              : ${sawTap}`);
console.log(`  whack-tap played       : ${sawWhackTap}`);
console.log(`  whack-correct played   : ${sawWhackCorrect}`);
console.log(`  cheer chain played     : ${sawCheerChain}`);
console.log(`  encouragement cue seen : ${sawEncouragement}`);
console.log(`  no errors              : ${!sawError}`);

await browser.close();
console.log("[probe] done");

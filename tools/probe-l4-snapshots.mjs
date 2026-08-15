// tools/probe-l4-snapshots.mjs — capture screenshots at every key
// transition in level4 to visually inspect for drift / flicker.

import { chromium } from "playwright";

const URL = "http://localhost:8126/";

async function readRow(page, y, tolerance = 30) {
  return page.evaluate(({ y, tolerance }) => {
    const k = window.kaplay;
    return k
      .get("*", { recursive: true })
      .filter((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        if (!p) return false;
        if (Math.abs(p.y - y) > tolerance) return false;
        return typeof o.text === "string" || o.sprite != null;
      })
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return {
          text: typeof o.text === "string" ? o.text : (o.sprite ? `<sprite:${o.sprite}>` : ""),
          x: Math.round(p.x),
          y: Math.round(p.y),
        };
      })
      .sort((a, b) => a.x - b.x);
  }, { y, tolerance });
}

async function clickButton(page, value) {
  for (let tries = 0; tries < 80; tries++) {
    const buttons = await readRow(page, 838, 30);
    const target = buttons.find((b) => b.text === String(value));
    if (target) {
      await page.mouse.click(target.x, target.y);
      return true;
    }
    await page.waitForTimeout(50);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.PandaAudio && window.kaplay);
  await page.evaluate(() => { window.__skipTimers = true; });
  await page.mouse.click(683, 512);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.kaplay.go("level4"));
  await page.waitForTimeout(1500);

  const ab = await (async () => {
    for (let i = 0; i < 40; i++) {
      const anchor = await readRow(page, 220, 30);
      const vals = anchor.filter((o) => /^\d+$/.test(o.text)).map((o) => Number(o.text));
      if (vals.length >= 2) return { a: vals[0], b: vals[1] };
      await page.waitForTimeout(100);
    }
    return null;
  })();
  if (!ab) { console.error("FAIL"); process.exit(1); }
  const ones = ab.a % 10;
  const sum = ones + ab.b;
  const answer = ab.a + ab.b;
  console.log(`Round: a=${ab.a} b=${ab.b} ones=${ones} sum=${sum} answer=${answer}`);

  // Screenshot at each key moment.
  const shots = [
    { name: "s0_step1_entry", delay: 200, action: async () => {} },
    { name: "s1_step1_audio_done", delay: 800, action: async () => {} },
    { name: "s2_step1_after_pick", delay: 100, action: async () => { await clickButton(page, String(ones)); } },
    { name: "s3_step2_audio_done", delay: 1200, action: async () => {} },
    { name: "s4_step2_after_pick", delay: 100, action: async () => { await clickButton(page, String(sum)); } },
    { name: "s5_step3_audio_done", delay: 1200, action: async () => {} },
    { name: "s6_step3_after_pick", delay: 100, action: async () => { await clickButton(page, String(answer)); } },
  ];

  for (const s of shots) {
    await s.action();
    await page.waitForTimeout(s.delay);
    await page.screenshot({ path: `tmp-screens/l4-${s.name}.png`, fullPage: false });
    const rows = {
      anchor: await readRow(page, 220, 30),
      split: await readRow(page, 440, 30),
      bottom: await readRow(page, 600, 30),
    };
    console.log(`\n=== ${s.name} ===`);
    for (const [k, v] of Object.entries(rows)) {
      console.log(`  ${k}: [${v.map((o) => `${o.text}@${o.x}`).join(", ")}]`);
    }
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
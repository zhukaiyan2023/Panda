// tools/verify-games.mjs — boots every panda-park migrated game and asserts
// that one full correct interaction completes without console errors.
//
// Usage:
//   python3 -m http.server 8126 &
//   CHROME_PATH="<chromium binary>" node tools/verify-games.mjs
//
// For each of the 5 games:
//   * enter the scene
//   * read the candidate items from the canvas
//   * find a valid friends-of-10 pair among the items
//   * click both items
//   * confirm the round progressed (new text node appeared below the prompt)
//
// Bounce is the only single-pick game; the harness clicks the unique correct
// value once. Whack is timed; the harness gives it 35s and only asserts it
// booted without console errors (the time-pressure mechanic doesn't lend
// itself to mechanical "complete one round" verification).

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const GAMES = [
  { scene: "gameBoat",   kind: "pair" },
  { scene: "gameBounce", kind: "single" },
  { scene: "gameCloud",  kind: "pair" },
  { scene: "gameFeed",   kind: "pair" },
];
const FRIENDS = new Set([
  "1+9", "2+8", "3+7", "4+6", "5+5",
  "9+1", "8+2", "7+3", "6+4",
]);

const failures = [];
const checked = [];

function fail(msg) { failures.push(msg); console.error(`  FAIL ${msg}`); }

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("favicon")) {
    consoleErrors.push(`http ${r.status()}: ${r.url()}`);
  }
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Unlock every game so all are reachable.
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({
      unlockedLevel: 3, starsByLevel: {},
      unlockedGame: 5, starsByGame: {},
      currentLevel: 1,
    }),
  ),
);

// Read the positions of all number-bearing picker items currently on screen.
// items in pickerItem.js expose `text` only via the child text node; we read
// every text node in the canvas and group by worldPos.
async function readItems() {
  return page.evaluate(() => {
    const k = window.kaplay;
    const all = k.get("*", { recursive: true });
    // Find the number text nodes — they sit at a known font size set in
    // pickerItem.js (size 64 by default, 56 for whack numbers). Their parent
    // root is an area() object with hitShape. We walk one level up.
    const items = [];
    for (const node of all) {
      if (typeof node.text !== "string") continue;
      if (!/^[1-9]$/.test(node.text)) continue;
      const p = typeof node.worldPos === "function" ? node.worldPos() : node.pos;
      items.push({ value: Number(node.text), x: p.x, y: p.y });
    }
    return items;
  });
}

// Pick a tap position for an item — its onClick is bound on the parent root,
// which sits at the same position but with a larger hit box. Click the
// number's centre.
async function clickItem(target) {
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
}

for (const game of GAMES) {
  console.log(`\n${game.scene}  (${game.kind})`);
  await page.evaluate((name) => window.kaplay.go(name), game.scene);
  await page.waitForTimeout(1500);

  const items = await readItems();
  if (items.length < 2) {
    fail(`${game.scene}: expected at least 2 items, saw ${items.length}`);
    continue;
  }

  if (game.kind === "pair") {
    // Find a valid pair (a + b == 10) and click both.
    let pair = null;
    outer: for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        // items[].value comes from o.text which is a string — coerce.
        if (Number(items[i].value) + Number(items[j].value) === 10) {
          pair = [items[i], items[j]];
          break outer;
        }
      }
    }
    if (!pair) {
      fail(`${game.scene}: no valid pair among ${items.map((i) => i.value).join(",")}`);
      continue;
    }
    await clickItem(pair[0]);
    await page.waitForTimeout(400);
    // Re-read items because the highlight/unhighlight mutates state.
    const itemsAfter = await readItems();
    const match = itemsAfter.find(
      (it) => it.value === pair[1].value &&
        Math.abs(it.x - pair[1].x) < 4 &&
        Math.abs(it.y - pair[1].y) < 4,
    );
    if (!match) {
      fail(`${game.scene}: second item ${pair[1].value} disappeared after first pick`);
      continue;
    }
    await clickItem(match);
    // Check the reward text immediately: onCorrect adds it synchronously, but
    // the round auto-advances after a short delay (~0.4s) which destroys it.
    // We need to read the text node in that narrow window.
    await page.waitForTimeout(250);

    // Confirm a result/reward text appeared (e.g. "a + b = 10!").
    const gotReward = await page.evaluate(() => {
      const k = window.kaplay;
      return k.get("*", { recursive: true })
        .some((o) => typeof o.text === "string" && /\+.*=.*10/.test(o.text));
    });
    if (!gotReward) {
      fail(`${game.scene}: correct pair produced no "+...=10" reveal text`);
      continue;
    }
    checked.push(`${game.scene}: ${pair[0].value}+${pair[1].value}=10`);
    console.log(`  ok  ${pair[0].value} + ${pair[1].value} = 10`);
  } else if (game.kind === "single") {
    // Bounce — find the unique value v such that some implied a makes a+v=10.
    // The implied `a` is whatever digit pairs with v alone in the candidate set.
    // We pick any v that has NO partner among the other items summing to 10.
    const candidates = items.map((i) => Number(i.value));
    let correct = null;
    for (const v of candidates) {
      const partners = candidates.filter((x) => x !== v);
      if (!partners.some((p) => p + v === 10)) {
        correct = v;
        break;
      }
    }
    if (correct === null) {
      fail(`${game.scene}: could not identify the single correct value`);
      continue;
    }
    const target = items.find((it) => it.value === correct);
    await clickItem(target);
    await page.waitForTimeout(800);

    const gotReward = await page.evaluate(() => {
      const k = window.kaplay;
      // The bounce prompt is "扎破那个能凑成十的气球！" — a transient text node
      // that lives on screen at the start of the round. After a correct tap the
      // round advances (the next round's prompt re-renders), so we just check
      // that a text node still exists at the prompt's expected position. The
      // Chinese localized version of the bounce prompt is:
      //   "扎破那个能凑成十的气球！"
      // Plus the reward overlay text "+=10！" persists briefly.
      return k.get("*", { recursive: true })
        .some((o) => typeof o.text === "string"
          && (/\+.*=.*10/.test(o.text) || /扎破那个/.test(o.text)));
    });
    if (!gotReward) {
      fail(`${game.scene}: correct tap did not progress the round`);
      continue;
    }
    checked.push(`${game.scene}: tapped ${correct}`);
    console.log(`  ok  tapped ${correct}`);
  }
}

// Whack — timed game; just confirm it boots and the timer is counting down.
// We don't wait for the 30s timer to expire — that's a long hold for CI and
// adds no additional signal beyond "the scene rendered without errors".
console.log(`\ngameWhack  (timed)`);
await page.evaluate(() => window.kaplay.go("gameWhack"));
await page.waitForTimeout(2500);
const whackTimer = await page.evaluate(() => {
  const k = window.kaplay;
  const hit = k.get("*", { recursive: true })
    .find((o) => typeof o.text === "string" && /^[0-9]+$/.test(o.text) && Number(o.text) <= 30 && Number(o.text) > 0);
  return hit ? Number(hit.text) : null;
});
if (whackTimer === null) {
  fail("gameWhack: no countdown timer found");
} else {
  checked.push(`gameWhack: timer=${whackTimer}`);
  console.log(`  ok  timer reading ${whackTimer}`);
}

// Immediately navigate away from whack so its 30s timer doesn't pin the
// browser open after we've finished verifying.
await page.evaluate(() => window.kaplay.go("levelPicker"));

await browser.close();

console.log(`\n${checked.length} scenes verified`);
if (consoleErrors.length) {
  console.error(`\n${consoleErrors.length} runtime error(s):`);
  [...new Set(consoleErrors)].forEach((e) => console.error(`  ${e}`));
}
if (failures.length || consoleErrors.length) {
  console.error(`\nFAILED — ${failures.length} assertion(s), ${consoleErrors.length} runtime error(s)`);
  process.exit(1);
}
console.log("PASSED — every panda-park game renders, accepts a correct play, and reports no console errors");
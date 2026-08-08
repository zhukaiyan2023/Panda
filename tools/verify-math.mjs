// tools/verify-math.mjs — plays every round of every level and asserts that the
// arithmetic shown on screen is true and that scoring agrees with it.
//
// This exists because two defects were invisible to a passing smoke test:
//   1. expression() rendered "2 + ? = 1" for the round 2 + 1 = 3, because it
//      treated the second addend as the sum.
//   2. Level 2 displayed "8 + ? = 13" while scoring `need` (2) as correct, so a
//      child who answered 5 was told they were wrong.
//
// Both are properties of the *rendered* equation versus the *accepted* answer,
// so the check reads the actual text nodes out of the running game rather than
// re-deriving expected values from levels.json — re-deriving would just restate
// the bug. Eyeballing 18 rounds is not reliable; this is.
//
// Usage:
//   python3 -m http.server 8126 &
//   CHROME_PATH="<path to a chromium binary>" node tools/verify-math.mjs
//
// Playwright browsers are not vendored. CHROME_PATH is the same override
// tools/smoke.cjs uses; omit it to use Playwright's own downloaded browser.
// Exits non-zero on the first failed assertion.

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const LEVELS = [1, 2, 3];
const EQUATION_Y = 310; // LAYOUT.equationY in scenes/roundScene.js
const BUTTON_Y = 838; // LAYOUT.buttonY
const ROW_TOLERANCE = 6;

const failures = [];
const checked = [];

function fail(message) {
  failures.push(message);
  console.error(`  FAIL ${message}`);
}

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
await page.waitForTimeout(1500);

// Unlock every level so all three are reachable without playing through.
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, currentLevel: 1 }),
  ),
);

// Reads the text nodes sitting on a given row, left to right.
async function readRow(y, tolerance = ROW_TOLERANCE) {
  return page.evaluate(
    ({ y, tolerance }) => {
      const k = window.kaplay;
      return k
        .get("*", { recursive: true })
        .filter((o) => typeof o.text === "string" && o.text.length > 0)
        .map((o) => {
          const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
          return { text: o.text, x: p.x, y: p.y };
        })
        .filter((o) => Math.abs(o.y - y) <= tolerance)
        .sort((a, b) => a.x - b.x);
    },
    { y, tolerance },
  );
}

async function readRoundLabel() {
  const rows = await page.evaluate(() => {
    const k = window.kaplay;
    const hit = k
      .get("*", { recursive: true })
      .find((o) => typeof o.text === "string" && /^Round \d+ \/ \d+$/.test(o.text));
    return hit ? hit.text : null;
  });
  return rows;
}

for (const levelId of LEVELS) {
  console.log(`\nLevel ${levelId}`);
  await page.evaluate((id) => window.kaplay.go(`level${id}`), levelId);
  await page.waitForTimeout(1200);

  const firstLabel = await readRoundLabel();
  if (!firstLabel) {
    fail(`level ${levelId}: no "Round n / m" label found — scene did not build`);
    continue;
  }
  const totalRounds = Number(firstLabel.split("/")[1].trim());

  for (let round = 1; round <= totalRounds; round++) {
    const label = await readRoundLabel();
    if (label !== `Round ${round} / ${totalRounds}`) {
      fail(`level ${levelId} round ${round}: expected that round label, saw "${label}"`);
      break;
    }

    const tokens = (await readRow(EQUATION_Y)).map((t) => t.text);
    if (tokens.length !== 5) {
      fail(`level ${levelId} round ${round}: expected 5 equation tokens, saw ${JSON.stringify(tokens)}`);
      break;
    }

    const [leftRaw, plus, rightRaw, equals, sumRaw] = tokens;
    if (plus !== "+" || equals !== "=") {
      fail(`level ${levelId} round ${round}: malformed equation ${tokens.join(" ")}`);
      break;
    }

    const left = Number(leftRaw);
    const sum = Number(sumRaw);
    if (!Number.isFinite(left) || !Number.isFinite(sum)) {
      fail(`level ${levelId} round ${round}: non-numeric known slots in ${tokens.join(" ")}`);
      break;
    }
    if (rightRaw !== "?") {
      fail(`level ${levelId} round ${round}: expected the right addend to be the blank, saw "${rightRaw}"`);
      break;
    }

    // The one true answer to the equation as displayed.
    const expected = sum - left;
    if (expected < 0) {
      fail(`level ${levelId} round ${round}: equation ${left} + ? = ${sum} has a negative answer`);
      break;
    }

    const buttons = await readRow(BUTTON_Y);
    const values = buttons.map((b) => b.text);
    if (buttons.length !== 4) {
      fail(
        `level ${levelId} round ${round}: expected 4 answer buttons, saw ${buttons.length} ` +
          `(${JSON.stringify(values)}) — the choice count must not vary between rounds`,
      );
      break;
    }
    if (new Set(values).size !== values.length) {
      fail(`level ${levelId} round ${round}: duplicate answer buttons ${JSON.stringify(values)}`);
      break;
    }
    const target = buttons.find((b) => Number(b.text) === expected);
    if (!target) {
      fail(
        `level ${levelId} round ${round}: equation "${left} + ? = ${sum}" needs ${expected}, ` +
          `but the choices are ${JSON.stringify(values)} — no button can be correct`,
      );
      break;
    }

    // Clicking the mathematically correct answer must be accepted. If the scene
    // scores a different value as correct, the step bar never leaves step 1.
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(900);

    const advanced = await page.evaluate(
      (y) => {
        const k = window.kaplay;
        // A reveal line appears below the equation once the round advances.
        return k
          .get("*", { recursive: true })
          .some((o) => {
            if (typeof o.text !== "string" || !o.text) return false;
            const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
            return p.y > y + 200;
          });
      },
      EQUATION_Y,
    );
    if (!advanced) {
      fail(
        `level ${levelId} round ${round}: answered ${expected} for "${left} + ? = ${sum}" ` +
          `and the round did not advance — displayed equation and scored answer disagree`,
      );
      break;
    }

    checked.push(`L${levelId} R${round}: ${left} + ${expected} = ${sum}`);
    console.log(`  ok  ${left} + ${expected} = ${sum}`);

    // Let the reveal steps play out and the next round load.
    await page.waitForTimeout(6200);
  }
}

await browser.close();

console.log(`\n${checked.length} rounds verified`);
if (consoleErrors.length) {
  console.error(`\n${consoleErrors.length} runtime error(s):`);
  [...new Set(consoleErrors)].forEach((e) => console.error(`  ${e}`));
}
if (failures.length || consoleErrors.length) {
  console.error(`\nFAILED — ${failures.length} assertion(s), ${consoleErrors.length} runtime error(s)`);
  process.exit(1);
}
console.log("PASSED — every displayed equation is true and accepts its own answer");

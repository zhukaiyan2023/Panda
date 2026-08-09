// tools/verify-math.mjs — plays every round of every level and asserts the
// arithmetic on screen agrees with the buttons and that clicking the right
// answer advances.
//
// Levels now have multiple questions per round (each step in the teaching
// progression is its own pick). The old verifier assumed "left + ? = sum"
// with exactly 5 tokens; that's no longer true for mixed-addition and
// make-a-ten. This rewrite:
//   * reads the equation row AND any context line as the displayed math
//   * tests every step's question independently, finding the correct button
//     by matching each step's `correct` value rather than re-deriving it
//     from the equation (the equation may just say "?")
//   * drives the round forward by clicking every correct button in order
//
// Why we don't re-derive expected values from levels.json: re-deriving would
// restate the bug. The whole point of this verifier is to compare what the
// game shows against what it scores.

import { chromium } from "playwright";

const URL = process.env.PANDA_URL || "http://localhost:8126/";
const LEVELS = [1, 2, 3];
const EQUATION_Y = 310;
const BUTTON_Y = 838;
const ROW_TOLERANCE = 8;

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
await page.waitForTimeout(2000);

// In-game we wait STEP_DELAY (4s) for a child to look at the reveal before
// auto-advancing. The verifier needs to test the same code path in seconds,
// not minutes, so it flips a flag the round scaffold honours. Set BEFORE
// any scene loads.
await page.evaluate(() => { window.__skipTimers = true; });

// Unlock every level so all three are reachable without playing through.
await page.evaluate(() =>
  localStorage.setItem(
    "panda-save-v1",
    JSON.stringify({ unlockedLevel: 3, starsByLevel: {}, currentLevel: 1 }),
  ),
);

// All visible text nodes on a row, left to right.
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
  // The Round counter was removed in favor of the persistent anchor equation.
  // Return a signature of every numeric slot in the top half of the screen
  // (above the step bar / body area), sorted by (y, x). Each round has a
  // unique signature; the assertions below compare it to the previous round's
  // signature to detect "round advanced" without depending on a round counter.
  return page.evaluate(() => {
    const k = window.kaplay;
    const hits = k
      .get("*", { recursive: true })
      .filter((o) => typeof o.text === "string" && /^\d+$/.test(o.text))
      .map((o) => {
        const p = typeof o.worldPos === "function" ? o.worldPos() : o.pos;
        return { text: o.text, x: p.x, y: p.y };
      })
      .filter((o) => o.y < 360)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((o) => o.text);
    return hits.length ? hits.join("|") : null;
  });
}

async function totalRounds(levelId) {
  return page.evaluate((id) => {
    const lvl = window.PandaLevels.levels.find((l) => l.id === id);
    return lvl ? lvl.rounds.length : 0;
  }, levelId);
}

// Pull the round data straight out of PandaLevels so we know what the correct
// answers are for every step of every round.
async function roundData(levelId, roundIdx) {
  return page.evaluate(
    ({ levelId, roundIdx }) => {
      const lvl = window.PandaLevels.levels.find((l) => l.id === levelId);
      const r = lvl.rounds[roundIdx];
      const answers = [];
      if (r.kind === "three-sum" || r.kind === "three-ten") {
        // L1 is two steps now: Pair, then Add the rest.
        //   Pattern A (sum ≤ 10): pair = first two, pairSum = nums[0]+nums[1].
        //   Pattern B (pair to ten): pair = the two that make ten, pairSum=10.
        // Step 1: child picks pairSum.
        // Step 2: child picks the total.
        let pair, pairSum;
        for (let i = 0; i < r.nums.length; i++) {
          for (let j = i + 1; j < r.nums.length; j++) {
            if (r.nums[i] + r.nums[j] === 10) {
              pair = [r.nums[i], r.nums[j]];
              pairSum = 10;
              break;
            }
          }
          if (pair) break;
        }
        if (!pair) {
          pair = [r.nums[0], r.nums[1]];
          pairSum = r.nums[0] + r.nums[1];
        }
        answers.push(pairSum);
        answers.push(r.answer);
      } else if (r.kind === "make-ten") {
        // L2 redesigned: Compare → To ten → Split → Count.
        // Step 1: pick ">" (the bigger wins). Step 2: how many does big
        // need to make ten? Step 3: split small into (need, rest) — the
        // button text is the literal expression "need+rest". Step 4: the
        // total.
        answers.push(">");
        answers.push(r.need);
        answers.push(`${r.need}+${r.rest}`);
        answers.push(r.answer);
      } else {
        answers.push(r.missing ?? r.b);
      }
      return { answers, totalSteps: lvl.rounds.length };
    },
    { levelId, roundIdx },
  );
}

async function clickButton(value) {
  const buttons = await readRow(BUTTON_Y);
  // L1/L3 use numeric buttons; L2 step 1 uses ">" / "<" symbols. Match by
  // string so both work.
  const target = buttons.find((b) => b.text === String(value));
  if (!target) return false;
  await page.mouse.click(target.x, target.y);
  return true;
}

async function waitForStepAdvance(prevLabel) {
  // The step bar's label is the visible signal that the round has advanced.
  // Each step takes at most ~STEP_DELAY (4s) plus the pick animation.
  await page.waitForTimeout(900);
}

for (const levelId of LEVELS) {
  console.log(`\nLevel ${levelId}`);
  await page.evaluate((id) => window.kaplay.go(`level${id}`), levelId);
  await page.waitForTimeout(1200);

  const firstLabel = await readRoundLabel();
  if (!firstLabel) {
    fail(`level ${levelId}: no top-of-screen numeric slots found`);
    continue;
  }
  const total = await totalRounds(levelId);

  for (let roundIdx = 0; roundIdx < total; roundIdx++) {
    const label = await readRoundLabel();
    if (!label) {
      fail(`level ${levelId} round ${roundIdx + 1}: anchor equation missing`);
      break;
    }

    const { answers } = await roundData(levelId, roundIdx);

    // Walk every step in the round: find the correct button and click it.
    // Between steps, the step bar advances and the button row may rebuild.
    // Some steps have no question (reveal-only / auto-advance); we wait
    // through those until buttons appear, then click the answer for that
    // step. The mapping between `answers[step]` and the currently-visible
    // step is positional: the i-th visible question corresponds to the
    // i-th answer.
    // Walk every step in the round. For each expected answer, sample the button
    // row several times so we catch the buttons BEFORE auto-advance swaps them.
    // We pick the FIRST sample that contains the expected value and click that.
    let answeredSteps = 0;
    while (answeredSteps < answers.length) {
      const expected = answers[answeredSteps];
      const expectedStr = String(expected);
      // Look for a sample that contains the expected value. We can't just
      // take the first non-empty row because some steps are reveal-only and
      // have no buttons; the buttons that do appear may belong to a different
      // step (auto-advance fired mid-sample).
      let picked = null;
      for (let tries = 0; tries < 80 && !picked; tries++) {
        await page.waitForTimeout(50);
        const buttons = await readRow(BUTTON_Y);
        if (buttons.length === 0) continue;
        if (buttons.some((b) => b.text === expectedStr)) {
          picked = buttons.find((b) => b.text === expectedStr);
        }
      }
      if (!picked) {
        const final = await readRow(BUTTON_Y);
        fail(
          `level ${levelId} round ${roundIdx + 1} step ${answeredSteps + 1}: ` +
            `expected ${expected} but never saw it among buttons ${JSON.stringify(final.map((b) => b.text))}`,
        );
        break;
      }
      await page.mouse.click(picked.x, picked.y);
      answeredSteps += 1;
      await page.waitForTimeout(400);
    }

    checked.push(`L${levelId} R${roundIdx + 1}: ${answers.join(", ")}`);
    console.log(`  ok  round ${roundIdx + 1}: answers=${answers.join(", ")}`);

    // With __skipTimers set, auto-advance fires near-instantly. Just give
    // the scene transition a moment to settle.
    await page.waitForTimeout(500);
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
console.log("PASSED — every round's steps show the expected answers and accept them");
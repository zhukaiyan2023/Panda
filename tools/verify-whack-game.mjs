import { chromium } from "playwright";

const url = process.env.PANDA_URL || "http://localhost:8126/";
const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
const page = await context.newPage();
const failures = [];

page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") failures.push(`console error: ${message.text()}`);
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.__skipTimers = true;
    Math.random = () => 0.999;
    window.localStorage.setItem("panda-save-v1", JSON.stringify({
      unlockedGame: 5,
      starsByGame: {},
    }));
  });

  const canvas = await page.$("canvas");
  const box = await canvas?.boundingBox();
  if (!box) throw new Error("game canvas is unavailable");
  await page.mouse.click(box.x + 1166, box.y + 200);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + 1163, box.y + 600);

  await page.waitForFunction(() => {
    const moles = window.kaplay.get("whack-mole");
    return moles.some((mole) => mole.opacity > 0.5 && Number.isInteger(mole.whackValue));
  });

  const target = await page.evaluate(() => {
    const nodes = window.kaplay.get("*", { recursive: true });
    const values = nodes
      .filter((node) => typeof node.text === "string" && /^\d+$/.test(node.text))
      .map((node) => {
        const position = typeof node.worldPos === "function" ? node.worldPos() : node.pos;
        return { value: Number(node.text), x: position.x };
      });
    const left = values.find((value) => Math.abs(value.x - 505) < 30);
    const right = values.find((value) => Math.abs(value.x - 684) < 30);
    const answer = left?.value + right?.value;
    const mole = window.kaplay.get("whack-mole")
      .find((candidate) => candidate.opacity > 0.5 && candidate.whackValue === answer);
    if (!mole) return null;
    const position = typeof mole.worldPos === "function" ? mole.worldPos() : mole.pos;
    return { x: position.x, y: position.y, answer };
  });

  if (!target) throw new Error("could not locate the visible correct mole");
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(() => window.kaplay.get("whack-score")[0]?.text === "10");

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`Whack game PASS: tapped answer ${target.answer}`);
} finally {
  await browser.close();
}

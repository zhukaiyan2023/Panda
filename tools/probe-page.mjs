// tools/probe-page.mjs — load the page in headless chrome, capture console
// errors and check whether the canvas was created.
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
});
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    console.error(`[console.${msg.type()}]`, msg.text());
  }
});

await page.goto("http://localhost:8126/", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const canvas = await page.$("canvas");
console.log("[probe] canvas =", canvas ? "found" : "NULL");

const html = await page.content();
console.log("[probe] page title =", await page.title());
console.log("[probe] root has #root?", html.includes('id="root"'));

await browser.close();
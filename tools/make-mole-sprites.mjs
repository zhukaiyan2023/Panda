// tools/make-mole-sprites.mjs — generate 54 mole+number PNGs via AI.
//
// Run: node tools/make-mole-sprites.mjs --dry-run
//      node tools/make-mole-sprites.mjs --provider=openai --out=assets/art
//
// Phase 1: 6 master panda templates (clean belly, no number) → assets/art/mole-master-{v}.png
// Phase 2: 54 final PNGs (master + number on belly) → assets/art/mole-{v}-n{num}.png
//
// The image provider is intentionally pluggable. The default `--dry-run`
// mode prints the prompts without calling any external API so the prompts
// can be reviewed before any cost is incurred.

import { WHACK_VARIANTS, WHACK_NUMBERS, spriteName } from "../data/whackPack.js";

const args = parseArgs(process.argv.slice(2));
const dryRun = args.dryRun === true;
const provider = args.provider || "dry-run";
const outDir = args.out || "assets/art";

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--provider=")) out.provider = a.slice("--provider=".length);
    else if (a.startsWith("--out=")) out.out = a.slice("--out=".length);
  }
  return out;
}

const MASTER_PROMPT = (v) =>
  `A cute cartoon baby panda illustration, front-facing, looking straight at the viewer, ` +
  `with a clean light-cream belly area where a number can be printed, ` +
  `children's book style, soft pastel colors, no text, no number, no badge, ` +
  `panda variant #${v} (different ear tilt / eye shape / arm pose), ` +
  `white background, PNG, square aspect ratio`;

const FINAL_PROMPT = (v, n) =>
  `A cute cartoon baby panda illustration, front-facing, looking straight at the viewer, ` +
  `the number ${n} printed clearly on its belly like a T-shirt, large bold sans-serif digits, ` +
  `children's book style, soft pastel colors, panda variant #${v}, ` +
  `white background, PNG, square aspect ratio`;

async function generate(prompt, outPath) {
  if (dryRun) {
    console.log(`[dry-run] -> ${outPath}\n         ${prompt}\n`);
    return;
  }
  // Real provider wiring is intentionally left as a stub. At execution time
  // the engineer should fill in:
  //   - the provider SDK call (OpenAI images.generate, Replicate, etc.)
  //   - the path to write the returned binary to outPath
  // Example shape for OpenAI:
  //   const r = await openai.images.generate({ model: "dall-e-3", prompt, size: "1024x1024" });
  //   const buf = Buffer.from(await fetch(r.data[0].url).then(r => r.arrayBuffer()));
  //   await fs.writeFile(outPath, buf);
  throw new Error(`Real provider '${provider}' not yet wired; run --dry-run first to review prompts.`);
}

async function main() {
  console.log(`Whack mole sprite generation`);
  console.log(`Provider: ${provider}`);
  console.log(`Out dir:  ${outDir}`);
  console.log(`Dry run:  ${dryRun}`);
  console.log("");

  // Phase 1: 6 master pandas
  for (const v of WHACK_VARIANTS) {
    await generate(MASTER_PROMPT(v), `${outDir}/mole-master-${v}.png`);
  }

  // Phase 2: 54 final PNGs
  for (const v of WHACK_VARIANTS) {
    for (const n of WHACK_NUMBERS) {
      await generate(FINAL_PROMPT(v, n), `${outDir}/${spriteName(v, n)}.png`);
    }
  }

  console.log(`\nDone. ${dryRun ? "Prompts printed; no files written." : "Files written."}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// tools/cutout.mjs — turn a MiniMax-generated image into a transparent-background
// PNG sprite, then trim it to its bounding box.
//
// Why this exists: MiniMax `image-01` returns opaque JPEG bytes. Kaplay sprites
// are composited over the cream page background, so an opaque rectangle would
// draw a visible box around every character. We generate art on a flat
// background and remove that background here.
//
// The removal is a flood fill seeded from the image edges, NOT a global
// "delete every pixel near this color" match. That distinction matters: a
// panda's white belly is the same color as a white background, and a global
// match would punch a hole through it. A flood fill can only reach pixels
// connected to the border, and the character's dark outline seals the interior.
//
// Usage:
//   node tools/cutout.mjs --in raw.jpg --out sprite.png [--tolerance 42]
//                         [--feather 1] [--pad 8] [--no-trim]
//
// Delegates the pixel work to a Python/PIL helper because PIL+numpy are already
// on this machine and no Node image library is vendored in.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_HELPER = resolve(HERE, "cutout.py");

function parseArgs(argv) {
  const out = { tolerance: 42, feather: 1, pad: 8, trim: true, mode: "flood", despill: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--in") out.in = next();
    else if (a === "--out") out.out = next();
    else if (a === "--tolerance") out.tolerance = Number(next());
    else if (a === "--feather") out.feather = Number(next());
    else if (a === "--pad") out.pad = Number(next());
    else if (a === "--mode") out.mode = next();
    else if (a === "--despill") out.despill = true;
    else if (a === "--no-trim") out.trim = false;
    else throw new Error(`unknown flag: ${a}`);
  }
  if (!out.in) throw new Error("--in is required");
  if (!out.out) throw new Error("--out is required");
  if (!["flood", "global"].includes(out.mode)) {
    throw new Error(`--mode must be flood or global, got "${out.mode}"`);
  }
  for (const key of ["tolerance", "feather", "pad"]) {
    if (!Number.isFinite(out[key])) throw new Error(`--${key} must be a number`);
  }
  return out;
}

export function cutout(opts) {
  const inPath = resolve(opts.in);
  const outPath = resolve(opts.out);
  if (!existsSync(inPath)) throw new Error(`input not found: ${inPath}`);
  mkdirSync(dirname(outPath), { recursive: true });

  const args = [
    PY_HELPER,
    "--in", inPath,
    "--out", outPath,
    "--tolerance", String(opts.tolerance ?? 42),
    "--feather", String(opts.feather ?? 1),
    "--pad", String(opts.pad ?? 8),
    "--mode", opts.mode ?? "flood",
  ];
  if (opts.despill) args.push("--despill");
  if (opts.trim === false) args.push("--no-trim");

  const res = spawnSync("python3", args, { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`cutout failed (exit ${res.status}): ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    console.log(cutout(parseArgs(process.argv.slice(2))));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

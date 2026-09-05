// tools/resize-png.mjs — resize an existing PNG to a target width × height.
//
// Used by build-art-minimax.mjs when an entry declares `resize: {w, h}` —
// the on-disk asset must match the design spec dimensions even though the
// image API's closest aspect ratio doesn't. Currently only grass-ground.
//
// Delegates to a Python/PIL helper for parity with cutout.mjs (PIL+numpy
// are already required by the cutout pipeline; no extra deps).
//
// Usage:
//   node tools/resize-png.mjs --in foo.png --out bar.png --w 1400 --h 260

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_HELPER = resolve(HERE, "resize-png.py");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--in") out.in = next();
    else if (a === "--out") out.out = next();
    else if (a === "--w") out.w = Number(next());
    else if (a === "--h") out.h = Number(next());
    else throw new Error(`unknown flag: ${a}`);
  }
  if (!out.in) throw new Error("--in is required");
  if (!out.out) throw new Error("--out is required");
  if (!Number.isFinite(out.w) || out.w <= 0) throw new Error("--w must be a positive number");
  if (!Number.isFinite(out.h) || out.h <= 0) throw new Error("--h must be a positive number");
  return out;
}

export function resizePng(opts) {
  const inPath = resolve(opts.in);
  const outPath = resolve(opts.out);
  if (!existsSync(inPath)) throw new Error(`input not found: ${inPath}`);
  mkdirSync(dirname(outPath), { recursive: true });

  const args = [
    PY_HELPER,
    "--in", inPath,
    "--out", outPath,
    "--w", String(opts.w),
    "--h", String(opts.h),
  ];
  const res = spawnSync("python3", args, { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`resize failed: ${(res.stdout || res.stderr || "").trim()}`);
  }
  return res.stdout.trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(resizePng(parseArgs(process.argv.slice(2))));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
// tools/verify-cue-manifest.mjs — reconcile the cue manifest against reality.
//
// Three sets should agree:
//   manifest  — what tools/cue-manifest.mjs can synthesize (id -> text)
//   CUE_IDS   — what main.js will allow the runtime to play
//   on-disk   — what actually exists under assets/audio/
//
// A cue in CUE_IDS with no file plays silence. A cue the manifest can't
// synthesize can never be rebuilt in a new voice. A file matching neither is
// dead weight. This script names each discrepancy instead of letting a rebuild
// quietly skip cues.
//
// Exit code is 1 when a cue the runtime needs cannot be built or is missing
// audio; stale extras are reported but don't fail the run.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildManifest } from "./cue-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readCueIdsFromMain() {
  const src = readFileSync(resolve(ROOT, "main.js"), "utf8");
  const m = src.match(/const CUE_IDS\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!m) throw new Error("could not locate CUE_IDS array in main.js");
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

function show(label, items, limit = 15) {
  const list = [...items].sort();
  console.log(`\n${label}: ${list.length}`);
  for (const x of list.slice(0, limit)) console.log(`    ${x}`);
  if (list.length > limit) console.log(`    ... and ${list.length - limit} more`);
}

const manifest = buildManifest();
const manifestIds = new Set(manifest.map((c) => c.id));
const runtimeIds = readCueIdsFromMain();
const diskIds = new Set(
  readdirSync(resolve(ROOT, "assets/audio"))
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.slice(0, -4)),
);

console.log(`manifest: ${manifestIds.size}  runtime CUE_IDS: ${runtimeIds.size}  on disk: ${diskIds.size}`);

const diff = (a, b) => new Set([...a].filter((x) => !b.has(x)));

// The manifest is authoritative: it is derived from the same pools the game
// samples rounds from, so it describes exactly the cues a scene can ask for.
// Anything registered or on disk beyond that is left over from a previous pool
// definition (the pools once admitted 0 as an addend, hence l1-intro-0-0-3).
const missingAudio = diff(manifestIds, diskIds);
const unregistered = diff(manifestIds, runtimeIds);
const staleRegistrations = diff(runtimeIds, manifestIds);
const staleFiles = diff(diskIds, manifestIds);

show("Manifest cue has no mp3 (plays SILENCE)", missingAudio);
show("Manifest cue missing from main.js CUE_IDS (runtime will REFUSE it)", unregistered);
show("Registered in CUE_IDS but unreachable from any pool (stale)", staleRegistrations);
show("On disk but unreachable from any pool (stale)", staleFiles);

const fatal = missingAudio.size > 0 || unregistered.size > 0;
console.log(fatal
  ? "\nFAIL — a cue the game can request is missing or unregistered"
  : "\nOK — every reachable cue is registered and present");
process.exit(fatal ? 1 : 0);

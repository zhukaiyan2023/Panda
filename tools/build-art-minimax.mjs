// tools/build-art-minimax.mjs — regenerate assets/art/ as illustrated raster PNGs.
//
// Replaces the hand-authored flat SVGs with picture-book style illustrations
// from MiniMax `image-01`. The original SVGs were built from stroked primitives,
// which read as thin line art on an iPad; raster illustrations give a small
// child far more to look at.
//
// Every prompt is suffixed with STYLE so the whole set looks like it came from
// one illustrator. Without that shared suffix the model drifts between flat
// vector, 3D render, and watercolor across calls, and the screen ends up
// looking like clip-art assembled from three different books.
//
// Sprites are generated on a flat white backdrop and cut out to transparency by
// tools/cutout.mjs, because kaplay composites them over the cream background.
// Full-bleed art (scene backgrounds, card panels) sets `cutout: false` and is
// kept as an opaque rectangle.
//
// Usage:
//   MINIMAX_API_KEY=... node tools/build-art-minimax.mjs            # only missing
//   MINIMAX_API_KEY=... node tools/build-art-minimax.mjs --force    # rebuild all
//   MINIMAX_API_KEY=... node tools/build-art-minimax.mjs panda-idle star
//   node tools/build-art-minimax.mjs --list
//
// Raw generator output is kept in assets/art/.raw/ so a prompt can be re-cut at
// a different tolerance without paying for the image again.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cutout } from "./cutout.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ART_DIR = resolve(ROOT, "assets/art");
const RAW_DIR = resolve(ART_DIR, ".raw");
const IMAGE_SH = resolve(ROOT, ".claude/skills/minimax-image/bin/image.sh");

// The shared look. Mirrors components/theme.js: cream paper, deep-purple ink
// outlines, warm pastels. "thick bold outline" is what keeps the raster art
// legible at the small on-canvas sizes (52px stars, 72px locks).
const STYLE = [
  "children's picture book illustration for toddlers",
  "cute kawaii style, simple bold shapes, thick dark outline",
  "flat bright cheerful colors, warm pastel palette",
  "soft cream and peach tones, no gradients background",
  "high clarity, clean, adorable, friendly",
].join(", ");

// Appended to sprites only. The model persistently adds a drop shadow and a
// decorative frame unless told not to; both survive the cutout as grey blobs.
//
// The backdrop is a chroma-key color rather than white. White fails for pale
// subjects — a white cloud or pink balloon on white has no edge for the flood
// fill to stop at, so the fill eats straight through the character. A backdrop
// far from every color in the subject gives the fill a hard boundary. Green is
// the default; green subjects (bamboo, leaf) use magenta instead.
const CHROMA = {
  green: "bright saturated pure green chroma key background (#00b140)",
  magenta: "bright saturated pure magenta chroma key background (#ff00ff)",
};

function isolatedClause(chroma) {
  return [
    `isolated on a plain flat ${CHROMA[chroma]}`,
    "no shadow, no ground, no floor, no frame, no border, no watermark",
    "no decorative background shapes, no blobs, no confetti",
    "centered with generous empty margin around the subject",
  ].join(", ");
}

export const ART = [
  // ---- Characters -------------------------------------------------------
  {
    name: "panda-idle",
    prompt: "a cute chubby baby panda standing upright, friendly happy smile, looking straight at the viewer, arms relaxed at its sides, full body",
    ratio: "1:1",
    tolerance: 100,
  },
  {
    name: "panda-cheer",
    prompt: "a cute chubby baby panda cheering with both arms raised high above its head, eyes closed in a joyful smile, excited and celebrating, full body",
    ratio: "1:1",
    tolerance: 100,
  },
  {
    name: "panda-think",
    prompt: "a cute chubby black and white baby panda thinking, one paw touching its chin, head tilted slightly, curious puzzled expression, classic black ears and black eye patches, full body",
    ratio: "1:1",
    tolerance: 110,
  },

  // ---- Game props -------------------------------------------------------
  {
    name: "boat",
    prompt: "a cute little cartoon wooden sailboat with a cheerful triangular sail and a tiny flag, seen from the side",
    ratio: "1:1",
    tolerance: 90,
  },
  {
    name: "cloud",
    prompt: "a cute fluffy white cartoon cloud with a happy smiling face, rosy cheeks and tiny closed eyes",
    ratio: "1:1",
    tolerance: 70,
  },
  {
    name: "balloon",
    prompt: "a single cute glossy red party balloon with a curly string hanging below it",
    ratio: "3:4",
    tolerance: 90,
  },
  {
    name: "bubble",
    prompt: "a cute shiny translucent soap bubble with soft rainbow sheen and bright white highlights, perfectly round",
    ratio: "1:1",
    tolerance: 60,
  },

  // ---- Decoration -------------------------------------------------------
  {
    name: "bamboo",
    prompt: "a tall green bamboo stalk with a few fresh leaves growing from its joints, vertical",
    ratio: "9:16",
    tolerance: 110,
    chroma: "magenta",
  },
  {
    name: "leaf",
    prompt: "a single fresh green bamboo leaf with a visible center vein, diagonal",
    ratio: "1:1",
    tolerance: 110,
    chroma: "magenta",
  },
  {
    name: "star",
    prompt: "a cute glossy golden yellow five pointed star with rounded tips and a bright highlight, sparkling",
    ratio: "1:1",
    tolerance: 90,
  },
  {
    name: "lock",
    prompt: "a simple cartoon padlock icon, golden body, dark gray metal shackle on top, closed, no face, no eyes, no mouth, no blush, no character, plain lock icon only, no animals, no decorations, no stars",
    ratio: "1:1",
    tolerance: 110,
  },

  // ---- Level badges -----------------------------------------------------
  // These carry a numeral, which is the one place text in the image is wanted.
  // Kept visually identical apart from the digit and the disc color so the
  // picker row reads as a series.
  {
    name: "badge-1",
    prompt: "a cute round sky blue medal badge with the single big white number 1 in the center, chunky rounded ring border, glossy",
    ratio: "1:1",
    tolerance: 90,
    allowText: true,
  },
  {
    name: "badge-2",
    prompt: "a cute round orange medal badge with the single big white number 2 in the center, chunky rounded ring border, glossy",
    ratio: "1:1",
    tolerance: 90,
    allowText: true,
  },
  {
    name: "badge-3",
    prompt: "a cute round purple medal badge with the single big white number 3 in the center, chunky rounded ring border, glossy",
    ratio: "1:1",
    tolerance: 90,
    allowText: true,
  },
  {
    name: "badge-4",
    prompt: "a cute round yellow medal badge with the single big white number 4 in the center, chunky rounded ring border, glossy",
    ratio: "1:1",
    tolerance: 90,
    allowText: true,
  },

  // ---- Ten-frame ---------------------------------------------------------
  // The ten-frame has to stay dynamic (cells fill as the child counts), so it
  // is split into a hollow slot plus a set of interchangeable counters rather
  // than baked as one image. tenFrame.js swaps the dot sprite per cell.
  {
    name: "cell-frame",
    prompt: "a single empty rounded square outline, thick dark navy rounded border, completely hollow and empty in the center, plain geometric shape only, no animals, no characters, no faces, no eyes, no smile, no decorations anywhere in the image",
    ratio: "1:1",
    tolerance: 120,
    hollow: true,
  },
  ...["blue", "yellow", "pink", "purple", "orange"].map((c) => ({
    name: `dot-${c}`,
    prompt: `a single glossy round ${c} candy button counter, smooth circle, bright white highlight near the top left, thick dark navy outline`,
    ratio: "1:1",
    tolerance: 110,
  })),

  // ---- Equation glyphs ---------------------------------------------------
  // The digits stay as live text (they change every round); only the fixed
  // operators and the answer slot become art.
  {
    name: "slot-answer",
    prompt: "a single empty rounded square outline, thick dark navy rounded border, completely hollow and empty in the center, plain geometric shape only, no animals, no characters, no faces, no eyes, no smile, no decorations anywhere in the image",
    ratio: "1:1",
    tolerance: 120,
    hollow: true,
  },
  {
    name: "op-plus",
    prompt: "a single plus sign, dark navy color, thick straight vertical and horizontal bars crossing at the center, plain mathematical symbol, no decorations, no animals, no faces, no extra shapes",
    ratio: "1:1",
    tolerance: 110,
  },
  {
    name: "op-equals",
    prompt: "mathematical equals sign, two thick dark deep navy blue (#1a1a4e) horizontal parallel bars with a clear gap between them, the symbol is small in the center, surrounded by lots of empty flat background, no orange, no yellow, no character, no face, no decoration, no extra shapes",
    ratio: "1:1",
    tolerance: 110,
    // The model often paints bars that touch the image edges, leaving no
    // path from the border to interior backdrop pixels. Global keying
    // (every near-backdrop pixel, not just border-connected) sidesteps that.
    hollow: true,
  },

  // ---- Full-bleed art (no cutout) ---------------------------------------
  // 4:3 is the closest supported ratio to the 1366x1024 canvas.
  {
    name: "bg-meadow",
    prompt: "a soft empty meadow scene for a toddler game background, gentle rolling green hills, a few round bushes and small flowers along the bottom edge, big soft clouds in a warm cream sky, plenty of empty space in the middle, very low contrast, nothing in the center",
    ratio: "4:3",
    cutout: false,
  },
  {
    name: "bg-bamboo-grove",
    prompt: "a soft bamboo grove scene for a toddler game background, pale green bamboo stalks along the left and right edges only, warm cream sky, completely empty in the middle, very low contrast, nothing in the center",
    ratio: "4:3",
    cutout: false,
  },
];

const BY_NAME = new Map(ART.map((a) => [a.name, a]));

function buildPrompt(art) {
  const parts = [art.prompt, STYLE];
  if (art.cutout === false) {
    parts.push("no text, no watermark, no characters, no letters");
  } else {
    const clause = isolatedClause(art.chroma ?? "green");
    parts.push(art.allowText ? clause : `${clause}, no text`);
  }
  return parts.join(", ");
}

function generate(art) {
  const raw = resolve(RAW_DIR, `${art.name}.jpg`);
  const out = resolve(ART_DIR, `${art.name}.png`);

  const res = spawnSync("bash", [
    IMAGE_SH,
    "--prompt", buildPrompt(art),
    "--aspect_ratio", art.ratio ?? "1:1",
    "--out", raw,
  ], { encoding: "utf8" });

  if (res.error) throw res.error;
  const combined = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (res.status !== 0 || !existsSync(raw)) {
    throw new Error(`image generation failed: ${combined}`);
  }

  if (art.cutout === false) {
    // Full-bleed art still goes through the helper so every asset in the
    // directory ends up a PNG, but the background must survive intact.
    return cutout({ in: raw, out, tolerance: 0, feather: 0, pad: 0, trim: false });
  }
  return cutout({
    in: raw,
    out,
    tolerance: art.tolerance ?? 110,
    feather: 1,
    pad: 6,
    // Hollow art (frames, slots) must key out its enclosed center too.
    mode: art.hollow ? "global" : "flood",
    despill: true,
  });
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--list")) {
    for (const a of ART) console.log(a.name);
    return 0;
  }
  if (!process.env.MINIMAX_API_KEY) {
    console.error("ERROR: MINIMAX_API_KEY is not set");
    return 1;
  }

  const force = argv.includes("--force");
  const names = argv.filter((a) => !a.startsWith("--"));
  for (const n of names) {
    if (!BY_NAME.has(n)) {
      console.error(`ERROR: unknown art name "${n}" (try --list)`);
      return 1;
    }
  }

  const targets = names.length ? names.map((n) => BY_NAME.get(n)) : ART;
  mkdirSync(RAW_DIR, { recursive: true });

  let failed = 0;
  for (const art of targets) {
    const out = resolve(ART_DIR, `${art.name}.png`);
    if (!force && existsSync(out)) {
      console.log(`skip ${art.name} (exists; --force to rebuild)`);
      continue;
    }
    try {
      console.log(`${art.name}: ${generate(art)}`);
    } catch (err) {
      // Keep going: one bad prompt shouldn't cost the whole batch, and every
      // sprite load is individually guarded at runtime anyway.
      console.error(`FAIL ${art.name}: ${err.message}`);
      failed++;
    }
  }
  if (failed) console.error(`\n${failed} asset(s) failed`);
  return failed ? 1 : 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main());

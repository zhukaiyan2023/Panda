// Make bubble-sel.png transparent — the AI-generated sprite ships as a
// JPEG with a white background. Read it as RGB, then re-encode as RGBA
// PNG with every near-white pixel fully transparent. Run once after
// regenerating the sprite.
import sharp from "sharp";

const SRC = "/Users/kaiyan/Documents/Panda/assets/art/bubble-sel.png";
const OUT = SRC; // overwrite in place — bubble-sel is the only consumer

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
// Mark any pixel whose R/G/B are all >= 240 as transparent (white
// background). The bubble body has saturated yellow/orange so this
// threshold leaves it intact.
for (let i = 0; i < data.length; i += channels) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r >= 240 && g >= 240 && b >= 240) {
    data[i + 3] = 0; // alpha = 0
  }
}

await sharp(data, { raw: { width, height, channels } })
  .png()
  .toFile(OUT);

console.log(`OK ${width}x${height} → ${OUT}`);
// data/whackPack.js — single source of truth for the 54 mole-with-number
// sprite names. Used by main.js (boot loader), scenes/gameWhack.js
// (preflight check), and tools/verify-mole-assets.mjs (assertion target).
//
// 6 panda variants × 9 numbers = 54 baked PNGs.
// Numbers 11..19 are the only ones with a sprite; the math pool is
// constrained to this range in data/whackRounds.js.

export const WHACK_NUMBERS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
export const WHACK_VARIANTS = [1, 2, 3, 4, 5, 6];

export function spriteName(variant, num) {
  return `mole-${variant}-n${num}`;
}

export const ALL_SPRITE_NAMES = (() => {
  const out = [];
  for (const v of WHACK_VARIANTS) {
    for (const n of WHACK_NUMBERS) {
      out.push(spriteName(v, n));
    }
  }
  return out;
})();

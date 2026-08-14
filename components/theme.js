// components/theme.js — the single source of truth for canvas colors and font.
//
// styles.css owns the same palette as CSS custom properties for the DOM layer
// (page background, rotate hint). Canvas drawing cannot read those, so the
// values are mirrored here. Keep the two in sync: every color below names the
// CSS variable it mirrors.
//
// Colors are [r, g, b] arrays, ready to spread into k.color(...) / k.rgb(...).

export const INK = [61, 54, 82]; // --c-ink
export const PAPER = [255, 241, 220]; // --c-paper
export const PAPER_DARK = [255, 230, 194]; // --c-paper-dark
export const CARD = [255, 250, 240];
export const ORANGE = [255, 138, 61]; // --c-orange
export const ORANGE_DEEP = [217, 106, 31]; // --c-orange-deep
export const SUCCESS = [108, 194, 138]; // --c-success
export const DANGER = [225, 107, 107]; // --c-danger
export const PINK = [255, 143, 171]; // --c-pink
export const YELLOW = [205, 165, 40]; // --c-yellow
export const BLUE = [124, 199, 255]; // --c-blue
export const PURPLE = [155, 140, 255]; // --c-purple
// GREEN for the whack-a-mole card accent (mint meadow — matches the
// celebration particle palette so the card stays consistent with the
// scene's natural-tone grass strip). Add to gamesPicker.js as the 5th
// game's `accent` color; CSS custom property (--c-green) can be added
// in styles.css in a follow-up if the DOM layer ever needs the same hue.
export const GREEN = [143, 211, 144]; // matches celebration mint

export const MUTED = [180, 170, 200];
export const DISABLED_BG = [230, 225, 239];
export const DISABLED_INK = [170, 163, 189];

// Per-number colors used to code the three addends in a mixed-addition
// problem. Each addend gets a clearly different color so the child can see
// "these are three different things being added together".
export const NUM_BLUE  = [124, 199, 255]; // --c-blue
// Yellow evolution (2026-08-12):
//   [255, 209, 102] — too pale, bled into PAPER ("看不清").
//   [204, 130, 30]  — readable but read as "dark gold / amber",
//                     not yellow ("颜色是不是正确的" — user
//                     described it as 深金色).
//   [205, 165, 40]  — current. Pushes G up so it reads clearly as
//                     YELLOW (golden yellow, not orange-brown)
//                     while keeping enough luminance contrast
//                     against PAPER (~2.7, plenty for a 3-6 yo).
//                     Other addend colors (NUM_BLUE, NUM_PINK) keep
//                     their pastel hue — their warmer/cooler
//                     difference to PAPER gave them enough
//                     contrast already.
export const NUM_YELLOW = [205, 165, 40]; // --c-yellow
export const NUM_PINK  = [255, 143, 171]; // --c-pink
export const NUM_PURPLE = [155, 140, 255]; // --c-purple
export const ACCENT = [255, 138, 61]; // --c-orange-deep

// Ten-frame cells. A saturated fill across all ten cells dominated the screen,
// so filled cells use a softer coral and the strong orange is reserved for
// interactive accents.
export const CELL_FILL = [255, 170, 130];
export const CELL_FILL_HI = [255, 214, 194];
export const CELL_EMPTY = [240, 237, 230]; // --c-frame-empty

// Kaplay accepts CSS font family names directly in text({ font }), verified by
// rendering the same string across families and diffing the output. That means
// no font file has to be bundled — which also keeps the game free of a fetch()
// dependency and of font licensing questions.
//
// "Arial Rounded MT Bold" ships with iPadOS, the target platform, and its heavy
// rounded forms suit an audience of 3-6 year olds. The fallbacks cover desktop
// browsers used for development.
export const FONT = "Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif";

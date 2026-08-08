# Panda Math Adventure 🐼

A playful early-math game for ages 3–6, designed to introduce **make-a-ten / make-10** addition through visual play, narration, and step-by-step interaction.

## Language

All child-facing text and narration are **American English**, with optional **Chinese (zh-CN) recap** delivered by the browser's Web Speech voice ~0.5s after each English line.

## Core learning loop

Example: **8 + 5**

1. How many does 8 need to make 10?
2. Split 5 into 2 and 3.
3. Make 10: 8 + 2 = 10.
4. Add the leftovers: 10 + 3 = 13.
5. Celebrate the answer and replay the full strategy.

## Levels and difficulty

| Level | Range | Focus | Sticker |
| --- | --- | --- | --- |
| Level 1 | up to 5 | Tiny numbers, getting started | 🍎 |
| Level 2 | up to 10 | Make-ten strategy | ⭐ |
| Level 3 | up to 20 | Larger combinations | 🌈 |

Each level has 6 problems. Complete a level to unlock the next one and earn a sticker. Stars and unlocks are saved in `localStorage` (`panda-progress-v1`), so progress survives a reload. Clear all three levels to fill the sticker book.

## Bao Bao, the panda teacher

The panda face in the header is **Bao Bao** (Chinese face shape, child-friendly features, big expressive eyes). Bao Bao greets each level, celebrates each correct answer, and gives a short encouraging line at the end of every round. A second 🔉-style button (`中`) replays the most recent line in Mandarin Chinese; if no `zh-*` voice is installed the line is shown as a caption.

## Design goals

- Ages 3–6: large touch targets, friendly animation, minimal reading load.
- Voice-first instruction with optional replay.
- Visual manipulatives such as apples, stars, and balloons.
- No harsh failure states; mistakes trigger a gentle hint and another attempt.
- Short rounds with rewards and progression.
- Responsive on phones, tablets, and desktop browsers.
- **Installable as a PWA**, works offline after the first visit.

## Run it locally

No build step is required. Open the file directly, or serve the folder:

```bash
# Option 1: open the file directly (works for everything except the service worker)
open index.html

# Option 2: serve the folder so the service worker can register
python3 -m http.server 8000
# then visit http://localhost:8000/index.html
```

To install as a PWA, use the browser's "Add to Home Screen" action. After the first visit the service worker caches the shell so the most recently played level remains playable without a network connection.

## MVP

The initial prototype is a single-page game with no external backend or asset dependency. Browser speech synthesis provides the narration so the prototype can run immediately; the voice layer is isolated for later replacement with recorded American-English narration.
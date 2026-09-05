# Panda Math Adventure — iOS (SwiftUI)

A SwiftUI migration of the original Panda-main Kaplay project.

## Layout

```
Panda/                                  # The Xcode project root
├── Panda/                              # The iOS app target source
│   ├── PandaApp.swift                  # @main entry
│   ├── Theme/                          # Color palette + font helpers
│   ├── Models/                         # Domain models (Level, Round, Save, AudioCue)
│   ├── Pools/                          # Per-level round generators
│   ├── Persistence/                    # UserDefaults save store + daily-cap logic
│   ├── PandaAudio/                     # AVAudioPlayer engine + silent WAV writer
│   ├── Components/                     # SwiftUI components (TenFrame, MathExpression, …)
│   ├── Levels/                         # Round scaffold + 8 math level views
│   ├── Games/                          # 5 panda-park game views
│   ├── Views/                          # Pickers, daily-done, root router
│   ├── Assets.xcassets/                # Accent color, AppIcon
│   └── Resources/                      # Bundled resources
│       ├── Art/                        #   74 hand-authored SVG/PNG art files
│       ├── audio/                      #   2599 pre-baked MP3 cues
│       └── JSSource/                   #   The original Kaplay source as a reference mirror:
│           ├── Scenes/                 #     19 *.js scene files
│           ├── Components/             #     12 *.js components
│           ├── Data/                   #     pools.js, levels.json, …
│           ├── Audio/                  #     praise.js, serialGuard.js
│           ├── vendor/                 #     kaplay.mjs runtime
│           ├── Tools_orig/             #     build / verify / probe scripts
│           ├── Docs_orig/              #     docs
│           ├── index.html              #     the Kaplay entry
│           ├── main.js, save.js,
│           ├── styles.css              #     DOM layer
│           ├── package.json,
│           │  wrangler.jsonc           #     static-host config
│           └── README.md
│
├── Panda.xcodeproj/                    # Xcode project
├── PandaTests/                         # Unit test target (incl. pool tests)
├── PandaUITests/                       # UI test target
└── README.md                           # this file
```

## Curriculum

The 8-level curriculum is **renumbered** so the picker reads in a clean
learning progression.

| New | Title | Pool rule |
| --- | --- | --- |
| L1 | 十以内减法        | a-b with a ∈ [1..10], b ∈ [1..a-1] |
| L2 | 三数相加          | (a,b,c) with a+b+c ≤ 10 |
| L3 | 两个数凑十        | (a,b,c) with (a+b=10) or (b+c=10) |
| L4 | 凑十法            | (a,b) with a+b > 10 |
| L5 | 二十以内          | teen + digit, no carry |
| L6 | 十几加十几        | teen + teen, no carry |
| L7 | 十几减几（不退位）| teen - digit (no borrow) |
| L8 | 破十法            | teen - digit (with borrow) |

The 5 panda-park games (Boat, Bounce, Cloud, Feed, Whack) and the
"一眼识数" game are accessible from the **小游戏** tab on the picker.

## Building

1. Open `Panda.xcodeproj` in Xcode.
2. Select the `Panda` scheme and an iPhone/iPad simulator.
3. Build & run.

The Xcode project uses `PBXFileSystemSynchronizedRootGroup` so all
Swift files and resources inside the `Panda/` source folder are
auto-included.

## Audio

The `PandaAudio` engine loads cues by id:

```
audio/<cue-id>.mp3   (Bundle.main)
```

If a cue is not in the bundle, the engine falls back to a 1-second
silent WAV (mirrors the source's `tools/make-placeholders.js`). All
2599 placeholder MP3s are bundled under `Panda/Resources/audio/`,
so every cue plays silence-by-default until real voice narration is
added.

## Notes vs. the original

- **Curriculum order is fixed.** The original source had L1 = 三数相加
  and L6 = 十以内减法 with intermediate renumbering in `pools.js`'s
  comments. We renumbered the curriculum up-front so L1 → L8 reads as
  a single coherent progression.
- **Audio is silent by default.** All bundled MP3s are 1-second
  silent placeholders. The engine will play real MP3s the moment
  they're added to the bundle — no code change required.
- **No Kaplay.** The whole render path is SwiftUI + Combine; the
  Kaplay `assets/vendor/kaplay.mjs` runtime is preserved under
  `Panda/Resources/JSSource/vendor/` as reference but is not loaded
  by the app.
- **All assets are kept.** Every art file (74), audio file (2599),
  and JS source file (143) from the source lives under
  `Panda/Resources/`.

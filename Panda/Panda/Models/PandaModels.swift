//
//  PandaModels.swift
//  Panda
//
//  Domain models: rounds, levels, save data, daily caps, audio cues.
//

import Foundation

// MARK: - Rounds

/// One round of a math level. Each level emits a different concrete
/// shape — `nums`, `a`, `b`, `a+b`, `answer`, etc. — depending on its
/// strategy. We use a tagged enum so the round scaffold can switch on
/// the strategy without losing the typed payload.
public enum PandaRound {
    /// L1 — 三数相加小于10 — (a, b, c) with a+b+c ≤ 10.
    case threeSum(a: Int, b: Int, c: Int)

    /// L2 — 两个数凑十 — (a, b, c) with (a+b=10) or (b+c=10).
    case threeTen(a: Int, b: Int, c: Int)

    /// L3 — 两数凑十 — (a, b) with a+b>10.
    case makeTen(a: Int, b: Int)

    /// L4 — 凑十法 — (a, b) with a in [11..19], b in [1..9], ones+b<10.
    case teenPlusDigit(a: Int, b: Int)

    /// L5 — 二十以内 — (a, b) both teens, ones(a)+ones(b) ≤ 9.
    case teenPlusTeen(a: Int, b: Int)

    /// L6 — 十以内减法 — a-b, answer = a - b.
    case subWithinTen(a: Int, b: Int)

    /// L7 — 十几减几（不退位） — a in [11..19], b ≤ ones(a).
    case teenSubNoBorrow(a: Int, b: Int)

    /// L8 — 十几减几（退位） — a in [11..19], b > ones(a).
    case teenSubBorrow(a: Int, b: Int)

    /// A short identifier used by audio cue builders to compose MP3 names.
    public var cueSignature: String {
        switch self {
        case .threeSum(let a, let b, let c):   return "\(a)-\(b)-\(c)"
        case .threeTen(let a, let b, let c):   return "\(a)-\(b)-\(c)"
        case .makeTen(let a, let b):           return "\(a)-\(b)"
        case .teenPlusDigit(let a, let b):     return "\(a)-\(b)"
        case .teenPlusTeen(let a, let b):      return "\(a)-\(b)"
        case .subWithinTen(let a, let b):      return "\(a)-\(b)"
        case .teenSubNoBorrow(let a, let b):   return "\(a)-\(b)"
        case .teenSubBorrow(let a, let b):     return "\(a)-\(b)"
        }
    }
}

// MARK: - Levels

/// Curriculum metadata for the level picker. The pool is generated
/// separately in `PandaPools` so each level can ship its own
/// enumeration.
public struct LevelMeta: Identifiable, Hashable {
    public let id: Int
    public let title: String
    public let sampleSize: Int
    public let stepLabels: [String]

    public init(id: Int, title: String, sampleSize: Int, stepLabels: [String]) {
        self.id = id
        self.title = title
        self.sampleSize = sampleSize
        self.stepLabels = stepLabels
    }
}

/// The ordered math curriculum. Order here is the order shown on the
/// level picker (and the order unlocked). Per the source migration the
/// curriculum is renumbered into a clean learning progression:
///
///   L1 十以内减法         (was L6)
///   L2 三数相加           (was L1)
///   L3 两个数凑十         (was L2)
///   L4 凑十法             (was L3)
///   L5 二十以内           (was L4)
///   L6 十几加十几         (was L5)
///   L7 十几减几（不退位）
///   L8 破十法
public enum PandaCurriculum {
    public static let mathLevels: [LevelMeta] = [
        LevelMeta(id: 1, title: "十以内减法",         sampleSize: 6,
                  stepLabels: ["算一算"]),
        LevelMeta(id: 2, title: "三数相加",           sampleSize: 6,
                  stepLabels: ["两两相加", "加上第三个数"]),
        LevelMeta(id: 3, title: "两个数凑十",         sampleSize: 6,
                  stepLabels: ["找十", "算一算"]),
        LevelMeta(id: 4, title: "凑十法",             sampleSize: 6,
                  stepLabels: ["拆小数", "凑十", "算一算"]),
        LevelMeta(id: 5, title: "二十以内",           sampleSize: 6,
                  stepLabels: ["拆十", "加个位", "算答案"]),
        LevelMeta(id: 6, title: "十几加十几",         sampleSize: 6,
                  stepLabels: ["拆 a", "拆 b", "加个位", "加十位", "算答案"]),
        LevelMeta(id: 7, title: "十几减几（不退位）", sampleSize: 6,
                  stepLabels: ["拆一拆", "个位相减", "合起来"]),
        LevelMeta(id: 8, title: "破十法",             sampleSize: 6,
                  stepLabels: ["拆一拆", "十位相减", "合起来"]),
    ]

    /// Daily round cap per math level. Matches the source `DAILY_CAPS`
    /// table. The cap counts ROUNDS, not sessions.
    public static let mathDailyCaps: [Int: Int] = [
        1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6, 7: 6, 8: 6,
    ]

    /// Game meta. Game IDs are kept distinct from math IDs but occupy
    /// the same picker surface (the "小游戏" tab).
    public struct GameMeta: Identifiable, Equatable, Hashable {
        public let id: Int
        public let title: String
        public let subtitle: String
        public let sceneKey: String
        public let icon: String
        public let accent: RGB

        public static func == (lhs: GameMeta, rhs: GameMeta) -> Bool {
            lhs.id == rhs.id
        }

        public func hash(into hasher: inout Hasher) {
            hasher.combine(id)
        }
    }

    public static let games: [GameMeta] = [
        // Row 1 — 计数 / 数数 (Counting & recognition)
        GameMeta(id: 6, title: "一眼识数", subtitle: "瞬间识数",  sceneKey: "gameCount",
                 icon: "circle.grid.3x3.fill",  accent: PandaTheme.blue),
        GameMeta(id: 1, title: "小船",   subtitle: "凑十过河",  sceneKey: "gameBoat",
                 icon: "sailboat.fill",         accent: PandaTheme.blue),
        // Row 2 — 凑十 (Make-10 pair games)
        GameMeta(id: 2, title: "气球",   subtitle: "扎破凑十",  sceneKey: "gameBounce",
                 icon: "balloon.fill",          accent: PandaTheme.pink),
        GameMeta(id: 3, title: "云朵",   subtitle: "看算式找答案", sceneKey: "gameCloud",
                 icon: "cloud.fill",            accent: PandaTheme.purple),
        // Row 3 — 喂熊猫 (Feed the panda)
        GameMeta(id: 4, title: "喂食",   subtitle: "帮熊猫吃饱", sceneKey: "gameFeed",
                 icon: "bubble.left.fill",      accent: PandaTheme.orange),
        GameMeta(id: 5, title: "打地鼠", subtitle: "看算式找答案", sceneKey: "gameWhack",
                 icon: "hammer.fill",           accent: PandaTheme.green),
    ]

    public static let gameDailyCaps: [Int: Int] = [
        1: 5, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6,
    ]
}

// MARK: - Save Data

/// Save data persisted between launches via `UserDefaults`.
/// Mirrors `save.js`'s `panda-save-v1` schema.
public struct PandaSave: Codable, Equatable {
    /// By default all 8 levels are unlocked so a fresh install can
    /// play anything. The source game unlocks them progressively,
    /// but for an iPad install on day one every level should be
    /// reachable. Progressively-locked saves still work — only the
    /// `init()` default is bumped.
    public var unlockedLevel: Int = 8
    public var currentLevel: Int? = nil
    public var starsByLevel: [Int: Int] = [:]
    public var unlockedGame: Int = 6
    public var starsByGame: [Int: Int] = [:]
    /// ISO date strings ("yyyy-MM-dd") of round-finished counts keyed by level.
    public var dailyCounts: [String: [String: Int]] = [:]

    public init() {}
}

// MARK: - Audio Cue

/// A typed reference to an audio cue. Concrete MP3 names are built in
/// each level/game; this enum just makes the call sites easier to scan.
public indirect enum AudioCue: Hashable {
    case file(String)
    case sequence([AudioCue], gapMs: Int = 200)
    case chainAfter(prev: AudioCue, then: [AudioCue], gapMs: Int = 200, seqGapMs: Int = 40)
}

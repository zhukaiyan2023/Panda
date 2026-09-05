//
//  PandaSaveStore.swift
//  Panda
//
//  Persists `PandaSave` to UserDefaults and exposes the daily-cap logic
//  used by the picker (locked-when-cap-hit) and the round scene
//  (mark-as-finished).
//

import Foundation
import Combine

@MainActor
public final class PandaSaveStore: ObservableObject {
    public static let shared = PandaSaveStore()

    @Published public private(set) var save: PandaSave

    private let key = "panda-save-v2"
    private let cap: Int = 6

    public init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let decoded = try? JSONDecoder().decode(PandaSave.self, from: data) {
            self.save = decoded
        } else {
            self.save = PandaSave()
        }
    }

    public func load() -> PandaSave { save }

    public func persist() {
        if let data = try? JSONEncoder().encode(save) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    // MARK: Level progression

    /// Mark a finished round. Bumps stars, unlocks next level if needed,
    /// and updates the daily counter. Returns whether the round put
    /// the kid over today's cap.
    @discardableResult
    public func markRoundFinished(_ levelId: Int) -> (count: Int, cap: Int, locked: Bool) {
        let daily = dailyKey(for: levelId)
        var counts = save.dailyCounts[daily] ?? [:]
        let levelKey = String(levelId)
        let previous = counts[levelKey] ?? 0
        let next = previous + 1
        counts[levelKey] = next
        save.dailyCounts[daily] = counts

        save.unlockedLevel = max(save.unlockedLevel, levelId + 1)
        save.currentLevel = levelId
        save.starsByLevel[levelId, default: 0] += 1

        let capForLevel = PandaCurriculum.mathDailyCaps[levelId] ?? cap
        persist()
        return (next, capForLevel, next >= capForLevel)
    }

    public func isLevelDailyLocked(_ levelId: Int) -> Bool {
        let key = dailyKey(for: levelId)
        let counts = save.dailyCounts[key] ?? [:]
        let cap = PandaCurriculum.mathDailyCaps[levelId] ?? cap
        return (counts[String(levelId)] ?? 0) >= cap
    }

    // MARK: Game progression

    public func markGameRoundFinished(_ gameId: Int) {
        let daily = dailyKey(for: gameId)
        var counts = save.dailyCounts[daily] ?? [:]
        let key = "game-\(gameId)"
        counts[key, default: 0] += 1
        save.dailyCounts[daily] = counts
        save.unlockedGame = max(save.unlockedGame, gameId + 1)
        save.starsByGame[gameId, default: 0] += 1
        persist()
    }

    public func isGameDailyLocked(_ gameId: Int) -> Bool {
        let key = dailyKey(for: gameId)
        let counts = save.dailyCounts[key] ?? [:]
        let cap = PandaCurriculum.gameDailyCaps[gameId] ?? cap
        return (counts["game-\(gameId)"] ?? 0) >= cap
    }

    // MARK: Reset (debug / settings)

    public func resetAll() {
        save = PandaSave()
        persist()
    }

    // MARK: Internals

    private func dailyKey(for levelId: Int) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        return fmt.string(from: Date())
    }
}

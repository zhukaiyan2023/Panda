//
//  GamePools.swift
//  Panda
//
//  Board / question generators for the panda-park games.
//

import Foundation

// MARK: - Feed

/// "Feed" game board — a 5-round, escalating difficulty curve where
/// the panda eats any pair summing to the round's target.
///
/// Mirrors `data/feedRounds.js`.
public enum FeedPools {
    public static let targets: [Int] = [5, 6, 7, 8, 9]
    public static let bubblesPerRound: [Int] = [5, 5, 7, 8, 9]
    public static let pairsPerRoundCap: Int = 3

    public struct Round {
        public let target: Int
        public let candidates: [Int]
        public let pairCount: Int
    }

    public static func targetFor(_ roundIdx: Int) -> Int {
        targets[min(roundIdx, targets.count - 1)]
    }

    public static func bubbleCountFor(_ roundIdx: Int) -> Int {
        bubblesPerRound[min(roundIdx, bubblesPerRound.count - 1)]
    }

    /// Every unordered pair of DISTINCT digits 1..9 summing to `target`.
    public static func pairsForTarget(_ target: Int) -> [[Int]] {
        var out: [[Int]] = []
        for lo in 1..<(target / 2) where target - lo > lo {
            let hi = target - lo
            if hi <= 9 { out.append([lo, hi]) }
        }
        return out
    }

    /// Build one round's board.
    ///
    /// When no RNG is supplied, generation is deterministic for `roundIdx`.
    /// This is important for SwiftUI: `body` can be evaluated many times,
    /// so a random board must not silently change while the child view is
    /// still displaying the same round. Tests and QA can still inject a
    /// seeded/custom RNG when they need controlled generation.
    public static func build(roundIdx: Int, rng: (() -> Double)? = nil) -> Round {
        let random: () -> Double
        if let rng {
            random = rng
        } else {
            var state = UInt64(roundIdx + 1) &* 0x9E3779B97F4A7C15
            random = {
                state ^= state >> 12
                state ^= state << 25
                state ^= state >> 27
                let value = state &* 0x2545F4914F6CDD1D
                return Double(value % 1_000_000) / 1_000_000.0
            }
        }

        let target = targetFor(roundIdx)
        let wanted = bubbleCountFor(roundIdx)
        let allPairs = pairsForTarget(target)
        let pairCount = min(pairsPerRoundCap, allPairs.count, wanted / 2)
        let chosen = Array(allPairs.shuffled(with: random).prefix(pairCount))
        let digits = chosen.flatMap { $0 }
        var used = Set(digits)
        var distractors: [Int] = []
        for d in ([1, 2, 3, 4, 5, 6, 7, 8, 9].shuffled(with: random)) {
            if used.contains(d) { continue }
            if used.contains(target - d) { continue }
            used.insert(d)
            distractors.append(d)
        }
        let combined = (digits + distractors).prefix(wanted)
        let shuffled = Array(combined).shuffled(with: random)
        return Round(target: target, candidates: shuffled, pairCount: pairCount)
    }
}

// MARK: - Whack

/// "Whack" game — a 90-second timed round of 6-tile tap answers.
/// Type A (凑十) and Type B (不进位) alternate every 5 questions.
public enum WhackPools {
    public struct Question {
        public let type: String
        public let a: Int
        public let b: Int
        public let answer: Int
        public let candidates: [Int]
        public let key: String
    }

    /// Type A — 凑十 — distinct digits summing to 11..18.
    public static let typeAPool: [[Int]] = {
        var out: [[Int]] = []
        for a in 1...8 {
            for b in (a + 1)...9 {
                let s = a + b
                if s >= 11 && s <= 18 { out.append([a, b]) }
            }
        }
        return out
    }()

    /// Type B — 不进位 — teen + digit, sum stays in teen range.
    public static let typeBPool: [[Int]] = {
        var out: [[Int]] = []
        for teen in 11...18 {
            let upper = 18 - teen
            if upper < 1 { continue }
            for d in 1...upper {
                out.append([teen, d])
            }
        }
        return out
    }()

    private static let offsets: [Int] = [-4, -3, -2, -1, 1, 2, 3, 4]

    /// Pick the type for the given round counter. Every 5 questions, A↔B.
    public static func pickType(_ roundIdx: Int) -> String {
        (roundIdx / 5) % 2 == 0 ? "A" : "B"
    }

    /// Build one question, avoiding `prevKey` when possible.
    public static func buildQuestion(_ type: String, prevKey: String? = nil) -> Question {
        let pool = type == "A" ? typeAPool : typeBPool
        var pick: [Int] = pool.randomElement()!
        var tries = 0
        while "\(pick[0])-\(pick[1])" == prevKey && tries < 20 {
            pick = pool.randomElement()!
            tries += 1
        }
        let a = pick[0], b = pick[1]
        let answer = a + b
        var candidates: [Int] = [answer]
        for off in offsets {
            let d = answer + off
            if d >= 1 && d <= 19 && !candidates.contains(d) {
                candidates.append(d)
                if candidates.count == 6 { break }
            }
        }
        var topup = 1
        while candidates.count < 6 && topup <= 9 {
            if !candidates.contains(answer - topup) { candidates.append(answer - topup) }
            if candidates.count == 6 { break }
            if !candidates.contains(answer + topup) { candidates.append(answer + topup) }
            topup += 1
        }
        candidates.shuffle()
        return Question(type: type, a: a, b: b, answer: answer, candidates: candidates,
                        key: "\(a)-\(b)")
    }
}

// MARK: - Helpers

extension Array {
    /// Deterministic Fisher-Yates using a caller-supplied RNG (in [0, 1)).
    func shuffled(with rng: () -> Double) -> [Element] {
        var copy = self
        for i in (1..<copy.count).reversed() {
            let j = Int(rng() * Double(i + 1))
            if j != i { copy.swapAt(i, j) }
        }
        return copy
    }
}

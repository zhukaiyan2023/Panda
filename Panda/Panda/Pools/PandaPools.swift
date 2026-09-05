//
//  PandaPools.swift
//  Panda
//
//  Per-level round-pool generators. Each `generate*Pool()` enumerates
//  every valid round for that level; the round scene shuffles and
//  samples N at scene init.
//
//  Mirrors `data/pools.js` exactly: same enumerations, same filters,
//  same answer fields. The new curriculum order (L1 = sub ≤ 10, etc.)
//  is reflected by `poolGensForLevel(_:)`.
//

import Foundation

public enum PandaPools {

    // MARK: Generators (named after the original curriculum order)

    /// L1 — 三数相加小于10. a,b,c ∈ {1..9} with a+b+c ≤ 10.
    /// 120 ordered triples.
    public static func generateThreeSum() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 1...9 {
            for b in 1...9 {
                for c in 1...9 {
                    if a + b + c > 10 { continue }
                    out.append(.threeSum(a: a, b: b, c: c))
                }
            }
        }
        return out
    }

    /// L2 — 两个数凑十. (a+b=10) or (b+c=10).
    public static func generateThreeTen() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 1...9 {
            for b in 1...9 {
                for c in 1...9 {
                    if a + b == 10 || b + c == 10 {
                        out.append(.threeTen(a: a, b: b, c: c))
                    }
                }
            }
        }
        return out
    }

    /// L3 — 凑十法. (a,b) ∈ {1..9}, a+b > 10.
    public static func generateMakeTen() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 1...9 {
            for b in 1...9 where a + b > 10 {
                out.append(.makeTen(a: a, b: b))
            }
        }
        return out
    }

    /// L4 — 二十以内 (no carry). a ∈ [11..19], b ∈ [1..9], ones(a)+b < 10.
    public static func generateTeenPlusDigit() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 11...19 {
            let ones = a % 10
            let bMax = 9 - ones
            // 1...0 is an empty range and traps at runtime — skip the
            // inner loop when bMax is 0 (i.e. a == 19, where ones == 9
            // and no valid b exists with ones(a) + b < 10).
            if bMax < 1 { continue }
            for b in 1...min(9, bMax) {
                out.append(.teenPlusDigit(a: a, b: b))
            }
        }
        return out
    }

    /// L5 — 十几加十几 (no carry). a, b ∈ [11..19], ones(a)+ones(b) ≤ 9.
    public static func generateTeenPlusTeen() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 11...19 {
            let onesA = a % 10
            let bMaxDigit = 9 - onesA
            for b in 11...19 {
                let onesB = b % 10
                if onesB > bMaxDigit { continue }
                out.append(.teenPlusTeen(a: a, b: b))
            }
        }
        return out
    }

    /// L6 — 十以内减法. a ∈ [1..10], b ∈ [1..a-1]. (a-a excluded per
    /// source feedback "不要出现相同的数相减".)
    public static func generateSubWithinTen() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 1...10 {
            for b in 1..<a {
                out.append(.subWithinTen(a: a, b: b))
            }
        }
        return out
    }

    /// L7 — 十几减几（不退位） — a ∈ [11..19], b ≤ ones(a).
    public static func generateTeenSubNoBorrow() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 11...19 {
            let ones = a % 10
            for b in 1...ones {
                out.append(.teenSubNoBorrow(a: a, b: b))
            }
        }
        return out
    }

    /// L8 — 十几减几（退位） — a ∈ [11..19], b > ones(a).
    public static func generateTeenSubBorrow() -> [PandaRound] {
        var out: [PandaRound] = []
        for a in 11...19 {
            let ones = a % 10
            // (ones+1)...9 would crash when ones == 9 (a == 19) — the
            // range becomes 10...9 which is empty. Skip the iteration
            // when no valid b exists.
            if ones + 1 > 9 { continue }
            for b in (ones + 1)...9 {
                out.append(.teenSubBorrow(a: a, b: b))
            }
        }
        return out
    }

    // MARK: Curriculum mapping (new IDs → generator)

    /// Map a level ID (1..8) to its generator. The curriculum was
    /// reordered so the L1 picker entry is sub-≤-10 (was L6), etc.
    /// Each level uses the math rule that matches its row in the
    /// picker; see `PandaCurriculum.mathLevels` for the mapping.
    public static func poolGensForLevel(_ levelId: Int) -> () -> [PandaRound] {
        switch levelId {
        case 1: return generateSubWithinTen
        case 2: return generateThreeSum
        case 3: return generateThreeTen
        case 4: return generateMakeTen
        case 5: return generateTeenPlusDigit
        case 6: return generateTeenPlusTeen
        case 7: return generateTeenSubNoBorrow
        case 8: return generateTeenSubBorrow
        default: return generateSubWithinTen
        }
    }
}

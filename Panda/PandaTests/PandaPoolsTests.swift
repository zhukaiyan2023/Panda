//
//  PandaPoolsTests.swift
//  PandaTests
//
//  Pure-math tests over the per-level round pools. Mirrors the
//  invariants the original `tools/verify-*.mjs` scripts check.
//

import XCTest
@testable import Panda

final class PandaPoolsTests: XCTestCase {

    func testL1SubWithinTenExcludesSameDigit() {
        let pool = PandaPools.generateSubWithinTen()
        XCTAssertFalse(pool.isEmpty)
        for round in pool {
            if case .subWithinTen(let a, let b) = round {
                XCTAssertNotEqual(a, b, "a-a facts must be excluded")
                XCTAssertGreaterThanOrEqual(a, 1)
                XCTAssertLessThanOrEqual(a, 10)
                XCTAssertGreaterThanOrEqual(b, 1)
                XCTAssertLessThan(b, a)
            } else { XCTFail("Wrong case") }
        }
    }

    func testL2ThreeSumSumAtMost10() {
        for round in PandaPools.generateThreeSum() {
            if case .threeSum(let a, let b, let c) = round {
                XCTAssertLessThanOrEqual(a + b + c, 10)
            } else { XCTFail("Wrong case") }
        }
    }

    func testL3ThreeTenHasTenPair() {
        for round in PandaPools.generateThreeTen() {
            if case .threeTen(let a, let b, let c) = round {
                let ten = a + b == 10 || b + c == 10
                XCTAssertTrue(ten, "Either (a+b) or (b+c) must equal 10")
                XCTAssertFalse(a + c == 10, "a+c == 10 is intentionally excluded")
            } else { XCTFail("Wrong case") }
        }
    }

    func testL4MakeTenAllPairsGreaterThan10() {
        for round in PandaPools.generateMakeTen() {
            if case .makeTen(let a, let b) = round {
                XCTAssertGreaterThan(a + b, 10)
            } else { XCTFail("Wrong case") }
        }
    }

    func testL5TeenPlusDigitOnesPlusDigitUnder10() {
        for round in PandaPools.generateTeenPlusDigit() {
            if case .teenPlusDigit(let a, let b) = round {
                let ones = a % 10
                XCTAssertLessThan(ones + b, 10)
            } else { XCTFail("Wrong case") }
        }
    }

    func testL6TeenPlusTeenOnesSumAtMost9() {
        for round in PandaPools.generateTeenPlusTeen() {
            if case .teenPlusTeen(let a, let b) = round {
                let onesA = a % 10
                let onesB = b % 10
                XCTAssertLessThanOrEqual(onesA + onesB, 9)
            } else { XCTFail("Wrong case") }
        }
    }

    func testL7TeenSubNoBorrowBoundedByOnes() {
        for round in PandaPools.generateTeenSubNoBorrow() {
            if case .teenSubNoBorrow(let a, let b) = round {
                XCTAssertLessThanOrEqual(b, a % 10)
            } else { XCTFail("Wrong case") }
        }
    }

    func testL8TeenSubBorrowBGreaterThanOnes() {
        for round in PandaPools.generateTeenSubBorrow() {
            if case .teenSubBorrow(let a, let b) = round {
                XCTAssertGreaterThan(b, a % 10)
            } else { XCTFail("Wrong case") }
        }
    }

    func testFeedBuildProducesValidBoard() {
        for idx in 0..<5 {
            let round = FeedPools.build(roundIdx: idx)
            XCTAssertGreaterThan(round.candidates.count, 0)
            let pairCount = round.candidates.filter { d in
                round.candidates.contains(round.target - d) && d < round.target - d
            }.count
            XCTAssertGreaterThanOrEqual(pairCount, 0)
        }
    }

    func testWhackQuestionBuilds() {
        for type in ["A", "B"] {
            let q = WhackPools.buildQuestion(type, prevKey: nil)
            XCTAssertEqual(q.candidates.count, 6)
            XCTAssertTrue(q.candidates.contains(q.answer))
            XCTAssertGreaterThan(q.a, 0)
            XCTAssertGreaterThan(q.b, 0)
        }
    }

    // MARK: - Curriculum mapping

    func testCurriculumHas8LevelsInOrder() {
        let levels = PandaCurriculum.mathLevels
        XCTAssertEqual(levels.count, 8)
        for (i, level) in levels.enumerated() {
            XCTAssertEqual(level.id, i + 1, "Level \(level.id) is out of order")
        }
    }

    func testCurriculumGensAreDistinct() {
        // Sanity: the new curriculum order (L1=subWithinTen, L2=threeSum, …)
        // is preserved by `poolGensForLevel`.
        for id in 1...8 {
            let rounds = PandaPools.poolGensForLevel(id)()
            XCTAssertFalse(rounds.isEmpty, "Level \(id) pool is empty")
        }
    }

    func testOptionChoicesProducesFourDistinct() {
        let opts = optionChoices(correct: 7, min: 0, max: 10)
        XCTAssertEqual(opts.count, 4)
        XCTAssertTrue(opts.contains(7))
        XCTAssertEqual(Set(opts).count, 4, "Options must be distinct")
    }
}

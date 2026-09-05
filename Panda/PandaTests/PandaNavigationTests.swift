//
//  PandaNavigationTests.swift
//  PandaTests
//
//  Tests for the save store (round/game progression, daily caps)
//  and the picker / curriculum metadata.
//

import XCTest
@testable import Panda

@MainActor
final class PandaNavigationTests: XCTestCase {

    // MARK: - Save store

    /// Reset the UserDefaults-backed store before each test so daily
    /// caps and stars don't leak between cases.
    private func freshStore() -> PandaSaveStore {
        let defaults = UserDefaults.standard
        let key = "panda-save-v2"
        defaults.removeObject(forKey: key)
        return PandaSaveStore()
    }

    func testFreshStoreStartsWithAllLevelsUnlocked() {
        let store = freshStore()
        // Default is all-unlocked so a fresh install can play anything.
        XCTAssertEqual(store.save.unlockedLevel, 8)
        XCTAssertEqual(store.save.unlockedGame, 6)
        XCTAssertTrue(store.save.starsByLevel.isEmpty)
    }

    func testRoundFinishedUnlocksNext() {
        let store = freshStore()
        _ = store.markRoundFinished(1)
        XCTAssertGreaterThanOrEqual(store.save.unlockedLevel, 2)
        XCTAssertEqual(store.save.starsByLevel[1], 1)
    }

    func testRoundFinishedHitsDailyCap() {
        let store = freshStore()
        // Level 1 has cap 6.
        var locked = false
        for _ in 0..<6 {
            let result = store.markRoundFinished(1)
            locked = result.locked
        }
        XCTAssertTrue(locked, "After 6 rounds the level should be locked")
        XCTAssertTrue(store.isLevelDailyLocked(1))
    }

    func testRoundFinishedPersistsAcrossInstances() {
        let store1 = freshStore()
        _ = store1.markRoundFinished(2)
        // A fresh instance reads from UserDefaults.
        let store2 = freshStore()
        XCTAssertEqual(store2.save.starsByLevel[2], 1)
        XCTAssertGreaterThanOrEqual(store2.save.unlockedLevel, 3)
    }

    func testGameRoundFinishedStars() {
        let store = freshStore()
        store.markGameRoundFinished(1)
        store.markGameRoundFinished(1)
        XCTAssertEqual(store.save.starsByGame[1], 2)
    }

    // MARK: - Curriculum metadata

    func testCurriculumOrderIsClean() {
        let levels = PandaCurriculum.mathLevels
        // Curriculum is renumbered so L1 = sub-≤-10, L2 = threeSum, …
        XCTAssertEqual(levels.map(\.id), Array(1...8))
    }

    func testCurriculumGensMatchExpectedLevels() {
        // Each level's pool must contain at least one round that
        // satisfies its rule. Sample 1 to keep the test fast.
        let l1 = PandaPools.poolGensForLevel(1)().prefix(20)
        XCTAssertFalse(l1.contains(where: { round in
            if case .subWithinTen = round { return false }; return true
        }), "L1 pool should only contain subWithinTen")
        let l4 = PandaPools.poolGensForLevel(4)().prefix(20)
        XCTAssertFalse(l4.contains(where: { round in
            if case .makeTen = round { return false }; return true
        }), "L4 pool should only contain makeTen")
    }

    func testGameMetadataCount() {
        // 6 games: count + boat + bounce + cloud + feed + whack.
        XCTAssertEqual(PandaCurriculum.games.count, 6)
    }
}

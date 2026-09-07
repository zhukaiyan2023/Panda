import XCTest
@testable import Panda

@MainActor
final class GameLifecycleTokenTests: XCTestCase {
    func testResetInvalidatesCapturedGeneration() {
        let token = GameLifecycleToken()
        let captured = token.capture()

        XCTAssertTrue(token.isCurrent(captured))
        token.reset()
        XCTAssertFalse(token.isCurrent(captured))
    }

    func testScheduledWorkIsCancelledByReset() async {
        let token = GameLifecycleToken()
        var fired = false

        token.schedule(after: 0.05) {
            fired = true
        }
        token.reset()

        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertFalse(fired, "A callback from a previous game lifecycle must never fire")
    }

    func testOnlyCurrentGenerationCallbackRuns() async {
        let token = GameLifecycleToken()
        var fired = false

        token.schedule(after: 0.02) {
            fired = true
        }

        try? await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertTrue(fired)
    }
}

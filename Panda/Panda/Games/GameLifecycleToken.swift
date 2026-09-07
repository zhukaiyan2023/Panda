import Foundation

/// Small, thread-safe generation token for invalidating delayed game callbacks.
///
/// A game increments the generation whenever a round/session is left or reset.
/// Delayed work captures the current generation and must verify it before mutating
/// game state. This prevents stale callbacks from an old round from advancing a
/// newly-created round after navigation or re-entry.
@MainActor
final class GameLifecycleToken {
    private(set) var generation: UInt = 0

    func reset() {
        generation &+= 1
    }

    func capture() -> UInt {
        generation
    }

    func isCurrent(_ capturedGeneration: UInt) -> Bool {
        generation == capturedGeneration
    }
}

extension GameLifecycleToken {
    /// Schedule work that is automatically ignored if the lifecycle generation
    /// has changed before the delay expires.
    func schedule(after delay: TimeInterval, _ work: @escaping @MainActor () -> Void) {
        let capturedGeneration = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.generation == capturedGeneration else { return }
            work()
        }
    }
}

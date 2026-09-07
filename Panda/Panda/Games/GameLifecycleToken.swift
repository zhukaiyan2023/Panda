import Foundation

/// Generation-based lifecycle guard for game callbacks.
///
/// A game invalidates the current generation whenever it leaves, resets, or
/// starts a new session. Delayed work captures the generation and is ignored
/// when it is no longer current. This prevents stale callbacks from an old
/// round mutating a newly-created round.
@MainActor
final class GameLifecycleToken {
    private(set) var generation: UInt = 0
    private var scheduledTasks: [UUID: Task<Void, Never>] = [:]

    func reset() {
        generation &+= 1
        cancelScheduledWork()
    }

    func capture() -> UInt {
        generation
    }

    func isCurrent(_ capturedGeneration: UInt) -> Bool {
        generation == capturedGeneration
    }

    /// Invalidates the current generation without otherwise changing game state.
    func invalidate() {
        generation &+= 1
        cancelScheduledWork()
    }

    /// Cancels all delayed lifecycle work. Call from a game's disappearance/back action.
    func cancelScheduledWork() {
        for task in scheduledTasks.values {
            task.cancel()
        }
        scheduledTasks.removeAll(keepingCapacity: true)
    }

    /// Schedule lifecycle-safe delayed work. The task is cancelled automatically
    /// when the generation changes or when `cancelScheduledWork()` is called.
    func schedule(after delay: TimeInterval, _ work: @escaping @MainActor () -> Void) {
        let capturedGeneration = generation
        let id = UUID()
        let nanoseconds = UInt64(max(0, delay) * 1_000_000_000)

        let task = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(nanoseconds: nanoseconds)
            } catch {
                return
            }

            guard !Task.isCancelled,
                  let self,
                  self.generation == capturedGeneration else { return }

            self.scheduledTasks.removeValue(forKey: id)
            work()
        }
        scheduledTasks[id] = task
    }
}

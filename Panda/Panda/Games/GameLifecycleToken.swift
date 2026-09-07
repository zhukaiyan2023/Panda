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

    private static let maxDelay: TimeInterval = 60 * 60

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

    /// Schedule lifecycle-safe delayed work. Invalid or unreasonably large delays
    /// are ignored rather than overflowing the nanosecond conversion.
    func schedule(after delay: TimeInterval, _ work: @escaping @MainActor () -> Void) {
        guard delay.isFinite, delay >= 0 else { return }

        let capturedGeneration = generation
        let id = UUID()
        let safeDelay = min(delay, Self.maxDelay)
        let nanoseconds = UInt64(safeDelay * 1_000_000_000)

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

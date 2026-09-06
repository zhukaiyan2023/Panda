//
//  PandaAudio.swift
//  Panda
//
//  Lightweight audio engine used by every level / game.
//
//  Audio cues are referenced by string id (e.g. "l1-s1-2-3", "boat-intro",
//  "enc-first-1"). The engine first tries to load the MP3 from the app
//  bundle — `audio/<cue-id>.mp3`. If the cue isn't bundled, it falls
//  back to a 1-second silent tone so the call chain still walks.
//
//  Playback is intentionally single-channel. Starting a new top-level cue
//  cancels stale playback, while sequences and playAfter are serialized so
//  narration can never overlap itself.
//

import Foundation
import AVFoundation
import Combine

@MainActor
public final class PandaAudio: ObservableObject {
    public static let shared = PandaAudio()

    private var players: [String: AVAudioPlayer] = [:]
    private var sessionConfigured = false

    /// Monotonically increasing token used to invalidate delayed callbacks
    /// whenever navigation / a new cue cancels the previous playback.
    private var generation: UInt64 = 0
    private var operationTask: Task<Void, Never>?
    private var currentPlayer: AVAudioPlayer?
    private var currentCueId: String?
    private var isBusy = false
    private var idleCallbacks: [() -> Void] = []

    private init() {}

    // MARK: Public API

    public func configureSession() {
        guard !sessionConfigured else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
            sessionConfigured = true
        } catch {
            print("[PandaAudio] session config failed: \(error)")
        }
    }

    /// Play one cue by id. A new top-level cue owns the narration channel:
    /// any previous prompt / answer is stopped before this cue starts.
    /// Completion is tied to the player's actual `isPlaying` state instead
    /// of trusting `AVAudioPlayer.duration` alone, preventing the next
    /// question from appearing a fraction too early on longer narration.
    public func playCue(_ id: String, onComplete: (() -> Void)? = nil) {
        guard !id.isEmpty else {
            onComplete?()
            return
        }
        configureSession()
        cancelCurrentPlayback(clearIdleCallbacks: true)
        generation &+= 1
        let token = generation
        isBusy = true

        guard let player = playerFor(id) else {
            isBusy = false
            onComplete?()
            flushIdleCallbacks()
            return
        }

        start(player: player, cueId: id)
        operationTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.waitUntilFinished(player)
            guard !Task.isCancelled, self.generation == token else { return }
            self.currentPlayer = nil
            self.currentCueId = nil
            self.operationTask = nil
            self.isBusy = false
            onComplete?()
            self.flushIdleCallbacks()
        }
    }

    /// Play a sequence of cues one after the other. Starting a sequence
    /// cancels stale playback first; cues inside the sequence never overlap.
    public func playSequence(_ ids: [String], gapMs: Int = 200, onComplete: (() -> Void)? = nil) {
        let cleanIds = ids.filter { !$0.isEmpty }
        guard !cleanIds.isEmpty else {
            onComplete?()
            return
        }
        configureSession()
        cancelCurrentPlayback(clearIdleCallbacks: true)
        generation &+= 1
        let token = generation
        isBusy = true
        operationTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.runSequence(cleanIds, gapMs: gapMs, token: token)
            guard !Task.isCancelled, self.generation == token else { return }
            self.currentPlayer = nil
            self.currentCueId = nil
            self.operationTask = nil
            self.isBusy = false
            onComplete?()
            self.flushIdleCallbacks()
        }
    }

    /// Play a sequence only after `prevId` has finished.
    public func playAfter(_ prevId: String?, then ids: [String], gapMs: Int = 200, seqGapMs: Int = 40,
                          onComplete: (() -> Void)? = nil) {
        let cleanIds = ids.filter { !$0.isEmpty }
        guard !cleanIds.isEmpty else {
            onComplete?()
            return
        }
        configureSession()

        // Keep the current player alive only when it is exactly the cue the
        // caller asked us to wait for. Then observe the player's real end,
        // rather than estimating it from `duration - currentTime`.
        if let prevId,
           currentCueId == prevId,
           let player = currentPlayer,
           player.isPlaying {
            operationTask?.cancel()
            generation &+= 1
            let token = generation
            isBusy = true
            operationTask = Task { @MainActor [weak self] in
                guard let self else { return }
                await self.waitUntilFinished(player)
                guard !Task.isCancelled, self.generation == token else { return }
                try? await Task.sleep(for: .milliseconds(max(0, gapMs)))
                guard !Task.isCancelled, self.generation == token else { return }
                self.currentPlayer = nil
                self.currentCueId = nil
                await self.runSequence(cleanIds, gapMs: seqGapMs, token: token)
                guard !Task.isCancelled, self.generation == token else { return }
                self.currentPlayer = nil
                self.currentCueId = nil
                self.operationTask = nil
                self.isBusy = false
                onComplete?()
                self.flushIdleCallbacks()
            }
        } else {
            playSequence(cleanIds, gapMs: seqGapMs, onComplete: onComplete)
        }
    }

    /// Run `callback` once the narration channel becomes idle. Unlike a
    /// fixed DispatchQueue delay this follows the actual player state.
    public func whenIdle(_ callback: @escaping () -> Void) {
        if isBusy || currentPlayer?.isPlaying == true {
            idleCallbacks.append(callback)
        } else {
            callback()
        }
    }

    public func preloadCueIds(_ ids: [String]) {
        for id in ids {
            _ = playerFor(id)
        }
    }

    /// Stop all in-flight audio and invalidate every delayed continuation.
    public func stopAllAudio() {
        cancelCurrentPlayback(clearIdleCallbacks: true)
        generation &+= 1
        for (_, player) in players {
            player.stop()
            player.currentTime = 0
        }
    }

    // MARK: Internals

    private func cancelCurrentPlayback(clearIdleCallbacks: Bool) {
        operationTask?.cancel()
        operationTask = nil
        currentPlayer?.stop()
        currentPlayer = nil
        currentCueId = nil
        isBusy = false
        if clearIdleCallbacks {
            idleCallbacks.removeAll()
        }
    }

    private func start(player: AVAudioPlayer, cueId: String) {
        player.stop()
        player.currentTime = 0
        player.prepareToPlay()
        currentPlayer = player
        currentCueId = cueId
        player.play()
    }

    /// Wait until AVAudioPlayer has actually stopped. A small polling
    /// interval avoids the race where a duration-based timer fires a few
    /// milliseconds before the audio renderer finishes.
    private func waitUntilFinished(_ player: AVAudioPlayer) async {
        while !Task.isCancelled && player.isPlaying {
            try? await Task.sleep(for: .milliseconds(20))
        }
    }

    private func runSequence(_ ids: [String], gapMs: Int, token: UInt64) async {
        for (index, id) in ids.enumerated() {
            guard !Task.isCancelled, generation == token else { return }
            guard let player = playerFor(id) else { continue }
            start(player: player, cueId: id)
            await waitUntilFinished(player)
            guard !Task.isCancelled, generation == token else { return }
            if index < ids.count - 1 {
                try? await Task.sleep(for: .milliseconds(max(0, gapMs)))
            }
        }
    }

    private func flushIdleCallbacks() {
        guard !isBusy, currentPlayer?.isPlaying != true, !idleCallbacks.isEmpty else { return }
        let callbacks = idleCallbacks
        idleCallbacks.removeAll()
        callbacks.forEach { $0() }
    }

    private func playerFor(_ id: String) -> AVAudioPlayer? {
        if let player = players[id] { return player }
        guard let url = lookupCueURL(for: id) else { return nil }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.prepareToPlay()
            players[id] = player
            return player
        } catch {
            print("[PandaAudio] failed to create player for \(id): \(error)")
            return nil
        }
    }

    private func lookupCueURL(for id: String) -> URL? {
        let safe = id.replacingOccurrences(of: "/", with: "_")
        if let bundleURL = Bundle.main.url(forResource: safe, withExtension: "mp3") {
            return bundleURL
        }
        if let bundleURL = Bundle.main.url(forResource: safe, withExtension: "mp3", subdirectory: "audio") {
            return bundleURL
        }
        return silentCueURL(for: safe)
    }

    private func silentCueURL(for id: String) -> URL? {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        let dir = caches?.appendingPathComponent("panda-cues", isDirectory: true)
            ?? URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("panda-cues", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(id).wav")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        return SilentWAV.write(to: url, durationSeconds: 1.0) ? url : nil
    }
}

// MARK: - Silent WAV writer

enum SilentWAV {
    static func write(to url: URL, durationSeconds: Double, sampleRate: UInt32 = 8000) -> Bool {
        let samples = UInt32(Double(sampleRate) * durationSeconds)
        let bytesPerSample: UInt16 = 2
        let numChannels: UInt16 = 1
        let byteRate = sampleRate * UInt32(numChannels) * UInt32(bytesPerSample)
        let blockAlign = numChannels * bytesPerSample
        let dataSize = samples * UInt32(numChannels) * UInt32(bytesPerSample)
        let chunkSize: UInt32 = 36 + dataSize

        var data = Data()
        data.append("RIFF".data(using: .ascii)!)
        data.appendLE(uint32: chunkSize)
        data.append("WAVE".data(using: .ascii)!)
        data.append("fmt ".data(using: .ascii)!)
        data.appendLE(uint32: 16)
        data.appendLE(uint16: 1)
        data.appendLE(uint16: numChannels)
        data.appendLE(uint32: sampleRate)
        data.appendLE(uint32: byteRate)
        data.appendLE(uint16: blockAlign)
        data.appendLE(uint16: bytesPerSample * 8)
        data.append("data".data(using: .ascii)!)
        data.appendLE(uint32: dataSize)
        data.append(Data(count: Int(dataSize)))

        do {
            try data.write(to: url)
            return true
        } catch {
            return false
        }
    }
}

private extension Data {
    mutating func appendLE(uint16 value: UInt16) {
        var v = value.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }

    mutating func appendLE(uint32 value: UInt32) {
        var v = value.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }
}

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
//  The original project's `tools/make-placeholders.js` emits 1-second
//  silent MP3s for any cue that doesn't have a real voice recording.
//  We replicate that contract: silent placeholders are fine, real voice
//  drops in just by adding the MP3 to the bundle.
//

import Foundation
import AVFoundation
import Combine

@MainActor
public final class PandaAudio: ObservableObject {
    public static let shared = PandaAudio()

    private var players: [String: AVAudioPlayer] = [:]
    private var sessionConfigured = false

    private init() {}

    // MARK: Public API

    /// Configure the AVAudioSession for playback. Safe to call multiple times.
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

    /// Play one cue by id. If no asset is bundled for the id we fall
    /// back to silence.
    public func playCue(_ id: String) {
        guard !id.isEmpty else { return }
        configureSession()
        let player = playerFor(id)
        guard let player = player else { return }
        player.stop()
        player.currentTime = 0
        player.play()
    }

    /// Play a sequence of cues one after the other.
    public func playSequence(_ ids: [String], gapMs: Int = 200, onComplete: (() -> Void)? = nil) {
        playSequenceInternal(ids: ids, gapMs: gapMs, index: 0, onComplete: onComplete)
    }

    /// Play a sequence AFTER the previous cue finishes.
    public func playAfter(_ prevId: String?, then ids: [String], gapMs: Int = 200, seqGapMs: Int = 40,
                          onComplete: (() -> Void)? = nil) {
        guard !ids.isEmpty else {
            onComplete?()
            return
        }
        if let prevId = prevId, let prev = players[prevId] {
            NotificationCenter.default.removeObserver(self, name: .pandaAudioDidFinish, object: prev)
            NotificationCenter.default.addObserver(
                forName: .pandaAudioDidFinish,
                object: prev,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.playSequence(ids, gapMs: seqGapMs, onComplete: onComplete)
                }
            }
            // Safety ceiling.
            let delay = max(1.0, prev.duration + Double(gapMs) / 1000.0)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                Task { @MainActor in
                    self?.playSequence(ids, gapMs: seqGapMs, onComplete: onComplete)
                }
            }
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                Task { @MainActor in
                    self?.playSequence(ids, gapMs: seqGapMs, onComplete: onComplete)
                }
            }
        }
    }

    /// Pre-create players for a list of cues so the first playback is
    /// gap-free.
    public func preloadCueIds(_ ids: [String]) {
        for id in ids {
            _ = playerFor(id)
        }
    }

    /// Stop all in-flight audio.
    public func stopAllAudio() {
        for (_, p) in players { p.stop() }
    }

    // MARK: Internals

    private func playSequenceInternal(ids: [String], gapMs: Int, index: Int,
                                      onComplete: (() -> Void)?) {
        guard index < ids.count else {
            onComplete?()
            return
        }
        let id = ids[index]
        guard let player = playerFor(id) else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                Task { @MainActor in
                    self?.playSequenceInternal(ids: ids, gapMs: gapMs, index: index + 1, onComplete: onComplete)
                }
            }
            return
        }
        player.stop()
        player.currentTime = 0
        player.play()
        NotificationCenter.default.removeObserver(self, name: .pandaAudioDidFinish, object: player)
        NotificationCenter.default.addObserver(
            forName: .pandaAudioDidFinish,
            object: player,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.playSequenceInternal(ids: ids, gapMs: gapMs, index: index + 1, onComplete: onComplete)
            }
        }
        // Safety ceiling.
        let delay = max(0.6, player.duration + Double(gapMs) / 1000.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            Task { @MainActor in
                self?.playSequenceInternal(ids: ids, gapMs: gapMs, index: index + 1, onComplete: onComplete)
            }
        }
    }

    /// Look up or create a player for the given cue id. The engine
    /// first looks in the main bundle (`audio/<id>.mp3`), then falls
    /// back to a synthesised silent WAV.
    private func playerFor(_ id: String) -> AVAudioPlayer? {
        if let p = players[id] { return p }
        guard let url = lookupCueURL(for: id) else { return nil }
        do {
            let p = try AVAudioPlayer(contentsOf: url)
            p.prepareToPlay()
            players[id] = p
            return p
        } catch {
            return nil
        }
    }

    /// Returns a file URL for the cue id — bundle resource if present,
    /// otherwise a synthesised silent WAV in the cache.
    private func lookupCueURL(for id: String) -> URL? {
        let safe = id.replacingOccurrences(of: "/", with: "_")
        // 1. Bundle root (Xcode's PBXFileSystemSynchronizedRootGroup
        //    flattens all resources to the bundle root).
        if let bundleURL = Bundle.main.url(forResource: safe, withExtension: "mp3") {
            return bundleURL
        }
        // 2. Some setups nest audio under audio/.
        if let bundleURL = Bundle.main.url(forResource: safe, withExtension: "mp3", subdirectory: "audio") {
            return bundleURL
        }
        // 3. Synthesised silent fallback.
        return silentCueURL(for: safe)
    }

    /// Build a silent WAV file once per cue id. The result is a
    /// 1-second silent tone at 8 kHz mono.
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

extension Notification.Name {
    public static let pandaAudioDidFinish = Notification.Name("PandaAudioDidFinish")
}

// MARK: - Silent WAV writer

/// Minimal WAV writer. Produces 1-second silent 8 kHz mono PCM.
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

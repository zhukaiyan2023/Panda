//
//  RoundScaffold.swift
//  Panda
//
//  The shared round scaffold every math level is built on.
//  A level provides a list of `StepRender` views; each step is
//  rendered in order, and interactive steps (with a `QuestionConfig`)
//  wait for a tap before advancing.
//
//  Mirrors `scenes/roundScene.js`.
//

import SwiftUI
import Combine

// MARK: - Step Render

public struct StepRender: View {
    public let anchor: AnyView?
    public let equation: AnyView?
    public let bodyView: AnyView?
    public let question: AnyView?
    public let reveal: AnyView?
    public let arrows: AnyView?

    public init(anchor: AnyView? = nil,
                equation: AnyView? = nil,
                bodyView: AnyView? = nil,
                question: AnyView? = nil,
                reveal: AnyView? = nil,
                arrows: AnyView? = nil) {
        // Caller must use the same argument order (anchor, equation,
        // bodyView, question, reveal, arrows). Swift requires named
        // arguments at call sites.
        self.anchor = anchor
        self.equation = equation
        self.bodyView = bodyView
        self.question = question
        self.reveal = reveal
        self.arrows = arrows
    }

    public var body: some View {
        VStack(spacing: 12) {
            if let anchor = anchor { anchor }
            if let bodyView = bodyView { bodyView }
            if let equation = equation { equation }
            if let question = question { question }
            if let reveal = reveal { reveal }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay {
            if let arrows = arrows { arrows }
        }
    }
}

// MARK: - Question Config

public struct QuestionConfig: View {
    public let correct: Int
    public let values: [Int]
    public let labelFor: (Int) -> String
    public let onPick: (Int) -> Void
    public let buttonWidth: CGFloat
    public let buttonHeight: CGFloat

    public init(correct: Int,
                values: [Int],
                labelFor: @escaping (Int) -> String = { "\($0)" },
                onPick: @escaping (Int) -> Void,
                buttonWidth: CGFloat = 100,
                buttonHeight: CGFloat = 80) {
        self.correct = correct
        self.values = values
        self.labelFor = labelFor
        self.onPick = onPick
        self.buttonWidth = buttonWidth
        self.buttonHeight = buttonHeight
    }

    public var body: some View {
        let shuffled = values.shuffled()
        HStack(spacing: 8) {
            ForEach(shuffled, id: \.self) { value in
                ChoiceButton(
                    label: labelFor(value),
                    width: buttonWidth,
                    height: buttonHeight
                ) {
                    onPick(value)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Round Scaffold

public struct RoundScaffold: View {
    public let levelId: Int
    public let sampleSize: Int
    public let stepLabels: [String]
    public let rounds: [PandaRound]
    public let stepBuilder: (PandaRound, Int, RoundHost) -> StepRender
    /// Called once a round's last step is answered correctly.
    /// Parameters: `audio` (shared audio engine), `round` (the
    /// current PandaRound for cue-id interpolation), and
    /// `lastEncourageId` (the cheer cue id that just fired — pass
    /// to `audio.playAfter(_:then:...)` so the reward reads
    /// AFTER the celebration tail, not over it).
    public let onRoundCorrect: ((PandaAudio, PandaRound, String?) -> Void)?
    public let introCue: String?
    /// Whether to draw the friendly panda companion in the bottom-left
    /// corner. Levels 1-8 (the math rounds) set this to `false` so the
    /// kid can focus on the equations without a distraction.
    public let showPanda: Bool

    @StateObject private var session: RoundSession
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss
    @State private var showDailyDone = false
    @State private var pandaMood: PandaMood = .idle

    public init(levelId: Int,
                sampleSize: Int,
                stepLabels: [String],
                poolGen: @escaping () -> [PandaRound],
                stepBuilder: @escaping (PandaRound, Int, RoundHost) -> StepRender,
                onRoundCorrect: ((PandaAudio, PandaRound, String?) -> Void)? = nil,
                introCue: String? = nil,
                showPanda: Bool = true) {
        self.levelId = levelId
        self.sampleSize = sampleSize
        self.stepLabels = stepLabels
        let sampled = Array(poolGen().shuffled().prefix(sampleSize))
        self.rounds = sampled
        self.stepBuilder = stepBuilder
        self.onRoundCorrect = onRoundCorrect
        self.introCue = introCue
        self.showPanda = showPanda
        _session = StateObject(wrappedValue: RoundSession(
            stepCount: stepLabels.count, roundCount: sampled.count))
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")

            VStack(spacing: 0) {
                chrome
                Spacer(minLength: 4)

                if let round = currentRound {
                    let host = RoundHost(
                        round: round,
                        levelId: levelId,
                        session: session,
                        advance: advanceStep,
                        finish: finishRound,
                        setPandaMood: setPandaMood,
                        audio: audio
                    )
                    stepBuilder(round, session.step, host)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .id("\(session.roundIndex)-\(session.step)")
                }

                Spacer(minLength: 8)
            }

            // Panda anchored to the bottom-LEFT of the screen, sitting
            // above the game content as a friendly companion. Hidden when
            // `showPanda == false` (e.g. the math levels L1-L8) so the
            // kid can focus on the equations without a distraction.
            if showPanda {
                VStack {
                    Spacer()
                    HStack {
                        PandaView(mood: pandaMood, size: 130)
                            .frame(width: 140, height: 130, alignment: .bottomLeading)
                            .padding(.leading, 8)
                            .padding(.bottom, 12)
                            .allowsHitTesting(false)
                        Spacer()
                    }
                }
            }
        }
        .safeAreaInset(edge: .top) { Color.clear.frame(height: 0) }
        .onAppear {
            audio.configureSession()
            // Per-level intro cue (e.g. "l1-intro-1-2-3") or generic.
            if introCue != nil {
                audio.playCue(introCue!)
            }
        }
        .fullScreenCover(isPresented: $showDailyDone) {
            DailyDoneView(onDismiss: { dismiss() })
        }
    }

    private var chrome: some View {
        HStack(spacing: 12) {
            // Back button — sized for portrait, anchored to the left.
            Button(action: {
                audio.stopAllAudio()
                session.reset()
                dismiss()
            }) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(PandaTheme.orange))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color(PandaTheme.ink), lineWidth: 4)
                        )
                    Text("←")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                }
                .frame(width: 60, height: 54)
            }
            .buttonStyle(.plain)

            // Step bar — flexes between the back button and a right-side
            // placeholder so the bar stays visually centred.
            StepBar(
                labels: stepLabels,
                step: session.step,
                totalSteps: stepLabels.count,
                width: nil
            )
            .frame(maxWidth: .infinity)
            .layoutPriority(1)

            // Symmetric placeholder to balance the back button so the
            // step bar stays visually centred.
            Color.clear.frame(width: 60, height: 54)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private var currentRound: PandaRound? {
        guard session.roundIndex < rounds.count else { return nil }
        return rounds[session.roundIndex]
    }

    private func setPandaMood(_ mood: PandaMood) {
        pandaMood = mood
        if mood != .idle {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                self.pandaMood = .idle
            }
        }
    }

    private func advanceStep() {
        audio.stopAllAudio()
        if session.step >= stepLabels.count {
            finishRound()
        } else {
            session.step += 1
        }
    }

    private func finishRound() {
        // Per-round reward audio (read-back the full equation).
        // We DON'T call `audio.stopAllAudio()` here because the
        // reward cue needs to play AFTER the just-fired cheer
        // (`enc-first-{levelId}`), not be cut off by a blanket
        // stop. The level's `onRoundCorrect` callback is
        // responsible for chaining the reward off the cheer if
        // it wants the full read-back; if it just plays a plain
        // `audio.playCue(...)`, we cancel any in-flight audio
        // *after* the cue has had a chance to start.
        if let round = currentRound {
            onRoundCorrect?(audio, round, session.lastEncourageId)
            // Give the reward cue ~0.05s to register with the
            // player before we stop anything else. Without this
            // brief delay, `audio.stopAllAudio()` (called when
            // the next round's anchor appears) would race the
            // reward cue's first frame.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak audio] in
                // No-op here — the reward keeps playing. This
                // hook only exists so the audio engine has a
                // tick to register the new player.
                _ = audio
            }
        }
        let daily = saveStore.markRoundFinished(levelId)
        if daily.locked {
            // Daily cap reached — stop in-flight audio so the
            // "做完了，真棒" daily-done cue isn't overlapped by the
            // still-running reward.
            audio.stopAllAudio()
            showDailyDone = true
            session.reset()
            return
        }
        if session.roundIndex + 1 < rounds.count {
            // Advance to the next round. Stop any leftover audio
            // FIRST so the next round's intro doesn't overlap the
            // tail of this round's reward.
            audio.stopAllAudio()
            session.roundIndex += 1
            session.step = 1
            // Drop the previous round's cheer anchor so the new
            // round's intro step audio plays immediately (not
            // chained off a cue that ended seconds ago).
            session.lastEncourageId = nil
        } else {
            // Last round of the session — pop back to picker.
            audio.stopAllAudio()
            session.reset()
            dismiss()
        }
    }
}

// MARK: - Session

@MainActor
public final class RoundSession: ObservableObject {
    @Published public var step: Int = 1
    @Published public var roundIndex: Int = 0
    /// The last "encouragement" (cheer) cue id played for this
    /// session — lives on the session (not the host) so it
    /// survives the per-render host rebuild. Used by
    /// `RoundHost.playStepAudio` to chain the next step's
    /// prompt off the celebration's `ended` event instead of
    /// overlapping it. Mirrors the JS `ctx.lastEncourageId`
    /// field that roundScene sets in `onPick`.
    @Published public var lastEncourageId: String?

    public let stepCount: Int
    public let roundCount: Int

    public init(stepCount: Int, roundCount: Int) {
        self.stepCount = stepCount
        self.roundCount = roundCount
    }

    public func reset() {
        step = 1
        roundIndex = 0
        lastEncourageId = nil
    }
}

// MARK: - Host

@MainActor
public final class RoundHost: ObservableObject {
    public let round: PandaRound
    public let levelId: Int
    public let advance: () -> Void
    public let finish: () -> Void
    public let setPandaMood: (PandaMood) -> Void
    public let session: RoundSession
    private let audio: PandaAudio?

    public init(round: PandaRound,
                levelId: Int,
                session: RoundSession,
                advance: @escaping () -> Void,
                finish: @escaping () -> Void,
                setPandaMood: @escaping (PandaMood) -> Void,
                audio: PandaAudio? = nil) {
        self.round = round
        self.levelId = levelId
        self.session = session
        self.advance = advance
        self.finish = finish
        self.setPandaMood = setPandaMood
        self.audio = audio
    }

    /// Reads the last played encouragement cue id from the
    /// session so it survives the per-render host rebuild.
    public var lastEncourageId: String? { session.lastEncourageId }

    /// Plays a single audio cue. The level step builders use this from
    /// inside the step closure to read the per-step prompt.
    public func playCue(_ id: String) {
        guard let audio = audio, !id.isEmpty else { return }
        audio.playCue(id)
    }

    /// Plays a sequence of audio cues with a tight inter-cue gap.
    /// Use for composite prompts that need to be heard as one
    /// sentence (e.g. "我们先把a拆成十加几" → "a加b等于几").
    public func playSequence(_ ids: [String], gapMs: Int = 40,
                             onComplete: (() -> Void)? = nil) {
        guard let audio = audio, !ids.isEmpty else {
            onComplete?()
            return
        }
        audio.playSequence(ids, gapMs: gapMs, onComplete: onComplete)
    }

    /// Plays a step's audio prompt. If `lastEncourageId` is set (the
    /// previous cheer hasn't finished yet), the prompt chains off
    /// its `ended` event so they don't overlap. Mirrors the JS
    /// `fireL3StepAudio` / `fireL5StepAudio` / `fireTeenStepAudio`
    /// helpers. The optional `onComplete` fires when the LAST cue
    /// in `ids` finishes, so the step can defer rendering the next
    /// equation until the audio lands.
    public func playStepAudio(_ ids: [String],
                              seqGapMs: Int = 40,
                              onComplete: (() -> Void)? = nil) {
        guard let audio = audio, !ids.isEmpty else {
            onComplete?()
            return
        }
        if let prev = lastEncourageId {
            audio.playAfter(prev, then: ids, gapMs: 400,
                            seqGapMs: seqGapMs, onComplete: onComplete)
        } else {
            audio.playSequence(ids, gapMs: seqGapMs, onComplete: onComplete)
        }
    }

    /// Plays the reward audio for a finished round (chained off the
    /// last cheer cue). Mirrors the `playAfter(ctx.lastEncourageId,
    /// answerIds, ...)` pattern at the end of every JS level's
    /// final-step `onAdvance`.
    public func playRewardAudio(_ ids: [String],
                                gapMs: Int = 200,
                                seqGapMs: Int = 200,
                                onComplete: (() -> Void)? = nil) {
        guard let audio = audio, !ids.isEmpty else {
            onComplete?()
            return
        }
        if let prev = lastEncourageId {
            audio.playAfter(prev, then: ids, gapMs: gapMs,
                            seqGapMs: seqGapMs, onComplete: onComplete)
        } else {
            audio.playSequence(ids, gapMs: seqGapMs, onComplete: onComplete)
        }
    }

    public func makeQuestion(correct: Int,
                             values: [Int],
                             labelFor: @escaping (Int) -> String = { "\($0)" },
                             buttonWidth: CGFloat = 100,
                             buttonHeight: CGFloat = 80) -> AnyView {
        AnyView(QuestionConfig(
            correct: correct,
            values: values,
            labelFor: labelFor,
            onPick: { value in self.handlePick(value: value, correct: correct) },
            buttonWidth: buttonWidth,
            buttonHeight: buttonHeight
        ))
    }

    private func handlePick(value: Int, correct: Int) {
        if value == correct {
            setPandaMood(.cheer)
            // Per-level "first correct" encouragement. Falls back to a
            // silent WAV when the pre-baked mp3 isn't bundled.
            // Mark this as the chain anchor for the next step's
            // prompt — same role `ctx.lastEncourageId` plays in JS.
            let cue = "enc-first-\(levelId)"
            audio?.playCue(cue)
            session.lastEncourageId = cue
            advance()
        } else {
            setPandaMood(.think)
            audio?.playCue("enc-wrong-\(levelId)")
        }
    }

    public func view<V: View>(_ v: V) -> AnyView { AnyView(v) }
}

// MARK: - Helpers

public func optionChoices(correct: Int,
                          min lo: Int = 0,
                          max hi: Int = 10,
                          prefer: [Int] = [],
                          count: Int = 4) -> [Int] {
    var picked: [Int] = []
    func add(_ v: Int) {
        if v >= lo && v <= hi && !picked.contains(v) { picked.append(v) }
    }
    add(correct)
    for p in prefer { add(p) }
    var d = 1
    while picked.count < count && d <= hi - lo {
        add(correct + d)
        add(correct - d)
        d += 1
    }
    return Array(picked.prefix(count))
}

extension Notification.Name {
    public static let pandaReturnToPicker = Notification.Name("PandaReturnToPicker")
}

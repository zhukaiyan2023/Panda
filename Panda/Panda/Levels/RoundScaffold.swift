//
//  RoundScaffold.swift
//  Panda
//
//  Shared round scaffold for math levels.
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

    public init(anchor: AnyView? = nil, equation: AnyView? = nil,
                bodyView: AnyView? = nil, question: AnyView? = nil,
                reveal: AnyView? = nil, arrows: AnyView? = nil) {
        self.anchor = anchor
        self.equation = equation
        self.bodyView = bodyView
        self.question = question
        self.reveal = reveal
        self.arrows = arrows
    }

    public var body: some View {
        VStack(spacing: 12) {
            if let anchor { anchor }
            if let bodyView { bodyView }
            if let equation { equation }
            if let question { question }
            if let reveal { reveal }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay { if let arrows { arrows } }
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

    @State private var displayedValues: [Int]

    public init(correct: Int, values: [Int],
                labelFor: @escaping (Int) -> String = { "\($0)" },
                onPick: @escaping (Int) -> Void,
                buttonWidth: CGFloat = 100, buttonHeight: CGFloat = 80) {
        self.correct = correct
        self.values = values
        self.labelFor = labelFor
        self.onPick = onPick
        self.buttonWidth = buttonWidth
        self.buttonHeight = buttonHeight
        _displayedValues = State(initialValue: values.shuffled())
    }

    public var body: some View {
        HStack(spacing: 8) {
            ForEach(displayedValues, id: \.self) { value in
                ChoiceButton(label: labelFor(value), width: buttonWidth, height: buttonHeight) {
                    onPick(value)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .onChange(of: values) { _, newValues in
            displayedValues = newValues.shuffled()
        }
    }
}

// MARK: - Round Scaffold

public struct RoundScaffold: View {
    public let levelId: Int
    public let sampleSize: Int
    public let stepLabels: [String]
    public let stepBuilder: (PandaRound, Int, RoundHost) -> StepRender
    public let onRoundCorrect: ((PandaAudio, PandaRound, String?) -> Void)?
    public let introCue: String?
    public let showPanda: Bool

    @State private var rounds: [PandaRound]
    @StateObject private var session: RoundSession
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss
    @State private var showDailyDone = false
    @State private var pandaMood: PandaMood = .idle

    public init(levelId: Int, sampleSize: Int, stepLabels: [String],
                poolGen: @escaping () -> [PandaRound],
                stepBuilder: @escaping (PandaRound, Int, RoundHost) -> StepRender,
                onRoundCorrect: ((PandaAudio, PandaRound, String?) -> Void)? = nil,
                introCue: String? = nil, showPanda: Bool = true) {
        self.levelId = levelId
        self.sampleSize = sampleSize
        let sampled = Array(poolGen().shuffled().prefix(sampleSize))
        _rounds = State(initialValue: sampled)
        self.stepLabels = stepLabels
        self.stepBuilder = stepBuilder
        self.onRoundCorrect = onRoundCorrect
        self.introCue = introCue
        self.showPanda = showPanda
        _session = StateObject(wrappedValue: RoundSession(stepCount: stepLabels.count,
                                                          roundCount: sampled.count))
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            VStack(spacing: 0) {
                chrome
                Spacer(minLength: 4)
                if let round = currentRound {
                    let host = RoundHost(round: round, levelId: levelId, session: session,
                                         advance: advanceStep, finish: finishRound,
                                         setPandaMood: setPandaMood, audio: audio)
                    stepBuilder(round, session.step, host)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .environment(\.pandaCurrentStepAnswer, session.currentStepAnswer)
                        .id("\(session.roundIndex)-\(session.step)")
                }
                Spacer(minLength: 8)
            }
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
            if let introCue { audio.playCue(introCue) }
        }
        .onDisappear {
            audio.stopAllAudio()
            session.isAnswerLocked = false
            session.lastStepAudioKey = nil
            session.currentStepAnswer = nil
        }
        .fullScreenCover(isPresented: $showDailyDone) {
            DailyDoneView(onDismiss: { dismiss() })
        }
    }

    private var chrome: some View {
        HStack(spacing: 12) {
            Button(action: {
                audio.stopAllAudio()
                session.reset()
                dismiss()
            }) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(PandaTheme.orange))
                        .overlay(RoundedRectangle(cornerRadius: 16)
                            .stroke(Color(PandaTheme.ink), lineWidth: 4))
                    Text("←")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                }
                .frame(width: 60, height: 54)
            }
            .buttonStyle(.plain)
            StepBar(labels: stepLabels, step: session.step,
                    totalSteps: stepLabels.count, width: nil)
                .frame(maxWidth: .infinity)
                .layoutPriority(1)
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
        // The correct-answer encouragement has already completed before
        // this method is reached. Invalidate any stale player/task before
        // the next step view starts its narration.
        audio.stopAllAudio()
        if session.step >= stepLabels.count {
            finishRound()
        } else {
            // The final step intentionally keeps its answer visible until
            // the round transition finishes. Earlier step answers are scoped
            // to the step that just completed and must not leak into the next
            // question's result box.
            session.currentStepAnswer = nil
            session.step += 1
        }
    }

    private func finishRound() {
        guard let round = currentRound else {
            completeRoundTransition()
            return
        }
        onRoundCorrect?(audio, round, session.lastEncourageId)
        // `RoundScaffold` is a struct (SwiftUI View), not a class.
        // Wait for the complete read-back/celebration chain before loading
        // the next round so the answer announcement is never cut short.
        audio.whenIdle {
            Task { @MainActor in
                self.completeRoundTransition()
            }
        }
    }

    private func completeRoundTransition() {
        let daily = saveStore.markRoundFinished(levelId)
        if daily.locked {
            audio.stopAllAudio()
            showDailyDone = true
            session.reset()
            return
        }
        if session.roundIndex + 1 < rounds.count {
            audio.stopAllAudio()
            session.roundIndex += 1
            session.step = 1
            session.lastEncourageId = nil
            session.lastStepAudioKey = nil
            session.isAnswerLocked = false
            session.currentStepAnswer = nil
        } else {
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
    @Published public var lastEncourageId: String?
    @Published public var isAnswerLocked = false

    /// Correct value selected for the currently active step. It is kept
    /// populated during the final-step celebration so the equation can
    /// visibly backfill the final result before the next round is loaded.
    @Published public var currentStepAnswer: Int?

    /// Prevents step narration from restarting when `stepBuilder` is
    /// evaluated repeatedly by SwiftUI. L2 historically started its
    /// narration directly from `stepBuilder`, so without this token a
    /// harmless redraw could cancel and restart the same MP3.
    @Published public var lastStepAudioKey: String?

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
        lastStepAudioKey = nil
        isAnswerLocked = false
        currentStepAnswer = nil
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

    public init(round: PandaRound, levelId: Int, session: RoundSession,
                advance: @escaping () -> Void, finish: @escaping () -> Void,
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

    public var lastEncourageId: String? { session.lastEncourageId }

    public func playCue(_ id: String) {
        guard let audio, !id.isEmpty else { return }
        audio.playCue(id)
    }

    public func playSequence(_ ids: [String], gapMs: Int = 40,
                             onComplete: (() -> Void)? = nil) {
        guard let audio, !ids.isEmpty else {
            onComplete?()
            return
        }
        audio.playSequence(ids, gapMs: gapMs, onComplete: onComplete)
    }

    public func playStepAudio(_ ids: [String], seqGapMs: Int = 40,
                              onComplete: (() -> Void)? = nil) {
        guard let audio, !ids.isEmpty else {
            onComplete?()
            return
        }

        // De-duplicate the same step cue across SwiftUI body evaluations.
        // The token includes both round and step, so the next question is
        // always eligible to start while redraws of the current question are
        // ignored.
        let key = "\(session.roundIndex)-\(session.step)-\(ids.joined(separator: "|"))"
        guard session.lastStepAudioKey != key else { return }
        session.lastStepAudioKey = key

        if let prev = lastEncourageId {
            audio.playAfter(prev, then: ids, gapMs: 400,
                            seqGapMs: seqGapMs, onComplete: onComplete)
        } else {
            audio.playSequence(ids, gapMs: seqGapMs, onComplete: onComplete)
        }
    }

    public func playRewardAudio(_ ids: [String], gapMs: Int = 200,
                                seqGapMs: Int = 200,
                                onComplete: (() -> Void)? = nil) {
        guard let audio, !ids.isEmpty else {
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

    public func makeQuestion(correct: Int, values: [Int],
                             labelFor: @escaping (Int) -> String = { "\($0)" },
                             buttonWidth: CGFloat = 100,
                             buttonHeight: CGFloat = 80) -> AnyView {
        let host = self
        return AnyView(QuestionConfig(
            correct: correct,
            values: values,
            labelFor: labelFor,
            onPick: { [weak host] value in
                host?.handlePick(value: value, correct: correct)
            },
            buttonWidth: buttonWidth,
            buttonHeight: buttonHeight
        ))
    }

    private func handlePick(value: Int, correct: Int) {
        guard !session.isAnswerLocked else { return }
        session.isAnswerLocked = true

        if value == correct {
            session.currentStepAnswer = value
            setPandaMood(.cheer)
            let cue = "enc-first-\(levelId)"
            session.lastEncourageId = cue

            guard let audio else {
                session.lastEncourageId = nil
                session.isAnswerLocked = false
                advance()
                return
            }

            let session = self.session
            let advance = self.advance
            // `playCue` owns the single audio channel: it stops the current
            // question narration first, then waits for the encouragement to
            // actually finish before advancing.
            audio.playCue(cue) {
                session.lastEncourageId = nil
                session.isAnswerLocked = false
                advance()
            }
        } else {
            setPandaMood(.think)
            guard let audio else {
                session.isAnswerLocked = false
                return
            }
            let session = self.session
            audio.playCue("enc-wrong-\(levelId)") {
                session.isAnswerLocked = false
            }
        }
    }

    public func view<V: View>(_ v: V) -> AnyView { AnyView(v) }
}

// MARK: - Helpers

public func optionChoices(correct: Int, min lo: Int = 0, max hi: Int = 10,
                          prefer: [Int] = [], count: Int = 4) -> [Int] {
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

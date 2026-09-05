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
    public let onRoundCorrect: ((PandaAudio, PandaRound) -> Void)?
    public let introCue: String?

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
                onRoundCorrect: ((PandaAudio, PandaRound) -> Void)? = nil,
                introCue: String? = nil) {
        self.levelId = levelId
        self.sampleSize = sampleSize
        self.stepLabels = stepLabels
        let sampled = Array(poolGen().shuffled().prefix(sampleSize))
        self.rounds = sampled
        self.stepBuilder = stepBuilder
        self.onRoundCorrect = onRoundCorrect
        self.introCue = introCue
        _session = StateObject(wrappedValue: RoundSession(
            stepCount: stepLabels.count, roundCount: sampled.count))
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")

            VStack(spacing: 0) {
                chrome
                Spacer(minLength: 4)

                ZStack(alignment: .topLeading) {
                    PandaView(mood: pandaMood, size: 130)
                        .frame(width: 140, height: 130, alignment: .topLeading)
                        .padding(.leading, 8)
                        .padding(.top, 4)
                        .allowsHitTesting(false)

                    if let round = currentRound {
                        let host = RoundHost(
                            round: round,
                            levelId: levelId,
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
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                Spacer(minLength: 8)
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
        // Per-round reward audio (read-back the full equation). The
        // callback returns immediately so the level can layer an extra
        // post-celebration cue without blocking round advance.
        if let round = currentRound {
            onRoundCorrect?(audio, round)
        }
        audio.stopAllAudio()
        let daily = saveStore.markRoundFinished(levelId)
        if daily.locked {
            showDailyDone = true
            session.reset()
            return
        }
        if session.roundIndex + 1 < rounds.count {
            session.roundIndex += 1
            session.step = 1
        } else {
            // Last round of the session — pop back to picker.
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
    public let stepCount: Int
    public let roundCount: Int

    public init(stepCount: Int, roundCount: Int) {
        self.stepCount = stepCount
        self.roundCount = roundCount
    }

    public func reset() {
        step = 1
        roundIndex = 0
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
    private let audio: PandaAudio?

    public init(round: PandaRound,
                levelId: Int,
                advance: @escaping () -> Void,
                finish: @escaping () -> Void,
                setPandaMood: @escaping (PandaMood) -> Void,
                audio: PandaAudio? = nil) {
        self.round = round
        self.levelId = levelId
        self.advance = advance
        self.finish = finish
        self.setPandaMood = setPandaMood
        self.audio = audio
    }

    /// Plays a single audio cue. The level step builders use this from
    /// inside the step closure to read the per-step prompt.
    public func playCue(_ id: String) {
        guard let audio = audio, !id.isEmpty else { return }
        audio.playCue(id)
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
            audio?.playCue("enc-first-\(levelId)")
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

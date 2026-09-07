//
//  RoundScaffold.swift
//  Panda
//
//  Shared round scaffold for math levels.
//

import SwiftUI
import Combine

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
        self.anchor = anchor; self.equation = equation; self.bodyView = bodyView
        self.question = question; self.reveal = reveal; self.arrows = arrows
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
                buttonWidth: CGFloat = 128, buttonHeight: CGFloat = 96) {
        self.correct = correct; self.values = values; self.labelFor = labelFor
        self.onPick = onPick; self.buttonWidth = buttonWidth; self.buttonHeight = buttonHeight
        _displayedValues = State(initialValue: values.shuffled())
    }

    private var normalizedValues: [Int] { Array(Set(values)).sorted() }

    public var body: some View {
        GeometryReader { geometry in
            let count = displayedValues.count
            let spacing: CGFloat = count > 1 ? 14 : 0
            let availableWidth = max(0, geometry.size.width - spacing * CGFloat(max(0, count - 1)))
            let adaptiveWidth = count > 0 ? availableWidth / CGFloat(count) : buttonWidth
            let resolvedWidth = min(buttonWidth, adaptiveWidth)
            HStack(spacing: spacing) {
                ForEach(displayedValues, id: \.self) { value in
                    ChoiceButton(label: labelFor(value), width: resolvedWidth, height: buttonHeight) {
                        onPick(value)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .frame(minHeight: buttonHeight)
        .contentShape(Rectangle())
        // Compare the choice SET rather than its order. Parent redraws may
        // recreate optionChoices in a different order; that must not reshuffle
        // the buttons while the child is deciding an answer.
        .onChange(of: normalizedValues) { _, newValues in
            let newSet = Set(newValues)
            guard Set(displayedValues) != newSet else { return }
            displayedValues = newValues.shuffled()
        }
    }
}

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
    @State private var lifecycle = GameLifecycleToken()
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss
    @State private var showDailyDone = false
    @State private var pandaMood: PandaMood = .idle
    @State private var moodToken = 0

    public init(levelId: Int, sampleSize: Int, stepLabels: [String],
                poolGen: @escaping () -> [PandaRound],
                stepBuilder: @escaping (PandaRound, Int, RoundHost) -> StepRender,
                onRoundCorrect: ((PandaAudio, PandaRound, String?) -> Void)? = nil,
                introCue: String? = nil, showPanda: Bool = true) {
        self.levelId = levelId; self.sampleSize = sampleSize
        let sampled = Array(poolGen().shuffled().prefix(sampleSize))
        _rounds = State(initialValue: sampled)
        self.stepLabels = stepLabels; self.stepBuilder = stepBuilder
        self.onRoundCorrect = onRoundCorrect; self.introCue = introCue; self.showPanda = showPanda
        _session = StateObject(wrappedValue: RoundSession(stepCount: stepLabels.count,
                                                          roundCount: sampled.count))
    }

    public var body: some View {
        GeometryReader { geo in
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
                            let pandaSize = min(130, max(92, min(geo.size.width * 0.16, geo.size.height * 0.16)))
                            PandaView(mood: pandaMood, size: pandaSize)
                                .frame(width: pandaSize + 10, height: pandaSize, alignment: .bottomLeading)
                                .padding(.leading, 8)
                                .padding(.bottom, 12)
                                .allowsHitTesting(false)
                            Spacer()
                        }
                    }
                }
            }
        }
        .onAppear {
            lifecycle.reset()
            audio.configureSession()
            if let introCue { audio.playCue(introCue) }
        }
        .onDisappear {
            lifecycle.reset(); moodToken &+= 1
            audio.stopAllAudio(); session.reset()
        }
        .fullScreenCover(isPresented: $showDailyDone) {
            DailyDoneView(onDismiss: { dismiss() })
        }
    }

    private var chrome: some View {
        ZStack {
            StepBar(labels: stepLabels, step: session.step,
                    totalSteps: max(stepLabels.count, 1), width: nil)
                .frame(maxWidth: .infinity)
                .padding(.leading, 70)
                .padding(.trailing, 12)
            HStack {
                IconButton(style: .back) {
                    lifecycle.reset(); audio.stopAllAudio(); session.reset(); dismiss()
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
    }

    private var currentRound: PandaRound? {
        guard session.roundIndex >= 0, session.roundIndex < rounds.count else { return nil }
        return rounds[session.roundIndex]
    }

    private func setPandaMood(_ mood: PandaMood) {
        pandaMood = mood
        guard mood != .idle else { return }
        moodToken &+= 1
        let token = moodToken
        lifecycle.schedule(after: 1.4) { [weak session] in
            guard let session, session.roundIndex < self.rounds.count,
                  token == self.moodToken else { return }
            self.pandaMood = .idle
        }
    }

    private func advanceStep() {
        guard !session.isTransitioning else { return }
        audio.stopAllAudio()
        if session.step >= stepLabels.count {
            finishRound()
        } else {
            session.currentStepAnswer = nil
            session.step += 1
            session.isAnswerLocked = false
        }
    }

    private func finishRound() {
        guard !session.isTransitioning else { return }
        guard let round = currentRound else { completeRoundTransition(); return }
        session.isTransitioning = true
        let capturedGeneration = lifecycle.capture()
        onRoundCorrect?(audio, round, session.lastEncourageId)
        audio.whenIdle { [weak session] in
            Task { @MainActor in
                guard let session, session.isTransitioning,
                      self.lifecycle.isCurrent(capturedGeneration) else { return }
                self.completeRoundTransition()
            }
        }
        lifecycle.schedule(after: 2.5) { [weak session] in
            guard let session, session.isTransitioning,
                  self.lifecycle.isCurrent(capturedGeneration) else { return }
            self.completeRoundTransition()
        }
    }

    private func completeRoundTransition() {
        guard session.isTransitioning else { return }
        let daily = saveStore.markRoundFinished(levelId)
        if daily.locked {
            lifecycle.reset(); audio.stopAllAudio(); showDailyDone = true; session.reset(); return
        }
        if session.roundIndex + 1 < rounds.count {
            audio.stopAllAudio()
            session.roundIndex += 1; session.step = 1
            session.lastEncourageId = nil; session.lastStepAudioKey = nil
            session.isAnswerLocked = false; session.currentStepAnswer = nil
            session.isTransitioning = false
        } else {
            lifecycle.reset(); audio.stopAllAudio(); session.reset(); dismiss()
        }
    }
}

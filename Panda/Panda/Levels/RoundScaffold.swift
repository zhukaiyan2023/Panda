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
    public let onAppearAction: (() -> Void)?

    public init(anchor: AnyView? = nil, equation: AnyView? = nil,
                bodyView: AnyView? = nil, question: AnyView? = nil,
                reveal: AnyView? = nil, arrows: AnyView? = nil,
                onAppearAction: (() -> Void)? = nil) {
        self.anchor = anchor
        self.equation = equation
        self.bodyView = bodyView
        self.question = question
        self.reveal = reveal
        self.arrows = arrows
        self.onAppearAction = onAppearAction
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
        .onAppear { onAppearAction?() }
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
    @State private var shuffledValues: [Int]
    @State private var rejectedValues: Set<Int> = []
    @State private var accepted = false
    @ObservedObject private var session: RoundSession

    public init(correct: Int, values: [Int], session: RoundSession,
                labelFor: @escaping (Int) -> String = { "\($0)" },
                onPick: @escaping (Int) -> Void,
                buttonWidth: CGFloat = 100, buttonHeight: CGFloat = 80) {
        self.correct = correct
        self.session = session
        self.values = values
        self.labelFor = labelFor
        self.onPick = onPick
        self.buttonWidth = buttonWidth
        self.buttonHeight = buttonHeight
        // Keep the caller's order stable across SwiftUI body rebuilds.
        _shuffledValues = State(initialValue: values.shuffled())
    }

    public var body: some View {
        HStack(spacing: 8) {
            ForEach(shuffledValues, id: \.self) { value in
                ChoiceButton(label: labelFor(value),
                             isCorrect: value == correct && (accepted || rejectedValues.count >= 2),
                             isDisabled: rejectedValues.contains(value),
                             width: buttonWidth, height: buttonHeight) {
                    guard !session.isAnswerLocked, !accepted else { return }
                    if value == correct { accepted = true }
                    else { rejectedValues.insert(value) }
                    onPick(value)
                }
                .allowsHitTesting(!session.isAnswerLocked && !accepted)
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
    public let onRoundCorrect: ((PandaAudio, PandaRound, String?) -> Void)?
    public let introCue: String?
    public let showPanda: Bool

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
        self.stepLabels = stepLabels
        let sampled = Array(poolGen().shuffled().prefix(sampleSize))
        self.rounds = sampled
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
            if session.isCelebrating {
                CorrectCelebrationOverlay(token: session.celebrationToken)
                    .id(session.celebrationToken)
                    .transition(.opacity)
                    .zIndex(20)
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
        // Audio completion has already happened before this method is called.
        // Stop any stale player before SwiftUI renders the next step.
        audio.stopAllAudio()
        if session.step >= stepLabels.count {
            finishRound()
        } else {
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
        // `RoundScaffold` is a struct (SwiftUI View), not a
        // class — `[weak self]` is invalid here. The closure runs
        // on the audio engine's queue; we hop back to the main
        // actor before mutating @StateObject state.
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
    @Published public var currentStepAnswer: Int?
    @Published public var celebrationToken = 0
    @Published public var isCelebrating = false

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
        isAnswerLocked = false
        currentStepAnswer = nil
        isCelebrating = false
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
            session: session,
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
        let session = self.session
        session.isAnswerLocked = true

        if value == correct {
            session.currentStepAnswer = value
            session.celebrationToken += 1
            session.isCelebrating = true
            let celebrationToken = session.celebrationToken
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.65) {
                guard session.celebrationToken == celebrationToken else { return }
                session.isCelebrating = false
            }
            setPandaMood(.cheer)
            let cue = "enc-first-\(encouragementAudioIndex)"
            session.lastEncourageId = cue

            guard let audio else {
                session.lastEncourageId = nil
                session.isAnswerLocked = false
                advance()
                return
            }

            // Capture the observable session and advance closure explicitly.
            // This avoids Swift 6's implicit-self capture diagnostic and also
            // keeps the completion focused on the same round state.
            let advance = self.advance
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
            audio.playCue("enc-wrong-\(wrongAnswerAudioIndex)") {
                session.isAnswerLocked = false
            }
        }
    }

    // The bundled encouragement library has four correct-answer clips and
    // three gentle retry clips. Levels 5–8 rotate through that real set
    // rather than requesting nonexistent level-numbered files.
    private var encouragementAudioIndex: Int { (levelId - 1) % 4 + 1 }
    private var wrongAnswerAudioIndex: Int { (levelId - 1) % 3 + 1 }

    public func view<V: View>(_ v: V) -> AnyView { AnyView(v) }
}

// MARK: - Correct answer celebration

private struct CorrectCelebrationOverlay: View {
    let token: Int

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isExpanded = false
    @State private var isFading = false

    private let colors: [Color] = [
        Color(PandaTheme.pink),
        Color(PandaTheme.yellow),
        Color(PandaTheme.blue),
        Color(PandaTheme.green),
        Color(PandaTheme.orange)
    ]

    // A fixed eight-step cycle makes every consecutive correct answer feel
    // different while keeping the sequence predictable and testable.
    private var variant: Int { token % 8 }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ForEach(0..<16, id: \.self) { index in
                    particle(index: index, size: proxy.size)
                }

                successBadge
                    .position(x: proxy.size.width * 0.5,
                              y: min(136, proxy.size.height * 0.18))

                RoundedRectangle(cornerRadius: 28)
                    .stroke(colors[variant % colors.count].opacity(isExpanded ? 0 : 0.72),
                            lineWidth: reduceMotion ? 8 : 12)
                    .padding(24)
                    .scaleEffect(reduceMotion ? 1 : (isExpanded ? 1.04 : 0.96))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            guard !reduceMotion else {
                isExpanded = true
                return
            }
            withAnimation(.spring(response: 0.48, dampingFraction: 0.68)) {
                isExpanded = true
            }
            do { try await Task.sleep(for: .seconds(1.15)) }
            catch { return }
            withAnimation(.easeOut(duration: 0.35)) { isFading = true }
        }
    }

    private var reward: (symbol: String, title: String) {
        switch variant {
        case 0: return ("party.popper.fill", "答对啦！")
        case 1: return ("star.fill", "真棒！")
        case 2: return ("bubbles.and.sparkles.fill", "算对啦！")
        case 3: return ("sparkles", "做得好！")
        case 4: return ("heart.fill", "为你点赞！")
        case 5: return ("hands.clap.fill", "为你鼓掌！")
        case 6: return ("flag.checkered", "又完成一步！")
        default: return ("medal.fill", "继续加油！")
        }
    }

    private var successBadge: some View {
        ZStack {
            Circle()
                .fill(Color(PandaTheme.success).opacity(0.2))
                .frame(width: 118, height: 118)
                .scaleEffect(reduceMotion ? 1 : (isExpanded ? 1.16 : 0.62))
                .opacity(reduceMotion ? 0.7 : (isExpanded ? 0 : 0.9))

            HStack(spacing: 10) {
                Image(systemName: reward.symbol)
                    .font(.system(size: 42, weight: .bold))
                Text(reward.title)
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
            }
            .foregroundStyle(Color(PandaTheme.ink))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(.white.opacity(0.94), in: Capsule())
            .overlay(Capsule().stroke(colors[variant % colors.count], lineWidth: 4))
            .shadow(color: Color(PandaTheme.success).opacity(0.35), radius: 12, y: 5)
            .scaleEffect(reduceMotion ? 1 : (isExpanded ? 1 : 0.42))
            .opacity(reduceMotion ? 1 : (isExpanded ? 1 : 0))
            .animation(
                reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.58),
                value: isExpanded
            )
        }
    }

    private func particle(index: Int, size: CGSize) -> some View {
        let start = point(index: index, size: size, expanded: false)
        let end = point(index: index, size: size, expanded: true)
        let point = reduceMotion ? end : (isExpanded ? end : start)
        let color = colors[index % colors.count]

        return particleShape(index: index, color: color)
        .scaleEffect(reduceMotion ? 1 : (isExpanded ? 1.5 : 0.5))
        .rotationEffect(.degrees(!reduceMotion && isExpanded ? Double(index * 29 + 150)
                                            : Double(index * 29)))
        .position(point)
        .animation(
            reduceMotion
                ? nil
                : .easeOut(duration: duration)
                    .delay(Double(index % 4) * 0.025),
            value: isExpanded
        )
        .opacity(isFading ? 0 : 1)
    }

    @ViewBuilder
    private func particleShape(index: Int, color: Color) -> some View {
        switch variant {
        case 0:
            if index.isMultiple(of: 3) {
                Image(systemName: "star.fill")
                    .font(.system(size: index.isMultiple(of: 2) ? 24 : 18,
                                  weight: .bold))
                    .foregroundStyle(color)
            } else {
                Capsule()
                    .fill(color)
                    .frame(width: 10, height: 26)
            }
        case 1:
            Image(systemName: index.isMultiple(of: 2) ? "star.fill" : "sparkle")
                .font(.system(size: index.isMultiple(of: 3) ? 30 : 20,
                              weight: .bold))
                .foregroundStyle(color)
        case 2:
            Circle()
                .fill(color.opacity(0.32))
                .overlay(Circle().stroke(color, lineWidth: 4))
                .frame(width: CGFloat(18 + (index % 3) * 7),
                       height: CGFloat(18 + (index % 3) * 7))
        case 3:
            RoundedRectangle(cornerRadius: 4)
                .fill(color)
                .frame(width: index.isMultiple(of: 2) ? 18 : 12,
                       height: index.isMultiple(of: 2) ? 18 : 28)
        case 4:
            Circle()
                .fill(color)
                .frame(width: CGFloat(10 + (index % 4) * 4),
                       height: CGFloat(10 + (index % 4) * 4))
        case 5:
            Image(systemName: index.isMultiple(of: 2) ? "sparkles" : "star.fill")
                .font(.system(size: index.isMultiple(of: 3) ? 28 : 18,
                              weight: .bold))
                .foregroundStyle(color)
        case 6:
            Capsule()
                .fill(color)
                .frame(width: 8, height: CGFloat(26 + (index % 3) * 8))
        default:
            Circle()
                .stroke(color, lineWidth: 5)
                .frame(width: CGFloat(20 + (index % 3) * 10),
                       height: CGFloat(20 + (index % 3) * 10))
        }
    }

    private var duration: Double {
        switch variant {
        case 1: return 0.82
        case 2: return 1.04
        case 3: return 0.78
        case 4: return 0.96
        case 5: return 0.88
        case 6: return 1.0
        case 7: return 0.9
        default: return 0.92
        }
    }

    private func point(index: Int, size: CGSize, expanded: Bool) -> CGPoint {
        switch variant {
        case 1:
            let angle = Double(index) / 16 * Double.pi * 2
            let radius = expanded ? min(size.width, size.height) * 0.46 : 72
            let center = CGPoint(x: size.width * 0.5, y: size.height * 0.48)
            return CGPoint(x: center.x + cos(angle) * radius,
                           y: center.y + sin(angle) * radius)
        case 2:
            let x = size.width * CGFloat(index + 1) / 17
            let startY = size.height + CGFloat(index % 3) * 10
            let endY = size.height * 0.1 + CGFloat(index % 4) * 24
            return CGPoint(x: x, y: expanded ? endY : startY)
        case 3:
            let fromLeft = index.isMultiple(of: 2)
            let row = index / 2
            let y = size.height * CGFloat(row + 1) / 9
            let startInset: CGFloat = 38
            let endInset: CGFloat = 142
            let inset = expanded ? endInset : startInset
            return CGPoint(x: fromLeft ? inset : size.width - inset, y: y)
        case 4:
            let x = size.width * CGFloat(index + 1) / 17
            let startY = -CGFloat(12 + (index % 4) * 16)
            let endY = size.height * 0.76 + CGFloat(index % 3) * 30
            return CGPoint(x: x, y: expanded ? endY : startY)
        case 5:
            let corner = index % 4
            let startInset: CGFloat = 52
            let endInset: CGFloat = 160 + CGFloat(index % 3) * 22
            let start: CGPoint
            let direction: CGPoint
            switch corner {
            case 0:
                start = CGPoint(x: startInset, y: startInset)
                direction = CGPoint(x: 1, y: 1)
            case 1:
                start = CGPoint(x: size.width - startInset, y: startInset)
                direction = CGPoint(x: -1, y: 1)
            case 2:
                start = CGPoint(x: size.width - startInset, y: size.height - startInset)
                direction = CGPoint(x: -1, y: -1)
            default:
                start = CGPoint(x: startInset, y: size.height - startInset)
                direction = CGPoint(x: 1, y: -1)
            }
            guard expanded else { return start }
            let spread = CGFloat((index / 4) * 38 - 56)
            return CGPoint(x: start.x + direction.x * endInset + spread,
                           y: start.y + direction.y * endInset - spread)
        case 6:
            let fromLeft = index.isMultiple(of: 2)
            let y = size.height * CGFloat(index + 1) / 17
            let startX: CGFloat = fromLeft ? -18 : size.width + 18
            let endX: CGFloat = fromLeft ? size.width * 0.4 : size.width * 0.6
            let startY = y
            let endY = y + (fromLeft ? 100 : -100)
            return CGPoint(x: expanded ? endX : startX,
                           y: expanded ? endY : startY)
        case 7:
            let corner = index % 4
            let startInset: CGFloat = 48
            let endInset: CGFloat = 132 + CGFloat(index % 3) * 18
            let inset = expanded ? endInset : startInset
            switch corner {
            case 0: return CGPoint(x: inset, y: inset)
            case 1: return CGPoint(x: size.width - inset, y: inset)
            case 2: return CGPoint(x: size.width - inset, y: size.height - inset)
            default: return CGPoint(x: inset, y: size.height - inset)
            }
        default:
            let side = index % 4
            let position = CGFloat(index / 4 + 1) / 5
            let inset: CGFloat = expanded ? 22 : 78
            switch side {
            case 0:
                return CGPoint(x: size.width * position, y: inset)
            case 1:
                return CGPoint(x: size.width - inset, y: size.height * position)
            case 2:
                return CGPoint(x: size.width * (1 - position), y: size.height - inset)
            default:
                return CGPoint(x: inset, y: size.height * (1 - position))
            }
        }
    }
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

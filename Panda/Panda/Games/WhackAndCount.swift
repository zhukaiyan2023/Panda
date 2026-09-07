import SwiftUI
import Combine
#if canImport(UIKit)
import UIKit
#endif

@MainActor
public struct WhackGameView: View {
    @State private var question: WhackPools.Question?
    @State private var prevKey: String?
    @State private var roundIdx = 0
    @State private var timeLeft = 90
    @State private var running = true
    @State private var tappedCorrect = -1
    @State private var wrongFlash = -1
    @State private var correctCount = 0
    @State private var done = false
    @State private var activeMole = 0
    @State private var hammerHitIdx = -1
    @State private var hammerHitToken = 0
    @State private var lifecycle = GameLifecycleToken()
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let moleCycle = Timer.publish(every: 1.4, on: .main, in: .common).autoconnect()
    public init() {}

    public var body: some View {
        ZStack { SceneBackground(name: "bg-meadow"); content }
            .onAppear {
                resetSession()
                audio.configureSession()
                audio.playCue("whack-intro")
                nextQuestion()
            }
            .onDisappear { running = false; lifecycle.reset(); audio.stopAllAudio() }
            .onReceive(timer) { _ in
                guard running, !done else { return }
                timeLeft -= 1
                if timeLeft <= 0 { running = false; finish() }
            }
            .onReceive(moleCycle) { _ in
                guard running, !done, tappedCorrect == -1, wrongFlash == -1,
                      let count = question?.candidates.count, count > 0 else { return }
                activeMole = (activeMole + 1) % count
            }
    }

    private func resetSession() {
        lifecycle.reset()
        lifecycle.cancelScheduledWork()
        question = nil
        prevKey = nil
        roundIdx = 0
        timeLeft = 90
        running = true
        tappedCorrect = -1
        wrongFlash = -1
        correctCount = 0
        done = false
        activeMole = 0
        hammerHitIdx = -1
        hammerHitToken = 0
    }

    @ViewBuilder private var content: some View {
        if let q = question {
            GeometryReader { geo in
                VStack(spacing: 12) {
                    chrome(in: geo.size)
                    StepBar(labels: [], step: min(correctCount + 1, 10), totalSteps: 10,
                            width: min(600, geo.size.width - 24), showsLabels: false)
                    equationBar(for: q, width: geo.size.width)
                    Spacer(minLength: 8)
                    moles(for: q, width: geo.size.width)
                    Spacer(minLength: 8)
                }
            }
        }
    }

    private func chrome(in size: CGSize) -> some View {
        ZStack {
            HStack(spacing: 8) {
                Text("⏱ \(timeLeft)")
                    .font(.pandaFont(size: min(26, size.width * 0.042)))
                    .foregroundColor(timeLeft <= 10 ? Color(PandaTheme.danger) : Color(PandaTheme.ink))
                    .padding(.horizontal, 18).padding(.vertical, 8)
                    .background(Capsule().fill(Color.white).overlay(Capsule().stroke(timeLeft <= 10 ? Color(PandaTheme.danger) : Color(PandaTheme.orange), lineWidth: 4)))
                Text("答对 \(correctCount)")
                    .font(.pandaFont(size: min(26, size.width * 0.042)))
                    .foregroundColor(Color(PandaTheme.ink))
                    .padding(.horizontal, 18).padding(.vertical, 8)
                    .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.success), lineWidth: 4)))
            }
            HStack {
                IconButton(style: .back) { leave() }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, min(32, max(16, size.width * 0.025))).padding(.top, 12)
    }

    private func equationBar(for q: WhackPools.Question, width: CGFloat) -> some View {
        let numberSize = min(56, max(34, width * 0.07))
        return HStack(spacing: max(6, width * 0.012)) {
            Text("\(q.a)").font(.pandaFont(size: numberSize)).foregroundColor(Color(PandaTheme.numBlue))
            Text("+").font(.pandaFont(size: numberSize * 0.86)).foregroundColor(Color(PandaTheme.ink))
            Text("\(q.b)").font(.pandaFont(size: numberSize)).foregroundColor(Color(PandaTheme.numPink))
            Text("=").font(.pandaFont(size: numberSize * 0.86)).foregroundColor(Color(PandaTheme.ink))
            Text(tappedCorrect >= 0 ? "\(q.answer)" : "?")
                .font(.pandaFont(size: numberSize)).foregroundColor(Color(tappedCorrect >= 0 ? PandaTheme.success : PandaTheme.orange))
                .padding(.horizontal, 12).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(PandaTheme.ink), lineWidth: 4)))
        }.padding(.top, 4)
    }

    private func moles(for q: WhackPools.Question, width: CGFloat) -> some View {
        let gap = min(18, max(8, width * 0.018))
        let horizontal = min(40, max(16, width * 0.035))
        let tile = min(220, max(90, (width - horizontal * 2 - gap * 2) / 3))
        let columns = Array(repeating: GridItem(.flexible(), spacing: gap), count: 3)
        return LazyVGrid(columns: columns, spacing: gap) {
            ForEach(Array(q.candidates.enumerated()), id: \.offset) { idx, value in
                MoleTile(value: value, isUp: activeMole == idx, tappedCorrect: tappedCorrect == value, wrongFlash: wrongFlash == value, hammerStrike: hammerHitIdx == idx, size: tile) {
                    handleTap(candidate: value, correct: q.answer, idx: idx)
                }.id("mole-\(idx)-\(hammerHitToken)")
            }
        }.padding(.horizontal, horizontal)
    }

    private func handleTap(candidate: Int, correct: Int, idx: Int) {
        guard running, !done, tappedCorrect == -1, wrongFlash == -1, activeMole == idx else { return }
        let expectedRound = roundIdx
        if candidate == correct {
            tappedCorrect = candidate
            correctCount += 1
            hammerHitIdx = idx
            hammerHitToken &+= 1
            activeMole = -1
            audio.playCue("whack-correct")
            lifecycle.schedule(after: 0.9) {
                guard self.running, !self.done, self.roundIdx == expectedRound else { return }
                self.nextQuestion(); self.tappedCorrect = -1; self.hammerHitIdx = -1; self.activeMole = 0
            }
        } else {
            wrongFlash = candidate
            activeMole = -1
            audio.playCue("whack-wrong")
            lifecycle.schedule(after: 0.4) {
                guard self.running, !self.done, self.roundIdx == expectedRound else { return }
                self.wrongFlash = -1; self.activeMole = 0
            }
        }
    }

    private func nextQuestion() {
        guard running, !done else { return }
        let q = WhackPools.buildQuestion(WhackPools.pickType(roundIdx), prevKey: prevKey)
        prevKey = q.key; question = q; roundIdx += 1; activeMole = 0; tappedCorrect = -1; wrongFlash = -1; hammerHitIdx = -1
    }

    private func finish() {
        guard !done else { return }
        done = true; running = false; lifecycle.cancelScheduledWork()
        saveStore.markGameRoundFinished(5); audio.playCue("whack-done")
        lifecycle.schedule(after: 1.4) { guard self.done else { return }; self.dismiss() }
    }

    private func leave() { running = false; lifecycle.reset(); audio.stopAllAudio(); dismiss() }
}

@MainActor
private struct MoleTile: View {
    let value: Int
    let isUp: Bool
    let tappedCorrect: Bool
    let wrongFlash: Bool
    let hammerStrike: Bool
    let size: CGFloat
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                ZStack {
                    if let mole = pandaImage(named: "whack-mole-popup") {
                        mole.resizable().interpolation(.high).aspectRatio(contentMode: .fit).frame(width: size * 0.88, height: size * 0.88)
                            .rotationEffect(.degrees(tappedCorrect ? 18 : 0)).scaleEffect(tappedCorrect ? 0.88 : 1)
                    }
                    Text("\(value)").font(.pandaFont(size: max(30, size * 0.21), weight: .black)).foregroundColor(Color(PandaTheme.ink))
                        .shadow(color: .white.opacity(0.95), radius: 5).shadow(color: .white.opacity(0.85), radius: 2).offset(y: size * 0.06)
                    if tappedCorrect { StunOverlay().frame(width: size * 0.88, height: size * 0.88) }
                    if hammerStrike { HammerStrike().frame(width: size * 0.92, height: size * 0.92).allowsHitTesting(false) }
                }
                .offset(y: isUp || tappedCorrect ? -size * 0.07 : size * 0.45)
                .opacity(isUp || tappedCorrect ? 1 : 0)
                .frame(width: size, height: size * 0.88)
                if let hole = pandaImage(named: "whack-hole-clean") { hole.resizable().interpolation(.high).aspectRatio(contentMode: .fit).frame(width: size, height: size * 0.44).offset(y: -size * 0.2) }
            }
            .frame(width: size, height: size * 0.98).contentShape(Rectangle()).opacity(wrongFlash ? 0.5 : 1)
        }.buttonStyle(.plain)
    }
}

@MainActor
public struct CountGameView: View {
    @State private var roundIdx = 0
    @State private var lastAnswer: Int?
    @State private var locked = false
    @State private var target = 6
    @State private var lifecycle = GameLifecycleToken()
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss
    private static let pool = [1,2,3,4,5,6,6,7,7,8,8,9,9,10,10]
    public init() {}

    public var body: some View {
        ZStack { SceneBackground(name: "bg-meadow"); GeometryReader { geo in content(in: geo.size) } }
            .onAppear { resetSession(); audio.configureSession(); audio.playCue("count-intro"); pickNextTarget() }
            .onDisappear { lifecycle.reset(); audio.stopAllAudio() }
    }

    private func resetSession() {
        lifecycle.reset()
        lifecycle.cancelScheduledWork()
        roundIdx = 0
        lastAnswer = nil
        locked = false
        target = 6
    }

    private func content(in size: CGSize) -> some View {
        VStack(spacing: 12) {
            ZStack {
                Text("\(roundIdx + 1) / 5")
                    .font(.pandaFont(size: min(28, size.width * 0.045)))
                    .foregroundColor(Color(PandaTheme.ink))
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4)))
                HStack {
                    IconButton(style: .back) { leave() }
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 16).padding(.top, 12)

            StepBar(labels: [], step: min(roundIdx + 1, 5), totalSteps: 5,
                    width: min(600, size.width - 24), showsLabels: false)
            Text("一眼看是几？").font(.pandaFont(size: min(36, size.width * 0.055))).foregroundColor(Color(PandaTheme.ink))
            Spacer(); TenFrame(value: target, rows: 2, cell: min(70, size.width * 0.08), gap: 8, dot: PandaTheme.orange, showLabel: false); Spacer()
            choices(for: target, width: size.width); Spacer(minLength: 8)
        }
    }

    private func choices(for target: Int, width: CGFloat) -> some View {
        var opts = [target]
        for d in [-2,-1,1,2,-3,3] { let v = target + d; if (1...10).contains(v) && !opts.contains(v) { opts.append(v); if opts.count == 4 { break } } }
        var f = 1; while opts.count < 4 { if !opts.contains(f) { opts.append(f) }; f += 1 }
        let stable = Array(opts.prefix(4))
        let shift = roundIdx % stable.count
        let ordered = Array(stable[shift...]) + Array(stable[..<shift])
        let buttonWidth = min(130, max(72, (width - 96) / 4))
        return HStack(spacing: 10) { ForEach(Array(ordered.enumerated()), id: \.offset) { _, value in ChoiceButton(label: "\(value)", isCorrect: locked && value == target, isDisabled: locked, width: buttonWidth, height: min(96, max(72, buttonWidth * 0.72))) { handleTap(value: value, target: target) } } }.padding(.horizontal, 40)
    }

    private func pickNextTarget() {
        let bucket: (Int) -> Int = { $0 <= 3 ? 0 : ($0 <= 7 ? 1 : 2) }
        let previousBucket = lastAnswer.map(bucket); var pick = Self.pool.randomElement() ?? 6
        for _ in 0..<12 { if pick != lastAnswer && bucket(pick) != previousBucket { break }; pick = Self.pool.randomElement() ?? 6 }
        target = pick; lastAnswer = pick
    }
    private func handleTap(value: Int, target: Int) {
        guard !locked else { return }
        guard value == target else { audio.playCue("wrong"); return }
        locked = true; audio.playCue("count-pair"); lifecycle.schedule(after: 1.0) {
            guard self.locked else { return }
            self.saveStore.markGameRoundFinished(6)
            if self.roundIdx + 1 < 5 { self.roundIdx += 1; self.locked = false; self.pickNextTarget() } else { self.dismiss() }
        }
    }
    private func leave() { lifecycle.reset(); audio.stopAllAudio(); dismiss() }
}

@MainActor
struct HammerStrike: View {
    private let totalDuration = 0.8
    private let downFraction = 0.56
    @State private var offsetX: CGFloat = 90
    @State private var offsetY: CGFloat = -110
    @State private var angle: Double = -42
    @State private var task: Task<Void, Never>?
    var body: some View {
        Group { if let hammer = pandaImage(named: "whack-hammer") { hammer.resizable().interpolation(.high).aspectRatio(contentMode: .fit) } else { Circle().fill(Color(PandaTheme.orange)).overlay(Text("🔨").font(.system(size: 60))) }
            .frame(width: 160, height: 160).rotationEffect(.degrees(angle)).offset(x: offsetX, y: offsetY)
            .onAppear { playOnce() }.onDisappear { task?.cancel(); task = nil }
    }
    private func playOnce() {
        task?.cancel(); let start = Date()
        task = Task { @MainActor in
            while !Task.isCancelled {
                let p = min(1, max(0, Date().timeIntervalSince(start) / totalDuration))
                if p < downFraction { let q = p / downFraction; let e = q*q*q; offsetX = 90 * (1-e); offsetY = -110 * (1-e); angle = -42 + 88 * e }
                else { let q = (p-downFraction)/(1-downFraction); let e = 1-pow(1-q,3); offsetX = 90*e; offsetY = -110*e; angle = 46 - 88*e }
                if p >= 1 { offsetX = 90; offsetY = -110; angle = -42; break }
                try? await Task.sleep(nanoseconds: 16_000_000)
            }
            task = nil
        }
    }
}

struct StunOverlay: View {
    @State private var spin = 0.0
    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                let angle = (Double(i) * 120 + spin) * .pi / 180
                Text("⭐")
                    .font(.system(size: 22))
                    .offset(x: CGFloat(cos(angle)) * 70, y: CGFloat(sin(angle)) * 70 - 40)
            }
            Text("💫")
                .font(.system(size: 38))
                .offset(y: -80)
        }
        .onAppear {
            withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                spin = 360
            }
        }
    }
}

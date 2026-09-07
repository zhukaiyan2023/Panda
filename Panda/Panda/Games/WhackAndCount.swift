//
//  WhackAndCount.swift
//  Panda
//
//  Whack-a-mole and 一眼识数 (count) games. Both render against the
//  `bg-meadow` background with bundled sprite art.
//

import SwiftUI
import Combine
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Whack

/// 6 mole holes in a 2×3 grid. The kid reads the equation "a + b = ?"
/// at the top and taps the mole whose number equals a+b.
///
/// The moles pop up one at a time on a 1.6-second cycle (similar to the
/// original `gameWhackChild2.js` showNext loop): one mole is "up" and
/// visible, the others are "down" (only the hole is visible). Tapping
/// the up mole locks it in for 0.5s before the cycle advances.
public struct WhackGameView: View {
    @State private var question: WhackPools.Question?
    @State private var prevKey: String? = nil
    @State private var roundIdx = 0
    @State private var timeLeft: Int = 90
    @State private var running = true
    @State private var tappedCorrect = -1
    @State private var wrongFlash = -1
    @State private var correctCount = 0
    @State private var done = false
    /// Index of the currently visible ("up") mole, or -1 if none.
    @State private var activeMole: Int = 0
    /// Which mole just got the hammer coming down on it. -1 = none.
    /// Combined with `hammerHitToken` to retrigger the strike animation
    /// even when the same mole is hit twice in a row.
    @State private var hammerHitIdx: Int = -1
    /// Bumped every time the kid lands a hit. The mole tile watches
    /// this via `.id(...)` so its `HammerStrike` overlay re-mounts and
    /// the strike replays from the start pose.
    @State private var hammerHitToken: Int = 0
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    /// Faster cycle for the mole pop-up — runs every 0.8s so the game
    /// feels alive but not frantic.
    private let moleCycle = Timer.publish(every: 1.4, on: .main, in: .common).autoconnect()

    public init() {}

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            content
        }
        .onAppear {
            print("[Whack] onAppear")
            audio.configureSession()
            audio.playCue("whack-intro")
            nextQuestion()
            print("[Whack] onAppear done")
        }
        .onDisappear {
            running = false
        }
        .onReceive(timer) { _ in
            if running && !done {
                timeLeft -= 1
                if timeLeft <= 0 {
                    running = false
                    finish()
                }
            }
        }
        .onReceive(moleCycle) { _ in
            // Advance the visible mole. The tapped-correct / wrong-flash
            // tiles are pinned at -1 for 0.5s so the kid sees the
            // feedback before the next mole pops up.
            guard running, !done, tappedCorrect == -1, wrongFlash == -1 else { return }
            let total = question?.candidates.count ?? 0
            guard total > 0 else { return }
            activeMole = (activeMole + 1) % total
        }
    }

    @ViewBuilder
    private var content: some View {
        if let q = question {
            VStack(spacing: 12) {
                chrome
                StepBar(labels: ["开始", "打中", "完成"],
                        step: min(correctCount + 1, 10),
                        totalSteps: 10,
                        width: 600)
                equationBar(for: q)
                Spacer()
                moles(for: q)
                Spacer()
            }
        }
    }

    private var chrome: some View {
        HStack(alignment: .center, spacing: 0) {
            IconButton(style: .back) {
                running = false
                audio.stopAllAudio()
                dismiss()
            }
            Spacer()
            HStack(spacing: 8) {
                Text("⏱ \(timeLeft)")
                    .font(.pandaFont(size: 26))
                    .foregroundColor(timeLeft <= 10 ? Color(PandaTheme.danger) : Color(PandaTheme.ink))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(Color.white)
                            .overlay(Capsule().stroke(
                                timeLeft <= 10 ? Color(PandaTheme.danger) : Color(PandaTheme.orange),
                                lineWidth: 4))
                    )
                Text("答对 \(correctCount)")
                    .font(.pandaFont(size: 26))
                    .foregroundColor(Color(PandaTheme.ink))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(Color.white)
                            .overlay(Capsule().stroke(Color(PandaTheme.success), lineWidth: 4))
                    )
            }
            Spacer()
            Color.clear.frame(width: 80, height: 70)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func equationBar(for q: WhackPools.Question) -> some View {
        HStack(spacing: 12) {
            Text("\(q.a)").font(.pandaFont(size: 56)).foregroundColor(Color(PandaTheme.numBlue))
            Text("+").font(.pandaFont(size: 48)).foregroundColor(Color(PandaTheme.ink))
            Text("\(q.b)").font(.pandaFont(size: 56)).foregroundColor(Color(PandaTheme.numPink))
            Text("=").font(.pandaFont(size: 48)).foregroundColor(Color(PandaTheme.ink))
            Text(tappedCorrect >= 0 ? "\(q.answer)" : "?")
                .font(.pandaFont(size: 56))
                .foregroundColor(Color(tappedCorrect >= 0 ? PandaTheme.success : PandaTheme.orange))
                .padding(.horizontal, 12).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(PandaTheme.ink), lineWidth: 4)))
        }
        .padding(.top, 4)
    }

    private func moles(for q: WhackPools.Question) -> some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 18), count: 3)
        return LazyVGrid(columns: columns, spacing: 18) {
            ForEach(Array(q.candidates.enumerated()), id: \.offset) { idx, value in
                MoleTile(value: value, colorIndex: idx % 6,
                         isUp: activeMole == idx,
                         tappedCorrect: tappedCorrect == value,
                         wrongFlash: wrongFlash == value,
                         hammerStrike: hammerHitIdx == idx) {
                    handleTap(candidate: value, correct: q.answer, idx: idx)
                }
                .id("mole-\(idx)-\(hammerHitToken)")
            }
        }
        .padding(.horizontal, 40)
    }

    private func handleTap(candidate: Int, correct: Int, idx: Int) {
        guard running, !done else { return }
        guard tappedCorrect == -1, wrongFlash == -1 else { return }
        guard activeMole == idx else { return }
        if candidate == correct {
            tappedCorrect = candidate
            correctCount += 1
            audio.playCue("whack-correct")
            hammerHitIdx = idx
            hammerHitToken &+= 1
            activeMole = -1
            let expectedRound = roundIdx
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                guard running, !done, roundIdx == expectedRound else { return }
                nextQuestion()
                tappedCorrect = -1
                hammerHitIdx = -1
                activeMole = 0
            }
        } else {
            wrongFlash = candidate
            audio.playCue("whack-wrong")
            activeMole = -1
            let expectedRound = roundIdx
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                guard running, !done, roundIdx == expectedRound else { return }
                wrongFlash = -1
                activeMole = 0
            }
        }
    }

    private func nextQuestion() {
        guard running, !done else { return }
        let type = WhackPools.pickType(roundIdx)
        let q = WhackPools.buildQuestion(type, prevKey: prevKey)
        prevKey = q.key
        question = q
        roundIdx += 1
        activeMole = 0
        tappedCorrect = -1
        wrongFlash = -1
        hammerHitIdx = -1
    }

    private func finish() {
        guard !done else { return }
        done = true
        running = false
        saveStore.markGameRoundFinished(5)
        audio.playCue("whack-done")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            guard done else { return }
            dismiss()
        }
    }
}

private struct MoleTile: View {
    let value: Int
    let colorIndex: Int
    let isUp: Bool
    let tappedCorrect: Bool
    let wrongFlash: Bool
    let hammerStrike: Bool
    let onTap: () -> Void

    var body: some View {
        let showMoleAndOverlay = isUp || tappedCorrect
        Button(action: onTap) {
            VStack(spacing: 0) {
                ZStack {
                    if let mole = pandaImage(named: "whack-mole-popup") {
                        mole.resizable().interpolation(.high).aspectRatio(contentMode: .fit)
                            .frame(width: 210, height: 210)
                            .rotationEffect(.degrees(tappedCorrect ? 18 : 0))
                            .scaleEffect(tappedCorrect ? 0.88 : 1.0)
                            .animation(.spring(response: 0.35, dampingFraction: 0.55), value: tappedCorrect)
                    }
                    Text("\(value)")
                        .font(.pandaFont(size: 50, weight: .black))
                        .foregroundColor(Color(PandaTheme.ink))
                        .shadow(color: .white.opacity(0.95), radius: 5)
                        .shadow(color: .white.opacity(0.85), radius: 2)
                        .offset(x: -3, y: 15)
                    if tappedCorrect {
                        StunOverlay().frame(width: 210, height: 210)
                            .transition(.scale.combined(with: .opacity))
                    }
                    if hammerStrike {
                        HammerStrike().frame(width: 220, height: 220)
                            .transition(.opacity).allowsHitTesting(false)
                    }
                }
                .offset(y: isUp ? -16 : (tappedCorrect ? -16 : 110))
                .opacity(showMoleAndOverlay ? 1 : 0)
                .animation(.spring(response: 0.6, dampingFraction: 0.7), value: isUp)
                .animation(.easeInOut(duration: 0.2), value: tappedCorrect)
                .frame(width: 240, height: 210)
                .opacity(wrongFlash ? 0.5 : 1)
                if let hole = pandaImage(named: "whack-hole-clean") {
                    hole.resizable().interpolation(.high).aspectRatio(contentMode: .fit)
                        .frame(width: 250, height: 110).offset(y: -50)
                }
            }
            .frame(width: 220, height: 240)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 一眼识数 (Count)

public struct CountGameView: View {
    @State private var roundIdx = 0
    @State private var revealed = true
    @State private var lastAnswer: Int? = nil
    @State private var locked = false
    @State private var target: Int = 6
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss
    private static let pool: [Int] = [1, 2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]
    public init() {}

    public var body: some View {
        ZStack { SceneBackground(name: "bg-meadow"); content }
            .onAppear {
                audio.configureSession(); audio.playCue("count-intro"); pickNextTarget()
            }
            .onDisappear { audio.stopAllAudio() }
    }
    private func pickNextTarget() {
        let lastBucket: Int? = lastAnswer.map { bucket(for: $0) }
        var pick = Self.pool.randomElement() ?? 6
        var tries = 0
        while (pick == lastAnswer || bucket(for: pick) == lastBucket) && tries < 12 {
            pick = Self.pool.randomElement() ?? 6; tries += 1
        }
        lastAnswer = pick; target = pick
    }
    private func bucket(for value: Int) -> Int {
        switch value { case 1...3: return 0; case 4...7: return 1; default: return 2 }
    }
    @ViewBuilder private var content: some View {
        VStack(spacing: 12) {
            chrome
            StepBar(labels: ["开始", "答对", "完成"], step: min(roundIdx + 1, 5), totalSteps: 5, width: 600)
            Text("一眼看是几？").font(.pandaFont(size: 36)).foregroundColor(Color(PandaTheme.ink)).padding(.top, 4)
            Spacer()
            TenFrame(value: target, rows: 2, cell: 70, gap: 8, dot: PandaTheme.orange, showLabel: false)
            Spacer()
            choices(for: target)
            Spacer()
        }
    }
    private var chrome: some View {
        HStack(alignment: .center, spacing: 0) {
            IconButton(style: .back) { audio.stopAllAudio(); dismiss() }
            Spacer()
            Text("\(roundIdx + 1) / 5").font(.pandaFont(size: 28)).foregroundColor(Color(PandaTheme.ink))
                .padding(.horizontal, 24).padding(.vertical, 10)
                .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4)))
            Spacer(); Color.clear.frame(width: 80, height: 70)
        }.padding(.horizontal, 16).padding(.top, 12)
    }
    private func choices(for target: Int) -> some View {
        var opts: [Int] = [target]
        for d in [-2, -1, 1, 2, -3, 3] {
            let v = target + d
            if (1...10).contains(v) && !opts.contains(v) { opts.append(v); if opts.count == 4 { break } }
        }
        var fallback = 1
        while opts.count < 4 && fallback < 11 { if !opts.contains(fallback) { opts.append(fallback) }; fallback += 1 }
        let shuffled = Array(opts.prefix(4)).shuffled()
        return HStack(spacing: 12) {
            ForEach(Array(shuffled.enumerated()), id: \.offset) { _, value in
                ChoiceButton(label: "\(value)", isCorrect: locked && value == target, isDisabled: locked, width: 80, height: 90) {
                    handleTap(value: value, target: target)
                }
            }
        }.padding(.horizontal, 40)
    }
    private func handleTap(value: Int, target: Int) {
        guard !locked else { return }
        if value == target {
            locked = true; lastAnswer = target; audio.playCue("count-pair")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                guard locked else { return }
                saveStore.markGameRoundFinished(6)
                if roundIdx + 1 < 5 { roundIdx += 1; locked = false; pickNextTarget() } else { dismiss() }
            }
        } else { audio.playCue("wrong") }
    }
}

// MARK: - Hammer Strike

struct HammerStrike: View {
    private let totalDuration: Double = 0.8
    private let downFraction: Double = 0.56
    private let startOffsetX: CGFloat = 90
    private let startOffsetY: CGFloat = -110
    private let hitOffsetX: CGFloat = 0
    private let hitOffsetY: CGFloat = 0
    private let startAngle: Double = -42
    private let hitAngle: Double = 46
    @State private var offsetX: CGFloat = 90
    @State private var offsetY: CGFloat = -110
    @State private var angle: Double = -42
    var body: some View {
        Group {
            if let hammer = pandaImage(named: "whack-hammer") { hammer.resizable().interpolation(.high).aspectRatio(contentMode: .fit) }
            else { Circle().fill(Color(PandaTheme.orange)).overlay(Text("🔨").font(.system(size: 60))) }
        }
        .frame(width: 160, height: 160).rotationEffect(.degrees(angle)).offset(x: offsetX, y: offsetY)
        .onAppear { playOnce() }
    }
    private func playOnce() {
        let start = Date()
        Task { @MainActor in
            while true {
                let elapsed = Date().timeIntervalSince(start); let p = min(1.0, max(0.0, elapsed / totalDuration))
                if p < downFraction {
                    let q = easeInCubic(p / downFraction)
                    offsetX = startOffsetX + (hitOffsetX - startOffsetX) * q
                    offsetY = startOffsetY + (hitOffsetY - startOffsetY) * q
                    angle = startAngle + (hitAngle - startAngle) * q
                } else {
                    let q = (p - downFraction) / (1.0 - downFraction); let eased = easeOutCubic(q)
                    offsetX = hitOffsetX + (startOffsetX - hitOffsetX) * eased
                    offsetY = hitOffsetY + (startOffsetY - hitOffsetY) * eased
                    angle = hitAngle + (startAngle - hitAngle) * eased
                }
                if p >= 1.0 { offsetX = startOffsetX; offsetY = startOffsetY; angle = startAngle; break }
                try? await Task.sleep(nanoseconds: 16_000_000)
            }
        }
    }
    private func easeInCubic(_ t: Double) -> Double { t * t * t }
    private func easeOutCubic(_ t: Double) -> Double { let inv = 1.0 - t; return 1.0 - inv * inv * inv }
}

struct StunOverlay: View {
    @State private var spin: Double = 0
    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                let angle = Double(i) * 120 + spin; let rad = angle * .pi / 180
                Text("⭐").font(.system(size: 22)).offset(x: CGFloat(cos(rad)) * 70, y: CGFloat(sin(rad)) * 70 - 40)
            }
            Text("💫").font(.system(size: 38)).offset(y: -80)
        }
        .onAppear { withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) { spin = 360 } }
    }
}

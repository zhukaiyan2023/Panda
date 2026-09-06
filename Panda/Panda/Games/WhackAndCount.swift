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
            // Timer + score chips (whack uses these instead of a round
            // counter, so the kid sees both progress signals at once).
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
            Text("\(q.a)")
                .font(.pandaFont(size: 56))
                .foregroundColor(Color(PandaTheme.numBlue))
            Text("+")
                .font(.pandaFont(size: 48))
                .foregroundColor(Color(PandaTheme.ink))
            Text("\(q.b)")
                .font(.pandaFont(size: 56))
                .foregroundColor(Color(PandaTheme.numPink))
            Text("=")
                .font(.pandaFont(size: 48))
                .foregroundColor(Color(PandaTheme.ink))
            Text(tappedCorrect >= 0 ? "\(q.answer)" : "?")
                .font(.pandaFont(size: 56))
                .foregroundColor(Color(tappedCorrect >= 0 ? PandaTheme.success : PandaTheme.orange))
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(PandaTheme.ink), lineWidth: 4))
                )
        }
        .padding(.top, 4)
    }

    private func moles(for q: WhackPools.Question) -> some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 18), count: 3)
        return LazyVGrid(columns: columns, spacing: 18) {
            ForEach(Array(q.candidates.enumerated()), id: \.offset) { idx, value in
                // Each mole is "up" only when it's the active mole. The
                // mole stays visible for one cycle (0.8s) before the
                // cycle advances to the next hole.
                MoleTile(
                    value: value,
                    colorIndex: idx % 6,
                    isUp: activeMole == idx,
                    tappedCorrect: tappedCorrect == value,
                    wrongFlash: wrongFlash == value,
                    hammerStrike: hammerHitIdx == idx
                ) {
                    handleTap(candidate: value, correct: q.answer, idx: idx)
                }
                // .id() keys on the token so a fresh hammerHitToken
                // re-mounts the tile and the HammerStrike overlay
                // replays even if the same mole is struck twice in a
                // row.
                .id("mole-\(idx)-\(hammerHitToken)")
            }
        }
        .padding(.horizontal, 40)
    }

    private func handleTap(candidate: Int, correct: Int, idx: Int) {
        guard running, !done else { return }
        // Only count taps on the mole that's currently up — tapping a
        // down mole does nothing (mirrors the original JS which only
        // makes the active mole clickable).
        guard activeMole == idx || tappedCorrect == candidate else { return }
        if candidate == correct {
            tappedCorrect = candidate
            correctCount += 1
            audio.playCue("whack-correct")
            // Trigger the hammer strike overlay on the hit mole. Bumping
            // `hammerHitToken` re-mounts the MoleTile so the strike
            // animation re-plays from its start pose even if the same
            // mole gets hit twice in a row.
            hammerHitIdx = idx
            hammerHitToken &+= 1
            // Hide all moles during the feedback delay so the kid sees
            // the celebration, then advance to the next question. The
            // 0.9s window covers the full 0.8s hammer strike plus a
            // brief beat for the dizzy stars.
            activeMole = -1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                nextQuestion()
                tappedCorrect = -1
                hammerHitIdx = -1
                // Resume cycling from the next index.
                let total = question?.candidates.count ?? 0
                if total > 0 { activeMole = (idx + 1) % total }
            }
        } else {
            wrongFlash = candidate
            audio.playCue("whack-wrong")
            // Wrong tap: flash the mole then advance immediately.
            activeMole = -1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                wrongFlash = -1
                let total = question?.candidates.count ?? 0
                if total > 0 { activeMole = (idx + 1) % total }
            }
        }
    }

    private func nextQuestion() {
        print("[Whack] nextQuestion called, roundIdx=\(roundIdx)")
        let type = WhackPools.pickType(roundIdx)
        print("[Whack] type=\(type)")
        let q = WhackPools.buildQuestion(type, prevKey: prevKey)
        print("[Whack] question built, candidates.count=\(q.candidates.count)")
        prevKey = q.key
        question = q
        roundIdx += 1
        print("[Whack] question set")
    }

    private func finish() {
        done = true
        saveStore.markGameRoundFinished(5)
        audio.playCue("whack-done")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
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
    /// Set to true on the mole the kid just hit. Drives the
    /// `HammerStrike` overlay (right→down strike, bounce back).
    /// Bumped by the parent each hit so the animation re-plays.
    let hammerStrike: Bool
    let onTap: () -> Void

    var body: some View {
        // Visibility:
        //   • isUp               → the mole is the current "active" one,
        //                          so it pops out of the hole.
        //   • tappedCorrect      → the kid just hit this mole correctly
        //                          and we're showing the celebration
        //                          (hammer strike + dizzy stars). The
        //                          mole stays up for the whole 0.9s
        //                          feedback window so the kid can see
        //                          the hammer actually hit it.
        //   • hammerStrike / StunOverlay are layered ABOVE the mole
        //     inside the inner ZStack, but the parent visibility ZStack
        //     wraps mole + overlays together so the hammer and stars
        //     never get hidden behind a `0` opacity on the mole tile.
        let showMoleAndOverlay = isUp || tappedCorrect

        Button(action: onTap) {
            VStack(spacing: 0) {
                ZStack {
                    // Mole sprite — bigger now (210×210) for kid-friendly tap targets.
                    if let mole = pandaImage(named: "whack-mole-popup") {
                        mole
                            .resizable()
                            .interpolation(.high)
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 210, height: 210)
                            // Stunned: tilt + scale the mole when hit.
                            .rotationEffect(.degrees(tappedCorrect ? 18 : 0))
                            .scaleEffect(tappedCorrect ? 0.88 : 1.0)
                            .animation(.spring(response: 0.35, dampingFraction: 0.55), value: tappedCorrect)
                    }
                    // Digit sits ON the mole's belly — the sprite is drawn
                    // horizontally (face on left, body extending right), so
                    // an x-offset of +35 lands the number squarely on the
                    // body. The y-offset keeps it vertically centred on the
                    // torso.
                    Text("\(value)")
                        .font(.pandaFont(size: 50, weight: .black))
                        .foregroundColor(Color(PandaTheme.ink))
                        .shadow(color: .white.opacity(0.95), radius: 5, x: 0, y: 0)
                        .shadow(color: .white.opacity(0.85), radius: 2, x: 0, y: 0)
                        .offset(x: -3, y: 15)

                    // Stun overlay — spinning stars + dizzy face on the
                    // mole that was just hit. Drawn alongside the mole so
                    // both are visible together during the feedback
                    // window.
                    if tappedCorrect {
                        StunOverlay()
                            .frame(width: 210, height: 210)
                            .transition(.scale.combined(with: .opacity))
                    }

                    // Hammer strike overlay — comes down from upper-right,
                    // bounces back. Sits ABOVE the mole + dizzy stars so
                    // the kid sees the hammer meet the mole, then bounce
                    // off. Drawn last so it overlays everything else in
                    // the tile.
                    if hammerStrike {
                        HammerStrike()
                            .frame(width: 220, height: 220)
                            .transition(.opacity)
                            .allowsHitTesting(false)
                    }
                }
                // Mole + digit + overlays move as one unit — single spring
                // on the ZStack drives pop and dive animations together.
                // Visibility stays `1` for the full `tappedCorrect`
                // feedback window so the hammer animation can actually be
                // seen — previously the hammer was hidden because this
                // opacity dropped to `0` the instant the kid hit the mole.
                .offset(y: isUp ? -16 : (tappedCorrect ? -16 : 110))
                .opacity(showMoleAndOverlay ? 1 : 0)
                .animation(.spring(response: 0.6, dampingFraction: 0.7), value: isUp)
                .animation(.easeInOut(duration: 0.2), value: tappedCorrect)
                .frame(width: 240, height: 210)
                .opacity(wrongFlash ? 0.5 : 1)

                // The hole sprite — scaled up to match the larger mole.
                if let hole = pandaImage(named: "whack-hole-clean") {
                    hole
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 250, height: 110)
                        .offset(y: -50)
                }
            }
            .frame(width: 220, height: 240)                       // bigger tile
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 一眼识数 (Count)

/// A 2×5 ten-frame grid shows N dots; kid taps the matching number from
/// the 4 answer choices. The grid is the question; the options are the
/// answers.
public struct CountGameView: View {
    @State private var roundIdx = 0
    @State private var revealed = true   // ten-frame is always visible
    @State private var lastAnswer: Int? = nil
    @State private var locked = false
    @State private var target: Int = 6    // cached per round (no flicker between rounds)
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    /// Weighted quantity pool — 6-10 appear ~2x as often as 1-5.
    private static let pool: [Int] = [1, 2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]

    public init() {}

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            content
        }
        .onAppear {
            audio.configureSession()
            audio.playCue("count-intro")
            // Pick the first round's target up front so the view doesn'\''t
            // re-roll mid-transition between rounds.
            pickNextTarget()
        }
    }

    /// Pick a new target that isn'\''t the same as the last one, and
    /// isn'\''t in the same "bucket" (small/medium/large) so the rounds
    /// feel varied.
    private func pickNextTarget() {
        let pool = Self.pool
        let lastBucket: Int? = lastAnswer.map { bucket(for: $0) }
        var pick = pool.randomElement() ?? 6
        var tries = 0
        while (pick == lastAnswer || bucket(for: pick) == lastBucket) && tries < 12 {
            pick = pool.randomElement() ?? 6
            tries += 1
        }
        lastAnswer = pick
        target = pick
    }

    private func bucket(for value: Int) -> Int {
        switch value {
        case 1...3: return 0
        case 4...7: return 1
        default: return 2
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 12) {
            chrome
            StepBar(labels: ["开始", "答对", "完成"],
                    step: min(roundIdx + 1, 5),
                    totalSteps: 5,
                    width: 600)
            Text("一眼看是几？")
                .font(.pandaFont(size: 36))
                .foregroundColor(Color(PandaTheme.ink))
                .padding(.top, 4)

            Spacer()

            TenFrame(value: target, rows: 2, cell: 70, gap: 8, dot: PandaTheme.orange, showLabel: false)

            Spacer()

            choices(for: target)

            Spacer()

        }
    }

    private var chrome: some View {
        // Shared chrome pattern — back button + round counter + placeholder.
        HStack(alignment: .center, spacing: 0) {
            IconButton(style: .back) {
                audio.stopAllAudio()
                dismiss()
            }
            Spacer()
            Text("\(roundIdx + 1) / 5")
                .font(.pandaFont(size: 28))
                .foregroundColor(Color(PandaTheme.ink))
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(Color.white)
                        .overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4))
                )
            Spacer()
            Color.clear.frame(width: 80, height: 70)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func choices(for target: Int) -> some View {
        // 4 candidates: the correct number + 3 nearby neighbours.
        var opts: [Int] = [target]
        let offsets: [Int] = [-2, -1, 1, 2, -3, 3]
        for d in offsets {
            let v = target + d
            if (1...10).contains(v) && !opts.contains(v) {
                opts.append(v)
                if opts.count == 4 { break }
            }
        }
        // Top-up to 4 in case of edge targets.
        var fallback = 1
        while opts.count < 4 && fallback < 11 {
            if !opts.contains(fallback) { opts.append(fallback) }
            fallback += 1
        }
        let shuffled = Array(opts.prefix(4)).shuffled()
        return HStack(spacing: 12) {
            ForEach(Array(shuffled.enumerated()), id: \.offset) { _, value in
                ChoiceButton(
                    label: "\(value)",
                    isCorrect: locked && value == target,
                    isDisabled: locked,
                    width: 80,
                    height: 90
                ) {
                    handleTap(value: value, target: target)
                }
            }
        }
        .padding(.horizontal, 40)
    }

    private func handleTap(value: Int, target: Int) {
        guard !locked else { return }
        if value == target {
            locked = true
            lastAnswer = target
            audio.playCue("count-pair")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                saveStore.markGameRoundFinished(6)
                if roundIdx + 1 < 5 {
                    roundIdx += 1
                    locked = false
                    // Pick a fresh target for the next round so the kid
                    // doesn'\''t see the same number twice in a row.
                    pickNextTarget()
                } else {
                    dismiss()
                }
            }
        } else {
            audio.playCue("wrong")
        }
    }
}


// MARK: - Hammer Strike

/// A wooden hammer that comes down from the upper-right onto the mole,
/// then bounces back off-screen. Driven by an internal timer task so
/// the same overlay replays cleanly each time `token` changes.
///
/// Mirrors the original `gameWhackChild.js` `playHammer` timing:
///   • 0.00–0.56 of the strike → swing down (start offset → on mole)
///   • 0.56–1.00 of the strike → bounce back (on mole → start offset)
/// We use a slower 0.8s total duration (per user request) so the kid
/// clearly sees the hammer fall.
struct HammerStrike: View {
    /// Total strike duration in seconds.
    private let totalDuration: Double = 0.8
    /// Fraction of the strike that is the DOWN phase.
    private let downFraction: Double = 0.56

    /// Sprite is anchored at its own centre. Start position is offset
    /// up-and-right from the mole; hit position is centred on the mole.
    private let startOffsetX: CGFloat = 90
    private let startOffsetY: CGFloat = -110
    private let hitOffsetX: CGFloat = 0
    private let hitOffsetY: CGFloat = 0
    /// Rotation in degrees. Sprite was authored with the handle pointing
    /// down-right, so the "up" pose uses a negative rotation (handle up
    /// to the right) and the "hit" pose uses a positive rotation (handle
    /// swung down).
    private let startAngle: Double = -42
    private let hitAngle: Double = 46

    @State private var offsetX: CGFloat = 90
    @State private var offsetY: CGFloat = -110
    @State private var angle: Double = -42

    var body: some View {
        Group {
            if let hammer = pandaImage(named: "whack-hammer") {
                hammer
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
            } else {
                // Fallback when sprite is missing — a coloured disc so the
                // strike is still visible during development.
                Circle()
                    .fill(Color(PandaTheme.orange))
                    .overlay(
                        Text("🔨")
                            .font(.system(size: 60))
                    )
            }
        }
        .frame(width: 160, height: 160)
        .rotationEffect(.degrees(angle), anchor: .center)
        .offset(x: offsetX, y: offsetY)
        .onAppear { playOnce() }
    }

    private func playOnce() {
        let start = Date()
        // Cancel any earlier in-flight task implicitly by overwriting the
        // @State values — SwiftUI will run a fresh body on the next tick.
        Task { @MainActor in
            while true {
                let elapsed = Date().timeIntervalSince(start)
                let p = min(1.0, max(0.0, elapsed / totalDuration))
                if p < downFraction {
                    // Down swing — ease-in cubic so the hammer
                    // accelerates as it approaches the mole.
                    let q = easeInCubic(p / downFraction)
                    offsetX = startOffsetX + (hitOffsetX - startOffsetX) * q
                    offsetY = startOffsetY + (hitOffsetY - startOffsetY) * q
                    angle = startAngle + (hitAngle - startAngle) * q
                } else {
                    // Bounce back — ease-out cubic so the hammer
                    // decelerates as it returns to the start pose.
                    let q = (p - downFraction) / (1.0 - downFraction)
                    let eased = easeOutCubic(q)
                    offsetX = hitOffsetX + (startOffsetX - hitOffsetX) * eased
                    offsetY = hitOffsetY + (startOffsetY - hitOffsetY) * eased
                    angle = hitAngle + (startAngle - hitAngle) * eased
                }
                if p >= 1.0 {
                    // Snap back to start so the next strike (with a
                    // fresh onAppear) begins from the same pose.
                    offsetX = startOffsetX
                    offsetY = startOffsetY
                    angle = startAngle
                    break
                }
                try? await Task.sleep(nanoseconds: 16_000_000) // ~60fps
            }
        }
    }

    // MARK: - Easing
    private func easeInCubic(_ t: Double) -> Double { t * t * t }
    private func easeOutCubic(_ t: Double) -> Double {
        let inv = 1.0 - t
        return 1.0 - inv * inv * inv
    }
}

// MARK: - Stun Overlay

/// Spinning stars + 💫 emoji that appear over a mole right after the
/// kid hits it. Plays a looping spin while `tappedCorrect` is true.
struct StunOverlay: View {
    @State private var spin: Double = 0

    var body: some View {
        ZStack {
            // 3 small stars circling the mole
            ForEach(0..<3, id: \.self) { i in
                let angle = Double(i) * 120 + spin
                let rad = angle * .pi / 180
                Text("⭐")
                    .font(.system(size: 22))
                    .offset(
                        x: CGFloat(cos(rad)) * 70,
                        y: CGFloat(sin(rad)) * 70 - 40
                    )
            }
            // Big dizzy face at the top
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

//
//  PairGames.swift
//  Panda
//
//  The 凑十 pair games: Boat, Bounce, Cloud, Feed.
//  Each shows a grid of sprite props (boat, balloon, cloud, bubble) with
//  a digit. The kid taps pairs that sum to the round's target.
//
//  Mirrors `components/pickerItem.js` — sprites render behind a white
//  circle badge carrying the digit, with selection swapping to a
//  companion sprite (`*-sel`) where available.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Shared sprite-tile primitive
//
// Wraps a bundled prop sprite (`boat`, `balloon`, `cloud`, `bubble`)
// with a circular badge carrying the digit. The badge sits ON the sprite
// body so the digit is always readable regardless of the sprite's tint.

private struct SpriteTile: View {
    let value: Int
    let spriteName: String
    let selectedSpriteName: String?
    let isSelected: Bool
    let isDisabled: Bool
    let isWrong: Bool
    let size: CGFloat
    let spriteScale: CGFloat
    let labelOffsetY: CGFloat
    let tint: RGB
    let onTap: () -> Void

    @State private var shakeX: CGFloat = 0

    var body: some View {
        Button(action: {
            #if canImport(UIKit)
            let g = UIImpactFeedbackGenerator(style: .light)
            g.impactOccurred()
            #endif
            onTap()
        }) {
            VStack(spacing: 0) {
                ZStack {
                    // Prop sprite (or its selected companion when picked).
                    if let img = pandaImage(named: effectiveSpriteName) {
                        img
                            .resizable()
                            .interpolation(.high)
                            .aspectRatio(contentMode: .fit)
                            .frame(width: size * spriteScale, height: size * spriteScale)
                            .opacity(isDisabled ? 0.35 : 1)
                    } else {
                        // Fallback when the sprite PNG is missing — a tinted disc.
                        Circle()
                            .fill(Color(tint))
                            .frame(width: size * spriteScale, height: size * spriteScale)
                    }

                    // The digit badge floats on top of the sprite body.
                    // When the prop is a balloon / cloud (light or saturated
                    // body), the badge uses a dark text on a white circle so
                    // the number reads cleanly. The white halo is the same
                    // shape pickerItem.js uses (a circle behind the digit).
                    digitBadge
                }
                .frame(width: size, height: size)
                .offset(x: shakeX)
            }
            .frame(width: size, height: size)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .onChange(of: isWrong) { _, newValue in
            if newValue { runShake() }
        }
    }

    private var effectiveSpriteName: String {
        if isSelected, let sel = selectedSpriteName, pandaImage(named: sel) != nil {
            return sel
        }
        return spriteName
    }

    @ViewBuilder
    private var digitBadge: some View {
        // No background plate — the digit just sits on the sprite with a
        // soft white halo (multi-stop shadow) so it stays legible on any
        // colour without needing a contrast circle.
        Text("\(value)")
            .font(.pandaFont(size: size * 0.32, weight: .black))
            .foregroundColor(Color(PandaTheme.ink))
            .shadow(color: .white.opacity(0.95), radius: 4, x: 0, y: 0)
            .shadow(color: .white.opacity(0.85), radius: 2, x: 0, y: 0)
            .offset(y: labelOffsetY)
    }

    private func runShake() {
        let frames: [(CGFloat, Double)] = [
            (-10, 0.00), (10, 0.05), (-8, 0.10), (8, 0.15),
            (-6, 0.20), (6, 0.25), (-3, 0.30), (0, 0.35),
        ]
        for (dx, delay) in frames {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                shakeX = dx
            }
        }
    }
}

// MARK: - Pair Game Scaffold

public struct PairGameScaffold: View {
    public let gameId: Int
    public let roundCount: Int
    public let target: Int
    public let introCue: String
    public let roundEndCue: (Int) -> String
    public let candidatesFor: (Int) -> [Int]
    public let pairsFor: (Int, [Int]) -> [[Int]]
    public let spriteName: String
    public let selectedSpriteName: String?
    public let tint: RGB
    public let badgeOffsetY: CGFloat

    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss
    @State private var roundIndex = 0
    @State private var foundPairs = 0
    @State private var selectedIndex: Int? = nil
    @State private var selectedMask: Set<Int> = []
    @State private var done = false

    public init(gameId: Int,
                roundCount: Int,
                target: Int,
                introCue: String,
                roundEndCue: @escaping (Int) -> String,
                candidatesFor: @escaping (Int) -> [Int],
                pairsFor: @escaping (Int, [Int]) -> [[Int]],
                spriteName: String,
                selectedSpriteName: String? = nil,
                tint: RGB = PandaTheme.pink,
                badgeOffsetY: CGFloat = -8) {
        self.gameId = gameId
        self.roundCount = roundCount
        self.target = target
        self.introCue = introCue
        self.roundEndCue = roundEndCue
        self.candidatesFor = candidatesFor
        self.pairsFor = pairsFor
        self.spriteName = spriteName
        self.selectedSpriteName = selectedSpriteName
        self.tint = tint
        self.badgeOffsetY = badgeOffsetY
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            chrome
        }
        .safeAreaInset(edge: .top) {
            // Push the chrome below the status bar / dynamic island so
            // the back button isn't covered by the system overlay.
            Color.clear.frame(height: 0)
        }
        .safeAreaInset(edge: .top) { Color.clear.frame(height: 0) }
        .onAppear {
            audio.configureSession()
            audio.playCue(introCue)
        }
        .onChange(of: done) { _, newValue in
            if newValue { advanceAfterDelay() }
        }
    }

    private var candidates: [Int] { candidatesFor(roundIndex) }
    private var pairs: [[Int]] { pairsFor(roundIndex, candidates) }

    private var chrome: some View {
        VStack(spacing: 12) {
            // Top row: back button (left) + round counter (centre) + placeholder (right).
            HStack(alignment: .center, spacing: 0) {
                IconButton(style: .back) {
                    audio.stopAllAudio()
                    dismiss()
                }
                Spacer()
                Text("\(roundIndex + 1) / \(roundCount)")
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

            // StepBar (progress) sits above the title for consistency
            // with the other pair games.
            StepBar(labels: ["开始", "第 1 对", "完成"],
                    step: min(foundPairs + 1, pairs.count + 1),
                    totalSteps: pairs.count + 1,
                    width: 600)

            // Title / equation lives BELOW the progress bar.
            Text("找到两数之和等于 \(target)")
                .font(.pandaFont(size: 32))
                .foregroundColor(Color(PandaTheme.ink))
                .padding(.top, 4)

            Spacer(minLength: 8)

            grid

            Spacer()

        }
    }
    private var grid: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 14), count: columnsCount)
        return LazyVGrid(columns: columns, spacing: 14) {
            ForEach(Array(candidates.enumerated()), id: \.offset) { idx, value in
                SpriteTile(
                    value: value,
                    spriteName: spriteName,
                    selectedSpriteName: selectedSpriteName,
                    isSelected: selectedIndex == idx,
                    isDisabled: selectedMask.contains(idx) || done,
                    isWrong: false,
                    size: 140,
                    spriteScale: 0.85,
                    labelOffsetY: badgeOffsetY,
                    tint: tint
                ) {
                    handleTap(idx: idx, value: value)
                }
            }
        }
        .padding(.horizontal, 24)
    }

    private var columnsCount: Int {
        candidates.count <= 6 ? 3 : 4
    }

    private func handleTap(idx: Int, value: Int) {
        if done || selectedMask.contains(idx) { return }
        if selectedIndex == nil {
            selectedIndex = idx
            return
        }
        guard let first = selectedIndex, first != idx else {
            selectedIndex = nil
            return
        }
        let sum = value + candidates[first]
        if sum == target {
            selectedMask.insert(first)
            selectedMask.insert(idx)
            foundPairs += 1
            selectedIndex = nil
            audio.playCue("correct")
            if foundPairs >= pairs.count {
                done = true
                audio.playCue(roundEndCue(roundIndex))
            }
        } else {
            selectedIndex = nil
            audio.playCue("wrong")
        }
    }

    private func advanceAfterDelay() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            saveStore.markGameRoundFinished(gameId)
            if roundIndex + 1 < roundCount {
                roundIndex += 1
                foundPairs = 0
                selectedIndex = nil
                selectedMask = []
                done = false
            } else {
                dismiss()
            }
        }
    }
}

// MARK: - Boat

/// 6 boats, pick 2 that sum to 10. Sprites swap to boat-sel when picked.
public struct BoatGameView: View {
    public init() {}
    public var body: some View {
        PairGameScaffold(
            gameId: 1,
            roundCount: 5,
            target: 10,
            introCue: "boat-intro",
            roundEndCue: { _ in "boat-done" },
            candidatesFor: { idx in boatCandidates(idx) },
            pairsFor: { _, candidates in boatPairs(candidates) },
            spriteName: "boat",
            selectedSpriteName: "boat-sel",
            tint: PandaTheme.blue,
            badgeOffsetY: -54
        )
    }

    private func boatCandidates(_ idx: Int) -> [Int] {
        let seeds: [[Int]] = [
            [4, 7, 2, 9, 1, 6],
            [3, 8, 5, 2, 7, 1],
            [6, 4, 9, 1, 8, 2],
            [5, 6, 4, 9, 1, 2],
            [3, 7, 8, 2, 9, 1],
        ]
        return seeds[idx % seeds.count]
    }

    private func boatPairs(_ candidates: [Int]) -> [[Int]] {
        // Return every unique pair that sums to 10 — the kid has to find
        // them all before the round completes. Deduplicate so [4,6] and
        // [6,4] don't both appear.
        var seen = Set<String>()
        var pairs: [[Int]] = []
        for i in 0..<candidates.count {
            for j in (i + 1)..<candidates.count {
                let a = candidates[i], b = candidates[j]
                if a + b == 10 {
                    let key = a < b ? "\(a)-\(b)" : "\(b)-\(a)"
                    if !seen.contains(key) {
                        seen.insert(key)
                        pairs.append([a, b])
                    }
                }
            }
        }
        return pairs
    }
}

// MARK: - Bounce

/// 4 balloons, pop the one that completes 10.
public struct BounceGameView: View {
    public init() {}
    public var body: some View { BounceGameBody() }
}

private struct BounceGameBody: View {
    @State private var roundIndex = 0
    @State private var popped = false
    @State private var wrong = -1
    @State private var showSuccess = false
    @State private var correctIdx = -1
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    /// Track previously-shown rounds so the kid sees a fresh 4-digit
    /// board every time and never the same digits twice in a row.
    @State private var usedRounds: Set<[Int]> = []
    @State private var currentDigits: [Int] = []

    var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            content
        }
        .onAppear {
            audio.configureSession()
            audio.playCue("bounce-intro")
            if currentDigits.isEmpty { rollNewRound() }
        }
    }

    /// Roll a fresh 4-digit board of DISTINCT digits 1–9 where at least
    /// one valid pair sums to 10. Avoids any board already used this
    /// session so the kid doesn'\''t see a repeat.
    private func rollNewRound() {
        var digits: [Int] = []
        var tries = 0
        while tries < 60 {
            tries += 1
            digits = []
            var pool = (1...9).shuffled()
            // Take the first 4 distinct digits.
            for _ in 0..<4 { digits.append(pool.removeFirst()) }
            // At least one digit must have its complement (10 - d) on the
            // board so the round is solvable.
            let solvable = digits.contains { d in
                let c = 10 - d
                return (1...9).contains(c) && digits.contains(c) && c != d
            }
            if !solvable { continue }
            // Skip boards we'\''ve already shown.
            if usedRounds.contains(digits) { continue }
            break
        }
        usedRounds.insert(digits)
        currentDigits = digits
    }

    @ViewBuilder
    private var content: some View {
        // If rollNewRound() hasn'\''t run yet (e.g. body evaluated before
        // onAppear), fall back to a safe default. onAppear will replace
        // currentDigits with a real random board on the next refresh.
        let digits = currentDigits.isEmpty ? [1, 2, 3, 9] : currentDigits
        let target = 10
        // Pick a "needs" digit whose complement is also on the board
        // (and different from itself) so the round is solvable.
        let needs: Int? = digits.first(where: {
            let complement = target - $0
            return (1...9).contains(complement) && digits.contains(complement) && complement != $0
        })
        // The equation shows one addend (the displayed balloon number)
        // and the ? to fill. The kid picks the balloon whose number
        // completes a + ? = 10.
        // `needs` is the digit the kid has to PICK (a balloon value).
        // The equation therefore shows `(target - needs) + ? = target`,
        // i.e. the complement of `needs` as the visible addend, so that
        // tapping the balloon with value `needs` completes the equation.
        let answer = needs ?? digits[0]
        let shownAddend = target - answer
        let equationSlots: [MathSlot] = [
            .number(shownAddend, color: PandaTheme.numBlue),
            .op(.plus),
            .answerBox("?", color: PandaTheme.ink),
            .op(.equals),
            .number(target, color: PandaTheme.orange),
        ]
        let balloonSize: CGFloat = 180
        let equationSize: CGFloat = 96
        VStack(spacing: 12) {
            // Top row: back button + round counter (consistent across games).
            HStack(alignment: .center, spacing: 0) {
                IconButton(style: .back) {
                    audio.stopAllAudio()
                    dismiss()
                }
                Spacer()
                Text("\(roundIndex + 1) / \(5)")
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

            // StepBar on top — same position as PairGameScaffold.
            StepBar(labels: ["开始", "第 1 对", "完成"],
                    step: min(roundIndex + 1, 5),
                    totalSteps: 5,
                    width: 600)

            // Top spacer — pushes the equation + balloons down so the
            // top of the screen has room for the step bar / counter.
            Spacer(minLength: 60)

            // Equation sits BELOW the step bar (per spec).
            MathExpression(slots: equationSlots, size: equationSize)
                .frame(maxWidth: .infinity)
                .frame(height: equationSize + 32)

            // Balloons grid.
            HStack(spacing: 12) {
                ForEach(Array(digits.enumerated()), id: \.offset) { idx, value in
                    balloonTile(value: value,
                                idx: idx,
                                needs: answer,
                                size: balloonSize)
                        .frame(maxWidth: .infinity)
                        // The tapped correct balloon pops with a slight
                        // scale + rotation for a satisfying feedback.
                        .scaleEffect(idx == correctIdx ? 1.15 : 1.0)
                        .rotationEffect(.degrees(idx == correctIdx ? -8 : 0))
                        .animation(.spring(response: 0.35, dampingFraction: 0.6),
                                   value: correctIdx)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: balloonSize + 32)
            .padding(.horizontal, 16)

            // Success overlay — appears centred above the panda for the
            // duration of the celebration before the next round loads.
            if showSuccess {
                Text("答对了！")
                    .font(.pandaFont(size: 48, weight: .black))
                    .foregroundColor(Color(PandaTheme.successDeep))
                    .shadow(color: .white.opacity(0.9), radius: 6, x: 0, y: 0)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 12)
                    .background(
                        Capsule()
                            .fill(Color.white)
                            .overlay(Capsule().stroke(Color(PandaTheme.success), lineWidth: 5))
                    )
                    .transition(.scale.combined(with: .opacity))
            }

            Spacer()

        }
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: showSuccess)
        .animation(.easeInOut(duration: 0.25), value: wrong)
    }
    @ViewBuilder
    private func balloonTile(value: Int, idx: Int, needs: Int?, size: CGFloat = 110) -> some View {
        SpriteTile(
            value: value,
            spriteName: "balloon",
            selectedSpriteName: nil,
            isSelected: false,
            isDisabled: popped,
            isWrong: wrong == idx,
            size: size,
            spriteScale: 0.95,
            labelOffsetY: -42,
            tint: PandaTheme.pink
        ) {
            tap(value: value, needs: needs, idx: idx)
        }
    }

    private func tap(value: Int, needs: Int?, idx: Int) {
        guard !popped, !showSuccess else { return }
        if value == needs {
            // Success state: pop the balloon, play both bounce-pop +
            // "correct" cues, raise panda cheer + show 答对了 overlay.
            popped = true
            showSuccess = true
            correctIdx = idx
            audio.playCue("bounce-pop")
            audio.playCue("correct")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                saveStore.markGameRoundFinished(2)
                if roundIndex + 1 < 5 {
                    roundIndex += 1
                    popped = false
                    showSuccess = false
                    correctIdx = -1
                    wrong = -1
                    rollNewRound()
                } else {
                    dismiss()
                }
            }
        } else {
            wrong = idx
            audio.playCue("wrong")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { wrong = -1 }
        }
    }
}

// MARK: - Cloud

/// 6 clouds with 4 choices, kid picks the answer to the equation.
public struct CloudGameView: View {
    public init() {}
    public var body: some View { CloudGameBody() }
}

private struct CloudGameBody: View {
    @State private var roundIndex = 0
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    /// Each round: 3 addends (a, b, c) and 4 answer choices (correct + 3
    /// wrong neighbours). Generated on the fly so the kid sees fresh
    /// 3-addend equations every time and never the same problem twice in
    /// a row.
    struct CloudRound: Equatable {
        let addends: [Int]
        let choices: [Int]
        let correct: Int
    }
    @State private var usedRounds: Set<String> = []
    @State private var currentRound: CloudRound?
    /// Bumped every time we roll a new round — used as a SwiftUI id() so
    /// the inner view re-creates even if roundIndex hasn't moved yet.
    @State private var rollToken: Int = 0

    var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            content
        }
        .onAppear {
            audio.configureSession()
            audio.playCue("cloud-intro")
            if currentRound == nil { rollNewRound() }
        }
    }

    /// Roll a fresh round. Two question types:
    ///   • Type A: 3 distinct addends 1–9 that sum to ≤ 10.
    ///   • Type B: two addends that sum to 10 (e.g. 3+7), plus a third
    ///     distinct digit 1–9 (so the total is 10 + that digit).
    /// Each round, picks one of the two types at random and generates
    /// 4 choices (correct + 3 nearby). Avoids repeats in the session.
    private func rollNewRound() {
        let pairs: [(Int, Int)] = [(1, 9), (2, 8), (3, 7), (4, 6)]
        var addends: [Int] = []
        var correct: Int = 0
        var choices: [Int] = []
        var key: String = ""
        var tries = 0
        while tries < 100 {
            tries += 1
            if Bool.random() {
                // Type A — 3 distinct addends 1–9 summing to ≤ 10.
                var pool = (1...9).shuffled()
                let a = pool.removeFirst()
                let b = pool.removeFirst()
                let c = pool.removeFirst()
                addends = [a, b, c].sorted()
                if a + b + c > 10 { continue }
                correct = a + b + c
            } else {
                // Type B — two addends that sum to 10, plus a third
                // distinct digit 1–9.
                let (x, y) = pairs.randomElement()!
                var z = Int.random(in: 1...9)
                while z == x || z == y { z = Int.random(in: 1...9) }
                addends = [x, y, z].sorted()
                correct = x + y + z
            }
            // 3 wrong choices near `correct` (so distractors feel related
            // rather than random) — fall back to any unused value.
            var wrong = Set<Int>()
            for d in [-2, -1, 1, 2, -3, 3, -4, 4] {
                let v = correct + d
                if v != correct && v >= 3 && !wrong.contains(v) { wrong.insert(v) }
                if wrong.count == 3 { break }
            }
            var topup = 3
            while wrong.count < 3 && topup < 30 {
                if topup != correct && !wrong.contains(topup) { wrong.insert(topup) }
                topup += 1
            }
            choices = (Array(wrong.prefix(3)) + [correct]).shuffled()
            // Key includes the question type so a Type A and a Type B
            // round with the same addends are both allowed.
            let typeA = addends.reduce(0, +) <= 10
            key = "\(typeA ? "A" : "B")|\(addends)|\(correct)"
            if usedRounds.contains(key) { continue }
            usedRounds.insert(key)
            break
        }
        currentRound = CloudRound(addends: addends, choices: choices, correct: correct)
        rollToken &+= 1
    }

    private var content: some View {
                // .id() forces a fresh view (and resets @State like `locked` and
        // `wrong`) on every round change, otherwise SwiftUI would reuse
        // the previous instance and show the answer immediately.
        let r = currentRound ?? CloudRound(addends: [2, 3, 5], choices: [8, 9, 10, 11], correct: 10)
        return CloudGameRound(
            roundIndex: roundIndex,
            roundCount: 5,
            onBack: { audio.stopAllAudio(); dismiss() },
            addends: r.addends,
            choices: r.choices,
            correct: r.correct,
            onCorrect: {
                audio.playCue("cloud-done")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    saveStore.markGameRoundFinished(3)
                    if roundIndex + 1 < 5 {
                        // Roll a FRESH round (Type A: 三数相加≤10 or
                        // Type B: 两数凑十+第三数) BEFORE bumping
                        // roundIndex. rollNewRound() updates
                        // `currentRound` + `rollToken`, and the view's
                        // .id() keys off both — so the inner
                        // CloudGameRound is recreated with the new
                        // addends and a fresh `locked` state. The
                        // `usedRounds` set guarantees we never show
                        // the same problem twice in a row, so all 5
                        // rounds in a session are distinct.
                        rollNewRound()
                        roundIndex += 1
                    } else {
                        dismiss()
                    }
                }
            },
        )
        // .id() keys on roundIndex AND the round content so the view
        // re-creates whenever a fresh question is rolled (otherwise the
        // addends/choices wouldn'\''t refresh).
        .id("cloud-\(roundIndex)-\(rollToken)")
    }
}

private struct CloudGameRound: View {
    let roundIndex: Int
    let roundCount: Int
    let onBack: () -> Void
    let addends: [Int]
    let choices: [Int]
    let correct: Int
    let onCorrect: () -> Void

    @State private var locked = false
    @State private var wrong: Int = -1
    @State private var floats: [CGFloat] = Array(repeating: 0, count: 4)
    @EnvironmentObject private var audio: PandaAudio

    var body: some View {
        VStack(spacing: 12) {
            // Top row: back button + round counter (consistent across games).
            HStack(alignment: .center, spacing: 0) {
                IconButton(style: .back, action: onBack)
                Spacer()
                Text("\(roundIndex + 1) / \(roundCount)")
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

            // StepBar (progress) above the equation.
            StepBar(labels: ["开始", "第 1 对", "完成"],
                    step: min(roundIndex + 1, roundCount),
                    totalSteps: roundCount,
                    width: 600)

            // Equation lives below the step bar.
            // Top spacer — drops the equation down so the step bar has
            // room and the equation reads as the "next thing to solve".
            Spacer(minLength: 50)

            equationRow
                .frame(height: 100)

            Spacer(minLength: 20)

            HStack(spacing: 8) {
                ForEach(Array(choices.enumerated()), id: \.offset) { idx, value in
                    SpriteTile(
                        value: value,
                        spriteName: "cloud",
                        selectedSpriteName: nil,
                        isSelected: false,
                        isDisabled: locked,
                        isWrong: wrong == idx,
                        size: 160,
                        spriteScale: 0.90,
                        labelOffsetY: -10,
                        tint: PandaTheme.purple
                    ) {
                        tap(idx: idx, value: value)
                    }
                    .offset(y: floats[idx])
                    .onAppear { startFloat(idx: idx) }
                }
            }
            .padding(.horizontal, 24)

            Spacer()

        }
    }

    private var equationRow: some View {
        HStack(spacing: 8) {
            Text("\(addends[0])")
                .font(.pandaFont(size: 56, weight: .black))   // bigger numbers
                .foregroundColor(Color(PandaTheme.numBlue))
            Text("+")
                .font(.pandaFont(size: 46))
                .foregroundColor(Color(PandaTheme.ink))
            Text("\(addends[1])")
                .font(.pandaFont(size: 56, weight: .black))
                .foregroundColor(Color(PandaTheme.success))
            Text("+")
                .font(.pandaFont(size: 46))
                .foregroundColor(Color(PandaTheme.ink))
            Text("\(addends[2])")
                .font(.pandaFont(size: 56, weight: .black))
                .foregroundColor(Color(PandaTheme.numPink))
            Text("=")
                .font(.pandaFont(size: 46))
                .foregroundColor(Color(PandaTheme.ink))
            Text(locked ? "\(correct)" : "?")
                .font(.pandaFont(size: 56, weight: .black))
                .foregroundColor(Color(locked ? PandaTheme.success : PandaTheme.orange))
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(PandaTheme.ink), lineWidth: 3))
                )
        }
    }

    private func startFloat(idx: Int) {
        let phase = Double(idx) * 0.7
        let start = Date()
        Task { @MainActor in
            while !locked {
                let t = Date().timeIntervalSince(start)
                floats[idx] = sin(t * 1.6 + phase) * 6
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }
    }

    private func tap(idx: Int, value: Int) {
        guard !locked else { return }
        if value == correct {
            locked = true
            audio.playCue("correct")
            onCorrect()
        } else {
            wrong = idx
            audio.playCue("wrong")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { wrong = -1 }
        }
    }
}

// MARK: - Feed

/// Panda eats any valid pair. Multi-pair per round, escalating size.
public struct FeedGameView: View {
    public init() {}
    public var body: some View { FeedGameBody() }
}

private struct FeedGameBody: View {
    @State private var roundIndex = 0
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            content
        }
        .onAppear {
            audio.configureSession()
            audio.playCue("feed-intro")
        }
    }

    private var content: some View {
        let round = FeedPools.build(roundIdx: roundIndex)
        // .id() forces a fresh view (and resets @State like `selected`
        // and `foundPairs`) on every round change so previously-picked
        // bubbles aren't carried over.
        return FeedGameRound(
            round: round,
            roundIndex: roundIndex,
            roundCount: 5,
            onBack: { audio.stopAllAudio(); dismiss() },
            onComplete: {
                audio.playCue("feed-done")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    saveStore.markGameRoundFinished(4)
                    if roundIndex + 1 < 5 {
                        roundIndex += 1
                    } else {
                        dismiss()
                    }
                }
            },
        )
        .id(roundIndex)
    }
}

private struct FeedGameRound: View {
    let round: FeedPools.Round
    let roundIndex: Int
    let roundCount: Int
    let onBack: () -> Void
    let onComplete: () -> Void

    @State private var foundPairs = 0
    @State private var pendingIndex: Int? = nil
    @State private var selected: Set<Int> = []
    @State private var wrong: Int = -1
    @EnvironmentObject private var audio: PandaAudio

    var body: some View {
        let targetSlots: [MathSlot] = [
            .answerBox("□", color: PandaTheme.ink),
            .op(.plus),
            .answerBox("□", color: PandaTheme.ink),
            .op(.equals),
            .number(round.target, color: PandaTheme.numYellow),
        ]
        VStack(spacing: 12) {
            // Top row: back button + round counter (consistent across games).
            HStack(alignment: .center, spacing: 0) {
                IconButton(style: .back, action: onBack)
                Spacer()
                Text("\(roundIndex + 1) / \(roundCount)")
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

            // StepBar (progress) sits above the equation.
            StepBar(
                labels: ["开始"] + (0..<round.pairCount).map { "第 \($0 + 1) 对" } + ["完成"],
                step: min(foundPairs + 1, round.pairCount + 1),
                totalSteps: round.pairCount + 1,
                width: 600
            )

            // The equation: "? + ? = N" — lives BELOW the step bar.
            MathExpression(slots: targetSlots, size: 56)
                .frame(maxWidth: .infinity)
                .frame(height: 72)

            Text("找两数之和等于 \(round.target)")
                .font(.pandaFont(size: 28))
                .foregroundColor(Color(PandaTheme.ink))
                .padding(.top, 4)

            Spacer()

            let columns = Array(repeating: GridItem(.flexible(), spacing: 14), count: 4)
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(Array(round.candidates.enumerated()), id: \.offset) { idx, value in
                    SpriteTile(
                        value: value,
                        spriteName: "bubble",
                        selectedSpriteName: "bubble-sel",
                        isSelected: pendingIndex == idx,
                        isDisabled: selected.contains(idx),
                        isWrong: wrong == idx,
                        size: 120,
                        spriteScale: 0.85,
                        labelOffsetY: -8,
                        tint: PandaTheme.orange
                    ) {
                        tap(idx: idx, value: value)
                    }
                }
            }
            .padding(.horizontal, 20)

            Spacer()

        }
    }

    private func tap(idx: Int, value: Int) {
        if selected.contains(idx) { return }
        if pendingIndex == nil {
            pendingIndex = idx
        } else if let p = pendingIndex, p != idx {
            if value + round.candidates[p] == round.target {
                selected.insert(p); selected.insert(idx); foundPairs += 1
                audio.playCue("correct")
                if foundPairs >= round.pairCount {
                    onComplete()
                }
            } else {
                audio.playCue("wrong")
                wrong = idx
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { wrong = -1 }
            }
            pendingIndex = nil
        } else {
            pendingIndex = nil
        }
    }
}

//
//  PairGames.swift
//  Panda
//
//  凑十 games: Boat, Bounce, Cloud, Feed.
//  Game state is kept deterministic per round and delayed work is lifecycle-safe.
//  Layouts use the available geometry so the same games work on iPhone and
//  11-inch iPad without hard-coded canvas widths.

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Shared sprite tile

@MainActor
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
    @State private var shakeTask: Task<Void, Never>?

    var body: some View {
        Button(action: handleTap) {
            ZStack {
                if let img = pandaImage(named: effectiveSpriteName) {
                    img
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: size * spriteScale, height: size * spriteScale)
                        .opacity(isDisabled ? 0.35 : 1)
                } else {
                    Circle()
                        .fill(Color(tint))
                        .frame(width: size * spriteScale, height: size * spriteScale)
                }
                Text("\(value)")
                    .font(.pandaFont(size: max(22, size * 0.32), weight: .black))
                    .foregroundColor(Color(PandaTheme.ink))
                    .shadow(color: .white.opacity(0.95), radius: 4)
                    .shadow(color: .white.opacity(0.85), radius: 2)
                    .offset(y: labelOffsetY)
            }
            .frame(width: size, height: size)
            .offset(x: shakeX)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .onChange(of: isWrong) { _, newValue in
            if newValue { runShake() }
        }
        .onDisappear {
            shakeTask?.cancel()
            shakeTask = nil
        }
    }

    private var effectiveSpriteName: String {
        if isSelected, let selectedSpriteName, pandaImage(named: selectedSpriteName) != nil {
            return selectedSpriteName
        }
        return spriteName
    }

    private func handleTap() {
        #if canImport(UIKit)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
        onTap()
    }

    private func runShake() {
        shakeTask?.cancel()
        let frames: [(CGFloat, UInt64)] = [
            (-10, 0), (10, 50), (-8, 100), (8, 150),
            (-6, 200), (6, 250), (-3, 300), (0, 350)
        ]
        shakeTask = Task { @MainActor in
            for (offset, milliseconds) in frames {
                if Task.isCancelled { return }
                if milliseconds > 0 {
                    try? await Task.sleep(nanoseconds: milliseconds * 1_000_000)
                }
                guard !Task.isCancelled else { return }
                shakeX = offset
            }
            shakeTask = nil
        }
    }
}

// MARK: - Pair scaffold

@MainActor
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
    @State private var selectedIndex: Int?
    @State private var selectedMask: Set<Int> = []
    @State private var done = false
    @State private var lifecycle = GameLifecycleToken()

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
            GeometryReader { geo in
                chrome(in: geo.size)
            }
        }
        .onAppear {
            lifecycle.reset()
            audio.configureSession()
            audio.playCue(introCue)
        }
        .onDisappear {
            lifecycle.reset()
            audio.stopAllAudio()
        }
    }

    private var candidates: [Int] { candidatesFor(roundIndex) }
    private var pairs: [[Int]] { pairsFor(roundIndex, candidates) }

    private func chrome(in size: CGSize) -> some View {
        VStack(spacing: 12) {
            HStack {
                IconButton(style: .back) { leave() }
                Spacer()
                Text("\(roundIndex + 1) / \(roundCount)")
                    .font(.pandaFont(size: min(28, size.width * 0.045)))
                    .foregroundColor(Color(PandaTheme.ink))
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4)))
                Spacer()
                Color.clear.frame(width: 80, height: 64)
            }
            .padding(.horizontal, max(16, min(32, size.width * 0.025)))
            .padding(.top, 12)

            StepBar(labels: ["开始", "第 1 对", "完成"],
                    step: min(foundPairs + 1, pairs.count + 1),
                    totalSteps: max(pairs.count + 1, 1),
                    width: min(600, size.width - 24))

            Text("找到两数之和等于 \(target)")
                .font(.pandaFont(size: min(32, size.width * 0.045)))
                .foregroundColor(Color(PandaTheme.ink))
                .padding(.top, 4)

            Spacer(minLength: 8)
            grid(in: size)
            Spacer(minLength: 8)
        }
    }

    private func grid(in size: CGSize) -> some View {
        let columnsCount = candidates.count <= 6 ? 3 : 4
        let horizontalPadding: CGFloat = min(32, max(16, size.width * 0.025))
        let gap: CGFloat = min(16, max(8, size.width * 0.018))
        let tileSize = min(140, max(88, (size.width - horizontalPadding * 2 - gap * CGFloat(columnsCount - 1)) / CGFloat(columnsCount)))
        let columns = Array(repeating: GridItem(.flexible(), spacing: gap), count: columnsCount)

        return LazyVGrid(columns: columns, spacing: gap) {
            ForEach(Array(candidates.enumerated()), id: \.offset) { idx, value in
                SpriteTile(value: value,
                            spriteName: spriteName,
                            selectedSpriteName: selectedSpriteName,
                            isSelected: selectedIndex == idx,
                            isDisabled: selectedMask.contains(idx) || done,
                            isWrong: false,
                            size: tileSize,
                            spriteScale: 0.85,
                            labelOffsetY: badgeOffsetY,
                            tint: tint) {
                    handleTap(idx: idx, value: value)
                }
            }
        }
        .padding(.horizontal, horizontalPadding)
    }

    private func handleTap(idx: Int, value: Int) {
        guard !done, !selectedMask.contains(idx) else { return }
        guard let first = selectedIndex else {
            selectedIndex = idx
            return
        }
        guard first != idx else {
            selectedIndex = nil
            return
        }
        selectedIndex = nil
        if value + candidates[first] == target {
            selectedMask.insert(first)
            selectedMask.insert(idx)
            foundPairs += 1
            audio.playCue("correct")
            if foundPairs >= pairs.count {
                done = true
                audio.playCue(roundEndCue(roundIndex))
                scheduleAdvance()
            }
        } else {
            audio.playCue("wrong")
        }
    }

    private func scheduleAdvance() {
        lifecycle.schedule(after: 1.4) {
            guard self.done else { return }
            self.saveStore.markGameRoundFinished(self.gameId)
            if self.roundIndex + 1 < self.roundCount {
                self.roundIndex += 1
                self.foundPairs = 0
                self.selectedIndex = nil
                self.selectedMask.removeAll()
                self.done = false
            } else {
                self.dismiss()
            }
        }
    }

    private func leave() {
        lifecycle.reset()
        audio.stopAllAudio()
        dismiss()
    }
}

// MARK: - Boat

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
            [4, 7, 2, 9, 1, 6], [3, 8, 5, 2, 7, 1],
            [6, 4, 9, 1, 8, 2], [5, 6, 4, 9, 1, 2],
            [3, 7, 8, 2, 9, 1]
        ]
        return seeds[idx % seeds.count]
    }

    private func boatPairs(_ candidates: [Int]) -> [[Int]] {
        var seen = Set<String>()
        var result: [[Int]] = []
        guard candidates.count > 1 else { return result }
        for i in 0..<(candidates.count - 1) {
            for j in (i + 1)..<candidates.count where candidates[i] + candidates[j] == 10 {
                let a = candidates[i], b = candidates[j]
                let key = a < b ? "\(a)-\(b)" : "\(b)-\(a)"
                if seen.insert(key).inserted { result.append([a, b]) }
            }
        }
        return result
    }
}

// MARK: - Bounce

public struct BounceGameView: View {
    public init() {}
    public var body: some View { BounceGameBody() }
}

@MainActor
private struct BounceGameBody: View {
    @State private var roundIndex = 0
    @State private var popped = false
    @State private var wrong = -1
    @State private var showSuccess = false
    @State private var correctIdx = -1
    @State private var usedRounds: Set<[Int]> = []
    @State private var currentDigits: [Int] = []
    @State private var lifecycle = GameLifecycleToken()
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
            GeometryReader { geo in content(in: geo.size) }
        }
        .onAppear {
            lifecycle.reset()
            audio.configureSession()
            audio.playCue("bounce-intro")
            if currentDigits.isEmpty { rollNewRound() }
        }
        .onDisappear {
            lifecycle.reset()
            audio.stopAllAudio()
        }
    }

    private func rollNewRound() {
        var digits: [Int] = []
        for _ in 0..<60 {
            let candidate = Array((1...9).shuffled().prefix(4))
            let solvable = candidate.contains { d in candidate.contains(10 - d) && d != 10 - d }
            if solvable && !usedRounds.contains(candidate) {
                digits = candidate
                break
            }
        }
        if digits.isEmpty { digits = [1, 2, 3, 7] }
        usedRounds.insert(digits)
        currentDigits = digits
    }

    private func content(in size: CGSize) -> some View {
        let digits = currentDigits.isEmpty ? [1, 2, 3, 7] : currentDigits
        let answer = digits.first(where: { digits.contains(10 - $0) && $0 != 10 - $0 }) ?? digits[0]
        let shownAddend = 10 - answer
        let equationSlots: [MathSlot] = [
            .number(shownAddend, color: PandaTheme.numBlue), .op(.plus),
            .answerBox("?", color: PandaTheme.ink), .op(.equals),
            .number(10, color: PandaTheme.orange)
        ]
        let horizontal = min(28, max(12, size.width * 0.025))
        let gap = min(18, max(6, size.width * 0.015))
        let balloonSize = min(180, max(82, (size.width - horizontal * 2 - gap * 3) / 4))

        return VStack(spacing: 12) {
            topBar(size: size)
            StepBar(labels: ["开始", "选择", "完成"], step: min(roundIndex + 1, 5), totalSteps: 5, width: min(600, size.width - 24))
            Spacer(minLength: 20)
            MathExpression(slots: equationSlots, size: min(96, size.width * 0.12))
                .frame(maxWidth: .infinity)
                .frame(height: min(112, size.height * 0.14))
            HStack(spacing: gap) {
                ForEach(Array(digits.enumerated()), id: \.offset) { idx, value in
                    SpriteTile(value: value, spriteName: "balloon", selectedSpriteName: nil,
                                isSelected: false, isDisabled: popped, isWrong: wrong == idx,
                                size: balloonSize, spriteScale: 0.95, labelOffsetY: -42,
                                tint: PandaTheme.pink) {
                        tap(value: value, needs: answer, idx: idx)
                    }
                    .scaleEffect(idx == correctIdx ? 1.15 : 1)
                    .rotationEffect(.degrees(idx == correctIdx ? -8 : 0))
                }
            }
            .padding(.horizontal, horizontal)
            .frame(maxWidth: .infinity)
            if showSuccess {
                Text("答对了！")
                    .font(.pandaFont(size: min(48, size.width * 0.07), weight: .black))
                    .foregroundColor(Color(PandaTheme.successDeep))
                    .padding(.horizontal, 28).padding(.vertical, 12)
                    .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.success), lineWidth: 5)))
                    .transition(.scale.combined(with: .opacity))
            }
            Spacer(minLength: 8)
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: showSuccess)
        .animation(.easeInOut(duration: 0.25), value: wrong)
    }

    private func topBar(size: CGSize) -> some View {
        HStack {
            IconButton(style: .back) { leave() }
            Spacer()
            Text("\(roundIndex + 1) / 5")
                .font(.pandaFont(size: min(28, size.width * 0.045)))
                .foregroundColor(Color(PandaTheme.ink))
                .padding(.horizontal, 24).padding(.vertical, 10)
                .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4)))
            Spacer()
            Color.clear.frame(width: 80, height: 64)
        }
        .padding(.horizontal, min(32, max(16, size.width * 0.025)))
        .padding(.top, 12)
    }

    private func tap(value: Int, needs: Int, idx: Int) {
        guard !popped, !showSuccess else { return }
        if value == needs {
            popped = true
            showSuccess = true
            correctIdx = idx
            audio.playCue("bounce-pop")
            audio.playCue("correct")
            lifecycle.schedule(after: 1.4) {
                guard self.popped, self.showSuccess else { return }
                self.saveStore.markGameRoundFinished(2)
                if self.roundIndex + 1 < 5 {
                    self.roundIndex += 1
                    self.popped = false
                    self.showSuccess = false
                    self.correctIdx = -1
                    self.wrong = -1
                    self.rollNewRound()
                } else {
                    self.dismiss()
                }
            }
        } else {
            wrong = idx
            audio.playCue("wrong")
            lifecycle.schedule(after: 0.5) { self.wrong = -1 }
        }
    }

    private func leave() {
        lifecycle.reset(); audio.stopAllAudio(); dismiss()
    }
}

// MARK: - Cloud

public struct CloudGameView: View {
    public init() {}
    public var body: some View { CloudGameBody() }
}

@MainActor
private struct CloudGameBody: View {
    struct CloudRound: Equatable {
        let addends: [Int]
        let choices: [Int]
        let correct: Int
    }

    @State private var roundIndex = 0
    @State private var usedRounds: Set<String> = []
    @State private var currentRound: CloudRound?
    @State private var rollToken = 0
    @State private var lifecycle = GameLifecycleToken()
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack { SceneBackground(name: "bg-meadow"); content }
            .onAppear {
                lifecycle.reset(); audio.configureSession(); audio.playCue("cloud-intro")
                if currentRound == nil { rollNewRound() }
            }
            .onDisappear { lifecycle.reset(); audio.stopAllAudio() }
    }

    private func rollNewRound() {
        let pairs = [(1,9), (2,8), (3,7), (4,6)]
        for _ in 0..<100 {
            var addends: [Int]
            if Bool.random() {
                let p = Array((1...9).shuffled().prefix(3))
                guard p.reduce(0, +) <= 10 else { continue }
                addends = p.sorted()
            } else {
                let (x, y) = pairs.randomElement()!
                var z = Int.random(in: 1...9)
                while z == x || z == y { z = Int.random(in: 1...9) }
                addends = [x, y, z].sorted()
            }
            let correct = addends.reduce(0, +)
            var distractors = Set<Int>()
            for delta in [-2, -1, 1, 2, -3, 3, -4, 4] where distractors.count < 3 {
                let value = correct + delta
                if value >= 3 && value != correct { distractors.insert(value) }
            }
            var top = 3
            while distractors.count < 3 {
                if top != correct { distractors.insert(top) }
                top += 1
            }
            let choices = (Array(distractors.prefix(3)) + [correct]).shuffled()
            let key = "\(addends)|\(correct)"
            if usedRounds.insert(key).inserted {
                currentRound = CloudRound(addends: addends, choices: choices, correct: correct)
                rollToken &+= 1
                return
            }
        }
        currentRound = CloudRound(addends: [2,3,5], choices: [8,9,10,11], correct: 10)
        rollToken &+= 1
    }

    private var content: some View {
        let r = currentRound ?? CloudRound(addends: [2,3,5], choices: [8,9,10,11], correct: 10)
        return CloudGameRound(roundIndex: roundIndex, roundCount: 5,
                              onBack: leave, addends: r.addends,
                              choices: r.choices, correct: r.correct) { advanceAfterCorrect() }
            .id("cloud-\(roundIndex)-\(rollToken)")
    }

    private func advanceAfterCorrect() {
        audio.playCue("cloud-done")
        lifecycle.schedule(after: 1.2) {
            self.saveStore.markGameRoundFinished(3)
            if self.roundIndex + 1 < 5 {
                self.rollNewRound()
                self.roundIndex += 1
            } else {
                self.dismiss()
            }
        }
    }

    private func leave() { lifecycle.reset(); audio.stopAllAudio(); dismiss() }
}

@MainActor
private struct CloudGameRound: View {
    let roundIndex: Int
    let roundCount: Int
    let onBack: () -> Void
    let addends: [Int]
    let choices: [Int]
    let correct: Int
    let onCorrect: () -> Void

    @State private var locked = false
    @State private var wrong = -1
    @State private var floats: [CGFloat] = Array(repeating: 0, count: 4)
    @State private var floatTasks: [Task<Void, Never>?] = Array(repeating: nil, count: 4)
    @EnvironmentObject private var audio: PandaAudio

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 12) {
                HStack {
                    IconButton(style: .back, action: onBack)
                    Spacer()
                    Text("\(roundIndex + 1) / \(roundCount)")
                        .font(.pandaFont(size: min(28, geo.size.width * 0.045)))
                        .foregroundColor(Color(PandaTheme.ink))
                        .padding(.horizontal, 24).padding(.vertical, 10)
                        .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4)))
                    Spacer()
                    Color.clear.frame(width: 80, height: 64)
                }
                .padding(.horizontal, min(32, max(16, geo.size.width * 0.025)))
                .padding(.top, 12)

                StepBar(labels: ["开始", "选择", "完成"], step: min(roundIndex + 1, roundCount), totalSteps: roundCount, width: min(600, geo.size.width - 24))
                Spacer(minLength: 16)
                equationRow.font(.pandaFont(size: min(56, geo.size.width * 0.07)))
                    .frame(height: min(110, geo.size.height * 0.14))
                Spacer(minLength: 12)

                let gap = min(14, max(6, geo.size.width * 0.012))
                let horizontal = min(28, max(16, geo.size.width * 0.025))
                let tileSize = min(160, max(78, (geo.size.width - horizontal * 2 - gap * 3) / 4))
                HStack(spacing: gap) {
                    ForEach(Array(choices.enumerated()), id: \.offset) { idx, value in
                        SpriteTile(value: value, spriteName: "cloud", selectedSpriteName: nil,
                                    isSelected: false, isDisabled: locked, isWrong: wrong == idx,
                                    size: tileSize, spriteScale: 0.9, labelOffsetY: -10,
                                    tint: PandaTheme.purple) {
                            tap(idx: idx, value: value)
                        }
                        .offset(y: floats[idx])
                        .task(id: "float-\(idx)-\(roundIndex)") { await startFloat(idx: idx) }
                    }
                }
                .padding(.horizontal, horizontal)
                Spacer(minLength: 8)
            }
        }
        .onDisappear { cancelFloatTasks() }
    }

    private var equationRow: some View {
        HStack(spacing: 8) {
            Text("\(addends[0])").foregroundColor(Color(PandaTheme.numBlue))
            Text("+").foregroundColor(Color(PandaTheme.ink))
            Text("\(addends[1])").foregroundColor(Color(PandaTheme.success))
            Text("+").foregroundColor(Color(PandaTheme.ink))
            Text("\(addends[2])").foregroundColor(Color(PandaTheme.numPink))
            Text("=").foregroundColor(Color(PandaTheme.ink))
            Text(locked ? "\(correct)" : "?")
                .foregroundColor(Color(locked ? PandaTheme.success : PandaTheme.orange))
                .padding(.horizontal, 14).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(PandaTheme.ink), lineWidth: 3)))
        }
    }

    private func startFloat(idx: Int) async {
        let phase = Double(idx) * 0.7
        let start = Date()
        while !Task.isCancelled && !locked {
            let t = Date().timeIntervalSince(start)
            floats[idx] = sin(t * 1.6 + phase) * 6
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    private func cancelFloatTasks() {
        for task in floatTasks { task?.cancel() }
        floatTasks = Array(repeating: nil, count: 4)
    }

    private func tap(idx: Int, value: Int) {
        guard !locked else { return }
        if value == correct {
            locked = true
            cancelFloatTasks()
            audio.playCue("correct")
            onCorrect()
        } else {
            wrong = idx
            audio.playCue("wrong")
            // A second wrong tap replaces the pending clear instead of
            // creating an unbounded queue of delayed callbacks.
            let captured = idx
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard !Task.isCancelled, wrong == captured, !locked else { return }
                wrong = -1
            }
        }
    }
}

// MARK: - Feed

public struct FeedGameView: View {
    public init() {}
    public var body: some View { FeedGameBody() }
}

@MainActor
private struct FeedGameBody: View {
    @State private var roundIndex = 0
    @State private var lifecycle = GameLifecycleToken()
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack { SceneBackground(name: "bg-meadow"); content }
            .onAppear { lifecycle.reset(); audio.configureSession(); audio.playCue("feed-intro") }
            .onDisappear { lifecycle.reset(); audio.stopAllAudio() }
    }

    private var content: some View {
        let round = FeedPools.build(roundIdx: roundIndex)
        return FeedGameRound(round: round, roundIndex: roundIndex, roundCount: 5,
                             onBack: leave) { completeRound() }
            .id(roundIndex)
    }

    private func completeRound() {
        audio.playCue("feed-done")
        lifecycle.schedule(after: 1.2) {
            self.saveStore.markGameRoundFinished(4)
            if self.roundIndex + 1 < 5 { self.roundIndex += 1 }
            else { self.dismiss() }
        }
    }

    private func leave() { lifecycle.reset(); audio.stopAllAudio(); dismiss() }
}

@MainActor
private struct FeedGameRound: View {
    let round: FeedPools.Round
    let roundIndex: Int
    let roundCount: Int
    let onBack: () -> Void
    let onComplete: () -> Void

    @State private var foundPairs = 0
    @State private var pendingIndex: Int?
    @State private var selected: Set<Int> = []
    @State private var wrong = -1
    @EnvironmentObject private var audio: PandaAudio

    var body: some View {
        GeometryReader { geo in
            let horizontal = min(28, max(16, geo.size.width * 0.025))
            let gap = min(14, max(8, geo.size.width * 0.015))
            let columnsCount = min(4, max(2, round.candidates.count))
            let tileSize = min(120, max(76, (geo.size.width - horizontal * 2 - gap * CGFloat(columnsCount - 1)) / CGFloat(columnsCount)))
            let columns = Array(repeating: GridItem(.flexible(), spacing: gap), count: columnsCount)

            VStack(spacing: 12) {
                HStack {
                    IconButton(style: .back, action: onBack)
                    Spacer()
                    Text("\(roundIndex + 1) / \(roundCount)")
                        .font(.pandaFont(size: min(28, geo.size.width * 0.045)))
                        .foregroundColor(Color(PandaTheme.ink))
                        .padding(.horizontal, 24).padding(.vertical, 10)
                        .background(Capsule().fill(Color.white).overlay(Capsule().stroke(Color(PandaTheme.orange), lineWidth: 4)))
                    Spacer()
                    Color.clear.frame(width: 80, height: 64)
                }
                .padding(.horizontal, horizontal).padding(.top, 12)

                StepBar(labels: ["开始"] + (0..<round.pairCount).map { "第 \($0 + 1) 对" } + ["完成"],
                        step: min(foundPairs + 1, round.pairCount + 1), totalSteps: round.pairCount + 1,
                        width: min(600, geo.size.width - 24))

                MathExpression(slots: targetSlots, size: min(56, geo.size.width * 0.07))
                    .frame(maxWidth: .infinity).frame(height: 72)
                Text("找两数之和等于 \(round.target)")
                    .font(.pandaFont(size: min(28, geo.size.width * 0.04)))
                    .foregroundColor(Color(PandaTheme.ink))
                Spacer(minLength: 8)

                LazyVGrid(columns: columns, spacing: gap) {
                    ForEach(Array(round.candidates.enumerated()), id: \.offset) { idx, value in
                        SpriteTile(value: value, spriteName: "bubble", selectedSpriteName: "bubble-sel",
                                    isSelected: pendingIndex == idx, isDisabled: selected.contains(idx),
                                    isWrong: wrong == idx, size: tileSize, spriteScale: 0.85,
                                    labelOffsetY: -8, tint: PandaTheme.orange) {
                            tap(idx: idx, value: value)
                        }
                    }
                }
                .padding(.horizontal, horizontal)
                Spacer(minLength: 8)
            }
        }
    }

    private var targetSlots: [MathSlot] {
        [.answerBox("□", color: PandaTheme.ink), .op(.plus), .answerBox("□", color: PandaTheme.ink), .op(.equals), .number(round.target, color: PandaTheme.numYellow)]
    }

    private func tap(idx: Int, value: Int) {
        guard !selected.contains(idx) else { return }
        guard let first = pendingIndex else { pendingIndex = idx; return }
        guard first != idx else { pendingIndex = nil; return }
        pendingIndex = nil
        if value + round.candidates[first] == round.target {
            selected.insert(first); selected.insert(idx); foundPairs += 1
            audio.playCue("correct")
            if foundPairs >= round.pairCount { onComplete() }
        } else {
            wrong = idx
            audio.playCue("wrong")
            let captured = idx
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard !Task.isCancelled, wrong == captured else { return }
                wrong = -1
            }
        }
    }
}

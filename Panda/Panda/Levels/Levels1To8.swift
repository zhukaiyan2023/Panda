//
//  Levels1To8.swift
//  Panda
//
//  The 8 math levels. Each level is a `RoundScaffold` with its own
//  pool, step labels, and a `stepBuilder` closure that renders
//  anchor (the original equation) + body (visual decomposition aid) +
//  current sub-equation + question + audio cues.
//
//  Curriculum (renumbered for clean progression):
//    L1 十以内减法        subWithinTen
//    L2 三数相加          threeSum (a+b+c ≤ 10)
//    L3 两个数凑十        threeTen (a+b=10 or b+c=10)
//    L4 凑十法            makeTen (a+b > 10)
//    L5 二十以内          teen + digit, no carry
//    L6 十几加十几        teen + teen, no carry
//    L7 十几减几（不退位）teen - digit, no borrow
//    L8 破十法            teen - digit, with borrow
//
//  Each step's audio cues (intro / per-step / reward) match the
//  pre-baked mp3s in Resources/audio/.
//

import SwiftUI

/// Wrap a `MathExpression` in a fixed-height frame so it lays out
/// cleanly inside a `StepRender`'s vertical stack.
@ViewBuilder
func expr(_ slots: [MathSlot], size: CGFloat) -> some View {
    MathExpression(slots: slots, size: size)
        .frame(maxWidth: .infinity)
        .frame(height: size + 24)
}

// MARK: - Audio helpers

/// Plays a single audio cue. Falls back to no-op if id is empty.
@MainActor
func playCue(_ audio: PandaAudio, _ id: String) {
    guard !id.isEmpty else { return }
    audio.playCue(id)
}

/// Plays a sequence of cues (e.g. intro + per-step + reward).
@MainActor
func playCues(_ audio: PandaAudio, _ ids: [String]) {
    for id in ids { audio.playCue(id) }
}

// MARK: - L1: 十以内减法 (subWithinTen)

public struct Level1View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 1,
            sampleSize: 6,
            stepLabels: ["算一算"],
            poolGen: PandaPools.poolGensForLevel(1),
            stepBuilder: { round, _, host in
                guard case .subWithinTen(let a, let b) = round else {
                    return StepRender()
                }
                let answer = a - b
                // Audio: "a减b等于几" (cue id: l1-{a}-{b})
                host.playCue("\(a)-\(b)")
                let anchor = ExpressionBuilder.sub(a, b, answer: "□")
                let equation = ExpressionBuilder.sub(a, b, answer: "□")
                return StepRender(
                    anchor: AnyView(expr(anchor, size: 96)),
                    equation: AnyView(expr(equation, size: 96)),
                    question: host.makeQuestion(
                        correct: answer,
                        values: optionChoices(correct: answer, min: 0, max: 10))
                )
            },
            onRoundCorrect: { audio, round in
                guard case .subWithinTen(let a, let b) = round else { return }
                let answer = a - b
                // Reward audio: "a减b等于answer" — picks from
                // pre-baked l1-{a}-{b}-{answer} cues if available.
                audio.playCue("\(a)-\(b)-\(answer)")
            }
        )
    }
}

// MARK: - L2: 三数相加 (threeSum)

public struct Level2View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 2,
            sampleSize: 6,
            stepLabels: ["两两相加", "加上第三个数"],
            poolGen: PandaPools.poolGensForLevel(2),
            stepBuilder: { round, step, host in
                guard case .threeSum(let a, let b, let c) = round else {
                    return StepRender()
                }
                let pairSum = a + b
                let total = a + b + c
                let anchorSlots: [MathSlot] = [
                    .number(a, color: PandaTheme.numBlue),
                    .op(.plus),
                    .number(b, color: PandaTheme.numYellow),
                    .op(.plus),
                    .number(c, color: PandaTheme.numPink),
                    .op(.equals),
                    .answerBox("□", color: PandaTheme.ink),
                ]
                // Step 1: "先把前两个相加" — pair sum.
                if step == 1 {
                    // Audio: "l2-s1-{a}-{b}" (找十 — per-addend-pair prompt).
                    host.playCue("l2-s1-\(a)-\(b)")
                    let pairSlots: [MathSlot] = [
                        .number(a, color: PandaTheme.numBlue),
                        .op(.plus),
                        .number(b, color: PandaTheme.numYellow),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    // Body: number-bond / count-circles visual aid
                    // for the three addends (a, b, c).
                    let body = AnyView(ThreeAddendBeads(a: a, b: b, c: c, highlightFirst: true))
                    // Decomposition visualization: anchor on top, the
                    // pair equation below, with V-curves from anchor's
                    // a (slot 0) and b (slot 2) down to the pair eq's
                    // answer box (slot 4). The pair eq's answer IS the
                    // merge result on this step.
                    let arrows = AnyView(
                        DecompositionView(
                            topSlots: anchorSlots,
                            topSize: 64,
                            bottomSlots: pairSlots,
                            bottomSize: 80,
                            arrows: [
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 0,
                                    toRow: 1, toSlot: 4,
                                    color: Color(PandaTheme.numBlue),
                                    vArrowhead: true
                                ),
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 2,
                                    toRow: 1, toSlot: 4,
                                    color: Color(PandaTheme.numYellow),
                                    vArrowhead: true
                                ),
                            ]
                        )
                    )
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(pairSlots, size: 80)),
                        bodyView: body,
                        question: host.makeQuestion(
                            correct: pairSum,
                            values: optionChoices(correct: pairSum, min: 2, max: 9)),
                        arrows: arrows
                    )
                } else {
                    // Step 2: "加起来". Audio: l2-s2 (算什么).
                    host.playCue("l2-s2")
                    let previewSlots: [MathSlot] = [
                        .number(pairSum, color: PandaTheme.numYellow),
                        .op(.plus),
                        .number(c, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let body = AnyView(ThreeAddendBeads(a: a, b: b, c: c, highlightFirst: false))
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(previewSlots, size: 80)),
                        bodyView: body,
                        question: host.makeQuestion(
                            correct: total,
                            values: optionChoices(correct: total, min: 3, max: 10))
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .threeSum(let a, let b, let c) = round else { return }
                let total = a + b + c
                audio.playCue("l2-rwd-\(a)-\(b)-\(c)-\(total)")
            }
        )
    }
}

// MARK: - L3: 两个数凑十 (threeTen)

public struct Level3View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 3,
            sampleSize: 6,
            stepLabels: ["找十", "算一算"],
            poolGen: PandaPools.poolGensForLevel(3),
            stepBuilder: { round, step, host in
                guard case .threeTen(let a, let b, let c) = round else {
                    return StepRender()
                }
                let total = a + b + c
                let tenPair: [Int]
                let leftover: Int
                if a + b == 10 { tenPair = [a, b]; leftover = c }
                else { tenPair = [b, c]; leftover = a }
                let anchorSlots: [MathSlot] = [
                    .number(a, color: PandaTheme.numBlue),
                    .op(.plus),
                    .number(b, color: PandaTheme.numYellow),
                    .op(.plus),
                    .number(c, color: PandaTheme.numPink),
                    .op(.equals),
                    .answerBox("□", color: PandaTheme.ink),
                ]
                if step == 1 {
                    // Step 1 — find the 10-pair.
                    host.playCue("l3-s1")
                    let pairSlots: [MathSlot] = [
                        .number(tenPair[0], color: PandaTheme.numBlue),
                        .op(.plus),
                        .number(tenPair[1], color: PandaTheme.numYellow),
                        .op(.equals),
                        .number(10, color: PandaTheme.yellow),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(pairSlots, size: 80)),
                        question: host.makeQuestion(
                            correct: leftover,
                            values: optionChoices(correct: leftover, min: 1, max: 9),
                            labelFor: { v in "10+\(v)" }
                        )
                    )
                } else {
                    // Step 2 — 10 + leftover = total.
                    host.playCue("l3-s2")
                    let resultSlots: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(leftover, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(resultSlots, size: 80)),
                        question: host.makeQuestion(
                            correct: total,
                            values: optionChoices(correct: total, min: 11, max: 19))
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .threeTen(let a, let b, let c) = round else { return }
                let total = a + b + c
                audio.playCue("l3-rwd-\(a)-\(b)-\(c)-\(total)")
            }
        )
    }
}

// MARK: - L4: 凑十法 (makeTen)

public struct Level4View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 4,
            sampleSize: 6,
            stepLabels: ["拆小数", "凑十", "算一算"],
            poolGen: PandaPools.poolGensForLevel(4),
            stepBuilder: { round, step, host in
                guard case .makeTen(let a, let b) = round else { return StepRender() }
                let big = max(a, b)
                let small = min(a, b)
                let need = 10 - big
                let rest = small - need
                let total = a + b
                let anchorSlots = ExpressionBuilder.add(a, b, sum: "□")
                if step == 1 {
                    // Step 1 — 拆小数 (split the small into need + rest).
                    host.playCue("l3-s1")
                    let eq: [MathSlot] = [
                        .number(small, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                        .op(.plus),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: need,
                            values: optionChoices(correct: need, min: 1, max: 9),
                            labelFor: { v in "\(v)+\(big)" }
                        )
                    )
                } else if step == 2 {
                    // Step 2 — 凑十 (10 + rest).
                    host.playCue("l3-s2")
                    let eq: [MathSlot] = [
                        .number(big, color: PandaTheme.numBlue),
                        .op(.plus),
                        .number(need, color: PandaTheme.numYellow),
                        .op(.plus),
                        .answerBox("□", color: PandaTheme.ink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 64)),
                        question: host.makeQuestion(
                            correct: rest,
                            values: optionChoices(correct: rest, min: 0, max: 8)
                        )
                    )
                } else {
                    // Step 3 — 算答案.
                    host.playCue("l3-s3")
                    let eq: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(rest, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 80)),
                        question: host.makeQuestion(
                            correct: total,
                            values: optionChoices(correct: total, min: 11, max: 19)
                        )
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .makeTen(let a, let b) = round else { return }
                audio.playCue("l3-rwd-\(a)-\(b)-\(a+b)")
            }
        )
    }
}

// MARK: - L5: 二十以内 (teenPlusDigit)

public struct Level5View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 5,
            sampleSize: 6,
            stepLabels: ["拆十", "加个位", "算答案"],
            poolGen: PandaPools.poolGensForLevel(5),
            stepBuilder: { round, step, host in
                guard case .teenPlusDigit(let a, let b) = round else { return StepRender() }
                let ones = a % 10
                let smallSum = ones + b
                let total = a + b
                let anchorSlots = ExpressionBuilder.add(a, b, sum: "□")
                if step == 1 {
                    // Step 1 — 拆十: a = 10 + ones.
                    host.playCue("l5-s1")
                    let eq: [MathSlot] = [
                        .number(a, color: PandaTheme.numBlue),
                        .op(.equals),
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: ones,
                            values: optionChoices(correct: ones, min: 1, max: 9)
                        )
                    )
                } else if step == 2 {
                    // Step 2 — 加个位: ones + b.
                    host.playCue("l5-s2")
                    let eq: [MathSlot] = [
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.plus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 80)),
                        question: host.makeQuestion(
                            correct: smallSum,
                            values: optionChoices(correct: smallSum, min: 1, max: 9)
                        )
                    )
                } else {
                    // Step 3 — 算答案: 10 + smallSum.
                    host.playCue("l5-s3")
                    let eq: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(smallSum, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 80)),
                        question: host.makeQuestion(
                            correct: total,
                            values: optionChoices(correct: total, min: 11, max: 20)
                        )
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .teenPlusDigit(let a, let b) = round else { return }
                audio.playCue("l5-rwd-\(a)-\(b)-\(a+b)")
            }
        )
    }
}

// MARK: - L6: 十几加十几 (teenPlusTeen)

public struct Level6View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 6,
            sampleSize: 6,
            stepLabels: ["拆 a", "拆 b", "加个位", "加十位", "算答案"],
            poolGen: PandaPools.poolGensForLevel(6),
            stepBuilder: { round, step, host in
                guard case .teenPlusTeen(let a, let b) = round else { return StepRender() }
                let onesA = a % 10
                let onesB = b % 10
                let sumOnes = onesA + onesB
                let total = a + b
                let anchorSlots = ExpressionBuilder.add(a, b, sum: "□")
                if step == 1 {
                    // Step 1 — 拆 a = 10 + onesA.
                    host.playCue("l5-s1")
                    let eq: [MathSlot] = [
                        .number(a, color: PandaTheme.numBlue),
                        .op(.equals),
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(eq, size: 64)),
                        question: host.makeQuestion(
                            correct: onesA,
                            values: optionChoices(correct: onesA, min: 1, max: 9))
                    )
                } else if step == 2 {
                    // Step 2 — 拆 b = 10 + onesB.
                    host.playCue("l5-s1")
                    let eq: [MathSlot] = [
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(eq, size: 64)),
                        question: host.makeQuestion(
                            correct: onesB,
                            values: optionChoices(correct: onesB, min: 1, max: 9))
                    )
                } else if step == 3 {
                    // Step 3 — 加个位: onesA + onesB.
                    host.playCue("l5-s2")
                    let eq: [MathSlot] = [
                        .number(onesA, color: PandaTheme.numBlue),
                        .op(.plus),
                        .number(onesB, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: sumOnes,
                            values: optionChoices(correct: sumOnes, min: 2, max: 9))
                    )
                } else if step == 4 {
                    // Step 4 — 加十位: 10 + 10 = 20.
                    host.playCue("l5-s3")
                    let eq: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(10, color: PandaTheme.yellow),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: 20,
                            values: optionChoices(correct: 20, min: 18, max: 22))
                    )
                } else {
                    // Step 5 — 算答案: 20 + sumOnes.
                    host.playCue("l5-s3")
                    let eq: [MathSlot] = [
                        .number(20, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(sumOnes, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 64)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: total,
                            values: optionChoices(correct: total, min: 22, max: 29))
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .teenPlusTeen(let a, let b) = round else { return }
                // No pre-baked L6 reward cue — fall back to the generic
                // cheer chain. The RoundScaffold's advance() already
                // triggers a "correct" cue; this override is the place
                // to chain a per-round read-back if/when those land.
                _ = audio
                _ = a
                _ = b
            }
        )
    }
}

// MARK: - L7: 十几减几（不退位） (teenSubNoBorrow)

public struct Level7View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 7,
            sampleSize: 6,
            stepLabels: ["拆一拆", "个位相减", "合起来"],
            poolGen: PandaPools.poolGensForLevel(7),
            stepBuilder: { round, step, host in
                guard case .teenSubNoBorrow(let a, let b) = round else { return StepRender() }
                let ones = a % 10
                let diff = ones - b
                let answer = a - b
                let anchorSlots = ExpressionBuilder.sub(a, b, answer: "□")
                if step == 1 {
                    // Step 1 — 拆 a = 10 + ones. Show the ∧ split:
                    // anchor's `a` branches down to the split row's
                    // 10 and ones slots. So the kid sees `a` break
                    // apart into the two halves.
                    host.playCue("l7-s1-\(a)-\(b)")
                    let splitRow: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.minus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let arrows = AnyView(
                        DecompositionView(
                            topSlots: anchorSlots,
                            topSize: 60,
                            bottomSlots: splitRow,
                            bottomSize: 60,
                            arrows: [
                                // ∧ anchor.a → split[0] = 10
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 0,
                                    toRow: 1, toSlot: 0,
                                    color: Color(PandaTheme.yellow),
                                    vArrowhead: false
                                ),
                                // ∧ anchor.a → split[2] = ones
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 0,
                                    toRow: 1, toSlot: 2,
                                    color: Color(PandaTheme.numYellow),
                                    vArrowhead: false
                                ),
                            ]
                        )
                    )
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 60)),
                        equation: AnyView(expr(splitRow, size: 60)),
                        question: host.makeQuestion(
                            correct: ones,
                            values: optionChoices(correct: ones, min: 1, max: 9),
                            labelFor: { v in "10+\(v)" }),
                        arrows: arrows
                    )
                } else if step == 2 {
                    // Step 2 — 个位相减: ones - b.
                    host.playCue("l7-s2q")
                    let eq: [MathSlot] = [
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.minus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: diff,
                            values: optionChoices(correct: diff, min: 0, max: 8))
                    )
                } else {
                    // Step 3 — 合起来: 10 + diff. Show the ∨ combine:
                    // the split row's "ones" slot (slot 2) and the "b"
                    // slot (slot 4) point down to the result row's diff
                    // slot (slot 2). The visual: "the part of a we
                    // subtracted from" merges with the b we took away
                    // to give us the result.
                    host.playCue("l7-s3-\(diff)")
                    let splitRow: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.minus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let resultRow: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.plus),
                        .number(diff, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let arrows = AnyView(
                        DecompositionView(
                            topSlots: splitRow,
                            topSize: 56,
                            bottomSlots: resultRow,
                            bottomSize: 64,
                            arrows: [
                                // ∨ split[2]=ones → result[2]=diff
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 2,
                                    toRow: 1, toSlot: 2,
                                    color: Color(PandaTheme.numYellow),
                                    vArrowhead: true
                                ),
                                // ∨ split[4]=b → result[2]=diff
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 4,
                                    toRow: 1, toSlot: 2,
                                    color: Color(PandaTheme.numPink),
                                    vArrowhead: true
                                ),
                            ]
                        )
                    )
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 60)),
                        equation: AnyView(expr(resultRow, size: 64)),
                        question: host.makeQuestion(
                            correct: answer,
                            values: optionChoices(correct: answer, min: 10, max: 18)),
                        arrows: arrows
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .teenSubNoBorrow(let a, let b) = round else { return }
                audio.playCue("l7-rwd-\(a)-\(b)-\(a-b)")
            }
        )
    }
}

// MARK: - L8: 破十法 (teenSubBorrow)

public struct Level8View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 8,
            sampleSize: 6,
            stepLabels: ["拆一拆", "十位相减", "合起来"],
            poolGen: PandaPools.poolGensForLevel(8),
            stepBuilder: { round, step, host in
                guard case .teenSubBorrow(let a, let b) = round else { return StepRender() }
                let ones = a % 10
                let sub = 10 - b
                let answer = a - b
                let anchorSlots = ExpressionBuilder.sub(a, b, answer: "□")
                if step == 1 {
                    // Step 1 — 拆 a = ones + 10 (L8 swaps the order
                    // so the digit that stays whole is shown first).
                    // Show the ∧ split: anchor's `a` branches down
                    // to the split row's `ones` and `10` slots.
                    host.playCue("l8-s1-\(a)-\(b)")
                    let splitRow: [MathSlot] = [
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.plus),
                        .number(10, color: PandaTheme.yellow),
                        .op(.minus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let arrows = AnyView(
                        DecompositionView(
                            topSlots: anchorSlots,
                            topSize: 60,
                            bottomSlots: splitRow,
                            bottomSize: 60,
                            arrows: [
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 0,
                                    toRow: 1, toSlot: 0,
                                    color: Color(PandaTheme.numYellow),
                                    vArrowhead: false
                                ),
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 0,
                                    toRow: 1, toSlot: 2,
                                    color: Color(PandaTheme.yellow),
                                    vArrowhead: false
                                ),
                            ]
                        )
                    )
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 60)),
                        equation: AnyView(expr(splitRow, size: 60)),
                        question: host.makeQuestion(
                            correct: 10,
                            values: optionChoices(correct: 10, min: 8, max: 12),
                            labelFor: { v in "\(ones)+\(v)" }),
                        arrows: arrows
                    )
                } else if step == 2 {
                    // Step 2 — 十位相减: 10 - b.
                    host.playCue("l8-s2")
                    let eq: [MathSlot] = [
                        .number(10, color: PandaTheme.yellow),
                        .op(.minus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 80)),
                        equation: AnyView(expr(eq, size: 72)),
                        question: host.makeQuestion(
                            correct: sub,
                            values: optionChoices(correct: sub, min: 1, max: 8))
                    )
                } else {
                    // Step 3 — 合起来: ones + sub. Show the ∨ combine:
                    // split's "10" (slot 2) and "b" (slot 4) point
                    // down to the result's "sub" (slot 2). L8 inverts
                    // the source: split[0]=ones carries through,
                    // split[2]=10 transforms into the sub.
                    host.playCue("l8-s3-\(ones)-\(b)")
                    let splitRow: [MathSlot] = [
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.plus),
                        .number(10, color: PandaTheme.yellow),
                        .op(.minus),
                        .number(b, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let resultRow: [MathSlot] = [
                        .number(ones, color: PandaTheme.numYellow),
                        .op(.plus),
                        .number(sub, color: PandaTheme.numPink),
                        .op(.equals),
                        .answerBox("□", color: PandaTheme.ink),
                    ]
                    let arrows = AnyView(
                        DecompositionView(
                            topSlots: splitRow,
                            topSize: 56,
                            bottomSlots: resultRow,
                            bottomSize: 64,
                            arrows: [
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 2,
                                    toRow: 1, toSlot: 2,
                                    color: Color(PandaTheme.yellow),
                                    vArrowhead: true
                                ),
                                DecompositionView.ArrowSpec(
                                    fromRow: 0, fromSlot: 4,
                                    toRow: 1, toSlot: 2,
                                    color: Color(PandaTheme.numPink),
                                    vArrowhead: true
                                ),
                            ]
                        )
                    )
                    return StepRender(
                        anchor: AnyView(expr(anchorSlots, size: 60)),
                        equation: AnyView(expr(resultRow, size: 64)),
                        question: host.makeQuestion(
                            correct: answer,
                            values: optionChoices(correct: answer, min: 2, max: 10))
                    )
                }
            },
            onRoundCorrect: { audio, round in
                guard case .teenSubBorrow(let a, let b) = round else { return }
                audio.playCue("l8-rwd-\(a)-\(b)-\(a-b)")
            }
        )
    }
}

// MARK: - Body visual: three-addend beads
//
// A simple row of small dots/badges representing the three addends.
// Step 1 highlights the first two addends (the pair to add first);
// step 2 shows the split visualisation (pair + third).

struct ThreeAddendBeads: View {
    let a: Int
    let b: Int
    let c: Int
    let highlightFirst: Bool

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<a, id: \.self) { _ in
                Circle()
                    .fill(Color(PandaTheme.numBlue).opacity(highlightFirst ? 1.0 : 0.4))
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color(PandaTheme.ink), lineWidth: 2))
            }
            ForEach(0..<b, id: \.self) { _ in
                Circle()
                    .fill(Color(PandaTheme.numYellow).opacity(highlightFirst ? 1.0 : 0.4))
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color(PandaTheme.ink), lineWidth: 2))
            }
            ForEach(0..<c, id: \.self) { _ in
                Circle()
                    .fill(Color(PandaTheme.numPink).opacity(highlightFirst ? 0.4 : 1.0))
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color(PandaTheme.ink), lineWidth: 2))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

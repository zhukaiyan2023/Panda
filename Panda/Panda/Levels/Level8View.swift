//
//  Level8View.swift
//  Panda
//
//  L8 — 破十法 (teenSubBorrow, a in [11..19], b > ones(a)).
//  Three teaching beats, mirroring `scenes/subtractionLevels.js::l8Steps`
//  from the JS codebase:
//
//    Step 1 (拆一拆)   — kid picks the ones digit via "ones+10" buttons.
//                         Anchor renders; the split row
//                         "? + 10 - b = ?" is DEFERRED until the audio
//                         lands, then the ∧ split arrows appear
//                         (anchor.a → split[0]=ones, split[2]=10).
//    Step 2 (十位相减) — kid picks 10 − b. Anchor + revealed split
//                         stay; the result row "{ones} + □ = ?" is
//                         DEFERRED until the audio lands. NO new
//                         arrows this step.
//    Step 3 (合起来)   — kid picks the total. Anchor + split +
//                         revealed result ("{ones} + sub = ?") all
//                         stay; ∨ combine arrows appear
//                         (split[2]=10, split[4]=b → result[2]=sub).
//
//  L8 has its own `TeenSubBorrowStepView` defined in this file —
//  it is structurally similar to L7 but the split row order is
//  swapped (ones at slot 0, "10" at slot 2) and the ∨ combine
//  arrow source color is yellow (for split[2]=10) instead of
//  orange. Sharing a generic `TeenSubStepView` between L7 and L8
//  hid these level-specific differences behind an enum flag; the
//  two files now own their layouts independently so future L7 or
//  L8 tweaks don't ripple across both levels.
//
//  Audio cues (l8-* prefix):
//    step 1   l8-s1-{a}-{b}         "把 a 拆成几加十"
//    step 2   l8-s2-{b}             "十减 [b] 等于几"
//    step 3   l8-s3-{ones}-{b}      "几加 [sub] 等于几"
//    reward   l8-rwd-{a}-{b}-{a-b}
//

import SwiftUI

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
                return StepRender(
                    equation: AnyView(
                        TeenSubBorrowStepView(
                            a: a, b: b,
                            ones: ones,
                            sub: sub,
                            answer: answer,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .teenSubBorrow(let a, let b) = round else { return }
                // JS L8 chains the reward via playAfter — same
                // pattern here so the read-back doesn't overlap
                // the celebration tail.
                let cue = "l8-rwd-\(a)-\(b)-\(a-b)"
                if let prev = lastEncourageId {
                    audio.playAfter(prev, then: [cue], gapMs: 200, seqGapMs: 200)
                } else {
                    audio.playCue(cue)
                }
            },
            showPanda: false
        )
    }
}

// MARK: - L8 step view (十几减几，退位 / 破十法)
//
// L8 — 破十法 in the tens place (b > ones(a)). The split row
// order is swapped vs L7: "ones + 10 - b = ?" (the ones digit
// stays whole; the borrow lands inside the "10" half).
//
//   anchor  "a - b = ?"             (persistent, size 72)
//   split   "ones + 10 - b = ?"     (step 1: deferred)
//   result  "{ones} + sub = ?"      (step 2: deferred; sub revealed)
//
// Step 1 buttons show "X+10" so the kid sees the same decomposition
// shape as the open □ in the split row. Step 3 picks answer from
// [2, 10]; the default outward-walk order sometimes puts the
// correct answer at index 0, so the prompt order is shuffled to
// land the correct value at index 2 (per "最后一步的选项应该是
// 5，7，6，8") with the distractors sorted ascending around it.

struct TeenSubBorrowStepView: View {
    let a: Int
    let b: Int
    let ones: Int
    let sub: Int        // 10 - b (the tens-place sub)
    let answer: Int
    let step: Int
    let host: RoundHost

    // Sizes mirror L7 — same anchor/split/result scales and the
    // same inter-row gaps so the polyline elbows read cleanly.
    private let anchorSize: CGFloat = 72
    private let splitSize: CGFloat = 60
    private let resultSize: CGFloat = 64
    private let gapAnchorSplit: CGFloat = 40
    private let gapSplitResult: CGFloat = 34

    private let coordSpace = "TeenSubBorrowStepView.root"

    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var splitRowFrame: CGRect = .zero
    @State private var splitSlotCenters: [CGPoint] = []
    @State private var resultRowFrame: CGRect = .zero
    @State private var resultSlotCenters: [CGPoint] = []

    @State private var showSplitRow = false
    @State private var showResultRow = false

    // MARK: Slot factories

    /// Anchor row (persistent): "a - b = ?".
    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("?", color: PandaTheme.orange),
        ]
    }

    /// Split row: "ones + 10 - b = ?". L8's split row has the
    /// ones half at slot 0 (COL_NEED, orange) and the literal
    /// "10" at slot 2 (COL_TEN, yellow). The trailing "?" stays
    /// orange until step 3's correct pick.
    private func splitSlots(onesValue: Int?,
                            answerValue: Int?) -> [MathSlot] {
        func halfSlot(isTen: Bool) -> MathSlot {
            if isTen {
                return .number(10, color: PandaTheme.yellow)
            } else if let v = onesValue {
                return .number(v, color: PandaTheme.orange)
            } else {
                return .answerBox("□", color: PandaTheme.orange)
            }
        }
        let answerSlot: MathSlot
        if let v = answerValue {
            answerSlot = .number(v, color: PandaTheme.ink)
        } else {
            answerSlot = .answerBox("?", color: PandaTheme.orange)
        }
        return [
            halfSlot(isTen: false),   // slot 0 = ones (or □)
            .op(.plus),
            halfSlot(isTen: true),    // slot 2 = "10"
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            answerSlot,
        ]
    }

    /// Result row: "{ones} + sub = ?". Slot 0 is the carried-
    /// through ones (orange), slot 2 is the sub (pink after
    /// reveal). The trailing "?" at slot 4 fills on step 3.
    private func resultSlots(answerValue: Int?,
                             pickValueSlot: Int?) -> [MathSlot] {
        let carryThrough: MathSlot = .number(ones, color: PandaTheme.orange)
        let pickSlot: MathSlot
        if let v = pickValueSlot {
            pickSlot = .number(v, color: PandaTheme.numPink)
        } else {
            pickSlot = .answerBox("□", color: PandaTheme.orange)
        }
        let answerSlot: MathSlot
        if let v = answerValue {
            answerSlot = .number(v, color: PandaTheme.ink)
        } else {
            answerSlot = .answerBox("?", color: PandaTheme.orange)
        }
        return [
            carryThrough,
            .op(.plus),
            pickSlot,
            .op(.equals),
            answerSlot,
        ]
    }

    // Per-step current slots.
    //
    // The trailing "?" answer slot stays as an orange box
    // through the kid's step-3 pick — Swift's `RoundScaffold`
    // has no per-step `onAdvance` callback, so we can't reveal
    // it inside the step view after the kid picks. The previous
    // build's `step >= 3 ? answer : nil` revealed the numeric
    // value BEFORE the kid picked, which leaked the answer into
    // the rendered row. Match L5's behaviour: keep the answer as
    // a "?" box until the kid picks correctly (which ends the
    // round); the reward audio in `onRoundCorrect` reads the
    // full equation back so the kid still hears the answer.
    private var currentSplitSlots: [MathSlot] {
        switch step {
        case 1:
            return splitSlots(onesValue: nil, answerValue: nil)
        default:
            return splitSlots(onesValue: ones, answerValue: nil)
        }
    }

    private var currentResultSlots: [MathSlot] {
        switch step {
        case 2:
            return resultSlots(answerValue: nil, pickValueSlot: nil)
        default:
            return resultSlots(answerValue: nil,
                               pickValueSlot: sub)
        }
    }

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                MathExpressionWithSlots(
                    slots: anchorSlots,
                    size: anchorSize
                ) { centers in
                    anchorSlotCenters = centers
                }
                .frame(height: anchorSize + 24)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { newFrame in
                    anchorRowFrame = newFrame
                }

                Spacer().frame(height: gapAnchorSplit)

                if showSplitRow {
                    MathExpressionWithSlots(
                        slots: currentSplitSlots,
                        size: splitSize
                    ) { centers in
                        splitSlotCenters = centers
                    }
                    .frame(height: splitSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        splitRowFrame = newFrame
                    }
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                if showResultRow {
                    Spacer().frame(height: gapSplitResult)
                    MathExpressionWithSlots(
                        slots: currentResultSlots,
                        size: resultSize
                    ) { centers in
                        resultSlotCenters = centers
                    }
                    .frame(height: resultSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        resultRowFrame = newFrame
                    }
                }

                Spacer().frame(height: 28)

                stepQuestion()
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            stepArrowsOverlay()
                .allowsHitTesting(false)
        }
        .onAppear { fireAudioForCurrentStep() }
    }

    // MARK: Question dispatch (per-step button prompt)

    private func stepQuestion() -> AnyView {
        switch step {
        case 1:
            // Step 1 — pick ones. Buttons labelled "X+10" so the
            // kid sees the same shape as the open □ in the split
            // row. Wider 144×96 buttons for the decomposed label.
            return host.makeQuestion(
                correct: ones,
                values: optionChoices(correct: ones, min: 1, max: 8),
                labelFor: { v in "\(v)+10" },
                buttonWidth: 144,
                buttonHeight: 96
            )
        case 2:
            // Step 2 — pick sub = 10 - b. Bare single digit.
            return host.makeQuestion(
                correct: sub,
                values: optionChoices(correct: sub, min: 1, max: 8)
            )
        default:
            // Step 3 — pick answer. Bare integers in [2, 10].
            // Reorder so correct lands at index 2 per JS
            // "最后一步的选项应该是 5，7，6，8".
            return host.makeQuestion(
                correct: answer,
                values: answerOptionChoices()
            )
        }
    }

    /// Step-3 answer choices with the correct value repositioned
    /// to index 2 (between the two ascending distractors). E.g.
    /// for 12-6 the default outward-walk yields [6, 7, 5, 8]; we
    /// reorder to [5, 7, 6, 8]. When the correct already sits at
    /// index 2 or the distractors don't form a clean ascending
    /// set, the default order is kept.
    private func answerOptionChoices() -> [Int] {
        let rawOpts = optionChoices(correct: answer, min: 2, max: 10)
        if let correctIdx = rawOpts.firstIndex(of: answer),
           correctIdx != 2,
           rawOpts.count == 4 {
            let distractors = rawOpts.filter { $0 != answer }.sorted()
            let firstHalf = Array(distractors.prefix(2))
            let secondHalf = Array(distractors.dropFirst(2))
            return firstHalf + [answer] + secondHalf
        }
        return rawOpts
    }

    // MARK: Audio dispatch (per-step cue chain)

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            // "把 a 拆成几加十" — reveal split row when audio lands.
            host.playStepAudio(["l8-s1-\(a)-\(b)"]) {
                self.showSplitRow = true
            }
        case 2:
            // "十减 b 等于几" — reveal result row when audio lands.
            // The step-2 cue is parameterised by b alone (the kid
            // mentally reduces 10 - b).
            self.showSplitRow = true
            host.playStepAudio(["l8-s2-\(b)"]) {
                self.showResultRow = true
            }
        default:
            self.showSplitRow = true
            self.showResultRow = true
            // Step 3 cue encodes (ones, b) since sub = 10 - b is
            // determined by b.
            host.playStepAudio(["l8-s3-\(ones)-\(b)"])
        }
    }

    // MARK: Arrow overlay

    /// Polyline arrows matching the JS palette:
    ///   * COL_TEN  (yellow)  for the literal "10" half.
    ///   * COL_NEED (orange)  for the unknown ones-half and the
    ///                          pending placeholder □s.
    ///   * COL_SMALL (pink)   for the subtrahend b.
    ///
    /// L8's split row order swaps slot 0 / slot 2 vs L7, so the
    /// ∧ split arrow colors are also swapped (slot 0 = orange,
    /// slot 2 = yellow).
    private func stepArrowsOverlay() -> some View {
        ZStack {
            if let splitArrow = makeSplitArrows() {
                L3StylePolyline(
                    from: splitArrow.anchorBottom,
                    to: splitArrow.splitZeroTop,
                    color: splitArrow.colorZero
                )
                L3StylePolyline(
                    from: splitArrow.anchorBottom,
                    to: splitArrow.splitTwoTop,
                    color: splitArrow.colorTwo
                )
            }
            ForEach(combineArrows()) { seg in
                L3StylePolyline(
                    from: seg.from,
                    to: seg.to,
                    color: seg.color
                )
            }
        }
    }

    /// ∧ split arrows — anchor.a → split[0] (ones), split[2] (10).
    private func makeSplitArrows() -> (
        anchorBottom: CGPoint,
        splitZeroTop: CGPoint,
        splitTwoTop: CGPoint,
        colorZero: Color,
        colorTwo: Color
    )? {
        guard anchorSlotCenters.count > 0,
              showSplitRow,
              splitSlotCenters.count > 4 else { return nil }
        let anchorBottom = bottomOf(anchorSlotCenters,
                                    anchorRowFrame,
                                    slot: 0,
                                    size: anchorSize)
        // L8 split[0]=ones (□ answerBox until pick, halfRatio
        // 0.45); split[2]="10" (numeric digit, halfRatio 0.5).
        let splitZeroTop = topOf(splitSlotCenters, splitRowFrame,
                                  slot: 0,
                                  size: splitSize,
                                  halfRatio: 0.45)
        let splitTwoTop = topOf(splitSlotCenters, splitRowFrame,
                                 slot: 2,
                                 size: splitSize,
                                 halfRatio: 0.5)
        return (anchorBottom, splitZeroTop, splitTwoTop,
                Color(PandaTheme.orange),    // split[0]=ones
                Color(PandaTheme.yellow))    // split[2]="10"
    }

    /// ∨ combine arrows — split[2]=10, split[4]=b → result[2]=sub.
    /// Drawn on every step once the result row has rendered — not
    /// just step 3. Per JS `teenLinkPoints` the ∨ arrows are part
    /// of the persistent diagram: the kid should see the
    /// connection from split[2]/split[4] → result[2] as soon as
    /// the result row appears, not only after picking the answer.
    /// split[2] is yellow (it's "10"); split[4] is pink (it's b).
    private func combineArrows() -> [CombineSegment] {
        guard showSplitRow,
              showResultRow,
              splitSlotCenters.count > 4,
              resultSlotCenters.count > 2 else { return [] }
        let splitTwoBottom = bottomOf(splitSlotCenters,
                                      splitRowFrame,
                                      slot: 2,
                                      size: splitSize)
        let splitFourBottom = bottomOf(splitSlotCenters,
                                       splitRowFrame,
                                       slot: 4,
                                       size: splitSize)
        let resultTwoTop = topOf(resultSlotCenters,
                                 resultRowFrame,
                                 slot: 2,
                                 size: resultSize,
                                 halfRatio: 0.5)
        return [
            CombineSegment(from: splitTwoBottom, to: resultTwoTop,
                           color: Color(PandaTheme.yellow)),
            CombineSegment(from: splitFourBottom, to: resultTwoTop,
                           color: Color(PandaTheme.numPink)),
        ]
    }

    /// BOTTOM-edge y of a slot in its row's local frame.
    private func bottomOf(_ centers: [CGPoint], _ frame: CGRect,
                          slot: Int, size: CGFloat) -> CGPoint {
        let geoH = size + 24
        let yOff = size / 2 - geoH / 2
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: frame.minY + centers[slot].y + yOff + size / 2
        )
    }

    /// TOP-edge y of a slot in its row's local frame. `halfRatio`
    /// defaults to 0.45 (answerBox outline); pass 0.5 for a
    /// numeric digit slot.
    private func topOf(_ centers: [CGPoint], _ frame: CGRect,
                       slot: Int, size: CGFloat,
                       halfRatio: CGFloat = 0.45) -> CGPoint {
        let geoH = size + 24
        let yOff = size / 2 - geoH / 2
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: frame.minY + centers[slot].y + yOff - size * halfRatio
        )
    }

    private struct CombineSegment: Identifiable {
        let id = UUID()
        let from: CGPoint
        let to: CGPoint
        let color: Color
    }
}

//
//  Level6View.swift
//  Panda
//
//  L6 — 十几加十几 (teenPlusTeen, a, b in [11..19], no carry). Five
//  teaching beats, mirroring `scenes/level5.js` from the JS codebase:
//  a 5-row visual stack (anchor / split-1 / split-2 / combine-ones /
//  combine-tens) connected by polyline connectors in the elbow style
//  used by L3 (twoof-three-sum-to-ten). Each new step INTRODUCES ONE
//  NEW ROW; earlier rows stay visible across the rest of the round.
//
//  Per-step visible rows (all rows persistent once introduced):
//
//    Step 1 (拆 a)    — anchor + split-1 (deferred to audio)
//    Step 2 (拆 b)    — anchor + split-1 + split-2 (deferred to audio)
//    Step 3 (加个位)  — + combine-ones (deferred to audio)
//    Step 4 (加十位)  — + combine-tens (deferred to audio)
//    Step 5 (算答案)  — answer revealed across all 5 rows
//
//  Audio cues (l5-* prefix — content originated in JS level5.js
//  before the curriculum renumbering):
//    step 1   l5-s1-{a}-{b}            "先把 a 拆成 10 加几"
//    step 2   l5-s2-{a}-{b}            "再把 b 拆成 10 加几"
//    step 3   l5-s3-{onesA}-{onesB}    "个位相加"
//    step 4   l5-s4                    "十加十等于几"
//    step 5   l5-s5-{sum}              "二十加 sum 等于几"
//    reward   l5-rwd-{a}-{b}-{a+b}
//

import SwiftUI

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
                let sum = onesA + onesB
                let total = a + b
                return StepRender(
                    equation: AnyView(
                        TeenPlusTeenStepView(
                            a: a, b: b,
                            onesA: onesA, onesB: onesB,
                            sum: sum, total: total,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .teenPlusTeen(let a, let b) = round else { return }
                // JS L6 (十几加十几) reads back "{a} 加 {b} 等于 {answer}"
                // using l5-rwd-* cues. Chain off the cheer so the
                // reward doesn't cut off the celebration tail.
                let cue = "l5-rwd-\(a)-\(b)-\(a+b)"
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

// MARK: - L6 step layout (十几加十几)
//
// Swift L6 mirrors the JS level5.js layout — a 5-row visual stack:
//
//   anchor      — persistent "a + b = ?" goal equation (always on).
//   split-1     — "[left] + onesA + b = ?"  (kid picks onesA; left
//                  reveals to "10" on correct pick).
//   split-2     — "10 + onesA + [left] + [right] = ?"
//                  (kid picks onesB; left reveals to "10").
//   combine-ones— "10 + 10 + ? = ?"  (kid picks the ones sum).
//   combine-tens— "? + sum = ?"      (kid picks 20; reveals to
//                  "20 + sum = ?"; answer is revealed on step 5).
//
// Polyline connectors — each line fires as soon as BOTH endpoints
// have a rendered slot centre (so the visual reveals with the row,
// not after the kid picks). Per the JS linkPoints comments, each
// connector pairs a source slot's bottom with a destination slot's
// top. The connector set:
//   L1  anchor[0]=a        → split-1[0]=10         (yellow)
//   L1a anchor[0]=a        → split-1[2]=onesA      (orange)
//   L4  split-1[4]=b       → split-2[4]=10         (yellow)
//   L4a split-1[4]=b       → split-2[6]=onesB      (orange)
//   L5  split-2[2]=onesA   → combine-ones[4]=sum   (orange)
//   L6  split-2[6]=onesB   → combine-ones[4]=sum   (orange)
//   L7  combine-ones[0]=10 → combine-tens[0]=20    (yellow)
//   L8  combine-ones[2]=10 → combine-tens[0]=20    (yellow)
//   L9  combine-ones[4]=sum→ combine-tens[2]=sum   (success/green)
//
// The audio chain uses `playStepAudio` so each step's prompt chains
// off the celebration tail from the previous step. Each new row's
// render is deferred until the audio lands (mirrors the JS
// `deferEquation` + audio `onComplete` pattern).

struct TeenPlusTeenStepView: View {
    let a: Int
    let b: Int
    let onesA: Int
    let onesB: Int
    let sum: Int
    let total: Int
    let step: Int
    let host: RoundHost

    private let coordSpace = "TeenPlusTeenStepView.root"

    // Row sizes — anchor is the largest (persistent goal); the four
    // decomposition rows are smaller so the eye reads the persistent
    // anchor as the spatial reference. Sizes mirror the JS layout
    // (size=80 for anchor at y=240, size=56 for split rows, size=60
    // for combine rows) but scaled for the Swift canvas.
    private let anchorSize: CGFloat = 70
    private let splitSize: CGFloat = 50
    private let combineSize: CGFloat = 54

    // Inter-row gaps — each gap is small enough to keep the stack
    // tight, but big enough for the polyline connectors to bend
    // cleanly without crowding the digits.
    private let gapAnchorSplit: CGFloat = 22
    private let gapSplitSplit: CGFloat = 18
    private let gapSplitCombine: CGFloat = 22
    private let gapCombineCombine: CGFloat = 22

    // Per-row frames + slot centres (used for the polyline endpoints).
    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var split1RowFrame: CGRect = .zero
    @State private var split1SlotCenters: [CGPoint] = []
    @State private var split2RowFrame: CGRect = .zero
    @State private var split2SlotCenters: [CGPoint] = []
    @State private var combineOnesRowFrame: CGRect = .zero
    @State private var combineOnesSlotCenters: [CGPoint] = []
    @State private var combineTensRowFrame: CGRect = .zero
    @State private var combineTensSlotCenters: [CGPoint] = []

    // Per-row deferred reveal — each row is shown only AFTER its
    // introducing step's audio lands. Mirrors the JS `deferEquation`
    // pattern.
    @State private var showSplit1Row = false
    @State private var showSplit2Row = false
    @State private var showCombineOnesRow = false
    @State private var showCombineTensRow = false

    // Slot factories -----------------------------------------------------

    // Anchor: a + b = "□". a in blue (big), b in pink (small). Slot 4
    // reserved to `total` (always 2 digits for this pool).
    //
    // We use "□" (the hollow box glyph) per user feedback — the box
    // shape is the visual cue for "unknown", not a "?" mark.
    private var anchorSlots: (_ right: String) -> [MathSlot] {
        { right in
            [
                .number(a, color: PandaTheme.numBlue),
                .op(.plus),
                .number(b, color: PandaTheme.numPink),
                .op(.equals),
                .answerBox(right, color: right == "□" ? PandaTheme.ink : PandaTheme.ink),
            ]
        }
    }

    // Split-1: "[left] + onesA + b = □". Pre-pick: left="□" (orange).
    // Post-pick (step 2+): left=10 (yellow). right="□" while pending
    // (orange). The answer stays "□" through every step — Swift's
    // RoundScaffold has no `onAdvance` reveal, so we leave the box
    // empty until the round ends; the reward audio "a 加 b 等于 total"
    // carries the read-back instead.
    private var split1Slots: (_ left: String, _ onesASlot: String, _ right: String) -> [MathSlot] {
        { left, onesASlot, right in
            [
                .numberOrBox(left, numColor: PandaTheme.yellow, boxColor: PandaTheme.orange),
                .op(.plus),
                .numberOrBox(onesASlot, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
                .op(.plus),
                .number(b, color: PandaTheme.numPink),
                .op(.equals),
                .answerBox(right, color: right == "□" ? PandaTheme.orange : PandaTheme.ink),
            ]
        }
    }

    // Split-2: "10 + onesA + [left] + [right] = □". left="□" (orange)
    // pre-pick, "10" (yellow) post-pick. right="□" (orange) pre-pick,
    // `onesB` (orange) post-pick.
    private var split2Slots: (_ left: String, _ right: String, _ answer: String) -> [MathSlot] {
        { left, right, answer in
            [
                .number(10, color: PandaTheme.yellow),
                .op(.plus),
                .number(onesA, color: PandaTheme.orange),
                .op(.plus),
                .numberOrBox(left, numColor: PandaTheme.yellow, boxColor: PandaTheme.orange),
                .op(.plus),
                .numberOrBox(right, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
                .op(.equals),
                .answerBox(answer, color: answer == "□" ? PandaTheme.orange : PandaTheme.ink),
            ]
        }
    }

    // Combine-ones: "10 + 10 + □ = □". ones_sum="□" (orange) pre-pick,
    // `sum` (orange) post-pick. answer stays "□" until the kid picks
    // the total on step 5 (and then the round ends — no onAdvance).
    private var combineOnesSlots: (_ onesSum: String, _ answer: String) -> [MathSlot] {
        { onesSum, answer in
            [
                .number(10, color: PandaTheme.yellow),
                .op(.plus),
                .number(10, color: PandaTheme.yellow),
                .op(.plus),
                .numberOrBox(onesSum, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
                .op(.equals),
                .answerBox(answer, color: answer == "□" ? PandaTheme.orange : PandaTheme.ink),
            ]
        }
    }

    // Combine-tens: "□ + sum = □". left="□" (orange) pre-pick,
    // "20" (yellow) post-pick. right stays "□" until the kid picks
    // the total on step 5.
    private var combineTensSlots: (_ tensSum: String, _ answer: String) -> [MathSlot] {
        { tensSum, answer in
            [
                .numberOrBox(tensSum, numColor: PandaTheme.yellow, boxColor: PandaTheme.orange),
                .op(.plus),
                .number(sum, color: PandaTheme.success),
                .op(.equals),
                .answerBox(answer, color: answer == "□" ? PandaTheme.orange : PandaTheme.ink),
            ]
        }
    }

    // Per-step slot configs ---------------------------------------------
    //
    // Swift's RoundScaffold has no `onAdvance` callback for a post-
    // pick reveal (JS has one). To match the JS behaviour where the
    // answer slot reveals on the LAST step only after the kid picks
    // it, we keep every answer slot as "□" through the kid's pick on
    // the LAST step — the reward audio "a 加 b 等于 total" reads the
    // answer back as a celebration, and the round ends immediately
    // after a correct pick (so the answer reveal is implicit in the
    // audio + next-round transition rather than an on-screen swap).

    private var currentAnchorSlots: [MathSlot] {
        // Step 5 is the last step — kid hasn't picked total yet, so
        // the answer stays "□" through the whole row.
        return anchorSlots("□")
    }

    private var currentSplit1Slots: [MathSlot] {
        switch step {
        case 1: return split1Slots("□", "□", "□")
        case 2: return split1Slots("\(10)", "\(onesA)", "□")
        default: return split1Slots("\(10)", "\(onesA)", "□")
        }
    }

    private var currentSplit2Slots: [MathSlot] {
        switch step {
        case 1, 2: return split2Slots("□", "□", "□")
        case 3, 4: return split2Slots("\(10)", "\(onesB)", "□")
        default: return split2Slots("\(10)", "\(onesB)", "□")
        }
    }

    private var currentCombineOnesSlots: [MathSlot] {
        switch step {
        case 1, 2, 3: return combineOnesSlots("□", "□")
        case 4: return combineOnesSlots("\(sum)", "□")
        default: return combineOnesSlots("\(sum)", "□")
        }
    }

    private var currentCombineTensSlots: [MathSlot] {
        switch step {
        case 1, 2, 3, 4: return combineTensSlots("□", "□")
        default: return combineTensSlots("\(20)", "□")
        }
    }

    // Polyline endpoints -------------------------------------------------
    //
    // Build a list of symmetric V diagrams + single-line connectors
    // visible at the current step. Each V uses `SymmetricVDiagram`
    // so the two arms have the SAME total length — per user feedback
    // "左右的长度要一样长". The remaining single-source → single-
    // destination connectors fall back to `PolylineConnectors(.elbow)`.
    //
    // Returns nil for a V until both endpoint rows have rendered
    // (so partial layout during `onAppear` doesn't draw stray
    // zero-length connectors).

    /// L1 + L1a: anchor[0]=a → split-1[0]=10, split-1[2]=onesA
    /// (Symmetric V — anchor.a branches into TEN + onesA.)
    private var anchorSplit1V: (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplit1Row,
              anchorSlotCenters.count > 0,
              split1SlotCenters.count > 2 else { return nil }
        let anchorBottom = bottomOf(anchorSlotCenters, anchorRowFrame,
                                     slot: 0, size: anchorSize)
        let split1Zero  = topOf(split1SlotCenters, split1RowFrame,
                                slot: 0, size: splitSize, halfRatio: 0.5)
        let split1Two   = topOf(split1SlotCenters, split1RowFrame,
                                slot: 2, size: splitSize, halfRatio: 0.45)
        // Order: left dest → colorA (yellow), right dest → colorB (orange).
        if split1Zero.x <= split1Two.x {
            return (anchorBottom, split1Zero, split1Two)
        } else {
            return (anchorBottom, split1Two, split1Zero)
        }
    }

    /// L4 + L4a: split-1[4]=b → split-2[4]=10, split-2[6]=onesB
    /// (Symmetric V — round.b branches into TEN + onesB.)
    private var split1Split2V: (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplit2Row,
              split1SlotCenters.count > 4,
              split2SlotCenters.count > 6 else { return nil }
        let split1Four = bottomOf(split1SlotCenters, split1RowFrame,
                                  slot: 4, size: splitSize)
        let split2Four = topOf(split2SlotCenters, split2RowFrame,
                                slot: 4, size: splitSize, halfRatio: 0.5)
        let split2Six  = topOf(split2SlotCenters, split2RowFrame,
                                slot: 6, size: splitSize, halfRatio: 0.45)
        if split2Four.x <= split2Six.x {
            return (split1Four, split2Four, split2Six)
        } else {
            return (split1Four, split2Six, split2Four)
        }
    }

    /// L5 + L6: split-2[2]=onesA, split-2[6]=onesB →
    /// combine-ones[4]=sum (∨ shape — two upper slots converge onto
    /// the lower combine-ones box). Drawn as two
    /// `PolylineConnectors(.elbow)` segments that share the same
    /// apex. `.elbow` naturally handles "from above → to below" (the
    /// bend sits at the vertical midpoint, and both arms reach the
    /// destination regardless of horizontal distance — no gap on the
    /// longer arm).
    private var combineOnesV: [PolylineConnectors.Segment]? {
        guard showCombineOnesRow,
              split2SlotCenters.count > 6,
              combineOnesSlotCenters.count > 4 else { return nil }
        let apex = topOf(combineOnesSlotCenters,
                         combineOnesRowFrame,
                         slot: 4, size: combineSize,
                         halfRatio: 0.45)
        let split2Two = bottomOf(split2SlotCenters, split2RowFrame,
                                 slot: 2, size: splitSize)
        let split2Six = bottomOf(split2SlotCenters, split2RowFrame,
                                 slot: 6, size: splitSize)
        let orangeColor = Color(PandaTheme.orange)
        let leftFrom  = split2Two.x <= split2Six.x ? split2Two : split2Six
        let rightFrom = split2Two.x <= split2Six.x ? split2Six : split2Two
        return [
            PolylineConnectors.Segment(
                from: leftFrom, to: apex,
                color: orangeColor, thickness: 7, opacity: 0.85,
                style: .elbow
            ),
            PolylineConnectors.Segment(
                from: rightFrom, to: apex,
                color: orangeColor, thickness: 7, opacity: 0.85,
                style: .elbow
            ),
        ]
    }

    /// L7 + L8: combine-ones[0]=10, combine-ones[2]=10 →
    /// combine-tens[0]=tens_sum (∨ shape — two upper 10s converge
    /// onto the lower combine-tens box). Same approach as
    /// `combineOnesV`: two `PolylineConnectors(.elbow)` segments.
    private var combineTensV: [PolylineConnectors.Segment]? {
        guard showCombineTensRow,
              combineOnesSlotCenters.count > 2,
              combineTensSlotCenters.count > 0 else { return nil }
        let apex = topOf(combineTensSlotCenters,
                         combineTensRowFrame,
                         slot: 0, size: combineSize,
                         halfRatio: 0.45)
        let combineOnesZero = bottomOf(combineOnesSlotCenters,
                                       combineOnesRowFrame,
                                       slot: 0, size: combineSize)
        let combineOnesTwo = bottomOf(combineOnesSlotCenters,
                                      combineOnesRowFrame,
                                      slot: 2, size: combineSize)
        let yellowColor = Color(PandaTheme.yellow)
        let leftFrom  = combineOnesZero.x <= combineOnesTwo.x ? combineOnesZero : combineOnesTwo
        let rightFrom = combineOnesZero.x <= combineOnesTwo.x ? combineOnesTwo : combineOnesZero
        return [
            PolylineConnectors.Segment(
                from: leftFrom, to: apex,
                color: yellowColor, thickness: 7, opacity: 0.85,
                style: .elbow
            ),
            PolylineConnectors.Segment(
                from: rightFrom, to: apex,
                color: yellowColor, thickness: 7, opacity: 0.85,
                style: .elbow
            ),
        ]
    }

    /// L9: combine-ones[4]=sum → combine-tens[2]=sum (single
    /// arrow — not a V, drawn with the elbow polyline).
    private var l9Connector: PolylineConnectors.Segment? {
        guard showCombineTensRow,
              combineOnesSlotCenters.count > 4,
              combineTensSlotCenters.count > 2 else { return nil }
        let combineOnesFour = bottomOf(combineOnesSlotCenters,
                                       combineOnesRowFrame,
                                       slot: 4, size: combineSize)
        let combineTensTwoTop = topOf(combineTensSlotCenters,
                                      combineTensRowFrame,
                                      slot: 2, size: combineSize,
                                      halfRatio: 0.5)
        return PolylineConnectors.Segment(
            from: combineOnesFour, to: combineTensTwoTop,
            color: Color(PandaTheme.success),
            thickness: 6,
            style: .elbow
        )
    }

    // Helper: bottom-edge y of a slot in its row's local frame.
    private func bottomOf(_ centers: [CGPoint], _ frame: CGRect,
                          slot: Int, size: CGFloat) -> CGPoint {
        let geoH = size + 24
        let yOff = size / 2 - geoH / 2
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: frame.minY + centers[slot].y + yOff + size / 2
        )
    }
    // Helper: top-edge y of a slot in its row's local frame.
    // Answer-box slots use 0.45 × size as the half-height (same
    // as the visible outline height); numeric slots use 0.5 ×
    // size for the digit half-height.
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

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                // Row 1 — anchor (persistent goal).
                MathExpressionWithSlots(
                    slots: currentAnchorSlots,
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

                // Row 2 — split-1 (revealed on step 1's audio land).
                if showSplit1Row {
                    MathExpressionWithSlots(
                        slots: currentSplit1Slots,
                        size: splitSize
                    ) { centers in
                        split1SlotCenters = centers
                    }
                    .frame(height: splitSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        split1RowFrame = newFrame
                    }
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                Spacer().frame(height: gapSplitSplit)

                // Row 3 — split-2 (revealed on step 2's audio land).
                if showSplit2Row {
                    MathExpressionWithSlots(
                        slots: currentSplit2Slots,
                        size: splitSize
                    ) { centers in
                        split2SlotCenters = centers
                    }
                    .frame(height: splitSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        split2RowFrame = newFrame
                    }
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                Spacer().frame(height: gapSplitCombine)

                // Row 4 — combine-ones (revealed on step 3's audio).
                if showCombineOnesRow {
                    MathExpressionWithSlots(
                        slots: currentCombineOnesSlots,
                        size: combineSize
                    ) { centers in
                        combineOnesSlotCenters = centers
                    }
                    .frame(height: combineSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        combineOnesRowFrame = newFrame
                    }
                } else {
                    Color.clear.frame(height: combineSize + 24)
                }

                Spacer().frame(height: gapCombineCombine)

                // Row 5 — combine-tens (revealed on step 4's audio).
                if showCombineTensRow {
                    MathExpressionWithSlots(
                        slots: currentCombineTensSlots,
                        size: combineSize
                    ) { centers in
                        combineTensSlotCenters = centers
                    }
                    .frame(height: combineSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        combineTensRowFrame = newFrame
                    }
                } else {
                    Color.clear.frame(height: combineSize + 24)
                }

                Spacer().frame(height: 24)

                // Row 6 — buttons (per-step choices). Steps 1 and
                // 2 use "10+N" labels (e.g. "10+7"), which need
                // wider buttons than the default 100×80 — bumped to
                // 144×96 so the full label fits without truncation.
                // Steps 3/4/5 use single-digit or two-digit numeric
                // labels and look fine in the wider buttons too.
                host.makeQuestion(
                    correct: correctForStep,
                    values: optionChoices(
                        correct: correctForStep,
                        min: rangeForStep.min,
                        max: rangeForStep.max
                    ),
                    labelFor: labelForStep,
                    buttonWidth: 144,
                    buttonHeight: 96
                )
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            // Downward V connectors (anchor → split1, split1 →
            // split2) use `SymmetricVDiagram` so both arms have the
            // same total length (per earlier user feedback "左右的
            // 长度要一样长"). The upward V connectors
            // (combineOnesV, combineTensV — two top slots converge
            // onto a bottom apex) use `PolylineConnectors(.elbow)`
            // with two segments instead, because `.elbow` naturally
            // handles "from above → to below" geometry without the
            // gap problem `SymmetricVDiagram` had when the source
            // was below the destinations. Both V shapes share the
            // same vertical midpoint as the bend point for visual
            // consistency. L9 (single arrow) uses `.elbow` as before.
            ZStack {
                if let v = anchorSplit1V {
                    SymmetricVDiagram(
                        source: v.source,
                        destA: v.destA,
                        destB: v.destB,
                        colorA: Color(PandaTheme.yellow),
                        colorB: Color(PandaTheme.orange)
                    )
                }
                if let v = split1Split2V {
                    SymmetricVDiagram(
                        source: v.source,
                        destA: v.destA,
                        destB: v.destB,
                        colorA: Color(PandaTheme.yellow),
                        colorB: Color(PandaTheme.orange)
                    )
                }
                if let segs = combineOnesV {
                    PolylineConnectors(segments: segs)
                }
                if let segs = combineTensV {
                    PolylineConnectors(segments: segs)
                }
                if let seg = l9Connector {
                    PolylineConnectors(segments: [seg])
                }
            }
        }
        .onAppear { fireAudioForCurrentStep() }
    }

    // MARK: Step dispatchers for question + audio

    private var correctForStep: Int {
        switch step {
        case 1: return onesA
        case 2: return onesB
        case 3: return sum
        case 4: return 20
        default: return total
        }
    }

    private var rangeForStep: (min: Int, max: Int) {
        switch step {
        case 1: return (1, 8)
        case 2: return (1, 8)
        case 3: return (1, 9)
        case 4: return (18, 22)
        default: return (20, 29)
        }
    }

    // Step 1 / 2 buttons display as "10+N" (e.g. "10+7") per the JS
    // `decompositionOptions` helper. Steps 3 / 4 / 5 use plain digits.
    private var labelForStep: (Int) -> String {
        switch step {
        case 1:
            return { v in "10+\(v)" }
        case 2:
            return { v in "10+\(v)" }
        default:
            return { v in "\(v)" }
        }
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            host.playStepAudio(["l5-s1-\(a)-\(b)"]) {
                self.showSplit1Row = true
            }
        case 2:
            self.showSplit1Row = true
            host.playStepAudio(["l5-s2-\(a)-\(b)"]) {
                self.showSplit2Row = true
            }
        case 3:
            self.showSplit1Row = true
            self.showSplit2Row = true
            host.playStepAudio(["l5-s3-\(onesA)-\(onesB)"]) {
                self.showCombineOnesRow = true
            }
        case 4:
            self.showSplit1Row = true
            self.showSplit2Row = true
            self.showCombineOnesRow = true
            host.playStepAudio(["l5-s4"]) {
                self.showCombineTensRow = true
            }
        default:
            // Step 5 — all rows visible. Fire the prompt directly.
            self.showSplit1Row = true
            self.showSplit2Row = true
            self.showCombineOnesRow = true
            self.showCombineTensRow = true
            host.playStepAudio(["l5-s5-\(sum)"])
        }
    }
}

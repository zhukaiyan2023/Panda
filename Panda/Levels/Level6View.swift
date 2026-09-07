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
                            a: a,
                            b: b,
                            onesA: onesA,
                            onesB: onesB,
                            sum: sum,
                            total: total,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .teenPlusTeen(let a, let b) = round else { return }
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

private struct TeenPlusTeenStepView: View {
    let a: Int
    let b: Int
    let onesA: Int
    let onesB: Int
    let sum: Int
    let total: Int
    let step: Int
    let host: RoundHost

    // Keep the full five-step decomposition visible on iPad 11" portrait.
    // The previous fixed heights left too little room for the answer choices.
    private let anchorSize: CGFloat = 62
    private let splitSize: CGFloat = 44
    private let combineSize: CGFloat = 46
    private let gapAnchorSplit: CGFloat = 14
    private let gapSplitSplit: CGFloat = 12
    private let gapSplitCombine: CGFloat = 16
    private let gapCombineCombine: CGFloat = 16
    private let coordSpace = "TeenPlusTeenStepView.root"

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

    @State private var showSplit1Row = false
    @State private var showSplit2Row = false
    @State private var showCombineOnesRow = false
    @State private var showCombineTensRow = false

    private var currentAnchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("□", color: PandaTheme.ink)
        ]
    }

    private func split1Slots(_ left: String, _ right: String, _ answer: String) -> [MathSlot] {
        [
            .numberOrBox(left, numColor: PandaTheme.yellow, boxColor: PandaTheme.orange),
            .op(.plus),
            .numberOrBox(right, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
            .op(.plus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox(answer, color: PandaTheme.orange)
        ]
    }

    private func split2Slots(_ left: String, _ right: String, _ answer: String) -> [MathSlot] {
        [
            .number(10, color: PandaTheme.yellow),
            .op(.plus),
            .number(onesA, color: PandaTheme.orange),
            .op(.plus),
            .numberOrBox(left, numColor: PandaTheme.yellow, boxColor: PandaTheme.orange),
            .op(.plus),
            .numberOrBox(right, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
            .op(.equals),
            .answerBox(answer, color: PandaTheme.orange)
        ]
    }

    private func combineOnesSlots(_ middle: String, _ answer: String) -> [MathSlot] {
        [
            .number(10, color: PandaTheme.yellow),
            .op(.plus),
            .number(10, color: PandaTheme.yellow),
            .op(.plus),
            .numberOrBox(middle, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
            .op(.equals),
            .answerBox(answer, color: PandaTheme.orange)
        ]
    }

    private func combineTensSlots(_ left: String, _ answer: String) -> [MathSlot] {
        [
            .numberOrBox(left, numColor: PandaTheme.yellow, boxColor: PandaTheme.orange),
            .op(.plus),
            .number(sum, color: PandaTheme.success),
            .op(.equals),
            .answerBox(answer, color: PandaTheme.orange)
        ]
    }

    private var currentSplit1Slots: [MathSlot] {
        step == 1
            ? split1Slots("□", "□", "□")
            : split1Slots("10", "\(onesA)", "□")
    }

    private var currentSplit2Slots: [MathSlot] {
        step <= 2
            ? split2Slots("□", "□", "□")
            : split2Slots("10", "\(onesB)", "□")
    }

    private var currentCombineOnesSlots: [MathSlot] {
        step <= 3
            ? combineOnesSlots("□", "□")
            : combineOnesSlots("\(sum)", "□")
    }

    private var currentCombineTensSlots: [MathSlot] {
        step <= 4
            ? combineTensSlots("□", "□")
            : combineTensSlots("20", "□")
    }

    private var combineOnesOffset: CGFloat {
        guard split2SlotCenters.indices.contains(2),
              split2SlotCenters.indices.contains(6),
              combineOnesSlotCenters.indices.contains(4) else { return 0 }
        let sourceMid = (split2SlotCenters[2].x + split2SlotCenters[6].x) / 2
        return sourceMid - combineOnesSlotCenters[4].x
    }

    private var combineTensOffset: CGFloat {
        guard combineOnesSlotCenters.indices.contains(0),
              combineOnesSlotCenters.indices.contains(2),
              combineTensSlotCenters.indices.contains(0) else { return 0 }
        let sourceMid = (combineOnesSlotCenters[0].x + combineOnesSlotCenters[2].x) / 2
        return sourceMid - combineTensSlotCenters[0].x
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                row(currentAnchorSlots, size: anchorSize, frame: $anchorRowFrame, centers: $anchorSlotCenters)
                Spacer().frame(height: gapAnchorSplit)

                if showSplit1Row {
                    row(currentSplit1Slots, size: splitSize, frame: $split1RowFrame, centers: $split1SlotCenters)
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                Spacer().frame(height: gapSplitSplit)

                if showSplit2Row {
                    row(currentSplit2Slots, size: splitSize, frame: $split2RowFrame, centers: $split2SlotCenters)
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                Spacer().frame(height: gapSplitCombine)

                if showCombineOnesRow {
                    row(currentCombineOnesSlots, size: combineSize, frame: $combineOnesRowFrame, centers: $combineOnesSlotCenters)
                        .offset(x: combineOnesOffset)
                } else {
                    Color.clear.frame(height: combineSize + 24)
                }

                Spacer().frame(height: gapCombineCombine)

                if showCombineTensRow {
                    row(currentCombineTensSlots, size: combineSize, frame: $combineTensRowFrame, centers: $combineTensSlotCenters)
                        .offset(x: combineTensOffset)
                } else {
                    Color.clear.frame(height: combineSize + 24)
                }

                Spacer().frame(height: 16)
                host.makeQuestion(
                    correct: correctForStep,
                    values: optionChoices(correct: correctForStep, min: rangeForStep.min, max: rangeForStep.max),
                    labelFor: labelForStep,
                    buttonWidth: 144,
                    buttonHeight: 82
                )
            }
            .frame(maxWidth: .infinity)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            ZStack {
                if let v = anchorSplit1V {
                    BalancedSplitConnector(source: v.source, destA: v.destA, destB: v.destB, colorA: Color(PandaTheme.yellow), colorB: Color(PandaTheme.orange), lineThickness: 7, opacity: 0.85)
                }
                if let v = split1Split2V {
                    BalancedSplitConnector(source: v.source, destA: v.destA, destB: v.destB, colorA: Color(PandaTheme.yellow), colorB: Color(PandaTheme.orange), lineThickness: 7, opacity: 0.85)
                }
                if let v = combineOnesV {
                    BalancedMergeConnector(anchorTop: v.sourceA, anchorMid: v.sourceB, mergeBox: v.target, colorA: Color(PandaTheme.orange), colorB: Color(PandaTheme.orange), lineThickness: 7)
                }
                if let v = combineTensV {
                    BalancedMergeConnector(anchorTop: v.sourceA, anchorMid: v.sourceB, mergeBox: v.target, colorA: Color(PandaTheme.yellow), colorB: Color(PandaTheme.yellow), lineThickness: 7)
                }
                if let l9 = l9Connector {
                    BalancedFixedArmConnector(from: l9.source, to: l9.target, color: Color(PandaTheme.success), lineThickness: 6, opacity: 0.9)
                }
            }
        }
        .onAppear {
            fireAudioForCurrentStep()
        }
    }

    @ViewBuilder
    private func row(_ slots: [MathSlot], size: CGFloat, frame: Binding<CGRect>, centers: Binding<[CGPoint]>) -> some View {
        MathExpressionWithSlots(slots: slots, size: size) { values in
            centers.wrappedValue = values
        }
        .frame(height: size + 24)
        .onGeometryChange(for: CGRect.self) { proxy in
            proxy.frame(in: .named(coordSpace))
        } action: { newFrame in
            frame.wrappedValue = newFrame
        }
    }

    private var anchorSplit1V: (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplit1Row, anchorSlotCenters.indices.contains(0), split1SlotCenters.indices.contains(2) else { return nil }
        let source = edgePoint(anchorSlotCenters, anchorRowFrame, 0, anchorSize, .bottom)
        let destA = edgePoint(split1SlotCenters, split1RowFrame, 0, splitSize, .top, 0.5)
        let destB = edgePoint(split1SlotCenters, split1RowFrame, 2, splitSize, .top)
        return (source, destA, destB)
    }

    private var split1Split2V: (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplit2Row, split1SlotCenters.indices.contains(4), split2SlotCenters.indices.contains(6) else { return nil }
        let source = edgePoint(split1SlotCenters, split1RowFrame, 4, splitSize, .bottom)
        let destA = edgePoint(split2SlotCenters, split2RowFrame, 4, splitSize, .top, 0.5)
        let destB = edgePoint(split2SlotCenters, split2RowFrame, 6, splitSize, .top)
        return (source, destA, destB)
    }

    private var combineOnesV: (sourceA: CGPoint, sourceB: CGPoint, target: CGPoint)? {
        guard showCombineOnesRow, split2SlotCenters.indices.contains(6), combineOnesSlotCenters.indices.contains(4) else { return nil }
        let sourceA = edgePoint(split2SlotCenters, split2RowFrame, 2, splitSize, .bottom)
        let sourceB = edgePoint(split2SlotCenters, split2RowFrame, 6, splitSize, .bottom)
        let target = edgePoint(combineOnesSlotCenters, combineOnesRowFrame, 4, combineSize, .top)
        return (sourceA, sourceB, target)
    }

    private var combineTensV: (sourceA: CGPoint, sourceB: CGPoint, target: CGPoint)? {
        guard showCombineTensRow, combineOnesSlotCenters.indices.contains(2), combineTensSlotCenters.indices.contains(0) else { return nil }
        let sourceA = edgePoint(combineOnesSlotCenters, combineOnesRowFrame, 0, combineSize, .bottom)
        let sourceB = edgePoint(combineOnesSlotCenters, combineOnesRowFrame, 2, combineSize, .bottom)
        let target = edgePoint(combineTensSlotCenters, combineTensRowFrame, 0, combineSize, .top)
        return (sourceA, sourceB, target)
    }

    private var l9Connector: (source: CGPoint, target: CGPoint)? {
        guard showCombineTensRow, combineOnesSlotCenters.indices.contains(4), combineTensSlotCenters.indices.contains(2) else { return nil }
        let source = edgePoint(combineOnesSlotCenters, combineOnesRowFrame, 4, combineSize, .bottom)
        let target = edgePoint(combineTensSlotCenters, combineTensRowFrame, 2, combineSize, .top)
        return (source, target)
    }

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
        case 1, 2: return (1, 8)
        case 3: return (1, 9)
        case 4: return (18, 22)
        default: return (20, 29)
        }
    }

    private var labelForStep: (Int) -> String {
        switch step {
        case 1, 2: return { "10+\($0)" }
        default: return { "\($0)" }
        }
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            host.playStepAudio(["l5-s1-\(a)-\(b)"]) { showSplit1Row = true }
        case 2:
            showSplit1Row = true
            host.playStepAudio(["l5-s2-\(a)-\(b)"]) { showSplit2Row = true }
        case 3:
            showSplit1Row = true
            showSplit2Row = true
            host.playStepAudio(["l5-s3-\(onesA)-\(onesB)"]) { showCombineOnesRow = true }
        case 4:
            showSplit1Row = true
            showSplit2Row = true
            showCombineOnesRow = true
            host.playStepAudio(["l5-s4"]) { showCombineTensRow = true }
        default:
            showSplit1Row = true
            showSplit2Row = true
            showCombineOnesRow = true
            showCombineTensRow = true
            host.playStepAudio(["l5-s5-\(sum)"])
        }
    }

    private enum Edge { case top, bottom }

    private func edgePoint(_ centers: [CGPoint], _ frame: CGRect, _ slot: Int, _ size: CGFloat, _ edge: Edge, _ halfRatio: CGFloat = 0.5) -> CGPoint {
        let actualCenterY = frame.minY + centers[slot].y - 12
        let half = size * halfRatio
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: edge == .top ? actualCenterY - half : actualCenterY + half
        )
    }
}

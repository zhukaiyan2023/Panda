import SwiftUI

public struct Level5View: View {
    public init() {}

    public var body: some View {
        RoundScaffold(
            levelId: 5,
            sampleSize: 6,
            stepLabels: ["拆十位", "加个位", "加起来"],
            poolGen: PandaPools.poolGensForLevel(5),
            stepBuilder: { round, step, host in
                guard case .teenPlusDigit(let a, let b) = round else { return StepRender() }
                let ones = a % 10
                let smallSum = ones + b
                let total = a + b
                return StepRender(
                    equation: AnyView(
                        TwentyWithinStepView(
                            a: a,
                            b: b,
                            ones: ones,
                            smallSum: smallSum,
                            total: total,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .teenPlusDigit(let a, let b) = round else { return }
                let cue = "l3-rwd-\(a)-\(b)-\(a+b)"
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

private struct TwentyWithinStepView: View {
    let a: Int
    let b: Int
    let ones: Int
    let smallSum: Int
    let total: Int
    let step: Int
    let host: RoundHost

    private let anchorSize: CGFloat = 72
    private let splitSize: CGFloat = 56
    private let bottomSize: CGFloat = 56
    private let gapAnchorSplit: CGFloat = 32
    private let gapSplitBottom: CGFloat = 28
    private let coordSpace = "TwentyWithinStepView.root"

    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var splitRowFrame: CGRect = .zero
    @State private var splitSlotCenters: [CGPoint] = []
    @State private var bottomRowFrame: CGRect = .zero
    @State private var bottomSlotCenters: [CGPoint] = []
    @State private var showSplitRow = false
    @State private var showBottomRow = false

    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("□", color: PandaTheme.ink)
        ]
    }

    private func splitSlots(onesValue: Int?, answerValue: Int?) -> [MathSlot] {
        let onesSlot: MathSlot = onesValue.map {
            .number($0, color: PandaTheme.orange)
        } ?? .answerBox("□", color: PandaTheme.orange)
        let answerSlot: MathSlot = answerValue.map {
            .number($0, color: PandaTheme.ink)
        } ?? .answerBox("□", color: PandaTheme.orange)
        return [
            .number(10, color: PandaTheme.yellow),
            .op(.plus),
            onesSlot,
            .op(.plus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            answerSlot
        ]
    }

    private func bottomSlots(middle: Int?) -> [MathSlot] {
        let middleSlot: MathSlot = middle.map {
            .number($0, color: PandaTheme.orange)
        } ?? .answerBox("□", color: PandaTheme.orange)
        return [
            .number(10, color: PandaTheme.yellow),
            .op(.plus),
            middleSlot,
            .op(.equals),
            .answerBox("□", color: PandaTheme.orange)
        ]
    }

    private var currentSplitSlots: [MathSlot] {
        step == 1
            ? splitSlots(onesValue: nil, answerValue: nil)
            : splitSlots(onesValue: ones, answerValue: nil)
    }

    private var currentBottomSlots: [MathSlot] {
        step <= 2
            ? bottomSlots(middle: nil)
            : bottomSlots(middle: smallSum)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                row(anchorSlots, size: anchorSize, frame: $anchorRowFrame, centers: $anchorSlotCenters)
                Spacer().frame(height: gapAnchorSplit)

                if showSplitRow {
                    row(currentSplitSlots, size: splitSize, frame: $splitRowFrame, centers: $splitSlotCenters)
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                if showBottomRow {
                    Spacer().frame(height: gapSplitBottom)
                    row(currentBottomSlots, size: bottomSize, frame: $bottomRowFrame, centers: $bottomSlotCenters)
                }

                Spacer().frame(height: 28)
                host.makeQuestion(
                    correct: correctForStep,
                    values: optionChoices(correct: correctForStep, min: rangeForStep.min, max: rangeForStep.max),
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
            ZStack {
                if let split = splitV {
                    BalancedSplitConnector(
                        source: split.source,
                        destA: split.destA,
                        destB: split.destB,
                        colorA: Color(PandaTheme.yellow),
                        colorB: Color(PandaTheme.orange),
                        lineThickness: 7,
                        opacity: 0.85
                    )
                }

                if let merge = bottomMerge {
                    BalancedMergeConnector(
                        anchorTop: merge.sourceA,
                        anchorMid: merge.sourceB,
                        mergeBox: merge.target,
                        colorA: Color(PandaTheme.orange),
                        colorB: Color(PandaTheme.numPink),
                        lineThickness: 7
                    )
                }
            }
        }
        .onAppear {
            fireAudioForCurrentStep()
        }
    }

    @ViewBuilder
    private func row(
        _ slots: [MathSlot],
        size: CGFloat,
        frame: Binding<CGRect>,
        centers: Binding<[CGPoint]>
    ) -> some View {
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

    private var splitV: (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplitRow,
              anchorSlotCenters.indices.contains(0),
              splitSlotCenters.indices.contains(2) else { return nil }
        let source = edgePoint(anchorSlotCenters, anchorRowFrame, 0, anchorSize, .bottom)
        let destA = edgePoint(splitSlotCenters, splitRowFrame, 0, splitSize, .top)
        let destB = edgePoint(splitSlotCenters, splitRowFrame, 2, splitSize, .top)
        return (source, destA, destB)
    }

    private var bottomMerge: (sourceA: CGPoint, sourceB: CGPoint, target: CGPoint)? {
        guard showBottomRow,
              splitSlotCenters.indices.contains(4),
              bottomSlotCenters.indices.contains(2) else { return nil }
        let sourceA = edgePoint(splitSlotCenters, splitRowFrame, 2, splitSize, .bottom)
        let sourceB = edgePoint(splitSlotCenters, splitRowFrame, 4, splitSize, .bottom)
        let target = edgePoint(bottomSlotCenters, bottomRowFrame, 2, bottomSize, .top)
        return (sourceA, sourceB, target)
    }

    private var correctForStep: Int {
        switch step {
        case 1: return ones
        case 2: return smallSum
        default: return total
        }
    }

    private var rangeForStep: (min: Int, max: Int) {
        switch step {
        case 1: return (1, 9)
        case 2: return (2, 9)
        default: return (12, 28)
        }
    }

    private var labelForStep: (Int) -> String {
        switch step {
        case 1: return { "10+\($0)" }
        default: return { "\($0)" }
        }
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            host.playStepAudio(["l3-s1-\(a)-\(b)"]) { showSplitRow = true }
        case 2:
            showSplitRow = true
            host.playStepAudio(["l3-s2-\(ones)-\(b)"]) { showBottomRow = true }
        default:
            showSplitRow = true
            showBottomRow = true
            host.playStepAudio(["l3-s3-\(smallSum)"])
        }
    }

    private enum Edge { case top, bottom }

    private func edgePoint(
        _ centers: [CGPoint],
        _ frame: CGRect,
        _ slot: Int,
        _ size: CGFloat,
        _ edge: Edge,
        _ halfRatio: CGFloat = 0.5
    ) -> CGPoint {
        let actualCenterY = frame.minY + centers[slot].y - 12
        let half = size * halfRatio
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: edge == .top ? actualCenterY - half : actualCenterY + half
        )
    }
}

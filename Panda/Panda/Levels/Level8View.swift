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
                            a: a,
                            b: b,
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

private struct TeenSubBorrowStepView: View {
    let a: Int
    let b: Int
    let ones: Int
    let sub: Int
    let answer: Int
    let step: Int
    let host: RoundHost

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

    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("?", color: PandaTheme.orange)
        ]
    }

    private func splitSlots(onesValue: Int?, answerValue: Int?) -> [MathSlot] {
        let onesSlot: MathSlot = onesValue.map {
            .number($0, color: PandaTheme.orange)
        } ?? .answerBox("□", color: PandaTheme.orange)

        let answerSlot: MathSlot = answerValue.map {
            .number($0, color: PandaTheme.ink)
        } ?? .answerBox("?", color: PandaTheme.orange)

        return [
            onesSlot,
            .op(.plus),
            .number(10, color: PandaTheme.yellow),
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            answerSlot
        ]
    }

    private func resultSlots(pickValue: Int?, answerValue: Int?) -> [MathSlot] {
        let pickSlot: MathSlot = pickValue.map {
            .number($0, color: PandaTheme.numPink)
        } ?? .answerBox("□", color: PandaTheme.orange)

        let answerSlot: MathSlot = answerValue.map {
            .number($0, color: PandaTheme.ink)
        } ?? .answerBox("?", color: PandaTheme.orange)

        return [
            .number(ones, color: PandaTheme.orange),
            .op(.plus),
            pickSlot,
            .op(.equals),
            answerSlot
        ]
    }

    private var currentSplitSlots: [MathSlot] {
        if step == 1 {
            return splitSlots(onesValue: nil, answerValue: nil)
        }
        return splitSlots(onesValue: ones, answerValue: nil)
    }

    private var currentResultSlots: [MathSlot] {
        if step == 2 {
            return resultSlots(pickValue: nil, answerValue: nil)
        }
        return resultSlots(
            pickValue: sub,
            answerValue: host.session.currentStepAnswer
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                MathExpressionWithSlots(slots: anchorSlots, size: anchorSize) { centers in
                    anchorSlotCenters = centers
                }
                .frame(height: anchorSize + 24)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { frame in
                    anchorRowFrame = frame
                }

                Spacer().frame(height: gapAnchorSplit)

                if showSplitRow {
                    MathExpressionWithSlots(slots: currentSplitSlots, size: splitSize) { centers in
                        splitSlotCenters = centers
                    }
                    .frame(height: splitSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { frame in
                        splitRowFrame = frame
                    }
                } else {
                    Color.clear.frame(height: splitSize + 24)
                }

                Spacer().frame(height: gapSplitResult)
                MathExpressionWithSlots(slots: currentResultSlots, size: resultSize) { centers in
                    resultSlotCenters = centers
                }
                .frame(height: resultSize + 24)
                .opacity(showResultRow ? 1 : 0)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { frame in
                    resultRowFrame = frame
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
        .onAppear {
            fireAudioForCurrentStep()
        }
    }

    private func stepQuestion() -> AnyView {
        switch step {
        case 1:
            return host.makeQuestion(
                correct: ones,
                values: optionChoices(correct: ones, min: 1, max: 8),
                labelFor: { "\($0)+10" },
                buttonWidth: 144,
                buttonHeight: 96
            )
        case 2:
            return host.makeQuestion(
                correct: sub,
                values: optionChoices(correct: sub, min: 1, max: 8)
            )
        default:
            return host.makeQuestion(
                correct: answer,
                values: answerOptionChoices()
            )
        }
    }

    private func answerOptionChoices() -> [Int] {
        let raw = optionChoices(correct: answer, min: 2, max: 10)
        guard raw.count == 4,
              let index = raw.firstIndex(of: answer),
              index != 2 else { return raw }
        let distractors = raw.filter { $0 != answer }.sorted()
        return Array(distractors.prefix(2)) + [answer] + Array(distractors.dropFirst(2))
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            host.playStepAudio(["l8-s1-\(a)-\(b)"]) {
                showSplitRow = true
            }
        case 2:
            showSplitRow = true
            host.playStepAudio(["l8-s2-\(b)"]) {
                showResultRow = true
            }
        default:
            showSplitRow = true
            showResultRow = true
            host.playStepAudio(["l8-s3-\(ones)-\(b)"])
        }
    }

    private func splitArrowEndpoints() -> (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplitRow,
              anchorSlotCenters.indices.contains(0),
              splitSlotCenters.indices.contains(2) else { return nil }

        let source = edgePoint(
            centers: anchorSlotCenters,
            frame: anchorRowFrame,
            slot: 0,
            size: anchorSize,
            edge: .bottom
        )
        let destA = edgePoint(
            centers: splitSlotCenters,
            frame: splitRowFrame,
            slot: 0,
            size: splitSize
        )
        let destB = edgePoint(
            centers: splitSlotCenters,
            frame: splitRowFrame,
            slot: 2,
            size: splitSize,
            edge: .top,
            halfRatio: 0.5
        )
        return (source, destA, destB)
    }

    private func combineArrowEndpoints() -> (sourceA: CGPoint, sourceB: CGPoint, target: CGPoint)? {
        guard showSplitRow,
              showResultRow,
              splitSlotCenters.indices.contains(4),
              resultSlotCenters.indices.contains(2) else { return nil }

        let sourceA = edgePoint(
            centers: splitSlotCenters,
            frame: splitRowFrame,
            slot: 2,
            size: splitSize,
            edge: .bottom,
            halfRatio: 0.5
        )
        let sourceB = edgePoint(
            centers: splitSlotCenters,
            frame: splitRowFrame,
            slot: 4,
            size: splitSize,
            edge: .bottom
        )
        let target = edgePoint(
            centers: resultSlotCenters,
            frame: resultRowFrame,
            slot: 2,
            size: resultSize,
            edge: .top,
            halfRatio: 0.5
        )
        return (sourceA, sourceB, target)
    }

    @ViewBuilder
    private func stepArrowsOverlay() -> some View {
        ZStack {
            if let split = splitArrowEndpoints() {
                BalancedSplitConnector(
                    source: split.source,
                    destA: split.destA,
                    destB: split.destB,
                    colorA: Color(PandaTheme.orange),
                    colorB: Color(PandaTheme.yellow),
                    lineThickness: 7,
                    opacity: 0.85
                )
            }

            if let merge = combineArrowEndpoints() {
                BalancedMergeConnector(
                    anchorTop: merge.sourceA,
                    anchorMid: merge.sourceB,
                    mergeBox: merge.target,
                    colorA: Color(PandaTheme.yellow),
                    colorB: Color(PandaTheme.numPink),
                    lineThickness: 8
                )
            }
        }
    }

    private enum Edge { case top, bottom }

    private func edgePoint(
        centers: [CGPoint],
        frame: CGRect,
        slot: Int,
        size: CGFloat,
        edge: Edge = .top,
        halfRatio: CGFloat? = nil
    ) -> CGPoint {
        let actualCenterY = frame.minY + centers[slot].y - 12
        let half = size * (halfRatio ?? 0.5)
        let y = edge == .top ? actualCenterY - half : actualCenterY + half
        return CGPoint(x: frame.minX + centers[slot].x, y: y)
    }
}

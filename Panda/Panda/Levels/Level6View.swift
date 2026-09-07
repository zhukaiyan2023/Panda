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
                return StepRender(equation: AnyView(
                    TeenPlusTeenStepView(a: a, b: b, step: step, host: host)
                ))
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .teenPlusTeen(let a, let b) = round else { return }
                let cue = "l5-rwd-\(a)-\(b)-\(a + b)"
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
    let step: Int
    let host: RoundHost

    private var onesA: Int { a % 10 }
    private var onesB: Int { b % 10 }
    private var sum: Int { onesA + onesB }
    private var total: Int { a + b }

    // Compact enough for 11-inch iPad portrait while retaining the complete
    // five-step teaching chain above the answer choices.
    private let anchorSize: CGFloat = 62
    private let splitSize: CGFloat = 44
    private let combineSize: CGFloat = 46
    private let gapAnchorSplit: CGFloat = 14
    private let gapSplitSplit: CGFloat = 12
    private let gapSplitCombine: CGFloat = 16
    private let gapCombineCombine: CGFloat = 16
    private let coordSpace = "TeenPlusTeenStepView.root"

    @State private var anchorFrame = CGRect.zero
    @State private var anchorCenters: [CGPoint] = []
    @State private var split1Frame = CGRect.zero
    @State private var split1Centers: [CGPoint] = []
    @State private var split2Frame = CGRect.zero
    @State private var split2Centers: [CGPoint] = []
    @State private var onesFrame = CGRect.zero
    @State private var onesCenters: [CGPoint] = []
    @State private var tensFrame = CGRect.zero
    @State private var tensCenters: [CGPoint] = []

    @State private var showSplit1 = false
    @State private var showSplit2 = false
    @State private var showOnes = false
    @State private var showTens = false

    private var anchorSlots: [MathSlot] {
        [.number(a, color: PandaTheme.numBlue), .op(.plus),
         .number(b, color: PandaTheme.numPink), .op(.equals),
         .answerBox("□", color: PandaTheme.ink)]
    }

    private var split1Slots: [MathSlot] {
        [numberOrBox(step == 1 ? "□" : "10", .yellow), .op(.plus),
         numberOrBox(step == 1 ? "□" : "\(onesA)", .orange), .op(.plus),
         .number(b, color: PandaTheme.numPink), .op(.equals),
         .answerBox("□", color: PandaTheme.orange)]
    }

    private var split2Slots: [MathSlot] {
        [.number(10, color: PandaTheme.yellow), .op(.plus),
         .number(onesA, color: PandaTheme.orange), .op(.plus),
         numberOrBox(step <= 2 ? "□" : "10", .yellow), .op(.plus),
         numberOrBox(step <= 2 ? "□" : "\(onesB)", .orange), .op(.equals),
         .answerBox("□", color: PandaTheme.orange)]
    }

    private var onesSlots: [MathSlot] {
        [.number(10, color: PandaTheme.yellow), .op(.plus),
         .number(10, color: PandaTheme.yellow), .op(.plus),
         numberOrBox(step <= 3 ? "□" : "\(sum)", .orange), .op(.equals),
         .answerBox("□", color: PandaTheme.orange)]
    }

    private var tensSlots: [MathSlot] {
        [numberOrBox(step <= 4 ? "□" : "20", .yellow), .op(.plus),
         .number(sum, color: PandaTheme.success), .op(.equals),
         .answerBox("□", color: PandaTheme.orange)]
    }

    private func numberOrBox(_ value: String, _ color: RGB) -> MathSlot {
        value == "□" ? .answerBox(value, color: color) : .number(Int(value) ?? 0, color: color)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                measuredRow(anchorSlots, size: anchorSize, frame: $anchorFrame, centers: $anchorCenters)
                Spacer().frame(height: gapAnchorSplit)
                conditionalRow(showSplit1, split1Slots, splitSize, frame: $split1Frame, centers: $split1Centers)
                Spacer().frame(height: gapSplitSplit)
                conditionalRow(showSplit2, split2Slots, splitSize, frame: $split2Frame, centers: $split2Centers)
                Spacer().frame(height: gapSplitCombine)
                conditionalRow(showOnes, onesSlots, combineSize, frame: $onesFrame, centers: $onesCenters)
                Spacer().frame(height: gapCombineCombine)
                conditionalRow(showTens, tensSlots, combineSize, frame: $tensFrame, centers: $tensCenters)
                Spacer().frame(height: 18)
                host.makeQuestion(
                    correct: correctAnswer,
                    values: optionChoices(correct: correctAnswer, min: answerRange.min, max: answerRange.max),
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
        .overlay { connectors }
        .onAppear { fireAudioForCurrentStep() }
    }

    @ViewBuilder
    private func conditionalRow(_ visible: Bool, _ slots: [MathSlot], _ size: CGFloat,
                                frame: Binding<CGRect>, centers: Binding<[CGPoint]>) -> some View {
        if visible {
            measuredRow(slots, size: size, frame: frame, centers: centers)
        } else {
            Color.clear.frame(height: size + 24)
        }
    }

    private func measuredRow(_ slots: [MathSlot], size: CGFloat,
                             frame: Binding<CGRect>, centers: Binding<[CGPoint]>) -> some View {
        MathExpressionWithSlots(slots: slots, size: size) { centers.wrappedValue = $0 }
            .frame(height: size + 24)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(coordSpace)) } action: {
                frame.wrappedValue = $0
            }
    }

    @ViewBuilder
    private var connectors: some View {
        if let v = splitConnector(anchorCenters, anchorFrame, 0, anchorSize, split1Centers, split1Frame, 0, 2, splitSize) {
            BalancedSplitConnector(source: v.source, destA: v.destA, destB: v.destB,
                                   colorA: Color(PandaTheme.yellow), colorB: Color(PandaTheme.orange),
                                   lineThickness: 6, opacity: 0.85)
        }
        if let v = splitConnector(split1Centers, split1Frame, 4, splitSize, split2Centers, split2Frame, 4, 6, splitSize) {
            BalancedSplitConnector(source: v.source, destA: v.destA, destB: v.destB,
                                   colorA: Color(PandaTheme.yellow), colorB: Color(PandaTheme.orange),
                                   lineThickness: 6, opacity: 0.85)
        }
        if showOnes, split2Centers.count > 6, onesCenters.count > 4 {
            BalancedMergeConnector(
                anchorTop: edge(split2Centers, split2Frame, 2, splitSize, false),
                anchorMid: edge(split2Centers, split2Frame, 6, splitSize, false),
                mergeBox: edge(onesCenters, onesFrame, 4, combineSize, true),
                colorA: Color(PandaTheme.orange), colorB: Color(PandaTheme.orange), lineThickness: 6)
        }
        if showTens, onesCenters.count > 4, tensCenters.count > 2 {
            BalancedMergeConnector(
                anchorTop: edge(onesCenters, onesFrame, 0, combineSize, false),
                anchorMid: edge(onesCenters, onesFrame, 2, combineSize, false),
                mergeBox: edge(tensCenters, tensFrame, 0, combineSize, true),
                colorA: Color(PandaTheme.yellow), colorB: Color(PandaTheme.yellow), lineThickness: 6)
            BalancedFixedArmConnector(
                from: edge(onesCenters, onesFrame, 4, combineSize, false),
                to: edge(tensCenters, tensFrame, 2, combineSize, true),
                color: Color(PandaTheme.success), lineThickness: 5, opacity: 0.9)
        }
    }

    private func splitConnector(_ sourceCenters: [CGPoint], _ sourceFrame: CGRect, _ sourceIndex: Int,
                                _ sourceSize: CGFloat, _ destCenters: [CGPoint], _ destFrame: CGRect,
                                _ destAIndex: Int, _ destBIndex: Int, _ destSize: CGFloat)
        -> (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplit1 || showSplit2,
              sourceCenters.indices.contains(sourceIndex),
              destCenters.indices.contains(destAIndex), destCenters.indices.contains(destBIndex) else { return nil }
        return (
            edge(sourceCenters, sourceFrame, sourceIndex, sourceSize, false),
            edge(destCenters, destFrame, destAIndex, destSize, true),
            edge(destCenters, destFrame, destBIndex, destSize, true)
        )
    }

    private func edge(_ centers: [CGPoint], _ frame: CGRect, _ index: Int, _ size: CGFloat, _ top: Bool) -> CGPoint {
        let p = centers[index]
        let y = frame.minY + p.y - 12
        return CGPoint(x: frame.minX + p.x, y: top ? y - size / 2 : y + size / 2)
    }

    private var correctAnswer: Int {
        switch step { case 1: return onesA; case 2: return onesB; case 3: return sum; case 4: return 20; default: return total }
    }

    private var answerRange: (min: Int, max: Int) {
        switch step { case 1, 2: return (1, 8); case 3: return (1, 9); case 4: return (18, 22); default: return (20, 29) }
    }

    private var labelForStep: (Int) -> String {
        step <= 2 ? { "10+\($0)" } : { "\($0)" }
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1: host.playStepAudio(["l5-s1-\(a)-\(b)"]) { showSplit1 = true }
        case 2:
            showSplit1 = true
            host.playStepAudio(["l5-s2-\(a)-\(b)"]) { showSplit2 = true }
        case 3:
            showSplit1 = true; showSplit2 = true
            host.playStepAudio(["l5-s3-\(onesA)-\(onesB)"]) { showOnes = true }
        case 4:
            showSplit1 = true; showSplit2 = true; showOnes = true
            host.playStepAudio(["l5-s4"]) { showTens = true }
        default:
            showSplit1 = true; showSplit2 = true; showOnes = true; showTens = true
            host.playStepAudio(["l5-s5-\(sum)"])
        }
    }
}

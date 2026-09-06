import SwiftUI

public struct Level4View: View {
    public init() {}

    public var body: some View {
        RoundScaffold(
            levelId: 4,
            sampleSize: 6,
            stepLabels: ["凑成十", "拆一拆", "算一算"],
            poolGen: PandaPools.poolGensForLevel(4),
            stepBuilder: { round, step, host in
                guard case .makeTen(let a, let b) = round else { return StepRender() }
                let big = max(a, b)
                let small = min(a, b)
                let need = 10 - big
                let rest = small - need
                let total = a + b
                return StepRender(
                    equation: AnyView(
                        Level4StepView(
                            a: a,
                            b: b,
                            big: big,
                            small: small,
                            need: need,
                            rest: rest,
                            total: total,
                            aIsBig: a >= b,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .makeTen(let a, let b) = round else { return }
                let cue = "l2-rwd-\(a)-\(b)-\(a + b)"
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

struct Level4StepView: View {
    let a: Int
    let b: Int
    let big: Int
    let small: Int
    let need: Int
    let rest: Int
    let total: Int
    let aIsBig: Bool
    let step: Int
    let host: RoundHost

    private let cellSize: CGFloat = 42
    private let anchorSize: CGFloat = 84
    private let sub1Size: CGFloat = 72
    private let sub2Size: CGFloat = 58
    private let rowGap: CGFloat = 24

    private let coordSpace = "Level4StepView.root"

    @State private var anchorFrame: CGRect = .zero
    @State private var anchorCenters: [CGPoint] = []
    @State private var sub1Frame: CGRect = .zero
    @State private var sub1Centers: [CGPoint] = []
    @State private var showAudioLoaded = false

    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numYellow),
            .op(.equals),
            .answerBox("?", color: PandaTheme.ink)
        ]
    }

    private var sub1Slots: [MathSlot] {
        if aIsBig {
            switch step {
            case 1:
                return [
                    .number(big, color: PandaTheme.numBlue), .op(.plus),
                    .answerBox("?", color: PandaTheme.orange), .op(.plus),
                    .answerBox("?", color: PandaTheme.purple), .op(.equals),
                    .answerBox("?", color: PandaTheme.ink)
                ]
            case 2:
                return [
                    .number(big, color: PandaTheme.numBlue), .op(.plus),
                    .number(need, color: PandaTheme.orange), .op(.plus),
                    .answerBox("?", color: PandaTheme.purple), .op(.equals),
                    .answerBox("?", color: PandaTheme.ink)
                ]
            default:
                return [
                    .number(big, color: PandaTheme.numBlue), .op(.plus),
                    .number(need, color: PandaTheme.orange), .op(.plus),
                    .number(rest, color: PandaTheme.purple), .op(.equals),
                    .answerBox("?", color: PandaTheme.ink)
                ]
            }
        } else {
            switch step {
            case 1:
                return [
                    .answerBox("?", color: PandaTheme.purple), .op(.plus),
                    .answerBox("?", color: PandaTheme.orange), .op(.plus),
                    .number(big, color: PandaTheme.numBlue), .op(.equals),
                    .answerBox("?", color: PandaTheme.ink)
                ]
            case 2:
                return [
                    .answerBox("?", color: PandaTheme.purple), .op(.plus),
                    .number(need, color: PandaTheme.orange), .op(.plus),
                    .number(big, color: PandaTheme.numBlue), .op(.equals),
                    .answerBox("?", color: PandaTheme.ink)
                ]
            default:
                return [
                    .number(rest, color: PandaTheme.purple), .op(.plus),
                    .number(need, color: PandaTheme.orange), .op(.plus),
                    .number(big, color: PandaTheme.numBlue), .op(.equals),
                    .answerBox("?", color: PandaTheme.ink)
                ]
            }
        }
    }

    private var sub2Slots: [MathSlot] {
        if step == 1 {
            return [
                .number(big, color: PandaTheme.numBlue), .op(.plus),
                .answerBox("?", color: PandaTheme.orange), .op(.equals),
                .number(10, color: PandaTheme.ink)
            ]
        }
        return [
            .number(need, color: PandaTheme.orange), .op(.plus),
            .answerBox("?", color: PandaTheme.purple), .op(.equals),
            .number(small, color: PandaTheme.numPink)
        ]
    }

    private var splitSourceSlot: Int { aIsBig ? 2 : 0 }
    private var splitNeedSlot: Int { 2 }
    private var splitRestSlot: Int { aIsBig ? 4 : 0 }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                HStack(spacing: 40) {
                    TenFrame(value: a, rows: 2, cell: cellSize, gap: 4, showLabel: false)
                    TenFrame(value: b, rows: 2, cell: cellSize, gap: 4, showLabel: false)
                }
                .frame(height: cellSize * 2 + 12)

                Spacer().frame(height: 20)

                MathExpressionWithSlots(slots: anchorSlots, size: anchorSize) { centers in
                    anchorCenters = centers
                }
                .frame(height: anchorSize + 24)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { frame in
                    anchorFrame = frame
                }

                Spacer().frame(height: rowGap)

                MathExpressionWithSlots(slots: sub1Slots, size: sub1Size) { centers in
                    sub1Centers = centers
                }
                .frame(height: sub1Size + 24)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { frame in
                    sub1Frame = frame
                }

                if step < 3 {
                    Spacer().frame(height: rowGap)
                    MathExpression(slots: sub2Slots, size: sub2Size)
                        .frame(height: sub2Size + 24)
                }

                Spacer().frame(height: 26)
                questionView
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            if showAudioLoaded,
               anchorCenters.indices.contains(splitSourceSlot),
               sub1Centers.indices.contains(splitNeedSlot),
               sub1Centers.indices.contains(splitRestSlot) {
                BalancedSplitConnector(
                    source: anchorBottom(anchorCenters, anchorFrame, slot: splitSourceSlot, size: anchorSize),
                    destA: sub1Top(sub1Centers, sub1Frame, slot: splitNeedSlot, size: sub1Size),
                    destB: sub1Top(sub1Centers, sub1Frame, slot: splitRestSlot, size: sub1Size),
                    colorA: Color(PandaTheme.orange),
                    colorB: Color(PandaTheme.purple),
                    lineThickness: 7,
                    opacity: 0.86
                )
                .allowsHitTesting(false)
            }
        }
        .onAppear {
            fireAudioForCurrentStep()
        }
    }

    private var questionView: AnyView {
        switch step {
        case 1:
            return host.makeQuestion(
                correct: need,
                values: optionChoices(correct: need, min: 0, max: 10),
                labelFor: { "\($0)" },
                buttonWidth: 120,
                buttonHeight: 86
            )
        case 2:
            let correctCode = need * 10 + rest
            var values: [Int] = []
            for x in 0...small {
                let y = small - x
                guard x <= y else { continue }
                let code = x * 10 + y
                if !values.contains(code) { values.append(code) }
            }
            if !values.contains(correctCode) { values.append(correctCode) }
            values = Array(values.prefix(4))
            return host.makeQuestion(
                correct: correctCode,
                values: values,
                labelFor: { "\($0 / 10)+\($0 % 10)" },
                buttonWidth: 144,
                buttonHeight: 90
            )
        default:
            return host.makeQuestion(
                correct: total,
                values: optionChoices(correct: total, min: 11, max: 19),
                buttonWidth: 120,
                buttonHeight: 86
            )
        }
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            host.playStepAudio(["l2-s2-\(big)"]) {
                showAudioLoaded = true
            }
        case 2:
            showAudioLoaded = true
            host.playStepAudio(["l2-s3-\(small)-\(need)"])
        default:
            showAudioLoaded = true
            let cue = aIsBig
                ? "l2-s4-\(small)-\(need)-\(rest)-\(big)"
                : "l2-s4s-\(a)-\(b)-\(need)-\(rest)-\(big)"
            host.playStepAudio([cue])
        }
    }

    private func anchorBottom(_ centers: [CGPoint], _ frame: CGRect,
                              slot: Int, size: CGFloat) -> CGPoint {
        let geoH = size + 24
        let yOffset = size / 2 - geoH / 2
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: frame.minY + centers[slot].y + yOffset + size * 0.44
        )
    }

    private func sub1Top(_ centers: [CGPoint], _ frame: CGRect,
                         slot: Int, size: CGFloat) -> CGPoint {
        let geoH = size + 24
        let yOffset = size / 2 - geoH / 2
        return CGPoint(
            x: frame.minX + centers[slot].x,
            y: frame.minY + centers[slot].y + yOffset - size * 0.44
        )
    }
}

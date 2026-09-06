//
//  Level5View.swift
//  Panda
//
//  L5 — 二十以内 (teenPlusDigit, a in [11..19], b in [1..9], no carry).
//  Mirrors `scenes/level4.js` from the JS codebase: a 3-row visual
//  stack (anchor / split / bottom) connected by polyline connectors
//  drawn in the elbow shape used by L4 (凑十法). Three teaching beats:
//
//    Step 1 (拆十位)   — kid picks ones (a = 10 + ?). The split row
//                        is deferred until the audio lands. Two
//                        polyline connectors appear between anchor
//                        and split row the moment the split row
//                        reveals, drawing from anchor[0]=a → split[0]
//                        (TEN, yellow) and split[2] (ones, orange).
//    Step 2 (加个位)   — kid picks ones + b. The bottom row
//                        (10 + □ = ?) and its two split→bottom
//                        polylines are deferred until the audio
//                        lands, mirroring the JS comment
//                        "应该在播放完个位相加播放完了之后，再出现".
//                        The two new connectors originate from
//                        split[2]=ones and split[4]=b, both ending
//                        at bottom[2] (the sum).
//    Step 3 (加起来)   — kid picks the total. The bottom row's
//                        slot 2 has already revealed the sum from
//                        step 2's correct pick; the answer slot
//                        stays "□" until the kid picks total. After
//                        a correct pick the round ends and the next
//                        round loads — the reward audio "a 加 b
//                        等于 answer" carries the read-back. Swift's
//                        RoundScaffold has no per-step onAdvance
//                        callback (JS does), so we keep the answer
//                        slot as "□" through the kid's pick on the
//                        LAST step and let the reward audio carry
//                        the reveal. Mirrors the same trade-off L4
//                        (凑十法) and L6 (十几加十几) make.
//
//  Audio cues (l3-* prefix — content originated in JS level3.js, then
//  moved to JS level4.js after the curriculum renumbering):
//    step 1   l3-s1-{a}-{b}        "a 加 b 等于几，我们先把 a 拆成十加几"
//    step 2   l3-s2-{ones}-{b}     "个位相加 [ones] 加 [b] 等于几"
//    step 3   l3-s3-{sum}          "十加 [sum] 等于几"
//    reward   l3-rwd-{a}-{b}-{a+b}
//
//  Per-step visible rows (all rows persistent once introduced):
//
//    anchor (y≈top)  — persistent "a + b = ?" goal equation (always on).
//    split  (y=mid)  — "10 + □ + b = ?"  (the split equation).
//                      Step 1 reveals this row after the audio lands;
//                      the kid's pick fills slot 2 (the ones).
//    bottom (y=low)  — "10 + □ = ?"     (the calc equation).
//                      Step 2 reveals this row after the audio lands;
//                      the kid's pick fills slot 2 (the ones-sum).
//                      The answer slot reveals to total via the reward
//                      audio + next-round transition.
//
//  Polyline connectors (4 lines total when bottom row is visible):
//    L1   anchor[0]=a     → split[0]=10       (YELLOW)
//    L2   anchor[0]=a     → split[2]=ones     (ORANGE)
//    L3   split[2]=ones   → bottom[2]=sum     (ORANGE) — appears step 2
//    L4   split[4]=b      → bottom[2]=sum     (ORANGE) — appears step 2
//
//  Reserves pin every slot's width to its widest lifetime content so
//  the polyline endpoints don't drift as boxes reveal into digits.
//  Same pattern as JS expression.js's `reserve` arrays.
//

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
                            a: a, b: b,
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
                // JS L5 (二十以内) reads back "{a} 加 {b} 等于 {answer}"
                // using l3-rwd-* cues. Chain off the cheer so the
                // reward doesn't cut off the celebration tail.
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

// MARK: - L5 step layout (二十以内)
//
// Swift L5 mirrors the JS level4.js layout — a 3-row visual stack:
//
//   anchor   — persistent "a + b = ?" goal equation (always on).
//   split    — "10 + □ + b = ?" (the split equation). Step 1 reveals
//              this row after the audio lands; the kid's pick fills
//              slot 2 (the ones).
//   bottom   — "10 + □ = ?" (the calc equation). Step 2 reveals this
//              row after the audio lands; the kid's pick fills slot 2
//              (the ones-sum).
//
// Polyline connectors — all four drawn as 3-segment elbow polylines:
//
//   anchor → split  (2 lines, drawn on step 1 intro)
//     L1: anchor[0]=a      → split[0]=10   (YELLOW)
//     L2: anchor[0]=a      → split[2]=ones (ORANGE)
//
//   split → bottom   (2 lines, drawn on step 2 intro)
//     L3: split[2]=ones    → bottom[2]=sum (ORANGE)
//     L4: split[4]=b       → bottom[2]=sum (ORANGE)
//
// Reserves pin every slot's width to its widest lifetime content so
// the polyline endpoints don't drift as boxes reveal into digits.
// This is the same pattern the JS uses (the JS calls these `reserve`
// arrays in expression.js).
//
// The audio chain follows the JS `fireL3StepAudio` helper: on entry
// / round 0 step 1 the cue plays immediately; on subsequent steps
// the cue chains off the celebration tail (`host.playStepAudio`
// handles the chaining). The split row and bottom row both use the
// `playStepAudio(onComplete:)` callback to defer their render until
// the audio lands — mirrors the JS `deferEquation: true` + audio
// `onComplete` pair.

struct TwentyWithinStepView: View {
    let a: Int
    let b: Int
    let ones: Int
    let smallSum: Int
    let total: Int
    let step: Int
    let host: RoundHost

    private let coordSpace = "TwentyWithinStepView.root"

    // Row sizes — anchor is the largest (persistent goal), the two
    // sub-rows are smaller so the eye reads the persistent anchor as
    // the spatial reference. Sizes mirror the JS layout (size=80 for
    // anchor at y=240, size=56 for split rows, size=60 for combine
    // rows) but scaled for the Swift canvas.
    private let anchorSize: CGFloat = 72
    private let splitSize: CGFloat = 56
    private let bottomSize: CGFloat = 56

    // Inter-row gaps — each gap is small enough to keep the stack
    // tight, but big enough for the polyline connectors to bend
    // cleanly without crowding the digits.
    private let gapAnchorSplit: CGFloat = 28
    private let gapSplitBottom: CGFloat = 22

    // Per-row frames + slot centres (used for the polyline endpoints).
    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var splitRowFrame: CGRect = .zero
    @State private var splitSlotCenters: [CGPoint] = []
    @State private var bottomRowFrame: CGRect = .zero
    @State private var bottomSlotCenters: [CGPoint] = []

    // Step-1 deferred reveal: the split row is rendered only AFTER
    // the step-1 audio (`l3-s1-{a}-{b}`) finishes. Mirrors the JS
    // `deferEquation: true` + `fireStep1` callback pair.
    @State private var showSplitRow = false

    // Step-2 deferred reveal: the bottom row is rendered only AFTER
    // the step-2 audio (`l3-s2-{ones}-{b}`) finishes. Mirrors the JS
    // comment "应该在播放完个位相加播放完了之后，再出现".
    @State private var showBottomRow = false

    // Slot factories ----------------------------------------------------

    // Anchor: a + b = "□". Coloured to match the addends (a in blue,
    // b in pink — matches JS COL_BIG / COL_SMALL). Slot 4 is reserved
    // to `total` (always 2 digits in this pool) so the reveal doesn't
    // reflow the row.
    //
    // We use "□" (the hollow box glyph) per user feedback — the box
    // shape is the visual cue for "unknown", not a "?" mark.
    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("□", color: PandaTheme.ink),
        ]
    }

    // Split: "10 + □ + b = □". Slot 0 is TEN (yellow), slot 2 is the
    // ones slot (orange while pending). Slot 4 is round.b (pink).
    // Slot 6 is the answer (orange while pending, ink once filled).
    //
    // Both boxes use "□" (hollow box glyph) per user feedback — the
    // box shape is the visual cue for "unknown", not a "?" mark.
    private var splitSlots: (_ onesDigit: String, _ answer: String) -> [MathSlot] {
        { onesDigit, answer in
            [
                .number(10, color: PandaTheme.yellow),
                .op(.plus),
                .numberOrBox(onesDigit, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
                .op(.plus),
                .number(b, color: PandaTheme.numPink),
                .op(.equals),
                .answerBox(answer, color: answer == "□" ? PandaTheme.orange : PandaTheme.ink),
            ]
        }
    }

    // Bottom: "10 + □ = □". Slot 0 is TEN (yellow), slot 2 is the
    // ones-sum slot (orange while pending), slot 4 is the answer.
    private var bottomSlots: (_ mid: String, _ right: String) -> [MathSlot] {
        { mid, right in
            [
                .number(10, color: PandaTheme.yellow),
                .op(.plus),
                .numberOrBox(mid, numColor: PandaTheme.orange, boxColor: PandaTheme.orange),
                .op(.equals),
                .answerBox(right, color: right == "□" ? PandaTheme.orange : PandaTheme.ink),
            ]
        }
    }

    // Step dispatchers ---------------------------------------------------

    // Per-step split-row slots. Step 1 reveals a fully-blank row
    // (no ones yet, no answer); step 2 shows the picked ones; step 3
    // shows the picked ones — the answer slot stays "□" because the
    // kid hasn't picked total yet. Swift's RoundScaffold has no
    // `onAdvance` callback for a post-pick reveal, so the answer
    // slot remains "□" through step 3; once the kid picks the
    // correct total the round ends and the reward audio
    // "a 加 b 等于 total" carries the read-back.
    private var currentSplitSlots: [MathSlot] {
        switch step {
        case 1:
            // Pre-pick: ones box blank. The polyline connectors fire
            // as soon as the row is rendered (the audio callback in
            // onAppear shows the row); the connector endpoints land
            // on the answer box, which is the visual contract of
            // "this box will be filled by the polyline".
            return splitSlots("□", "□")
        case 2:
            // Post-pick: ones slot revealed; answer still pending.
            return splitSlots("\(ones)", "□")
        default:
            // Step 3: ones revealed, answer still "□" (kid hasn't
            // picked total yet).
            return splitSlots("\(ones)", "□")
        }
    }

    private var currentBottomSlots: [MathSlot] {
        switch step {
        case 1:
            // Step 1 — bottom row hidden entirely (deferred to step 2).
            return bottomSlots("□", "□")
        case 2:
            // Step 2 — bottom row visible; ones-sum still pending.
            return bottomSlots("□", "□")
        default:
            // Step 3: ones-sum revealed; answer still "□" (kid hasn't
            // picked total yet).
            return bottomSlots("\(smallSum)", "□")
        }
    }

    // Polyline endpoints -------------------------------------------------

    /// L1 + L2: anchor[0]=a → split[0]=10 (YELLOW),
    /// anchor[0]=a → split[2]=ones (ORANGE). Symmetric V — anchor.a
    /// branches into TEN + ones.
    ///
    /// Returns nil until the split row has rendered (so partial
    /// layout during `onAppear` doesn't draw stray zero-length
    /// connectors).
    private var anchorSplitV: (source: CGPoint, destA: CGPoint, destB: CGPoint)? {
        guard showSplitRow,
              anchorSlotCenters.count > 0,
              splitSlotCenters.count > 2 else { return nil }
        let anchorBottom = bottomOf(anchorSlotCenters, anchorRowFrame,
                                   slot: 0, size: anchorSize)
        // split[0] is the literal "10" (numeric slot); split[2] is the
        // ones box (answerBox slot). Both destinations share the same
        // y (they're in the same row) so use the same top-edge helper.
        let splitZeroTop = topOf(splitSlotCenters, splitRowFrame,
                                slot: 0, size: splitSize, halfRatio: 0.5)
        let splitTwoTop = topOf(splitSlotCenters, splitRowFrame,
                                slot: 2, size: splitSize, halfRatio: 0.45)
        // Order: left dest → colorA (yellow), right dest → colorB (orange).
        if splitZeroTop.x <= splitTwoTop.x {
            return (anchorBottom, splitZeroTop, splitTwoTop)
        } else {
            return (anchorBottom, splitTwoTop, splitZeroTop)
        }
    }

    /// L3 + L4: split[2]=ones → bottom[2]=sum (ORANGE),
    /// split[4]=b → bottom[2]=sum (ORANGE). Two-source → single-
    /// destination — drawn as two independent elbow polyline segments
    /// (PolylineConnectors), NOT a SymmetricVDiagram (which is
    /// 1-source → 2-destination). Returns nil until the bottom row
    /// has rendered so partial layout doesn't draw stray connectors.
    private var splitBottomSegments: [PolylineConnectors.Segment] {
        guard showBottomRow,
              splitSlotCenters.count > 4,
              bottomSlotCenters.count > 2 else { return [] }
        let bottomTwoTop = topOf(bottomSlotCenters, bottomRowFrame,
                                 slot: 2, size: bottomSize, halfRatio: 0.45)
        let splitTwoBottom = bottomOf(splitSlotCenters, splitRowFrame,
                                      slot: 2, size: splitSize)
        let splitFourBottom = bottomOf(splitSlotCenters, splitRowFrame,
                                       slot: 4, size: splitSize)
        let orangeColor = Color(PandaTheme.orange)
        return [
            PolylineConnectors.Segment(
                from: splitTwoBottom, to: bottomTwoTop,
                color: orangeColor, thickness: 7, opacity: 0.75,
                style: .elbow
            ),
            PolylineConnectors.Segment(
                from: splitFourBottom, to: bottomTwoTop,
                color: orangeColor, thickness: 7, opacity: 0.75,
                style: .elbow
            ),
        ]
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
    // Answer-box slots use 0.45 × size as the half-height (the
    // visible outline height); numeric slots use 0.5 × size for
    // the digit half-height.
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
                // Row 1 — anchor (persistent goal). Captured via
                // MathExpressionWithSlots so the .overlay below can
                // compute polyline endpoints from its slot centres.
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

                // Row 2 — split row. Hidden on step 1's first render
                // until the audio lands (so the kid hears the
                // strategy before seeing the question). On step 2/3
                // it stays visible.
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

                if showBottomRow {
                    Spacer().frame(height: gapSplitBottom)

                    // Row 3 — bottom row. Hidden on step 1/2's first
                    // render until the step-2 audio lands.
                    MathExpressionWithSlots(
                        slots: currentBottomSlots,
                        size: bottomSize
                    ) { centers in
                        bottomSlotCenters = centers
                    }
                    .frame(height: bottomSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        bottomRowFrame = newFrame
                    }
                }

                Spacer().frame(height: 28)

                // Row 4 — buttons (3-step choices: ones / sum / total).
                // Step 1 uses "10+N" labels (e.g. "10+7"), which need
                // wider buttons than the default 100×80 — bumped to
                // 144×96 so the full label fits without truncation.
                // Steps 2/3 use single-digit / two-digit numeric
                // labels, so the wider buttons still look fine.
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
            // Two arrow groups:
            //   1. Anchor → split V (SymmetricVDiagram — both arms
            //      same total length regardless of destination x).
            //   2. Split → bottom lines (PolylineConnectors — two
            //      elbow polylines originating from split[2] and
            //      split[4], both ending at bottom[2]).
            //
            // The split → bottom group draws only once the bottom row
            // has rendered; the anchor → split V draws only once the
            // split row has rendered. Each guard prevents stray
            // zero-length connectors during the partial layouts of
            // step-1 audio deferral.
            ZStack {
                if let v = anchorSplitV {
                    SymmetricVDiagram(
                        source: v.source,
                        destA: v.destA,
                        destB: v.destB,
                        colorA: Color(PandaTheme.yellow),
                        colorB: Color(PandaTheme.orange)
                    )
                }
                let segments = splitBottomSegments
                if !segments.isEmpty {
                    PolylineConnectors(segments: segments)
                }
            }
        }
        .onAppear {
            fireAudioForCurrentStep()
        }
        .onChange(of: step) { _, newStep in
            // When the step counter advances (post-pick), reveal the
            // next row in the diagram at the same moment the audio
            // for the NEW step fires. Step 1→2: reveal split row.
            // Step 2→3: reveal bottom row. Step 3: nothing extra.
            //
            // Note: the RoundScaffold calls `stepBuilder` fresh on
            // each step transition (the `.id("\(round)-step)"` on
            // the body forces a re-render), so onAppear fires again
            // for each step and we don't need to fire audio from
            // here. The split/bottom row reveals are owned by
            // onAppear below.
            _ = newStep
        }
    }

    // MARK: Step dispatchers for question + audio

    private var correctForStep: Int {
        switch step {
        case 1: return ones
        case 2: return smallSum
        default: return total
        }
    }

    private var rangeForStep: (min: Int, max: Int) {
        switch step {
        case 1: return (1, 8)
        case 2: return (1, 9)
        default: return (11, 20)
        }
    }

    // Step-1 buttons display as "10+N" (e.g. "10+7", "10+8") per the
    // JS `decompositionOptions` helper — reinforces the "ten plus
    // what" frame of the 拆十位 prompt. Steps 2 and 3 use plain
    // digits.
    private var labelForStep: (Int) -> String {
        switch step {
        case 1:
            return { v in "10+\(v)" }
        default:
            return { v in "\(v)" }
        }
    }

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            // Reveal the split row right when the prompt lands.
            host.playStepAudio(["l3-s1-\(a)-\(b)"]) {
                self.showSplitRow = true
            }
        case 2:
            // Keep split row visible (it was revealed at the end of
            // step 1). Reveal the bottom row when the prompt lands.
            self.showSplitRow = true
            host.playStepAudio(["l3-s2-\(ones)-\(b)"]) {
                self.showBottomRow = true
            }
        default:
            // Step 3 — both rows already visible from the previous
            // step. Fire the prompt directly.
            self.showSplitRow = true
            self.showBottomRow = true
            host.playStepAudio(["l3-s3-\(smallSum)"])
        }
    }
}
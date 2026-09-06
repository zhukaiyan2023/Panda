//
//  Level2View.swift
//  Panda
//
//  L2 — 三数相加 (threeSum, a + b + c ≤ 10). Two teaching beats:
//    Step 1 (两两相加)        — kid picks a + b
//    Step 2 (加上第三个数)    — kid picks a + b + c
//
//  Renders a custom 4-row visual stack (cells / anchor / preview /
//  pair-eq / buttons) with V-shaped merge arrows from the anchor's
//  first two addends down to the preview's merge box. The arrows
//  visually tell the kid "combine these two to start with".
//
//  Audio cues (l1-* prefix — content originated in JS level1.js):
//    phase 1   l1-intro-{a}-{b}-{c}    "a 加 b 加 c 等于几…"
//    phase 2   l1-sub-{a}-{b}          "a 加 b 等于几"
//    step 2    l1-step2-{pairSum}-{c}  "pairSum 加 c 等于几"
//    reward    l1-rwd-{a}-{b}-{c}-{total}
//

import SwiftUI

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

                if step == 1 {
                    // JS L1 (Swift L2) fires a phase-1 setup cue
                    // ("先看下 a 加 b 加 c 等于几, 这个问题可以分解成...")
                    // followed by a phase-2 question cue ("a 加 b 等于几").
                    // Both cues live under the l1-* prefix because the
                    // 三数相加 content originated in JS level1.js.
                    host.playStepAudio(["l1-intro-\(a)-\(b)-\(c)",
                                          "l1-sub-\(a)-\(b)"])
                    let question = host.makeQuestion(
                        correct: pairSum,
                        values: optionChoices(correct: pairSum, min: 2, max: 9))
                    return StepRender(
                        equation: AnyView(
                            ThreeSumStepView(
                                a: a, b: b, c: c,
                                pairSum: pairSum, total: total,
                                step: 1,
                                question: question
                            )
                        )
                    )
                } else {
                    // JS L1 step 2 reads the simplified form
                    // "pairSum 加 third 等于几" — same as L3's
                    // mirrored l1-step2-* cue (the cue-id naming
                    // reflects which side of the equation the
                    // "10"/pairSum lives on, but L2 reads "pairSum
                    // + third" with pairSum on the left, so use the
                    // same mirrored cue id L3 picks for that case).
                    host.playStepAudio(["l1-step2-\(pairSum)-\(c)"])
                    let question = host.makeQuestion(
                        correct: total,
                        values: optionChoices(correct: total, min: 3, max: 10))
                    return StepRender(
                        equation: AnyView(
                            ThreeSumStepView(
                                a: a, b: b, c: c,
                                pairSum: pairSum, total: total,
                                step: 2,
                                question: question
                            )
                        )
                    )
                }
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .threeSum(let a, let b, let c) = round else { return }
                let total = a + b + c
                // JS L1 chains the reward via playAfter — same here
                // so the read-back doesn't cut off the cheer tail.
                let cue = "l1-rwd-\(a)-\(b)-\(c)-\(total)"
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

// MARK: - L2 step layout (三数相加)
//
// Swift L2 mirrors the JS level1.js layout — a 3-row visual stack:
//
//   cells (boxes with colored dots)
//   anchor:  "a + b + c = □"           — persistent goal, top of stack
//   preview: "□ + c = □"  (step 1)     — simplified form below anchor
//            "pairSum + c = □" (step 2)  with the merge box revealed
//   pair-eq: "a + b = □"                — only on step 1 (JS removes it
//                                          on step 2 per user feedback)
//   buttons: 4 choices
//
// Two merge arrows connect the anchor's first two addends (slot 0 = a,
// slot 2 = b) DOWN to the preview's first box (slot 0), converging in
// a V-shape at the merge box. Arrow color follows each addend's color
// so the eye traces each number back to its arrow arm.

struct ThreeSumStepView: View {
    let a: Int
    let b: Int
    let c: Int
    let pairSum: Int
    let total: Int
    let step: Int
    let question: AnyView

    // Coordinate-space name used to translate each row's frame into the
    // outer ZStack's space. We capture per-row frames with
    // `.background(GeometryReader { ... })` so the merge arrows can be
    // drawn in the right place regardless of VStack layout shifts.
    private let coordSpace = "ThreeSumStepView.root"

    // Sizes (kept as plain lets so they're cheap to read in body).
    private let anchorSize: CGFloat = 88
    private let previewSize: CGFloat = 80
    private let pairSize: CGFloat = 80

    // Captured positions of the anchor and preview rows in the coordSpace.
    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var previewRowFrame: CGRect = .zero
    @State private var previewSlotCenters: [CGPoint] = []

    /// Visual offset applied to the preview row (step 1 only) so
    /// the merge box (slot 0 of `□ + c = □`) lands DIRECTLY under
    /// the center of the anchor's pair addends (`1 + 7` in the
    /// example). Without this, the merge box ends up at the
    /// centred preview's leftmost slot position, which is to the
    /// right of the anchor's pair center — the polyline arms
    /// come from "1" and "7" but visibly overshoot to the right.
    /// Computed once the anchor's slot centres are captured
    /// (second render). Step 2 returns 0 — the preview's slot 0
    /// is the already-revealed pairSum, no merge box to align.
    ///
    /// Sign convention: POSITIVE = shift preview LEFT (use
    /// `.offset(x: -previewRowOffset)` shifts the preview LEFT
    /// by `previewRowOffset` px when the value is positive (the
    /// typical case — preview slot 0 sits to the right of the
    /// anchor's pair centre).
    private var previewRowOffset: CGFloat {
        // Locked between step 1 and step 2 (per user feedback
        // "第一步和第二步，这个要固定"). Only slot 0's CONTENT
        // changes between steps (□ in step 1, pairSum in step 2);
        // the slot 0 POSITION is constant because the preview is
        // centred around cx = W/2 and the remaining-slot width
        // after slot 0 is constant (256 pt in H = 802 — the
        // "+ 2 = □" tail doesn't change between steps).
        guard anchorSlotCenters.count > 2, previewSlotCenters.count > 0 else { return 0 }
        return previewSlotCenters[0].x - anchorSlotCenters[1].x
    }

    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numYellow),
            .op(.plus),
            .number(c, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("□", color: PandaTheme.ink),
        ]
    }

    private var previewSlots: [MathSlot] {
        if step == 1 {
            // Unrevealed — merge box still `□`.
            return [
                .answerBox("□", color: PandaTheme.orange),
                .op(.plus),
                .number(c, color: PandaTheme.numPink),
                .op(.equals),
                .answerBox("□", color: PandaTheme.ink),
            ]
        } else {
            // Step 2 — merge box revealed to pair sum (orange), per JS.
            return [
                .number(pairSum, color: PandaTheme.orange),
                .op(.plus),
                .number(c, color: PandaTheme.numPink),
                .op(.equals),
                .answerBox("□", color: PandaTheme.ink),
            ]
        }
    }

    private var pairSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numYellow),
            .op(.equals),
            .answerBox("□", color: PandaTheme.ink),
        ]
    }

    var body: some View {
        // Vertical layout strategy:
        //
        // We nest two VStacks:
        //   * Outer VStack: top Spacer + content + bottom Spacer.
        //     This centers the content vertically inside whatever
        //     height the StepRender offers.
        //   * Inner VStack: the actual L2 rows with fixed Spacers
        //     between sections so the spacing is reproducible across
        //     screen sizes.
        //
        // Inter-row gaps (inside the inner VStack):
        //   cells → anchor    : 12 px  (cells sit close to anchor)
        //   anchor → preview  : 61 px  (extra room so the polyline
        //                                merge arrows feel deliberate
        //                                rather than crammed)
        //   preview → pair    : 32 px  (visually separate the hint
        //                                equation from the question)
        //   pair → question   : 36 px  (push the buttons clearly below
        //                                the question row)
        //
        // Row heights (kept compact so the whole stack fits without
        // scrolling on an 11-inch iPad in portrait):
        //   cells row         ~38 px tall
        //   anchor row        anchorSize + 24 = 112 px
        //   preview row       previewSize + 24 = 104 px
        //   pair-eq row (s1)  pairSize + 24 = 104 px
        //   question row      ~120 px tall
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                // Row 1 — cells (boxes with colored dots, 3 groups).
                ThreeAddendBeads(
                    a: a, b: b, c: c,
                    highlightFirst: step == 1
                )

                Spacer().frame(height: 12)

                // Row 2 — anchor (persistent goal equation). We use
                // MathExpressionWithSlots so the per-slot centres are
                // captured for the merge arrows below. The row's own
                // `.frame(height: anchorSize + 24)` is the ONLY
                // height constraint — we deliberately avoid putting a
                // GeometryReader in `.background(...)` because
                // GeometryReader is greedy and would inflate the row
                // to the VStack's full height, blowing up the spacing
                // between rows.
                //
                // Instead we read the row's own `.coordinateSpace`-
                // relative frame via `onGeometryChange` (iOS 18+),
                // which reads the current frame without claiming any
                // layout space.
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

                Spacer().frame(height: 61)

                // Row 3 — preview (simplified form, with merge arrows).
                // We apply `.offset(x: -previewRowOffset)` to shift the
                // preview LEFT so the merge box (slot 0 of
                // `□ + c = □`) lands directly under the centre of the
                // anchor's pair addends (`1 + 7`). Without this the
                // merge box sits at the centred preview's leftmost
                // position — to the right of the pair centre — and
                // the polyline arms visibly overshoot. `previewRowOffset`
                // is computed once the anchor's slot centres are
                // captured (0 on step 2 — the preview's slot 0 is
                // already the revealed pair sum, no merge box to align).
                MathExpressionWithSlots(
                    slots: previewSlots,
                    size: previewSize
                ) { centers in
                    previewSlotCenters = centers
                }
                .frame(height: previewSize + 24)
                .offset(x: -previewRowOffset)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { newFrame in
                    previewRowFrame = newFrame
                }

                if step == 1 {
                    Spacer().frame(height: 32)

                    // Row 4 — pair-sum equation, step 1 only.
                    // (JS removes it on step 2 per user feedback
                    // 2026-08-11 — the kid has already internalised the
                    // pair sum by then, and the simplified preview
                    // becomes the sole active equation.)
                    MathExpression(slots: pairSlots, size: pairSize)
                        .frame(height: pairSize + 24)
                }

                Spacer().frame(height: 36)

                // Row 5 — buttons (4 choices). The host supplies the
                // QuestionConfig already wired with its own onPick
                // handler — we just embed it so the buttons advance
                // the round the same way other levels do.
                question
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            // Merge arrows — drawn on top of the VStack so the V
            // arrowhead at the merge box sits above the preview's
            // first □. Lines run from the anchor's first two addends
            // DOWN to the merge box's TOP edge.
            //
            // MathExpressionWithSlots reports slot centres at
            // `geo.size.height / 2` (the middle of the GeometryReader
            // that fills the row's frame), NOT the actual slot
            // position inside the row. For a `.number` slot, the slot
            // is rendered at y = `size / 2` (top-aligned within the
            // row), so we adjust by `size / 2 - geoHeight / 2` to
            // land on the real slot centre. For `.answerBox` slots,
            // same offset — they're also positioned at `size / 2`.
            if anchorSlotCenters.count > 2 && previewSlotCenters.count > 0 {
                let anchorSlotHeight = anchorSize
                let previewBoxHeight = previewSize * 0.9
                let anchorGeoHeight = anchorSize + 24
                let previewGeoHeight = previewSize + 24
                // Offset from the reported centre (geoHeight/2) to
                // the actual slot centre (size/2).
                let anchorYOffset = anchorSize / 2 - anchorGeoHeight / 2
                let previewYOffset = previewSize / 2 - previewGeoHeight / 2
                // Anchor slots are NUMBER slots — vertically centred at
                // `size / 2`. BOTTOM edge = centre + size/2.
                let anchorA = CGPoint(
                    x: anchorRowFrame.minX + anchorSlotCenters[0].x,
                    y: anchorRowFrame.minY + anchorSlotCenters[0].y + anchorYOffset + anchorSlotHeight / 2
                )
                let anchorB = CGPoint(
                    x: anchorRowFrame.minX + anchorSlotCenters[2].x,
                    y: anchorRowFrame.minY + anchorSlotCenters[2].y + anchorYOffset + anchorSlotHeight / 2
                )
                // Preview's merge box is an ANSWERBOX — height is
                // `size * 0.9`. TOP edge = centre - size*0.45. The
                // visual x subtracts `previewRowOffset` because the
                // preview is drawn with `.offset(x: -previewRowOffset)`
                // (the layout frame captured here is the unshifted
                // one — `.offset` is a visual transform, not a layout
                // one). We could also reach the same point via
                // `anchorRowFrame.minX + anchorSlotCenters[1].x`
                // (anchor's pair centre), which is mathematically the
                // same after the offset algebra.
                let mergeBox = CGPoint(
                    x: previewRowFrame.minX + previewSlotCenters[0].x - previewRowOffset,
                    y: previewRowFrame.minY + previewSlotCenters[0].y + previewYOffset - previewBoxHeight / 2
                )
                L1MergeLines(
                    anchorTop: anchorA,
                    anchorMid: anchorB,
                    mergeBox: mergeBox,
                    colorA: Color(PandaTheme.numBlue),
                    colorB: Color(PandaTheme.numYellow)
                )
                .allowsHitTesting(false)
            }
        }
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
            // Per user feedback "应该只保留□一个" — each dot is now a
            // single solid filled circle, no dark stroke overlay.
            // Previously each dot stacked a colored fill on top of a
            // dark stroke which read as "a circle inside a circle".
            // The opacity still drops non-highlighted groups to 0.4
            // so the kid can still tell which addends the current
            // step is focusing on.
            ForEach(0..<a, id: \.self) { _ in
                Circle()
                    .fill(Color(PandaTheme.numBlue).opacity(highlightFirst ? 1.0 : 0.4))
                    .frame(width: 22, height: 22)
            }
            ForEach(0..<b, id: \.self) { _ in
                Circle()
                    .fill(Color(PandaTheme.numYellow).opacity(highlightFirst ? 1.0 : 0.4))
                    .frame(width: 22, height: 22)
            }
            ForEach(0..<c, id: \.self) { _ in
                Circle()
                    .fill(Color(PandaTheme.numPink).opacity(highlightFirst ? 0.4 : 1.0))
                    .frame(width: 22, height: 22)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

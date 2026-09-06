//
//  Level4View.swift
//  Panda
//
//  L4 — 凑十法 (makeTen, a + b > 10 AND a ≥ b). Three teaching beats,
//  mirroring `scenes/level3.js` from the JS codebase but with the
//  "比一比" compare step dropped per user feedback (the JS file is
//  named `level3.js` for historical audio cue compatibility — its
//  levelId is 4 in the new curriculum, and the content is 凑十法):
//
//    Step 1 (凑成十)   — kid picks the "friend" (need) of the bigger
//                         addend via a "10 + ?" decomposition prompt.
//                         Sub1 = split equation, sub2 = friend equation
//                         ("big + □ = 10"). Three decomposition
//                         arrows connect anchor → sub1.
//    Step 2 (拆一拆)   — kid picks the rest (small − friend). Sub1
//                         now reveals the friend, sub2 changes from
//                         "big + friend = 10" to "friend + □ = small".
//                         The three decomposition arrows persist.
//    Step 3 (算一算)   — kid picks the total. Sub1 reveals the rest,
//                         sub2 disappears. Decomposition arrows still
//                         visible per user feedback "拆一拆这一步时，
//                         拆分的线不要消失。算一算的时候也要保留."
//
//  Audio cues (l2-* prefix — content originated in JS level2.js):
//    step 1   l2-s2-{big}                 "大数是 big，我们找找 big 的好朋友…"
//    step 2   l2-s3-{small}-{need}        "small 能分成 need 和几？"
//    step 3   l2-s4-{small}-{need}-{rest}-{big}
//                                          "small 分成 need 加 rest，算一算 big 加 need 加 rest 等于几"
//            l2-s4s-{a}-{b}-{need}-{rest}-{big}   (aIsSmall swap variant: "rest + need + big")
//    reward   l2-rwd-{a}-{b}-{a+b}
//
//  The compare step ("比一比", `l2-s1-*` / `l2-cmp-*`) from the JS was
//  removed per user feedback — kids struggle with picking >/< when
//  they're already trying to focus on the make-a-ten strategy. The
//  pool already enforces `a >= b`, so the level always knows which
//  addend is bigger without a compare beat.
//

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
                let aIsBig = a >= b
                let aIsSmall = !aIsBig

                return StepRender(
                    equation: AnyView(
                        Level4StepView(
                            a: a, b: b,
                            big: big, small: small,
                            need: need, rest: rest, total: total,
                            aIsBig: aIsBig, aIsSmall: aIsSmall,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .makeTen(let a, let b) = round else { return }
                // JS L4 chains the reward via playAfter — same here
                // so the read-back doesn't cut off the celebration tail.
                let cue = "l2-rwd-\(a)-\(b)-\(a+b)"
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

// MARK: - L4 step layout (凑十法)
//
// Swift L4 mirrors the JS level3.js layout — a 4-row visual stack:
//
//   cells    — two ten-frames side by side, round.a on the LEFT and
//              round.b on the RIGHT (so the left-to-right order
//              matches the anchor equation). Per user feedback
//              2026-08-11 the cell count labels are removed (the
//              equations below already name each addend in color).
//   anchor   — persistent "a + b = ?" goal, large font. Stays at the
//              top across all three beats.
//   sub1     — step-specific split / calc equation. The decomposition
//              arrows connect anchor → sub1 across all 3 steps.
//              Step 1: "big + □ + □ = □"
//              Step 2: "big + friend + □ = □"
//              Step 3: "big + friend + rest = □"
//   sub2     — step-specific friend / sub-split equation.
//              Step 1: "big + □ = 10"
//              Step 2: "friend + □ = small"
//              Step 3: hidden (the kid has confirmed the split and
//                       is ready to count up).
//   buttons  — 4 choices. Step 1: the friend (need). Step 2: the rest.
//              Step 3: the total.
//
// Three decomposition arrows (anchor → sub1) persist across all 3
// steps — the user explicitly wanted them visible through "算一算"
// (per the JS comment block at the top of this file). We render
// each row independently with `MathExpressionWithSlots` (so the
// anchor isn't double-drawn like with `PolylineDecompositionView`)
// and draw the three polylines ourselves in an overlay using the
// same stem→arm→tip pattern L7/L8 use.

struct Level4StepView: View {
    let a: Int
    let b: Int
    let big: Int
    let small: Int
    let need: Int
    let rest: Int
    let total: Int
    let aIsBig: Bool
    let aIsSmall: Bool
    let step: Int
    let host: RoundHost

    // Row sizes — anchor is the largest (persistent goal), subs are
    // smaller so the eye reads the persistent anchor as the spatial
    // reference. Sizes mirror the JS layout (y=420 size=90 for
    // anchor, y=560 size=82 for sub1, y=720 size=60 for sub2).
    private let cellSize: CGFloat = 42
    private let anchorSize: CGFloat = 90
    private let sub1Size: CGFloat = 82
    private let sub2Size: CGFloat = 60

    // Captured row frames + slot centers (used for the sub-question
    // audio gates and for any custom layout logic in the overlay).
    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var sub1RowFrame: CGRect = .zero
    @State private var sub1SlotCenters: [CGPoint] = []

    // Coordinate-space name for the overlay's polyline frame
    // translations — `MathExpressionWithSlots` reports slot centres
    // relative to its own GeometryReader; we need to translate those
    // into the StepRender's overlay frame via this named space.
    private let coordSpace = "Level4StepView.root"

    // MARK: Slot factories

    /// Anchor: a + b = "?". Coloured to match the addends' positions.
    /// `reserve` pins slot 4 to `total`'s width (2 digits) so the
    /// reveal in step 4's onAdvance doesn't reflow the row.
    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numYellow),
            .op(.equals),
            .answerBox("?", color: PandaTheme.ink),
        ]
    }

    /// Anchor with the answer revealed — used in step 4's onAdvance.
    private var anchorRevealSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numYellow),
            .op(.equals),
            .number(total, color: PandaTheme.ink),
        ]
    }

    /// Step 1 compare sub-question: REMOVED. The 比一比 beat was
    /// dropped from the Swift L4 per user feedback — kids struggled
    /// with picking >/< when the make-a-ten strategy was the focus.
    /// The pool already filters to a >= b, so the level always knows
    /// which addend is bigger without a compare beat.

    /// Step 2 sub1: "big + □ + □ = □". Two layouts:
    ///   aIsBig   "big + □ + □ = □"  (big=0, need=2, rest=4)
    ///   aIsSmall "□ + □ + big = □"  (rest=0, need=2, big=4)
    /// Per JS comment: "当第一个数时小数时，如：4+7=？ 下面拆分成了？+？+
    /// 4=？，应该是？+？+7=？. 选中好朋友时，应该填充在中间。" — when a is
    /// small, the big literal goes at the end (index 4) so the friend
    /// fills the middle (index 2) and the math reads naturally.
    private var sub1SlotsStep1: [MathSlot] {
        // reserve pins slot 0/2 to "10" so the "? + ?" reveal to
        // 1-digit digits (need/rest) doesn't reflow the row.
        let sub1Reserve: [String?] = aIsSmall
            ? ["10", nil, "10", nil, nil, nil, "\(total)"]
            : [nil, nil, "10", nil, "10", nil, "\(total)"]
        _ = sub1Reserve  // (reserved for future use)
        if aIsBig {
            return [
                .number(big, color: PandaTheme.numBlue),
                .op(.plus),
                .answerBox("?", color: PandaTheme.orange),
                .op(.plus),
                .answerBox("?", color: PandaTheme.purple),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        } else {
            return [
                .answerBox("?", color: PandaTheme.purple),
                .op(.plus),
                .answerBox("?", color: PandaTheme.orange),
                .op(.plus),
                .number(big, color: PandaTheme.numBlue),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        }
    }

    /// Step 1 sub1 reveal (after correct pick): friend revealed.
    private func sub1RevealSlotsStep1() -> [MathSlot] {
        if aIsBig {
            return [
                .number(big, color: PandaTheme.numBlue),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .answerBox("?", color: PandaTheme.purple),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        } else {
            return [
                .answerBox("?", color: PandaTheme.purple),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(big, color: PandaTheme.numBlue),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        }
    }

    /// Step 3 sub1: "big + friend + □ = □" — friend revealed, rest
    /// still unknown.
    private var sub1SlotsStep2: [MathSlot] {
        if aIsBig {
            return [
                .number(big, color: PandaTheme.numBlue),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .answerBox("?", color: PandaTheme.purple),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        } else {
            return [
                .answerBox("?", color: PandaTheme.purple),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(big, color: PandaTheme.numBlue),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        }
    }

    /// Step 2 sub1 reveal (after correct pick): rest revealed.
    private func sub1RevealSlotsStep2() -> [MathSlot] {
        if aIsBig {
            return [
                .number(big, color: PandaTheme.numBlue),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(rest, color: PandaTheme.purple),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        } else {
            return [
                .number(rest, color: PandaTheme.purple),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(big, color: PandaTheme.numBlue),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        }
    }

    /// Step 4 sub1: "big + friend + rest = □" — fully revealed except
    /// the answer slot.
    private var sub1SlotsStep3: [MathSlot] {
        if aIsBig {
            return [
                .number(big, color: PandaTheme.numBlue),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(rest, color: PandaTheme.purple),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        } else {
            // aIsSmall: use the swap variant layout ("rest + need + big")
            // so the visual matches the JS swap step 4 — the kid's
            // eyes can read it as "the same math I just split", not a
            // reorder of the digits.
            return [
                .number(rest, color: PandaTheme.purple),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(big, color: PandaTheme.numBlue),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
        }
    }

    /// Step 3 sub1 reveal — answer slot reveals to total.
    private func sub1RevealSlotsStep3() -> [MathSlot] {
        if aIsBig {
            return [
                .number(big, color: PandaTheme.numBlue),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(rest, color: PandaTheme.purple),
                .op(.equals),
                .number(total, color: PandaTheme.ink),
            ]
        } else {
            return [
                .number(rest, color: PandaTheme.purple),
                .op(.plus),
                .number(need, color: PandaTheme.orange),
                .op(.plus),
                .number(big, color: PandaTheme.numBlue),
                .op(.equals),
                .number(total, color: PandaTheme.ink),
            ]
        }
    }

    /// Step 1 sub2: "big + □ = 10". The kid picks the friend (need)
    /// into the □ slot. The literal "10" is rendered in INK (dark
    /// navy) rather than `PandaTheme.yellow` — Swift's yellow
    /// `(245, 196, 68)` is too pale against the cream/paper meadow
    /// background and is barely visible per user feedback. INK matches
    /// the contrast level of the other revealed answers / unknown
    /// boxes in the level.
    private var sub2SlotsStep1: [MathSlot] {
        [
            .number(big, color: PandaTheme.numBlue),
            .op(.plus),
            .answerBox("?", color: PandaTheme.orange),
            .op(.equals),
            .number(10, color: PandaTheme.ink),
        ]
    }

    /// Step 2 sub2: "friend + □ = small". The kid picks the rest.
    private var sub2SlotsStep2: [MathSlot] {
        [
            .number(need, color: PandaTheme.orange),
            .op(.plus),
            .answerBox("?", color: PandaTheme.purple),
            .op(.equals),
            .number(small, color: PandaTheme.numPink),
        ]
    }

    /// Step 2 sub2 reveal — "friend + rest = small".
    private func sub2RevealSlotsStep2() -> [MathSlot] {
        [
            .number(need, color: PandaTheme.orange),
            .op(.plus),
            .number(rest, color: PandaTheme.purple),
            .op(.equals),
            .number(small, color: PandaTheme.numPink),
        ]
    }

    // MARK: Arrow factories

    /// Three decomposition arrows that draw from the anchor (top row)
    /// down to sub1 (bottom row). Two arms originate from anchor's
    /// "small" slot — one to sub1's need (orange), one to sub1's rest
    /// (DELETED: this function used to return three ArrowSpecs
    /// (orange need / purple rest / blue big-stays-whole). The blue
    /// "big stays whole" arrow was removed per user feedback — the big
    /// addend's identity is already obvious from the colored digits.
    /// We keep the helper definition removed entirely since the
    /// remaining two arrows are drawn directly in
    /// `decompositionPolylineOverlay()`.)

    // MARK: Step 1 question (compare) — REMOVED. The 比一比 beat was
    // dropped; step 1 is now the friend (凑成十) beat, dispatched via
    // `stepQuestion()` instead.

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                // Row 1 — two ten-frames side by side, round.a on the
                // LEFT, round.b on the RIGHT (matches the anchor's
                // left-to-right addend order). Cells shrunk from
                // JS's 52 → 42 + smaller gap to keep the row on screen
                // on an 11-inch iPad in portrait.
                HStack(spacing: 40) {
                    TenFrame(value: a, rows: 2, cell: cellSize, gap: 4, showLabel: false)
                    TenFrame(value: b, rows: 2, cell: cellSize, gap: 4, showLabel: false)
                }
                .frame(height: cellSize * 2 + 4 + 8)

                Spacer().frame(height: 28)

                // Row 2 — anchor (persistent goal). Captured via
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

                Spacer().frame(height: 28)

                // Row 3 — sub1 (split / calc equation). All 3 steps
                // now show sub1 (no compare beat); the decomposition
                // arrows connect anchor → sub1 across all steps.
                MathExpressionWithSlots(
                    slots: stepSub1Slots(),
                    size: sub1Size
                ) { centers in
                    sub1SlotCenters = centers
                }
                .frame(height: sub1Size + 24)
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(coordSpace))
                } action: { newFrame in
                    sub1RowFrame = newFrame
                }

                // Row 4 — sub2 (friend / sub-split equation) for
                // steps 1 and 2 only. Step 3 hides it (the kid has
                // confirmed the split and is ready to count up).
                if step == 1 || step == 2 {
                    Spacer().frame(height: 22)
                    MathExpression(slots: stepSub2Slots(), size: sub2Size)
                        .frame(height: sub2Size + 24)
                }

                Spacer().frame(height: 30)

                // Row 5 — buttons (friend / rest / total pick).
                stepQuestion()
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            // All 3 steps show the three decomposition polylines
            // (anchor → sub1). We DON'T reuse `PolylineDecompositionView`
            // here because that component re-renders the top/bottom
            // rows itself, which would duplicate the explicit anchor +
            // sub1 rendering above. Drawing the polylines ourselves in
            // an overlay avoids the double-render and lets the rows
            // sit at clean, predictable y positions.
            if anchorSlotCenters.count > 4,
               sub1SlotCenters.count > 4 {
                decompositionPolylineOverlay()
                    .allowsHitTesting(false)
            }
        }
        .onAppear { fireAudioForCurrentStep() }
    }

    /// Render the three anchor → sub1 decomposition arrows as a 3-
    /// segment polyline (stem → arm → tip). Each arm starts at the
    /// anchor addend's BOTTOM edge and ends just above the
    /// destination sub1 slot's TOP edge.
    private func decompositionPolylineOverlay() -> some View {
        let anchorGeoH = anchorSize + 24
        let sub1GeoH = sub1Size + 24
        // Slot centres are reported at `geoHeight/2`; slot content
        // sits at `size/2`. The offset converts between them so we
        // land on the real slot edges.
        let anchorYOff = anchorSize / 2 - anchorGeoH / 2
        let sub1YOff = sub1Size / 2 - sub1GeoH / 2
        // Anchor slot indices: a=0, +=1, b=2, +=3, ==4, ?=5
        let smallAnchorIdx: Int = aIsBig ? 2 : 0
        // Sub1 slot indices for the split equation
        //   aIsBig   "big + □ + □ = □" → need=2, rest=4
        //   aIsSmall "□ + □ + big = □" → need=2, rest=0
        let needSub1Idx: Int = 2
        let restSub1Idx: Int = aIsBig ? 4 : 0

        // Polyline starts from the slot's CENTER (vertical middle),
        // not the slot's bottom edge. Anchoring at the center lines
        // the polyline up with the middle of the digit/box glyph
        // (digits are vertically centered at y = size / 2 in
        // MathExpressionWithSlots), so the polyline visually appears
        // to "start from" the digit itself rather than from the row's
        // bottom edge. The previous bottom-edge start made the
        // polyline hang below the digit on step 1, which read as
        // the line "leaving" the row rather than splitting out of
        // the digit. The slot's horizontal x is unchanged.
        func anchorSlotCenter(_ slot: Int) -> CGPoint {
            CGPoint(
                x: anchorRowFrame.minX + anchorSlotCenters[slot].x,
                y: anchorRowFrame.minY + anchorSlotCenters[slot].y
                    + anchorYOff
            )
        }
        func sub1Top(_ slot: Int) -> CGPoint {
            // For `.answerBox` slots the top edge is `centre − size*0.45`;
            // for `.number` slots the visual top is roughly at
            // `centre − size/2`. We treat every slot as a 0.9 × size
            // box so the polyline tips land cleanly above the slot
            // — consistent with how L7/L8 + L3 handle this.
            CGPoint(
                x: sub1RowFrame.minX + sub1SlotCenters[slot].x,
                y: sub1RowFrame.minY + sub1SlotCenters[slot].y
                    + sub1YOff - sub1Size * 0.45
            )
        }

        return Canvas { context, _ in
            // Two polylines draw from anchor's "small" addend DOWN to
            // sub1's need (orange) and rest (purple) slots — the "small
            // splits into need + rest" decomposition. 3-segment polyline
            // (stem → arm → tail) with the horizontal bend at
            // `quarterY` (1/4 of the way down from anchor), matching
            // the L1MergeLines shape. The quarterY position (instead of
            // midY) gives the tail (from bend down to the box top)
            // enough length to "point" at the destination slot — with
            // midY the tail was only ~14 px for a 28 px gap, so the
            // line looked like it touched the box border on step 1.
            // The "big stays whole" anchor.big → sub1.big line was
            // intentionally REMOVED per user feedback.
            func drawArm(_ from: CGPoint, _ to: CGPoint, color: Color) {
                let polylineExtent = to.y - from.y
                let quarterY = from.y + polylineExtent / 4
                let stemEnd = CGPoint(x: from.x, y: quarterY)
                let armEnd = CGPoint(x: to.x, y: quarterY)
                var path = Path()
                path.move(to: from)
                path.addLine(to: stemEnd)
                path.addLine(to: armEnd)
                path.addLine(to: to)
                context.stroke(
                    path,
                    with: .color(color.opacity(0.85)),
                    style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round)
                )
            }
            drawArm(anchorSlotCenter(smallAnchorIdx), sub1Top(needSub1Idx),
                    color: Color(PandaTheme.orange))
            drawArm(anchorSlotCenter(smallAnchorIdx), sub1Top(restSub1Idx),
                    color: Color(PandaTheme.purple))
            // (anchor.big → sub1.big blue line intentionally REMOVED —
            // the big addend's identity is already obvious from the
            // colored digits in both rows.)
        }
    }

    // MARK: Helper accessors that switch on `step`

    private func stepSub1Slots() -> [MathSlot] {
        switch step {
        case 1: return sub1SlotsStep1
        case 2: return sub1SlotsStep2
        case 3: return sub1SlotsStep3
        default: return sub1SlotsStep1
        }
    }

    private func stepSub2Slots() -> [MathSlot] {
        switch step {
        case 1: return sub2SlotsStep1
        case 2: return sub2SlotsStep2
        default: return sub2SlotsStep1
        }
    }

    private func stepQuestion() -> AnyView {
        switch step {
        case 1:
            return host.makeQuestion(
                correct: need,
                values: optionChoices(correct: need, min: 0, max: 10)
            )
        case 2:
            // Split options: build a small set of "X+Y" strings per
            // user feedback ("两个数只是交换顺序也不要出现在选项里面").
            // We use the strict split options: ["3+2", "2+3"] style
            // wouldn't appear — only the canonical (need, rest) pair
            // + 3 other canonical splits with sum = small.
            return splitQuestion()
        case 3:
            return host.makeQuestion(
                correct: total,
                values: optionChoices(correct: total, min: 11, max: 19)
            )
        default:
            return AnyView(EmptyView())
        }
    }

    /// Step 3 split-options question. Returns buttons labelled
    /// "need+rest", "a+b", etc. We use a small custom view (not
    /// `makeQuestion`'s integer picker) because the answer is a
    /// string pair like "3+1", not a single int. Encodes the pair
    /// as a single Int (need*10+rest) for the underlying picker.
    private func splitQuestion() -> AnyView {
        // Build the canonical splits of `small`: all (a, b) with
        // a + b == small and a <= b. Always include the correct
        // (need, rest) pair encoded.
        let correct = need * 10 + rest
        var seen = Set<Int>()
        var opts: [Int] = []
        for a in 1...max(1, small / 2) {
            let b = small - a
            let enc = a * 10 + b
            if !seen.contains(enc) {
                seen.insert(enc)
                opts.append(enc)
            }
        }
        let correctEnc = correct
        let swapCorrectEnc = rest * 10 + need
        if !seen.contains(correctEnc) {
            seen.insert(correctEnc)
            opts.append(correctEnc)
            if swapCorrectEnc != correctEnc {
                opts.removeAll { $0 == swapCorrectEnc }
                seen.remove(swapCorrectEnc)
            }
        }
        // Cap at 4.
        if opts.count > 4 {
            let others = opts.filter { $0 != correctEnc }.prefix(3)
            opts = [correctEnc] + Array(others)
        }
        let labelFor: (Int) -> String = { v in "\(v / 10)+\(v % 10)" }
        return host.makeQuestion(
            correct: correctEnc,
            values: opts,
            labelFor: labelFor
        )
    }

    // MARK: Audio dispatch

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            // 凑成十 — find the friend. Cue says "大数是 big，我们
            // 找找 big 的好朋友…". Same `l2-s2-{big}` cue the JS
            // file uses for this beat (it was step 2 in the 4-step
            // JS flow; Swift collapsed the compare step).
            host.playStepAudio(["l2-s2-\(big)"])
        case 2:
            // 拆一拆 — confirm the split. Cue says "small 能分成
            // need 和几？".
            host.playStepAudio(["l2-s3-\(small)-\(need)"])
        case 3:
            // 算一算 — count up. Canonical `l2-s4-{small}-{need}-
            // {rest}-{big}` cue for aIsBig, swap variant
            // `l2-s4s-{a}-{b}-{need}-{rest}-{big}` for aIsSmall.
            // JS comment: "小的情况下应该使用 swap variant，这样读
            // 出来的词跟视觉一致."
            let cueId: String
            if aIsSmall {
                cueId = "l2-s4s-\(a)-\(b)-\(need)-\(rest)-\(big)"
            } else {
                cueId = "l2-s4-\(small)-\(need)-\(rest)-\(big)"
            }
            host.playStepAudio([cueId])
        default:
            break
        }
    }
}

// MARK: - MathOperator extension
//
// (No extension needed — `MathOperator.greater` / `.less` already
// exist in `MathExpression.swift` with raw glyphs ">" / "<".)

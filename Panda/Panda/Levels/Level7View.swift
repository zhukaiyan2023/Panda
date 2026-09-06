//
//  Level7View.swift
//  Panda
//
//  L7 — 十几减几（不退位）(teenSubNoBorrow, a in [11..19], b <= ones(a)).
//  Three teaching beats, mirroring `scenes/subtractionLevels.js::l7Steps`
//  from the JS codebase:
//
//    Step 1 (拆一拆)   — kid picks the ones digit via "10+ones" buttons.
//                         Anchor renders; the split row
//                         "10 + □ - b = ?" is DEFERRED until the audio
//                         lands, then the ∧ split arrows appear
//                         (anchor.a → split[0]=10, split[2]=ones).
//    Step 2 (个位相减) — kid picks ones − b. Anchor + revealed split
//                         stay; the result row "10 + □ = ?" is
//                         DEFERRED until the audio lands. NO new
//                         arrows this step.
//    Step 3 (合起来)   — kid picks the total. Anchor + split +
//                         revealed result ("10 + diff = ?") all stay;
//                         ∨ combine arrows appear (split[2]=ones,
//                         split[4]=b → result[2]=diff).
//
//  L7 is structurally distinct from L8 (破十法), so this file owns
//  the L7-specific layout, slots, audio chain, and arrow overlay
//  independently. L8 has its own copy in `Level8View.swift` — no
//  shared `TeenSubStepView` / `TeenSubLevel` abstraction.
//
//  Arrows use the L3-style polyline (4-segment stem → arm → tip →
//  tail) from `Components/ArrowConnector.swift::L3StylePolyline`,
//  with proper BOTTOM/TOP slot edges (NOT slot centres).
//
//  Audio cues (l7-* prefix):
//    step 1   l7-s1-{a}-{b}        "把 a 拆成十加几"
//    step 2   l7-s2q-{ones}-{b}    "个位相减 [ones] 减 [b] 等于几"
//    step 3   l7-s3-{diff}         "十加 [diff] 等于几"
//    reward   l7-rwd-{a}-{b}-{a-b}
//

import SwiftUI

public struct Level7View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 7,
            sampleSize: 6,
            stepLabels: ["拆一拆", "个位相减", "合起来"],
            poolGen: PandaPools.poolGensForLevel(7),
            stepBuilder: { round, step, host in
                guard case .teenSubNoBorrow(let a, let b) = round else { return StepRender() }
                let ones = a % 10
                let diff = ones - b
                let answer = a - b
                return StepRender(
                    equation: AnyView(
                        TeenSubNoBorrowStepView(
                            a: a, b: b,
                            ones: ones,
                            diff: diff,
                            answer: answer,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .teenSubNoBorrow(let a, let b) = round else { return }
                // JS L7 chains the reward via playAfter — same pattern
                // here so the read-back doesn't overlap the celebration
                // tail.
                let cue = "l7-rwd-\(a)-\(b)-\(a-b)"
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

// MARK: - L7 step view (十几减几，不退位)
//
// L7 — 破十法 in the ones place (b ≤ ones(a)). The three-row
// decomposition stack:
//
//   anchor  "a - b = ?"           (persistent, size 72)
//   split   "10 + ones - b = ?"   (step 1: deferred)
//   result  "10 + diff = ?"       (step 2: deferred; diff revealed)
//
// Step 1 buttons show "10+X" so the kid sees the same decomposition
// shape as the open □ in the split row. Step 2 / step 3 use bare
// digits. The three steps own their own reveals — split row appears
// after step 1 audio lands, result row appears after step 2 audio
// lands, answer fills after step 3 picks correctly.

struct TeenSubNoBorrowStepView: View {
    let a: Int
    let b: Int
    let ones: Int
    let diff: Int       // ones - b (the ones-place sub)
    let answer: Int
    let step: Int
    let host: RoundHost

    // Sizes — anchor is the largest (the persistent goal — the
    // eye should read it as the spatial reference), the two
    // derived rows are smaller so the polyline arrows have elbow
    // room. Sizes mirror the JS layout (size=80 for anchor at
    // y=240, size=60 for split/result rows) scaled for the
    // Swift canvas.
    private let anchorSize: CGFloat = 72
    private let splitSize: CGFloat = 60
    private let resultSize: CGFloat = 64
    // Inter-row gaps — each gap is small enough to keep the
    // stack tight, but big enough for the polyline connectors to
    // bend cleanly without crowding the digits. Bumped from
    // 28/22 → 40/34 so the polyline elbows read clearly (the
    // previous 28/22 left the quarter-Y bend so close to the row
    // above that the arm felt pinched).
    private let gapAnchorSplit: CGFloat = 40
    private let gapSplitResult: CGFloat = 34

    private let coordSpace = "TeenSubNoBorrowStepView.root"

    // Captured row frames + slot centres (used for the polyline
    // endpoint math).
    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var splitRowFrame: CGRect = .zero
    @State private var splitSlotCenters: [CGPoint] = []
    @State private var resultRowFrame: CGRect = .zero
    @State private var resultSlotCenters: [CGPoint] = []

    // Deferred-row reveals. Both default to false so the very
    // first render after a step transition shows only the rows
    // that JS considers "already on screen"; the missing rows
    // appear AFTER the step audio lands (matches JS
    // `fireTeenStepAudio` + `onComplete` pattern).
    @State private var showSplitRow = false
    @State private var showResultRow = false

    // MARK: Slot factories

    /// Anchor row (persistent): "a - b = ?". Reserves the answer
    /// slot to `answer`'s width (2 digits) so the on-pick reveal
    /// doesn't reflow the row.
    ///
    /// The trailing "?" box stays in `PandaTheme.orange` (matches
    /// JS `COL_NEED`) while pending — the kid should see it as the
    /// same kind of "needs filling" frame as the split/result rows'
    /// own □s. Switches to `ink` only after step 3 picks the answer
    /// (handled by the answer-or-placeholder helper).
    private var anchorSlots: [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("?", color: PandaTheme.orange),
        ]
    }

    /// Split row: "10 + ones - b = ?". L7's split row always has
    /// the literal "10" at slot 0 and the ones half at slot 2.
    ///
    /// Colors track JS `COL_TEN` (yellow for the literal "10")
    /// and `COL_NEED` (orange for the ones-half and any pending
    /// answer box). The previous build used
    /// `PandaTheme.numYellow` (= `PandaTheme.yellow`) for the
    /// ones-half — which read as the SAME yellow as the literal
    /// "10" and made the two halves indistinguishable. Orange
    /// gives the eye a clear "the unknown half" cue.
    private func splitSlots(onesValue: Int?,
                            answerValue: Int?) -> [MathSlot] {
        // Half-slot helper — either the literal "10" at slot 0,
        // or the ones half at slot 2 (revealed after step 1 pick),
        // or an answerBox "□" pre-pick.
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
            halfSlot(isTen: true),    // slot 0 = "10"
            .op(.plus),
            halfSlot(isTen: false),   // slot 2 = ones (or □)
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            answerSlot,
        ]
    }

    /// Result row: "10 + diff = ?". Slot 0 is the carried-through
    /// "10" (COL_TEN, yellow). Slot 2 is the diff (COL_NEED →
    /// COL_SMALL after pick; pink numeric digit). The trailing "?"
    /// at slot 4 is filled on step 3's correct pick.
    private func resultSlots(answerValue: Int?,
                             pickValueSlot: Int?) -> [MathSlot] {
        let carryThrough: MathSlot = .number(10, color: PandaTheme.yellow)
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

    // Per-step current slots. Steps gate on `showSplitRow` /
    // `showResultRow` so the placeholders reserve height even
    // before the audio lands.
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
            // Pre-pick — the □ at split[2] is open for the kid
            // to fill.
            return splitSlots(onesValue: nil, answerValue: nil)
        default:
            // Step 2+ — ones revealed; trailing "?" still open
            // until step 3's correct pick ends the round.
            return splitSlots(onesValue: ones, answerValue: nil)
        }
    }

    private var currentResultSlots: [MathSlot] {
        switch step {
        case 2:
            // Pre-pick — the □ at result[2] is open for the kid
            // to fill with diff.
            return resultSlots(answerValue: nil, pickValueSlot: nil)
        default:
            // Step 3 — diff revealed; trailing "?" still open
            // for the answer pick (kept as "?" until the round
            // ends).
            return resultSlots(answerValue: nil,
                               pickValueSlot: diff)
        }
    }

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                // Row 1 — anchor (persistent goal equation).
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
                // until the step-1 audio lands; visible from step 2
                // onward (with the ones revealed).
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
                    // Height-reserving placeholder so the row's
                    // vertical space stays put while we wait for
                    // the audio.
                    Color.clear.frame(height: splitSize + 24)
                }

                // Row 3 — result row. Hidden on step 1 + step 2's
                // first render until the step-2 audio lands;
                // visible from step 3 onward (with diff revealed).
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

                // Row 4 — buttons (3-step choices: ones / diff /
                // answer).
                stepQuestion()
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            // Draw arrows only when both endpoints have rendered
            // (anchor + split for step 1's ∧ split; split + result
            // for step 3's ∨ combine). Endpoints whose slot centre
            // isn't available yet (e.g. result row not yet revealed)
            // collapse to no-ops inside the helper.
            stepArrowsOverlay()
                .allowsHitTesting(false)
        }
        .onAppear { fireAudioForCurrentStep() }
    }

    // MARK: Question dispatch (per-step button prompt)

    private func stepQuestion() -> AnyView {
        switch step {
        case 1:
            // Step 1 — pick ones. Buttons labelled "10+X" so the
            // kid sees the same shape as the open □ in the split
            // row. The decomposed label is 4-5 chars (e.g. "10+5")
            // so the buttons need to be wider than the default
            // 100×80; bumped to 144×96 to match L5.
            return host.makeQuestion(
                correct: ones,
                values: optionChoices(correct: ones, min: 1, max: 9),
                labelFor: { v in "10+\(v)" },
                buttonWidth: 144,
                buttonHeight: 96
            )
        case 2:
            // Step 2 — pick diff = ones - b. Bare single digit;
            // the result row's "10 + □ = ?" prompt is already the
            // decomposed view. Default button size is fine.
            return host.makeQuestion(
                correct: diff,
                values: optionChoices(correct: diff, min: 0, max: 8)
            )
        default:
            // Step 3 — pick answer. Bare integers in [10, 18].
            // Default size works for the two-digit range.
            return host.makeQuestion(
                correct: answer,
                values: optionChoices(correct: answer, min: 10, max: 18)
            )
        }
    }

    // MARK: Audio dispatch (per-step cue chain)

    private func fireAudioForCurrentStep() {
        switch step {
        case 1:
            // "把 a 拆成十加几" — reveal split row when audio lands.
            host.playStepAudio(["l7-s1-\(a)-\(b)"]) {
                self.showSplitRow = true
            }
        case 2:
            // Anchor + split (revealed) stay. Reveal result row
            // when the audio lands. JS plays "个位相减 ones 减 b
            // 等于几" then renders the result row in the
            // onComplete.
            self.showSplitRow = true
            host.playStepAudio(["l7-s2q-\(ones)-\(b)"]) {
                self.showResultRow = true
            }
        default:
            // All three rows already on screen from the previous
            // steps.
            self.showSplitRow = true
            self.showResultRow = true
            host.playStepAudio(["l7-s3-\(diff)"])
        }
    }

    // MARK: Arrow overlay

    /// Draw the per-step arrows. The polyline shape (4-segment:
    /// STEM → ARM → TIP → TAIL) is provided by `L3StylePolyline`
    /// — same primitive the JS source uses via `drawLink`. We
    /// lay out four connectors in a ZStack overlay:
    ///
    ///   * ∧ split — anchor.a → split[0], split[2]. PERSISTENT
    ///     across all steps once the split row is revealed (the
    ///     decomposition "a = 10 + ones" stays visible as a
    ///     continuous reference while the kid works through steps
    ///     2 and 3).
    ///   * ∨ combine — split[2], split[4] → result[2]. Step 3
    ///     only — shows how the split row's ones + b feed into the
    ///     final diff.
    ///
    /// Colors track the JS palette:
    ///   * COL_TEN  (yellow)  for the literal "10" half.
    ///   * COL_NEED (orange)  for the unknown ones-half and the
    ///                          pending placeholder □s.
    ///   * COL_SMALL (pink)   for the subtrahend b.
    ///
    /// The previous build used `PandaTheme.numYellow` for the
    /// ones-half (which is just `PandaTheme.yellow`) — that made
    /// both decomposition arrows land in the same yellow as the
    /// "10" half, so the kid couldn't tell which arrow pointed
    /// at which slot. Orange for the ones-half restores the
    /// intended "two halves are different things" cue.
    private func stepArrowsOverlay() -> some View {
        ZStack {
            // ∧ split arrows — anchor.a → split[0], split[2].
            // Drawn once the split row has rendered.
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
            // ∨ combine arrows — split[2], split[4] → result[2].
            // Step 3 only — shows how the split row's ones + b
            // feed into the result's diff.
            ForEach(combineArrows()) { seg in
                L3StylePolyline(
                    from: seg.from,
                    to: seg.to,
                    color: seg.color
                )
            }
        }
    }

    /// Endpoint bundle for the ∧ split arrows. Nil until the
    /// split row has rendered (so partial layouts during
    /// `onAppear` don't draw stray zero-length connectors).
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
        // The literal "10" lives at split[0] (numeric digit,
        // halfRatio = 0.5); the ones half is at split[2] (□
        // answerBox until step 1 picks; halfRatio = 0.45).
        let splitZeroTop = topOf(splitSlotCenters, splitRowFrame,
                                  slot: 0,
                                  size: splitSize,
                                  halfRatio: 0.5)
        let splitTwoTop = topOf(splitSlotCenters, splitRowFrame,
                                 slot: 2,
                                 size: splitSize,
                                 halfRatio: 0.45)
        // COL_TEN (yellow) for slot 0; COL_NEED (orange) for
        // slot 2.
        return (anchorBottom, splitZeroTop, splitTwoTop,
                Color(PandaTheme.yellow),
                Color(PandaTheme.orange))
    }

    /// Endpoint bundle for the ∨ combine arrows. Drawn on every
    /// step once the result row has rendered — not just step 3.
    /// Per JS `teenLinkPoints` the ∨ arrows are part of the
    /// persistent diagram: the kid should see the connection
    /// from split[2]/split[4] → result[2] as soon as the result
    /// row appears, not only after picking the answer. The
    /// previous `step == 3` gate hid them on step 2 (when the
    /// result row first renders with `□` in slot 2), leaving the
    /// red box in the user's screenshot empty.
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
        // L7 split[2]=ones (orange → diff), split[4]=b (pink).
        return [
            CombineSegment(from: splitTwoBottom, to: resultTwoTop,
                           color: Color(PandaTheme.orange)),
            CombineSegment(from: splitFourBottom, to: resultTwoTop,
                           color: Color(PandaTheme.numPink)),
        ]
    }

    /// BOTTOM-edge y of a slot in its row's local frame. Numeric
    /// slots use size/2 (digit half-height); answerBox slots use
    /// size * 0.45 (visible outline half-height).
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

    /// One ∨ combine segment. Identifiable so it can live in a
    /// `ForEach` inside the overlay ZStack.
    private struct CombineSegment: Identifiable {
        let id = UUID()
        let from: CGPoint
        let to: CGPoint
        let color: Color
    }
}

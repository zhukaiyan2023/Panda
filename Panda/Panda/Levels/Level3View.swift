//
//  Level3View.swift
//  Panda
//
//  L3 — 两个数凑十 (threeTen, a + b + c with a + b = 10 or b + c = 10).
//  Mirrors `scenes/level2.js` from the JS codebase (the JS file is named
//  `level2.js` but its levelId is 3 — the JS file naming was kept stable
//  for audio cue id compatibility).
//
//  Teaching flow (two-of-three sum to 10):
//    * Pair = the two addends that sum to 10. Third is the leftover.
//    * Step 1 — Find the pair the JS way:
//                  cells row at top (pair cells get orange rings)
//                  persistent anchor "a + b + c = ?"
//                  sub-question "? + ? = 10" (deferred until phase 1 audio ends)
//                  child picks the PAIR LABEL (e.g. "5+5", "4+6")
//                  on correct: sub reveals to "pair[0] + pair[1] = 10"
//    * Step 2 — Add the rest the JS way:
//                  cells row with the "third" visually separated (extra-wide gap)
//                  persistent anchor "a + b + c = ?"
//                  merge arrows "╲ ╱" in orange between the anchor and the
//                  simplified sub-question "10 + third = ?" (or mirrored
//                  "third + 10 = ?" when the pair sits at the end)
//                  child picks the TOTAL (10 + third ∈ [11, 19])
//                  on correct: anchor reveals to "a + b + c = answer" and
//                  sub reveals to "10 + third = answer"
//
//  Audio cues (l1-* prefix — content originated in JS level1.js before
//  the four-way split):
//    step 1 phase 1   l1-intro-mt-{a}-{b}-{c}      "a+b+c等于几…先找出相加为10的数"
//    step 1 phase 2   l1-sub-find-ten              "哪两个数相加等于10"
//    step 2           l1-step2-10-{leftover}       "十加{leftover}等于几" (pair at start)
//                    l1-step2-{leftover}-10        "{leftover}加十等于几" (pair at end)
//    reward           l1-rwd-{a}-{b}-{c}-{total}
//

import SwiftUI

public struct Level3View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 3,
            sampleSize: 6,
            stepLabels: ["找十", "算一算"],
            poolGen: PandaPools.poolGensForLevel(3),
            stepBuilder: { round, step, host in
                guard case .threeTen(let a, let b, let c) = round else {
                    return StepRender()
                }
                let nums = [a, b, c]
                let total = a + b + c

                // Choose pair (mirrors JS choosePair). Uses pairIndices
                // to handle the (a, a, 10-a) edge case where two
                // addends share a value — see JS comment for the full
                // rationale. For Swift the pool only contains
                // a+b=10 or b+c=10 triples, so we only ever fall into
                // the first two branches.
                //
                // `pairIndices` stores the PAIR MEMBERS' INDICES INTO
                // THE ANCHOR EQUATION'S SLOT ARRAY (`a + b + c = □`
                // has slots [a, +, b, +, c, =, ?], so a→0, b→2, c→4).
                // Storing anchor-slot indices here — NOT nums indices —
                // matters because the merge-arrow code reads
                // `anchorSlotCenters[pairIndices[i]]` to find the
                // pair addends' bottom edges for the polyline arrows.
                // Mixing nums and anchor-slot indices was a bug in the
                // previous pass (it was drawing arrows from the "+"
                // operator slot instead of from the "4" / "6" pair).
                //
                // `thirdIdx` (nums index) is the index into the nums
                // array, used by the cells-row code for the boundary
                // gap insertion (e.g. flush the third's cells together
                // on step 2).
                let pair: [Int]
                let third: Int
                let thirdIdx: Int
                let pairIndices: [Int]
                if a + b == 10 {
                    pair = [a, b]
                    third = c
                    thirdIdx = 2        // nums index of c (the leftover)
                    pairIndices = [0, 2] // anchor slots for a, b
                } else if b + c == 10 {
                    pair = [b, c]
                    third = a
                    thirdIdx = 0        // nums index of a (the leftover)
                    pairIndices = [2, 4] // anchor slots for b, c
                } else {
                    // Fallback (unreachable for L3's pool, but keeps
                    // the function total so a pool-corruption doesn't
                    // crash the level).
                    pair = [a, b]
                    third = c
                    thirdIdx = 2
                    pairIndices = [0, 2]
                }

                // Build the step body view. The body itself owns the
                // audio chain + the deferred sub-question reveal for
                // step 1, plus the merge-arrows positioning for step 2.
                return StepRender(
                    equation: AnyView(
                        ThreeTenStepView(
                            nums: nums,
                            pair: pair,
                            third: third,
                            thirdIdx: thirdIdx,
                            pairIndices: pairIndices,
                            total: total,
                            step: step,
                            host: host
                        )
                    )
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .threeTen(let a, let b, let c) = round else { return }
                let total = a + b + c
                // JS L3 chains the reward via playAfter — same here.
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

// MARK: - L3 step layout (两个数凑十)
//
// Swift L3 renders a 4-row visual stack that mirrors the JS level2.js
// layout:
//
//   cells      — one cell per addend unit (e.g. 5+5+1 → 11 cells in 3
//                color groups). Step 1 highlights the pair cells with
//                orange rings; step 2 widens the gap around the third
//                addend and flushes gaps within the third's group.
//   anchor     — persistent "a + b + c = ?" goal equation (always on).
//   sub        — step-specific. Step 1: "? + ? = 10" (deferred until
//                phase-1 audio finishes). Step 2: "10 + third = ?" (or
//                mirrored "third + 10 = ?") with the orange V-shaped
//                merge arrows ╲ ╱ above it, pointing at "10".
//   buttons    — 4 choices. Step 1: pair labels like "4+6", "5+5".
//                Step 2: total values like 11–19.
//
// The merge arrows in step 2 are locked to the "10" slot inside the
// simplified sub-question — once the layout reports the slot's centre
// we snap the V apex onto it. Mirrors the JS postRender pass that
// moves `ctx.mergeArrows.pos.x` to `ctx.equationNode.slotCenters[tenSlotIdx]`.

struct ThreeTenStepView: View {
    let nums: [Int]
    let pair: [Int]
    let third: Int
    let thirdIdx: Int
    let pairIndices: [Int]
    let total: Int
    let step: Int
    let host: RoundHost

    // Sizes (kept as plain lets so they're cheap to read in body).
    private let cellSize: CGFloat = 52
    private let anchorSize: CGFloat = 80
    private let subSize: CGFloat = 72
    private let fullSize: CGFloat = 80

    // Per-row frames + slot centres (used for the step-2 merge arrows
    // and for the audio chain).
    @State private var anchorRowFrame: CGRect = .zero
    @State private var anchorSlotCenters: [CGPoint] = []
    @State private var fullRowFrame: CGRect = .zero
    @State private var fullSlotCenters: [CGPoint] = []

    // Step 1 deferred reveal: the sub-question is rendered only AFTER
    // the phase-1 audio (`l1-intro-mt-{a}-{b}-{c}`) finishes. Mirrors
    // the JS `deferEquation: true` + `firePhase2` callback pair, which
    // showed the "? + ? = 10" row exactly when the spoken strategy
    // ends ("Showing it immediately (the old behavior) made the screen
    // busy before the kid had heard the strategy").
    @State private var showStep1Sub = false

    // Step 1 pair-label picker. The correct value is the pair encoded
    // as a single Int (e.g. [5, 5] → 55, [4, 6] → 46) so the existing
    // `makeQuestion(correct:values:labelFor:)` API works without
    // surgery. The labelFor re-decodes the int back to "5+5" / "4+6"
    // for display. Same approach the JS file takes (the JS compares
    // strings; here we compare ints — equivalent at the picker level).
    private static let allTenPairs: [[Int]] = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]]
    private static func encode(_ pair: [Int]) -> Int { pair[0] * 10 + pair[1] }
    private static let pairLabel: (Int) -> String = { v in "\(v / 10)+\(v % 10)" }

    private var pairQuestion: AnyView {
        let correct = Self.encode(pair)
        // Exclude both orderings of the correct pair from distractors
        // (e.g. for [4, 6] the canonical [4, 6] is excluded; for [6, 4]
        // we'd still want [4, 6] excluded). ALL_TEN_PAIRS lists each
        // unordered pair in smaller-first order so the first check
        // covers canonical order; the swap check is a safety net for
        // any future pool re-ordering that reverses the pair.
        let a = pair[0], b = pair[1]
        let distractors = Self.allTenPairs.filter { p in
            !((p[0] == a && p[1] == b) || (p[0] == b && p[1] == a))
        }
        // Pair values are pre-encoded as ints so the existing picker
        // can do numeric equality. Deterministic order — no shuffling
        // — so the row stays stable across re-renders for diff-ability.
        var values = [correct]
        for d in distractors.prefix(3) { values.append(Self.encode(d)) }
        return host.makeQuestion(
            correct: correct,
            values: values,
            labelFor: Self.pairLabel
        )
    }

    // tenOnLeft: the ten-pair sits at the start of nums (a+b=10,
    // pairIndices [0, 1]), so the simplified form puts "10" on the
    // left and "third" on the right. When the pair is at the end
    // (b+c=10, pairIndices [1, 2]) we mirror so "third" sits on
    // the left and "10" on the right — the "10" stays directly
    // under the pair either way, so the merge arrows can align
    // with it instead of floating between the two equations.
    private var tenOnLeft: Bool { pairIndices[0] == 0 }

    // Anchor: a + b + c = "?" (revealed to total on round complete).
    // Slot 6 = the "?". `reserve` pins slot 6 to `total`'s width (2
    // digits) so the reveal in onAdvance doesn't reflow the row.
    private var anchorSlots: [MathSlot] {
        [
            .number(nums[0], color: PandaTheme.numBlue),
            .op(.plus),
            .number(nums[1], color: PandaTheme.numYellow),
            .op(.plus),
            .number(nums[2], color: PandaTheme.numPink),
            .op(.equals),
            .answerBox("?", color: PandaTheme.ink),
        ]
    }

    // Step 1 sub-question: "? + ? = 10". Reserves slots 0 and 2 to
    // "10" so the "? + ? = 10" row doesn't reflow when the boxes
    // reveal to pair digits (1 digit, max 9 — "□" at 0.9 × size
    // would shrink to 0.62 × size without the reserve).
    private var subSlots: [MathSlot] {
        [
            .answerBox("?", color: PandaTheme.ink),
            .op(.plus),
            .answerBox("?", color: PandaTheme.ink),
            .op(.equals),
            .number(10, color: PandaTheme.yellow),
        ]
    }

    // Step 2 simplified sub-question. Mirrored by pair position so
    // "10" sits under the pair — when the pair is at the start
    // (tenOnLeft), 10 is on the left; when at the end, 10 is on
    // the right. The leftover color mirrors its anchor position.
    private var fullSlots: [MathSlot] {
        let leftoverColor: RGB = tenOnLeft
            ? PandaTheme.numPink
            : PandaTheme.numBlue
        return tenOnLeft
            ? [
                .number(10, color: PandaTheme.yellow),
                .op(.plus),
                .number(third, color: leftoverColor),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
            : [
                .number(third, color: leftoverColor),
                .op(.plus),
                .number(10, color: PandaTheme.yellow),
                .op(.equals),
                .answerBox("?", color: PandaTheme.ink),
            ]
    }

    // Step 1 sub-question revealed (after correct pick): pair[0] +
    // pair[1] = 10. Pair colors mirror the addend anchor positions
    // — for pair=[9, 1] (which is the b+c=10 case for a=4 in
    // 4+9+1) we use yellow + pink to match the anchor's color
    // coding.
    private var subRevealSlots: [MathSlot] {
        // pairIndices gives the addend slot indices in the anchor for
        // each pair member. The pair's COLOR (NUM_BLUE / NUM_YELLOW /
        // NUM_PINK) follows that position.
        let pairColors: [RGB] = pairIndices.map { idx in
            switch idx {
            case 0: return PandaTheme.numBlue
            case 2: return PandaTheme.numYellow
            case 4: return PandaTheme.numPink
            default: return PandaTheme.ink
            }
        }
        return [
            .number(pair[0], color: pairColors[0]),
            .op(.plus),
            .number(pair[1], color: pairColors[1]),
            .op(.equals),
            .number(10, color: PandaTheme.orange),
        ]
    }

    var body: some View {
        // Outer VStack strategy mirrors ThreeSumStepView (see that
        // file for the full spacing rationale): top spacer + content
        // VStack + bottom spacer so the content sits centred inside
        // whatever height the StepRender offers.
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 0) {
                // Row 1 — cells row (mirrors JS mergedRow). Step 1
                // highlights the pair with orange rings; step 2 widens
                // the gap around the third addend.
                ThreeTenCells(
                    nums: nums,
                    highlight: step == 1 ? Set(pair) : nil,
                    boundary: step == 2 ? thirdIdx : nil,
                    flushBoundary: step == 2,
                    cellSize: cellSize
                )
                .frame(height: cellSize)

                Spacer().frame(height: 18)

                // Row 2 — anchor (persistent goal). We use
                // MathExpressionWithSlots to capture the per-slot
                // centres for the step-2 merge arrows. The
                // `.frame(height: anchorSize + 24)` is the ONLY height
                // constraint — `.onGeometryChange` reads the current
                // frame without claiming any layout space (a
                // `.background(GeometryReader)` would inflate the row).
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

                Spacer().frame(height: 24)

                if step == 1 {
                    // Row 3 — step-1 sub-question. Deferred until
                    // phase-1 audio finishes; before that we render
                    // a transparent placeholder so the row's height
                    // doesn't pop in/out.
                    Group {
                        if showStep1Sub {
                            MathExpressionWithSlots(
                                slots: subSlots,
                                size: subSize
                            ) { _ in }
                            .frame(height: subSize + 24)
                        } else {
                            Color.clear.frame(height: subSize + 24)
                        }
                    }
                } else {
                    // Step 2 — merge arrows + simplified sub. The merge
                    // arrows themselves are drawn in the .overlay (so
                    // they don't claim any layout space); we just
                    // reserve a 48-px vertical gap between the anchor
                    // and the simplified sub for the polyline arms to
                    // occupy visually.
                    Spacer().frame(height: 48)
                    MathExpressionWithSlots(
                        slots: fullSlots,
                        size: fullSize
                    ) { centers in
                        fullSlotCenters = centers
                    }
                    .frame(height: fullSize + 24)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(coordSpace))
                    } action: { newFrame in
                        fullRowFrame = newFrame
                    }
                }

                Spacer().frame(height: 28)

                // Row 4 — buttons. Step 1 picks the pair label
                // ("5+5", "4+6", …); step 2 picks the total (11–19).
                if step == 1 {
                    pairQuestion
                } else {
                    host.makeQuestion(
                        correct: total,
                        values: optionChoices(correct: total, min: 11, max: 19)
                    )
                }
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .coordinateSpace(name: coordSpace)
        .overlay {
            // Step 2 only: draw the V-shaped merge arrows (the "10"
            // polyline pair from the JS) using `L1MergeLines` — the
            // same 4-segment polyline (stem → arm → tip → tail) used
            // by L2 (三数相加). Two arms converge at the "10" slot in
            // the simplified sub, one per pair addend in the anchor.
            // Each arm carries the addend's color so the eye traces
            // each pair member back to its source.
            //
            // Mirrors the JS `postRender` hook that snaps
            // `ctx.mergeArrows.pos.x = eqNode.slotCenters[tenSlotIdx]`
            // — but in Swift we draw actual polylines (not unicode
            // text) so the geometry matches L2's polyline style.
            if step == 2,
               anchorSlotCenters.count > pairIndices[1],
               fullSlotCenters.count > 2 {
                let tenIdx = tenOnLeft ? 0 : 2
                let anchorGeoH = anchorSize + 24
                let fullGeoH = fullSize + 24
                // Anchor slot centres are reported at `geoHeight/2` by
                // MathExpressionWithSlots. The actual slot centre
                // (for `.number` and `.answerBox` slots, which are
                // positioned at y = size/2) is at `size/2`. The
                // offset converts between the two.
                let anchorYOff = anchorSize / 2 - anchorGeoH / 2
                let fullYOff = fullSize / 2 - fullGeoH / 2
                // Anchor pair addends' BOTTOM edges — start of each
                // polyline arm.
                let anchorABottom = CGPoint(
                    x: anchorRowFrame.minX + anchorSlotCenters[pairIndices[0]].x,
                    y: anchorRowFrame.minY + anchorSlotCenters[pairIndices[0]].y
                        + anchorYOff + anchorSize / 2
                )
                let anchorBBottom = CGPoint(
                    x: anchorRowFrame.minX + anchorSlotCenters[pairIndices[1]].x,
                    y: anchorRowFrame.minY + anchorSlotCenters[pairIndices[1]].y
                        + anchorYOff + anchorSize / 2
                )
                // "10" slot's TOP edge in the simplified sub —
                // convergence point of both polyline arms. Treats the
                // "10" digit as if it were a 0.9 × size box centred
                // at size/2, so its top edge is `centre − size * 0.45`.
                let mergeBox = CGPoint(
                    x: fullRowFrame.minX + fullSlotCenters[tenIdx].x,
                    y: fullRowFrame.minY + fullSlotCenters[tenIdx].y
                        + fullYOff - fullSize * 0.45
                )
                // Arm colors follow each addend's anchor color so the
                // eye traces each pair member back to its source arm.
                // pairIndices store anchor slots, so the color lookup
                // is keyed on the slot index: 0 = blue (a), 2 =
                // yellow (b), 4 = pink (c).
                let colorA: Color = (pairIndices[0] == 0)
                    ? Color(PandaTheme.numBlue)
                    : Color(PandaTheme.numYellow)
                let colorB: Color = (pairIndices[1] == 4)
                    ? Color(PandaTheme.numPink)
                    : Color(PandaTheme.numYellow)
                L1MergeLines(
                    anchorTop: anchorABottom,
                    anchorMid: anchorBBottom,
                    mergeBox: mergeBox,
                    colorA: colorA,
                    colorB: colorB
                )
                .allowsHitTesting(false)
            }
        }
        .onAppear {
            // Fire step audio. Step 1 plays phase-1 first, then
            // phase-2 (after phase-1 ends) and reveals the sub-
            // question at the same moment — matches the JS
            // `deferEquation` + `firePhase2` flow. Step 2 plays its
            // single composite cue directly.
            switch step {
            case 1:
                let phase1 = ["l1-intro-mt-\(nums[0])-\(nums[1])-\(nums[2])"]
                let phase2 = ["l1-sub-find-ten"]
                // Match the JS `firePhase2` flow: when phase 1 ends,
                // show the sub-question AND fire phase 2 — the kid
                // sees "? + ? = 10" exactly when they hear "哪两个数
                // 相加等于10", not before.
                host.playStepAudio(phase1) {
                    self.showStep1Sub = true
                    host.playSequence(phase2)
                }
            case 2:
                let cue = tenOnLeft
                    ? "l1-step2-10-\(third)"
                    : "l1-step2-\(third)-10"
                host.playStepAudio([cue])
            default:
                break
            }
        }
    }

    private let coordSpace = "ThreeTenStepView.root"
}

// MARK: - ThreeTenCells
//
// Renders the cells row at the top of the L3 layout. Each addend fills
// its own contiguous block of cells in its assigned color; gaps between
// cells are `gap`, with `extraGap` inserted on either side of the
// `boundary` group (step 2 only — separates the "third" so the eye
// reads it as a single connected block). When `flushBoundary` is true,
// gaps WITHIN the boundary group are zeroed out so the third reads as
// one flush strip.
//
// Highlight (step 1 only): cells matching any value in `highlight`
// get an orange ring drawn BEHIND them — the ring sits underneath the
// card-colored box so it reads as an outline accent rather than a
// competing stroke.
//
// Cell sizing mirrors JS mergedRow (cell=52, gap=6, extraGap=28).

struct ThreeTenCells: View {
    let nums: [Int]
    let highlight: Set<Int>?
    let boundary: Int?
    let flushBoundary: Bool
    let cellSize: CGFloat
    private let gap: CGFloat = 6
    private let extraGap: CGFloat = 28

    private struct CellInfo: Identifiable {
        let id: Int
        let colorIdx: Int
        let isHighlighted: Bool
        let xOffset: CGFloat
    }

    private var cells: [CellInfo] {
        var out: [CellInfo] = []
        let total = nums.reduce(0, +)
        guard total > 0 else { return [] }
        var cursor: CGFloat = 0
        var idx = 0
        for (g, n) in nums.enumerated() {
            for c in 0..<n {
                let isHi = highlight?.contains(n) ?? false
                out.append(CellInfo(
                    id: idx,
                    colorIdx: g,
                    isHighlighted: isHi,
                    xOffset: cursor
                ))
                cursor += cellSize
                idx += 1
                if idx < total {
                    let isLastInGroup = c == n - 1
                    let isFirstInGroup = c == 0
                    var gSize = gap
                    if let boundary = boundary {
                        let isBoundaryLeft = isLastInGroup && g == boundary - 1
                        let isBoundaryRight = isFirstInGroup && g == boundary
                        if isBoundaryLeft || isBoundaryRight { gSize = extraGap }
                    }
                    if flushBoundary && g == boundary { gSize = 0 }
                    cursor += gSize
                }
            }
        }
        return out
    }

    private var totalWidth: CGFloat {
        guard let first = cells.first, let last = cells.last else { return 0 }
        return last.xOffset - first.xOffset + cellSize
    }

    private var firstXOffset: CGFloat { cells.first?.xOffset ?? 0 }

    var body: some View {
        ZStack {
            ForEach(cells) { info in
                ThreeTenCellView(
                    colorIdx: info.colorIdx,
                    isHighlighted: info.isHighlighted,
                    cellSize: cellSize
                )
                .position(
                    x: info.xOffset - firstXOffset + cellSize / 2,
                    y: cellSize / 2
                )
            }
        }
        .frame(width: totalWidth, height: cellSize, alignment: .center)
        .frame(maxWidth: .infinity)  // centered horizontally in parent
    }
}

private struct ThreeTenCellView: View {
    let colorIdx: Int
    let isHighlighted: Bool
    let cellSize: CGFloat

    private var color: RGB {
        switch colorIdx {
        case 0: return PandaTheme.numBlue
        case 1: return PandaTheme.numYellow
        case 2: return PandaTheme.numPink
        default: return PandaTheme.ink
        }
    }

    var body: some View {
        ZStack {
            // Orange ring BEHIND the cell box. Drawn at cell+16 with
            // 0.45 opacity to match JS (which uses orange with
            // opacity 0.45 inside an outlined rect).
            if isHighlighted {
                RoundedRectangle(cornerRadius: (cellSize + 16) * 0.32)
                    .stroke(Color(PandaTheme.orange), lineWidth: 4)
                    .frame(width: cellSize + 16, height: cellSize + 16)
                    .opacity(0.45)
            }
            // Card-colored cell box.
            RoundedRectangle(cornerRadius: cellSize * 0.27)
                .fill(Color(PandaTheme.card))
                .overlay(
                    RoundedRectangle(cornerRadius: cellSize * 0.27)
                        .stroke(Color(PandaTheme.ink), lineWidth: 4)
                )
                .frame(width: cellSize, height: cellSize)
            // Colored dot inside the cell.
            Circle()
                .fill(Color(color))
                .frame(width: cellSize * 0.5, height: cellSize * 0.5)
        }
    }
}

// MARK: - Merge arrows
//
// Step 2's V-shaped merge arrows are rendered with `L1MergeLines`
// from `Components/ArrowConnector.swift` — the same 4-segment polyline
// (stem → arm → tip → tail) used by L2 (三数相加). The previous pass
// used custom `ThreeTenMergeArrows` / `ThreeTenMergeLines` views
// (straight diagonal lines), which the user flagged as visually wrong
// and inconsistent with L2's polyline style. Replaced with the shared
// `L1MergeLines` so L3 reads the same way as L2.

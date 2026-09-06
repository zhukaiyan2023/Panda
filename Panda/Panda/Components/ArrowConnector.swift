//
//  ArrowConnector.swift
//  Panda
//
//  Visual arrows / curves drawn between MathExpressions so the kid
//  sees the decomposition relationship. The original Kaplay source
//  (`drawLink.js`, `level1.js::drawMergeLines`, `subtractionLevels.js::teenLinkPoints`)
//  uses rotated rects as line segments — SwiftUI's `.path` / `Shape`
//  API gives us cleaner geometry for the same effect.
//

import SwiftUI

/// Draws a single line segment from `from` to `to` with a small
/// arrowhead at the target. Color tracks the originating slot so the
/// eye traces the relationship (e.g. blue for the "1", yellow for the
/// "7").
public struct ArrowConnector: View {
    public let from: CGPoint
    public let to: CGPoint
    public let color: Color
    public let thickness: CGFloat
    public let arrowHeadSize: CGFloat

    public init(from: CGPoint,
                to: CGPoint,
                color: Color,
                thickness: CGFloat = 6,
                arrowHeadSize: CGFloat = 14) {
        self.from = from
        self.to = to
        self.color = color
        self.thickness = thickness
        self.arrowHeadSize = arrowHeadSize
    }

    public var body: some View {
        Canvas { context, _ in
            let path = Path { p in
                p.move(to: from)
                p.addLine(to: to)
            }
            context.stroke(
                path,
                with: .color(color.opacity(0.7)),
                style: StrokeStyle(lineWidth: thickness, lineCap: .round)
            )
            // Arrowhead — two short lines forming a V at the target.
            let dx = to.x - from.x
            let dy = to.y - from.y
            let len = max(1, sqrt(dx * dx + dy * dy))
            let ux = dx / len
            let uy = dy / len
            // Perpendicular vector for the V's two arms.
            let px = -uy
            let py = ux
            let headBase = CGPoint(
                x: to.x - ux * arrowHeadSize,
                y: to.y - uy * arrowHeadSize
            )
            let headLeft = CGPoint(
                x: headBase.x + px * (arrowHeadSize * 0.5),
                y: headBase.y + py * (arrowHeadSize * 0.5)
            )
            let headRight = CGPoint(
                x: headBase.x - px * (arrowHeadSize * 0.5),
                y: headBase.y - py * (arrowHeadSize * 0.5)
            )
            let head = Path { p in
                p.move(to: headLeft)
                p.addLine(to: to)
                p.addLine(to: headRight)
            }
            context.stroke(
                head,
                with: .color(color.opacity(0.8)),
                style: StrokeStyle(lineWidth: thickness + 1, lineCap: .round, lineJoin: .round)
            )
        }
        .allowsHitTesting(false)
    }
}

/// Renders the V-shaped merge visualization for L1 (三数相加):
/// two POLYLINE connectors from the anchor's addends (slot 0, slot 2)
/// DOWN to the simplified preview's first □ (slot 0), with a V-shaped
/// arrowhead AT the merge box. The V opens upward toward the anchor.
///
/// Polyline shape (per user feedback "用折线链接"):
///   1. Drop straight DOWN from the anchor slot to the merge box's
///      vertical level (a vertical stem).
///   2. Bend INWARD horizontally toward the merge box's center x
///      (a horizontal arm).
///   3. Drop the last few pixels straight DOWN into the merge box
///      (a short vertical tip so the line terminates inside the box).
///
/// This 3-segment polyline reads as a clear "this addend feeds the
/// merge box" connector — the elbow turn makes the relationship
/// obvious at a glance, much more so than a single straight diagonal
/// line which can look like a "ray" with no clear direction.
public struct L1MergeLines: View {
    public let anchorTop: CGPoint       // (x, y) of anchor's first addend BOTTOM
    public let anchorMid: CGPoint       // (x, y) of anchor's second addend BOTTOM
    public let mergeBox: CGPoint        // (x, y) of preview's first □ TOP
    public let colorA: Color
    public let colorB: Color
    public let lineThickness: CGFloat

    public init(anchorTop: CGPoint,
                anchorMid: CGPoint,
                mergeBox: CGPoint,
                colorA: Color,
                colorB: Color,
                lineThickness: CGFloat = 8) {
        self.anchorTop = anchorTop
        self.anchorMid = anchorMid
        self.mergeBox = mergeBox
        self.colorA = colorA
        self.colorB = colorB
        self.lineThickness = lineThickness
    }

    public var body: some View {
        Canvas { context, _ in
            // Four-segment polyline per side. The V-arrowhead
            // (previously drawn at the vertical middle) was removed
            // per user feedback "把这两个箭头都去掉。折线保留"
            // — the polyline itself is kept as the clean connector,
            // but the two diagonal V arms are gone.
            //
            //   1. STEM    : anchor slot bottom → quarter-Y (top half
            //                 start)
            //   2. ARM     : horizontal at quarter-Y (elbow)
            //   3. TIP     : quarter-Y → half-Y (polyline's vertical
            //                 centre)
            //   4. TAIL    : half-Y → merge box top (bottom half
            //                 end)
            //
            // Equal-length top half (stem + arm + tip) and bottom
            // half (tail) keep the connector visually balanced. All
            // elbows are joined with lineJoin: .round so the
            // bends look like soft right angles.
            let polylineExtent = mergeBox.y - anchorTop.y
            let quarterY = anchorTop.y + polylineExtent / 4
            let halfY = anchorTop.y + polylineExtent / 2

            let stemEndA = CGPoint(x: anchorTop.x, y: quarterY)
            let stemEndB = CGPoint(x: anchorMid.x, y: quarterY)
            let armEnd = CGPoint(x: mergeBox.x, y: quarterY)
            let vTip = CGPoint(x: mergeBox.x, y: halfY)

            let pathA = Path { p in
                p.move(to: anchorTop)
                p.addLine(to: stemEndA)   // 1. stem (down)
                p.addLine(to: armEnd)     // 2. arm (in)
                p.addLine(to: vTip)        // 3. tip (down to V)
                p.addLine(to: mergeBox)   // 4. tail (down to box)
            }
            context.stroke(
                pathA,
                with: .color(colorA.opacity(0.85)),
                style: StrokeStyle(
                    lineWidth: lineThickness,
                    lineCap: .round,
                    lineJoin: .round
                )
            )

            let pathB = Path { p in
                p.move(to: anchorMid)
                p.addLine(to: stemEndB)   // 1. stem (down)
                p.addLine(to: armEnd)     // 2. arm (in)
                p.addLine(to: vTip)        // 3. tip (down to V)
                p.addLine(to: mergeBox)   // 4. tail (down to box)
            }
            context.stroke(
                pathB,
                with: .color(colorB.opacity(0.85)),
                style: StrokeStyle(
                    lineWidth: lineThickness,
                    lineCap: .round,
                    lineJoin: .round
                )
            )

            // V-arrowhead at the polyline's exact centre (halfY)
            // was removed per user feedback "把这两个箭头都去掉。
            // 折线保留" — both V arms (the two diagonal arrows that
            // form the chevron at the middle) are gone; the polyline
            // (stem → arm → tip → tail) keeps drawing as a clean
            // 4-segment connector.
        }
        .allowsHitTesting(false)
    }
}

/// A single L3-style 4-segment polyline from `from` (source slot
/// BOTTOM) to `to` (destination slot TOP). The shape mirrors
/// `L1MergeLines` but is parameterized over a single (from, to)
/// pair instead of two converging arms.
///
/// Polyline shape:
///
///   1. STEM    : from → (from.x, quarterY)         (vertical drop)
///   2. ARM     : (from.x, quarterY) → (to.x, ...)  (horizontal elbow)
///   3. TIP     : (to.x, quarterY) → (to.x, halfY)  (short vertical)
///   4. TAIL    : (to.x, halfY) → to                (vertical drop)
///
/// where quarterY = from.y + (to.y - from.y) / 4 and halfY =
/// from.y + (to.y - from.y) / 2. The equal-length top half (STEM
/// + ARM + TIP) and bottom half (TAIL) keep the connector visually
/// balanced, and the TIP+TAIL together form a clean vertical drop
/// into the destination slot (no V-arrowhead, per "把这两个箭头都
/// 去掉。折线保留").
///
/// Used by:
///   * L7 (十几减几)  — ∧ split arrows from anchor.a to split[0]
///                      and split[2]; ∨ combine arrows from
///                      split[2] and split[4] down to result[2].
///   * L8 (破十法)   — same shape with the decomposition swapped
///                      (ones at slot 0, 10 at slot 2).
///
/// Compare:
///   * `PolylineArrow`  — 3-segment polyline (stem → arm → tip) with
///     a single bend near the destination. Simpler shape, used by
///     L1's merge arrows when a single-source / single-destination
///     connector is enough.
///   * `PolylineConnectors` — same as `PolylineArrow` but accepts
///     a list of (from, to, color) segments and uses midY as the
///     bend point. Used by L5 (二十以内) and L6 (十几加十几).
///   * `SymmetricVDiagram` — two-arm V where each arm is a
///     3-segment polyline (stem → arm → tip) AND both arms have the
///     SAME total length. The lengths are equalised by adjusting
///     each arm's tip length — the shorter arm gets a longer tip,
///     the longer arm gets a shorter (or zero) tip. Used by L5 / L6
///     to draw symmetric "anchor splits into 10 + ones" diagrams.
public struct L3StylePolyline: View {
    public let from: CGPoint   // BOTTOM of source slot
    public let to: CGPoint     // TOP of destination slot
    public let color: Color
    public let lineThickness: CGFloat
    public let opacity: Double

    public init(from: CGPoint,
                to: CGPoint,
                color: Color,
                lineThickness: CGFloat = 8,
                opacity: Double = 0.85) {
        self.from = from
        self.to = to
        self.color = color
        self.lineThickness = lineThickness
        self.opacity = opacity
    }

    public var body: some View {
        Canvas { context, _ in
            // Skip zero/negative extents — they'd draw a single dot
            // or back-flow into the source row.
            let extent = to.y - from.y
            guard extent > 1 else { return }

            let quarterY = from.y + extent / 4
            let halfY = from.y + extent / 2

            let armEnd = CGPoint(x: to.x, y: quarterY)
            let vTip = CGPoint(x: to.x, y: halfY)

            let path = Path { p in
                p.move(to: from)
                p.addLine(to: CGPoint(x: from.x, y: quarterY))   // 1. STEM (vertical drop)
                p.addLine(to: armEnd)                              // 2. ARM (horizontal elbow)
                p.addLine(to: vTip)                                // 3. TIP (short vertical)
                p.addLine(to: to)                                  // 4. TAIL (vertical drop to destination)
            }
            context.stroke(
                path,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(
                    lineWidth: lineThickness,
                    lineCap: .round,
                    lineJoin: .round
                )
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Symmetric V diagram
//
// Renders a "1 source → 2 destinations" V where BOTH arms have the
// SAME total length. Used by L5 (二十以内) and L6 (十几加十几) for
// the anchor → split decomposition arrows so the two arms are
// visually symmetric — same total length regardless of how far
// each destination is from the source.
//
// Shape per arm: 3-segment polyline (stem → arm → tip), no V
// arrowhead at the destination (per "把这两个箭头都去掉。折线保留").
//
//   source
//     │
//     │ stem = L_s
//     ▼
//     ●  ← bend point (same for both arms)
//     ├──► arm = |dest.x - source.x|    (forced by geometry)
//     │
//     ▼ tip = (L_total - L_s) - arm
//     ●  ← destination
//
// Both arms share the SAME `L_total` (= stem + arm + tip). The
// bend point sits at `(source.x, source.y + L_s)` — same x as the
// source so the stems are visually vertical and aligned. The tip
// length compensates for the difference in arm length, so the two
// destinations are reached by equal-length elbows.
//
// `L_total` defaults to the vertical extent from source to
// destinations (when source and destinations share a y) — that
// gives both arms a total length equal to that vertical distance,
// matching the JS drawLink diagonal length.

public struct SymmetricVDiagram: View {
    public let source: CGPoint      // bottom of source slot
    public let destA: CGPoint       // top of left destination slot
    public let destB: CGPoint       // top of right destination slot
    public let colorA: Color
    public let colorB: Color
    public let lineThickness: CGFloat
    public let opacity: Double
    /// Override the leg length. Defaults to the vertical extent from
    /// source to the destinations' y (so both arms = that vertical
    /// distance). Set to a larger value to make the arms longer
    /// than the vertical gap.
    public let totalLength: CGFloat?

    public init(source: CGPoint,
                destA: CGPoint,
                destB: CGPoint,
                colorA: Color,
                colorB: Color,
                lineThickness: CGFloat = 7,
                opacity: Double = 0.85,
                totalLength: CGFloat? = nil) {
        self.source = source
        self.destA = destA
        self.destB = destB
        self.colorA = colorA
        self.colorB = colorB
        self.lineThickness = lineThickness
        self.opacity = opacity
        self.totalLength = totalLength
    }

    public var body: some View {
        Canvas { context, _ in
            // Compute the V's geometry once per draw. Both arms share
            // the same total length and bend point; only the arm
            // (horizontal) and tip (vertical into destination) differ.
            let avgDestY = (destA.y + destB.y) / 2
            // The V opens either DOWNWARD (source above destinations,
            // typical ∨ — used by L5's anchor → split and L6's anchor
            // → split1, split1 → split2) or UPWARD (source below
            // destinations, ∨-flip — kept here for any future use
            // case; L6's two-source / one-apex merge diagrams use
            // `PolylineConnectors(.elbow)` instead). `sign` flips the
            // y direction for the upward case so the bend, arm, and
            // tip all sit on the correct side of the source.
            let sourceAboveDest = source.y < avgDestY
            let verticalExtent = max(1, abs(avgDestY - source.y))
            // Default leg length = vertical distance from source to
            // destination row. This makes the V look as compact as
            // possible while still reaching both destinations.
            let L = totalLength ?? verticalExtent
            // Stem length: drop straight down (or up, for the
            // upward-V case) for ~40% of L. The remaining 60% is
            // split between arm and tip. 40% stem reads as a clear
            // "the connector originates here" anchor before the arm
            // bends horizontally.
            let stemLen = L * 0.4
            let sign: CGFloat = sourceAboveDest ? 1 : -1
            let bend = CGPoint(x: source.x, y: source.y + stemLen * sign)

            func drawArm(from: CGPoint, dest: CGPoint, color: Color) {
                let armLen = abs(dest.x - bend.x)
                // tipLen = (L - stemLen) - armLen. If armLen exceeds
                // the remaining budget (the destination is far
                // horizontally and the vertical gap is short), tipLen
                // clamps to 0 — but we still need to reach `dest`,
                // so we extend the path with one more vertical drop
                // (downward V) or rise (upward V). Without this
                // extension the longer arm of an asymmetric V hangs
                // in mid-air above / below the destination (visible
                // "缺口" / gap between the line tip and the box
                // outline). See the L5 anchor → split V: the right
                // arm to "5" has small armLen + long tip and reaches
                // cleanly; the left arm to "10" has large armLen,
                // tipLen clamps to 0, and the line stops short of
                // "10".
                let tipLen = max(0, (L - stemLen) - armLen)
                let armEndX = bend.x + (dest.x >= bend.x ? armLen : -armLen)
                let armEnd = CGPoint(x: armEndX, y: bend.y)
                let tipEnd = CGPoint(x: armEnd.x, y: armEnd.y + tipLen * sign)

                var path = Path()
                path.move(to: from)            // 1. STEM (vertical)
                path.addLine(to: bend)         //    continues to bend
                path.addLine(to: armEnd)       // 2. ARM (horizontal)
                path.addLine(to: tipEnd)       // 3. TIP (vertical)
                // 4. REACH toward destination. Only drawn when
                // tipEnd hasn't gotten close enough to dest. Leaves a
                // few pixels of clearance so the line doesn't punch
                // into the destination's box outline. For a downward
                // V (dest = top edge), clearance sits just above
                // dest.y; for an upward V (dest = bottom edge),
                // clearance sits just below dest.y.
                let clearance: CGFloat = 4
                if sourceAboveDest {
                    // Downward V — tipEnd should be above dest.
                    if tipEnd.y < dest.y - 1 {
                        let finalY = max(tipEnd.y + 1, dest.y - clearance)
                        path.addLine(to: CGPoint(x: dest.x, y: finalY))
                    }
                } else {
                    // Upward V — tipEnd should be below dest.
                    if tipEnd.y > dest.y + 1 {
                        let finalY = min(tipEnd.y - 1, dest.y + clearance)
                        path.addLine(to: CGPoint(x: dest.x, y: finalY))
                    }
                }
                context.stroke(
                    path,
                    with: .color(color.opacity(opacity)),
                    style: StrokeStyle(
                        lineWidth: lineThickness,
                        lineCap: .round,
                        lineJoin: .round
                    )
                )
            }

            drawArm(from: source, dest: destA, color: colorA)
            drawArm(from: source, dest: destB, color: colorB)
        }
        .allowsHitTesting(false)
    }
}

/// A generic overlay that draws lines between two `MathExpression`
/// slot coordinates, given a list of source/target slot positions.
/// Each entry draws an ArrowConnector with a per-arrow color.
///
/// Source points are in the *coordinate space of the StepRender* (the
/// step's VStack). The caller is responsible for translating the
/// MathExpression's local slot centers into that space.
public struct StepArrows: View {
    public struct Segment: Identifiable {
        public let id = UUID()
        public let from: CGPoint
        public let to: CGPoint
        public let color: Color
    }

    public let segments: [Segment]

    public var body: some View {
        ZStack {
            ForEach(segments) { seg in
                ArrowConnector(from: seg.from, to: seg.to, color: seg.color)
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Polyline connectors overlay (no V-arrowheads)

/// A reusable Canvas that draws N 3-segment polylines from a list of
/// `(from, to, color)` segments. No V-arrowheads are drawn at the
/// destination — per user feedback ("把这两个箭头都去掉。折线保留")
/// the clean elbow connector is preferred over a polyline + V
/// arrowhead.
///
/// Each connector's shape:
///
///   1. Drop straight DOWN from `from` for ~half the vertical
///      distance (`from.y → midY`). This is the STEM.
///   2. Bend INWARD horizontally toward `to.x` at the midY level.
///      This is the ARM.
///   3. Drop the remaining vertical distance into `to`. This is
///      the TIP.
///
/// With a small `tailDrop` set to `to.y - tipEnd.y` we leave a few
/// pixels of clearance above the destination slot so the line doesn't
/// punch into the box outline.
///
/// Used by L5 (二十以内) and L6 (十几加十几) for their multi-row
/// decomposition diagrams. Pass any number of segments; segments whose
/// `from`/`to` are identical collapse to a no-op so partial layout
/// (during `onAppear` before all rows have rendered) doesn't draw
/// stray zero-length connectors.
///
/// `style` controls the visual shape per segment:
///   * `.straight`  — single diagonal line from `from` to `to`
///                    (mirrors the JS `drawLink` shape — a rotated
///                    rectangle in the original code). Best for
///                    1-to-1 or 1-to-2 decompositions where the
///                    V-shape reads as "feed into".
///   * `.elbow`     — 3-segment polyline (stem → arm → tip). The
///                    bend at the vertical midpoint makes the line
///                    read as "this slot connects to that slot"
///                    rather than a ray. Best for long vertical
///                    jumps where a diagonal would slice through
///                    unrelated slots.
///   * `.symmetric` — 3-segment polyline (stem → arm → tip) where
///                    every segment has the SAME length. Multiple
///                    `.symmetric` connectors that originate from the
///                    same source slot therefore have the SAME total
///                    length — visually a clean V where every arm is
///                    the same length, regardless of how far the
///                    destinations are. Required for the L5 / L6
///                    "anchor splits into 10 + ones" diagram so the
///                    two decomposition arms are symmetric.
public struct PolylineConnectors: View {
    public enum Style { case straight, elbow, symmetric }

    public struct Segment: Identifiable {
        public let id = UUID()
        public let from: CGPoint
        public let to: CGPoint
        public let color: Color
        public let thickness: CGFloat
        public let opacity: Double
        public let style: Style

        public init(from: CGPoint,
                    to: CGPoint,
                    color: Color,
                    thickness: CGFloat = 6,
                    opacity: Double = 0.75,
                    style: Style = .straight) {
            self.from = from
            self.to = to
            self.color = color
            self.thickness = thickness
            self.opacity = opacity
            self.style = style
        }
    }

    public let segments: [Segment]

    public init(segments: [Segment]) {
        self.segments = segments
    }

    public var body: some View {
        Canvas { context, _ in
            for seg in segments {
                let dx = seg.to.x - seg.from.x
                let dy = seg.to.y - seg.from.y
                let len = (dx * dx + dy * dy).squareRoot()
                // Zero-length segments would draw a single point — skip
                // them. Same for back-flowing segments (dy < 1).
                guard len > 1, dy > 1 else { continue }

                var path = Path()
                switch seg.style {
                case .straight:
                    // Single diagonal segment — the JS drawLink shape.
                    // Two decompositions originating from the same
                    // source slot read as a clean V (mirrors how
                    // anchor.a branches into split[0] / split[2]).
                    path.move(to: seg.from)
                    path.addLine(to: seg.to)
                case .elbow:
                    // 3-segment polyline: stem (down) → arm (across)
                    // → tip (down). Bend at the vertical midpoint.
                    let midY = (seg.from.y + seg.to.y) / 2
                    let stemEnd = CGPoint(x: seg.from.x, y: midY)
                    let armEnd  = CGPoint(x: seg.to.x,   y: midY)
                    path.move(to: seg.from)
                    path.addLine(to: stemEnd)
                    path.addLine(to: armEnd)
                    path.addLine(to: seg.to)
                case .symmetric:
                    // 3-segment polyline where stem, arm, and tip
                    // each have the SAME length. The bend point is
                    // placed so all three legs equal `unitLen` —
                    // computed from `unitLen = min(stemLen, armLen,
                    // tipLen) / 2` so the connector always fits
                    // regardless of the destination distance, and
                    // every symmetric connector that originates from
                    // the same source has the same shape regardless
                    // of how far the destinations are.
                    //
                    // Compute the natural lengths first:
                    //   stemLen = vertical drop from source down
                    //             toward the destination's y level.
                    //   tipLen  = vertical drop into the destination.
                    //   armLen  = horizontal distance the arm has to
                    //             travel to reach the destination's x.
                    // Then use `unitLen = min(stemLen, tipLen, armLen) / 2`
                    // so all three legs are equal AND fit.
                    let stemLen = max(0, seg.to.y - seg.from.y) * 0.5
                    let tipLen  = max(0, seg.to.y - seg.from.y) * 0.5
                    let armLen  = abs(dx)
                    let unitLen = max(8, min(stemLen, tipLen, armLen) / 2)
                    // Bend point: start at `from`, drop `unitLen` down,
                    // then travel `unitLen` horizontally toward `to.x`,
                    // then drop `unitLen` down into `to`. For the arm
                    // direction we mirror `dx` toward the destination
                    // (positive dx → arm goes right; negative → left).
                    let stemEnd = CGPoint(x: seg.from.x,
                                          y: seg.from.y + unitLen)
                    let armDir: CGFloat = dx >= 0 ? 1 : -1
                    let armEnd = CGPoint(x: stemEnd.x + armDir * unitLen,
                                         y: stemEnd.y)
                    // Tip endpoint: sit just above `to` (drops the
                    // last `unitLen` into the destination). When the
                    // destination is directly below the source, the
                    // arm collapses to a vertical line; when the
                    // destination is far horizontally, the arm length
                    // is capped at `unitLen` (so two symmetric arms
                    // from the same source produce equal-length
                    // elbows regardless of destination x).
                    let tipEnd = CGPoint(x: armEnd.x,
                                         y: armEnd.y + unitLen)
                    path.move(to: seg.from)
                    path.addLine(to: stemEnd)
                    path.addLine(to: armEnd)
                    path.addLine(to: tipEnd)
                }

                context.stroke(
                    path,
                    with: .color(seg.color.opacity(seg.opacity)),
                    style: StrokeStyle(
                        lineWidth: seg.thickness,
                        lineCap: .round,
                        lineJoin: .round
                    )
                )
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Polyline arrow (3-segment: stem → arm → tip)

/// A single connector drawn as a 3-segment polyline (per user
/// feedback "用折线链接"):
///
///   1. Drop straight DOWN from `from` for `stemDrop` pixels.
///   2. Bend INWARD horizontally toward `to.x`.
///   3. Drop straight DOWN into `to`.
///
/// This gives every connector a clean "elbow-then-tick" shape — the
/// V arrowhead at the destination is drawn separately by the
/// `arrowPoint` parameter (use `L1MergeLines` for a V-shape, or
/// `nil` here for no arrowhead).
///
/// Used by:
///   * L3 (两个数凑十) — anchor's pair addends → preview's merge box.
///   * L7 (十几减几)  — anchor.a → split row's 10 + ones slots.
///   * L8 (破十法)    — anchor.a → split row's ones + 10 slots.
///   * Future levels that want the same elbow tick.
public struct PolylineArrow: View {
    public let from: CGPoint
    public let to: CGPoint
    public let color: Color
    public let stemDrop: CGFloat
    public let thickness: CGFloat
    public let opacity: Double

    public init(from: CGPoint,
                to: CGPoint,
                color: Color,
                stemDrop: CGFloat = 22,
                thickness: CGFloat = 8,
                opacity: Double = 0.85) {
        self.from = from
        self.to = to
        self.color = color
        self.stemDrop = stemDrop
        self.thickness = thickness
        self.opacity = opacity
    }

    public var body: some View {
        Canvas { context, _ in
            // Three-segment polyline:
            //   stemEnd  = (from.x, to.y - stemDrop)   — vertical stem end
            //   armEnd   = (to.x,   to.y - stemDrop)   — horizontal arm end
            //   to       = (to.x,   to.y)              — the destination
            let stemEnd = CGPoint(x: from.x, y: to.y - stemDrop)
            let armEnd  = CGPoint(x: to.x, y: to.y - stemDrop)
            let path = Path { p in
                p.move(to: from)
                p.addLine(to: stemEnd)   // 1. vertical stem
                p.addLine(to: armEnd)    // 2. horizontal arm
                p.addLine(to: to)         // 3. vertical tip
            }
            context.stroke(
                path,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(
                    lineWidth: thickness,
                    lineCap: .round,
                    lineJoin: .round
                )
            )
        }
        .allowsHitTesting(false)
    }
}

/// A small V-shape arrowhead drawn at `point` with two short
/// diagonal lines that converge at the point and open in `opening`
/// direction. Use as the termination of a `PolylineArrow` (or any
/// straight connector) when you want a V rather than a closed tip.
public struct VArrowTip: View {
    public enum Opening { case up, down }

    public let point: CGPoint
    public let opening: Opening
    public let halfWidth: CGFloat
    public let height: CGFloat
    public let thickness: CGFloat
    public let color: Color
    public let opacity: Double

    public init(point: CGPoint,
                opening: Opening = .up,
                halfWidth: CGFloat = 18,
                height: CGFloat = 20,
                thickness: CGFloat = 9,
                color: Color,
                opacity: Double = 0.9) {
        self.point = point
        self.opening = opening
        self.halfWidth = halfWidth
        self.height = height
        self.thickness = thickness
        self.color = color
        self.opacity = opacity
    }

    public var body: some View {
        Canvas { context, _ in
            let sign: CGFloat = (opening == .up) ? -1 : 1
            let leftEnd = CGPoint(x: point.x - halfWidth, y: point.y + sign * height)
            let rightEnd = CGPoint(x: point.x + halfWidth, y: point.y + sign * height)
            var leftPath = Path()
            leftPath.move(to: leftEnd)
            leftPath.addLine(to: point)
            context.stroke(
                leftPath,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(lineWidth: thickness, lineCap: .round, lineJoin: .round)
            )
            var rightPath = Path()
            rightPath.move(to: rightEnd)
            rightPath.addLine(to: point)
            context.stroke(
                rightPath,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(lineWidth: thickness, lineCap: .round, lineJoin: .round)
            )
        }
        .allowsHitTesting(false)
    }
}

/// A polyline + V arrowhead combo, ready to drop into a step
/// layout. Used by L7/L8's decomposition views — they want the
/// same elbow-tick + V shape as L2's merge lines but parameterized
/// over arbitrary (from, to) points.
public struct PolylineWithVTip: View {
    public let from: CGPoint
    public let to: CGPoint
    public let color: Color
    public let stemDrop: CGFloat
    public let lineThickness: CGFloat
    public let tipHalfWidth: CGFloat
    public let tipHeight: CGFloat
    public let tipThickness: CGFloat
    public let tipOpening: VArrowTip.Opening

    public init(from: CGPoint,
                to: CGPoint,
                color: Color,
                stemDrop: CGFloat = 22,
                lineThickness: CGFloat = 8,
                tipHalfWidth: CGFloat = 18,
                tipHeight: CGFloat = 20,
                tipThickness: CGFloat = 9,
                tipOpening: VArrowTip.Opening = .up) {
        self.from = from
        self.to = to
        self.color = color
        self.stemDrop = stemDrop
        self.lineThickness = lineThickness
        self.tipHalfWidth = tipHalfWidth
        self.tipHeight = tipHeight
        self.tipThickness = tipThickness
        self.tipOpening = tipOpening
    }

    public var body: some View {
        ZStack {
            PolylineArrow(
                from: from, to: to, color: color,
                stemDrop: stemDrop, thickness: lineThickness
            )
            VArrowTip(
                point: to, opening: tipOpening,
                halfWidth: tipHalfWidth, height: tipHeight,
                thickness: tipThickness, color: color
            )
        }
    }
}

// MARK: - Slot layout capture (for cross-expression arrows)

/// Captures each MathSlot's center (in the parent's coordinate space)
/// via a GeometryReader and an overlay. Used by levels that need to
/// know where the "5" of "5+3=?" is on screen so they can draw an
/// arrow to another equation's slot.
///
/// Use as:
///   MathExpressionWithSlots(slots: ..., size: ..., id: ...) { centers in
///     // centers[idx] is the (x, y) of slot idx in MathExpression-local space.
///   }
public struct MathExpressionWithSlots: View {
    public let slots: [MathSlot]
    public let size: CGFloat
    public let onLayout: ([CGPoint]) -> Void

    public var body: some View {
        GeometryReader { geo in
            let cx = geo.size.width / 2
            let layout = ExpressionLayoutCache.shared.layout(
                key: slots.map { $0.reserveKey }.joined(separator: "|"),
                slots: slots,
                size: size,
                xCenter: cx,
                yCenter: geo.size.height / 2
            )
            ZStack {
                ForEach(Array(slots.enumerated()), id: \.offset) { idx, slot in
                    tokenView(slot: slot, at: layout.centerX(at: idx), size: size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                let centers = (0..<slots.count).map { i in
                    CGPoint(x: layout.centerX(at: i), y: geo.size.height / 2)
                }
                onLayout(centers)
            }
            .onChange(of: geo.size) { _, newSize in
                let centers = (0..<slots.count).map { i in
                    CGPoint(x: layout.centerX(at: i), y: newSize.height / 2)
                }
                onLayout(centers)
            }
        }
    }

    @ViewBuilder
    private func tokenView(slot: MathSlot, at centerX: CGFloat, size: CGFloat) -> some View {
        switch slot {
        case .number(let value, let color, let sizeMultiplier):
            let s = size * (sizeMultiplier ?? 1.0)
            Text("\(value)")
                .font(.pandaFont(size: s))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2)
        case .op(let op, let color):
            Text(op.rawValue)
                .font(.pandaFont(size: size * 0.7))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2 - size * 0.05)
        case .answerBox(let placeholder, let color, let label):
            // Same fix as MathExpression.MathExpression: forward the
            // placeholder glyph ("□" / "?") to the answer box so
            // `.answerBox("?")` actually renders the "?" instead of
            // an empty box. `label` is an optional override; default
            // to `placeholder` when nil.
            AnswerBoxShapeView(color: color ?? PandaTheme.ink,
                               size: size,
                               label: label ?? placeholder)
                .position(x: centerX, y: size / 2)
        }
    }
}

/// Lightweight duplicate of `AnswerBoxShape` (kept private in
/// MathExpression.swift) so the layout-capture view can render
/// answer boxes without depending on the private type.
struct AnswerBoxShapeView: View {
    let color: RGB
    let size: CGFloat
    let label: String?

    var body: some View {
        let boxSize = size * 0.9
        // Single-frame rendering, matches `AnswerBoxShape` in
        // `Components/MathExpression.swift`. The inner `?` / `□`
        // glyph is intentionally omitted per user feedback "应该只
        // 保留□一个" — only the outer frame is rendered so the box
        // doesn't read as a frame-inside-a-frame. `label` is kept
        // in the API for backwards compatibility with every caller
        // that still passes `.answerBox("?")` / `.answerBox("□")`,
        // but the value is no longer drawn.
        RoundedRectangle(cornerRadius: boxSize * 0.16)
            .fill(Color(PandaTheme.card))
            .overlay(
                RoundedRectangle(cornerRadius: boxSize * 0.16)
                    .strokeBorder(Color(color),
                                  lineWidth: max(4, size * 0.08))
            )
            .frame(width: boxSize, height: boxSize)
    }
}

// MARK: - Slot-aware step rows
//
// The most common decomposition pattern in the original is: an anchor
// row at the top + a body visual (cells / preview / split) + the
// active sub-question at the bottom, with curves drawn between the
// anchor and the body. `SlotRow` is a container that lays out a
// `MathExpressionWithSlots` in the centre of a frame and reports the
// (x, y) of any slot back to the parent via a binding.

/// Lays out a single `MathExpression` centred in a fixed-height
/// frame and reports each slot's centre via `onLayout`. The parent's
/// coordinate space is the same as the SlotRow's frame, so an arrow
/// can be drawn from `anchorSlots[i] + SlotRow.frame.origin` to
/// `bodySlots[j] + SlotRow.frame.origin` without further translation.
public struct SlotRow: View {
    public let slots: [MathSlot]
    public let size: CGFloat
    public let height: CGFloat
    public let onLayout: (CGRect, [CGPoint]) -> Void

    public init(slots: [MathSlot],
                size: CGFloat,
                height: CGFloat = 100,
                onLayout: @escaping (CGRect, [CGPoint]) -> Void) {
        self.slots = slots
        self.size = size
        self.height = height
        self.onLayout = onLayout
    }

    public var body: some View {
        GeometryReader { geo in
            let cx = geo.size.width / 2
            let layout = ExpressionLayoutCache.shared.layout(
                key: slots.map { $0.reserveKey }.joined(separator: "|"),
                slots: slots,
                size: size,
                xCenter: cx,
                yCenter: geo.size.height / 2
            )
            ZStack {
                ForEach(Array(slots.enumerated()), id: \.offset) { idx, slot in
                    tokenView(slot: slot, at: layout.centerX(at: idx), size: size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                let centers = (0..<slots.count).map { i in
                    CGPoint(x: layout.centerX(at: i), y: geo.size.height / 2)
                }
                onLayout(geo.frame(in: .local), centers)
            }
        }
        .frame(height: height)
    }

    @ViewBuilder
    private func tokenView(slot: MathSlot, at centerX: CGFloat, size: CGFloat) -> some View {
        switch slot {
        case .number(let value, let color, let sizeMultiplier):
            let s = size * (sizeMultiplier ?? 1.0)
            Text("\(value)")
                .font(.pandaFont(size: s))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2)
        case .op(let op, let color):
            Text(op.rawValue)
                .font(.pandaFont(size: size * 0.7))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2 - size * 0.05)
        case .answerBox(let placeholder, let color, let label):
            // Same fix as MathExpression.MathExpression: forward the
            // placeholder glyph ("□" / "?") to the answer box so
            // `.answerBox("?")` actually renders the "?" instead of
            // an empty box. `label` is an optional override; default
            // to `placeholder` when nil.
            AnswerBoxShapeView(color: color ?? PandaTheme.ink,
                               size: size,
                               label: label ?? placeholder)
                .position(x: centerX, y: size / 2)
        }
    }
}

// MARK: - Decomposition view (top row + bottom row + connecting arrows)

/// A combined view that lays out a top `SlotRow` and a bottom
/// `SlotRow`, then draws arrows between slots per `ArrowSpec`. The
/// whole thing renders inside a single VStack-shaped frame so the
/// arrows live in the same coordinate space as both rows.
public struct DecompositionView: View {
    public struct ArrowSpec: Identifiable {
        public let id = UUID()
        public let fromRow: Int        // 0 = top, 1 = bottom
        public let fromSlot: Int
        public let toRow: Int
        public let toSlot: Int
        public let color: Color
        public let vArrowhead: Bool
    }

    public let topSlots: [MathSlot]
    public let topSize: CGFloat
    public let bottomSlots: [MathSlot]
    public let bottomSize: CGFloat
    public let arrows: [ArrowSpec]
    public let gap: CGFloat
    @State private var topCenters: [CGPoint] = []
    @State private var topFrame: CGRect = .zero
    @State private var bottomCenters: [CGPoint] = []
    @State private var bottomFrame: CGRect = .zero

    public init(topSlots: [MathSlot],
                topSize: CGFloat = 64,
                bottomSlots: [MathSlot],
                bottomSize: CGFloat = 64,
                arrows: [ArrowSpec] = [],
                gap: CGFloat = 36) {
        self.topSlots = topSlots
        self.topSize = topSize
        self.bottomSlots = bottomSlots
        self.bottomSize = bottomSize
        self.arrows = arrows
        self.gap = gap
    }

    public var body: some View {
        VStack(spacing: gap) {
            SlotRow(
                slots: topSlots,
                size: topSize,
                height: topSize + 24,
                onLayout: { frame, centers in
                    topFrame = frame
                    topCenters = centers
                }
            )
            SlotRow(
                slots: bottomSlots,
                size: bottomSize,
                height: bottomSize + 24,
                onLayout: { frame, centers in
                    bottomFrame = frame
                    bottomCenters = centers
                }
            )
        }
        .overlay {
            GeometryReader { geo in
                Canvas { context, _ in
                    for spec in arrows {
                        let fromCenters = spec.fromRow == 0 ? topCenters : bottomCenters
                        let fromFrame = spec.fromRow == 0 ? topFrame : bottomFrame
                        let toCenters = spec.toRow == 0 ? topCenters : bottomCenters
                        let toFrame = spec.toRow == 0 ? topFrame : bottomFrame
                        guard fromCenters.indices.contains(spec.fromSlot),
                              toCenters.indices.contains(spec.toSlot) else { continue }
                        let from = CGPoint(
                            x: fromFrame.minX + fromCenters[spec.fromSlot].x,
                            y: fromFrame.minY + fromCenters[spec.fromSlot].y
                        )
                        let to = CGPoint(
                            x: toFrame.minX + toCenters[spec.toSlot].x,
                            y: toFrame.minY + toCenters[spec.toSlot].y
                        )
                        var path = Path()
                        path.move(to: from)
                        path.addLine(to: to)
                        context.stroke(
                            path,
                            with: .color(spec.color.opacity(0.75)),
                            style: StrokeStyle(lineWidth: 5, lineCap: .round)
                        )
                        if spec.vArrowhead {
                            let sign: CGFloat = (to.y > from.y) ? 1 : -1
                            let leftEnd = CGPoint(x: to.x - 14, y: to.y + sign * 18)
                            let rightEnd = CGPoint(x: to.x + 14, y: to.y + sign * 18)
                            var left = Path()
                            left.move(to: leftEnd)
                            left.addLine(to: to)
                            context.stroke(
                                left,
                                with: .color(spec.color.opacity(0.85)),
                                style: StrokeStyle(lineWidth: 6, lineCap: .round)
                            )
                            var right = Path()
                            right.move(to: rightEnd)
                            right.addLine(to: to)
                            context.stroke(
                                right,
                                with: .color(spec.color.opacity(0.85)),
                                style: StrokeStyle(lineWidth: 6, lineCap: .round)
                            )
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .allowsHitTesting(false)
            }
        }
    }
}

// MARK: - Polyline Decomposition view (top row + bottom row + connecting polyline arrows)

/// Same layout as `DecompositionView` (top SlotRow + bottom
/// SlotRow + connecting arrows between them) but with the polyline
/// (stem → arm → tip) arrow style used by L2's merge lines — every
/// connector drops straight down from its source, bends inward
/// toward the target column, then drops into the target slot. The
/// `vArrowhead` flag on each `ArrowSpec` draws a V-shape arrowhead
/// at the destination (point of the V sits on the slot, arms open
/// upward by default).
///
/// Use for ∧ split arrows (L7/L8 step 1) and ∨ combine arrows
/// (L7/L8 step 3) so all four levels render arrows the same way
/// the kid has already internalised in L2.
public struct PolylineDecompositionView: View {
    public struct ArrowSpec: Identifiable {
        public let id = UUID()
        public let fromRow: Int        // 0 = top, 1 = bottom
        public let fromSlot: Int
        public let toRow: Int
        public let toSlot: Int
        public let color: Color
        public let vArrowhead: Bool
        /// Direction the V opens — `.up` (default) for split
        /// arrows that point DOWN into a slot, `.down` for arrows
        /// whose V should open downward (rare).
        public let vOpening: VArrowTip.Opening

        public init(fromRow: Int,
                    fromSlot: Int,
                    toRow: Int,
                    toSlot: Int,
                    color: Color,
                    vArrowhead: Bool,
                    vOpening: VArrowTip.Opening = .up) {
            self.fromRow = fromRow
            self.fromSlot = fromSlot
            self.toRow = toRow
            self.toSlot = toSlot
            self.color = color
            self.vArrowhead = vArrowhead
            self.vOpening = vOpening
        }
    }

    public let topSlots: [MathSlot]
    public let topSize: CGFloat
    public let bottomSlots: [MathSlot]
    public let bottomSize: CGFloat
    public let arrows: [ArrowSpec]
    public let gap: CGFloat
    /// Drop distance for the vertical stem (px) before the
    /// horizontal arm bends inward toward the destination column.
    public let stemDrop: CGFloat
    /// Main polyline stroke width (px).
    public let lineThickness: CGFloat
    /// V-arrowhead half-width / height / thickness.
    public let tipHalfWidth: CGFloat
    public let tipHeight: CGFloat
    public let tipThickness: CGFloat

    @State private var topCenters: [CGPoint] = []
    @State private var topFrame: CGRect = .zero
    @State private var bottomCenters: [CGPoint] = []
    @State private var bottomFrame: CGRect = .zero

    public init(topSlots: [MathSlot],
                topSize: CGFloat = 64,
                bottomSlots: [MathSlot],
                bottomSize: CGFloat = 64,
                arrows: [ArrowSpec] = [],
                gap: CGFloat = 36,
                stemDrop: CGFloat = 22,
                lineThickness: CGFloat = 7,
                tipHalfWidth: CGFloat = 16,
                tipHeight: CGFloat = 18,
                tipThickness: CGFloat = 8) {
        self.topSlots = topSlots
        self.topSize = topSize
        self.bottomSlots = bottomSlots
        self.bottomSize = bottomSize
        self.arrows = arrows
        self.gap = gap
        self.stemDrop = stemDrop
        self.lineThickness = lineThickness
        self.tipHalfWidth = tipHalfWidth
        self.tipHeight = tipHeight
        self.tipThickness = tipThickness
    }

    public var body: some View {
        VStack(spacing: gap) {
            SlotRow(
                slots: topSlots,
                size: topSize,
                height: topSize + 24,
                onLayout: { frame, centers in
                    topFrame = frame
                    topCenters = centers
                }
            )
            SlotRow(
                slots: bottomSlots,
                size: bottomSize,
                height: bottomSize + 24,
                onLayout: { frame, centers in
                    bottomFrame = frame
                    bottomCenters = centers
                }
            )
        }
        .overlay {
            GeometryReader { geo in
                Canvas { context, _ in
                    for spec in arrows {
                        let fromCenters = spec.fromRow == 0 ? topCenters : bottomCenters
                        let fromFrame = spec.fromRow == 0 ? topFrame : bottomFrame
                        let toCenters = spec.toRow == 0 ? topCenters : bottomCenters
                        let toFrame = spec.toRow == 0 ? topFrame : bottomFrame
                        guard fromCenters.indices.contains(spec.fromSlot),
                              toCenters.indices.contains(spec.toSlot) else { continue }
                        let from = CGPoint(
                            x: fromFrame.minX + fromCenters[spec.fromSlot].x,
                            y: fromFrame.minY + fromCenters[spec.fromSlot].y
                        )
                        let to = CGPoint(
                            x: toFrame.minX + toCenters[spec.toSlot].x,
                            y: toFrame.minY + toCenters[spec.toSlot].y
                        )

                        // Skip self-loops (zero distance — usually
                        // happens when source and target slots are
                        // the same position; drawing them just adds
                        // visual noise at the slot).
                        let dx = to.x - from.x
                        let dy = to.y - from.y
                        let len = (dx * dx + dy * dy).squareRoot()
                        guard len > 1 else { continue }

                        // Three-segment polyline: stem → arm → tip.
                        let stemEnd = CGPoint(x: from.x, y: to.y - stemDrop)
                        let armEnd  = CGPoint(x: to.x,   y: to.y - stemDrop)
                        var path = Path()
                        path.move(to: from)
                        path.addLine(to: stemEnd)        // 1. vertical stem
                        path.addLine(to: armEnd)         // 2. horizontal arm
                        path.addLine(to: to)              // 3. vertical tip
                        context.stroke(
                            path,
                            with: .color(spec.color.opacity(0.85)),
                            style: StrokeStyle(
                                lineWidth: lineThickness,
                                lineCap: .round,
                                lineJoin: .round
                            )
                        )

                        // Optional V-shape arrowhead at the
                        // destination. The point of the V sits on
                        // the slot; arms open upward by default.
                        if spec.vArrowhead {
                            let sign: CGFloat = (spec.vOpening == .up) ? -1 : 1
                            let leftEnd = CGPoint(
                                x: to.x - tipHalfWidth,
                                y: to.y + sign * tipHeight
                            )
                            let rightEnd = CGPoint(
                                x: to.x + tipHalfWidth,
                                y: to.y + sign * tipHeight
                            )
                            var leftPath = Path()
                            leftPath.move(to: leftEnd)
                            leftPath.addLine(to: to)
                            context.stroke(
                                leftPath,
                                with: .color(spec.color.opacity(0.9)),
                                style: StrokeStyle(lineWidth: tipThickness, lineCap: .round, lineJoin: .round)
                            )
                            var rightPath = Path()
                            rightPath.move(to: rightEnd)
                            rightPath.addLine(to: to)
                            context.stroke(
                                rightPath,
                                with: .color(spec.color.opacity(0.9)),
                                style: StrokeStyle(lineWidth: tipThickness, lineCap: .round, lineJoin: .round)
                            )
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .allowsHitTesting(false)
            }
        }
    }
}

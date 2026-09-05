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
/// two curves from the anchor's addends (slot 0, slot 2) DOWN to the
/// simplified preview's first □ (slot 0), each with a V arrowhead at
/// the merge box. The V opens upward toward the anchor.
public struct L1MergeLines: View {
    public let anchorTop: CGPoint       // (x, y) of anchor's first addend BOTTOM
    public let anchorMid: CGPoint       // (x, y) of anchor's second addend BOTTOM
    public let mergeBox: CGPoint        // (x, y) of preview's first □ TOP
    public let colorA: Color
    public let colorB: Color
    public let headHalfWidth: CGFloat
    public let headHeight: CGFloat

    public init(anchorTop: CGPoint,
                anchorMid: CGPoint,
                mergeBox: CGPoint,
                colorA: Color,
                colorB: Color,
                headHalfWidth: CGFloat = 16,
                headHeight: CGFloat = 18) {
        self.anchorTop = anchorTop
        self.anchorMid = anchorMid
        self.mergeBox = mergeBox
        self.colorA = colorA
        self.colorB = colorB
        self.headHalfWidth = headHalfWidth
        self.headHeight = headHeight
    }

    public var body: some View {
        ZStack {
            // Main line from addend A down to merge box
            ArrowConnector(from: anchorTop, to: mergeBox, color: colorA)
            // Main line from addend B down to merge box
            ArrowConnector(from: anchorMid, to: mergeBox, color: colorB)
            // V arrowhead at the merge box, opening upward
            VArrowhead(point: mergeBox, opening: .up,
                       halfWidth: headHalfWidth, height: headHeight,
                       leftColor: colorA, rightColor: colorB)
        }
    }
}

/// Direction the V opens.
public enum VOpening { case up, down }

/// Two short diagonal lines meeting at `point`, opening either up or
/// down. Used as the arrowhead of a V-shaped merge visualization.
public struct VArrowhead: View {
    public let point: CGPoint
    public let opening: VOpening
    public let halfWidth: CGFloat
    public let height: CGFloat
    public let leftColor: Color
    public let rightColor: Color

    public var body: some View {
        Canvas { context, _ in
            let sign: CGFloat = (opening == .up) ? -1 : 1
            let leftEnd = CGPoint(
                x: point.x - halfWidth,
                y: point.y + sign * height
            )
            let rightEnd = CGPoint(
                x: point.x + halfWidth,
                y: point.y + sign * height
            )
            var leftPath = Path()
            leftPath.move(to: leftEnd)
            leftPath.addLine(to: point)
            context.stroke(
                leftPath,
                with: .color(leftColor.opacity(0.8)),
                style: StrokeStyle(lineWidth: 6, lineCap: .round)
            )
            var rightPath = Path()
            rightPath.move(to: rightEnd)
            rightPath.addLine(to: point)
            context.stroke(
                rightPath,
                with: .color(rightColor.opacity(0.8)),
                style: StrokeStyle(lineWidth: 6, lineCap: .round)
            )
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
        case .answerBox(_, let color, let label):
            AnswerBoxShapeView(color: color ?? PandaTheme.ink, size: size, label: label)
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
        ZStack {
            RoundedRectangle(cornerRadius: boxSize * 0.16)
                .stroke(Color(color), lineWidth: max(5, size * 0.10))
                .background(
                    RoundedRectangle(cornerRadius: boxSize * 0.16)
                        .fill(Color(PandaTheme.card))
                )
                .frame(width: boxSize, height: boxSize)
            if let label = label, !label.isEmpty {
                Text(label)
                    .font(.pandaFont(size: size * 0.6))
                    .foregroundColor(Color(color))
            }
        }
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
        case .answerBox(_, let color, let label):
            AnswerBoxShapeView(color: color ?? PandaTheme.ink, size: size, label: label)
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

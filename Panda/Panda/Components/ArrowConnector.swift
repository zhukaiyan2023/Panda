//
//  ArrowConnector.swift
//  Panda
//
//  Shared connector geometry for the math levels.
//

import SwiftUI

// MARK: - Basic connector

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
                with: .color(color.opacity(0.78)),
                style: StrokeStyle(lineWidth: thickness, lineCap: .round, lineJoin: .round)
            )

            let dx = to.x - from.x
            let dy = to.y - from.y
            let len = max(1, hypot(dx, dy))
            let ux = dx / len
            let uy = dy / len
            let px = -uy
            let py = ux
            let base = CGPoint(x: to.x - ux * arrowHeadSize,
                               y: to.y - uy * arrowHeadSize)
            let left = CGPoint(x: base.x + px * arrowHeadSize * 0.5,
                               y: base.y + py * arrowHeadSize * 0.5)
            let right = CGPoint(x: base.x - px * arrowHeadSize * 0.5,
                                y: base.y - py * arrowHeadSize * 0.5)
            let head = Path { p in
                p.move(to: left)
                p.addLine(to: to)
                p.addLine(to: right)
            }
            context.stroke(
                head,
                with: .color(color.opacity(0.86)),
                style: StrokeStyle(lineWidth: thickness + 1, lineCap: .round, lineJoin: .round)
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - L1 merge

/// Two addends feeding one result box. Both elbows use the same bend Y so
/// the bracket reads as one coordinated diagram rather than two unrelated
/// strokes.
public struct L1MergeLines: View {
    public let anchorTop: CGPoint
    public let anchorMid: CGPoint
    public let mergeBox: CGPoint
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
            let sourceY = min(anchorTop.y, anchorMid.y)
            let extent = max(1, mergeBox.y - sourceY)
            let bendY = sourceY + extent * 0.42

            func draw(_ from: CGPoint, color: Color) {
                let path = Path { p in
                    p.move(to: from)
                    p.addLine(to: CGPoint(x: from.x, y: bendY))
                    p.addLine(to: CGPoint(x: mergeBox.x, y: bendY))
                    p.addLine(to: mergeBox)
                }
                context.stroke(
                    path,
                    with: .color(color.opacity(0.82)),
                    style: StrokeStyle(lineWidth: lineThickness,
                                       lineCap: .round,
                                       lineJoin: .round)
                )
            }

            draw(anchorTop, color: colorA)
            draw(anchorMid, color: colorB)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Coordinated single polyline

/// A reusable decomposition elbow. The first horizontal arm has a fixed
/// geometry derived only from the vertical gap, not from the destination's
/// horizontal distance. Therefore two calls with the same source/row (the
/// L7/L8 `10 + ones` split) get equal left/right arm lengths.
public struct L3StylePolyline: View {
    public let from: CGPoint
    public let to: CGPoint
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
            let extent = to.y - from.y
            guard extent > 1 else { return }

            let direction: CGFloat = to.x >= from.x ? 1 : -1
            // Same vertical gap => exactly the same horizontal arm on both
            // sides. Clamp keeps the bracket compact on iPad layouts.
            let armLength = min(58, max(34, extent * 0.52))
            let bendY = from.y + extent * 0.34
            let correctionY = from.y + extent * 0.70
            let branchX = from.x + direction * armLength
            let clearance: CGFloat = 4
            let finalY = to.y - clearance

            let path = Path { p in
                p.move(to: from)
                p.addLine(to: CGPoint(x: from.x, y: bendY))
                p.addLine(to: CGPoint(x: branchX, y: bendY))
                p.addLine(to: CGPoint(x: branchX, y: correctionY))
                // Any destination-spacing correction is kept low in the
                // diagram so the two prominent upper branch arms remain
                // perfectly symmetric.
                p.addLine(to: CGPoint(x: to.x, y: correctionY))
                p.addLine(to: CGPoint(x: to.x, y: finalY))
            }
            context.stroke(
                path,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(lineWidth: lineThickness,
                                   lineCap: .round,
                                   lineJoin: .round)
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Symmetric split diagram

/// One source splitting into two destinations. The branch centre is the exact
/// midpoint of the two destination x positions, so the horizontal arm to `10`
/// and the horizontal arm to the ones digit are mathematically identical.
public struct SymmetricVDiagram: View {
    public let source: CGPoint
    public let destA: CGPoint
    public let destB: CGPoint
    public let colorA: Color
    public let colorB: Color
    public let lineThickness: CGFloat
    public let opacity: Double
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
            let avgDestY = (destA.y + destB.y) / 2
            let downward = avgDestY >= source.y
            let sign: CGFloat = downward ? 1 : -1
            let verticalGap = max(1, abs(avgDestY - source.y))
            let requested = totalLength ?? verticalGap
            let branchOffset = min(verticalGap * 0.48, max(18, requested * 0.40))
            let branchY = source.y + branchOffset * sign

            // This is the key symmetry invariant.
            let leftDest = destA.x <= destB.x ? destA : destB
            let rightDest = destA.x <= destB.x ? destB : destA
            let leftColor = destA.x <= destB.x ? colorA : colorB
            let rightColor = destA.x <= destB.x ? colorB : colorA
            let centerX = (leftDest.x + rightDest.x) / 2
            let halfSpan = abs(rightDest.x - leftDest.x) / 2

            // Shared neck. If the source text is not centred over the two
            // child slots (common with a two-digit `11` above `10 + 1`), move
            // to the true child midpoint before branching. That prevents one
            // branch from becoming visibly longer simply because the source
            // glyph has a different width.
            var neck = Path()
            neck.move(to: source)
            neck.addLine(to: CGPoint(x: source.x, y: branchY))
            if abs(source.x - centerX) > 0.5 {
                neck.addLine(to: CGPoint(x: centerX, y: branchY))
            }
            context.stroke(
                neck,
                with: .color(Color(PandaTheme.ink).opacity(0.30)),
                style: StrokeStyle(lineWidth: lineThickness,
                                   lineCap: .round,
                                   lineJoin: .round)
            )

            func drawArm(dest: CGPoint, color: Color, direction: CGFloat) {
                let branchEnd = CGPoint(x: centerX + direction * halfSpan,
                                        y: branchY)
                let clearance: CGFloat = 4
                let finalY = downward ? dest.y - clearance : dest.y + clearance
                let path = Path { p in
                    p.move(to: CGPoint(x: centerX, y: branchY))
                    p.addLine(to: branchEnd) // equal length on both sides
                    p.addLine(to: CGPoint(x: branchEnd.x, y: finalY))
                }
                context.stroke(
                    path,
                    with: .color(color.opacity(opacity)),
                    style: StrokeStyle(lineWidth: lineThickness,
                                       lineCap: .round,
                                       lineJoin: .round)
                )
            }

            drawArm(dest: leftDest, color: leftColor, direction: -1)
            drawArm(dest: rightDest, color: rightColor, direction: 1)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Generic segment overlay

public struct StepArrows: View {
    public struct Segment: Identifiable {
        public let id = UUID()
        public let from: CGPoint
        public let to: CGPoint
        public let color: Color

        public init(from: CGPoint, to: CGPoint, color: Color) {
            self.from = from
            self.to = to
            self.color = color
        }
    }

    public let segments: [Segment]

    public init(segments: [Segment]) {
        self.segments = segments
    }

    public var body: some View {
        ZStack {
            ForEach(segments) { seg in
                ArrowConnector(from: seg.from, to: seg.to, color: seg.color)
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Polyline connectors overlay

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
                guard hypot(dx, dy) > 1 else { continue }

                var path = Path()
                switch seg.style {
                case .straight:
                    path.move(to: seg.from)
                    path.addLine(to: seg.to)

                case .elbow:
                    let bendY = seg.from.y + dy * 0.45
                    path.move(to: seg.from)
                    path.addLine(to: CGPoint(x: seg.from.x, y: bendY))
                    path.addLine(to: CGPoint(x: seg.to.x, y: bendY))
                    path.addLine(to: seg.to)

                case .symmetric:
                    let direction: CGFloat = dx >= 0 ? 1 : -1
                    let extent = abs(dy)
                    let armLength = min(58, max(32, extent * 0.50))
                    let bendY = seg.from.y + dy * 0.36
                    let correctionY = seg.from.y + dy * 0.72
                    let branchX = seg.from.x + direction * armLength
                    path.move(to: seg.from)
                    path.addLine(to: CGPoint(x: seg.from.x, y: bendY))
                    path.addLine(to: CGPoint(x: branchX, y: bendY))
                    path.addLine(to: CGPoint(x: branchX, y: correctionY))
                    path.addLine(to: CGPoint(x: seg.to.x, y: correctionY))
                    path.addLine(to: seg.to)
                }

                context.stroke(
                    path,
                    with: .color(seg.color.opacity(seg.opacity)),
                    style: StrokeStyle(lineWidth: seg.thickness,
                                       lineCap: .round,
                                       lineJoin: .round)
                )
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Polyline arrow + V tip

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
            let bendY = min(to.y - 8, from.y + max(12, (to.y - from.y) * 0.45))
            let path = Path { p in
                p.move(to: from)
                p.addLine(to: CGPoint(x: from.x, y: bendY))
                p.addLine(to: CGPoint(x: to.x, y: bendY))
                p.addLine(to: to)
            }
            context.stroke(
                path,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(lineWidth: thickness,
                                   lineCap: .round,
                                   lineJoin: .round)
            )
        }
        .allowsHitTesting(false)
    }
}

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
            let sign: CGFloat = opening == .up ? -1 : 1
            let left = CGPoint(x: point.x - halfWidth,
                               y: point.y + sign * height)
            let right = CGPoint(x: point.x + halfWidth,
                                y: point.y + sign * height)
            let path = Path { p in
                p.move(to: left)
                p.addLine(to: point)
                p.addLine(to: right)
            }
            context.stroke(
                path,
                with: .color(color.opacity(opacity)),
                style: StrokeStyle(lineWidth: thickness,
                                   lineCap: .round,
                                   lineJoin: .round)
            )
        }
        .allowsHitTesting(false)
    }
}

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
            PolylineArrow(from: from,
                          to: to,
                          color: color,
                          stemDrop: stemDrop,
                          thickness: lineThickness)
            VArrowTip(point: to,
                      opening: tipOpening,
                      halfWidth: tipHalfWidth,
                      height: tipHeight,
                      thickness: tipThickness,
                      color: color)
        }
    }
}

// MARK: - Shared token rendering / slot capture

private extension View {
    /// Pale yellow/orange/blue numbers sit over a pale meadow background.
    /// A small light halo plus a soft ink shadow keeps the glyph edge legible
    /// without changing the children's color vocabulary.
    func pandaNumberContrast() -> some View {
        self
            .shadow(color: Color.white.opacity(0.90), radius: 1.0, x: 0, y: 0)
            .shadow(color: Color(PandaTheme.ink).opacity(0.16), radius: 1.0, x: 0, y: 1)
    }
}

@ViewBuilder
private func slotTokenView(slot: MathSlot,
                           at centerX: CGFloat,
                           size: CGFloat) -> some View {
    switch slot {
    case .number(let value, let color, let sizeMultiplier):
        let s = size * (sizeMultiplier ?? 1.0)
        Text("\(value)")
            .font(.pandaFont(size: s))
            .foregroundColor(Color(color ?? PandaTheme.ink))
            .pandaNumberContrast()
            .position(x: centerX, y: size / 2)

    case .op(let op, let color):
        Text(op.rawValue)
            .font(.pandaFont(size: size * 0.7))
            .foregroundColor(Color(color ?? PandaTheme.ink))
            .position(x: centerX, y: size / 2 - size * 0.05)

    case .answerBox(let placeholder, let color, let label):
        AnswerBoxShapeView(color: color ?? PandaTheme.ink,
                           size: size,
                           label: label ?? placeholder)
            .position(x: centerX, y: size / 2)
    }
}

public struct MathExpressionWithSlots: View {
    public let slots: [MathSlot]
    public let size: CGFloat
    public let onLayout: ([CGPoint]) -> Void

    public init(slots: [MathSlot],
                size: CGFloat,
                onLayout: @escaping ([CGPoint]) -> Void) {
        self.slots = slots
        self.size = size
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
                    slotTokenView(slot: slot, at: layout.centerX(at: idx), size: size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                onLayout((0..<slots.count).map {
                    CGPoint(x: layout.centerX(at: $0), y: geo.size.height / 2)
                })
            }
            .onChange(of: geo.size) { _, newSize in
                onLayout((0..<slots.count).map {
                    CGPoint(x: layout.centerX(at: $0), y: newSize.height / 2)
                })
            }
        }
    }
}

struct AnswerBoxShapeView: View {
    let color: RGB
    let size: CGFloat
    let label: String?

    var body: some View {
        let boxSize = size * 0.9
        RoundedRectangle(cornerRadius: boxSize * 0.16)
            .fill(Color(PandaTheme.card))
            .overlay(
                RoundedRectangle(cornerRadius: boxSize * 0.16)
                    .strokeBorder(Color(color), lineWidth: max(4, size * 0.08))
            )
            .frame(width: boxSize, height: boxSize)
    }
}

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
                    slotTokenView(slot: slot, at: layout.centerX(at: idx), size: size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                let centers = (0..<slots.count).map {
                    CGPoint(x: layout.centerX(at: $0), y: geo.size.height / 2)
                }
                onLayout(geo.frame(in: .local), centers)
            }
        }
        .frame(height: height)
    }
}

// MARK: - Two-row decomposition helpers

public struct DecompositionView: View {
    public struct ArrowSpec: Identifiable {
        public let id = UUID()
        public let fromRow: Int
        public let fromSlot: Int
        public let toRow: Int
        public let toSlot: Int
        public let color: Color
        public let vArrowhead: Bool

        public init(fromRow: Int,
                    fromSlot: Int,
                    toRow: Int,
                    toSlot: Int,
                    color: Color,
                    vArrowhead: Bool) {
            self.fromRow = fromRow
            self.fromSlot = fromSlot
            self.toRow = toRow
            self.toSlot = toSlot
            self.color = color
            self.vArrowhead = vArrowhead
        }
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
            SlotRow(slots: topSlots, size: topSize, height: topSize + 24) { frame, centers in
                topFrame = frame
                topCenters = centers
            }
            SlotRow(slots: bottomSlots, size: bottomSize, height: bottomSize + 24) { frame, centers in
                bottomFrame = frame
                bottomCenters = centers
            }
        }
        .overlay {
            Canvas { context, _ in
                for spec in arrows {
                    guard let pair = points(for: spec) else { continue }
                    let path = Path { p in
                        p.move(to: pair.0)
                        p.addLine(to: pair.1)
                    }
                    context.stroke(path,
                                   with: .color(spec.color.opacity(0.78)),
                                   style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
                }
            }
            .allowsHitTesting(false)
        }
    }

    private func points(for spec: ArrowSpec) -> (CGPoint, CGPoint)? {
        let fromCenters = spec.fromRow == 0 ? topCenters : bottomCenters
        let fromFrame = spec.fromRow == 0 ? topFrame : bottomFrame
        let toCenters = spec.toRow == 0 ? topCenters : bottomCenters
        let toFrame = spec.toRow == 0 ? topFrame : bottomFrame
        guard fromCenters.indices.contains(spec.fromSlot),
              toCenters.indices.contains(spec.toSlot) else { return nil }
        return (
            CGPoint(x: fromFrame.minX + fromCenters[spec.fromSlot].x,
                    y: fromFrame.minY + fromCenters[spec.fromSlot].y),
            CGPoint(x: toFrame.minX + toCenters[spec.toSlot].x,
                    y: toFrame.minY + toCenters[spec.toSlot].y)
        )
    }
}

public struct PolylineDecompositionView: View {
    public struct ArrowSpec: Identifiable {
        public let id = UUID()
        public let fromRow: Int
        public let fromSlot: Int
        public let toRow: Int
        public let toSlot: Int
        public let color: Color
        public let vArrowhead: Bool
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
    public let stemDrop: CGFloat
    public let lineThickness: CGFloat
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
            SlotRow(slots: topSlots, size: topSize, height: topSize + 24) { frame, centers in
                topFrame = frame
                topCenters = centers
            }
            SlotRow(slots: bottomSlots, size: bottomSize, height: bottomSize + 24) { frame, centers in
                bottomFrame = frame
                bottomCenters = centers
            }
        }
        .overlay {
            ZStack {
                ForEach(arrows) { spec in
                    if let pair = points(for: spec) {
                        PolylineArrow(from: pair.0,
                                      to: pair.1,
                                      color: spec.color,
                                      stemDrop: stemDrop,
                                      thickness: lineThickness)
                        if spec.vArrowhead {
                            VArrowTip(point: pair.1,
                                      opening: spec.vOpening,
                                      halfWidth: tipHalfWidth,
                                      height: tipHeight,
                                      thickness: tipThickness,
                                      color: spec.color)
                        }
                    }
                }
            }
            .allowsHitTesting(false)
        }
    }

    private func points(for spec: ArrowSpec) -> (CGPoint, CGPoint)? {
        let fromCenters = spec.fromRow == 0 ? topCenters : bottomCenters
        let fromFrame = spec.fromRow == 0 ? topFrame : bottomFrame
        let toCenters = spec.toRow == 0 ? topCenters : bottomCenters
        let toFrame = spec.toRow == 0 ? topFrame : bottomFrame
        guard fromCenters.indices.contains(spec.fromSlot),
              toCenters.indices.contains(spec.toSlot) else { return nil }
        return (
            CGPoint(x: fromFrame.minX + fromCenters[spec.fromSlot].x,
                    y: fromFrame.minY + fromCenters[spec.fromSlot].y),
            CGPoint(x: toFrame.minX + toCenters[spec.toSlot].x,
                    y: toFrame.minY + toCenters[spec.toSlot].y)
        )
    }
}

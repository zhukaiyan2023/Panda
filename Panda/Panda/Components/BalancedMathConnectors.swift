import SwiftUI

// MARK: - Shared connector geometry

// The level views report slot centres from MathExpressionWithSlots.
// Their row frames include vertical padding, so the old connector
// implementation started/ended the strokes too close to the row's
// middle. That made the lines visibly cross the digits and boxes.
// Normalize the two ends here instead of duplicating fragile offsets
// in every level.
private enum BalancedConnectorGeometry {
    static let sourceInset: CGFloat = 6
    static let targetInset: CGFloat = 12
    static let bendRatio: CGFloat = 0.42
    static let targetClearance: CGFloat = 4

    static func source(_ p: CGPoint) -> CGPoint {
        CGPoint(x: p.x, y: p.y + sourceInset)
    }

    static func target(_ p: CGPoint) -> CGPoint {
        CGPoint(x: p.x, y: p.y + targetInset)
    }

    static func stroke(_ context: GraphicsContext,
                       _ points: [CGPoint],
                       color: Color,
                       opacity: Double,
                       width: CGFloat) {
        guard points.count > 1 else { return }
        var path = Path()
        path.move(to: points[0])
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        context.stroke(
            path,
            with: .color(color.opacity(opacity)),
            style: StrokeStyle(
                lineWidth: width,
                lineCap: .round,
                lineJoin: .round
            )
        )
    }
}

// MARK: - One source -> two destinations

/// One source splits into two destinations.
///
/// The important rule is that the TWO COLORED HORIZONTAL ARMS have
/// exactly the same length. The branch point is therefore the midpoint
/// of the two destination x coordinates. The source first drops
/// vertically to that branch point; a short neutral trunk keeps the
/// visual hierarchy clear without introducing a diagonal line.
public struct BalancedSplitConnector: View {
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
            let from = BalancedConnectorGeometry.source(source)
            let rawA = BalancedConnectorGeometry.target(destA)
            let rawB = BalancedConnectorGeometry.target(destB)

            let leftFirst = rawA.x <= rawB.x
            let left = leftFirst ? rawA : rawB
            let right = leftFirst ? rawB : rawA
            let leftColor = leftFirst ? colorA : colorB
            let rightColor = leftFirst ? colorB : colorA

            let span = min(left.y, right.y) - from.y
            guard span > 4 else { return }

            let branchY = from.y + span * BalancedConnectorGeometry.bendRatio
            let branchX = (left.x + right.x) * 0.5
            let branch = CGPoint(x: branchX, y: branchY)
            let finalY = min(left.y, right.y) - BalancedConnectorGeometry.targetClearance

            // Shared source stem.
            BalancedConnectorGeometry.stroke(
                context,
                [from, CGPoint(x: from.x, y: branchY), branch],
                color: Color(PandaTheme.ink),
                opacity: 0.42,
                width: lineThickness
            )

            // Left arm. Horizontal length == right arm length.
            BalancedConnectorGeometry.stroke(
                context,
                [branch,
                 CGPoint(x: left.x, y: branchY),
                 CGPoint(x: left.x, y: finalY),
                 left],
                color: leftColor,
                opacity: opacity,
                width: lineThickness
            )

            // Right arm. Horizontal length == left arm length.
            BalancedConnectorGeometry.stroke(
                context,
                [branch,
                 CGPoint(x: right.x, y: branchY),
                 CGPoint(x: right.x, y: finalY),
                 right],
                color: rightColor,
                opacity: opacity,
                width: lineThickness
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Two sources -> one destination

/// Two sources converge into one destination.
///
/// The two colored horizontal arms end at a common midpoint join, so
/// their horizontal lengths are symmetric. A single neutral trunk then
/// continues down to the destination.
public struct BalancedMergeConnector: View {
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
            let fromA = BalancedConnectorGeometry.source(anchorTop)
            let fromB = BalancedConnectorGeometry.source(anchorMid)
            let target = BalancedConnectorGeometry.target(mergeBox)

            let sourceY = max(fromA.y, fromB.y)
            let span = target.y - sourceY
            guard span > 4 else { return }

            let joinY = sourceY + span * BalancedConnectorGeometry.bendRatio
            let joinX = (fromA.x + fromB.x) * 0.5
            let join = CGPoint(x: joinX, y: joinY)
            let finalY = target.y - BalancedConnectorGeometry.targetClearance

            BalancedConnectorGeometry.stroke(
                context,
                [fromA, CGPoint(x: fromA.x, y: joinY), join],
                color: colorA,
                opacity: 0.86,
                width: lineThickness
            )

            BalancedConnectorGeometry.stroke(
                context,
                [fromB, CGPoint(x: fromB.x, y: joinY), join],
                color: colorB,
                opacity: 0.86,
                width: lineThickness
            )

            BalancedConnectorGeometry.stroke(
                context,
                [join,
                 CGPoint(x: join.x, y: finalY),
                 CGPoint(x: target.x, y: finalY),
                 target],
                color: Color(PandaTheme.ink),
                opacity: 0.42,
                width: lineThickness
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - One source -> one destination

/// Single elbow connector with a stable bend position.
public struct BalancedSingleConnector: View {
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
            let start = BalancedConnectorGeometry.source(from)
            let end = BalancedConnectorGeometry.target(to)
            let span = end.y - start.y
            guard span > 4 else { return }

            let bendY = start.y + span * BalancedConnectorGeometry.bendRatio
            let finalY = end.y - BalancedConnectorGeometry.targetClearance

            BalancedConnectorGeometry.stroke(
                context,
                [start,
                 CGPoint(x: start.x, y: bendY),
                 CGPoint(x: end.x, y: bendY),
                 CGPoint(x: end.x, y: finalY),
                 end],
                color: color,
                opacity: opacity,
                width: lineThickness
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Fixed horizontal arm connector

/// Used by L7/L8 for the original L3-style polyline.
/// The principal horizontal arm has a fixed length so sibling arrows
/// don't become one very long arm and one very short arm.
public struct BalancedFixedArmConnector: View {
    public let from: CGPoint
    public let to: CGPoint
    public let color: Color
    public let lineThickness: CGFloat
    public let opacity: Double
    public let armLength: CGFloat

    public init(from: CGPoint,
                to: CGPoint,
                color: Color,
                lineThickness: CGFloat = 8,
                opacity: Double = 0.85,
                armLength: CGFloat = 48) {
        self.from = from
        self.to = to
        self.color = color
        self.lineThickness = lineThickness
        self.opacity = opacity
        self.armLength = armLength
    }

    public var body: some View {
        Canvas { context, _ in
            let start = BalancedConnectorGeometry.source(from)
            let end = BalancedConnectorGeometry.target(to)
            let span = end.y - start.y
            guard span > 4 else { return }

            let bendY = start.y + span * BalancedConnectorGeometry.bendRatio
            let direction: CGFloat = end.x >= start.x ? 1 : -1
            let dx = abs(end.x - start.x)
            let arm = min(armLength, max(24, dx))
            let bendX = start.x + direction * arm
            let finalY = end.y - BalancedConnectorGeometry.targetClearance

            BalancedConnectorGeometry.stroke(
                context,
                [start,
                 CGPoint(x: start.x, y: bendY),
                 CGPoint(x: bendX, y: bendY),
                 CGPoint(x: bendX, y: finalY),
                 CGPoint(x: end.x, y: finalY),
                 end],
                color: color,
                opacity: opacity,
                width: lineThickness
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Connector collection

public struct BalancedConnectorCollection: View {
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
            var consumed = Set<UUID>()

            for index in segments.indices {
                let segment = segments[index]
                guard !consumed.contains(segment.id) else { continue }

                // Group segments that converge on the same target.
                let group = segments.filter {
                    abs($0.to.x - segment.to.x) < 0.5 &&
                    abs($0.to.y - segment.to.y) < 0.5
                }

                if group.count >= 2 {
                    for item in group { consumed.insert(item.id) }

                    let correctedSources = group.map { BalancedConnectorGeometry.source($0.from) }
                    let target = BalancedConnectorGeometry.target(segment.to)
                    let sourceY = correctedSources.map(\.y).max() ?? target.y
                    let span = target.y - sourceY
                    guard span > 4 else { continue }

                    let joinY = sourceY + span * BalancedConnectorGeometry.bendRatio
                    let joinX = correctedSources.map(\.x).reduce(0, +) / CGFloat(correctedSources.count)
                    let join = CGPoint(x: joinX, y: joinY)
                    let finalY = target.y - BalancedConnectorGeometry.targetClearance

                    for item in group {
                        let start = BalancedConnectorGeometry.source(item.from)
                        BalancedConnectorGeometry.stroke(
                            context,
                            [start, CGPoint(x: start.x, y: joinY), join],
                            color: item.color,
                            opacity: item.opacity,
                            width: item.thickness
                        )
                    }

                    BalancedConnectorGeometry.stroke(
                        context,
                        [join,
                         CGPoint(x: join.x, y: finalY),
                         CGPoint(x: target.x, y: finalY),
                         target],
                        color: Color(PandaTheme.ink),
                        opacity: 0.42,
                        width: group.map(\.thickness).max() ?? 7
                    )
                    continue
                }

                consumed.insert(segment.id)
                let start = BalancedConnectorGeometry.source(segment.from)
                let end = BalancedConnectorGeometry.target(segment.to)
                let dy = end.y - start.y
                guard dy > 4 else { continue }

                switch segment.style {
                case .straight:
                    BalancedConnectorGeometry.stroke(
                        context,
                        [start, end],
                        color: segment.color,
                        opacity: segment.opacity,
                        width: segment.thickness
                    )

                case .elbow, .symmetric:
                    let bendY = start.y + dy * BalancedConnectorGeometry.bendRatio
                    let finalY = end.y - BalancedConnectorGeometry.targetClearance
                    BalancedConnectorGeometry.stroke(
                        context,
                        [start,
                         CGPoint(x: start.x, y: bendY),
                         CGPoint(x: end.x, y: bendY),
                         CGPoint(x: end.x, y: finalY),
                         end],
                        color: segment.color,
                        opacity: segment.opacity,
                        width: segment.thickness
                    )
                }
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Level-specific aliases

extension ThreeSumStepView {
    typealias L1MergeLines = BalancedMergeConnector
}

extension ThreeTenStepView {
    typealias L1MergeLines = BalancedMergeConnector
}

extension TwentyWithinStepView {
    typealias SymmetricVDiagram = BalancedSplitConnector
    typealias PolylineConnectors = BalancedConnectorCollection
}

extension TeenPlusTeenStepView {
    typealias SymmetricVDiagram = BalancedSplitConnector
    typealias PolylineConnectors = BalancedConnectorCollection
}

extension TeenSubNoBorrowStepView {
    typealias L3StylePolyline = BalancedFixedArmConnector
    typealias SymmetricVDiagram = BalancedSplitConnector
    typealias L1MergeLines = BalancedMergeConnector
}

extension TeenSubBorrowStepView {
    typealias L3StylePolyline = BalancedFixedArmConnector
    typealias SymmetricVDiagram = BalancedSplitConnector
    typealias L1MergeLines = BalancedMergeConnector
}

import SwiftUI

// MARK: - Connector geometry

/// The level views already provide connector endpoints at the visual
/// bottom/top edges of the slots. Do NOT add another inset here.
/// Applying a second offset was causing the lines to float away from
/// the boxes and digits.
private enum ConnectorGeometry {
    static let bendRatio: CGFloat = 0.46
    static let targetClearance: CGFloat = 2

    static func stroke(_ context: GraphicsContext,
                       _ points: [CGPoint],
                       color: Color,
                       opacity: Double,
                       width: CGFloat) {
        guard points.count > 1 else { return }
        var path = Path()
        path.move(to: points[0])
        for p in points.dropFirst() { path.addLine(to: p) }
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

/// A single source splits into two targets.
///
/// Geometry is deliberately canonical:
///   source -> vertical stem -> common branch point
///                         /                  \
///                 equal horizontal arms
///                       |                       |
///                    target A                target B
///
/// The branch X is the midpoint of the two target X coordinates, so the
/// two horizontal arms are exactly equal in length. Both vertical drops
/// use the same target Y, so the two lower legs are equal as well.
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
            let leftFirst = destA.x <= destB.x
            let left = leftFirst ? destA : destB
            let right = leftFirst ? destB : destA
            let leftColor = leftFirst ? colorA : colorB
            let rightColor = leftFirst ? colorB : colorA

            let targetY = (left.y + right.y) * 0.5
            let span = targetY - source.y
            guard span > 4 else { return }

            let branchY = source.y + span * ConnectorGeometry.bendRatio
            let branchX = (left.x + right.x) * 0.5
            let branch = CGPoint(x: branchX, y: branchY)
            let finalY = targetY - ConnectorGeometry.targetClearance

            // Neutral stem from the source to the common split point.
            ConnectorGeometry.stroke(
                context,
                [source,
                 CGPoint(x: source.x, y: branchY),
                 branch],
                color: Color(PandaTheme.ink),
                opacity: 0.42,
                width: lineThickness
            )

            // LEFT branch: horizontal arm and vertical drop have the same
            // geometry as the RIGHT branch; only X and color differ.
            ConnectorGeometry.stroke(
                context,
                [branch,
                 CGPoint(x: left.x, y: branchY),
                 CGPoint(x: left.x, y: finalY),
                 left],
                color: leftColor,
                opacity: opacity,
                width: lineThickness
            )

            ConnectorGeometry.stroke(
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

/// Two sources converge on a single target using one shared center join.
/// The colored source arms are symmetric; a neutral trunk carries the
/// merged result to the target.
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
            let sourceY = max(anchorTop.y, anchorMid.y)
            let span = mergeBox.y - sourceY
            guard span > 4 else { return }

            let joinY = sourceY + span * ConnectorGeometry.bendRatio
            let joinX = (anchorTop.x + anchorMid.x) * 0.5
            let join = CGPoint(x: joinX, y: joinY)
            let finalY = mergeBox.y - ConnectorGeometry.targetClearance

            ConnectorGeometry.stroke(
                context,
                [anchorTop,
                 CGPoint(x: anchorTop.x, y: joinY),
                 join],
                color: colorA,
                opacity: 0.86,
                width: lineThickness
            )

            ConnectorGeometry.stroke(
                context,
                [anchorMid,
                 CGPoint(x: anchorMid.x, y: joinY),
                 join],
                color: colorB,
                opacity: 0.86,
                width: lineThickness
            )

            ConnectorGeometry.stroke(
                context,
                [join,
                 CGPoint(x: join.x, y: finalY),
                 CGPoint(x: mergeBox.x, y: finalY),
                 mergeBox],
                color: Color(PandaTheme.ink),
                opacity: 0.42,
                width: lineThickness
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - One source -> one destination

/// Stable right-angle connector used by L7/L8.
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
            let span = to.y - from.y
            guard span > 4 else { return }

            let bendY = from.y + span * ConnectorGeometry.bendRatio

            // Use the midpoint as the elbow. This is stable for every
            // source/target pair and avoids the exaggerated long/short
            // elbows created by the old fixed-distance implementation.
            let bendX = (from.x + to.x) * 0.5
            let finalY = to.y - ConnectorGeometry.targetClearance

            ConnectorGeometry.stroke(
                context,
                [from,
                 CGPoint(x: from.x, y: bendY),
                 CGPoint(x: bendX, y: bendY),
                 CGPoint(x: bendX, y: finalY),
                 CGPoint(x: to.x, y: finalY),
                 to],
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

                let group = segments.filter {
                    abs($0.to.x - segment.to.x) < 0.5 &&
                    abs($0.to.y - segment.to.y) < 0.5
                }

                if group.count >= 2 {
                    for item in group { consumed.insert(item.id) }

                    let sourcePoints = group.map { $0.from }
                    let sourceY = sourcePoints.map(\.y).max() ?? segment.from.y
                    let target = segment.to
                    let span = target.y - sourceY
                    guard span > 4 else { continue }

                    let joinY = sourceY + span * ConnectorGeometry.bendRatio
                    let joinX = sourcePoints.map(\.x).reduce(0, +) /
                        CGFloat(sourcePoints.count)
                    let join = CGPoint(x: joinX, y: joinY)
                    let finalY = target.y - ConnectorGeometry.targetClearance

                    // Each source gets its own colored arm to the common
                    // join. Since joinX is the arithmetic midpoint, the
                    // horizontal arms are equal for a two-source group.
                    for item in group {
                        ConnectorGeometry.stroke(
                            context,
                            [item.from,
                             CGPoint(x: item.from.x, y: joinY),
                             join],
                            color: item.color,
                            opacity: item.opacity,
                            width: item.thickness
                        )
                    }

                    ConnectorGeometry.stroke(
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
                let start = segment.from
                let end = segment.to
                let dy = end.y - start.y
                guard dy > 4 else { continue }

                switch segment.style {
                case .straight:
                    ConnectorGeometry.stroke(
                        context, [start, end],
                        color: segment.color,
                        opacity: segment.opacity,
                        width: segment.thickness
                    )

                case .elbow, .symmetric:
                    let bendY = start.y + dy * ConnectorGeometry.bendRatio
                    let finalY = end.y - ConnectorGeometry.targetClearance
                    let bendX = (start.x + end.x) * 0.5
                    ConnectorGeometry.stroke(
                        context,
                        [start,
                         CGPoint(x: start.x, y: bendY),
                         CGPoint(x: bendX, y: bendY),
                         CGPoint(x: bendX, y: finalY),
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

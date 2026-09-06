import SwiftUI

// Geometry contract for all math-level connectors:
// - split (1 -> 2): the two main horizontal arms are exactly the same length;
//   any unequal destination x-distance is absorbed by an equal-size correction
//   segment at the destination row. This avoids the "one arm long, one short"
//   look while still reaching the actual slot centers.
// - merge (2 -> 1): both source-side horizontal arms end at the midpoint of
//   the source columns, so they are exactly equal; the final trunk is shared.
// - single connector: fixed main horizontal arm length, with a small target
//   correction so sibling connectors stay visually consistent.

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
            let targetY = mergeBox.y
            guard targetY > sourceY + 2 else { return }

            let span = targetY - sourceY
            let joinY = sourceY + span * 0.48
            let joinX = (anchorTop.x + anchorMid.x) * 0.5
            let clearance = min(5, max(2, span * 0.04))
            let finalY = targetY - clearance
            let join = CGPoint(x: joinX, y: joinY)

            func stroke(_ points: [CGPoint], color: Color, opacity: Double) {
                guard points.count > 1 else { return }
                var path = Path()
                path.move(to: points[0])
                for point in points.dropFirst() {
                    path.addLine(to: point)
                }
                context.stroke(
                    path,
                    with: .color(color.opacity(opacity)),
                    style: StrokeStyle(lineWidth: lineThickness,
                                       lineCap: .round,
                                       lineJoin: .round)
                )
            }

            // The source-side arms are equal by construction:
            // each travels from its source column to the midpoint joinX.
            stroke([anchorTop,
                    CGPoint(x: anchorTop.x, y: joinY),
                    join],
                   color: colorA,
                   opacity: 0.88)
            stroke([anchorMid,
                    CGPoint(x: anchorMid.x, y: joinY),
                    join],
                   color: colorB,
                   opacity: 0.88)

            // One shared trunk. Keeping the trunk single avoids a muddy
            // double stroke where the two colored arms converge.
            stroke([join,
                    CGPoint(x: joinX, y: finalY),
                    CGPoint(x: mergeBox.x, y: finalY)],
                   color: Color(PandaTheme.ink),
                   opacity: 0.42)
        }
        .allowsHitTesting(false)
    }
}

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
            let targetY = min(destA.y, destB.y)
            let span = targetY - source.y
            guard span > 2 else { return }

            let left = destA.x <= destB.x ? destA : destB
            let right = destA.x <= destB.x ? destB : destA
            let leftColor = destA.x <= destB.x ? colorA : colorB
            let rightColor = destA.x <= destB.x ? colorB : colorA

            let leftDistance = abs(source.x - left.x)
            let rightDistance = abs(right.x - source.x)
            let requested = totalLength ?? (leftDistance + rightDistance) * 0.5

            // Main horizontal travel. Using the average horizontal
            // distance makes the correction at the destination equal on
            // both branches (half of the original left/right difference).
            let armLength = max(24, requested)
            let branchY = source.y + span * 0.46
            let clearance = min(5, max(2, span * 0.04))
            let finalY = targetY - clearance

            func stroke(_ points: [CGPoint], color: Color, width: CGFloat,
                        opacity: Double) {
                guard points.count > 1 else { return }
                var path = Path()
                path.move(to: points[0])
                for point in points.dropFirst() {
                    path.addLine(to: point)
                }
                context.stroke(
                    path,
                    with: .color(color.opacity(opacity)),
                    style: StrokeStyle(lineWidth: width,
                                       lineCap: .round,
                                       lineJoin: .round)
                )
            }

            // The common vertical stem is drawn once. It is not part of
            // either branch's unequal horizontal geometry.
            var stem = Path()
            stem.move(to: source)
            stem.addLine(to: CGPoint(x: source.x, y: branchY))
            context.stroke(
                stem,
                with: .color(Color(PandaTheme.ink).opacity(0.42)),
                style: StrokeStyle(lineWidth: lineThickness,
                                   lineCap: .round,
                                   lineJoin: .round)
            )

            let sourceBetweenTargets = source.x >= left.x && source.x <= right.x

            if sourceBetweenTargets {
                // True V: one branch goes left, one goes right. The
                // principal horizontal arms are both exactly armLength.
                let leftBranchX = source.x - armLength
                let rightBranchX = source.x + armLength

                stroke([CGPoint(x: source.x, y: branchY),
                        CGPoint(x: leftBranchX, y: branchY),
                        CGPoint(x: leftBranchX, y: finalY),
                        CGPoint(x: left.x, y: finalY),
                        CGPoint(x: left.x, y: targetY)],
                       color: leftColor,
                       width: lineThickness,
                       opacity: opacity)

                stroke([CGPoint(x: source.x, y: branchY),
                        CGPoint(x: rightBranchX, y: branchY),
                        CGPoint(x: rightBranchX, y: finalY),
                        CGPoint(x: right.x, y: finalY),
                        CGPoint(x: right.x, y: targetY)],
                       color: rightColor,
                       width: lineThickness,
                       opacity: opacity)
            } else {
                // Both destinations are on the same side of the source.
                // Keep the principal horizontal travel identical, then
                // split only at the destination row. Because armLength is
                // the average of the two x-distances, the two final
                // correction segments are equal in magnitude.
                let direction: CGFloat = left.x > source.x ? 1 : -1
                let branchX = source.x + direction * armLength

                stroke([CGPoint(x: source.x, y: branchY),
                        CGPoint(x: branchX, y: branchY),
                        CGPoint(x: branchX, y: finalY),
                        CGPoint(x: left.x, y: finalY),
                        CGPoint(x: left.x, y: targetY)],
                       color: leftColor,
                       width: lineThickness,
                       opacity: opacity)

                stroke([CGPoint(x: source.x, y: branchY),
                        CGPoint(x: branchX, y: branchY),
                        CGPoint(x: branchX, y: finalY),
                        CGPoint(x: right.x, y: finalY),
                        CGPoint(x: right.x, y: targetY)],
                       color: rightColor,
                       width: lineThickness,
                       opacity: opacity)
            }
        }
        .allowsHitTesting(false)
    }
}

// L7/L8 use this connector twice for one source -> one target paths.
// The principal elbow arm is fixed so two sibling connectors cannot
// accidentally become one long horizontal arm and one short one.
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
            let dx = to.x - from.x
            let dy = to.y - from.y
            guard dy > 2 else { return }

            let branchY = from.y + dy * 0.48
            let clearance = min(5, max(2, dy * 0.04))
            let finalY = to.y - clearance
            let direction: CGFloat = dx >= 0 ? 1 : -1
            let actualArm = abs(dx) < 24 ? abs(dx) : armLength
            let branchX = from.x + direction * actualArm

            var path = Path()
            path.move(to: from)
            path.addLine(to: CGPoint(x: from.x, y: branchY))
            path.addLine(to: CGPoint(x: branchX, y: branchY))
            path.addLine(to: CGPoint(x: branchX, y: finalY))
            path.addLine(to: CGPoint(x: to.x, y: finalY))
            path.addLine(to: to)

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
            let dy = to.y - from.y
            guard dy > 2 else { return }
            let bendY = from.y + dy * 0.48
            let clearance = min(5, max(2, dy * 0.04))

            var path = Path()
            path.move(to: from)
            path.addLine(to: CGPoint(x: from.x, y: bendY))
            path.addLine(to: CGPoint(x: to.x, y: bendY))
            path.addLine(to: CGPoint(x: to.x, y: to.y - clearance))

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

            func stroke(_ points: [CGPoint], color: Color,
                        width: CGFloat, opacity: Double) {
                guard points.count > 1 else { return }
                var path = Path()
                path.move(to: points[0])
                for point in points.dropFirst() {
                    path.addLine(to: point)
                }
                context.stroke(
                    path,
                    with: .color(color.opacity(opacity)),
                    style: StrokeStyle(lineWidth: width,
                                       lineCap: .round,
                                       lineJoin: .round)
                )
            }

            for segment in segments {
                if consumed.contains(segment.id) { continue }

                let group = segments.filter {
                    abs($0.to.x - segment.to.x) < 0.5 &&
                    abs($0.to.y - segment.to.y) < 0.5
                }

                if group.count >= 2 {
                    for item in group { consumed.insert(item.id) }

                    let sourceY = group.map { $0.from.y }.max() ?? segment.from.y
                    let targetY = segment.to.y
                    let span = targetY - sourceY
                    guard span > 2 else { continue }

                    let joinY = sourceY + span * 0.48
                    let joinX = group.map { $0.from.x }.reduce(0, +) /
                        CGFloat(group.count)
                    let clearance = min(5, max(2, span * 0.04))
                    let finalY = targetY - clearance
                    let join = CGPoint(x: joinX, y: joinY)

                    for item in group {
                        stroke([item.from,
                                CGPoint(x: item.from.x, y: joinY),
                                join],
                               color: item.color,
                               width: item.thickness,
                               opacity: item.opacity)
                    }

                    stroke([join,
                            CGPoint(x: joinX, y: finalY),
                            CGPoint(x: segment.to.x, y: finalY)],
                           color: Color(PandaTheme.ink),
                           width: group.map { $0.thickness }.max() ?? 7,
                           opacity: 0.42)
                    continue
                }

                consumed.insert(segment.id)
                let dy = segment.to.y - segment.from.y
                guard dy > 2 else { continue }

                switch segment.style {
                case .straight:
                    stroke([segment.from, segment.to],
                           color: segment.color,
                           width: segment.thickness,
                           opacity: segment.opacity)
                case .elbow, .symmetric:
                    let bendY = segment.from.y + dy * 0.48
                    let clearance = min(5, max(2, dy * 0.04))
                    stroke([segment.from,
                            CGPoint(x: segment.from.x, y: bendY),
                            CGPoint(x: segment.to.x, y: bendY),
                            CGPoint(x: segment.to.x, y: segment.to.y - clearance),
                            segment.to],
                           color: segment.color,
                           width: segment.thickness,
                           opacity: segment.opacity)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

// Level-local typealiases keep the educational files unchanged while the
// connector geometry is centralized here.
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

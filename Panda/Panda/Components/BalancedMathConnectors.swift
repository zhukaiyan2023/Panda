import SwiftUI

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
            let trunkTargetY = targetY - clearance

            func stroke(_ points: [CGPoint], color: Color, opacity: Double = 0.86) {
                guard points.count > 1 else { return }
                var path = Path()
                path.move(to: points[0])
                for point in points.dropFirst() { path.addLine(to: point) }
                context.stroke(path,
                               with: .color(color.opacity(opacity)),
                               style: StrokeStyle(lineWidth: lineThickness,
                                                  lineCap: .round,
                                                  lineJoin: .round))
            }

            let join = CGPoint(x: joinX, y: joinY)
            stroke([anchorTop,
                    CGPoint(x: anchorTop.x, y: joinY),
                    join], color: colorA)
            stroke([anchorMid,
                    CGPoint(x: anchorMid.x, y: joinY),
                    join], color: colorB)

            stroke([join,
                    CGPoint(x: join.x, y: trunkTargetY),
                    CGPoint(x: mergeBox.x, y: trunkTargetY)],
                   color: Color(PandaTheme.ink), opacity: 0.42)
        }
        .allowsHitTesting(false)
    }
}

/// One source -> two destinations. The branch is always placed at the
/// midpoint of the destination columns so the two colored horizontal
/// arms are mirror-symmetric by construction.
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

            let leftFirst = destA.x <= destB.x
            let left = leftFirst ? destA : destB
            let right = leftFirst ? destB : destA
            let leftColor = leftFirst ? colorA : colorB
            let rightColor = leftFirst ? colorB : colorA

            // Use one common branch point. This guarantees equal horizontal
            // arm lengths even when the source is not centered over either
            // destination slot.
            let branchX = (left.x + right.x) * 0.5
            let branchY = source.y + span * 0.46
            let clearance = min(5, max(2, span * 0.04))
            let targetYFinal = targetY - clearance

            func stroke(_ points: [CGPoint], color: Color, opacity: Double) {
                guard points.count > 1 else { return }
                var path = Path()
                path.move(to: points[0])
                for point in points.dropFirst() { path.addLine(to: point) }
                context.stroke(path,
                               with: .color(color.opacity(opacity)),
                               style: StrokeStyle(lineWidth: lineThickness,
                                                  lineCap: .round,
                                                  lineJoin: .round))
            }

            let branch = CGPoint(x: branchX, y: branchY)

            // Single neutral source stem into the split point.
            stroke([source,
                    CGPoint(x: source.x, y: branchY),
                    branch],
                   color: Color(PandaTheme.ink), opacity: 0.42)

            // The two branches share the same branch point and the same
            // vertical depth, then terminate at the destination slot tops.
            stroke([branch,
                    CGPoint(x: left.x, y: branchY),
                    CGPoint(x: left.x, y: targetYFinal),
                    left],
                   color: leftColor, opacity: opacity)

            stroke([branch,
                    CGPoint(x: right.x, y: branchY),
                    CGPoint(x: right.x, y: targetYFinal),
                    right],
                   color: rightColor, opacity: opacity)
        }
        .allowsHitTesting(false)
    }
}

// One source -> one destination. The horizontal arm is fixed-length so
// sibling branches in L7/L8 do not become one long arm and one short arm.
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
                armLength: CGFloat = 52) {
        self.from = from
        self.to = to
        self.color = color
        self.lineThickness = lineThickness
        self.opacity = opacity
        self.armLength = armLength
    }

    public var body: some View {
        Canvas { context, _ in
            let dy = to.y - from.y
            let dx = to.x - from.x
            guard dy > 2, abs(dx) > 2 else { return }

            let clearance = min(5, max(2, dy * 0.04))
            let finalY = to.y - clearance
            let branchY = from.y + dy * 0.48
            let direction: CGFloat = dx >= 0 ? 1 : -1

            // Fixed horizontal arm measured from the source. Both arrows
            // in a sibling pair therefore use exactly the same arm length
            // instead of deriving it from the individual target distance.
            // Clamp only when a target is unusually close to the source.
            let actualArm = min(armLength, max(24, abs(dx)))
            let branchX = from.x + direction * actualArm

            var path = Path()
            path.move(to: from)
            path.addLine(to: CGPoint(x: from.x, y: branchY))
            path.addLine(to: CGPoint(x: branchX, y: branchY))
            path.addLine(to: CGPoint(x: branchX, y: finalY))
            path.addLine(to: CGPoint(x: to.x, y: finalY))

            context.stroke(path,
                           with: .color(color.opacity(opacity)),
                           style: StrokeStyle(lineWidth: lineThickness,
                                              lineCap: .round,
                                              lineJoin: .round))
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
            context.stroke(path,
                           with: .color(color.opacity(opacity)),
                           style: StrokeStyle(lineWidth: lineThickness,
                                              lineCap: .round,
                                              lineJoin: .round))
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

            func stroke(_ points: [CGPoint],
                        color: Color,
                        opacity: Double,
                        width: CGFloat) {
                guard points.count > 1 else { return }
                var path = Path()
                path.move(to: points[0])
                for point in points.dropFirst() { path.addLine(to: point) }
                context.stroke(path,
                               with: .color(color.opacity(opacity)),
                               style: StrokeStyle(lineWidth: width,
                                                  lineCap: .round,
                                                  lineJoin: .round))
            }

            for index in segments.indices {
                let segment = segments[index]
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
                    let join = CGPoint(x: joinX, y: joinY)

                    for item in group {
                        stroke([item.from,
                                CGPoint(x: item.from.x, y: joinY),
                                join],
                               color: item.color,
                               opacity: item.opacity,
                               width: item.thickness)
                    }
                    stroke([join,
                            CGPoint(x: joinX, y: targetY - clearance),
                            CGPoint(x: segment.to.x, y: targetY - clearance)],
                           color: Color(PandaTheme.ink),
                           opacity: 0.42,
                           width: group.map { $0.thickness }.max() ?? 7)
                    continue
                }

                consumed.insert(segment.id)
                let dy = segment.to.y - segment.from.y
                guard dy > 2 else { continue }

                switch segment.style {
                case .straight:
                    stroke([segment.from, segment.to],
                           color: segment.color,
                           opacity: segment.opacity,
                           width: segment.thickness)
                case .elbow, .symmetric:
                    let bendY = segment.from.y + dy * 0.48
                    let clearance = min(5, max(2, dy * 0.04))
                    stroke([segment.from,
                            CGPoint(x: segment.from.x, y: bendY),
                            CGPoint(x: segment.to.x, y: bendY),
                            CGPoint(x: segment.to.x, y: segment.to.y - clearance)],
                           color: segment.color,
                           opacity: segment.opacity,
                           width: segment.thickness)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

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

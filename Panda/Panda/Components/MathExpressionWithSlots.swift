import SwiftUI

private struct PandaCurrentStepAnswerKey: EnvironmentKey {
    static let defaultValue: Int? = nil
}

extension EnvironmentValues {
    var pandaCurrentStepAnswer: Int? {
        get { self[PandaCurrentStepAnswerKey.self] }
        set { self[PandaCurrentStepAnswerKey.self] = newValue }
    }
}

/// Connector-aware math expression renderer.
///
/// L2-L8 use this renderer for teaching diagrams. Connector endpoints must
/// live on a shared mathematical grid; centering each row independently by
/// its own slot count makes related columns drift. The grid below keeps the
/// standard 5-slot equations centered, and shifts longer decomposition rows
/// left so their trailing "=" and result columns line up with the standard
/// 5-slot row.
public struct MathExpressionWithSlots: View {
    public let slots: [MathSlot]
    public let size: CGFloat
    public let onCenters: ([CGPoint]) -> Void
    @Environment(\.pandaCurrentStepAnswer) private var currentStepAnswer

    public init(slots: [MathSlot],
                size: CGFloat = 72,
                onCenters: @escaping ([CGPoint]) -> Void) {
        self.slots = slots
        self.size = size
        self.onCenters = onCenters
    }

    private let columnSpacing: CGFloat = 96
    private let narrowHorizontalInset: CGFloat = 16

    public var body: some View {
        GeometryReader { geo in
            let centers = centerPositions(in: geo.size.width)

            ZStack {
                ForEach(Array(slots.enumerated()), id: \.offset) { index, slot in
                    tokenView(
                        slot: slot,
                        index: index,
                        centerX: centers[index],
                        size: size
                    )
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                publishCenters(centers)
            }
            .onChange(of: slotSignature) { _, _ in
                publishCenters(centerPositions(in: geo.size.width))
            }
            .transaction { transaction in
                transaction.animation = nil
            }
        }
    }

    /// Computes the absolute X coordinate of every slot.
    ///
    /// Normal rows share their trailing result columns. The nominal pitch is
    /// 96pt, but it is reduced when a long decomposition row cannot fit in
    /// the available width. This is important for iPad portrait (and smaller
    /// devices): a 9-slot row must never extend beyond its parent and clip the
    /// first/last operands.
    private func centerPositions(in width: CGFloat) -> [CGFloat] {
        guard !slots.isEmpty else { return [] }

        let center = width / 2

        if isL6CombineTensRow {
            let pitch = adaptivePitch(maxPitch: 144, width: width)
            let first = center - 2 * pitch
            return slots.indices.map { first + CGFloat($0) * pitch }
        }

        let halfSlots: CGFloat
        switch slots.count {
        case 5:
            halfSlots = 2
        case 7:
            halfSlots = 4
        case 9:
            halfSlots = 6
        default:
            halfSlots = CGFloat(max(0, slots.count - 1)) / 2
        }

        let pitch = adaptivePitch(maxPitch: columnSpacing, width: width, slotCount: slots.count)
        let first = center - halfSlots * pitch
        return slots.indices.map {
            first + CGFloat($0) * pitch
        }
    }

    /// Returns the largest pitch that keeps the complete row inside the
    /// available width while preserving the normal visual pitch whenever
    /// possible. The inset leaves a small breathing margin around the first
    /// and last token instead of allowing them to touch the edge.
    private func adaptivePitch(maxPitch: CGFloat,
                               width: CGFloat,
                               slotCount: Int = 5) -> CGFloat {
        guard slotCount > 1 else { return maxPitch }
        let usableWidth = max(0, width - narrowHorizontalInset * 2)
        let maxFittingPitch = usableWidth / CGFloat(slotCount - 1)
        return min(maxPitch, maxFittingPitch)
    }

    private var isL6CombineTensRow: Bool {
        guard slots.count == 5 else { return false }

        switch slots[0] {
        case .answerBox:
            break
        case .number(let value, _, _):
            guard value == 20 else { return false }
        case .op:
            return false
        }

        guard case .op(.plus, _) = slots[1] else { return false }
        guard case .number(_, let color, _) = slots[2], isSuccess(color) else { return false }
        guard case .op(.equals, _) = slots[3] else { return false }
        switch slots[4] {
        case .answerBox, .number:
            return true
        case .op:
            return false
        }
    }

    private func isSuccess(_ color: RGB?) -> Bool {
        guard let color else { return false }
        return abs(color.r - PandaTheme.success.r) < 0.0001 &&
               abs(color.g - PandaTheme.success.g) < 0.0001 &&
               abs(color.b - PandaTheme.success.b) < 0.0001
    }

    private func publishCenters(_ centers: [CGFloat]) {
        let points = centers.map { x in
            CGPoint(x: x, y: 12 + size / 2)
        }
        onCenters(points)
    }

    private var slotSignature: String {
        slots.map { $0.reserveKey }.joined(separator: "|")
    }

    @ViewBuilder
    private func tokenView(slot: MathSlot,
                           index: Int,
                           centerX: CGFloat,
                           size: CGFloat) -> some View {
        switch slot {
        case .number(let value, let color, let sizeMultiplier):
            let multiplier = sizeMultiplier ?? 1.0
            Text("\(value)")
                .font(.pandaFont(size: size * multiplier))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: 12 + size / 2)

        case .op(let op, let color):
            Text(op.rawValue)
                .font(.pandaFont(size: size * 0.7))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: 12 + size / 2 - size * 0.05)

        case .answerBox:
            if index == slots.count - 1,
               isL6CombineTensRow,
               let currentStepAnswer {
                Text("\(currentStepAnswer)")
                    .font(.pandaFont(size: size))
                    .foregroundColor(Color(PandaTheme.ink))
                    .position(x: centerX, y: 12 + size / 2)
            } else {
                RoundedRectangle(cornerRadius: size * 0.9 * 0.16)
                    .fill(Color(PandaTheme.card))
                    .overlay(
                        RoundedRectangle(cornerRadius: size * 0.9 * 0.16)
                            .strokeBorder(
                                Color(PandaTheme.orange),
                                lineWidth: max(4, size * 0.08)
                            )
                    )
                    .frame(width: size * 0.9, height: size * 0.9)
                    .position(x: centerX, y: 12 + size / 2)
            }
        }
    }
}

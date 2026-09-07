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
/// 5-slot row. L6's special combine rows keep their exact connector columns.
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

    /// Shared mathematical pitch for normal connector-aware rows.
    private let columnSpacing: CGFloat = 96

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
                // The slot contents may change (□ → number), but the slot
                // coordinates must not. Re-publish the same mathematical
                // grid so connector geometry stays locked to the columns.
                publishCenters(centerPositions(in: geo.size.width))
            }
            .transaction { transaction in
                // Never animate slot replacement. A digit replacing a box
                // is a content change, not a geometry change.
                transaction.animation = nil
            }
        }
    }

    /// Computes the absolute X coordinate of every slot.
    ///
    /// The last two columns ("=" and result) are intentionally shared with
    /// the normal 5-slot row. This means a 7-slot/9-slot decomposition can
    /// reveal values without making those columns jump horizontally.
    ///
    /// 5 slots -> [-2, -1, 0, 1, 2] * 96
    /// 7 slots -> [-4, -3, -2, -1, 0, 1, 2] * 96
    /// 9 slots -> [-6, -5, -4, -3, -2, -1, 0, 1, 2] * 96
    ///
    /// L6 combine-tens uses a 144pt pitch and is handled separately.
    private func centerPositions(in width: CGFloat) -> [CGFloat] {
        guard !slots.isEmpty else { return [] }

        let center = width / 2

        if isL6CombineTensRow {
            let pitch: CGFloat = 144
            let first = center - 2 * pitch
            return slots.indices.map { first + CGFloat($0) * pitch }
        }

        let halfSlots: CGFloat
        switch slots.count {
        case 5:
            halfSlots = 2
        case 7:
            // Shift the 7-slot decomposition row left by one pitch so
            // slot 5 ("=") and slot 6 (result) align with slots 3/4 of
            // the standard 5-slot equation.
            halfSlots = 4
        case 9:
            // Same rule for 9-slot rows: keep the trailing two columns on
            // the shared result grid used by the 5-slot equation.
            halfSlots = 6
        default:
            halfSlots = CGFloat(max(0, slots.count - 1)) / 2
        }

        let first = center - halfSlots * columnSpacing
        return slots.indices.map {
            first + CGFloat($0) * columnSpacing
        }
    }

    /// L6 combine-tens is the five-slot row whose middle numeric value is
    /// rendered with the success/green color:
    ///   "□ + sum = □"  →  "20 + sum = □"
    /// This distinguishes it from L2's "□ + c = □" preview and from the
    /// L7/L8 result rows, whose slot 2 uses the pink number color.
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

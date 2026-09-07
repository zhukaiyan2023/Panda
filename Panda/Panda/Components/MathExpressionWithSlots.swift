import SwiftUI

/// Connector-aware math expression renderer.
///
/// L2-L8 use this renderer for teaching diagrams. Connector endpoints must
/// live on a shared mathematical grid; centering each row independently by
/// its own slot count makes related columns drift. The grid below keeps the
/// standard 5-slot equations centered, keeps 7/9-slot decomposition rows on
/// the shared parent grid, and gives L6's two combine rows the exact columns
/// required by their V connectors.
public struct MathExpressionWithSlots: View {
    public let slots: [MathSlot]
    public let size: CGFloat
    public let onCenters: ([CGPoint]) -> Void

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
        }
    }

    /// Computes the absolute X coordinate of every slot.
    ///
    /// Normal rows remain visually centered:
    ///   5 slots -> [-2, -1, 0, 1, 2] * 96
    ///   7 slots -> [-3, -2, -1, 0, 1, 2, 3] * 96
    ///   9 slots -> [-4 ... 4] * 96
    ///
    /// L6 combine-ones is intentionally shifted left so its slot 4 lands
    /// exactly on the midpoint of split-2 slots 2 and 6, while slots 0/2
    /// are symmetric around the following combine-tens target.
    ///
    /// L6 combine-tens uses a 144pt pitch across five slots. This keeps
    /// slot 0 at the midpoint of combine-ones slots 0/2 and slot 2 directly
    /// below combine-ones slot 4. The row is still centered overall.
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
            halfSlots = isL6CombineOnesRow ? 4 : 3
        case 9:
            halfSlots = 4
        default:
            halfSlots = CGFloat(max(0, slots.count - 1)) / 2
        }

        let first = center - halfSlots * columnSpacing
        return slots.indices.map {
            first + CGFloat($0) * columnSpacing
        }
    }

    /// The L6 combine-ones row has the unique pattern
    /// "10 + 10 + □ = □". It is the only 7-slot connector-aware row where
    /// slot 0 and slot 2 are both the literal 10.
    private var isL6CombineOnesRow: Bool {
        guard slots.count == 7 else { return false }
        guard case .number(let first, _, _) = slots[0], first == 10 else { return false }
        guard case .op(.plus, _) = slots[1] else { return false }
        guard case .number(let second, _, _) = slots[2], second == 10 else { return false }
        guard case .op(.plus, _) = slots[3] else { return false }
        switch slots[4] {
        case .answerBox, .number:
            break
        case .op:
            return false
        }
        guard case .op(.equals, _) = slots[5] else { return false }
        switch slots[6] {
        case .answerBox, .number:
            return true
        case .op:
            return false
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

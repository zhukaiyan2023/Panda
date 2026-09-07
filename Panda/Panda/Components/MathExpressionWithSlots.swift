import SwiftUI

/// Connector-aware math expression renderer.
///
/// L2-L8 use this renderer for teaching diagrams. Connector endpoints must
/// live on a shared mathematical grid; centering each row independently by
/// its own slot count makes related columns drift. The grid below keeps the
/// standard 5-slot equations centered, keeps 7/9-slot decomposition rows on
/// the same parent grid, and gives the L6 "10 + 10 + □" row its deliberate
/// left shift so its two inputs converge exactly on the next row.
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

    /// Shared mathematical pitch for every connector-aware row.
    private let columnSpacing: CGFloat = 96

    public var body: some View {
        GeometryReader { geo in
            let xCenter = geo.size.width / 2
            let first = firstX(in: geo.size.width)
            let centers = slots.indices.map { index in
                first + CGFloat(index) * columnSpacing
            }

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
                publishCenters(xCenter: xCenter, firstX: first)
            }
            .onChange(of: slotSignature) { _, _ in
                publishCenters(xCenter: xCenter, firstX: firstX(in: geo.size.width))
            }
        }
    }

    /// Returns the X of slot 0 in the shared grid.
    ///
    /// Normal rows remain visually centered:
    ///   5 slots -> [-2, -1, 0, 1, 2] * pitch
    ///   7 slots -> [-3, -2, -1, 0, 1, 2, 3] * pitch
    ///   9 slots -> [-4 ... 4] * pitch
    ///
    /// L6's combine-ones row is intentionally shifted one column left:
    ///   [10, +, 10, +, □, =, □]
    /// becomes [-4 ... 2] * pitch. That makes slot 4 sit at the same
    /// column as the midpoint of split-2 slots 2 and 6, while slots 0/2
    /// sit symmetrically around the following combine target.
    private func firstX(in width: CGFloat) -> CGFloat {
        let center = width / 2
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

        return center - halfSlots * columnSpacing
    }

    /// The L6 combine-ones row has the unique leading token pattern
    /// "10 + 10 + □ = □". It is the only 7-slot connector-aware row where
    /// slot 0 and slot 2 are both the literal 10.
    private var isL6CombineOnesRow: Bool {
        guard slots.count == 7 else { return false }
        guard case .number(let first, _, _) = slots[0], first == 10 else { return false }
        guard case .op(.plus, _) = slots[1] else { return false }
        guard case .number(let second, _, _) = slots[2], second == 10 else { return false }
        guard case .op(.plus, _) = slots[3] else { return false }
        guard case .answerBox = slots[4] || isNumberSlot(slots[4]) else { return false }
        guard case .op(.equals, _) = slots[5] else { return false }
        return true
    }

    private func isNumberSlot(_ slot: MathSlot) -> Bool {
        if case .number = slot { return true }
        return false
    }

    private func publishCenters(xCenter: CGFloat, firstX: CGFloat) {
        guard !slots.isEmpty else {
            onCenters([])
            return
        }

        let points = slots.indices.map { index in
            CGPoint(
                x: firstX + CGFloat(index) * columnSpacing,
                y: 12 + size / 2
            )
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

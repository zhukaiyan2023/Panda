import SwiftUI

/// Math expression renderer that exposes the exact local center of every
/// slot. Level 5-8 use these coordinates to draw teaching connectors.
///
/// The reported y coordinate deliberately includes the expression view's
/// 12pt vertical padding. This matches the fixed `size + 24` frame used by
/// the level views, so `topOf` / `bottomOf` calculations land on the real
/// visual bounds instead of the middle of the row.
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

    public var body: some View {
        GeometryReader { geo in
            let xCenter = geo.size.width / 2
            let layout = ExpressionLayoutCache.shared.layout(
                key: layoutKey,
                slots: slots,
                size: size,
                xCenter: xCenter,
                yCenter: geo.size.height / 2
            )

            ZStack {
                ForEach(Array(slots.enumerated()), id: \.offset) { index, slot in
                    tokenView(slot: slot,
                              centerX: layout.centerX(at: index),
                              size: size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                publishCenters(layout: layout)
            }
            .onChange(of: layoutKey) { _, _ in
                publishCenters(layout: layout)
            }
        }
    }

    private var layoutKey: String {
        slots.map { $0.reserveKey }.joined(separator: "|")
    }

    private func publishCenters(layout: CachedLayout) {
        // The expression rows are framed at `size + 24` with 12pt vertical
        // padding on both sides. The actual text/box center is therefore
        // 12 + size/2 in the row's local coordinates.
        let y = 12 + size / 2
        let points = layout.centers.map { CGPoint(x: $0, y: y) }
        onCenters(points)
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
                .position(x: centerX,
                          y: 12 + size / 2 - size * 0.05)

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

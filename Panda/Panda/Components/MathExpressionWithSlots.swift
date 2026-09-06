import SwiftUI

/// Connector-aware math expression renderer.
///
/// L5-L8 are teaching diagrams: the same mathematical slot must stay on
/// the same x-column while a □ is replaced by a digit, and related rows
/// must share the same column grid. Content-width-based layout makes the
/// source/target columns drift and produces asymmetric elbows.
///
/// This renderer therefore uses a fixed column grid. For an expression
/// with N slots, slot i is always placed at:
///
///   centerX + (i - (N-1)/2) * columnSpacing
///
/// Because L5-L8 use the same slot indices for related concepts (0→0/2,
/// 2/4→2, 2/6→4, 0/2→0, etc.), the teaching connectors become geometrically
/// symmetric by construction.
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

    /// One global slot pitch for every connector-aware row in L5-L8.
    /// Keeping the pitch independent of font/row size is critical: an
    /// anchor row may use size 72 while a decomposition row uses 50-56,
    /// but their corresponding mathematical columns must still align.
    private let columnSpacing: CGFloat = 96

    public var body: some View {
        GeometryReader { geo in
            let xCenter = geo.size.width / 2
            let count = slots.count
            let first = xCenter - CGFloat(max(0, count - 1)) * columnSpacing / 2
            let centers = slots.indices.map {
                first + CGFloat($0) * columnSpacing
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
                publishCenters(xCenter: xCenter, count: count)
            }
            .onChange(of: slotSignature) { _, _ in
                publishCenters(xCenter: xCenter, count: slots.count)
            }
        }
    }

    /// The surrounding L5-L8 endpoint helpers compensate for the existing
    /// row frame's 12pt top/bottom padding. Publish that padding exactly once
    /// so the legacy endpoint conversion lands on the visible token edges.
    private func publishCenters(xCenter: CGFloat, count: Int) {
        guard count > 0 else {
            onCenters([])
            return
        }
        let first = xCenter - CGFloat(count - 1) * columnSpacing / 2
        let reportedY = 24 + size / 2
        let points = slots.indices.map { index in
            CGPoint(
                x: first + CGFloat(index) * columnSpacing,
                y: reportedY
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
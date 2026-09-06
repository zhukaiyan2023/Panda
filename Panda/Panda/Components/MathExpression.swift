//
//  MathExpression.swift
//  Panda
//
//  Arithmetic expression renderer with stable slot geometry.
//
//  Important rule for the teaching diagrams: a slot must occupy the
//  same horizontal space before and after a □ is replaced by a digit.
//  Otherwise the whole equation recenters and connector endpoints move.
//

import SwiftUI

public struct MathExpression: View {
    public let slots: [MathSlot]
    public let size: CGFloat

    public init(slots: [MathSlot], size: CGFloat = 72) {
        self.slots = slots
        self.size = size
    }

    public var body: some View {
        GeometryReader { geo in
            let cx = geo.size.width / 2
            let layout = ExpressionLayoutCache.shared.layout(
                key: layoutKey,
                slots: slots,
                size: size,
                xCenter: cx,
                yCenter: geo.size.height / 2
            )
            ZStack {
                ForEach(Array(slots.enumerated()), id: \.offset) { idx, slot in
                    tokenView(slot: slot, at: layout.centerX(at: idx), size: size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    private var layoutKey: String {
        slots.map { $0.reserveKey }.joined(separator: "|")
    }

    @ViewBuilder
    private func tokenView(slot: MathSlot, at centerX: CGFloat, size: CGFloat) -> some View {
        switch slot {
        case .number(let value, let color, let sizeMultiplier):
            let s = size * (sizeMultiplier ?? 1.0)
            Text("\(value)")
                .font(.pandaFont(size: s))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2)

        case .op(let op, let color):
            Text(op.rawValue)
                .font(.pandaFont(size: size * 0.7))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2 - size * 0.05)

        case .answerBox(_, let color, _):
            AnswerBoxShape(color: color ?? PandaTheme.ink, size: size)
                .position(x: centerX, y: size / 2)
        }
    }
}

// MARK: - Slot

public enum MathSlot {
    case number(Int, color: RGB? = nil, sizeMultiplier: CGFloat? = nil)
    case op(MathOperator, color: RGB? = nil)
    case answerBox(String = "□", color: RGB? = nil, label: String? = nil)

    public var reserveKey: String {
        switch self {
        case .number:
            // All numeric values reserve the same slot width. In particular
            // "1" and "10" must not move the row when a □ is revealed.
            return "number"
        case .op(let o, _):
            return "op\(o.rawValue)"
        case .answerBox:
            // Answer boxes use the same reserved width as numbers.
            return "number"
        }
    }

    public static func numberOrBox(_ value: String,
                                    numColor: RGB,
                                    boxColor: RGB) -> MathSlot {
        if let n = Int(value) {
            return .number(n, color: numColor)
        }
        return .answerBox(value, color: boxColor)
    }
}

public enum MathOperator: String {
    case plus = "+"
    case minus = "-"
    case equals = "="
    case multiply = "×"
    case divide = "÷"
    case greater = ">"
    case less = "<"
}

// MARK: - Answer box

private struct AnswerBoxShape: View {
    let color: RGB
    let size: CGFloat

    var body: some View {
        let boxSize = size * 0.9
        RoundedRectangle(cornerRadius: boxSize * 0.16)
            .fill(Color(PandaTheme.card))
            .overlay(
                RoundedRectangle(cornerRadius: boxSize * 0.16)
                    .strokeBorder(
                        Color(color),
                        lineWidth: max(4, size * 0.08)
                    )
            )
            .frame(width: boxSize, height: boxSize)
    }
}

// MARK: - Layout cache

/// Layout cache deliberately reserves the MAX visual width required by
/// the curriculum for every number/answer slot. This makes slot centers
/// invariant across: □ → 1, □ → 7, □ → 10, and similar reveals.
final class ExpressionLayoutCache {
    static let shared = ExpressionLayoutCache()
    private var store: [String: [CGFloat]] = [:]
    private var totalWidths: [String: CGFloat] = [:]

    func layout(key: String,
                slots: [MathSlot],
                size: CGFloat,
                xCenter: CGFloat,
                yCenter: CGFloat) -> CachedLayout {
        let cacheKey = "\(key)|\(Int(size))|\(Int(xCenter))"
        if let cached = store[cacheKey], let total = totalWidths[cacheKey] {
            return CachedLayout(centers: cached, totalWidth: total)
        }

        // 1.24 × size comfortably reserves a two-digit Panda numeral.
        // A one-digit numeral and an answer box therefore occupy the same
        // horizontal slot, so later reveals cannot recenter the equation.
        let numberSlotWidth = size * 1.24
        let edgeGap = size * 0.22

        let widths = slots.map { slot -> CGFloat in
            switch slot {
            case .number(_, _, let multiplier):
                return max(numberSlotWidth, size * (multiplier ?? 1.0) * 1.24)
            case .answerBox:
                return numberSlotWidth
            case .op:
                return size * 0.4
            }
        }

        let total = widths.reduce(0, +)
            + edgeGap * CGFloat(max(0, slots.count - 1))

        var centers: [CGFloat] = []
        centers.reserveCapacity(slots.count)
        var cursor = xCenter - total / 2
        for width in widths {
            centers.append(cursor + width / 2)
            cursor += width + edgeGap
        }

        store[cacheKey] = centers
        totalWidths[cacheKey] = total
        return CachedLayout(centers: centers, totalWidth: total)
    }
}

struct CachedLayout {
    let centers: [CGFloat]
    let totalWidth: CGFloat

    func centerX(at index: Int) -> CGFloat {
        centers[index]
    }
}

// MARK: - Convenience builders

public enum ExpressionBuilder {
    public static func add(_ a: Int, _ b: Int, sum: Any) -> [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.plus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            answerOrNumber(sum, color: PandaTheme.ink),
        ]
    }

    public static func sub(_ a: Int, _ b: Int, answer: Any) -> [MathSlot] {
        [
            .number(a, color: PandaTheme.numBlue),
            .op(.minus),
            .number(b, color: PandaTheme.numPink),
            .op(.equals),
            answerOrNumber(answer, color: PandaTheme.ink),
        ]
    }

    private static func answerOrNumber(_ v: Any, color: RGB) -> MathSlot {
        if let s = v as? String {
            return .answerBox(s, color: color)
        }
        if let i = v as? Int {
            return .number(i, color: color)
        }
        return .answerBox("□", color: color)
    }
}

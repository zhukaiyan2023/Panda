//
//  MathExpression.swift
//  Panda
//
//  Renders arithmetic expressions with fixed slot geometry.
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
            let cy = geo.size.height / 2
            let layout = ExpressionLayoutCache.shared.layout(
                key: layoutKey,
                slots: slots,
                size: size,
                xCenter: cx,
                yCenter: cy
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
                // The meadow background is pale yellow/green. Preserve the
                // level color vocabulary, but give every colored digit a
                // light edge + soft ink depth so yellow/orange/blue remain
                // readable over every part of the illustration.
                .shadow(color: Color.white.opacity(0.92), radius: 1.0, x: 0, y: 0)
                .shadow(color: Color(PandaTheme.ink).opacity(0.16), radius: 1.0, x: 0, y: 1)
                .position(x: centerX, y: size / 2)

        case .op(let op, let color):
            Text(op.rawValue)
                .font(.pandaFont(size: size * 0.7))
                .foregroundColor(Color(color ?? PandaTheme.ink))
                .position(x: centerX, y: size / 2 - size * 0.05)

        case .answerBox(let placeholder, let color, let label):
            AnswerBoxShape(color: color ?? PandaTheme.ink,
                           size: size,
                           label: label ?? placeholder)
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
        case .number(let v, _, _): return "n\(v)"
        case .op(let o, _): return "o\(o.rawValue)"
        case .answerBox(let label, _, _): return "b\(label)"
        }
    }

    public static func numberOrBox(_ value: String,
                                    numColor: RGB,
                                    boxColor: RGB) -> MathSlot {
        if let n = Int(value) {
            return .number(n, color: numColor)
        } else {
            return .answerBox(value, color: boxColor)
        }
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
    let label: String?

    var body: some View {
        let boxSize = size * 0.9
        RoundedRectangle(cornerRadius: boxSize * 0.16)
            .fill(Color(PandaTheme.card))
            .overlay(
                RoundedRectangle(cornerRadius: boxSize * 0.16)
                    .strokeBorder(Color(color),
                                  lineWidth: max(4, size * 0.08))
            )
            .frame(width: boxSize, height: boxSize)
    }
}

// MARK: - Layout cache

final class ExpressionLayoutCache {
    static let shared = ExpressionLayoutCache()
    private var store: [String: [CGFloat]] = [:]
    private var totalWidths: [String: CGFloat] = [:]

    func layout(key: String, slots: [MathSlot], size: CGFloat, xCenter: CGFloat, yCenter: CGFloat) -> CachedLayout {
        let cacheKey = "\(key)|\(Int(size))|\(Int(xCenter))"
        if let cached = store[cacheKey], let total = totalWidths[cacheKey] {
            return CachedLayout(centers: cached, totalWidth: total)
        }
        let edgeGap = size * 0.22
        let widths = slots.map { slot -> CGFloat in
            switch slot {
            case .number(let v, _, let m):
                let n = max(1, "\(v)".count)
                return size * (m ?? 1.0) * (0.62 + CGFloat(n - 1) * 0.62)
            case .op:
                return size * 0.4
            case .answerBox:
                return size * 0.9
            }
        }
        let total = widths.reduce(0, +) + edgeGap * CGFloat(max(0, slots.count - 1))
        var centers: [CGFloat] = []
        var cursor = xCenter - total / 2
        for w in widths {
            centers.append(cursor + w / 2)
            cursor += w + edgeGap
        }
        store[cacheKey] = centers
        totalWidths[cacheKey] = total
        return CachedLayout(centers: centers, totalWidth: total)
    }
}

struct CachedLayout {
    let centers: [CGFloat]
    let totalWidth: CGFloat
    func centerX(at index: Int) -> CGFloat { centers[index] }
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
        if let s = v as? String { return .answerBox(s, color: color) }
        if let i = v as? Int { return .number(i, color: color) }
        return .answerBox("□", color: color)
    }
}

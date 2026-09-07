//
//  ChoiceButton.swift
//  Panda
//
//  Numeric answer button (used by every level + game).
//  v2 visual refresh:
//    • Subtle vertical gradient face
//    • Soft warm shadow instead of a hard ink offset
//    • Disabled state uses a warmer, more legible gray
//    • Correct state glows with a green gradient and a slight halo
//  Mirrors `components/choice.js::choice` (numeric variant).
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

public struct ChoiceButton: View {
    public let label: String
    public let isCorrect: Bool
    public let isDisabled: Bool
    public let action: () -> Void
    public var width: CGFloat = 130
    public var height: CGFloat = 96

    public init(label: String,
                isCorrect: Bool = false,
                isDisabled: Bool = false,
                width: CGFloat = 130,
                height: CGFloat = 96,
                action: @escaping () -> Void) {
        self.label = label
        self.isCorrect = isCorrect
        self.isDisabled = isDisabled
        self.width = width
        self.height = height
        self.action = action
    }

    public var body: some View {
        Button(action: handleTap) {
            ZStack {
                face
                Text(label)
                    .font(.pandaNumber(min(width, height) * 0.5))
                    .foregroundColor(textColor)
                    .shadow(color: isCorrect ? Color.white.opacity(0.7) : .clear,
                            radius: 1, x: 0, y: 1)
            }
            .frame(width: width, height: height)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .accessibilityLabel(Text(label))
        .accessibilityValue(Text(isCorrect ? "正确" : isDisabled ? "已禁用" : ""))
        .scaleEffect(isCorrect ? 1.04 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isCorrect)
    }

    @ViewBuilder
    private var face: some View {
        let r = min(width, height) * 0.22
        RoundedRectangle(cornerRadius: r)
            .fill(faceGradient)
            .overlay(
                RoundedRectangle(cornerRadius: r)
                    .stroke(border, lineWidth: 5)
            )
            .overlay(
                RoundedRectangle(cornerRadius: r)
                    .trim(from: 0, to: 0.4)
                    .stroke(Color.white.opacity(isCorrect ? 0.6 : 0.5),
                            style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                    .padding(4)
                    .allowsHitTesting(false)
            )
            .pandaWarmShadow(y: isCorrect ? 8 : 5,
                             opacity: isCorrect ? 0.28 : 0.18,
                             radius: isCorrect ? 6 : 2)
    }

    private var faceGradient: LinearGradient {
        if isCorrect {
            return LinearGradient(
                colors: [Color(PandaTheme.success), Color(PandaTheme.successDeep)],
                startPoint: .top, endPoint: .bottom)
        }
        if isDisabled {
            return LinearGradient(
                colors: [Color(PandaTheme.disabledBg), Color(PandaTheme.disabledBg).opacity(0.85)],
                startPoint: .top, endPoint: .bottom)
        }
        return LinearGradient(
            colors: [Color(PandaTheme.cardHi), Color(fill)],
            startPoint: .top, endPoint: .bottom)
    }

    private var fill: RGB { PandaTheme.card }
    private var border: Color {
        if isCorrect { return Color(PandaTheme.successDeep) }
        if isDisabled { return Color(PandaTheme.disabledInk).opacity(0.4) }
        return Color(PandaTheme.ink)
    }
    private var textColor: Color {
        if isCorrect { return .white }
        if isDisabled { return Color(PandaTheme.disabledInk) }
        return Color(PandaTheme.ink)
    }
    private func handleTap() {
        #if canImport(UIKit)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        #endif
        action()
    }
}

// MARK: - Icon button (back arrow, etc.)
//
// v2: replaces the literal "←" character with a real drawn chevron
// composed of two strokes, and adds a soft warm shadow + gradient
// face. Also adds a press-scale feedback.

public struct IconButton: View {
    public enum Style { case back, primary, success, danger }
    public let style: Style
    public let action: () -> Void
    public var width: CGFloat = 80
    public var height: CGFloat = 64

    public init(style: Style = .back,
                width: CGFloat = 80,
                height: CGFloat = 64,
                action: @escaping () -> Void) {
        self.style = style
        self.width = width
        self.height = height
        self.action = action
    }

    /// Backwards-compatible initializer that accepts a label string.
    /// Accepts "←" / "‹" / "«" / "<" and renders a real chevron; any
    /// other label is rendered verbatim (kept for backwards compat).
    public init(label: String,
                width: CGFloat = 80,
                height: CGFloat = 64,
                tint: RGB = PandaTheme.orange,
                foreground: RGB = (1.0, 1.0, 1.0),
                action: @escaping () -> Void) {
        self.style = Self.styleFromLabel(label, defaultTint: tint)
        self.width = width
        self.height = height
        self.action = action
        self.legacyLabel = label
    }

    private var legacyLabel: String? = nil

    private static func styleFromLabel(_ label: String, defaultTint: RGB) -> Style {
        if ["←", "‹", "«", "<"].contains(label.trimmingCharacters(in: .whitespaces)) {
            return .back
        }
        return .primary
    }

    public var body: some View {
        Button(action: { handleTap() }) {
            ZStack {
                face
                content
            }
            .frame(width: width, height: height)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(style == .back ? "返回上一页" : "")
    }

    private var accessibilityLabel: Text {
        if let legacyLabel, style != .back {
            return Text(legacyLabel)
        }
        switch style {
        case .back: return Text("返回")
        case .primary: return Text("继续")
        case .success: return Text("完成")
        case .danger: return Text("关闭")
        }
    }

    private var face: some View {
        let r = min(width, height) * 0.25
        return RoundedRectangle(cornerRadius: r)
            .fill(faceGradient)
            .overlay(
                RoundedRectangle(cornerRadius: r)
                    .stroke(Color(PandaTheme.ink), lineWidth: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: r)
                    .trim(from: 0, to: 0.4)
                    .stroke(Color.white.opacity(0.5),
                            style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                    .padding(3)
                    .allowsHitTesting(false)
            )
            .pandaWarmShadow(y: 5, opacity: 0.22, radius: 2)
    }

    private var faceGradient: LinearGradient {
        switch style {
        case .back:
            return LinearGradient(colors: [Color(PandaTheme.orange), Color(PandaTheme.orangeDeep)],
                                  startPoint: .top, endPoint: .bottom)
        case .primary:
            return LinearGradient(colors: [Color(PandaTheme.blue), Color(PandaTheme.blueDeep)],
                                  startPoint: .top, endPoint: .bottom)
        case .success:
            return LinearGradient(colors: [Color(PandaTheme.success), Color(PandaTheme.successDeep)],
                                  startPoint: .top, endPoint: .bottom)
        case .danger:
            return LinearGradient(colors: [Color(PandaTheme.danger), Color(PandaTheme.danger).opacity(0.85)],
                                  startPoint: .top, endPoint: .bottom)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch style {
        case .back:
            // Real chevron — two stroked line segments meeting at a
            // point on the left. Renders crisper than "←" character.
            ChevronShape()
                .stroke(Color.white, style: StrokeStyle(lineWidth: max(4, height * 0.10),
                                                         lineCap: .round, lineJoin: .round))
                .frame(width: width * 0.34, height: height * 0.50)
        default:
            if let lbl = legacyLabel {
                Text(lbl)
                    .font(.pandaFont(size: max(18, min(width, height) * 0.40), weight: .heavy))
                    .foregroundColor(.white)
            } else {
                ChevronShape()
                    .stroke(Color.white, style: StrokeStyle(lineWidth: max(4, height * 0.10),
                                                             lineCap: .round, lineJoin: .round))
                    .frame(width: width * 0.34, height: height * 0.50)
            }
        }
    }

    private func handleTap() {
        #if canImport(UIKit)
        let g = UIImpactFeedbackGenerator(style: .light)
        g.impactOccurred()
        #endif
        action()
    }
}

/// A left-pointing chevron shape used by `IconButton(.back)`.
public struct ChevronShape: Shape {
    public func path(in rect: CGRect) -> Path {
        var p = Path()
        let midY = rect.midY
        let leftX = rect.minX + rect.width * 0.18
        let rightX = rect.maxX - rect.width * 0.18
        // Top stroke (down-left)
        p.move(to: CGPoint(x: rightX, y: rect.minY))
        p.addLine(to: CGPoint(x: leftX, y: midY))
        // Bottom stroke (down-right)
        p.move(to: CGPoint(x: leftX, y: midY))
        p.addLine(to: CGPoint(x: rightX, y: rect.maxY))
        return p
    }
}

#Preview {
    VStack(spacing: 16) {
        HStack(spacing: 12) {
            IconButton(style: .back) {}
            IconButton(style: .primary) {}
            IconButton(style: .success) {}
        }
        HStack(spacing: 12) {
            ChoiceButton(label: "7") {}
            ChoiceButton(label: "8", isCorrect: true) {}
            ChoiceButton(label: "9", isDisabled: true) {}
        }
    }
    .padding()
    .background(Color(PandaTheme.paper))
}

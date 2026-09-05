//
//  Card.swift
//  Panda
//
//  Reusable card / panel primitive. Mirrors `components/card.js` with a
//  v2 visual refresh:
//    • Real soft drop shadow instead of a hard offset rectangle
//    • Subtle top-edge highlight to read as a "lit" surface
//    • Gradient accent strip (when `accent` is set)
//    • Inner padding for the accent so it no longer feels "pasted on"
//

import SwiftUI

public struct Card<Content: View>: View {
    public let content: Content
    public var width: CGFloat?
    public var height: CGFloat
    public var fill: RGB
    public var radius: CGFloat
    public var shadowOffset: CGFloat
    public var shadowOpacity: Double
    public var outlineWidth: CGFloat
    public var action: (() -> Void)?
    public var accent: RGB? = nil

    public init(width: CGFloat? = 280,
                height: CGFloat = 340,
                fill: RGB = PandaTheme.card,
                radius: CGFloat = 24,
                shadowOffset: CGFloat = 6,
                shadowOpacity: Double = 0.18,
                outlineWidth: CGFloat = 5,
                accent: RGB? = nil,
                action: (() -> Void)? = nil,
                @ViewBuilder content: () -> Content) {
        self.width = width
        self.height = height
        self.fill = fill
        self.radius = radius
        self.shadowOffset = shadowOffset
        self.shadowOpacity = shadowOpacity
        self.outlineWidth = outlineWidth
        self.accent = accent
        self.action = action
        self.content = content()
    }

    public var body: some View {
        let card = ZStack(alignment: .topLeading) {
            // 1) Face with subtle vertical gradient (warm highlight on top,
            //    slightly cooler base below) so the card reads as paper.
            RoundedRectangle(cornerRadius: radius)
                .fill(
                    LinearGradient(
                        colors: [Color(PandaTheme.cardHi), Color(fill), Color(PandaTheme.cardEdge)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: radius)
                        .stroke(Color(PandaTheme.ink), lineWidth: outlineWidth)
                )
                .frame(width: width, height: height)

            // 2) Accent treatment (when set) — a thin top stripe across
            //    the full width + a small corner accent badge. Stays out
            //    of the content area so the user's content can use the
            //    full card surface.
            if let accent {
                let w: CGFloat = (width ?? 280) - outlineWidth * 2
                // Thin top stripe (5pt) hugging the inner edge.
                VStack(spacing: 0) {
                    LinearGradient(
                        colors: [Color(accent), Color(accent).opacity(0.7)],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(height: 5)
                    Spacer()
                }
                .frame(width: w, height: height - outlineWidth * 2)
                .padding(.horizontal, outlineWidth)
                .padding(.top, outlineWidth)
                .clipShape(RoundedRectangle(cornerRadius: max(0, radius - outlineWidth)))
                .allowsHitTesting(false)
            }

            // 3) Soft inner highlight on the top edge — a thin lighter
            //    band that sits just inside the stroke. Reads as a hint
            //    of light without an extra layer.
            RoundedRectangle(cornerRadius: max(0, radius - outlineWidth))
                .trim(from: 0, to: 0.5)
                .stroke(Color.white.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .frame(width: (width ?? 0) - outlineWidth * 2, height: height - outlineWidth * 2)
                .padding(.horizontal, outlineWidth)
                .padding(.top, outlineWidth)
                .allowsHitTesting(false)

            // 4) User content — takes the full card surface.
            content
                .frame(width: width, height: height, alignment: .top)
        }
        .frame(width: width, height: height)
        .frame(maxWidth: width == nil ? .infinity : nil)
        // Soft Panda shadow — warm so it matches the paper background.
        .pandaWarmShadow(y: shadowOffset, opacity: shadowOpacity, radius: 2)
        .contentShape(RoundedRectangle(cornerRadius: radius))

        if let action = action {
            Button(action: action) {
                card
            }
            .buttonStyle(.plain)
        } else {
            card
        }
    }
}

// MARK: - Lock badge

public struct LockBadge: View {
    public var size: CGFloat = 80

    public init(size: CGFloat = 80) { self.size = size }

    public var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.18)
                .fill(Color(PandaTheme.lockedBg))
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.18)
                        .stroke(Color(PandaTheme.lockedInk).opacity(0.6), lineWidth: 3)
                )
                .frame(width: size * 0.85, height: size * 0.7)
                .offset(y: size * 0.08)
            Circle()
                .stroke(Color(PandaTheme.lockedInk), lineWidth: 4)
                .frame(width: size * 0.4, height: size * 0.4)
                .offset(y: -size * 0.18)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Star count chip

public struct StarChip: View {
    public let count: Int

    public init(count: Int) { self.count = count }

    public var body: some View {
        HStack(spacing: 6) {
            ZStack {
                StarShape()
                    .fill(Color(PandaTheme.yellowSoft))
                    .frame(width: 36, height: 36)
                StarShape()
                    .fill(Color(PandaTheme.yellow))
                    .frame(width: 32, height: 32)
                StarShape()
                    .stroke(Color(PandaTheme.ink), lineWidth: 2)
                    .frame(width: 32, height: 32)
            }
            Text("\(count)")
                .font(.pandaFont(size: 28))
                .foregroundColor(Color(PandaTheme.ink))
        }
    }
}

public struct StarShape: Shape {
    public func path(in rect: CGRect) -> Path {
        var p = Path()
        let cx = rect.midX, cy = rect.midY
        let outer = min(rect.width, rect.height) / 2
        let inner = outer * 0.45
        let points = 5
        for i in 0..<(points * 2) {
            let r = i % 2 == 0 ? outer : inner
            let angle = Double(i) * .pi / Double(points) - .pi / 2
            let pt = CGPoint(x: cx + cos(angle) * r, y: cy + sin(angle) * r)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

#Preview {
    HStack(spacing: 16) {
        Card(width: 200, height: 260, accent: PandaTheme.orange) {
            VStack {
                Text("第 1 关").font(.pandaFont(size: 28))
                Text("十以内减法").font(.pandaFont(size: 22))
            }
        }
        Card(width: 200, height: 260, accent: PandaTheme.pink) {
            VStack(spacing: 8) {
                Text("数字小船").font(.pandaFont(size: 24))
                Text("凑成 10").font(.pandaFont(size: 18)).opacity(0.7)
            }
        }
        Card(width: 200, height: 260) {
            LockBadge()
        }
    }
    .padding()
    .background(Color(PandaTheme.paper))
}

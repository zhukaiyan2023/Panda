//
//  PandaView.swift
//  Panda
//
//  The panda character with three moods (idle / cheer / think).
//  v2 visual refresh:
//    • Slightly off-white body with a warm gradient → reads as a real
//      panda instead of a plain circle
//    • Bigger ears with a tiny inner pink for personality
//    • Starry eyes for the .cheer mood
//    • Pencil + thought bubble for .think
//    • Cheeks moved to read like blush
//  Mirrors `components/panda.js`.
//

import SwiftUI

public enum PandaMood { case idle, cheer, think }

public struct PandaView: View {
    public var mood: PandaMood = .idle
    public var size: CGFloat = 180

    public var body: some View {
        ZStack {
            // Body with subtle gradient so the head reads as 3D.
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color(PandaTheme.cardHi), Color(PandaTheme.card), Color(PandaTheme.cardEdge)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .overlay(
                    Circle().stroke(Color(PandaTheme.ink), lineWidth: 4)
                )
                .frame(width: size * 0.82, height: size * 0.82)

            // Ears — outer black ring + tiny inner pink.
            ZStack {
                Circle()
                    .fill(Color(PandaTheme.ink))
                    .frame(width: size * 0.26, height: size * 0.26)
                Circle()
                    .fill(Color(PandaTheme.pink).opacity(0.7))
                    .frame(width: size * 0.10, height: size * 0.10)
                    .offset(y: size * 0.04)
            }
            .offset(x: -size * 0.30, y: -size * 0.30)

            ZStack {
                Circle()
                    .fill(Color(PandaTheme.ink))
                    .frame(width: size * 0.26, height: size * 0.26)
                Circle()
                    .fill(Color(PandaTheme.pink).opacity(0.7))
                    .frame(width: size * 0.10, height: size * 0.10)
                    .offset(y: size * 0.04)
            }
            .offset(x:  size * 0.30, y: -size * 0.30)

            // Eye patches (slightly larger and softer)
            Ellipse()
                .fill(Color(PandaTheme.ink))
                .frame(width: size * 0.20, height: size * 0.26)
                .offset(x: -size * 0.17, y: -size * 0.05)
                .rotationEffect(.degrees(-8))
            Ellipse()
                .fill(Color(PandaTheme.ink))
                .frame(width: size * 0.20, height: size * 0.26)
                .offset(x:  size * 0.17, y: -size * 0.05)
                .rotationEffect(.degrees(8))

            // Eyes — vary by mood.
            eyes

            // Nose — small heart shape for cheer, ellipse otherwise.
            nose

            // Mouth — varies by mood.
            mouthShape
                .stroke(Color(PandaTheme.ink),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                .frame(width: size * 0.20, height: size * 0.12)
                .offset(y: size * 0.13)

            // Cheeks — soft pink blush circles.
            Ellipse()
                .fill(Color(PandaTheme.pink).opacity(0.45))
                .frame(width: size * 0.14, height: size * 0.08)
                .offset(x: -size * 0.27, y: size * 0.10)
            Ellipse()
                .fill(Color(PandaTheme.pink).opacity(0.45))
                .frame(width: size * 0.14, height: size * 0.08)
                .offset(x:  size * 0.27, y: size * 0.10)

            // Mood accessory (only for cheer/think).
            accessory
        }
        .frame(width: size, height: size)
    }

    // MARK: - Eyes (white + pupil)

    @ViewBuilder
    private var eyes: some View {
        switch mood {
        case .cheer:
            // Starry / sparkle eyes for cheer — two filled stars.
            ZStack {
                StarShape().fill(Color.white)
                    .frame(width: size * 0.13, height: size * 0.13)
                    .offset(x: -size * 0.17, y: -size * 0.06)
                StarShape().fill(Color.white)
                    .frame(width: size * 0.13, height: size * 0.13)
                    .offset(x:  size * 0.17, y: -size * 0.06)
            }
        default:
            ZStack {
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.10, height: size * 0.10)
                    .offset(x: -size * 0.17, y: -size * 0.06)
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.10, height: size * 0.10)
                    .offset(x:  size * 0.17, y: -size * 0.06)
                Circle()
                    .fill(Color(PandaTheme.ink))
                    .frame(width: size * 0.05, height: size * 0.05)
                    .offset(x: -size * 0.17, y: -size * 0.05)
                Circle()
                    .fill(Color(PandaTheme.ink))
                    .frame(width: size * 0.05, height: size * 0.05)
                    .offset(x:  size * 0.17, y: -size * 0.05)
                // Tiny highlight glints.
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.02, height: size * 0.02)
                    .offset(x: -size * 0.18, y: -size * 0.07)
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.02, height: size * 0.02)
                    .offset(x:  size * 0.16, y: -size * 0.07)
            }
        }
    }

    // MARK: - Nose

    @ViewBuilder
    private var nose: some View {
        switch mood {
        case .cheer:
            // Tiny heart.
            HeartShape()
                .fill(Color(PandaTheme.pinkDeep))
                .frame(width: size * 0.12, height: size * 0.10)
                .offset(y: size * 0.05)
        default:
            Ellipse()
                .fill(Color(PandaTheme.ink))
                .frame(width: size * 0.09, height: size * 0.06)
                .offset(y: size * 0.05)
        }
    }

    // MARK: - Mouth

    private var mouthShape: Path {
        switch mood {
        case .idle:
            // Gentle smile arc.
            Path { p in
                p.move(to: CGPoint(x: -size * 0.08, y: 0))
                p.addQuadCurve(to: CGPoint(x: size * 0.08, y: 0),
                               control: CGPoint(x: 0, y: size * 0.05))
            }
        case .cheer:
            // Open smile — wide upward arc.
            Path { p in
                p.move(to: CGPoint(x: -size * 0.10, y: size * 0.02))
                p.addQuadCurve(to: CGPoint(x: size * 0.10, y: size * 0.02),
                               control: CGPoint(x: 0, y: -size * 0.06))
            }
        case .think:
            // Slight frown / contemplation curve.
            Path { p in
                p.move(to: CGPoint(x: -size * 0.06, y: 0))
                p.addQuadCurve(to: CGPoint(x: size * 0.06, y: 0),
                               control: CGPoint(x: 0, y: size * 0.04))
            }
        }
    }

    // MARK: - Accessory

    @ViewBuilder
    private var accessory: some View {
        switch mood {
        case .cheer:
            // Little bamboo sprig in the lower-right corner.
            ZStack(alignment: .bottom) {
                Capsule()
                    .fill(Color(PandaTheme.green))
                    .frame(width: size * 0.07, height: size * 0.30)
                    .rotationEffect(.degrees(-15))
                    .offset(x: size * 0.22, y: size * 0.08)
                Ellipse()
                    .fill(Color(PandaTheme.green))
                    .frame(width: size * 0.12, height: size * 0.05)
                    .rotationEffect(.degrees(-30))
                    .offset(x: size * 0.20, y: size * 0.00)
                Ellipse()
                    .fill(Color(PandaTheme.green).opacity(0.85))
                    .frame(width: size * 0.10, height: size * 0.05)
                    .rotationEffect(.degrees(-30))
                    .offset(x: size * 0.18, y: size * 0.10)
            }
        case .think:
            // Thought bubble in the upper-right.
            ZStack(alignment: .bottomLeading) {
                Circle()
                    .fill(Color.white)
                    .overlay(Circle().stroke(Color(PandaTheme.ink), lineWidth: 3))
                    .frame(width: size * 0.20, height: size * 0.20)
                    .offset(x: size * 0.32, y: -size * 0.30)
                Text("?")
                    .font(.pandaFont(size: size * 0.13, weight: .black))
                    .foregroundColor(Color(PandaTheme.ink))
                    .offset(x: size * 0.32, y: -size * 0.30)
                Circle()
                    .fill(Color.white)
                    .overlay(Circle().stroke(Color(PandaTheme.ink), lineWidth: 2))
                    .frame(width: size * 0.07, height: size * 0.07)
                    .offset(x: size * 0.22, y: -size * 0.16)
            }
        case .idle:
            EmptyView()
        }
    }
}

// MARK: - Heart shape used by the .cheer mood

public struct HeartShape: Shape {
    public func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width
        let h = rect.height
        p.move(to: CGPoint(x: w * 0.5, y: h * 0.95))
        p.addCurve(to: CGPoint(x: 0, y: h * 0.30),
                   control1: CGPoint(x: w * 0.10, y: h * 0.85),
                   control2: CGPoint(x: 0, y: h * 0.60))
        p.addArc(center: CGPoint(x: w * 0.25, y: h * 0.30),
                 radius: w * 0.25,
                 startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        p.addArc(center: CGPoint(x: w * 0.75, y: h * 0.30),
                 radius: w * 0.25,
                 startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        p.addCurve(to: CGPoint(x: w * 0.5, y: h * 0.95),
                   control1: CGPoint(x: w, y: h * 0.60),
                   control2: CGPoint(x: w * 0.90, y: h * 0.85))
        p.closeSubpath()
        return p
    }
}

#Preview {
    HStack(spacing: 24) {
        PandaView(mood: .idle)
        PandaView(mood: .cheer)
        PandaView(mood: .think)
    }
    .padding()
    .background(Color(PandaTheme.paper))
}

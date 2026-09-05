//
//  TenFrame.swift
//  Panda
//
//  2x5 ten-frame number representation.
//  v2 visual refresh:
//    • Rounder, more playful cells with a warmer empty color
//    • Dots have a 3D look (gradient + halo + tiny highlight)
//    • Subtle inner shadow on empty cells for depth
//  Mirrors `components/tenFrame.js`.
//

import SwiftUI

public struct TenFrame: View {
    public var value: Int
    public var rows: Int = 2
    public var cell: CGFloat = 56
    public var gap: CGFloat = 6
    public var dot: RGB = PandaTheme.orange
    public var showLabel: Bool = true

    public init(value: Int,
                rows: Int = 2,
                cell: CGFloat = 56,
                gap: CGFloat = 6,
                dot: RGB = PandaTheme.orange,
                showLabel: Bool = true) {
        self.value = value
        self.rows = rows
        self.cell = cell
        self.gap = gap
        self.dot = dot
        self.showLabel = showLabel
    }

    public var body: some View {
        VStack(spacing: 8) {
            VStack(spacing: gap) {
                ForEach(0..<rows, id: \.self) { row in
                    HStack(spacing: gap) {
                        ForEach(0..<5, id: \.self) { col in
                            cellView(index: row * 5 + col)
                        }
                    }
                }
            }
            if showLabel {
                Text("\(clampedValue)")
                    .font(.pandaNumber(cell * 0.65))
                    .foregroundColor(Color(PandaTheme.ink))
            }
        }
    }

    private var clampedValue: Int { max(0, min(rows * 5, value)) }

    private func cellView(index: Int) -> some View {
        let filled = index < clampedValue
        return ZStack {
            // Cell background — subtle inset shadow for depth on empty,
            // warmer gradient when filled (via the dot).
            RoundedRectangle(cornerRadius: cell * 0.18)
                .fill(Color(PandaTheme.cellEmpty))
                .overlay(
                    RoundedRectangle(cornerRadius: cell * 0.18)
                        .stroke(Color(PandaTheme.cellStroke), lineWidth: 3)
                )
                .frame(width: cell, height: cell)
                .shadow(color: Color(PandaTheme.shadowSoft).opacity(filled ? 0.0 : 0.10),
                        radius: 1, x: 0, y: 1)

            if filled {
                // Filled dot — bigger halo + gradient core + tiny highlight.
                ZStack {
                    Circle()
                        .fill(Color(dot).opacity(0.35))
                        .frame(width: cell * 0.72, height: cell * 0.72)
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(dot), Color(dot).opacity(0.78)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: cell * 0.60, height: cell * 0.60)
                        .overlay(
                            Circle().stroke(Color(PandaTheme.ink).opacity(0.55), lineWidth: 2)
                        )
                    Circle()
                        .fill(Color.white.opacity(0.55))
                        .frame(width: cell * 0.18, height: cell * 0.18)
                        .offset(x: -cell * 0.13, y: -cell * 0.13)
                }
            }
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        TenFrame(value: 3)
        TenFrame(value: 8, rows: 2)
        TenFrame(value: 10)
    }
    .padding()
    .background(Color(PandaTheme.paper))
}

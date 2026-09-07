//
//  StepBar.swift
//  Panda
//
//  Progress bar shown above the game area. Up to 4 step labels.
//  Mirrors `components/stepBar.js`.
//

import SwiftUI

public struct StepBar: View {
    public let labels: [String]
    public let step: Int
    public let totalSteps: Int
    public let width: CGFloat?
    public let showsLabels: Bool

    public init(labels: [String], step: Int, totalSteps: Int = 4, width: CGFloat? = nil,
                showsLabels: Bool = true) {
        self.labels = labels
        self.step = step
        self.totalSteps = totalSteps
        self.width = width
        self.showsLabels = showsLabels
    }

    public var body: some View {
        let clampedLabels = Array(labels.prefix(max(0, totalSteps)))
        let safeTotal = max(totalSteps, 1)
        let safeStep = min(max(step, 0), safeTotal)
        let content = VStack(spacing: showsLabels ? 8 : 0) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 7)
                        .fill(Color(PandaTheme.trackGray))
                        .frame(height: 14)
                    RoundedRectangle(cornerRadius: 7)
                        .fill(Color(PandaTheme.pink))
                        .frame(width: geo.size.width * CGFloat(safeStep) / CGFloat(safeTotal), height: 14)
                }
            }
            .frame(height: 14)

            if showsLabels && !clampedLabels.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array(clampedLabels.enumerated()), id: \.offset) { idx, label in
                        StepPill(label: label, active: idx + 1 == safeStep)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)

        if let w = width {
            return AnyView(content.frame(maxWidth: w))
        } else {
            return AnyView(content)
        }
    }
}

private struct StepPill: View {
    let label: String
    let active: Bool

    var body: some View {
        Text(label)
            .font(.pandaFont(size: 16))
            .foregroundColor(Color(PandaTheme.ink))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(
                Capsule().fill(active ? Color(PandaTheme.yellow) : Color(PandaTheme.trackGray))
            )
    }
}

#Preview {
    VStack(spacing: 24) {
        StepBar(labels: ["看图", "想一想", "选择", "完成"], step: 2)
        StepBar(labels: ["拆小数", "凑十", "算答案"], step: 1, totalSteps: 3)
        StepBar(labels: ["开始", "打中", "完成"], step: 5, totalSteps: 10, showsLabels: false)
    }
    .padding()
    .background(Color(PandaTheme.paper))
}

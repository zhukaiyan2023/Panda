//
//  DailyDoneView.swift
//  Panda
//
//  Modal shown when a kid hits a level's daily cap.
//  Mirrors `scenes/dailyDone.js`.
//

import SwiftUI

public struct DailyDoneView: View {
    public let onDismiss: () -> Void
    @EnvironmentObject private var saveStore: PandaSaveStore

    public init(onDismiss: @escaping () -> Void) {
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")
                .opacity(0.6)

            VStack(spacing: 24) {
                PandaView(mood: .cheer, size: 220)

                Text("今天练够啦")
                    .font(.pandaFont(size: 64))
                    .foregroundColor(Color(PandaTheme.ink))

                Text("休息一下，明天再来吧")
                    .font(.pandaFont(size: 32))
                    .foregroundColor(Color(PandaTheme.ink).opacity(0.7))

                Button(action: onDismiss) {
                    Text("知道了")
                        .font(.pandaFont(size: 36))
                        .foregroundColor(.white)
                        .padding(.horizontal, 60)
                        .padding(.vertical, 18)
                        .background(
                            RoundedRectangle(cornerRadius: 22)
                                .fill(Color(PandaTheme.orange))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 22)
                                        .stroke(Color(PandaTheme.ink), lineWidth: 5)
                                )
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(40)
            .background(
                RoundedRectangle(cornerRadius: 28)
                    .fill(Color(PandaTheme.card))
                    .overlay(
                        RoundedRectangle(cornerRadius: 28)
                            .stroke(Color(PandaTheme.ink), lineWidth: 6)
                    )
            )
            .padding(60)
        }
    }
}

#Preview {
    DailyDoneView(onDismiss: {})
        .environmentObject(PandaSaveStore.shared)
}

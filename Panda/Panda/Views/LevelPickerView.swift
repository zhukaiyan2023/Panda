//
//  LevelPickerView.swift
//  Panda
//
//  Math-level selection screen. Mirrors `scenes/levelPicker.js`.
//

import SwiftUI

public struct LevelPickerView: View {
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    let switchToGames: () -> Void
    let openLevel: (Int) -> Void

    public init(switchToGames: @escaping () -> Void,
                openLevel: @escaping (Int) -> Void) {
        self.switchToGames = switchToGames
        self.openLevel = openLevel
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")

            VStack(spacing: 16) {
                topBar
                title
                subtitle
                cardsGrid
                Spacer()
                starBar
            }
            .padding(.horizontal, 40)
            .padding(.top, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear { audio.configureSession() }
    }

    // MARK: Sections

    private var topBar: some View {
        HStack {
            Spacer()
            TabPill(label: "小游戏", active: false, action: switchToGames)
        }
    }

    private var title: some View {
        Text("熊猫凑十乐园")
            .font(.pandaFont(size: 56))
            .foregroundColor(Color(PandaTheme.ink))
    }

    private var subtitle: some View {
        Text("选一关开始吧")
            .font(.pandaFont(size: 28))
            .foregroundColor(Color(PandaTheme.ink).opacity(0.7))
    }

    private var cardsGrid: some View {
        let levels = PandaCurriculum.mathLevels
        return GeometryReader { geo in
            // Compute how many columns fit given the available width.
            // Cards are 240 wide with 24 spacing; 4 fit on iPad landscape.
            let cardW: CGFloat = 200
            let spacing: CGFloat = 18
            let margin: CGFloat = 80
            let available = max(200, geo.size.width - margin)
            let n = max(2, min(4, Int(available / (cardW + spacing))))
            let columns = Array(repeating: GridItem(.flexible(), spacing: spacing), count: n)
            LazyVGrid(columns: columns, spacing: spacing) {
                ForEach(levels) { level in
                    let unlocked = level.id <= saveStore.save.unlockedLevel
                    let dailyLocked = unlocked && saveStore.isLevelDailyLocked(level.id)
                    LevelCard(
                        level: level,
                        unlocked: unlocked,
                        dailyLocked: dailyLocked
                    ) {
                        audio.playCue("tap")
                        openLevel(level.id)
                    }
                }
            }
        }
    }

    private var starBar: some View {
        let total = saveStore.save.starsByLevel.values.reduce(0, +)
        return HStack(spacing: 12) {
            StarShape().fill(Color(PandaTheme.yellow))
                .frame(width: 36, height: 36)
                .overlay(StarShape().stroke(Color(PandaTheme.ink), lineWidth: 2))
            Text("\(total)")
                .font(.pandaFont(size: 32))
                .foregroundColor(Color(PandaTheme.ink))
            Spacer()
            PandaView(mood: .idle, size: 120)
        }
        .padding(.bottom, 12)
    }
}

// MARK: - Level card

private struct LevelCard: View {
    let level: LevelMeta
    let unlocked: Bool
    let dailyLocked: Bool
    let onPick: () -> Void

    var body: some View {
        Card(
            width: 200,
            height: 200,
            fill: unlocked ? PandaTheme.card : PandaTheme.lockedBg,
            accent: accentColor(for: level.id),
            action: unlocked && !dailyLocked ? onPick : nil
        ) {
            VStack(spacing: 6) {
                Spacer().frame(height: 4)
                badge
                Spacer().frame(height: 4)
                Text(level.title)
                    .font(.pandaFont(size: 18))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .foregroundColor(Color(unlocked ? PandaTheme.ink : PandaTheme.lockedInk))
                    .padding(.horizontal, 8)
                    .frame(maxWidth: .infinity)
                Spacer()
                if !unlocked {
                    LockBadge(size: 36)
                } else if dailyLocked {
                    Text("今天练够啦")
                        .font(.pandaFont(size: 13))
                        .foregroundColor(Color(PandaTheme.lockedInk))
                } else {
                    Text("▶ 开始")
                        .font(.pandaFont(size: 18))
                        .foregroundColor(Color(accentColor(for: level.id)))
                }
                Spacer().frame(height: 4)
            }
            .frame(width: 200, height: 200)
        }
    }

    @ViewBuilder
    private var badge: some View {
        if let image = levelBadgeImage(for: level.id) {
            image
                .resizable()
                .interpolation(.high)
                .aspectRatio(contentMode: .fit)
                .frame(width: 72, height: 72)
        } else {
            // Fallback: text on a coloured disc.
            ZStack {
                Circle()
                    .fill(Color(accentColor(for: level.id)))
                    .frame(width: 72, height: 72)
                    .overlay(Circle().stroke(Color(PandaTheme.ink), lineWidth: 3))
                Text("\(level.id)")
                    .font(.pandaFont(size: 32))
                    .foregroundColor(.white)
            }
        }
    }

    private func accentColor(for id: Int) -> RGB {
        switch id {
        case 1: return PandaTheme.pink
        case 2: return PandaTheme.blue
        case 3: return PandaTheme.orange
        case 4: return PandaTheme.purple
        case 5: return PandaTheme.yellow
        case 6: return PandaTheme.success
        case 7: return PandaTheme.blue
        case 8: return PandaTheme.orange
        default: return PandaTheme.orange
        }
    }
}

// MARK: - Tab pill

public struct TabPill: View {
    public let label: String
    public let active: Bool
    public let action: () -> Void

    public init(label: String, active: Bool, action: @escaping () -> Void) {
        self.label = label
        self.active = active
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(label)
                .font(.pandaLabel(28))
                .foregroundColor(active ? Color.white : Color(PandaTheme.ink))
                .padding(.horizontal, 28)
                .padding(.vertical, 14)
                .background(
                    Capsule()
                        .fill(active
                              ? AnyShapeStyle(LinearGradient(
                                  colors: [Color(PandaTheme.orange), Color(PandaTheme.orangeDeep)],
                                  startPoint: .top, endPoint: .bottom))
                              : AnyShapeStyle(Color(PandaTheme.card)))
                        .overlay(
                            Capsule().stroke(Color(PandaTheme.ink), lineWidth: 4)
                        )
                        .overlay(
                            Capsule()
                                .trim(from: 0, to: 0.45)
                                .stroke(Color.white.opacity(active ? 0.55 : 0.4),
                                        style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                                .padding(3)
                        )
                )
                .pandaWarmShadow(y: active ? 6 : 3,
                                 opacity: active ? 0.28 : 0.12,
                                 radius: active ? 3 : 1)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Level router

/// Routes to the correct level view by id.
struct LevelRouter: View {
    let levelId: Int

    var body: some View {
        Group {
            switch levelId {
            case 1: Level1View()
            case 2: Level2View()
            case 3: Level3View()
            case 4: Level4View()
            case 5: Level5View()
            case 6: Level6View()
            case 7: Level7View()
            case 8: Level8View()
            default: Level1View()
            }
        }
        .navigationBarBackButtonHidden(true)
    }
}

#Preview {
    NavigationStack {
        LevelPickerView(switchToGames: {}, openLevel: { _ in })
    }
    .environmentObject(PandaSaveStore.shared)
    .environmentObject(PandaAudio.shared)
}

//
//  GamesPickerView.swift
//  Panda
//
//  Games selection screen (the "小游戏" tab).
//  v2 layout refresh:
//    • Mirrors `LevelPickerView`'s adaptive-grid pattern (2–4 columns
//      derived from the available width) so the two pickers read as a
//      pair rather than two unrelated screens.
//    • GameCard now uses the same VStack structure as LevelCard:
//      centered sprite disc on top → title → subtitle → CTA at bottom.
//    • Card height matches LevelCard (200pt) for a consistent rhythm.
//

import SwiftUI

public struct GamesPickerView: View {
    @EnvironmentObject private var saveStore: PandaSaveStore
    @EnvironmentObject private var audio: PandaAudio
    let switchToLevels: () -> Void
    let openGame: (PandaCurriculum.GameMeta) -> Void

    public init(switchToLevels: @escaping () -> Void,
                openGame: @escaping (PandaCurriculum.GameMeta) -> Void) {
        self.switchToLevels = switchToLevels
        self.openGame = openGame
    }

    public var body: some View {
        ZStack {
            SceneBackground(name: "bg-meadow")

            VStack(spacing: 10) {
                topBar
                title
                subtitle
                cardsGrid
                Spacer(minLength: 4)
                starBar
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear { audio.configureSession() }
    }

    private var topBar: some View {
        HStack {
            Spacer()
            HStack(spacing: 12) {
                TabPill(label: "学数学", active: false, action: switchToLevels)
                TabPill(label: "小游戏", active: true) {}
            }
        }
    }

    private var title: some View {
        Text("熊猫游戏乐园")
            .font(.pandaFont(size: 36))
            .foregroundColor(Color(PandaTheme.ink))
            .padding(.top, 4)
    }

    private var subtitle: some View {
        Text("选一个游戏吧")
            .font(.pandaFont(size: 20))
            .foregroundColor(Color(PandaTheme.ink).opacity(0.7))
    }

    /// Adaptive grid: derive columns from available width (same approach
    /// as LevelPickerView). On iPad landscape this lands at 3 columns;
    /// on iPhone portrait it drops to 2.
    private var cardsGrid: some View {
        GeometryReader { geo in
            let cardW: CGFloat = 200
            let spacing: CGFloat = 18
            let margin: CGFloat = 60
            let available = max(200, geo.size.width - margin)
            // Six games ⇒ 2 or 3 columns reads best (4 columns leaves the
            // bottom row half-empty).
            let n = max(2, min(3, Int(available / (cardW + spacing))))
            let columns = Array(repeating: GridItem(.flexible(), spacing: spacing), count: n)
            LazyVGrid(columns: columns, spacing: spacing) {
                ForEach(PandaCurriculum.games) { game in
                    let dailyLocked = saveStore.isGameDailyLocked(game.id)
                    GameCard(game: game, dailyLocked: dailyLocked) {
                        audio.playCue("tap")
                        openGame(game)
                    }
                }
            }
            // Center the grid horizontally inside the available width.
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .frame(height: 200 * 2 + 18)   // two rows of 200pt + spacing
    }

    private var starBar: some View {
        let total = saveStore.save.starsByGame.values.reduce(0, +)
        return HStack(spacing: 12) {
            Spacer()
            StarShape().fill(Color(PandaTheme.yellow))
                .frame(width: 28, height: 28)
                .overlay(StarShape().stroke(Color(PandaTheme.ink), lineWidth: 2))
            Text("\(total)")
                .font(.pandaFont(size: 24))
                .foregroundColor(Color(PandaTheme.ink))
            Spacer()
            PandaView(mood: .idle, size: 90)
        }
        .padding(.bottom, 8)
    }
}

// MARK: - Game card

/// Mirrors `LevelCard`'s VStack structure: sprite disc on top, title
/// below, subtitle + CTA pinned at the bottom of the card.
private struct GameCard: View {
    let game: PandaCurriculum.GameMeta
    let dailyLocked: Bool
    let onPick: () -> Void

    var body: some View {
        Card(
            width: 200,
            height: 200,
            fill: PandaTheme.card,
            accent: game.accent,
            action: dailyLocked ? nil : onPick
        ) {
            VStack(spacing: 6) {
                Spacer().frame(height: 4)
                gameIcon
                    .frame(width: 96, height: 96)
                Text(game.title)
                    .font(.pandaFont(size: 20))
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundColor(Color(PandaTheme.ink))
                    .padding(.horizontal, 8)
                Text(game.subtitle)
                    .font(.pandaFont(size: 13))
                    .foregroundColor(Color(PandaTheme.ink).opacity(0.65))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if dailyLocked {
                    Text("今天练够啦")
                        .font(.pandaFont(size: 13))
                        .foregroundColor(Color(PandaTheme.lockedInk))
                } else {
                    Text("▶ 开始")
                        .font(.pandaFont(size: 16))
                        .foregroundColor(Color(game.accent))
                }
                Spacer().frame(height: 6)
            }
            .frame(width: 200, height: 200)
        }
    }

    @ViewBuilder
    private var gameIcon: some View {
        // Just the sprite — no surrounding ring. The card itself has a
        // soft drop shadow and the sprite sits directly on the paper
        // face, so a circular badge would only add visual noise.
        let spriteName = spriteNameFor(game.sceneKey)
        if let image = gameIconImage(named: spriteName) {
            image
                .resizable()
                .interpolation(.high)
                .aspectRatio(contentMode: .fit)
                .frame(width: 96, height: 96)
        } else {
            // Fallback for missing sprite art — keep the coloured disc
            // so we still have something to read.
            ZStack {
                Circle()
                    .fill(Color(game.accent))
                    .frame(width: 96, height: 96)
                Image(systemName: game.icon)
                    .resizable()
                    .scaledToFit()
                    .padding(20)
                    .foregroundColor(.white)
            }
        }
    }

    /// Map a scene key to the bundled sprite name in Resources/Art/.
    private func spriteNameFor(_ key: String) -> String {
        switch key {
        case "gameBoat":   return "boat"
        case "gameBounce": return "balloon"
        case "gameCloud":  return "cloud"
        case "gameFeed":   return "bubble"
        case "gameWhack":  return "mole-1"
        case "gameCount":  return "count-icon"
        default:           return "boat"
        }
    }
}

// MARK: - Game router

struct GameRouter: View {
    let meta: PandaCurriculum.GameMeta

    var body: some View {
        Group {
            switch meta.sceneKey {
            case "gameBoat":   BoatGameView()
            case "gameBounce": BounceGameView()
            case "gameCloud":  CloudGameView()
            case "gameFeed":   FeedGameView()
            case "gameWhack":  WhackGameView()
            case "gameCount":  CountGameView()
            default:           BoatGameView()
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }
}

#Preview {
    NavigationStack {
        GamesPickerView(switchToLevels: {}, openGame: { _ in })
    }
    .environmentObject(PandaSaveStore.shared)
    .environmentObject(PandaAudio.shared)
}

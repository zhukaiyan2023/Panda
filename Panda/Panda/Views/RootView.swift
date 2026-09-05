//
//  RootView.swift
//
//  Top-level router. The picker state (level / games) lives here, and
//  each picker pushes its own scenes onto a `NavigationStack`. Tapping
//  "←" in any scene calls `dismiss()` which pops back to the picker.
//
//  The path bindings are owned here so the `NavigationStack` can
//  actually drive pushes triggered by the picker views.
//

import SwiftUI
import Combine

public enum RootScreen: Equatable { case levelPicker, gamesPicker }

/// Path types — the router switches on these to push the right
/// destination. Using a single enum keeps the navigation stack
/// strongly typed and prevents accidental cross-picker pushes.
enum LevelRoute: Hashable { case level(Int) }
enum GameRoute: Hashable { case game(PandaCurriculum.GameMeta) }

public struct RootView: View {
    @State private var screen: RootScreen
    @State private var levelPath: [LevelRoute] = []
    @State private var gamePath: [GameRoute] = []
    @State private var deepLinkApplied = false
    @EnvironmentObject private var audio: PandaAudio

    private let deepLinkGameKey: String?
    private let deepLinkLevelId: Int?

    public init(initialScreen: RootScreen = .levelPicker,
                deepLinkGameKey: String? = nil,
                deepLinkLevelId: Int? = nil) {
        self.deepLinkGameKey = deepLinkGameKey
        self.deepLinkLevelId = deepLinkLevelId
        // If a deep link is set, start on the matching picker. The actual
        // push happens via `applyDeepLink` once the picker has mounted
        // (see onAppear) — pushing into the path during init races the
        // NavigationStack mount and trips SwiftUI's "Range requires
        // lowerBound <= upperBound" internal check.
        let gameTarget = PandaCurriculum.games.first { $0.sceneKey == deepLinkGameKey }
        let levelTarget = (deepLinkLevelId != nil) ? deepLinkLevelId : nil
        let effectiveScreen: RootScreen
        if gameTarget != nil {
            effectiveScreen = .gamesPicker
        } else if levelTarget != nil {
            effectiveScreen = .levelPicker
        } else {
            effectiveScreen = initialScreen
        }
        _screen = State(initialValue: effectiveScreen)
    }

    private func applyDeepLink() {
        guard !deepLinkApplied else { return }
        deepLinkApplied = true
        if let key = deepLinkGameKey,
           let target = PandaCurriculum.games.first(where: { $0.sceneKey == key }) {
            DispatchQueue.main.async {
                gamePath.append(.game(target))
            }
        } else if let id = deepLinkLevelId {
            DispatchQueue.main.async {
                levelPath.append(.level(id))
            }
        }
    }

    public var body: some View {
        Group {
            switch screen {
            case .levelPicker:
                NavigationStack(path: $levelPath) {
                    LevelPickerView(
                        switchToGames: { screen = .gamesPicker },
                        openLevel: { levelPath.append(.level($0)) }
                    )
                    .navigationDestination(for: LevelRoute.self) { route in
                        switch route {
                        case .level(let id): LevelRouter(levelId: id)
                        }
                    }
                }
                .transition(.opacity)
            case .gamesPicker:
                NavigationStack(path: $gamePath) {
                    GamesPickerView(
                        switchToLevels: { screen = .levelPicker },
                        openGame: { gamePath.append(.game($0)) }
                    )
                    .navigationDestination(for: GameRoute.self) { route in
                        switch route {
                        case .game(let meta): GameRouter(meta: meta)
                        }
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: screen)
        .onAppear {
            audio.configureSession()
            applyDeepLink()
        }
    }
}

#Preview {
    RootView()
        .environmentObject(PandaSaveStore.shared)
        .environmentObject(PandaAudio.shared)
}

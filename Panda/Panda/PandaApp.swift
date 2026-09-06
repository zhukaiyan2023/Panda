//
//  PandaApp.swift
//  Panda
//
//  @main entry. Sets up shared environment objects and shows the
//  root router.
//

import SwiftUI

@main
struct PandaApp: App {
    @ObservedObject private var saveStore = PandaSaveStore.shared
    @ObservedObject private var audio = PandaAudio.shared

    var body: some Scene {
        WindowGroup {
            RootView(
                initialScreen: initialScreen(),
                deepLinkGameKey: deepLinkGameKey(),
                deepLinkLevelId: deepLinkLevelId()
            )
                .environmentObject(saveStore)
                .environmentObject(audio)
        }
    }

    /// Pick the initial screen. Honors a `-startScreen games` launch
    /// argument via `ProcessInfo` so QA screenshots can deep-link.
    private func initialScreen() -> RootScreen {
        let args = ProcessInfo.processInfo.arguments
        if let idx = args.firstIndex(of: "-startScreen"),
           idx + 1 < args.count,
           args[idx + 1] == "games" {
            return .gamesPicker
        }
        return .levelPicker
    }

    /// Honors `-startGame <sceneKey>` to jump straight into a game.
    private func deepLinkGameKey() -> String? {
        let args = ProcessInfo.processInfo.arguments
        if let idx = args.firstIndex(of: "-startGame"),
           idx + 1 < args.count {
            return args[idx + 1]
        }
        return nil
    }

    /// Honors `-startLevel <id>` (1..8) to jump straight into a level.
    private func deepLinkLevelId() -> Int? {
        let args = ProcessInfo.processInfo.arguments
        if let idx = args.firstIndex(of: "-startLevel"),
           idx + 1 < args.count,
           let id = Int(args[idx + 1]) {
            return id
        }
        return nil
    }
}

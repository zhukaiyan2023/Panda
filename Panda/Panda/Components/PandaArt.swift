//
//  PandaArt.swift
//  Panda
//
//  Loads bundled art assets (level badges, game icons, scenery).
//

import SwiftUI

/// Looks up a bundled art asset by name (without extension) and
/// returns the SwiftUI `Image`. Returns `nil` if the asset is missing
/// so the caller can fall back to a shape-based icon.
public func pandaImage(named name: String) -> Image? {
    // Try the bundle first (Resources/Art/<name>.png).
    if let url = Bundle.main.url(forResource: name, withExtension: "png"),
       let data = try? Data(contentsOf: url),
       let uiImage = UIImage(data: data) {
        return Image(uiImage: uiImage)
    }
    return nil
}

/// Convenience — load a level badge (Resources/Art/badge-N.png).
public func levelBadgeImage(for levelId: Int) -> Image? {
    pandaImage(named: "badge-\(levelId)")
}

/// Convenience — load a game scene icon (boat, balloon, cloud, …).
public func gameIconImage(named name: String) -> Image? {
    pandaImage(named: name)
}

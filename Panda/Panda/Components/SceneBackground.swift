//
//  SceneBackground.swift
//  Panda
//
//  Full-bleed illustrated scene backdrop. The original project uses
//  the `bg-meadow.png` art asset (1366x1024) — a soft illustrated
//  meadow with rolling hills, bushes, and small clouds. This view
//  stretches that asset to fill the screen and overlays two corner
//  bamboo sprigs + scattered leaves so the scene reads as a real
//  outdoor location instead of a flat colour.
//
//  Mirrors `components/sceneBg.js` (which used `k.sprite("bg-meadow")`)
//  but adds the bamboo/leaf decoration the JS version omitted.
//

import SwiftUI

public struct SceneBackground: View {
    public let name: String

    public init(name: String = "bg-meadow") {
        self.name = name
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                // 1) Cream paper base — guarantees a uniform colour
                //    even on devices with a non-16:9 aspect ratio.
                LinearGradient(
                    colors: [Color(PandaTheme.paper), Color(PandaTheme.paperDark)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // 2) The illustrated meadow, stretched to fill the
                //    full screen. `bg-meadow.png` is 1366x1024; resizing
                //    it via .fill keeps the picture edge-to-edge.
                if let meadow = pandaImage(named: name) {
                    meadow
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fill)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                }

                // 3) Bamboo sprig in the bottom-left corner. Sized to
                //    span ~1/3 of the screen height so it reads as a
                //    real stalk, not a stub. The slight rotation gives
                //    it a casual, leaning-into-frame look.
                if let bamboo = pandaImage(named: "bamboo") {
                    bamboo
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 100, height: 360)
                        .rotationEffect(.degrees(6))
                        .position(x: 70, y: geo.size.height - 130)
                }

                // 4) Leaf accent in the top-right — a small decoration
                //    to balance the bamboo in the opposite corner.
                if let leaf = pandaImage(named: "leaf") {
                    leaf
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 80, height: 70)
                        .rotationEffect(.degrees(-22))
                        .position(x: geo.size.width - 60, y: 130)
                }

                // 5) Second leaf on the bottom-right (smaller, more
                //    transparent) for visual balance.
                if let leaf = pandaImage(named: "leaf") {
                    leaf
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 60, height: 50)
                        .opacity(0.6)
                        .rotationEffect(.degrees(35))
                        .position(x: geo.size.width - 80, y: geo.size.height - 100)
                }
            }
        }
        .ignoresSafeArea()
    }
}

#Preview {
    SceneBackground()
}

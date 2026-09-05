//
//  PandaTheme.swift
//  Panda
//
//  Single source of truth for canvas colors, fonts, and elevation.
//  Mirrors the original `components/theme.js` and adds iOS-native
//  shadow/gradient tokens used by the v2 visual refresh.
//

import SwiftUI

public typealias RGB = (r: Double, g: Double, b: Double)

public enum PandaTheme {
    // Background & foreground
    public static let ink: RGB          = (61/255,  54/255,  82/255)
    public static let paper: RGB        = (255/255, 241/255, 220/255)
    public static let paperDark: RGB    = (255/255, 230/255, 194/255)
    public static let card: RGB         = (255/255, 250/255, 240/255)
    public static let cardHi: RGB       = (255/255, 255/255, 250/255)
    public static let cardEdge: RGB     = (247/255, 240/255, 222/255)

    // Brand palette
    public static let orange: RGB       = (255/255, 138/255,  61/255)
    public static let orangeDeep: RGB   = (217/255, 106/255,  31/255)
    public static let orangeSoft: RGB   = (255/255, 200/255, 150/255)
    public static let success: RGB      = (108/255, 194/255, 138/255)
    public static let successDeep: RGB  = ( 76/255, 158/255, 108/255)
    public static let danger: RGB       = (225/255, 107/255, 107/255)
    public static let pink: RGB         = (255/255, 143/255, 171/255)
    public static let pinkDeep: RGB     = (228/255,  92/255, 130/255)
    public static let yellow: RGB       = (245/255, 196/255,  68/255)
    public static let yellowSoft: RGB   = (255/255, 224/255, 145/255)
    public static let blue: RGB         = (124/255, 199/255, 255/255)
    public static let blueDeep: RGB     = ( 84/255, 168/255, 232/255)
    public static let purple: RGB       = (175/255, 156/255, 255/255)
    public static let purpleDeep: RGB   = (132/255, 108/255, 220/255)
    public static let green: RGB        = (143/255, 211/255, 144/255)

    public static let muted: RGB        = (180/255, 170/255, 200/255)
    public static let disabledBg: RGB   = (235/255, 230/255, 242/255)
    public static let disabledInk: RGB  = (175/255, 168/255, 192/255)
    public static let lockedBg: RGB     = (224/255, 217/255, 234/255)
    public static let lockedInk: RGB    = (150/255, 140/255, 170/255)

    public static let shadowSoft: RGB   = ( 61/255,  54/255,  82/255)
    public static let shadowWarm: RGB   = (180/255, 130/255,  60/255)

    // Per-number colors for mixed-addend problems
    public static let numBlue: RGB      = blue
    public static let numYellow: RGB    = yellow
    public static let numPink: RGB      = pink
    public static let numPurple: RGB    = purple
    public static let accent: RGB       = orangeDeep

    // Ten-frame cells
    public static let cellFill: RGB     = (255/255, 170/255, 130/255)
    public static let cellFillHi: RGB   = (255/255, 214/255, 194/255)
    public static let cellEmpty: RGB    = (252/255, 248/255, 240/255)
    public static let cellStroke: RGB   = (200/255, 188/255, 158/255)

    public static let trackGray: RGB    = (240/255, 236/255, 250/255)
}

extension Color {
    public init(_ rgb: RGB) {
        self.init(.sRGB, red: rgb.r, green: rgb.g, blue: rgb.b, opacity: 1)
    }
}

public extension Font {
    static func pandaFont(size: CGFloat, weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static func pandaDisplay(_ size: CGFloat = 64) -> Font {
        .system(size: size, weight: .black, design: .rounded)
    }
    static func pandaHeading(_ size: CGFloat = 36) -> Font {
        .system(size: size, weight: .heavy, design: .rounded)
    }
    static func pandaBody(_ size: CGFloat = 18, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static func pandaNumber(_ size: CGFloat = 56) -> Font {
        .system(size: size, weight: .black, design: .rounded)
    }
    static func pandaLabel(_ size: CGFloat = 22, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

public extension View {
    func pandaShadow(y: CGFloat = 6, opacity: Double = 0.18, radius: CGFloat = 0) -> some View {
        shadow(color: Color(PandaTheme.shadowSoft).opacity(opacity),
               radius: radius, x: 0, y: y)
    }
    func pandaWarmShadow(y: CGFloat = 6, opacity: Double = 0.22, radius: CGFloat = 4) -> some View {
        shadow(color: Color(PandaTheme.shadowWarm).opacity(opacity),
               radius: radius, x: 0, y: y)
    }
}

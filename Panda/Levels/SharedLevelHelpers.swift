//
//  SharedLevelHelpers.swift
//  Panda
//
//  Small helpers shared by every math level (L1..L8). Kept here so each
//  level file can stay focused on its own step layout + audio cues.
//
//  * `expr(_:size:)` — wrap a `MathExpression` with a minimum height so
//    it lays out cleanly without clipping larger content on iPad.
//  * `playCue(_:_:)` / `playCues(_:_:)` — thin wrappers around the
//    shared `PandaAudio` engine. Both no-op when the cue id is empty
//    so levels can splice optional cues into their step audio chains
//    without conditional boilerplate.
//

import SwiftUI

/// Wrap a `MathExpression` with a minimum height while allowing the
/// expression to grow when its content needs more room. This avoids
/// clipping on wider iPad layouts or with larger accessibility text.
@ViewBuilder
func expr(_ slots: [MathSlot], size: CGFloat) -> some View {
    MathExpression(slots: slots, size: size)
        .frame(maxWidth: .infinity)
        .frame(minHeight: size + 24)
}

/// Plays a single audio cue. Falls back to no-op if id is empty.
@MainActor
func playCue(_ audio: PandaAudio, _ id: String) {
    guard !id.isEmpty else { return }
    audio.playCue(id)
}

/// Plays a sequence of audio cues (e.g. intro + per-step + reward).
@MainActor
func playCues(_ audio: PandaAudio, _ ids: [String]) {
    let cleanIds = ids.filter { !$0.isEmpty }
    guard !cleanIds.isEmpty else { return }
    audio.playSequence(cleanIds)
}

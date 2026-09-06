//
//  SharedLevelHelpers.swift
//  Panda
//
//  Small helpers shared by every math level (L1..L8). Kept here so each
//  level file can stay focused on its own step layout + audio cues.
//
//  * `expr(_:size:)` — wrap a `MathExpression` in a fixed-height frame
//    so it lays out cleanly inside a `StepRender`'s vertical stack.
//  * `playCue(_:_:)` / `playCues(_:_:)` — thin wrappers around the
//    shared `PandaAudio` engine. Both no-op when the cue id is empty
//    so levels can splice optional cues into their step audio chains
//    without conditional boilerplate.
//

import SwiftUI

/// Wrap a `MathExpression` in a fixed-height frame so it lays out
/// cleanly inside a `StepRender`'s vertical stack.
@ViewBuilder
func expr(_ slots: [MathSlot], size: CGFloat) -> some View {
    MathExpression(slots: slots, size: size)
        .frame(maxWidth: .infinity)
        .frame(height: size + 24)
}

/// Plays a single audio cue. Falls back to no-op if id is empty.
@MainActor
func playCue(_ audio: PandaAudio, _ id: String) {
    guard !id.isEmpty else { return }
    audio.playCue(id)
}

/// Plays a sequence of cues (e.g. intro + per-step + reward).
@MainActor
func playCues(_ audio: PandaAudio, _ ids: [String]) {
    for id in ids { audio.playCue(id) }
}

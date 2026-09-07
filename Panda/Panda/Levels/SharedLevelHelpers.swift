//
//  SharedLevelHelpers.swift
//  Panda
//
//  Small helpers shared by every math level (L1..L8).
//

import SwiftUI

@ViewBuilder
func expr(_ slots: [MathSlot], size: CGFloat) -> some View {
    MathExpression(slots: slots, size: size)
        .frame(maxWidth: .infinity)
        .frame(minHeight: size + 24)
}

@MainActor
func playCue(_ audio: PandaAudio, _ id: String) {
    guard !id.isEmpty else { return }
    audio.playCue(id)
}

/// Plays cues serially. Calling playCue repeatedly would cancel the previous
/// cue in PandaAudio and make only the last narration audible.
@MainActor
func playCues(_ audio: PandaAudio, _ ids: [String]) {
    let cleanIds = ids.filter { !$0.isEmpty }
    guard !cleanIds.isEmpty else { return }
    audio.playSequence(cleanIds)
}

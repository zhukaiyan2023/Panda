//
//  Level1View.swift
//  Panda
//
//  L1 — 十以内减法 (subWithinTen).
//  Single-step problems: "a − b = □" where a, b ∈ {1..9}, a > b.
//  Audio: per-step "a 减 b 等于几" (l6-s1-{a}-{b}), reward
//  "a 减 b 等于 answer" (l6-rwd-{a}-{b}-{answer}).
//
//  Cue ids still live under the l6-* prefix because this content
//  originated in JS level6.js before the four-way split.
//

import SwiftUI

public struct Level1View: View {
    public init() {}
    public var body: some View {
        RoundScaffold(
            levelId: 1,
            sampleSize: 6,
            stepLabels: ["算一算"],
            poolGen: PandaPools.poolGensForLevel(1),
            stepBuilder: { round, _, host in
                guard case .subWithinTen(let a, let b) = round else {
                    return StepRender()
                }
                let answer = a - b
                // Audio: "a减b等于几" — JS uses l6-s1-{a}-{b}
                // (the cue-id prefix didn't move when the level
                // renumbered L6 → L1).
                host.playCue("l6-s1-\(a)-\(b)")
                // L1 is a single-step problem — no separate anchor view,
                // just show the equation once.
                let equation = ExpressionBuilder.sub(a, b, answer: "□")
                return StepRender(
                    equation: AnyView(expr(equation, size: 96)),
                    question: host.makeQuestion(
                        correct: answer,
                        values: optionChoices(correct: answer, min: 0, max: 10))
                )
            },
            onRoundCorrect: { audio, round, lastEncourageId in
                guard case .subWithinTen(let a, let b) = round else { return }
                let answer = a - b
                // Reward audio: "a减b等于answer" — JS uses
                // l6-rwd-{a}-{b}-{answer}. Chain off the cheer
                // (`lastEncourageId` = "enc-first-{levelId}") so the
                // reward doesn't overlap the celebration.
                let cue = "l6-rwd-\(a)-\(b)-\(answer)"
                if let prev = lastEncourageId {
                    audio.playAfter(prev, then: [cue], gapMs: 200, seqGapMs: 200)
                } else {
                    audio.playCue(cue)
                }
            },
            showPanda: false
        )
    }
}

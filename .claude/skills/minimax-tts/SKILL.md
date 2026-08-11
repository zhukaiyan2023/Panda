---
name: minimax-tts
description: Use when the user asks to generate speech, narration, voice-over, or TTS audio via MiniMax, or when they explicitly want the `lovely_girl` voice or another MiniMax system voice for a one-shot TTS call (not for the Panda project's pre-baked audio pool).
---

# minimax-tts

One-shot MiniMax TTS. Calls `POST /v1/t2a_v2` on `https://api.minimaxi.com`
with `Authorization: Bearer ${MINIMAX_API_KEY}`, parses the audio bytes
out of the response, and writes them to a caller-supplied file.

## When to use

- User asks for a one-off TTS clip ("say 'hello' in lovely_girl voice",
  "generate a Chinese welcome message", "make an mp3 of this text").
- User names MiniMax directly or asks for a `lovely_girl` voice.
- DO NOT use for the Panda project's runtime audio — that's pre-baked
  via the Azure / ElevenLabs / Tencent providers in `tools/`.

## When NOT to use

- Voice cloning with user-uploaded samples — this skill only uses
  system voices.
- Streaming / chunked responses — this skill writes a single file.

## Recipe

Required: `--text`, `--out` (file path; extension matches `--format`).

Optional + defaults:

| flag | default | notes |
|---|---|---|
| `--voice_id` | `lovely_girl` | any MiniMax system voice |
| `--model` | `speech-02-hd` | or `speech-02-turbo` for speed |
| `--speed` | `1.0` | 0.5 – 2.0 |
| `--vol` | `5` | 0 – 10 |
| `--format` | `mp3` | `mp3` / `wav` / `pcm` |

Invocation:

```bash
bash Panda/.claude/skills/minimax-tts/bin/tts.sh \
  --text "Hello world" \
  --out /abs/path/hello.mp3
```

Success: `OK <bytes> bytes → /abs/path/hello.mp3`.
Failure: `ERROR <http_code>: <body>` (Authorization always stripped).

## Constraints (read before invoking)

1. **API key**: must be set in env as `MINIMAX_API_KEY`. If the user
   pastes a key in chat, do NOT echo it back and do NOT write it to
   `.env` for them — tell them to `export MINIMAX_API_KEY=...`
   themselves. Never include the key in the request body or URL.
2. **Output path**: the caller (you) must supply an absolute `--out`
   path. The script refuses to write to a directory or follow a
   symlink. Parent dir must exist; pass `--mkdir` only if you mean to
   create it.
3. **What you may do**: change the voice, model, speed, vol, format.
4. **What you must NOT do**: edit `MINIMAX_API_KEY`, edit the script
   silently, or invoke the API more than once per user request unless
   the user explicitly asked for multiple takes.
5. **Errors**: any `Authorization` / `Bearer` line in an error message
   is stripped before printing — do not re-introduce the key when
   reporting failures back to the user.

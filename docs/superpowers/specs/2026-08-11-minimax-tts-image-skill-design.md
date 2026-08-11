# MiniMax TTS + Image Generation Skills

## Context

User wants two Claude Code skills that call the MiniMax (`minimaxi.com`)
platform for **one-shot** speech synthesis and image generation, so any
app development session can produce audio + visuals without standing up
a separate pipeline.

- TTS skill defaults to the platform system voice `lovely_girl`.
- Image skill is a plain text-to-image call.
- API key is the user-set env var `MINIMAX_API_KEY`. Never written to
  the repo.
- Both skills live **only** in this Panda project at
  `Panda/.claude/skills/`. The existing Panda TTS pipeline (Azure /
  ElevenLabs / Tencent, all pre-baked) is **not** touched.
- Output path is always supplied by the caller. The skill does not
  invent a destination.

User confirmed in the brainstorm round:
- Scope: project-local (`Panda/.claude/skills/`)
- Key source: `MINIMAX_API_KEY` env var
- Output: caller-specified path (required)
- No changes to Panda's existing TTS provider chain

## Architecture

```
Panda/.claude/skills/
  minimax-tts/
    SKILL.md            # discovery + recipe (~150 words)
    bin/tts.sh          # executable, POSTs /v1/t2a_v2
  minimax-image/
    SKILL.md            # discovery + recipe (~150 words)
    bin/image.sh        # executable, POSTs /v1/image_generation
  lib/
    minimax-api.sh      # shared: key check, POST helper, error formatter
```

Two independent skills share one bash helper library. Each skill's
`SKILL.md` is purely reference + recipe; the actual work is in
`bin/*.sh` which the agent invokes via the Bash tool.

## API surface (from search + user-supplied docs)

Base URL: `https://api.minimaxi.com`
Auth header: `Authorization: Bearer ${MINIMAX_API_KEY}`

### TTS — `POST /v1/t2a_v2`

Request body (verified shape — small fields the script sets):
- `model`: `"speech-02-hd"` (default) or `"speech-02-turbo"`
- `text`: required, up to 200 000 chars per request
- `voice_id`: system voice name, e.g. `"lovely_girl"`, `"English_expressive_narrator"`
- `speed`: number, 0.5–2.0, default `1.0`
- `vol`: number, 0–10, default `5`
- `audio_setting` / `format`: `"mp3"` (default), `"wav"`, `"pcm"`

Response: `data.audio` (hex string) or `data.audio_url`. Script writes
bytes to the caller's `--out` path.

### Image — `POST /v1/image_generation`

Request body:
- `model`: `"image-01"` (default)
- `prompt`: required text prompt
- `aspect_ratio`: `"1:1"` (default), `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`
- `n`: 1–4, default `1`
- `response_format`: `"base64"` (default) or `"url"`

Response: `data[].b64_json` (base64 string) when `response_format=base64`,
else `data[].url`. Script decodes base64 → file at caller's `--out` path.

## Skill 1 — `minimax-tts`

### `SKILL.md` frontmatter
```yaml
name: minimax-tts
description: Use when the user asks to generate speech, narration, voice-over, or TTS audio via MiniMax, or when they explicitly want the `lovely_girl` voice or another MiniMax system voice for a one-shot TTS call (not for the Panda project's pre-baked audio pool).
```

### Recipe (in SKILL.md body)
- Required: `--text`, `--out` (file path; `.mp3`/`.wav`/`.pcm` per format)
- Optional + defaults:
  - `--voice_id lovely_girl`
  - `--model speech-02-hd`
  - `--speed 1.0`
  - `--vol 5`
  - `--format mp3`
- Invocation: `bash Panda/.claude/skills/minimax-tts/bin/tts.sh --text "..." --out /abs/path/out.mp3 [...]`
- Success: `OK <bytes> bytes → <out>`
- Failure: `ERROR <http_code>: <body>` with **no** Authorization leak

### `bin/tts.sh` behavior
1. Source `../lib/minimax-api.sh`.
2. `require_minimax_key` — exit 1 if `MINIMAX_API_KEY` unset.
3. Parse args (long flags), build JSON body with `jq -n --arg ...`.
4. `minimax_post /v1/t2a_v2 "$body"` → returns body to stdout.
5. `jq -r '.data.audio // .data.audio_url'`. If URL, `curl` it; if hex, `xxd -r -p` to bytes.
6. Write to `--out` (refuse to follow symlinks; refuse if `--out` is a directory).
7. Print `OK <bytes> bytes → <out>`.

## Skill 2 — `minimax-image`

### `SKILL.md` frontmatter
```yaml
name: minimax-image
description: Use when the user asks to generate an image, illustration, icon, hero art, sprite, or thumbnail via MiniMax, or when they want a one-shot text-to-image call without standing up a separate image pipeline.
```

### Recipe (in SKILL.md body)
- Required: `--prompt`, `--out` (file path; `.png`/`.jpg`).
- Optional + defaults:
  - `--model image-01`
  - `--aspect_ratio 1:1`
  - `--n 1`
  - `--response_format base64`
- `--n 1` uses `--out`; `--n > 1` requires `--out-dir` and the script writes `out-dir/out-001.png`, `out-dir/out-002.png`, …
- Invocation: `bash Panda/.claude/skills/minimax-image/bin/image.sh --prompt "..." --out /abs/path/out.png [...]`
- Success: `OK <bytes> bytes → <out>` (or one line per file for `n>1`)
- Failure: `ERROR <http_code>: <body>`

### `bin/image.sh` behavior
1. Source `../../lib/minimax-api.sh`.
2. `require_minimax_key` — exit 1 if unset.
3. Parse args; build JSON body with `jq`.
4. POST → parse `data[].b64_json` (default) or `data[].url` (then GET).
5. Decode base64 / save fetched bytes to each per-image path.
6. Refuse to write outside the caller-specified directory; create parent
   dir only if `--mkdir` flag is passed (default off — force caller to
   be explicit about disk layout).

## Shared `lib/minimax-api.sh`

```bash
# Public functions
require_minimax_key           # exit 1 with red "MINIMAX_API_KEY not set" if empty
minimax_post <path> <json>    # sets MINIMAX_LAST_CODE; echoes body to stdout
sanitize_body <body>          # truncates + strips any "Authorization" / "Bearer" lines
```

Exit codes used across both scripts:
- `1` — missing or empty `MINIMAX_API_KEY`
- `2` — HTTP response code not in 2xx
- `3` — missing dependency (`jq`, `curl`, `xxd`, `base64`)
- `4` — file IO error (cannot write `--out`, path is a directory, etc.)

## Security constraints (printed in every SKILL.md under "Constraints")

1. Never print `MINIMAX_API_KEY` or the full `Authorization` header. The
   helper `sanitize_body` strips those lines before any error message.
2. Never write the key to the repo. If a user pastes the key in chat,
   the skill must not auto-write it to `.env`; tell the user to
   `export MINIMAX_API_KEY=…` themselves.
3. Write only to the path the caller passed. No implicit `/tmp` writes,
   no dotfiles, no overwriting files outside the project without an
   absolute path the user supplied.
4. Treat API output as opaque bytes — preserve watermarks and any
   provider-embedded metadata verbatim.

## TDD-for-skills (RED → GREEN → REFACTOR)

- **RED**: dispatch 3 subagent pressure scenarios without the skill;
  confirm they invent wrong endpoint / wrong field name / leak the key
  into body.
- **GREEN**: write `SKILL.md` + scripts. Re-run same scenarios; agent
  should now call `bin/tts.sh` with the documented flags and not edit
  the key.
- **REFACTOR**: plug holes — e.g. scenario where the user pastes the
  key in chat, scenario with `n=3` and missing `--out-dir`, scenario
  with `--out` pointing at a relative path outside the project.

## Out of scope (deliberately)

- Voice cloning uploads (would need a second endpoint, file upload,
  longer API call). Can be added in a follow-up spec.
- Streaming / chunked responses.
- Any change to Panda's existing pre-baked TTS providers (Azure,
  ElevenLabs, Tencent).
- A `minimax-mcp` MCP server variant. Bash scripts are sufficient for
  one-shot calls; MCP is justified only if we want a long-lived
  tool/session boundary, which we don't.

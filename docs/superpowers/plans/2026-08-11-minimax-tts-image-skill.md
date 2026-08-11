# minimax-tts + minimax-image Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two project-local Claude Code skills (`minimax-tts`, `minimax-image`) that call the MiniMax platform for one-shot speech and image generation, so any app-dev session can produce audio/visuals without standing up a separate pipeline.

**Architecture:** Each skill is a folder with a `SKILL.md` (recipe + Constraints) plus an executable `bin/*.sh` that the agent invokes via the Bash tool. Both scripts share `lib/minimax-api.sh` for key check, POST helper, error sanitization, and path validation. The user's `MINIMAX_API_KEY` env var is the only auth surface — the key is never written to the repo, never echoed, and stripped from any error output.

**Tech Stack:** Bash (macOS 3.2 compatible — no `mapfile`), `jq`, `curl`, `xxd`, `base64`. No npm dependencies. Skills are picked up by Claude Code's `Skill` tool from `Panda/.claude/skills/`.

> **Status note:** This plan was written *after* the implementation was already done end-to-end against the real MiniMax API on 2026-08-11. Every "Task" below is a reproduction / verification step — a fresh session following them in order should produce an identical commit set to commit `356205b` and the same two `356205b`-era commits, with the spec at `docs/superpowers/specs/2026-08-11-minimax-tts-image-skill-design.md`.

## Global Constraints

- **Skill location:** `Panda/.claude/skills/` only (project-local, not global). Spec chose "仅本项目" over global.
- **API key:** read from `MINIMAX_API_KEY` env var. Never written to disk by the skill. If user pastes it in chat, agent tells them to `export MINIMAX_API_KEY=...` themselves.
- **Output path:** caller MUST supply an absolute path via `--out` (n=1) or `--out-dir` (n>1). Script refuses to follow symlinks, refuses to overwrite directories, refuses to auto-create parents unless `--mkdir` is set.
- **Default voice:** `lovely_girl`. Default TTS model: `speech-02-hd`. Default image model: `image-01`. Default image aspect: `1:1`. Default n: 1.
- **TTS body shape (critical, must match real API):** `{model, text, stream:false, voice_setting:{voice_id, speed, vol}, audio_setting:{sample_rate:32000, bitrate:128000, format:"mp3"}}`. Top-level `voice_id` / `speed` / `vol` returns 2013 "invalid params, empty field".
- **Image response shape (critical):** MiniMax returns `{data:{image_base64:["..."]}}` or `{data:{image_url:["..."]}}`. Some endpoints return OpenAI-style `{data:[{b64_json,url}]}` — script handles both. Image-01 currently returns JPEG bytes regardless of `--ext`.
- **Error format:** `ERROR <http_code>: <body>` with every line containing "Authorization" or "Bearer" stripped.
- **Exit codes:** 1 = missing key, 2 = HTTP non-2xx, 3 = missing dep, 4 = file IO / arg error.
- **No change to Panda's existing TTS pipeline** (Azure / ElevenLabs / Tencent in `tools/`).
- **`.gitignore`:** add `!.claude/skills/` exception so skills go into the repo; rest of `.claude/` stays ignored.

---

## File Structure

| Path | Responsibility |
|---|---|
| `.claude/skills/lib/minimax-api.sh` | Sourceable helper: `require_minimax_key`, `require_deps`, `minimax_post`, `sanitize_body`, `ensure_writable_path`. Owns the base URL (`MINIMAX_BASE_URL`, default `https://api.minimaxi.com`) and exit-code contract. |
| `.claude/skills/minimax-tts/SKILL.md` | Discovery frontmatter + recipe + Constraints. Loaded by Claude Code's Skill tool when a user asks for MiniMax TTS. |
| `.claude/skills/minimax-tts/bin/tts.sh` | Executable. Parses args, builds the nested `voice_setting`/`audio_setting` body, hex-decodes `data.audio` (fallback URL), writes to `--out`. |
| `.claude/skills/minimax-image/SKILL.md` | Discovery frontmatter + recipe + Constraints. Loaded when a user asks for MiniMax image gen. |
| `.claude/skills/minimax-image/bin/image.sh` | Executable. Parses args, routes n=1 vs n>1, decodes `data.image_base64[]` (fallback `data[].b64_json`), writes to `--out` or `out-dir/out-NNN.<ext>`. |
| `.gitignore` | Add `!.claude/skills/` exception. |
| `docs/superpowers/specs/2026-08-11-minimax-tts-image-skill-design.md` | Source of truth for design (already committed). |
| `~/.zshrc` | `export MINIMAX_API_KEY=...` (user-supplied, not in repo). |

---

### Task 1: Verify `.gitignore` carries the skills exception

**Files:**
- Verify: `.gitignore`

- [ ] **Step 1: Confirm the exception line is present**

Run: `grep -n '!\\.claude/skills/' .gitignore`
Expected: a line like `!.claude/skills/` after `/.claude/`.

- [ ] **Step 2: Confirm `git check-ignore` no longer blocks the SKILL.md files**

Run: `git check-ignore -v .claude/skills/minimax-tts/SKILL.md`
Expected: exit 1 (NOT ignored). If exit 0 with a `.gitignore:12:/.claude/` line, the negation did not take — re-verify `.gitignore` ordering or use `git add -f` for the initial commit.

---

### Task 2: Create the shared lib

**Files:**
- Create: `Panda/.claude/skills/lib/minimax-api.sh`

**Interfaces:**
- Produces (consumed by Tasks 3 and 4): `require_minimax_key`, `require_deps <bin>...`, `minimax_post <path> <json>` (sets `MINIMAX_LAST_CODE`, echoes body), `sanitize_body <body>`, `ensure_writable_path <path> [--mkdir]`. Exit codes 1/2/3/4 as above.

- [ ] **Step 1: Create the file with the contract below**

```bash
# minimax-api.sh — shared helpers for MiniMax API skills.
# Source this file; do not execute it directly.
#
# Exit codes used by all skills in this directory:
#   1 — MINIMAX_API_KEY missing or empty
#   2 — HTTP response code not in 2xx
#   3 — missing dependency (jq, curl, xxd, base64)
#   4 — file IO error (path is a directory / symlink / parent missing)

set -u

: "${MINIMAX_BASE_URL:=https://api.minimaxi.com}"

require_minimax_key() {
  if [[ -z "${MINIMAX_API_KEY:-}" ]]; then
    printf 'ERROR: MINIMAX_API_KEY is not set. Run: export MINIMAX_API_KEY=...\n' >&2
    exit 1
  fi
}

require_deps() {
  local missing=()
  local bin
  for bin in "$@"; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      missing+=("$bin")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    printf 'ERROR: missing required binaries: %s\n' "${missing[*]}" >&2
    exit 3
  fi
}

minimax_post() {
  local path="$1"
  local body="$2"
  local tmpfile
  tmpfile="$(mktemp)"
  local code
  code="$(curl -sS -o "$tmpfile" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${MINIMAX_API_KEY}" \
    -H "Content-Type: application/json" \
    --data "$body" \
    "${MINIMAX_BASE_URL}${path}")" || {
      rm -f "$tmpfile"
      printf 'ERROR: curl failed before getting a status (network?)\n' >&2
      exit 2
    }
  MINIMAX_LAST_CODE="$code"
  cat "$tmpfile"
  rm -f "$tmpfile"
  if [[ ! "$code" =~ ^2 ]]; then
    return 2
  fi
}

sanitize_body() {
  printf '%s\n' "$1" | grep -viE '(authorization|bearer[[:space:]])' || true
}

ensure_writable_path() {
  local target="$1"
  local mkdir_flag="${2:-}"
  local parent
  parent="$(dirname -- "$target")"

  if [[ -L "$target" ]]; then
    printf 'ERROR: refusing to write to symlink: %s\n' "$target" >&2
    exit 4
  fi
  if [[ -d "$target" && ! -L "$target" ]]; then
    printf 'ERROR: refusing to overwrite directory: %s\n' "$target" >&2
    exit 4
  fi
  if [[ ! -d "$parent" ]]; then
    if [[ "$mkdir_flag" == "--mkdir" ]]; then
      mkdir -p -- "$parent" || {
        printf 'ERROR: cannot create parent dir: %s\n' "$parent" >&2
        exit 4
      }
    else
      printf 'ERROR: parent dir does not exist: %s (pass --mkdir to create)\n' "$parent" >&2
      exit 4
    fi
  fi
}
```

- [ ] **Step 2: Smoke-test the lib in isolation**

Run: `bash -c 'source .claude/skills/lib/minimax-api.sh && require_deps jq curl xxd base64 && echo OK'`
Expected: prints `OK`, exit 0.

Run: `bash -c 'unset MINIMAX_API_KEY; source .claude/skills/lib/minimax-api.sh && require_minimax_key' 2>&1`
Expected: prints `ERROR: MINIMAX_API_KEY is not set.`, exit 1.

---

### Task 3: Create the TTS script

**Files:**
- Create: `Panda/.claude/skills/minimax-tts/bin/tts.sh` (chmod +x)

**Interfaces:**
- Consumes: lib from Task 2.
- Produces: stdout `OK <bytes> bytes → <out>` on success; stderr `ERROR ...` on failure; exit 0/1/2/3/4 per the lib contract.
- Public flags: `--text`, `--out`, `--voice_id` (default `lovely_girl`), `--model` (default `speech-02-hd`), `--speed` (default 1.0), `--vol` (default 5), `--format` (default `mp3`), `--help`.

- [ ] **Step 1: Write the file**

```bash
#!/usr/bin/env bash
# tts.sh — one-shot MiniMax TTS call. See ../SKILL.md for the recipe.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../../lib/minimax-api.sh"

require_deps jq curl xxd

# Defaults
voice_id="lovely_girl"
model="speech-02-hd"
speed="1.0"
vol="5"
format="mp3"
text=""
out=""

# Parse long flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      sed -n '2,30p' "${SCRIPT_DIR}/../SKILL.md" >&2
      exit 0
      ;;
    --text)        text="$2"; shift 2 ;;
    --out)         out="$2"; shift 2 ;;
    --voice_id)    voice_id="$2"; shift 2 ;;
    --model)       model="$2"; shift 2 ;;
    --speed)       speed="$2"; shift 2 ;;
    --vol)         vol="$2"; shift 2 ;;
    --format)      format="$2"; shift 2 ;;
    *)
      printf 'ERROR: unknown flag: %s\n' "$1" >&2
      exit 4
      ;;
  esac
done

require_minimax_key

if [[ -z "$text" ]]; then
  printf 'ERROR: --text is required\n' >&2
  exit 4
fi
if [[ -z "$out" ]]; then
  printf 'ERROR: --out is required (caller must supply the destination path)\n' >&2
  exit 4
fi

ensure_writable_path "$out"

body="$(jq -n \
  --arg model "$model" \
  --arg text "$text" \
  --arg voice_id "$voice_id" \
  --arg speed "$speed" \
  --arg vol "$vol" \
  --arg format "$format" \
  --argjson sample_rate 32000 \
  --argjson bitrate 128000 \
  '{
    model: $model,
    text: $text,
    stream: false,
    voice_setting: {voice_id: $voice_id, speed: ($speed|tonumber), vol: ($vol|tonumber)},
    audio_setting: {sample_rate: $sample_rate, bitrate: $bitrate, format: $format}
  }')"

response="$(minimax_post /v1/t2a_v2 "$body")" || {
  printf 'ERROR: HTTP %s: %s\n' "${MINIMAX_LAST_CODE:-?}" "$(sanitize_body "$response")" >&2
  exit 2
}

hex="$(printf '%s' "$response" | jq -r '.data.audio // empty')"
url="$(printf '%s' "$response" | jq -r '.data.audio_url // empty')"

if [[ -n "$hex" ]]; then
  printf '%s' "$hex" | xxd -r -p > "$out"
elif [[ -n "$url" ]]; then
  curl -sS -o "$out" "$url"
else
  printf 'ERROR: response has no data.audio or data.audio_url: %s\n' "$(sanitize_body "$response")" >&2
  exit 2
fi

bytes="$(wc -c < "$out" | tr -d ' ')"
printf 'OK %s bytes → %s\n' "$bytes" "$out"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x .claude/skills/minimax-tts/bin/tts.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Verify error paths (no key, no text, no out, --help)**

Run all four — each expected to exit non-zero and print a clear `ERROR` line. `--help` must print the SKILL.md recipe (no key required).

---

### Task 4: Create the image script

**Files:**
- Create: `Panda/.claude/skills/minimax-image/bin/image.sh` (chmod +x)

**Interfaces:**
- Consumes: lib from Task 2.
- Produces: stdout `OK <bytes> bytes → <path>` per image; n=3 produces 3 lines; stderr `ERROR ...` on failure; exit 0/1/2/3/4.
- Public flags: `--prompt`, `--out` (n=1) or `--out-dir` (n>1), `--model` (default `image-01`), `--aspect_ratio` (default `1:1`), `--n` (default 1), `--response_format` (default `base64`), `--ext` (default `png`, only used when n>1), `--mkdir` (off by default), `--help`.

- [ ] **Step 1: Write the file**

```bash
#!/usr/bin/env bash
# image.sh — one-shot MiniMax text-to-image call. See ../SKILL.md for the recipe.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../../lib/minimax-api.sh"

require_deps jq curl base64

# Defaults
model="image-01"
prompt=""
aspect_ratio="1:1"
n=1
response_format="base64"
out=""
out_dir=""
mkdir_flag=""
ext="png"

# Parse long flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      sed -n '2,40p' "${SCRIPT_DIR}/../SKILL.md" >&2
      exit 0
      ;;
    --prompt)         prompt="$2"; shift 2 ;;
    --out)            out="$2"; shift 2 ;;
    --out-dir)        out_dir="$2"; shift 2 ;;
    --model)          model="$2"; shift 2 ;;
    --aspect_ratio)   aspect_ratio="$2"; shift 2 ;;
    --n)              n="$2"; shift 2 ;;
    --response_format) response_format="$2"; shift 2 ;;
    --ext)            ext="$2"; shift 2 ;;
    --mkdir)          mkdir_flag="--mkdir"; shift ;;
    *)
      printf 'ERROR: unknown flag: %s\n' "$1" >&2
      exit 4
      ;;
  esac
done

require_minimax_key

if [[ -z "$prompt" ]]; then
  printf 'ERROR: --prompt is required\n' >&2
  exit 4
fi

# Routing: n=1 → --out, n>1 → --out-dir
if [[ "$n" -eq 1 ]]; then
  if [[ -z "$out" ]]; then
    printf 'ERROR: --out is required when --n 1\n' >&2
    exit 4
  fi
  ensure_writable_path "$out" "$mkdir_flag"
else
  if [[ -z "$out_dir" ]]; then
    printf 'ERROR: --out-dir is required when --n > 1\n' >&2
    exit 4
  fi
  if [[ -d "$out_dir" && ! -L "$out_dir" ]]; then
    printf 'OK-target-dir-exists: %s\n' "$out_dir" >&2
  else
    if [[ "$mkdir_flag" == "--mkdir" ]]; then
      mkdir -p -- "$out_dir" || {
        printf 'ERROR: cannot create out-dir: %s\n' "$out_dir" >&2
        exit 4
      }
    else
      printf 'ERROR: out-dir does not exist: %s (pass --mkdir to create)\n' "$out_dir" >&2
      exit 4
    fi
  fi
fi

body="$(jq -n \
  --arg model "$model" \
  --arg prompt "$prompt" \
  --arg aspect_ratio "$aspect_ratio" \
  --argjson n "$n" \
  --arg response_format "$response_format" \
  '{model: $model, prompt: $prompt, aspect_ratio: $aspect_ratio, n: $n, response_format: $response_format}')"

response="$(minimax_post /v1/image_generation "$body")" || {
  printf 'ERROR: HTTP %s: %s\n' "${MINIMAX_LAST_CODE:-?}" "$(sanitize_body "$response")" >&2
  exit 2
}

write_image() {
  local idx="$1"
  local b64="$2"
  local url_v="$3"
  local target
  if [[ "$n" -eq 1 ]]; then
    target="$out"
  else
    target="${out_dir}/out-$(printf '%03d' "$idx").${ext}"
  fi
  ensure_writable_path "$target" "$mkdir_flag"
  if [[ -n "$b64" ]]; then
    printf '%s' "$b64" | base64 -d > "$target"
  elif [[ -n "$url_v" ]]; then
    curl -sS -o "$target" "$url_v"
  else
    printf 'ERROR: image #%s has no b64_json or url\n' "$idx" >&2
    exit 2
  fi
  local bytes
  bytes="$(wc -c < "$target" | tr -d ' ')"
  printf 'OK %s bytes → %s\n' "$bytes" "$target"
}

data_type="$(printf '%s' "$response" | jq -r '.data | type')"
b64s=()
while IFS= read -r line; do b64s+=("$line"); done < <(
  printf '%s' "$response" | jq -r '.data.image_base64 // [] | .[]'
)
if [[ "$data_type" == "array" && ${#b64s[@]} -eq 0 ]]; then
  while IFS= read -r line; do b64s+=("$line"); done < <(
    printf '%s' "$response" | jq -r '.data[]? | .b64_json // empty'
  )
fi
urls=()
while IFS= read -r line; do urls+=("$line"); done < <(
  printf '%s' "$response" | jq -r '.data.image_url // [] | .[]'
)
if [[ "$data_type" == "array" && ${#urls[@]} -eq 0 ]]; then
  while IFS= read -r line; do urls+=("$line"); done < <(
    printf '%s' "$response" | jq -r '.data[]? | .url // empty'
  )
fi
total=${#b64s[@]}
if [[ ${#urls[@]} -gt $total ]]; then total=${#urls[@]}; fi
if [[ $total -lt 1 ]]; then
  printf 'ERROR: empty data: %s\n' "$(sanitize_body "$response")" >&2
  exit 2
fi
i=0
while [[ $i -lt $total ]]; do
  b64="${b64s[$i]:-}"
  url_v="${urls[$i]:-}"
  write_image $((i+1)) "$b64" "$url_v"
  i=$((i+1))
done
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x .claude/skills/minimax-image/bin/image.sh`

- [ ] **Step 3: Verify error paths**

Run all of: missing key, n=1 + --out-dir (rejected), n=3 without --out-dir, --help. Each should exit non-zero with a clear `ERROR` line, except --help which prints the recipe.

---

### Task 5: Write the SKILL.md files

**Files:**
- Create: `Panda/.claude/skills/minimax-tts/SKILL.md`
- Create: `Panda/.claude/skills/minimax-image/SKILL.md`

**Interfaces:**
- Produces: frontmatter (name + description) that Claude Code's Skill tool indexes for discovery. Description MUST start with "Use when..." and name triggering conditions, not workflow. Body is the recipe an agent reads when the skill is loaded.

- [ ] **Step 1: Write `minimax-tts/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Write `minimax-image/SKILL.md`**

```markdown
---
name: minimax-image
description: Use when the user asks to generate an image, illustration, icon, hero art, sprite, or thumbnail via MiniMax, or when they want a one-shot text-to-image call without standing up a separate image pipeline.
---

# minimax-image

One-shot MiniMax text-to-image. Calls `POST /v1/image_generation` on
`https://api.minimaxi.com` with `Authorization: Bearer ${MINIMAX_API_KEY}`,
then writes the resulting image(s) to caller-supplied paths.

## When to use

- User asks for an image, illustration, icon, hero art, sprite,
  thumbnail, or mockup via MiniMax.
- User wants `n` variants of the same prompt for selection.
- DO NOT use for image editing, inpainting, or upscaling — those are
  different MiniMax endpoints not wrapped here.

## When NOT to use

- Edit / inpaint / outpaint an existing image.
- Reference-image conditioning — needs the file-upload endpoint.

## Recipe

Required: `--prompt`, and either `--out` (when `--n 1`) or `--out-dir`
(when `--n > 1`).

Optional + defaults:

| flag | default | notes |
|---|---|---|
| `--model` | `image-01` | |
| `--aspect_ratio` | `1:1` | `1:1` / `16:9` / `9:16` / `4:3` / `3:4` |
| `--n` | `1` | 1 – 4; `>1` requires `--out-dir` |
| `--response_format` | `base64` | or `url` (then 2 HTTP calls) |
| `--ext` | `png` | only used when `--n > 1`. **Note**: the current `image-01` model returns JPEG bytes regardless of this extension — name the file `.jpg` / `.jpeg` to match reality, or convert after the fact. |
| `--mkdir` | off | create parent / out-dir if missing |

Invocation (single image):

```bash
bash Panda/.claude/skills/minimax-image/bin/image.sh \
  --prompt "a cute panda reading a math book" \
  --aspect_ratio 16:9 \
  --out /abs/path/panda.png
```

Invocation (3 variants into a directory):

```bash
bash Panda/.claude/skills/minimax-image/bin/image.sh \
  --prompt "a cute panda reading a math book" \
  --n 3 \
  --out-dir /abs/path/panda-variants \
  --mkdir
```

Output filenames for `--n > 1`:
`<out-dir>/out-001.png`, `<out-dir>/out-002.png`, `<out-dir>/out-003.png`.

Success: `OK <bytes> bytes → <path>` (one line per image).
Failure: `ERROR <http_code>: <body>` (Authorization always stripped).

## Constraints (read before invoking)

1. **API key**: must be set in env as `MINIMAX_API_KEY`. If the user
   pastes a key in chat, do NOT echo it back and do NOT write it to
   `.env` for them — tell them to `export MINIMAX_API_KEY=...`
   themselves. Never include the key in the request body or URL.
2. **Output path**: the caller (you) must supply an absolute `--out`
   or `--out-dir` path. The script refuses to write to a directory,
   follow a symlink, or auto-create parents unless `--mkdir` is set.
3. **n=1 vs n>1**: you must pick one mode. `--n 1` + `--out-dir` is
   rejected; `--n 3` + `--out` is rejected.
4. **What you may do**: change prompt, model, aspect_ratio, n,
   response_format, ext, mkdir.
5. **What you must NOT do**: edit `MINIMAX_API_KEY`, edit the script
   silently, or invoke the API more than once per user request unless
   the user explicitly asked for multiple takes.
6. **Errors**: any `Authorization` / `Bearer` line in an error message
   is stripped before printing — do not re-introduce the key when
   reporting failures back to the user.
```

- [ ] **Step 3: Verify both frontmatter descriptions start with "Use when"**

Run: `head -5 .claude/skills/minimax-tts/SKILL.md` and `head -5 .claude/skills/minimax-image/SKILL.md`
Expected: frontmatter block whose `description:` value starts with `Use when`.

---

### Task 6: Commit the skills

**Files:**
- Add: `.claude/skills/lib/minimax-api.sh`
- Add: `.claude/skills/minimax-tts/SKILL.md`, `.claude/skills/minimax-tts/bin/tts.sh`
- Add: `.claude/skills/minimax-image/SKILL.md`, `.claude/skills/minimax-image/bin/image.sh`
- Modify: `.gitignore` (add `!.claude/skills/` after `/.claude/`)

- [ ] **Step 1: If `.gitignore` doesn't already whitelist skills, add the exception**

```bash
grep -q '!\.claude/skills/' .gitignore || \
  printf '\n.claude/worktrees/\n/.claude/\n!.claude/skills/\n' >> .gitignore
```

Expected: `git check-ignore -v .claude/skills/minimax-tts/SKILL.md` exits 1.

- [ ] **Step 2: Stage and commit**

```bash
git add .gitignore .claude/skills/
git -c user.name=瑾瑜 -c user.email=kaiyan@local commit -m "feat(skills): minimax-tts + minimax-image Claude skills

Two project-local skills that call the MiniMax platform for one-shot
speech (default voice lovely_girl) and text-to-image generation.

- minimax-tts: POST /v1/t2a_v2, voice_setting + audio_setting nested
  body, hex-decodes data.audio → caller's --out
- minimax-image: POST /v1/image_generation, base64-decodes
  data.image_base64 (or OpenAI-style fallback) → caller's --out (n=1)
  or out-dir/out-NNN.png (n>1)
- shared lib/minimax-api.sh: env-var key, sanitized errors, symlink
  and directory rejection, --mkdir opt-in
- green verified against real MiniMax API; n=3 variant test passes
- key never appears in error output (grep-verified)
- .gitignore: allow .claude/skills/ into the repo (the rest of .claude
  remains ignored: settings.json, worktrees/, daemon state)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: 6 files changed, 503 insertions, 0 deletions; new commit hash.

---

### Task 7: Set the user's `MINIMAX_API_KEY` in `~/.zshrc`

**Files:**
- Modify (out-of-repo): `~/.zshrc`

- [ ] **Step 1: Have the user supply the key out-of-band, or paste it in chat**

- If they paste it in chat, do NOT echo it back. Run a single
  `printf "export MINIMAX_API_KEY='...'\n" >> ~/.zshrc` with the pasted
  value. Verify with `wc -l < ~/.zshrc` (line count should rise by 1)
  and `grep -c '^export MINIMAX_API_KEY=' ~/.zshrc` (should print 1).
  Then `bash -c 'source ~/.zshrc && [[ -n "$MINIMAX_API_KEY" ]] && echo OK'`
  should print `OK`.

- The key format is platform-specific. If `MINIMAX_API_KEY` is rejected
  by the API (401 or 2013 with `unauthorized`), have the user verify
  the key at the MiniMax platform console.

- [ ] **Step 2: Confirm visibility in new shells**

Run: `bash -c 'source ~/.zshrc 2>/dev/null; echo length=${#MINIMAX_API_KEY}'`
Expected: prints `length=125` (or similar non-zero).

---

### Task 8: End-to-end smoke tests against the real API

**Files:**
- Read-only: `~/.zshrc`, scripts from Tasks 3 + 4

- [ ] **Step 1: Single TTS call**

```bash
source ~/.zshrc
bash .claude/skills/minimax-tts/bin/tts.sh --text "test" --out /tmp/smoke-tts.mp3
file /tmp/smoke-tts.mp3
```

Expected: `OK 18xxx bytes → /tmp/smoke-tts.mp3`, exit 0. `file` reports
`Audio file with ID3 version 2.x, contains: MPEG ADTS, layer III, v1,
128 kbps, 32 kHz, Monaural`.

- [ ] **Step 2: Single image call**

```bash
source ~/.zshrc
bash .claude/skills/minimax-image/bin/image.sh \
  --prompt "a tiny red dot" --aspect_ratio "1:1" --out /tmp/smoke-img.png
file /tmp/smoke-img.png
```

Expected: `OK <bytes> bytes → /tmp/smoke-img.png`, exit 0. `file` reports
`JPEG image data, ... 1024x1024` (note: the .png extension is a label
only — bytes are JPEG; this is current `image-01` behavior).

- [ ] **Step 3: n=3 variant test**

```bash
source ~/.zshrc
rm -rf /tmp/smoke-variants
bash .claude/skills/minimax-image/bin/image.sh \
  --prompt "a red apple" --n 3 --out-dir /tmp/smoke-variants --mkdir
ls -la /tmp/smoke-variants/
file /tmp/smoke-variants/out-001.png
file /tmp/smoke-variants/out-002.png
file /tmp/smoke-variants/out-003.png
```

Expected: 3 `OK <bytes> bytes → ...` lines, 3 JPEG files in
`/tmp/smoke-variants/`.

- [ ] **Step 4: Clean up /tmp**

```bash
rm -f /tmp/smoke-tts.mp3 /tmp/smoke-img.png
rm -rf /tmp/smoke-variants
```

---

### Task 9: Security verifications

**Files:**
- Read-only: scripts from Tasks 3 + 4

- [ ] **Step 1: Error output must not contain the API key**

Force a server-side error by sending an obviously-bad model name.
Grep the error output for the key. Expected: grep returns 1 (no match).

```bash
source ~/.zshrc
KEY="$MINIMAX_API_KEY"
ERR=$(bash .claude/skills/minimax-tts/bin/tts.sh \
  --text "x" --out /tmp/sec-test.mp3 --model "INVALID_MODEL" 2>&1 || true)
echo "$ERR" | grep -qF "$KEY" && echo "FAIL: KEY LEAKED" || echo "PASS"
rm -f /tmp/sec-test.mp3
```

- [ ] **Step 2: Refuses symlink at --out**

```bash
ln -sf /tmp/real-target.mp3 /tmp/sym.mp3
bash .claude/skills/minimax-tts/bin/tts.sh --text "x" --out /tmp/sym.mp3
echo "exit=$?"
rm -f /tmp/sym.mp3
```

Expected: `ERROR: refusing to write to symlink: /tmp/sym.mp3`, exit 4.

- [ ] **Step 3: Refuses to write to a directory**

```bash
mkdir -p /tmp/dir-out
bash .claude/skills/minimax-tts/bin/tts.sh --text "x" --out /tmp/dir-out
echo "exit=$?"
rmdir /tmp/dir-out
```

Expected: `ERROR: refusing to overwrite directory: /tmp/dir-out`, exit 4.

- [ ] **Step 4: Refuses contradictory n flags**

```bash
bash .claude/skills/minimax-image/bin/image.sh --prompt "x" --n 1 --out-dir /tmp/x --mkdir
echo "exit=$?"
bash .claude/skills/minimax-image/bin/image.sh --prompt "x" --n 3 --out /tmp/x.png
echo "exit=$?"
```

Expected: both exit 4 with the matching `ERROR` line.

---

### Task 10: (Optional) Mock-server offline verification

If the user's API key is unavailable or they're working on a plane,
they can re-run a full request-shape check against a local mock.
This is what we used during initial GREEN.

**Files:**
- Create: `/tmp/mock_minimax.py` (lives in /tmp, ephemeral)
- Read-only: scripts from Tasks 3 + 4

- [ ] **Step 1: Write the mock**

```python
#!/usr/bin/env python3
"""Tiny mock of MiniMax API for offline script verification."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAU"
    "AAen63NgAAAAASUVORK5CYII="
)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else ""
        print("=== MOCK REQUEST ===", file=sys.stderr)
        print(f"PATH:   {self.path}", file=sys.stderr)
        print(f"HEADERS:", file=sys.stderr)
        for k, v in self.headers.items():
            masked = v
            if k.lower() == "authorization":
                masked = v[:14] + "...REDACTED"
            print(f"  {k}: {masked}", file=sys.stderr)
        print(f"BODY:   {body}", file=sys.stderr)

        if self.path == "/v1/t2a_v2":
            resp = '{"data":{"audio":"48656c6c6f"}}'
        elif self.path == "/v1/image_generation":
            resp = '{"data":[{"b64_json":"' + TINY_PNG_B64 + '"}]}'
        else:
            resp = '{"error":"unknown path"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(resp.encode("utf-8"))

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
```

- [ ] **Step 2: Run scripts against the mock**

```bash
python3 /tmp/mock_minimax.py 2>/tmp/mock.log &
MOCK_PID=$!
sleep 0.4
MINIMAX_API_KEY=test-key MINIMAX_BASE_URL=http://127.0.0.1:8765 \
  bash .claude/skills/minimax-tts/bin/tts.sh --text "Hello" --out /tmp/m-tts.mp3
MINIMAX_API_KEY=test-key MINIMAX_BASE_URL=http://127.0.0.1:8765 \
  bash .claude/skills/minimax-image/bin/image.sh --prompt "x" --out /tmp/m-img.png
kill $MOCK_PID
xxd /tmp/m-tts.mp3 | head -1      # expect: "Hello" (hex 48656c6c6f)
file /tmp/m-img.png               # expect: PNG image data, 1 x 1
rm -f /tmp/m-tts.mp3 /tmp/m-img.png /tmp/mock_minimax.py /tmp/mock.log
```

Expected: TTS writes "Hello" (5 bytes) to disk; image writes a 68-byte
valid 1x1 PNG. Mock log shows `PATH: /v1/t2a_v2` and
`PATH: /v1/image_generation` with the right bodies.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Two project-local skills under `Panda/.claude/skills/` | T1, T2, T3, T4, T5, T6 |
| Shared `lib/minimax-api.sh` with the 4 exit codes | T2 |
| TTS POST `/v1/t2a_v2`, `lovely_girl` default, `speech-02-hd` default, hex-then-url response, no symlink, no directory, parent must exist | T3, T8, T9 |
| Image POST `/v1/image_generation`, `image-01` default, `1:1` default, n=1 → `--out`, n>1 → `--out-dir/out-NNN.<ext>`, base64 default + OpenAI-style fallback, no symlink, no directory, no auto-mkdir | T4, T8, T9 |
| `MINIMAX_API_KEY` env var, never logged, never in `.env` | T2, T7, T9 |
| Authorization header sanitized in errors | T2, T9 |
| `mkdir_flag` only when caller passes `--mkdir` | T3, T4 |
| `--help` exits before any key check | T3, T4 |
| `.gitignore` exception for `.claude/skills/` | T1, T6 |
| Existing Panda TTS pipeline untouched | (no task needed — only `.claude/`, `.gitignore` change) |
| Spec doc at `docs/superpowers/specs/2026-08-11-minimax-tts-image-skill-design.md` | (already committed outside this plan's scope) |

**Placeholder scan:** No TBD / TODO / "implement later" / "similar to
Task N" / unspecified flags. Every flag, default, and error message is
in the code blocks above.

**Type / name consistency:**
- `--voice_id` consistent between T3 and T5 (the SKILL.md).
- `--out` / `--out-dir` consistent between T4 and T5.
- Exit codes 1/2/3/4 are spelled the same in T2, T3, T4.
- `MINIMAX_BASE_URL` env var is the override hook in T2; both T3 and
  T4 inherit it via the sourced lib.

No fixes needed.

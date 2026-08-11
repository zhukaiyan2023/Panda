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

# Required args
if [[ -z "$text" ]]; then
  printf 'ERROR: --text is required\n' >&2
  exit 4
fi
if [[ -z "$out" ]]; then
  printf 'ERROR: --out is required (caller must supply the destination path)\n' >&2
  exit 4
fi

ensure_writable_path "$out"

# Build request body with jq (safe quoting).
# MiniMax T2A v2 expects voice_setting + audio_setting as nested objects,
# with sample_rate and bitrate inside audio_setting. Top-level voice_id
# / speed / vol returns 2013 "invalid params, empty field".
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

# POST and capture
response="$(minimax_post /v1/t2a_v2 "$body")" || {
  printf 'ERROR: HTTP %s: %s\n' "${MINIMAX_LAST_CODE:-?}" "$(sanitize_body "$response")" >&2
  exit 2
}

# Extract audio: try hex first, then URL.
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

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

# Required args
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

# Build request body
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

# Helper: write one image, either from b64 or from URL.
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

# Walk the data array.
# MiniMax returns {data: {image_base64: [b64, ...]}} or {data: {image_url: [url, ...]}}.
# Some endpoints return OpenAI-style {data: [{b64_json, url}, ...]} — handle both.
# Use a while-read loop instead of `mapfile` (not on macOS bash 3.2).
data_type="$(printf '%s' "$response" | jq -r '.data | type')"
b64s=()
urls=()
if [[ "$data_type" == "array" ]]; then
  # OpenAI-style: data is [{b64_json,url}, ...]
  while IFS= read -r line; do b64s+=("$line"); done < <(
    printf '%s' "$response" | jq -r '.data[]? | .b64_json // empty'
  )
  while IFS= read -r line; do urls+=("$line"); done < <(
    printf '%s' "$response" | jq -r '.data[]? | .url // empty'
  )
elif [[ "$data_type" == "object" ]]; then
  # MiniMax-style: data is {image_base64:[...], image_url:[...]}
  while IFS= read -r line; do b64s+=("$line"); done < <(
    printf '%s' "$response" | jq -r '.data.image_base64 // [] | .[]'
  )
  while IFS= read -r line; do urls+=("$line"); done < <(
    printf '%s' "$response" | jq -r '.data.image_url // [] | .[]'
  )
else
  printf 'ERROR: unexpected data type %s: %s\n' "$data_type" "$(sanitize_body "$response")" >&2
  exit 2
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

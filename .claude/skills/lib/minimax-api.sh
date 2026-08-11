# minimax-api.sh — shared helpers for MiniMax API skills.
# Source this file; do not execute it directly.
#
# Exit codes used by all skills in this directory:
#   1 — MINIMAX_API_KEY missing or empty
#   2 — HTTP response code not in 2xx
#   3 — missing dependency (jq, curl, xxd, base64)
#   4 — file IO error (path is a directory / symlink / parent missing)

set -u  # do not set -e here; callers manage their own error flow

# Base URL for the MiniMax platform. Override with MINIMAX_BASE_URL for tests.
: "${MINIMAX_BASE_URL:=https://api.minimaxi.com}"

# require_minimax_key — exit 1 if the env var is unset or empty.
require_minimax_key() {
  if [[ -z "${MINIMAX_API_KEY:-}" ]]; then
    printf 'ERROR: MINIMAX_API_KEY is not set. Run: export MINIMAX_API_KEY=...\n' >&2
    exit 1
  fi
}

# require_deps — exit 3 if any of the listed binaries is missing.
#   usage: require_deps jq curl xxd base64
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

# minimax_post <path> <json-body> — POST to <MINIMAX_BASE_URL><path>.
#   Sets MINIMAX_LAST_CODE to the HTTP status code.
#   Echoes the response body to stdout. On network error, exits 2.
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

# sanitize_body <body> — strip any line that contains "Authorization" or
#   "Bearer" (case-insensitive) so we never echo the API key in errors.
sanitize_body() {
  printf '%s\n' "$1" | grep -viE '(authorization|bearer[[:space:]])' || true
}

# ensure_writable_path <path> [--mkdir]
#   Refuses to follow symlinks, refuses if path exists as a directory,
#   creates the parent dir if --mkdir is given, otherwise fails if the
#   parent does not exist. Exits 4 on any rejection.
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

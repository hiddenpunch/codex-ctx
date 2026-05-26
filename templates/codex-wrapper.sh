#!/usr/bin/env bash
# __CODEX_CTX_MARKER__
set -euo pipefail

CODEX_HOME_DIR="${HOME}/.codex"
CTX_HOME="${HOME}/.codex-ctx"
CURRENT_FILE="${CTX_HOME}/current"
REAL_CODEX_FILE="${CTX_HOME}/real_codex"
AUTH_CONTEXTS_DIR="${HOME}/.codex-auth-contexts"
ACTIVE_AUTH="${CODEX_HOME_DIR}/auth.json"

usage() {
  cat <<'EOF'
Usage:
  codex ctx                 Show current Codex auth context
  codex ctx list            List known auth contexts
  codex ctx <name>          Switch auth context, creating it if needed
  codex ctx home [name]     Print where auth is stored for a context

Sessions, config, logs, and caches stay shared in ~/.codex.
Only ~/.codex/auth.json is switched between accounts.
EOF
}

valid_ctx_name() {
  [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]
}

ctx_dir_for() {
  printf '%s\n' "${AUTH_CONTEXTS_DIR}/$1"
}

ctx_auth_for() {
  printf '%s/auth.json\n' "$(ctx_dir_for "$1")"
}

current_ctx() {
  if [[ -s "$CURRENT_FILE" ]]; then
    tr -d '\n' < "$CURRENT_FILE"
  else
    printf 'default'
  fi
}

real_codex() {
  if [[ ! -s "$REAL_CODEX_FILE" ]]; then
    echo "codex ctx error: real Codex path is not configured. Run: codex-ctx install" >&2
    exit 127
  fi

  path="$(tr -d '\n' < "$REAL_CODEX_FILE")"
  if [[ ! -x "$path" ]]; then
    echo "codex ctx error: real Codex executable not found: $path" >&2
    echo "Run: codex-ctx install --real-codex /path/to/codex" >&2
    exit 127
  fi

  printf '%s\n' "$path"
}

save_active_auth() {
  ctx="$1"
  dir="$(ctx_dir_for "$ctx")"
  mkdir -p "$dir"

  if [[ -f "$ACTIVE_AUTH" ]]; then
    cp -p "$ACTIVE_AUTH" "$(ctx_auth_for "$ctx")"
  else
    rm -f "$(ctx_auth_for "$ctx")"
  fi
}

load_ctx_auth() {
  ctx="$1"
  mkdir -p "$CODEX_HOME_DIR" "$(ctx_dir_for "$ctx")"

  if [[ -f "$(ctx_auth_for "$ctx")" ]]; then
    cp -p "$(ctx_auth_for "$ctx")" "$ACTIVE_AUTH"
    chmod 600 "$ACTIVE_AUTH" 2>/dev/null || true
  else
    rm -f "$ACTIVE_AUTH"
  fi
}

mkdir -p "$CODEX_HOME_DIR" "$CTX_HOME" "$AUTH_CONTEXTS_DIR"
chmod 700 "$CTX_HOME" "$AUTH_CONTEXTS_DIR" 2>/dev/null || true

if [[ "${1:-}" == "ctx" ]]; then
  cmd="${2:-status}"

  case "$cmd" in
    ""|status|current)
      ctx="$(current_ctx)"
      auth_state="not logged in"
      [[ -f "$ACTIVE_AUTH" ]] && auth_state="auth present"
      printf 'current: %s\n' "$ctx"
      printf 'shared home: %s\n' "$CODEX_HOME_DIR"
      printf 'active auth: %s (%s)\n' "$ACTIVE_AUTH" "$auth_state"
      printf 'stored auth: %s\n' "$(ctx_auth_for "$ctx")"
      ;;
    list)
      active="$(current_ctx)"
      for dir in "$AUTH_CONTEXTS_DIR"/*; do
        [[ -d "$dir" ]] || continue
        basename "$dir"
      done | sort | while IFS= read -r name; do
        marker=" "
        [[ "$name" == "$active" ]] && marker="*"
        state="not logged in"
        [[ -f "$(ctx_auth_for "$name")" ]] && state="auth saved"
        printf '%s %s\t%s\t%s\n' "$marker" "$name" "$state" "$(ctx_dir_for "$name")"
      done
      ;;
    home)
      ctx="${3:-$(current_ctx)}"
      if ! valid_ctx_name "$ctx"; then
        echo "invalid ctx name: $ctx" >&2
        exit 2
      fi
      ctx_dir_for "$ctx"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      next_ctx="$cmd"
      if ! valid_ctx_name "$next_ctx"; then
        echo "invalid ctx name: $next_ctx" >&2
        echo "use only letters, numbers, dot, underscore, or dash" >&2
        exit 2
      fi

      prev_ctx="$(current_ctx)"
      save_active_auth "$prev_ctx"
      load_ctx_auth "$next_ctx"
      printf '%s\n' "$next_ctx" > "$CURRENT_FILE"

      state="not logged in"
      [[ -f "$ACTIVE_AUTH" ]] && state="auth loaded"
      printf 'codex ctx -> %s (%s)\n' "$next_ctx" "$state"
      ;;
  esac

  exit 0
fi

unset CODEX_HOME
exec "$(real_codex)" "$@"

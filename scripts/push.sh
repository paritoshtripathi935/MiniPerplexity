#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# scripts/push.sh
#
# Stage, commit (optional) and push the current branch to GitHub using a
# personal access token. Author identity is locked to:
#     name : Paritosh Tripathi
#     email: paritosh.tripathi.work@gmail.com
#
# Token sources, in priority order:
#   1. $GITHUB_TOKEN  (env var)
#   2. .env.git       (file at repo root, single line: GITHUB_TOKEN=ghp_xxx)
#
# Both are gitignored. Never commit your token.
#
# Usage:
#   ./scripts/push.sh                          # push current branch as-is
#   ./scripts/push.sh -m "commit message"      # stage all + commit + push
#   ./scripts/push.sh -m "msg" -b new-branch   # also create/switch branch
#   ./scripts/push.sh --force                  # force push (use with care)
# -----------------------------------------------------------------------------
set -euo pipefail

# ---------- Config -----------------------------------------------------------
GIT_USER_NAME="Paritosh Tripathi"
GIT_USER_EMAIL="paritosh.tripathi.work@gmail.com"
GITHUB_USER="paritoshtripathi935"
REPO="MiniPerplexity"

# ---------- Helpers ----------------------------------------------------------
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

die() { red "✗ $*"; exit 1; }

# ---------- Locate repo root -------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repo."
cd "$REPO_ROOT"

# ---------- Parse args -------------------------------------------------------
COMMIT_MSG=""
NEW_BRANCH=""
FORCE_PUSH=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        -m|--message)  COMMIT_MSG="${2:-}"; shift 2 ;;
        -b|--branch)   NEW_BRANCH="${2:-}";  shift 2 ;;
        --force)       FORCE_PUSH=1;         shift ;;
        -h|--help)     sed -n '2,22p' "$0"; exit 0 ;;
        *)             die "Unknown arg: $1" ;;
    esac
done

# ---------- Load token -------------------------------------------------------
if [[ -z "${GITHUB_TOKEN:-}" && -f "$REPO_ROOT/.env.git" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$REPO_ROOT/.env.git"; set +a
fi

[[ -n "${GITHUB_TOKEN:-}" ]] || die "GITHUB_TOKEN is not set. Export it or put it in .env.git (see .env.git.example)."

# ---------- Set local identity (repo-scoped, never global) -------------------
git config user.name  "$GIT_USER_NAME"
git config user.email "$GIT_USER_EMAIL"

# ---------- Switch / create branch if requested ------------------------------
if [[ -n "$NEW_BRANCH" ]]; then
    if git show-ref --verify --quiet "refs/heads/$NEW_BRANCH"; then
        git checkout "$NEW_BRANCH"
    else
        git checkout -b "$NEW_BRANCH"
    fi
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$CURRENT_BRANCH" != "HEAD" ]] || die "Detached HEAD; switch to a branch first."

blue "→ Branch: $CURRENT_BRANCH"
blue "→ Author: $GIT_USER_NAME <$GIT_USER_EMAIL>"

# ---------- Optional commit --------------------------------------------------
if [[ -n "$COMMIT_MSG" ]]; then
    git add -A
    if git diff --cached --quiet; then
        blue "→ Nothing staged; skipping commit."
    else
        git commit -m "$COMMIT_MSG"
        green "✓ Committed."
    fi
fi

# ---------- Push with token --------------------------------------------------
# Strategy: configure the token via http.extraHeader for THIS push only,
# rather than embedding it in the remote URL. That way `git push` never has
# the token in any string it might print to stdout/stderr (the
# "set up to track 'URL'" line will show the clean origin URL, not the token).
#
# The header is encoded `Authorization: Basic base64(user:token)`. We pass it
# with `git -c` so it lives only in the process env, never on disk.
CLEAN_URL="https://github.com/${GITHUB_USER}/${REPO}.git"
AUTH_B64="$(printf '%s:%s' "$GITHUB_USER" "$GITHUB_TOKEN" | base64 | tr -d '\n')"

# Make sure origin points at the clean URL (no embedded creds), so set-upstream
# stores something safe.
git remote set-url origin "$CLEAN_URL" 2>/dev/null || git remote add origin "$CLEAN_URL"

PUSH_ARGS=(-c "http.${CLEAN_URL}.extraHeader=Authorization: Basic ${AUTH_B64}" push)
[[ $FORCE_PUSH -eq 1 ]] && PUSH_ARGS+=(--force-with-lease)
PUSH_ARGS+=(--set-upstream origin "$CURRENT_BRANCH")

# Belt-and-suspenders: filter both stderr AND stdout for any URL with creds,
# in case a future git version prints them.
SCRUB='s|https://[^@[:space:]]+@|https://***@|g; s|Authorization: Basic [A-Za-z0-9+/=]+|Authorization: Basic ***|g'
if git "${PUSH_ARGS[@]}" \
        > >(sed -E "$SCRUB") \
        2> >(sed -E "$SCRUB" >&2); then
    green "✓ Pushed $CURRENT_BRANCH to origin."
    blue  "→ PR: https://github.com/${GITHUB_USER}/${REPO}/pull/new/${CURRENT_BRANCH}"
else
    die "git push failed."
fi

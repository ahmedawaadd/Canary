#!/usr/bin/env bash
#
# Canary installer 🐦
# Installs the Canary skill into your Claude Code skills directory.
#
#   curl -fsSL https://raw.githubusercontent.com/ahmedawaadd/Canary/main/install.sh | bash
#
set -euo pipefail

REPO="ahmedawaadd/Canary"
BRANCH="${CANARY_BRANCH:-main}"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="${CLAUDE_DIR}/skills/canary"

echo "🐦  Installing Canary -> ${DEST}"

mkdir -p "${DEST}"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "${RAW}/skills/canary/SKILL.md" -o "${DEST}/SKILL.md"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "${DEST}/SKILL.md" "${RAW}/skills/canary/SKILL.md"
else
  echo "error: need curl or wget to install" >&2
  exit 1
fi

echo "🐦  Done. Start Claude Code and watch for the bird: [🐦:1]"

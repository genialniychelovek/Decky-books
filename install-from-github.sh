#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   REPO_URL="https://github.com/user/repo" BRANCH="main" ./install-from-github.sh
# Optional when plugin is inside a subfolder of the repo:
#   SUBDIR="decky-books-plugin" REPO_URL="https://github.com/user/repo" ./install-from-github.sh

REPO_URL="${REPO_URL:-https://github.com/YOUR_USER/YOUR_REPO}"
BRANCH="${BRANCH:-main}"
SUBDIR="${SUBDIR:-}"
PLUGIN_NAME="${PLUGIN_NAME:-decky-books}"
DEST="${DEST:-$HOME/homebrew/plugins/$PLUGIN_NAME}"

if [[ "$REPO_URL" != https://github.com/*/* ]]; then
  echo "REPO_URL must look like https://github.com/user/repo" >&2
  exit 1
fi

OWNER_REPO="${REPO_URL#https://github.com/}"
OWNER_REPO="${OWNER_REPO%.git}"
ZIP_URL="https://github.com/${OWNER_REPO}/archive/refs/heads/${BRANCH}.zip"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading $ZIP_URL"
curl -L --fail "$ZIP_URL" -o "$TMP_DIR/repo.zip"
unzip -q "$TMP_DIR/repo.zip" -d "$TMP_DIR/repo"
SRC_ROOT="$(find "$TMP_DIR/repo" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
SRC="$SRC_ROOT"
if [[ -n "$SUBDIR" ]]; then
  SRC="$SRC_ROOT/$SUBDIR"
fi

if [[ ! -f "$SRC/plugin.json" ]]; then
  echo "plugin.json not found in $SRC. Set SUBDIR if plugin is not in repo root." >&2
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete --exclude .git --exclude node_modules "$SRC/" "$DEST/"

echo "Installed to $DEST"
echo "Restart Decky Loader, then build if you installed source instead of dist."

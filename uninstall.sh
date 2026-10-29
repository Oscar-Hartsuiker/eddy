#!/usr/bin/env bash
# Remove eddy installed by install.sh.
#
#   ./uninstall.sh                  remove the system-wide install in /usr/local
#   ./uninstall.sh --user           remove the per-user install in ~/.local
#   ./uninstall.sh --prefix DIR     remove an install under DIR
#
# Only eddy's own files are removed; nothing else under the prefix is touched.

set -euo pipefail

APP_NAME="eddy"
BIN_NAME="eddy"

PREFIX="${PREFIX:-/usr/local}"

usage() {
  cat <<'EOF'
Remove eddy installed by install.sh.

Usage:
  ./uninstall.sh [--user | --prefix DIR]

Options:
  --user         Remove the per-user install in ~/.local
  --prefix DIR   Remove an install under DIR (default: /usr/local)
  -h, --help     Show this help

Run as your normal user; sudo is used only if a file is not removable.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      PREFIX="${HOME}/.local"
      shift
      ;;
    --prefix)
      [[ $# -ge 2 ]] || { echo "error: --prefix needs a directory" >&2; exit 1; }
      PREFIX="$2"
      shift 2
      ;;
    --prefix=*)
      PREFIX="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[[ -n $PREFIX ]] || { echo "error: empty prefix" >&2; exit 1; }
PREFIX="${PREFIX/#\~/$HOME}"
[[ $PREFIX == /* ]] || { echo "error: prefix must be an absolute path" >&2; exit 1; }
PREFIX="${PREFIX%/}"
[[ -n $PREFIX && $PREFIX != "/" ]] || { echo "error: invalid prefix" >&2; exit 1; }

BIN_DIR="${PREFIX}/bin"
APPS_DIR="${PREFIX}/share/applications"
ICONS_DIR="${PREFIX}/share/icons/hicolor"
DESKTOP_FILE="${APPS_DIR}/${APP_NAME}.desktop"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

remove_file() {
  local dest="$1"
  [[ -e $dest || -L $dest ]] || return 1
  if rm -f -- "$dest" 2>/dev/null; then
    say "Removed $dest"
    return 0
  fi
  say "Need elevated permissions for $dest"
  sudo rm -f -- "$dest"
  say "Removed $dest"
}

removed_any=0

if remove_file "$BIN_DIR/$BIN_NAME"; then removed_any=1; fi
if remove_file "$DESKTOP_FILE"; then removed_any=1; fi

for size in 32 64 128 256; do
  if remove_file "$ICONS_DIR/${size}x${size}/apps/${APP_NAME}.png"; then
    removed_any=1
  fi
  rmdir --ignore-fail-on-non-empty "$ICONS_DIR/${size}x${size}/apps" 2>/dev/null || true
  rmdir --ignore-fail-on-non-empty "$ICONS_DIR/${size}x${size}" 2>/dev/null || true
done

if [[ $removed_any -eq 0 ]]; then
  echo "Nothing to remove: no eddy install found under $PREFIX."
  echo "If you installed with --user, run: ./uninstall.sh --user"
  exit 0
fi

if command -v update-desktop-database >/dev/null 2>&1 && [[ -d $APPS_DIR ]]; then
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 ||
    sudo update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1 && [[ -d $ICONS_DIR ]]; then
  gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 ||
    sudo gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 || true
fi

say "eddy removed from ${PREFIX}"

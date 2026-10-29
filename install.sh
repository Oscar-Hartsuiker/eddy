#!/usr/bin/env bash
# Build and install eddy.
#
#   ./install.sh                    install system-wide to /usr/local (sudo)
#   ./install.sh --user             install for this user only (~/.local)
#   ./install.sh --prefix DIR       install under DIR
#   ./install.sh --no-build         install an existing release binary
#   ./install.sh --default          also make eddy the default PNG/JPEG/WebP app
#
# Everything is installed under PREFIX:
#   PREFIX/bin/eddy
#   PREFIX/share/applications/eddy.desktop
#   PREFIX/share/icons/hicolor/{32x32,64x64,128x128,256x256}/apps/eddy.png

set -euo pipefail

APP_NAME="eddy"
BIN_NAME="eddy"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

PREFIX="${PREFIX:-/usr/local}"
DESTDIR="${DESTDIR:-}"
DO_BUILD=1
SET_DEFAULT=0

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Options:
  --user         Install into ~/.local instead of /usr/local
  --prefix DIR   Install under DIR
  --no-build     Skip the release build and reuse src-tauri/target/release/eddy
  --default      Set eddy as the default handler for PNG, JPEG, and WebP
  -h, --help     Show this help

Run this as your normal user; sudo is used only for the final copy when needed.
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
    --no-build)
      DO_BUILD=0
      shift
      ;;
    --default)
      SET_DEFAULT=1
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

[[ -n $PREFIX ]] || { echo "error: empty install prefix" >&2; exit 1; }
PREFIX="${PREFIX/#\~/$HOME}"
[[ $PREFIX == /* ]] || { echo "error: prefix must be an absolute path" >&2; exit 1; }
PREFIX="${PREFIX%/}"
[[ -n $PREFIX && $PREFIX != "/" ]] || { echo "error: invalid install prefix" >&2; exit 1; }

if [[ ${EUID} -eq 0 && -z ${EDDY_ALLOW_ROOT:-} ]]; then
  echo "error: run ./install.sh as your normal user, not with sudo." >&2
  echo "       It will ask for sudo only when copying into ${PREFIX}." >&2
  echo "       (Set EDDY_ALLOW_ROOT=1 to override.)" >&2
  exit 1
fi

BIN_DIR="${DESTDIR}${PREFIX}/bin"
APPS_DIR="${DESTDIR}${PREFIX}/share/applications"
ICONS_DIR="${DESTDIR}${PREFIX}/share/icons/hicolor"
DESKTOP_FILE="${APPS_DIR}/${APP_NAME}.desktop"
BIN_SRC="${SCRIPT_DIR}/src-tauri/target/release/${BIN_NAME}"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }

# Install a file, using sudo only if the destination is not writable.
install_file() {
  local src="$1" dest="$2" mode="$3"
  local dir
  dir="$(dirname -- "$dest")"

  if [[ ! -d $dir ]]; then
    mkdir -p -- "$dir" 2>/dev/null || sudo mkdir -p -- "$dir"
  fi
  if install -m "$mode" -- "$src" "$dest" 2>/dev/null; then
    return 0
  fi
  say "Need elevated permissions for $dest"
  sudo install -m "$mode" -- "$src" "$dest"
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

if [[ $DO_BUILD -eq 1 ]]; then
  command -v node >/dev/null 2>&1 || {
    echo "error: node is required to build eddy (https://nodejs.org)" >&2
    exit 1
  }
  command -v npm >/dev/null 2>&1 || {
    echo "error: npm is required to build eddy" >&2
    exit 1
  }
  command -v cargo >/dev/null 2>&1 || {
    echo "error: cargo is required to build eddy (https://rustup.rs)" >&2
    exit 1
  }

  cd -- "$SCRIPT_DIR"

  if [[ ! -d node_modules ]]; then
    say "Installing npm dependencies"
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  say "Building eddy (release)"
  npm run app:build -- --no-bundle
else
  say "Skipping build (--no-build)"
fi

if [[ ! -f $BIN_SRC ]]; then
  echo "error: release binary not found at $BIN_SRC" >&2
  echo "       run ./install.sh without --no-build first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------

say "Installing binary to $BIN_DIR/$BIN_NAME"
install_file "$BIN_SRC" "$BIN_DIR/$BIN_NAME" 755

for size in 32 64 128; do
  src="${SCRIPT_DIR}/src-tauri/icons/${size}x${size}.png"
  [[ -f $src ]] || continue
  install_file "$src" "$ICONS_DIR/${size}x${size}/apps/${APP_NAME}.png" 644
done
if [[ -f "${SCRIPT_DIR}/src-tauri/icons/128x128@2x.png" ]]; then
  install_file "${SCRIPT_DIR}/src-tauri/icons/128x128@2x.png" \
    "$ICONS_DIR/256x256/apps/${APP_NAME}.png" 644
fi

exec_path="${PREFIX}/bin/${BIN_NAME}"
escaped_exec="${exec_path//\\/\\\\}"
escaped_exec="${escaped_exec//\"/\\\"}"

tmp_desktop="$(mktemp "${TMPDIR:-/tmp}/eddy-desktop.XXXXXX.desktop")"
trap 'rm -f -- "$tmp_desktop"' EXIT

cat >"$tmp_desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=eddy
GenericName=Photo Editor
Comment=A simple, modern, minimalist photo editor
Exec="${escaped_exec}" %f
TryExec=${exec_path}
Icon=${APP_NAME}
Terminal=false
Categories=Graphics;Photography;
Keywords=photo;image;editor;crop;curve;rotate;
MimeType=image/png;image/jpeg;image/webp;
StartupNotify=true
StartupWMClass=${APP_NAME}
EOF

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$tmp_desktop" || warn "desktop entry validation reported issues"
fi

say "Installing desktop entry to $DESKTOP_FILE"
install_file "$tmp_desktop" "$DESKTOP_FILE" 644

if [[ -z $DESTDIR ]]; then
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 ||
      sudo update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 ||
      sudo gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 || true
  fi

  if [[ $SET_DEFAULT -eq 1 ]] && command -v xdg-mime >/dev/null 2>&1; then
    for mime in image/png image/jpeg image/webp; do
      xdg-mime default "${APP_NAME}.desktop" "$mime" ||
        warn "could not set default handler for $mime"
    done
    say "eddy is now the default app for PNG, JPEG, and WebP"
  fi
fi

case ":${PATH}:" in
  *":${PREFIX}/bin:"*) ;;
  *)
    warn "${PREFIX}/bin is not on your PATH."
    warn "Add this to your shell config: export PATH=\"${PREFIX}/bin:\$PATH\""
    ;;
esac

say "Installed eddy into ${PREFIX}"
if [[ -z $DESTDIR ]]; then
  echo "    Run:    eddy photo.jpg"
  echo "    Menu:   search for \"eddy\" in your app launcher"
  echo "    Files:  right-click an image → Open With → eddy"
  [[ $SET_DEFAULT -eq 1 ]] ||
    echo "    Default: rerun with --default to open PNG/JPEG/WebP by double-click"
fi

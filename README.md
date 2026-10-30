# eddy

A simple, modern, minimalist photo editor. One image per window, launched from
your file manager or a terminal.

Built with **Tauri 2** (Rust) + **React** + **Canvas**. No Electron, no
telemetry, no cloud.

```
eddy photo.jpg
```

## Features

**Adjust** — Exposure, Brightness, Contrast, Saturation, non-destructive until
you save.

**Curves** — RGB tone curve with monotone cubic interpolation. Drag points to
shape it, click empty space to add a point, middle-click or double-click a
point to remove it. The black and white points stay pinned to the edges.

**Transform** — Crop: drag a region, drag a corner handle to resize it, drag
inside it to move it around, and pick an aspect ratio preset (Free / Orig /
1:1 / 5:4 / 4:3 / 3:2 / 16:9 and their portrait variants). Rule-of-thirds
overlay, rotate 90° either direction, flip horizontally or vertically.

**View** — Wheel to zoom at the cursor, drag to pan, double-click to toggle
fit/100%, with zoom in / fit / out controls in the bar along the bottom of
the window.

**Shortcuts**
| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Save, overwriting the original file |
| `Ctrl/Cmd + Shift + S` | Save as… |
| `Ctrl/Cmd + O` | Open another image |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| Hold `\` | Show the original |
| `C` | Crop |
| `R` / `Shift + R` | Rotate right / left |
| `H` / `V` | Flip horizontally / vertically |
| `+` / `-` / `0` | Zoom in / out / fit |
| `Esc` | Cancel crop |

Images save in their original format by default (PNG, JPEG, or WebP). Saves are
written to a temporary sibling file and renamed into place, so an interrupted
save never truncates your original.

## Getting started

### Prerequisites

- Node.js 18+ and npm
- Rust (stable) and Cargo
- Tauri's Linux system dependencies

On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libgtk-3-dev libsoup-3.0-dev librsvg2-dev libxdo-dev libssl-dev \
  libayatana-appindicator3-dev
```

(On Fedora, Arch, etc. see the [Tauri prerequisites](https://tauri.app/start/prerequisites/).)

### Run

```bash
npm install
npm run app        # tauri dev
```

### Test

```bash
npm test
```

Bundles `tests/*.test.ts` with esbuild (already a vite dependency) and runs
them: crop geometry (selection starts at the click, ratio lock, moving and
clamping) and the per-pixel adjustment pipeline (regression check for the
fractional LUT indexing bug).

### Build

```bash
npm run app:build  # tauri build
```

Packaged installers land in `src-tauri/target/release/bundle/`.

### Install

`install.sh` builds a release binary and installs it system-wide to
`/usr/local`, with a desktop entry, icons, and an `eddy` command on your `PATH`:

```bash
./install.sh                 # /usr/local — app menu, file manager, CLI
./install.sh --default       # also become the default PNG/JPEG/WebP handler
./install.sh --user          # per-user install in ~/.local instead
./uninstall.sh               # remove the system-wide install
./uninstall.sh --user        # remove a per-user install
```

Sudo is used only for the copy into `/usr/local`, so run the script as your
normal user. After installing, eddy appears in your app launcher and in
file-manager "Open With" menus. Use `--default` if you want double-clicking an
image to open eddy. Use `./install.sh --no-build` to reuse an existing
`src-tauri/target/release/eddy`.

### Updating

`install.sh` is idempotent — it rebuilds and overwrites the existing binary,
desktop entry, and icons in place. Uninstalling first is not necessary.

```bash
# 1. get the new source (git pull, or replace this folder)
# 2. quit any running eddy windows
./install.sh
```

If you installed with a custom prefix, pass the same prefix again
(`./install.sh --prefix /usr/local`). Your images are never touched by
install or uninstall. For a versioned release, bump the version in
`package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

### Frontend only

```bash
npm run dev
```

Open <http://localhost:1420> for the browser fallback (open via file picker,
save via download). Add `?demo` for a sample image:
<http://localhost:1420/?demo>.

## How it works

- `src/image/renderer.ts` draws the source bitmap with rotation/flip/crop and
  bakes in the adjustments. The viewport renders a capped-resolution preview;
  saving re-renders at full resolution.
- `src/image/adjustments.ts` folds exposure, brightness and contrast into a
  256-entry LUT, then applies saturation and the curve LUT per pixel.
- `src/image/curves.ts` builds the curve LUT with Fritsch–Carlson monotone
  cubic interpolation (smooth, no overshoot).
- `src-tauri/src/lib.rs` handles file reading, atomic saving, and spawning a
  new window per image. Encoding is done in Rust with the `image` crate, so
  output format support is consistent regardless of the WebView.

## Notes & limitations

- WebP export is currently **lossless** (the pure-Rust encoder has no lossy
  quality control). A quality slider for WebP/JPEG is a natural next step.
- EXIF orientation is not applied; images are shown as decoded.
- Adjustments are applied destructively on save; undo/redo lives in memory only
  and is discarded when the window closes.
- Opening a second image spawns a new window, matching the one-image-per-window
  brief.

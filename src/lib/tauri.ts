import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { SaveFormat } from "../types";
import { extensionFor } from "../types";
import { bytesToBase64, basename } from "./paths";

export interface ImagePayload {
  path: string;
  name: string;
  mime: string;
  ext: string;
  base64: string;
}

export interface SaveResult {
  path: string;
  bytes: number;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getInitialFile(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("initial_file");
}

export async function readImage(path: string): Promise<ImagePayload> {
  return invoke<ImagePayload>("read_image", { path });
}

export async function writeImage(
  path: string,
  pngBytes: Uint8Array,
  format: SaveFormat,
  quality: number,
): Promise<SaveResult> {
  return invoke<SaveResult>("save_image", {
    path,
    pngBase64: bytesToBase64(pngBytes),
    format,
    quality,
  });
}

export async function openInNewWindow(path: string): Promise<void> {
  return invoke("open_in_new_window", { path });
}

/** Native open dialog. Returns null when cancelled. */
export async function pickImagePath(): Promise<string | null> {
  const selection = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp"],
      },
    ],
  });
  return typeof selection === "string" ? selection : null;
}

/**
 * Native save dialog. `defaultPath` seeds the filename so the original format
 * is preserved by default.
 */
export async function pickSavePath(defaultPath: string): Promise<string | null> {
  const target = await save({
    defaultPath,
    filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
      { name: "WebP", extensions: ["webp"] },
    ],
  });
  return target ?? null;
}

export function withExtension(path: string, format: SaveFormat): string {
  const hasExt = /\.[a-z0-9]+$/i.test(basename(path));
  return hasExt ? path : `${path}.${extensionFor(format)}`;
}

export interface Adjustments {
  exposure: number; // stops, -2..2
  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // -1..1
}

export interface CurvePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export type Curve = CurvePoint[];

export type Rotation = 0 | 90 | 180 | 270;

export interface Transform {
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CropRatioId =
  | "free"
  | "original"
  | "1:1"
  | "5:4"
  | "4:3"
  | "3:2"
  | "16:9"
  | "9:16"
  | "3:4"
  | "2:3";

export interface CropRatioOption {
  id: CropRatioId;
  label: string;
}

export const CROP_RATIOS: CropRatioOption[] = [
  { id: "free", label: "Free" },
  { id: "original", label: "Orig" },
  { id: "1:1", label: "1:1" },
  { id: "5:4", label: "5:4" },
  { id: "4:3", label: "4:3" },
  { id: "3:2", label: "3:2" },
  { id: "16:9", label: "16:9" },
  { id: "3:4", label: "3:4" },
  { id: "2:3", label: "2:3" },
  { id: "9:16", label: "9:16" },
];

const PARSE_RATIO: Record<CropRatioId, number | null> = {
  free: null,
  "1:1": 1,
  "5:4": 5 / 4,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "3:4": 3 / 4,
  "2:3": 2 / 3,
  original: null, // resolved from the image dimensions
};

/** Aspect ratio (width / height in image pixels) for a preset. `null` = free. */
export function cropRatioValue(id: CropRatioId, space: { w: number; h: number }): number | null {
  if (id === "original") return space.h > 0 ? space.w / space.h : null;
  return PARSE_RATIO[id] ?? null;
}

/**
 * Refit a crop rectangle to a ratio.
 * `keepCenter` anchors on the center (used by "reset"), otherwise the
 * rectangle keeps its top-left corner and only shrinks to fit.
 */
export function fitCropToRatio(
  rect: CropRect,
  space: { w: number; h: number },
  ratio: number | null,
  keepCenter = false,
): CropRect {
  if (!ratio || space.w <= 0 || space.h <= 0) return rect;

  const maxW = Math.min(rect.w, space.w);
  const maxH = Math.min(rect.h, space.h);
  if (maxW <= 0 || maxH <= 0) return rect;

  // Largest box of the given ratio (w/h in image pixels) that fits.
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  let x = rect.x;
  let y = rect.y;
  if (keepCenter) {
    x = rect.x + (rect.w - w) / 2;
    y = rect.y + (rect.h - h) / 2;
  }

  x = Math.max(0, Math.min(space.w - w, x));
  y = Math.max(0, Math.min(space.h - h, y));
  return { x, y, w, h };
}

export interface ImageDoc {
  path: string | null;
  name: string;
  mime: string;
  ext: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export const DEFAULT_TRANSFORM: Transform = {
  rotation: 0,
  flipH: false,
  flipV: false,
};

export const DEFAULT_CURVE: Curve = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export type SaveFormat = "png" | "jpeg" | "webp";

export const FORMAT_LABELS: Record<SaveFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
};

export function formatFromMime(mime: string): SaveFormat {
  if (mime.includes("jpeg")) return "jpeg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

export function formatFromExtension(ext: string): SaveFormat {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "jpg" || e === "jpeg" || e === "jpe") return "jpeg";
  if (e === "webp") return "webp";
  return "png";
}

export function extensionFor(format: SaveFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

/** Dimensions of the image after rotation/flip, before crop. */
export function transformedSize(doc: ImageDoc | null, transform: Transform) {
  if (!doc) return { w: 0, h: 0 };
  const swap = transform.rotation === 90 || transform.rotation === 270;
  return swap ? { w: doc.height, h: doc.width } : { w: doc.width, h: doc.height };
}

/** Dimensions of the final output after transform + crop. */
export function outputSize(doc: ImageDoc | null, transform: Transform, crop: CropRect | null) {
  const t = transformedSize(doc, transform);
  if (!crop) return t;
  return { w: Math.round(crop.w), h: Math.round(crop.h) };
}

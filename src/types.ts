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

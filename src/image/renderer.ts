import type {
  Adjustments,
  CropRect,
  Curve,
  ImageDoc,
  Transform,
} from "../types";
import { transformedSize } from "../types";
import { applyAdjustments, buildLuts } from "./adjustments";

export interface RenderOptions {
  doc: ImageDoc;
  transform: Transform;
  crop: CropRect | null;
  adjustments: Adjustments;
  curve: Curve;
  /** Cap the longest edge of the output. Omit for full resolution. */
  maxDimension?: number;
}

/**
 * Draw the source image into a canvas with rotation/flip/crop applied, then
 * bake in the tonal adjustments. All geometry is computed in "transformed
 * space": the image after rotation/flip, before crop.
 */
export function renderImage(opts: RenderOptions): HTMLCanvasElement {
  const { doc, transform, crop, adjustments, curve, maxDimension } = opts;
  const full = transformedSize(doc, transform);
  const region: CropRect = crop ?? { x: 0, y: 0, w: full.w, h: full.h };

  const scale = maxDimension
    ? Math.min(1, maxDimension / Math.max(region.w, region.h))
    : 1;

  const outW = Math.max(1, Math.round(region.w * scale));
  const outH = Math.max(1, Math.round(region.h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create a 2D canvas context");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawTransformed(ctx, doc, transform, region, outW, outH);

  const imageData = ctx.getImageData(0, 0, outW, outH);
  applyAdjustments(imageData.data, buildLuts(adjustments, curve));
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * Places the transformed image in a coordinate space whose origin is the
 * top-left of the uncropped, transformed image, scaled from `region` to
 * `outW x outH`.
 */
function drawTransformed(
  ctx: CanvasRenderingContext2D,
  doc: ImageDoc,
  transform: Transform,
  region: CropRect,
  outW: number,
  outH: number,
): void {
  const full = transformedSize(doc, transform);
  const scaleX = outW / region.w;
  const scaleY = outH / region.h;

  ctx.save();
  ctx.scale(scaleX, scaleY);
  ctx.translate(-region.x, -region.y);

  // Move to the center of the transformed image, then apply rotation/flip
  // around that center. This keeps the image inside [0, full.w] x [0, full.h].
  ctx.translate(full.w / 2, full.h / 2);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
  ctx.drawImage(
    doc.bitmap,
    -doc.width / 2,
    -doc.height / 2,
    doc.width,
    doc.height,
  );
  ctx.restore();
}

/** Convert a canvas to PNG bytes. */
export function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode image"));
        return;
      }
      blob
        .arrayBuffer()
        .then((buf) => resolve(new Uint8Array(buf)))
        .catch(reject);
    }, "image/png");
  });
}

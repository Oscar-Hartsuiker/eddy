import type { CropRect } from "../types";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Build a crop rectangle (in image pixels) for a drag between two points in
 * normalized image space (0..1 across the image, origin top-left).
 *
 * When `ratio` (width / height in image pixels) is set, the rectangle is
 * locked to that aspect: the drag's fixed corner stays put and the selection
 * shrinks uniformly so it never runs off the image.
 */
export function cropRectFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  space: { w: number; h: number },
  ratio: number | null,
): CropRect {
  const cur = { x: clamp01(end.x), y: clamp01(end.y) };
  const dx = cur.x - start.x;
  const dy = cur.y - start.y;

  let nx = Math.min(start.x, cur.x);
  let ny = Math.min(start.y, cur.y);
  let nw = Math.abs(dx);
  let nh = Math.abs(dy);

  if (ratio && ratio > 0 && space.w > 0 && space.h > 0) {
    // Normalized units are not square: convert the target ratio
    // (w/h in image pixels) into the drag's normalized space.
    const k = space.w / (ratio * space.h);
    const fromX = { w: Math.abs(dx), h: Math.abs(dx) * k };
    const fromY = { h: Math.abs(dy), w: Math.abs(dy) / k };
    const pick = fromX.w * fromX.h >= fromY.w * fromY.h ? fromX : fromY;
    nw = pick.w;
    nh = pick.h;

    const availW = dx >= 0 ? 1 - start.x : start.x;
    const availH = dy >= 0 ? 1 - start.y : start.y;
    const shrink = Math.min(1, availW / Math.max(nw, 1e-9), availH / Math.max(nh, 1e-9));
    nw *= shrink;
    nh *= shrink;

    nx = dx >= 0 ? start.x : start.x - nw;
    ny = dy >= 0 ? start.y : start.y - nh;
  }

  // Guard against float drift dragging the selection a hair off the image.
  nx = clamp01(nx);
  ny = clamp01(ny);
  nw = Math.min(clamp01(nw), 1 - nx);
  nh = Math.min(clamp01(nh), 1 - ny);

  return {
    x: nx * space.w,
    y: ny * space.h,
    w: nw * space.w,
    h: nh * space.h,
  };
}

/**
 * Translate an existing selection by a delta (image pixels), keeping it
 * entirely inside the image.
 */
export function moveCropRect(
  rect: CropRect,
  delta: { dx: number; dy: number },
  space: { w: number; h: number },
): CropRect {
  const w = Math.min(Math.max(0, rect.w), space.w);
  const h = Math.min(Math.max(0, rect.h), space.h);
  const x = Math.max(0, Math.min(space.w - w, rect.x + delta.dx));
  const y = Math.max(0, Math.min(space.h - h, rect.y + delta.dy));
  return { x, y, w, h };
}

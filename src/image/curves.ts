import type { Curve, CurvePoint } from "../types";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Sort + dedupe curve points by x, always keeping the endpoints pinned to
 * x=0 and x=1 so the curve covers the full tonal range.
 */
export function normalizeCurve(points: Curve): Curve {
  const sorted = [...points]
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);

  const deduped: CurvePoint[] = [];
  for (const p of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 0.0005) {
      deduped[deduped.length - 1] = p;
    } else {
      deduped.push(p);
    }
  }

  if (deduped.length === 0) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  if (deduped[0].x > 0) deduped.unshift({ x: 0, y: deduped[0].y });
  const last = deduped[deduped.length - 1];
  if (last.x < 1) deduped.push({ x: 1, y: last.y });
  return deduped;
}

/**
 * Monotone cubic Hermite interpolation (Fritsch–Carlson). Produces a smooth
 * curve that never overshoots between control points, which is what you want
 * from a photo curves tool.
 */
export function curveToLut(curve: Curve): Uint8ClampedArray {
  const pts = normalizeCurve(curve);
  const lut = new Uint8ClampedArray(256);

  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const n = pts.length;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  // Secant slopes between knots.
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    delta.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx);
  }

  // Tangents.
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (delta[i - 1] + delta[i]) / 2;
    }
  }

  // Fritsch–Carlson monotonicity filter.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;

    const x0 = xs[k];
    const x1 = xs[k + 1];
    const h = x1 - x0;
    if (h <= 0) {
      lut[i] = Math.round(clamp01(ys[k]) * 255);
      continue;
    }
    const t = clamp01((x - x0) / h);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const y =
      h00 * ys[k] + h10 * h * m[k] + h01 * ys[k + 1] + h11 * h * m[k + 1];
    lut[i] = Math.round(clamp01(y) * 255);
  }

  return lut;
}

/** Sample the curve at a given x (0..1) using the same interpolation as the LUT. */
export function sampleCurve(lut: Uint8ClampedArray, x: number): number {
  return lut[Math.round(clamp01(x) * 255)] / 255;
}

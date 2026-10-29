import type { Adjustments } from "../types";
import { curveToLut } from "./curves";
import type { Curve } from "../types";

/**
 * Lookup tables for the tonal adjustments. Exposure, brightness and contrast
 * are all per-channel and order-independent enough to fold into one LUT,
 * which keeps preview updates cheap. Saturation + curve are applied after.
 */
export interface AdjustmentLuts {
  tone: Uint8ClampedArray;
  curve: Uint8ClampedArray;
  saturation: number;
  identity: boolean;
}

const clampByte = (v: number) =>
  v < 0 ? 0 : v > 255 ? 255 : Math.round(v);

export function buildLuts(adj: Adjustments, curve: Curve): AdjustmentLuts {
  const exposureGain = Math.pow(2, adj.exposure);
  const brightnessOffset = adj.brightness * 96;
  const contrastGain = 1 + adj.contrast * 0.9;

  const tone = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = i * exposureGain + brightnessOffset;
    v = (v - 128) * contrastGain + 128;
    tone[i] = clampByte(Math.round(v));
  }

  const curveLut = curveToLut(curve);
  const identityCurve = curveLut.every((v, i) => v === i);

  return {
    tone,
    curve: curveLut,
    saturation: 1 + adj.saturation,
    identity:
      identityCurve &&
      exposureGain === 1 &&
      brightnessOffset === 0 &&
      contrastGain === 1 &&
      adj.saturation === 0,
  };
}

/** Apply adjustments to an RGBA buffer in place. */
export function applyAdjustments(
  data: Uint8ClampedArray,
  luts: AdjustmentLuts,
): void {
  if (luts.identity) return;

  const { tone, curve, saturation: sat } = luts;
  for (let i = 0; i < data.length; i += 4) {
    let r = tone[data[i]];
    let g = tone[data[i + 1]];
    let b = tone[data[i + 2]];

    if (sat !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * sat;
      g = luma + (g - luma) * sat;
      b = luma + (b - luma) * sat;
    }

    // Channels can be fractional after the saturation mix; round before using
    // them as LUT indices or the lookup returns undefined and zeroes the pixel.
    data[i] = curve[clampByte(r)];
    data[i + 1] = curve[clampByte(g)];
    data[i + 2] = curve[clampByte(b)];
  }
}

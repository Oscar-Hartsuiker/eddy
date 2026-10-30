import { applyAdjustments, buildLuts } from "../src/image/adjustments";
import { DEFAULT_ADJUSTMENTS, DEFAULT_CURVE } from "../src/types";

function expect(ok: boolean, message: string, detail?: unknown) {
  if (!ok) throw new Error(`${message}${detail ? ` → ${JSON.stringify(detail)}` : ""}`);
}

const RGBA = (...pixels: number[][]) => new Uint8ClampedArray(pixels.flat());

// No adjustments must be a strict no-op.
{
  const data = RGBA([128, 150, 96, 255], [10, 20, 30, 255]);
  const before = Array.from(data);
  applyAdjustments(data, buildLuts(DEFAULT_ADJUSTMENTS, DEFAULT_CURVE));
  expect(
    before.every((v, i) => v === data[i]),
    "identity adjustments must not touch the buffer",
    Array.from(data),
  );
}

// Regression: saturation + contrast produce fractional channels, which used to
// be fed straight into the curve LUT as float indices. The lookup returned
// undefined and blanked pixels to black (occasionally red).
{
  const luts = buildLuts(
    { exposure: 0, brightness: 0.1, contrast: 0.3, saturation: 0.7 },
    [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.55 },
      { x: 1, y: 1 },
    ],
  );
  const data = RGBA([128, 150, 96, 255], [200, 210, 220, 255], [60, 70, 80, 255]);
  applyAdjustments(data, luts);

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    expect(
      Math.max(r, g, b) > 0,
      "midtone must not collapse to black",
      Array.from(data),
    );
    expect(data[i + 3] === 255, "alpha is preserved", Array.from(data));
  }

  // A saturated grey must stay grey-ish rather than lose a channel.
  const grey = RGBA([140, 140, 140, 255]);
  applyAdjustments(grey, luts);
  expect(grey[0] > 0 && grey[1] > 0 && grey[2] > 0, "grey keeps every channel", Array.from(grey));
}

// The tone LUT must clamp instead of overflowing the buffer.
{
  const luts = buildLuts(
    { exposure: 2, brightness: 1, contrast: 1, saturation: 0 },
    DEFAULT_CURVE,
  );
  const data = RGBA([255, 255, 255, 128]);
  applyAdjustments(data, luts);
  expect(data[0] === 255, "blown highlights clamp to 255", Array.from(data));
  expect(data[3] === 128, "alpha untouched", Array.from(data));
}

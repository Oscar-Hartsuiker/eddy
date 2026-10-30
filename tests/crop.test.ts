import { cropRectFromDrag, moveCropRect } from "../src/image/crop";
import { cropRatioValue, fitCropToRatio, CROP_RATIOS } from "../src/types";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

function expect(ok: boolean, message: string, detail?: unknown) {
  if (!ok) throw new Error(`${message}${detail ? ` → ${JSON.stringify(detail)}` : ""}`);
}

const space = { w: 1000, h: 500 };
const onImage = (r: { x: number; y: number; w: number; h: number }, s = space) =>
  r.x >= -1e-6 &&
  r.y >= -1e-6 &&
  r.x + r.w <= s.w + 1e-6 &&
  r.y + r.h <= s.h + 1e-6;

// A selection must start exactly where the pointer went down (this regressed
// once: coords were mapped against the viewport instead of the image box).
{
  const r = cropRectFromDrag({ x: 0.25, y: 0.4 }, { x: 0.75, y: 0.9 }, space, null);
  expect(r.x === 250 && r.y === 200, "free drag must anchor at the click", r);
  expect(near(r.w, 500) && near(r.h, 250), "free drag must span the delta", r);
}

// Dragging backwards anchors on the far corner.
{
  const r = cropRectFromDrag({ x: 0.75, y: 0.9 }, { x: 0.25, y: 0.4 }, space, null);
  expect(near(r.x, 250) && near(r.y, 200), "reverse drag must land on the cursor", r);
}

// Ratio lock: 16:9 dragged mostly horizontally.
{
  const ratio = cropRatioValue("16:9", space)!;
  const r = cropRectFromDrag({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.5 }, space, ratio);
  expect(near(r.x, 100) && near(r.y, 50), "ratio drag must keep the anchor", r);
  expect(near(r.w / r.h, ratio), "16:9 must keep its ratio", r);
  expect(onImage(r), "16:9 must stay on the image", r);
}

// Ratio lock dragged backwards from a corner.
{
  const ratio = cropRatioValue("1:1", space)!;
  const r = cropRectFromDrag({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }, space, ratio);
  expect(near(r.w, r.h), "1:1 must stay square", r);
  expect(onImage(r), "reverse ratio drag must stay on the image", r);
}

// Portrait ratio on a landscape image never runs off the bottom.
{
  const ratio = cropRatioValue("2:3", space)!;
  const r = cropRectFromDrag({ x: 0.5, y: 0.5 }, { x: 1, y: 1 }, space, ratio);
  expect(near(r.w / r.h, ratio), "2:3 must keep its ratio", r);
  expect(onImage(r), "2:3 must fit the image", r);
}

// Reset gives the largest centered box of the chosen ratio.
{
  const ratio = cropRatioValue("1:1", space)!;
  const r = fitCropToRatio({ x: 0, y: 0, w: 1000, h: 500 }, space, ratio, true);
  expect(near(r.w, r.h), "centered reset must be square", r);
  expect(near(r.x, 250) && near(r.y, 0), "centered reset must be centered", r);
}

// Moving a selection translates it without resizing and never leaves it off
// the image.
{
  const r = moveCropRect({ x: 100, y: 100, w: 400, h: 300 }, { dx: 50, dy: -40 }, space);
  expect(near(r.x, 150) && near(r.y, 60), "move translates the selection", r);
  expect(r.w === 400 && r.h === 300, "move keeps the size (and ratio)", r);

  const upLeft = moveCropRect({ x: 100, y: 100, w: 400, h: 300 }, { dx: -500, dy: -900 }, space);
  expect(upLeft.x === 0 && upLeft.y === 0, "move clamps at the top-left", upLeft);
  expect(upLeft.w === 400 && upLeft.h === 300, "clamping does not resize", upLeft);

  const downRight = moveCropRect(
    { x: 100, y: 100, w: 400, h: 300 },
    { dx: 9999, dy: 9999 },
    space,
  );
  expect(
    near(downRight.x + downRight.w, space.w) && near(downRight.y + downRight.h, space.h),
    "move clamps at the bottom-right",
    downRight,
  );
  expect(downRight.w === 400 && downRight.h === 300, "clamping keeps the size", downRight);
}

// Corner resize: the opposite corner stays pinned while the dragged corner
// follows the cursor — with and without a ratio lock (same math as drawing).
{
  const anchor = { x: 0.6, y: 0.8 };
  const free = cropRectFromDrag(anchor, { x: 0.3, y: 0.4 }, space, null);
  expect(near(free.x + free.w, 600) && near(free.y + free.h, 400), "free resize pins the anchor", free);
  expect(near(free.x, 300) && near(free.y, 200), "free resize follows the cursor", free);

  const ratio = cropRatioValue("16:9", space)!;
  const locked = cropRectFromDrag(anchor, { x: 0.2, y: 0.5 }, space, ratio);
  expect(
    near(locked.x + locked.w, 600) && near(locked.y + locked.h, 400),
    "ratio resize pins the anchor",
    locked,
  );
  expect(near(locked.w / locked.h, ratio), "ratio resize keeps the ratio", locked);
  expect(onImage(locked), "ratio resize stays on the image", locked);
}

// A ratio-locked corner drag that runs out of room shrinks to fit without
// changing shape.
{
  const ratio = cropRatioValue("1:1", space)!;
  const r = cropRectFromDrag({ x: 0, y: 0.5 }, { x: 1, y: 0.9 }, space, ratio);
  expect(near(r.w, r.h), "clamped resize stays square", r);
  expect(onImage(r), "clamped resize fits the image", r);
}

// Re-fitting an existing crop shrinks to the ratio without growing it.
{
  const ratio = cropRatioValue("4:3", space)!;
  const r = fitCropToRatio({ x: 100, y: 100, w: 600, h: 120 }, space, ratio, true);
  expect(near(r.w / r.h, ratio), "refit must keep the ratio", r);
  expect(r.w <= 600 + 1e-6 && r.h <= 120 + 1e-6, "refit must not grow the box", r);
  expect(onImage(r), "refit must fit the image", r);
}

// Presets resolve to sensible ratios.
{
  expect(near(cropRatioValue("original", { w: 400, h: 300 })!, 4 / 3), "original ratio");
  expect(near(cropRatioValue("16:9", space)!, 16 / 9), "16:9 ratio");
  expect(cropRatioValue("free", space) === null, "free ratio is null");
  for (const id of ["1:1", "16:9", "9:16", "4:3"] as const) {
    expect(CROP_RATIOS.some((p) => p.id === id), `preset ${id} is offered`);
  }
}

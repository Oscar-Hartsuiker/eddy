/**
 * Development-only sample image. Loaded with `?demo` while running `npm run
 * dev`, so the editor can be exercised in a plain browser. Vite replaces
 * `import.meta.env.DEV` with `false` in production, so this module is never
 * included in the shipped bundle.
 */
export async function createDemoImage() {
  const width = 1800;
  const height = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#243b6b");
  sky.addColorStop(0.45, "#c98a63");
  sky.addColorStop(0.62, "#f2c38a");
  sky.addColorStop(1, "#2c2419");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sun = ctx.createRadialGradient(width * 0.68, height * 0.52, 0, width * 0.68, height * 0.52, 320);
  sun.addColorStop(0, "rgba(255, 236, 190, 0.95)");
  sun.addColorStop(1, "rgba(255, 200, 120, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#171411";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.72);
  ctx.lineTo(width * 0.22, height * 0.5);
  ctx.lineTo(width * 0.42, height * 0.7);
  ctx.lineTo(width * 0.62, height * 0.46);
  ctx.lineTo(width, height * 0.74);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 244, 224, 0.9)";
  ctx.beginPath();
  ctx.arc(width * 0.68, height * 0.52, 46, 0, Math.PI * 2);
  ctx.fill();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not build demo image");

  return {
    path: null,
    name: "demo.png",
    mime: "image/png",
    ext: "png",
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

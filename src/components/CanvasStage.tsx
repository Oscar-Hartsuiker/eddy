import { useCallback, useEffect, useRef } from "react";
import type { CropRect } from "../types";
import { cropRectFromDrag, moveCropRect } from "../image/crop";

interface CanvasStageProps {
  preview: HTMLCanvasElement | null;
  /** Rendered output dimensions in image pixels. */
  width: number;
  height: number;
  zoom: number;
  pan: { x: number; y: number };
  cropMode: boolean;
  crop: CropRect | null;
  cropSpace: { w: number; h: number };
  /** Width / height in image pixels, or null for free-form. */
  cropRatio: number | null;
  loading: boolean;
  showOriginal: boolean;
  onViewportChange: (width: number, height: number) => void;
  onZoomAt: (zoom: number, pan: { x: number; y: number }) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onCropChange: (crop: CropRect | null) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onResetCrop: () => void;
  onToggleFit: () => void;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 16;

/** Screen pixels of slack when hit-testing the selection for a move drag. */
const MOVE_HIT_SLOP = 6;

/** Screen pixels of slack when hit-testing a corner resize handle. */
const CORNER_HIT_SLOP = 10;

type CropDrag =
  | { mode: "new"; start: { x: number; y: number } }
  | { mode: "move"; start: { x: number; y: number }; rect: CropRect }
  | { mode: "resize"; anchor: { x: number; y: number } };

export function CanvasStage({
  preview,
  width,
  height,
  zoom,
  pan,
  cropMode,
  crop,
  cropSpace,
  cropRatio,
  loading,
  showOriginal,
  onViewportChange,
  onZoomAt,
  onPanChange,
  onCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
  onToggleFit,
}: CanvasStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const cropDrag = useRef<CropDrag | null>(null);

  // The crop overlay lives on the image element, not the viewport: the image
  // is centered and panned, so pointer coords must be mapped against the
  // image's own box or the selection starts in the wrong place.
  const wrapRef = useRef<HTMLDivElement>(null);

  const toImagePoint = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top) / r.height,
    };
  }, []);

  // Track viewport size so the app can compute a "fit" zoom.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        onViewportChange(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onViewportChange]);

  // Keep the latest zoom state in a ref so the native wheel listener can be
  // registered once, non-passively (React's wheel handlers are passive).
  const wheelState = useRef({ zoom, pan, onZoomAt });
  wheelState.current = { zoom, pan, onZoomAt };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const listener = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const { zoom: z, pan: p, onZoomAt: zoomAt } = wheelState.current;

      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      if (Math.abs(nextZoom - z) < 1e-6) return;

      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const imgX = (cx - p.x) / z;
      const imgY = (cy - p.y) / z;

      zoomAt(nextZoom, {
        x: cx - imgX * nextZoom,
        y: cy - imgY * nextZoom,
      });
    };

    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      if (cropMode) {
        const p = toImagePoint(e.clientX, e.clientY);
        // Only start a selection from inside the image itself.
        if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;

        // Pressing inside an existing selection drags it instead of
        // redrawing; slop is a few on-screen pixels.
        const slopX = MOVE_HIT_SLOP / Math.max(1, width * zoom);
        const slopY = MOVE_HIT_SLOP / Math.max(1, height * zoom);
        if (crop && crop.w > 1 && crop.h > 1) {
          const nx = crop.x / cropSpace.w;
          const ny = crop.y / cropSpace.h;
          const nw = crop.w / cropSpace.w;
          const nh = crop.h / cropSpace.h;

          // Corner handles resize; the opposite corner stays pinned.
          const cornerX = CORNER_HIT_SLOP / Math.max(1, width * zoom);
          const cornerY = CORNER_HIT_SLOP / Math.max(1, height * zoom);
          const corners: { cx: number; cy: number; anchor: { x: number; y: number } }[] = [
            { cx: nx, cy: ny, anchor: { x: nx + nw, y: ny + nh } },
            { cx: nx + nw, cy: ny, anchor: { x: nx, y: ny + nh } },
            { cx: nx, cy: ny + nh, anchor: { x: nx + nw, y: ny } },
            { cx: nx + nw, cy: ny + nh, anchor: { x: nx, y: ny } },
          ];
          const corner = corners.find(
            (c) => Math.abs(p.x - c.cx) <= cornerX && Math.abs(p.y - c.cy) <= cornerY,
          );
          if (corner) {
            cropDrag.current = { mode: "resize", anchor: corner.anchor };
            return;
          }

          if (
            p.x >= nx - slopX &&
            p.x <= nx + nw + slopX &&
            p.y >= ny - slopY &&
            p.y <= ny + nh + slopY
          ) {
            cropDrag.current = { mode: "move", start: p, rect: crop };
            return;
          }
        }

        cropDrag.current = { mode: "new", start: p };
        onCropChange({
          x: p.x * cropSpace.w,
          y: p.y * cropSpace.h,
          w: 0,
          h: 0,
        });
        return;
      }

      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [
      crop,
      cropMode,
      cropSpace.h,
      cropSpace.w,
      height,
      onCropChange,
      pan.x,
      pan.y,
      toImagePoint,
      width,
      zoom,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (cropMode) {
        const drag = cropDrag.current;
        if (!drag) return;
        const raw = toImagePoint(e.clientX, e.clientY);
        if (!raw) return;
        const cur = {
          x: Math.min(1, Math.max(0, raw.x)),
          y: Math.min(1, Math.max(0, raw.y)),
        };

        if (drag.mode === "new") {
          onCropChange(cropRectFromDrag(drag.start, cur, cropSpace, cropRatio));
          return;
        }

        if (drag.mode === "resize") {
          // The anchor is the opposite corner, so it stays pinned while the
          // dragged corner resizes — same math as drawing a fresh box.
          onCropChange(cropRectFromDrag(drag.anchor, cur, cropSpace, cropRatio));
          return;
        }

        // Moving keeps the size (and therefore the ratio) and clamps to the
        // image so the selection can never end up half outside.
        onCropChange(
          moveCropRect(
            drag.rect,
            {
              dx: (cur.x - drag.start.x) * cropSpace.w,
              dy: (cur.y - drag.start.y) * cropSpace.h,
            },
            cropSpace,
          ),
        );
        return;
      }

      const start = panStart.current;
      if (!start) return;
      onPanChange({
        x: start.panX + (e.clientX - start.x),
        y: start.panY + (e.clientY - start.y),
      });
    },
    [cropMode, cropRatio, cropSpace, onCropChange, onPanChange, toImagePoint],
  );

  const handlePointerUp = useCallback(() => {
    cropDrag.current = null;
    panStart.current = null;
  }, []);

  const displayW = width * zoom;
  const displayH = height * zoom;
  const hasCrop = !!crop && crop.w > 1 && crop.h > 1;
  // Corner handles are a constant size on screen regardless of zoom.
  const handleSize = 9 * (cropSpace.w / Math.max(1, displayW));

  return (
    <div
      ref={viewportRef}
      className={`stage${cropMode ? " is-cropping" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={cropMode ? undefined : onToggleFit}
    >
      {loading && <div className="stage-loading">Loading image…</div>}

      {showOriginal && <div className="stage-badge">Original</div>}

      <div
        ref={wrapRef}
        className="stage-canvas-wrap"
        style={{
          width: `${displayW}px`,
          height: `${displayH}px`,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
        }}
      >
        <div className="checkerboard">
          {preview && (
            <canvas
              ref={(node) => {
                if (!node || !preview) return;
                if (node.width !== preview.width || node.height !== preview.height) {
                  node.width = preview.width;
                  node.height = preview.height;
                }
                const ctx = node.getContext("2d");
                if (ctx) {
                  ctx.clearRect(0, 0, node.width, node.height);
                  ctx.drawImage(preview, 0, 0);
                }
              }}
              className="stage-canvas"
            />
          )}
        </div>

        {cropMode && (
          <svg
            className="crop-overlay"
            viewBox={`0 0 ${cropSpace.w} ${cropSpace.h}`}
            preserveAspectRatio="none"
          >
            <defs>
              <mask id="crop-mask">
                <rect x={0} y={0} width={cropSpace.w} height={cropSpace.h} fill="white" />
                {hasCrop && (
                  <rect
                    x={crop!.x}
                    y={crop!.y}
                    width={crop!.w}
                    height={crop!.h}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x={0}
              y={0}
              width={cropSpace.w}
              height={cropSpace.h}
              className="crop-shade"
              mask="url(#crop-mask)"
            />
            {hasCrop && (
              <g>
                <rect
                  x={crop!.x}
                  y={crop!.y}
                  width={crop!.w}
                  height={crop!.h}
                  className="crop-selection"
                  vectorEffect="non-scaling-stroke"
                />
                {[1 / 3, 2 / 3].map((t) => (
                  <g key={t} className="crop-grid" vectorEffect="non-scaling-stroke">
                    <line
                      x1={crop!.x + crop!.w * t}
                      y1={crop!.y}
                      x2={crop!.x + crop!.w * t}
                      y2={crop!.y + crop!.h}
                    />
                    <line
                      x1={crop!.x}
                      y1={crop!.y + crop!.h * t}
                      x2={crop!.x + crop!.w}
                      y2={crop!.y + crop!.h * t}
                    />
                  </g>
                ))}
                {[
                  { x: crop!.x, y: crop!.y },
                  { x: crop!.x + crop!.w, y: crop!.y },
                  { x: crop!.x, y: crop!.y + crop!.h },
                  { x: crop!.x + crop!.w, y: crop!.y + crop!.h },
                ].map((corner, i) => (
                  <rect
                    key={i}
                    className="crop-handle"
                    x={corner.x - handleSize / 2}
                    y={corner.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    rx={handleSize * 0.22}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>

      {cropMode && (
        <div className="crop-actions" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="button ghost"
            onClick={onResetCrop}
            disabled={!hasCrop}
          >
            Reset
          </button>
          <button type="button" className="button ghost" onClick={onCancelCrop}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={onApplyCrop}
            disabled={!hasCrop}
          >
            Apply crop
          </button>
        </div>
      )}

      {cropMode && (
        <div className="stage-hint" style={{ pointerEvents: "none" }}>
          Drag to select · drag a corner to resize · drag inside to move
        </div>
      )}
    </div>
  );
}

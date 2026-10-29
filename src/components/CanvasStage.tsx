import { useCallback, useEffect, useRef } from "react";
import type { CropRect } from "../types";

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

export function CanvasStage({
  preview,
  width,
  height,
  zoom,
  pan,
  cropMode,
  crop,
  cropSpace,
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
  const cropStart = useRef<{ x: number; y: number } | null>(null);

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
        const rect = target.getBoundingClientRect();
        const p = {
          x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
          y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        };
        cropStart.current = p;
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
    [cropMode, cropSpace.h, cropSpace.w, onCropChange, pan.x, pan.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (cropMode) {
        const start = cropStart.current;
        if (!start) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cur = {
          x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
          y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        };
        const nx = Math.min(start.x, cur.x);
        const ny = Math.min(start.y, cur.y);
        const nw = Math.abs(cur.x - start.x);
        const nh = Math.abs(cur.y - start.y);
        onCropChange({
          x: nx * cropSpace.w,
          y: ny * cropSpace.h,
          w: nw * cropSpace.w,
          h: nh * cropSpace.h,
        });
        return;
      }

      const start = panStart.current;
      if (!start) return;
      onPanChange({
        x: start.panX + (e.clientX - start.x),
        y: start.panY + (e.clientY - start.y),
      });
    },
    [cropMode, cropSpace.h, cropSpace.w, onCropChange, onPanChange],
  );

  const handlePointerUp = useCallback(() => {
    cropStart.current = null;
    panStart.current = null;
  }, []);

  const displayW = width * zoom;
  const displayH = height * zoom;
  const hasCrop = !!crop && crop.w > 1 && crop.h > 1;

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
          Drag on the image to choose an area
        </div>
      )}

      <div className="stage-zoom" style={{ pointerEvents: "none" }}>
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

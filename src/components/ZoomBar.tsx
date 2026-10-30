import { Maximize, Minus, Plus } from "lucide-react";

interface ZoomBarProps {
  disabled: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

export function ZoomBar({ disabled, zoom, onZoomIn, onZoomOut, onZoomFit }: ZoomBarProps) {
  return (
    <footer className="zoombar">
      <div className="zoombar-group">
        <button
          type="button"
          className="button ghost icon-only"
          onClick={onZoomOut}
          disabled={disabled}
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={onZoomFit}
          disabled={disabled}
          title="Zoom to fit (0)"
        >
          <Maximize size={14} />
          <span>Fit</span>
        </button>
        <button
          type="button"
          className="button ghost icon-only"
          onClick={onZoomIn}
          disabled={disabled}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <Plus size={15} />
        </button>

        <span className={disabled ? "zoombar-value is-muted" : "zoombar-value"}>
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <span className="zoombar-hint">Wheel to zoom · drag to pan</span>
    </footer>
  );
}

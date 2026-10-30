import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Undo2,
} from "lucide-react";
import type { Adjustments, CropRatioId, Curve } from "../types";
import { CROP_RATIOS, DEFAULT_ADJUSTMENTS, DEFAULT_CURVE } from "../types";
import { Slider } from "./Slider";
import { CurveEditor } from "./CurveEditor";

interface SidebarProps {
  disabled: boolean;
  adjustments: Adjustments;
  curve: Curve;
  cropMode: boolean;
  hasCrop: boolean;
  cropRatioId: CropRatioId;
  onAdjust: (key: keyof Adjustments, value: number) => void;
  onCurveChange: (curve: Curve) => void;
  onResetAdjustments: () => void;
  onResetCurve: () => void;
  onEnterCrop: () => void;
  onCropRatioChange: (id: CropRatioId) => void;
  onRotate: (direction: "cw" | "ccw") => void;
  onFlip: (axis: "h" | "v") => void;
}

const pct = (v: number) => `${Math.round(v * 100)}`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

export function Sidebar({
  disabled,
  adjustments,
  curve,
  cropMode,
  hasCrop,
  cropRatioId,
  onAdjust,
  onCurveChange,
  onResetAdjustments,
  onResetCurve,
  onEnterCrop,
  onCropRatioChange,
  onRotate,
  onFlip,
}: SidebarProps) {
  const adjustmentsModified = (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]).some(
    (key) => Math.abs(adjustments[key] - DEFAULT_ADJUSTMENTS[key]) > 1e-6,
  );
  const curveModified =
    curve.length !== DEFAULT_CURVE.length ||
    curve.some((p, i) => Math.abs(p.x - DEFAULT_CURVE[i].x) > 1e-6 || Math.abs(p.y - DEFAULT_CURVE[i].y) > 1e-6);

  return (
    <aside className={`sidebar${disabled ? " is-disabled" : ""}`}>
      <div className="sidebar-scroll">
        <section className="panel">
          <div className="panel-head">
            <h2>Adjust</h2>
            <button
              type="button"
              className="text-button"
              onClick={onResetAdjustments}
              disabled={disabled || !adjustmentsModified}
            >
              Reset
            </button>
          </div>
          <div className="sliders">
            <Slider
              label="Exposure"
              value={adjustments.exposure}
              min={-2}
              max={2}
              step={0.01}
              format={signed}
              onChange={(v) => onAdjust("exposure", v)}
            />
            <Slider
              label="Brightness"
              value={adjustments.brightness}
              min={-1}
              max={1}
              step={0.01}
              format={pct}
              onChange={(v) => onAdjust("brightness", v)}
            />
            <Slider
              label="Contrast"
              value={adjustments.contrast}
              min={-1}
              max={1}
              step={0.01}
              format={pct}
              onChange={(v) => onAdjust("contrast", v)}
            />
            <Slider
              label="Saturation"
              value={adjustments.saturation}
              min={-1}
              max={1}
              step={0.01}
              format={pct}
              onChange={(v) => onAdjust("saturation", v)}
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Curves</h2>
            <button
              type="button"
              className="text-button"
              onClick={onResetCurve}
              disabled={disabled || !curveModified}
            >
              Reset
            </button>
          </div>
          <CurveEditor curve={curve} onChange={onCurveChange} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Transform</h2>
            <button
              type="button"
              className="text-button"
              onClick={() => onRotate("ccw")}
              disabled={disabled}
              title="Rotate left (Shift+R)"
            >
              <Undo2 size={12} /> Left
            </button>
          </div>
          <div className="tool-grid">
            <button
              type="button"
              className={cropMode ? "tool is-active" : "tool"}
              onClick={onEnterCrop}
              disabled={disabled}
              title="Crop (C)"
            >
              <Crop size={17} />
              <span>{hasCrop ? "Re-crop" : "Crop"}</span>
            </button>
            <button
              type="button"
              className="tool"
              onClick={() => onRotate("cw")}
              disabled={disabled}
              title="Rotate right (R)"
            >
              <RotateCw size={17} />
              <span>Rotate</span>
            </button>
            <button
              type="button"
              className="tool"
              onClick={() => onFlip("h")}
              disabled={disabled}
              title="Flip horizontally (H)"
            >
              <FlipHorizontal2 size={17} />
              <span>Flip H</span>
            </button>
            <button
              type="button"
              className="tool"
              onClick={() => onFlip("v")}
              disabled={disabled}
              title="Flip vertically (V)"
            >
              <FlipVertical2 size={17} />
              <span>Flip V</span>
            </button>
          </div>

          {cropMode && (
            <div className="ratio-block">
              <div className="ratio-head">
                <span>Aspect ratio</span>
              </div>
              <div className="ratio-grid">
                {CROP_RATIOS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      cropRatioId === option.id ? "ratio-chip is-active" : "ratio-chip"
                    }
                    onClick={() => onCropRatioChange(option.id)}
                    disabled={disabled}
                    title={
                      option.id === "original"
                        ? "Match the image's orientation"
                        : option.id === "free"
                          ? "Any shape"
                          : `Crop to ${option.label}`
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="sidebar-footer">
        <span className="brand-mark">e</span>
        <span className="brand-name">eddy</span>
        <span className="version">0.1</span>
      </footer>
    </aside>
  );
}

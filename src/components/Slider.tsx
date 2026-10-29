import { useCallback, useId } from "react";
import type { CSSProperties } from "react";
import { RotateCcw } from "lucide-react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue?: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  defaultValue = 0,
  format,
  onChange,
}: SliderProps) {
  const id = useId();

  const reset = useCallback(() => onChange(defaultValue), [defaultValue, onChange]);
  const modified = Math.abs(value - defaultValue) > 1e-6;

  return (
    <div className="slider" onDoubleClick={reset} title="Double-click to reset">
      <div className="slider-head">
        <label htmlFor={id} className="slider-label">
          {label}
        </label>
        <div className="slider-value-group" onDoubleClick={(e) => e.stopPropagation()}>
          <span className={modified ? "slider-value is-modified" : "slider-value"}>
            {format(value)}
          </span>
          {modified && (
            <button
              type="button"
              className="icon-button tiny"
              onClick={reset}
              title={`Reset ${label.toLowerCase()}`}
              aria-label={`Reset ${label}`}
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={reset}
        style={
          {
            "--range-progress": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
    </div>
  );
}

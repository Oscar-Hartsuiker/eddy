import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Curve, CurvePoint } from "../types";
import { curveToLut, normalizeCurve } from "../image/curves";

interface CurveEditorProps {
  curve: Curve;
  onChange: (curve: Curve) => void;
}

const SIZE = 100;
const PAD = 7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function CurveEditor({ curve, onChange }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const points = useMemo(() => normalizeCurve(curve), [curve]);
  const lut = useMemo(() => curveToLut(curve), [curve]);

  const path = useMemo(() => {
    let d = "";
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * SIZE;
      const y = (1 - lut[i] / 255) * SIZE;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  }, [lut]);

  const toImageCoords = useCallback((clientX: number, clientY: number): CurvePoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01(1 - (clientY - rect.top) / rect.height),
    };
  }, []);

  const updatePoint = useCallback(
    (index: number, pos: CurvePoint, isEndpoint: boolean) => {
      const next = points.map((p, i) =>
        i === index ? { x: isEndpoint ? p.x : pos.x, y: pos.y } : p,
      );
      onChange(normalizeCurve(next));
    },
    [onChange, points],
  );

  const removePoint = useCallback(
    (index: number) => {
      if (index <= 0 || index >= points.length - 1) return;
      onChange(normalizeCurve(points.filter((_, i) => i !== index)));
      setDragIndex(null);
    },
    [onChange, points],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const target = e.target as SVGElement;
      const hit = target.closest("[data-point-index]");

      // Middle-click removes a control point.
      if (e.button === 1) {
        e.preventDefault();
        if (hit) {
          removePoint(Number(hit.getAttribute("data-point-index")));
        }
        return;
      }
      if (e.button !== 0) return;

      const pos = toImageCoords(e.clientX, e.clientY);
      e.currentTarget.setPointerCapture(e.pointerId);

      if (hit) {
        const rawIndex = Number(hit.getAttribute("data-point-index"));
        // Ignore clicks on the visual curve path / grid.
        if (Number.isNaN(rawIndex)) return;
        const isEndpoint = rawIndex === 0 || rawIndex === points.length - 1;
        setDragIndex(rawIndex);
        updatePoint(rawIndex, pos, isEndpoint);
        return;
      }

      // Click on empty space adds a point there.
      const next = normalizeCurve([...points, pos]);
      const index = next.findIndex(
        (p) => Math.abs(p.x - pos.x) < 1e-6 && Math.abs(p.y - pos.y) < 1e-6,
      );
      onChange(next);
      setDragIndex(index >= 0 ? index : null);
    },
    [onChange, points, removePoint, toImageCoords, updatePoint],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (dragIndex === null) return;
      const isEndpoint = dragIndex === 0 || dragIndex === points.length - 1;
      updatePoint(dragIndex, toImageCoords(e.clientX, e.clientY), isEndpoint);
    },
    [dragIndex, points.length, toImageCoords, updatePoint],
  );

  const handlePointerUp = useCallback(() => setDragIndex(null), []);

  return (
    <div className="curve-editor">
      <div className="curve-head">
        <span className="curve-channel">RGB</span>
        <span className="curve-hint">middle-click or double-click to remove</span>
      </div>
      <div className="curve-canvas">
        <svg
          ref={svgRef}
          viewBox={`${-PAD} ${-PAD} ${SIZE + PAD * 2} ${SIZE + PAD * 2}`}
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onAuxClick={(e) => e.preventDefault()}
        >
          <rect x={0} y={0} width={SIZE} height={SIZE} className="curve-bg" />
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t} className="curve-grid">
              <line x1={t * SIZE} y1={0} x2={t * SIZE} y2={SIZE} />
              <line x1={0} y1={t * SIZE} x2={SIZE} y2={t * SIZE} />
            </g>
          ))}
          <line x1={0} y1={SIZE} x2={SIZE} y2={0} className="curve-diagonal" />
          <path d={path} className="curve-line" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle
              key={i}
              data-point-index={i}
              cx={p.x * SIZE}
              cy={(1 - p.y) * SIZE}
              r={dragIndex === i ? 3.4 : 2.6}
              className={dragIndex === i ? "curve-point is-active" : "curve-point"}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removePoint(i);
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

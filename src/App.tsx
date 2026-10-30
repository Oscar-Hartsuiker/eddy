import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { CanvasStage } from "./components/CanvasStage";
import { EmptyState } from "./components/EmptyState";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CURVE,
  DEFAULT_TRANSFORM,
  FORMAT_LABELS,
  extensionFor,
  formatFromExtension,
  formatFromMime,
  outputSize,
  transformedSize,
  cropRatioValue,
  fitCropToRatio,
} from "./types";
import type {
  Adjustments,
  CropRatioId,
  CropRect,
  Curve,
  ImageDoc,
  SaveFormat,
  Transform,
} from "./types";
import { renderImage, canvasToPngBytes } from "./image/renderer";
import {
  getInitialFile,
  isTauri,
  openInNewWindow,
  pickImagePath,
  pickSavePath,
  readImage,
  writeImage,
} from "./lib/tauri";
import { base64ToBytes, basename } from "./lib/paths";

const EMPTY_SNAPSHOT = JSON.stringify({
  adjustments: DEFAULT_ADJUSTMENTS,
  curve: DEFAULT_CURVE,
  transform: DEFAULT_TRANSFORM,
  crop: null,
});

interface EditorSnapshot {
  adjustments: Adjustments;
  curve: Curve;
  transform: Transform;
  crop: CropRect | null;
}

const EMPTY_EDITOR: EditorSnapshot = {
  adjustments: DEFAULT_ADJUSTMENTS,
  curve: DEFAULT_CURVE,
  transform: DEFAULT_TRANSFORM,
  crop: null,
};

const HISTORY_LIMIT = 100;
const HISTORY_DEBOUNCE = 350;

const MIME_FOR_FORMAT: Record<SaveFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const JPEG_QUALITY = 0.92;
const WEBP_QUALITY = 0.9;

export default function App() {
  const [doc, setDoc] = useState<ImageDoc | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [curve, setCurve] = useState<Curve>(DEFAULT_CURVE);
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [crop, setCrop] = useState<CropRect | null>(null);

  const [cropMode, setCropMode] = useState(false);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);
  const [cropRatioId, setCropRatioId] = useState<CropRatioId>("free");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(EMPTY_SNAPSHOT);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef<number | null>(null);

  // Undo/redo history over the editable state (not the document itself).
  const [history, setHistory] = useState<{ entries: EditorSnapshot[]; index: number }>({
    entries: [EMPTY_EDITOR],
    index: 0,
  });
  const historyRef = useRef(history);
  const pendingRef = useRef<EditorSnapshot | null>(null);
  const commitTimer = useRef<number | null>(null);

  // Hold-to-compare original image.
  const [showOriginal, setShowOriginal] = useState(false);
  const originalRef = useRef(false);
  const savedView = useRef<{
    zoomMode: "fit" | "manual";
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  const snapshot = useMemo(
    () => JSON.stringify({ adjustments, curve, transform, crop }),
    [adjustments, curve, transform, crop],
  );
  const dirty = doc !== null && snapshot !== savedSnapshot;
  const tauri = isTauri();

  const flashStatus = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 3200);
  }, []);

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  const commitHistory = useCallback((next: EditorSnapshot) => {
    const { entries, index } = historyRef.current;
    if (JSON.stringify(entries[index]) === JSON.stringify(next)) return;

    const truncated = entries.slice(0, index + 1);
    truncated.push(next);
    const capped =
      truncated.length > HISTORY_LIMIT
        ? truncated.slice(truncated.length - HISTORY_LIMIT)
        : truncated;

    const value = { entries: capped, index: capped.length - 1 };
    historyRef.current = value;
    setHistory(value);
  }, []);

  const flushPending = useCallback(() => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) commitHistory(pending);
  }, [commitHistory]);

  const scheduleCommit = useCallback(
    (next: EditorSnapshot, immediate = false) => {
      pendingRef.current = next;

      if (immediate) {
        flushPending();
        return;
      }
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(() => {
        commitTimer.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) commitHistory(pending);
      }, HISTORY_DEBOUNCE);
    },
    [commitHistory, flushPending],
  );

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    setAdjustments(snap.adjustments);
    setCurve(snap.curve);
    setTransform(snap.transform);
    setCrop(snap.crop);
    setCropMode(false);
    setCropDraft(null);
  }, []);

  const undo = useCallback(() => {
    flushPending();
    const { entries, index } = historyRef.current;
    if (index <= 0) return;
    const value = { entries, index: index - 1 };
    historyRef.current = value;
    setHistory(value);
    applySnapshot(entries[index - 1]);
    setZoomMode("fit");
  }, [applySnapshot, flushPending]);

  const redo = useCallback(() => {
    flushPending();
    const { entries, index } = historyRef.current;
    if (index >= entries.length - 1) return;
    const value = { entries, index: index + 1 };
    historyRef.current = value;
    setHistory(value);
    applySnapshot(entries[index + 1]);
    setZoomMode("fit");
  }, [applySnapshot, flushPending]);

  // Hold-to-compare: temporarily render the untouched source image.
  const setOriginal = useCallback(
    (on: boolean) => {
      if (originalRef.current === on) return;
      if (on && cropMode) return;
      originalRef.current = on;

      if (on) {
        savedView.current = { zoomMode, zoom, pan };
        setShowOriginal(true);
        setZoomMode("fit");
      } else {
        setShowOriginal(false);
        const saved = savedView.current;
        if (saved) {
          setZoomMode(saved.zoomMode);
          setZoom(saved.zoom);
          setPan(saved.pan);
        }
      }
    },
    [cropMode, pan, zoom, zoomMode],
  );

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  const adoptImage = useCallback(
    (payload: {
      path: string | null;
      name: string;
      mime: string;
      ext: string;
      bytes: Uint8Array;
    }) => {
      const blob = new Blob([payload.bytes as BlobPart], { type: payload.mime });
      return createImageBitmap(blob).then((bitmap) => {
        setDoc((previous) => {
          previous?.bitmap.close();
          return {
            path: payload.path,
            name: payload.name,
            mime: payload.mime,
            ext: payload.ext,
            width: bitmap.width,
            height: bitmap.height,
            bitmap,
          };
        });
        setAdjustments(DEFAULT_ADJUSTMENTS);
        setCurve(DEFAULT_CURVE);
        setTransform(DEFAULT_TRANSFORM);
        setCrop(null);
        setCropMode(false);
        setCropDraft(null);
        setZoomMode("fit");
        setPan({ x: 0, y: 0 });
        setSavedSnapshot(EMPTY_SNAPSHOT);

        // New document, new history.
        if (commitTimer.current !== null) {
          window.clearTimeout(commitTimer.current);
          commitTimer.current = null;
        }
        pendingRef.current = null;
        const fresh = { entries: [EMPTY_EDITOR], index: 0 };
        historyRef.current = fresh;
        setHistory(fresh);
        originalRef.current = false;
        setShowOriginal(false);
      });
    },
    [],
  );

  const loadPath = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const payload = await readImage(path);
        await adoptImage({
          path: payload.path,
          name: payload.name,
          mime: payload.mime,
          ext: payload.ext,
          bytes: base64ToBytes(payload.base64),
        });
        if (tauri) {
          getCurrentWindow().setTitle(`${payload.name} — eddy`).catch(() => {});
        }
      } catch (error) {
        flashStatus(`Could not open image: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [adoptImage, flashStatus, tauri],
  );

  const loadBrowserFile = useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const ext = file.name.split(".").pop() ?? "png";
        await adoptImage({
          path: null,
          name: file.name,
          mime: file.type || "image/png",
          ext,
          bytes: new Uint8Array(buffer),
        });
      } catch (error) {
        flashStatus(`Could not open image: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [adoptImage, flashStatus],
  );

  const openImage = useCallback(async () => {
    if (!tauri) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) void loadBrowserFile(file);
      };
      input.click();
      return;
    }

    try {
      const path = await pickImagePath();
      if (!path) return;
      if (doc) {
        await openInNewWindow(path);
        flashStatus("Opened in a new window");
      } else {
        await loadPath(path);
      }
    } catch (error) {
      flashStatus(`Could not open image: ${String(error)}`);
    }
  }, [doc, flashStatus, loadBrowserFile, loadPath, tauri]);

  const acceptDroppedPath = useCallback(
    async (path: string) => {
      if (doc && tauri) {
        await openInNewWindow(path);
        flashStatus("Opened in a new window");
      } else {
        await loadPath(path);
      }
    },
    [doc, flashStatus, loadPath, tauri],
  );

  // Initial file from the command line (or a secondary window's queue).
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const init = async () => {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")) {
        const { createDemoImage } = await import("./dev/demo");
        const payload = await createDemoImage();
        await adoptImage(payload);
        return;
      }

      // Secondary windows receive their file through the backend queue; only
      // the primary window falls back to the command-line argument.
      const initial = await getInitialFile();
      if (initial) await loadPath(initial);
    };
    void init();
  }, [adoptImage, loadPath]);

  // Native drag & drop.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const path = event.payload.paths[0];
          if (path) void acceptDroppedPath(path);
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [acceptDroppedPath]);

  // ---------------------------------------------------------------------------
  // Preview rendering
  // ---------------------------------------------------------------------------

  // Render the preview at roughly the size it occupies on screen. The previous
  // fixed 2400px cap did ~4x more pixel work than needed at fit zoom, which is
  // what made slider drags feel sluggish on large images.
  const previewMax = useMemo(() => {
    if (!doc) return 1200;
    const dims = showOriginal
      ? { w: doc.width, h: doc.height }
      : cropMode
        ? transformedSize(doc, transform)
        : outputSize(doc, transform, crop);
    const onScreen = Math.max(dims.w, dims.h) * zoom;
    const dpr = window.devicePixelRatio || 1;
    const raw = Math.min(2400, Math.max(1200, onScreen * dpr * 1.25));
    return Math.round(raw / 256) * 256;
  }, [doc, transform, crop, cropMode, showOriginal, zoom]);

  useEffect(() => {
    if (!doc) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const canvas = renderImage({
          doc,
          transform: showOriginal ? DEFAULT_TRANSFORM : transform,
          crop: showOriginal || cropMode ? null : crop,
          adjustments: showOriginal ? DEFAULT_ADJUSTMENTS : adjustments,
          curve: showOriginal ? DEFAULT_CURVE : curve,
          maxDimension: previewMax,
        });
        setPreview(canvas);
      } catch {
        // Rendering can transiently fail while a new bitmap is swapping in.
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    doc,
    transform,
    crop,
    cropMode,
    adjustments,
    curve,
    previewMax,
    showOriginal,
  ]);

  // ---------------------------------------------------------------------------
  // Geometry / zoom
  // ---------------------------------------------------------------------------

  const cropSpace = useMemo(() => transformedSize(doc, transform), [doc, transform]);
  const cropRatio = useMemo(() => cropRatioValue(cropRatioId, cropSpace), [
    cropRatioId,
    cropSpace,
  ]);
  const output = useMemo(() => outputSize(doc, transform, crop), [doc, transform, crop]);
  const displaySize = showOriginal
    ? { w: doc?.width ?? 0, h: doc?.height ?? 0 }
    : cropMode
      ? cropSpace
      : output;

  const fitScale = useMemo(() => {
    if (!doc || viewport.w === 0 || viewport.h === 0) return 1;
    const padding = 72;
    const w = Math.max(1, displaySize.w);
    const h = Math.max(1, displaySize.h);
    return Math.min((viewport.w - padding) / w, (viewport.h - padding) / h, 1);
  }, [doc, displaySize.w, displaySize.h, viewport.h, viewport.w]);

  useEffect(() => {
    if (!doc) return;
    if (zoomMode === "fit") {
      setZoom(fitScale > 0 ? fitScale : 1);
      setPan({ x: 0, y: 0 });
    }
  }, [doc, fitScale, zoomMode]);

  const zoomIn = useCallback(() => {
    setZoomMode("manual");
    setZoom((z) => Math.min(16, z * 1.25));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomMode("manual");
    setZoom((z) => Math.max(0.02, z / 1.25));
  }, []);
  const zoomFit = useCallback(() => {
    setZoomMode("fit");
  }, []);
  const toggleFit = useCallback(() => {
    if (zoomMode === "fit") {
      setZoomMode("manual");
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoomMode("fit");
    }
  }, [zoomMode]);

  const handleZoomAt = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    setZoomMode("manual");
    setZoom(nextZoom);
    setPan(nextPan);
  }, []);

  const handleViewportChange = useCallback((w: number, h: number) => {
    setViewport({ w, h });
  }, []);

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  const adjust = useCallback(
    (key: keyof Adjustments, value: number) => {
      const next = { ...adjustments, [key]: value };
      setAdjustments(next);
      scheduleCommit({ adjustments: next, curve, transform, crop });
    },
    [adjustments, curve, transform, crop, scheduleCommit],
  );

  const changeCurve = useCallback(
    (nextCurve: Curve) => {
      setCurve(nextCurve);
      scheduleCommit({ adjustments, curve: nextCurve, transform, crop });
    },
    [adjustments, transform, crop, scheduleCommit],
  );

  const resetAdjustments = useCallback(() => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    scheduleCommit(
      { adjustments: DEFAULT_ADJUSTMENTS, curve, transform, crop },
      true,
    );
  }, [curve, transform, crop, scheduleCommit]);

  const resetCurve = useCallback(() => {
    setCurve(DEFAULT_CURVE);
    scheduleCommit(
      { adjustments, curve: DEFAULT_CURVE, transform, crop },
      true,
    );
  }, [adjustments, transform, crop, scheduleCommit]);

  const rotate = useCallback(
    (direction: "cw" | "ccw") => {
      const nextTransform: Transform = {
        ...transform,
        rotation:
          ((transform.rotation + (direction === "cw" ? 90 : 270)) %
            360) as Transform["rotation"],
      };

      setTransform(nextTransform);
      setCrop(null);
      setCropDraft(null);
      setCropMode(false);
      setZoomMode("fit");
      scheduleCommit(
        { adjustments, curve, transform: nextTransform, crop: null },
        true,
      );
    },
    [adjustments, curve, transform, scheduleCommit],
  );

  const flip = useCallback(
    (axis: "h" | "v") => {
      const nextTransform: Transform = {
        ...transform,
        flipH: axis === "h" ? !transform.flipH : transform.flipH,
        flipV: axis === "v" ? !transform.flipV : transform.flipV,
      };

      setTransform(nextTransform);
      setCrop(null);
      setCropDraft(null);
      setCropMode(false);
      scheduleCommit(
        { adjustments, curve, transform: nextTransform, crop: null },
        true,
      );
    },
    [adjustments, curve, transform, scheduleCommit],
  );

  const enterCrop = useCallback(() => {
    if (originalRef.current) {
      originalRef.current = false;
      setShowOriginal(false);
    }
    setCropDraft(crop ? fitCropToRatio(crop, cropSpace, cropRatio) : crop);
    setCropMode(true);
    setZoomMode("fit");
    setPan({ x: 0, y: 0 });
  }, [crop, cropRatio, cropSpace]);

  const cancelCrop = useCallback(() => {
    setCropMode(false);
    setCropDraft(null);
    setZoomMode("fit");
  }, []);

  const changeCropRatio = useCallback(
    (id: CropRatioId) => {
      setCropRatioId(id);
      const ratio = cropRatioValue(id, cropSpace);
      setCropDraft((prev) =>
        prev && ratio ? fitCropToRatio(prev, cropSpace, ratio, true) : prev,
      );
    },
    [cropSpace],
  );

  const resetCropDraft = useCallback(() => {
    const full: CropRect = { x: 0, y: 0, w: cropSpace.w, h: cropSpace.h };
    setCropDraft(fitCropToRatio(full, cropSpace, cropRatio));
  }, [cropRatio, cropSpace.h, cropSpace.w]);

  const applyCrop = useCallback(() => {
    if (!cropDraft || !doc) return;
    const draft = fitCropToRatio(cropDraft, cropSpace, cropRatio);
    const x = Math.max(0, Math.round(draft.x));
    const y = Math.max(0, Math.round(draft.y));
    const w = Math.min(cropSpace.w - x, Math.round(draft.w));
    const h = Math.min(cropSpace.h - y, Math.round(draft.h));
    if (w < 2 || h < 2) return;

    const isFull = x === 0 && y === 0 && w === cropSpace.w && h === cropSpace.h;
    const nextCrop = isFull ? null : { x, y, w, h };

    setCrop(nextCrop);
    setCropMode(false);
    setCropDraft(null);
    setZoomMode("fit");
    scheduleCommit(
      { adjustments, curve, transform, crop: nextCrop },
      true,
    );
  }, [
    adjustments,
    cropDraft,
    cropRatio,
    cropSpace,
    curve,
    doc,
    scheduleCommit,
    transform,
  ]);

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  const finalizeSave = useCallback(
    (path: string | null, format: SaveFormat, name: string) => {
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              path,
              name,
              ext: extensionFor(format),
              mime: MIME_FOR_FORMAT[format],
            }
          : prev,
      );
      setSavedSnapshot(snapshot);
      flashStatus(`Saved ${name}`);
      if (path && tauri) {
        getCurrentWindow().setTitle(`${name} — eddy`).catch(() => {});
      }
    },
    [flashStatus, snapshot, tauri],
  );

  const save = useCallback(
    async (saveAs: boolean) => {
      if (!doc || saving) return;
      setSaving(true);
      try {
        const canvas = renderImage({ doc, transform, crop, adjustments, curve });
        const pngBytes = await canvasToPngBytes(canvas);

        if (!tauri) {
          // Browser fallback: download the encoded file.
          const format = formatFromExtension(doc.ext);
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, MIME_FOR_FORMAT[format]);
          });
          if (!blob) throw new Error("Encoding failed");
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = saveAs ? `${doc.name}` : doc.name;
          a.click();
          URL.revokeObjectURL(url);
          setSavedSnapshot(snapshot);
          flashStatus("Downloaded");
          return;
        }

        let targetPath: string;
        let format: SaveFormat;

        if (!saveAs && doc.path) {
          targetPath = doc.path;
          format = formatFromExtension(doc.ext);
        } else {
          const picked = await pickSavePath(doc.path ?? doc.name);
          if (!picked) return;
          const hasExtension = /\.[a-z0-9]+$/i.test(basename(picked));
          format = hasExtension ? formatFromExtension(picked) : formatFromExtension(doc.ext);
          targetPath = hasExtension ? picked : `${picked}.${extensionFor(format)}`;
        }

        const result = await writeImage(
          targetPath,
          pngBytes,
          format,
          format === "jpeg" ? JPEG_QUALITY : WEBP_QUALITY,
        );
        finalizeSave(result.path, format, basename(result.path));
      } catch (error) {
        flashStatus(`Could not save: ${String(error)}`);
      } finally {
        setSaving(false);
      }
    },
    [
      adjustments,
      crop,
      curve,
      doc,
      finalizeSave,
      flashStatus,
      saving,
      snapshot,
      tauri,
      transform,
    ],
  );

  // ---------------------------------------------------------------------------
  // Shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Range sliders keep focus after dragging, but don't consume letters,
      // so shortcuts like \ / R / C should still work from there.
      const isRangeInput =
        target instanceof HTMLInputElement && target.type === "range";
      const inField =
        (target?.tagName === "INPUT" && !isRangeInput) ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(e.shiftKey);
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openImage();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod) return;

      if (e.key === "Escape" && cropMode) {
        cancelCrop();
        return;
      }
      if (inField) return;

      if (e.key === "\\") {
        e.preventDefault();
        if (!e.repeat) setOriginal(true);
        return;
      }

      switch (e.key) {
        case "r":
        case "R":
          rotate(e.shiftKey ? "ccw" : "cw");
          break;
        case "h":
        case "H":
          flip("h");
          break;
        case "v":
        case "V":
          flip("v");
          break;
        case "c":
        case "C":
          if (doc) enterCrop();
          break;
        case "0":
          zoomFit();
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
        case "_":
          zoomOut();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "\\") setOriginal(false);
    };
    const onBlur = () => setOriginal(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    cancelCrop,
    cropMode,
    doc,
    enterCrop,
    flip,
    openImage,
    redo,
    rotate,
    save,
    setOriginal,
    undo,
    zoomFit,
    zoomIn,
    zoomOut,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const formatLabel = doc ? FORMAT_LABELS[formatFromMime(doc.mime)] : null;

  return (
    <div className="app">
      <TopBar
        fileName={doc?.name ?? null}
        dimensions={doc ? { w: output.w, h: output.h } : null}
        formatLabel={formatLabel}
        dirty={dirty}
        saving={saving}
        hasDoc={!!doc}
        status={status}
        canUndo={history.index > 0}
        canRedo={history.index < history.entries.length - 1}
        originalActive={showOriginal}
        onUndo={undo}
        onRedo={redo}
        onOriginalStart={() => setOriginal(true)}
        onOriginalEnd={() => setOriginal(false)}
        onOpen={() => void openImage()}
        onSave={() => void save(false)}
        onSaveAs={() => void save(true)}
      />

      <div className="workspace">
        {doc ? (
          <CanvasStage
            preview={preview}
            width={displaySize.w}
            height={displaySize.h}
            zoom={zoom}
            pan={pan}
            cropMode={cropMode}
            crop={cropMode ? cropDraft : crop}
            cropSpace={cropSpace}
            cropRatio={cropRatio}
            loading={loading}
            showOriginal={showOriginal}
            onViewportChange={handleViewportChange}
            onZoomAt={handleZoomAt}
            onPanChange={setPan}
            onCropChange={setCropDraft}
            onApplyCrop={applyCrop}
            onCancelCrop={cancelCrop}
            onResetCrop={resetCropDraft}
            onToggleFit={toggleFit}
          />
        ) : (
          <EmptyState
            onOpen={() => void openImage()}
            onDropFile={(file) => void loadBrowserFile(file)}
            isTauri={tauri}
          />
        )}

        <Sidebar
          disabled={!doc}
          adjustments={adjustments}
          curve={curve}
          cropMode={cropMode}
          hasCrop={crop !== null}
          cropRatioId={cropRatioId}
          zoom={zoom}
          onAdjust={adjust}
          onCurveChange={changeCurve}
          onResetAdjustments={resetAdjustments}
          onResetCurve={resetCurve}
          onEnterCrop={enterCrop}
          onCropRatioChange={changeCropRatio}
          onRotate={rotate}
          onFlip={flip}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomFit={zoomFit}
        />
      </div>
    </div>
  );
}

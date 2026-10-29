import { Eye, FolderOpen, Redo2, Save, SaveAll, Undo2 } from "lucide-react";

interface TopBarProps {
  fileName: string | null;
  dimensions: { w: number; h: number } | null;
  formatLabel: string | null;
  dirty: boolean;
  saving: boolean;
  hasDoc: boolean;
  status: string | null;
  canUndo: boolean;
  canRedo: boolean;
  originalActive: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOriginalStart: () => void;
  onOriginalEnd: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export function TopBar({
  fileName,
  dimensions,
  formatLabel,
  dirty,
  saving,
  hasDoc,
  status,
  canUndo,
  canRedo,
  originalActive,
  onUndo,
  onRedo,
  onOriginalStart,
  onOriginalEnd,
  onOpen,
  onSave,
  onSaveAs,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        {hasDoc && fileName ? (
          <>
            <span className="file-name">{fileName}</span>
            {dirty && <span className="dirty-dot" title="Unsaved changes" />}
            {dimensions && (
              <span className="file-meta">
                {dimensions.w} × {dimensions.h}
                {formatLabel ? ` · ${formatLabel}` : ""}
              </span>
            )}
          </>
        ) : (
          <span className="file-name muted">No image open</span>
        )}
      </div>

      {status && <div className="topbar-status">{status}</div>}

      <div className="topbar-actions">
        <button
          type="button"
          className="button ghost icon-only"
          onClick={onUndo}
          disabled={!hasDoc || !canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          className="button ghost icon-only"
          onClick={onRedo}
          disabled={!hasDoc || !canRedo}
          title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>

        <span className="topbar-divider" />

        <button
          type="button"
          className={originalActive ? "button ghost is-active" : "button ghost"}
          disabled={!hasDoc}
          title="Hold to view the original (hold \\)"
          aria-label="View original"
          aria-pressed={originalActive}
          onPointerDown={(e) => {
            e.preventDefault();
            onOriginalStart();
          }}
          onPointerUp={onOriginalEnd}
          onPointerLeave={onOriginalEnd}
          onPointerCancel={onOriginalEnd}
        >
          <Eye size={15} />
          <span className="original-label">Original</span>
        </button>

        <span className="topbar-divider" />

        <button type="button" className="button ghost" onClick={onOpen} title="Open image (Ctrl+O)">
          <FolderOpen size={15} />
          <span>Open</span>
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={onSaveAs}
          disabled={!hasDoc || saving}
          title="Save as (Ctrl+Shift+S)"
        >
          <SaveAll size={15} />
          <span>Save as</span>
        </button>
        <button
          type="button"
          className="button primary"
          onClick={onSave}
          disabled={!hasDoc || saving}
          title="Save (Ctrl+S)"
        >
          <Save size={15} />
          <span>{saving ? "Saving…" : "Save"}</span>
        </button>
      </div>
    </header>
  );
}

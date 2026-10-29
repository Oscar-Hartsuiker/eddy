interface EmptyStateProps {
  onOpen: () => void;
  onDropFile: (file: File) => void;
  isTauri: boolean;
}

export function EmptyState({ onOpen, onDropFile, isTauri }: EmptyStateProps) {
  return (
    <div
      className="empty"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
    >
      <div className="empty-glow" />
      <div className="empty-content">
        <div className="empty-logo">e</div>
        <h1>eddy</h1>
        <p className="empty-tagline">A quiet place to develop your photos.</p>

        <button type="button" className="button primary large" onClick={onOpen}>
          Open an image
        </button>

        <p className="empty-hint">
          {isTauri ? "…or drop a file anywhere in this window" : "…or drop a file here"}
        </p>

        <div className="empty-formats">
          <span>PNG</span>
          <span>JPEG</span>
          <span>WebP</span>
        </div>

        <p className="empty-shortcut">
          <kbd>Ctrl</kbd> <kbd>O</kbd> to open
        </p>
      </div>
    </div>
  );
}

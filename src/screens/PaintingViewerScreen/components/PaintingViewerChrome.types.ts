export type PaintingViewerChromeProps = {
  aspectRatios: readonly string[];
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onResizeSelect: (ratio: string) => void;
};
